import { Notice } from 'obsidian';
import {
    executeImGet,
    executeImSet,
    type ImProcessConfig,
    isValidImIdentifier,
} from './im-process';
import {
    isAnyViewComposing,
    onAllCompositionsEnd,
} from './composition-tracker';
import {
    isInsertInputMethodMode,
    type InputMethodArea,
    type InputMethodMode,
} from './types';

export interface ImSwitcherConfig {
    enabled: boolean;
    autoWire: boolean;
    defaultNormalIm: string;
    restoreBehavior: 'restore' | 'default';
    defaultInsertIm: string;
    /** Default used for a search box that has no saved identity yet. */
    findDefaultIm?: string;
    obtainConfig: ImProcessConfig;
    switchConfig: ImProcessConfig;
}

export interface InputMethodManagerResolvers {
    resolveViewArea?: (viewId: string) => InputMethodArea | null;
    resolveTargetArea?: (target: EventTarget | null) => InputMethodArea | null;
    resolveFocusedArea?: () => InputMethodArea | null;
}

type FocusListenerTarget = Window;

const DEFAULT_FIND_IM = '1033';

/**
 * Owns all input-method state and all process ordering.
 *
 * The public methods retain the old ImSwitcher surface because Lua and ex
 * commands already use it.  New focus-aware callers use the area methods,
 * which persist notes by file path and widgets by logical identity.
 */
export class InputMethodManager {
    public readonly config: ImSwitcherConfig;
    public lastKnownIm: string | null = null;

    private readonly savedImByArea = new Map<string, string>();
    private readonly modeByArea = new Map<string, InputMethodMode>();
    private readonly areaByView = new Map<string, InputMethodArea>();
    private resolvers: InputMethodManagerResolvers;
    private currentArea: InputMethodArea | null = null;
    private windowBlurredAreaKey: string | null = null;
    private windowFocused = true;
    private destroyed = false;
    private operationTail: Promise<void> = Promise.resolve();
    private focusGeneration = 0;
    private actionGeneration = 0;
    private compositionWaiter: {
        promise: Promise<void>;
        resolve: () => void;
        unsubscribe: () => void;
    } | null = null;
    private focusCleanup: (() => void) | null = null;

    constructor(
        config: ImSwitcherConfig,
        resolvers: InputMethodManagerResolvers = {},
    ) {
        this.config = config;
        this.resolvers = resolvers;
    }

    setResolvers(resolvers: InputMethodManagerResolvers): void {
        this.resolvers = { ...this.resolvers, ...resolvers };
    }

    primeCache(): void {
        void this.enqueue(() => this.queryCurrentIm());
    }

    async get(): Promise<string | null> {
        return await this.enqueue(() => this.queryCurrentIm());
    }

    async set(imId: string): Promise<void> {
        await this.enqueue(async () => {
            await this.switchTo(imId);
        });
    }

    /**
     * Installs the document and window focus observers used by the host.
     * The returned disposer is also used during plugin teardown and reload.
     */
    installFocusTracking(
        targetWindow: FocusListenerTarget = window,
        targetDocument: Document = targetWindow.document,
    ): () => void {
        this.focusCleanup?.();

        const onFocusIn = (event: FocusEvent): void => {
            const area =
                this.resolvers.resolveTargetArea?.(event.target) ??
                this.resolvers.resolveFocusedArea?.();
            if (area) this.onFocusIn(area);
        };
        const onFocusOut = (event: FocusEvent): void => {
            const area = this.resolvers.resolveTargetArea?.(event.target);
            if (area) this.onFocusOut(area);
        };
        const onWindowBlur = (): void => {
            this.onWindowBlur();
        };
        const onWindowFocus = (): void => {
            this.onWindowFocus();
        };

        targetDocument.addEventListener('focusin', onFocusIn, true);
        targetDocument.addEventListener('focusout', onFocusOut, true);
        targetWindow.addEventListener('blur', onWindowBlur);
        targetWindow.addEventListener('focus', onWindowFocus);

        const cleanup = (): void => {
            targetDocument.removeEventListener('focusin', onFocusIn, true);
            targetDocument.removeEventListener('focusout', onFocusOut, true);
            targetWindow.removeEventListener('blur', onWindowBlur);
            targetWindow.removeEventListener('focus', onWindowFocus);
            if (this.focusCleanup === cleanup) this.focusCleanup = null;
        };
        this.focusCleanup = cleanup;
        return cleanup;
    }

    onFocusIn(area: InputMethodArea): void {
        if (this.destroyed || !this.config.autoWire) return;

        const returnedToSameArea = this.windowBlurredAreaKey === area.key;
        this.windowBlurredAreaKey = null;
        this.windowFocused = true;
        this.rememberArea(area);

        const previous = this.currentArea;
        if (previous?.key === area.key) {
            this.currentArea = { ...previous, ...area };
            return;
        }

        this.currentArea = area;
        const focusGeneration = ++this.focusGeneration;
        const actionGeneration = ++this.actionGeneration;

        void this.enqueue(async () => {
            if (previous && previous.key !== area.key) {
                await this.saveArea(previous);
            }
            if (
                focusGeneration !== this.focusGeneration ||
                actionGeneration !== this.actionGeneration ||
                !this.windowFocused ||
                this.currentArea?.key !== area.key
            ) {
                return;
            }
            if (!returnedToSameArea) await this.restoreArea(area);
        });
    }

    onFocusOut(area: InputMethodArea): void {
        if (this.destroyed || !this.config.autoWire) return;
        if (this.currentArea?.key !== area.key) return;

        const leaving = { ...this.currentArea, ...area };
        this.currentArea = null;
        ++this.focusGeneration;
        ++this.actionGeneration;

        void this.enqueue(async () => {
            await this.saveArea(leaving);
        });
    }

    onWindowBlur(): void {
        if (this.destroyed || !this.config.autoWire) return;
        this.windowFocused = false;
        if (this.currentArea) {
            this.windowBlurredAreaKey = this.currentArea.key;
            this.onFocusOut(this.currentArea);
        }
    }

    onWindowFocus(): void {
        if (this.destroyed || !this.config.autoWire) return;
        this.windowFocused = true;
        const area = this.resolvers.resolveFocusedArea?.();
        if (area) this.onFocusIn(area);
    }

    onInsertLeave(viewId: string): void {
        this.onModeChange(viewId, 'normal');
    }

    onInsertEnter(viewId: string): void {
        this.onModeChange(viewId, 'insert');
    }

    /** Compatibility hook for command-line overlays leaving focus. */
    onCmdlineLeave(_viewId: string): void {
        if (this.destroyed || !this.config.autoWire) return;
        const actionGeneration = ++this.actionGeneration;
        this.ensureCompositionWaiterIfComposing();
        void this.enqueue(async () => {
            if (actionGeneration !== this.actionGeneration) return;
            await this.switchNormalIm();
        });
    }

    private onModeChange(viewId: string, mode: InputMethodMode): void {
        if (this.destroyed || !this.config.autoWire) return;

        const area = this.resolveViewArea(viewId);
        if (!area) return;
        this.rememberArea({ ...area, mode });
        this.modeByArea.set(area.key, mode);
        if (this.currentArea?.key === area.key) {
            this.currentArea = { ...this.currentArea, ...area, mode };
        }

        const isLegacyModeCallback = !this.resolvers.resolveViewArea;
        const isCurrent = this.currentArea?.key === area.key;
        if ((!isLegacyModeCallback && !isCurrent) || !this.windowFocused) {
            return;
        }

        const actionGeneration = ++this.actionGeneration;
        this.ensureCompositionWaiterIfComposing();

        if (isLegacyModeCallback) {
            if (isInsertInputMethodMode(mode)) {
                this.restore(viewId);
            } else {
                void this.save(viewId).then(() => {
                    if (actionGeneration !== this.actionGeneration) return;
                    void this.enqueue(() => this.switchNormalIm());
                });
            }
            return;
        }

        void this.enqueue(async () => {
            if (isInsertInputMethodMode(mode)) {
                if (
                    actionGeneration !== this.actionGeneration ||
                    (!isLegacyModeCallback &&
                        this.currentArea?.key !== area.key)
                ) {
                    return;
                }
                await this.restoreArea(area);
                return;
            }

            // Save before changing the process-wide input method. This is the
            // critical Insert → Normal ordering guarantee.
            await this.saveArea(
                area.kind === 'note' ? { ...area, mode: 'insert' } : area,
            );
            if (
                actionGeneration !== this.actionGeneration ||
                (!isLegacyModeCallback && this.currentArea?.key !== area.key)
            ) {
                return;
            }
            await this.switchNormalIm();
        });
    }

    async save(areaOrKey: InputMethodArea | string): Promise<void> {
        await this.enqueue(() => this.saveArea(this.normalizeArea(areaOrKey)));
    }

    restore(areaOrKey: InputMethodArea | string): void {
        void this.enqueue(() =>
            this.restoreArea(this.normalizeArea(areaOrKey)),
        );
    }

    onLeafChange(_leafId: string): void {
        // Leaf changes are not focus changes. The window/document listeners
        // and EditorView mode watcher own the state transitions.
    }

    cleanupView(viewId: string): void {
        const area = this.areaByView.get(viewId);
        this.areaByView.delete(viewId);
        if (area?.key === viewId || !area) {
            // Legacy state was keyed by the ephemeral watcher id. New note
            // state is keyed by file path and must survive view recreation.
            this.savedImByArea.delete(viewId);
            this.modeByArea.delete(viewId);
        }
        if (this.currentArea?.viewId === viewId) this.currentArea = null;
    }

    setAutoWire(value: boolean): void {
        this.config.autoWire = value;
    }

    loadPersistedState(state: Record<string, string>): void {
        for (const [key, imId] of Object.entries(state)) {
            if (imId && isValidImIdentifier(imId)) {
                this.savedImByArea.set(key, imId);
            }
        }
    }

    getPersistedState(): Record<string, string> {
        const state: Record<string, string> = {};
        for (const [key, imId] of this.savedImByArea) state[key] = imId;
        return state;
    }

    destroy(): void {
        this.destroyed = true;
        this.focusCleanup?.();
        this.focusCleanup = null;
        this.compositionWaiter?.unsubscribe();
        this.compositionWaiter?.resolve();
        this.compositionWaiter = null;
        this.currentArea = null;
        this.windowBlurredAreaKey = null;
        this.savedImByArea.clear();
        this.modeByArea.clear();
        this.areaByView.clear();
        ++this.focusGeneration;
        ++this.actionGeneration;
    }

    private resolveViewArea(viewId: string): InputMethodArea | null {
        const resolved = this.resolvers.resolveViewArea?.(viewId);
        if (resolved) {
            this.rememberArea(resolved);
            return resolved;
        }
        // The legacy public API uses the supplied id directly. This keeps
        // vim.obsidian.im and existing integrations working during migration.
        if (!this.resolvers.resolveViewArea) {
            return { key: viewId, kind: 'unknown', viewId };
        }
        return this.areaByView.get(viewId) ?? null;
    }

    private normalizeArea(
        areaOrKey: InputMethodArea | string,
    ): InputMethodArea {
        if (typeof areaOrKey !== 'string') {
            this.rememberArea(areaOrKey);
            return areaOrKey;
        }
        return {
            key: areaOrKey,
            kind: areaOrKey.startsWith('note:')
                ? 'note'
                : areaOrKey.startsWith('search:')
                  ? 'search'
                  : 'unknown',
        };
    }

    private rememberArea(area: InputMethodArea): void {
        if (area.viewId) this.areaByView.set(area.viewId, area);
        if (area.mode) this.modeByArea.set(area.key, area.mode);

        // Older releases persisted the watcher id. It is only a best-effort
        // migration because watcher ids are ephemeral, but when a view keeps
        // the same id during startup it lets that state move to the stable
        // note key instead of being silently stranded.
        if (
            area.kind === 'note' &&
            area.viewId &&
            !this.savedImByArea.has(area.key)
        ) {
            const legacyIm = this.savedImByArea.get(area.viewId);
            if (legacyIm) {
                this.savedImByArea.set(area.key, legacyIm);
                this.savedImByArea.delete(area.viewId);
            }
        }
    }

    private async saveArea(area: InputMethodArea): Promise<void> {
        const mode = area.mode ?? this.modeByArea.get(area.key);
        if (area.kind === 'note' && !isInsertInputMethodMode(mode)) return;

        const imId = await this.queryCurrentIm();
        if (imId) this.savedImByArea.set(area.key, imId);
        else if (this.lastKnownIm !== null) {
            this.savedImByArea.set(area.key, this.lastKnownIm);
        }
    }

    private async restoreArea(area: InputMethodArea): Promise<void> {
        const mode = area.mode ?? this.modeByArea.get(area.key) ?? 'unknown';
        const savedIm = this.savedImByArea.get(area.key);

        if (area.kind === 'note') {
            if (isInsertInputMethodMode(mode)) {
                if (this.config.restoreBehavior === 'default') {
                    await this.switchTo(this.config.defaultInsertIm, true);
                } else if (savedIm) {
                    await this.switchTo(savedIm, true);
                } else {
                    // First Insert focus establishes the note's state from
                    // the actual process value without forcing a switch.
                    const current = await this.queryCurrentIm();
                    if (current) this.savedImByArea.set(area.key, current);
                }
            } else {
                await this.switchNormalIm(true);
            }
            return;
        }

        if (savedIm) {
            await this.switchTo(savedIm, true);
            return;
        }

        if (area.kind === 'search') {
            const defaultIm = this.config.findDefaultIm || DEFAULT_FIND_IM;
            if (defaultIm) await this.switchTo(defaultIm, true);
            return;
        }

        // Legacy Lua/ex-command callers pass an opaque key rather than a
        // classified area. Preserve the old fixed-default behavior for that
        // compatibility path while new ordinary widgets inherit the actual
        // process state on first focus.
        if (
            area.kind === 'unknown' &&
            this.config.restoreBehavior === 'default' &&
            this.config.defaultInsertIm
        ) {
            await this.switchTo(this.config.defaultInsertIm, true);
            return;
        }

        // A first ordinary input inherits the actual process state. This is
        // deliberately a query only, so focusing a new widget is non-invasive.
        const current = await this.queryCurrentIm();
        if (current) this.savedImByArea.set(area.key, current);
    }

    private async switchNormalIm(force = false): Promise<void> {
        const normalIm = this.config.defaultNormalIm;
        if (!normalIm || (!force && this.lastKnownIm === normalIm)) return;
        await this.switchTo(normalIm, force);
    }

    private async queryCurrentIm(): Promise<string | null> {
        const imId = await executeImGet(this.config.obtainConfig);
        if (imId) this.lastKnownIm = imId;
        return imId;
    }

    private async switchTo(imId: string, force = false): Promise<boolean> {
        if (!imId || !isValidImIdentifier(imId)) {
            if (imId) new Notice('Invalid input method identifier.');
            return false;
        }
        if (!force && this.lastKnownIm === imId) return true;

        const switched = await executeImSet(this.config.switchConfig, imId);
        if (!switched) {
            console.warn('Failed to switch input method.');
            return false;
        }
        this.lastKnownIm = imId;
        return true;
    }

    private enqueue<T>(task: () => Promise<T> | T): Promise<T> {
        const run = this.operationTail.then(async () => {
            if (this.destroyed) return undefined as T;
            if (this.compositionWaiter) {
                await this.compositionWaiter.promise;
            } else if (isAnyViewComposing()) {
                await this.waitForCompositionEnd();
            }
            if (this.destroyed) return undefined as T;
            return await task();
        });
        this.operationTail = run.then(
            () => undefined,
            () => undefined,
        );
        return run;
    }

    private ensureCompositionWaiterIfComposing(): void {
        const composing = isAnyViewComposing();
        if (composing) void this.waitForCompositionEnd(true);
    }

    private waitForCompositionEnd(force = false): Promise<void> {
        if (!force && !isAnyViewComposing()) return Promise.resolve();
        if (this.compositionWaiter) return this.compositionWaiter.promise;

        let resolveWaiter!: () => void;
        const promise = new Promise<void>((resolve) => {
            resolveWaiter = resolve;
        });
        const unsubscribe = onAllCompositionsEnd(() => {
            const waiter = this.compositionWaiter;
            this.compositionWaiter = null;
            waiter?.resolve();
        });
        this.compositionWaiter = {
            promise,
            resolve: resolveWaiter,
            unsubscribe,
        };
        return promise;
    }
}
