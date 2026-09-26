import type { App } from 'obsidian';
import type { VimMotionsSettings } from '../settings';
import type { VimModeTracker } from '../vim/mode-tracker';
import { executeCommand } from './navigation';
import { executeGlobalExCommand } from '../ui/global-ex-command';
import { isHintModeActive } from '../ui/hint-mode';
import type {
    GlobalDispatchContext,
    GlobalMapEntry,
    GlobalMappingRegistry,
} from './global-mapping-registry';
import { normalizeKeyEvent } from './global-mapping-registry';
import { observeKeyEvent } from './key-observer';
import { FileExplorerContext } from './file-explorer-context';

import { runCleanups } from '../util/cleanup';
const SEQUENCE_TIMEOUT = 1000;

const GLOBAL_NAV_VIEW_TYPES = new Set([
    'markdown',
    'graph',
    'pdf',
    'canvas',
    'empty',
    'image',
    'bases',
]);

function isEditorOrInputFocused(doc: Document): boolean {
    const el = doc.activeElement;
    if (!el) return false;

    if (el.closest('.cm-editor')) return true;

    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if ((el as HTMLElement).isContentEditable) return true;
    if (el.closest('.prompt-input')) return true;

    return false;
}

function isModalOpen(doc: Document): boolean {
    return !!doc.querySelector('.modal-container');
}

export class GlobalKeyHandler {
    private app: App;
    private settings: VimMotionsSettings;
    private modeTracker: VimModeTracker | null;
    private registry: GlobalMappingRegistry;
    private explorerContext: FileExplorerContext;
    private activeLeafViewType: string | null = null;

    private docs = new Set<Document>();
    private cleanups: (() => void)[] = [];

    private keyBuffer: string[] = [];
    private count = 0;
    private countActive = false;
    private timer: number | null = null;
    private lastActiveDoc: Document | null = null;
    private translatedFileExplorerEvents = new WeakSet<KeyboardEvent>();

    onGlobalChord?: (
        chord: string,
        completions: GlobalMapEntry[],
        doc: Document,
    ) => void;
    openPicker?: (source: string, opts?: { query?: string }) => void;

    constructor(
        app: App,
        settings: VimMotionsSettings,
        modeTracker: VimModeTracker | null,
        registry: GlobalMappingRegistry,
    ) {
        this.app = app;
        this.settings = settings;
        this.modeTracker = modeTracker;
        this.registry = registry;
        this.explorerContext = new FileExplorerContext(app);
    }

    // ── Lifecycle ───────────────────────────────────────────────

    install(): void {
        const mainDoc =
            this.app.workspace.containerEl.ownerDocument ?? activeDocument;
        this.installOnDocument(mainDoc);

        const ref = this.app.workspace.on(
            'window-open',
            (_workspaceWindow, win) => {
                this.installOnDocument(win.document);
            },
        );
        this.cleanups.push(() => this.app.workspace.offref(ref));
        const leafRef = this.app.workspace.on('active-leaf-change', (leaf) => {
            this.activeLeafViewType = leaf?.view.getViewType() ?? null;
        });
        this.cleanups.push(() => this.app.workspace.offref(leafRef));
        this.explorerContext.observeActiveLeaf();
    }

    private installOnDocument(doc: Document): void {
        if (this.docs.has(doc)) return;
        this.docs.add(doc);

        const handler = (e: KeyboardEvent) => this.onKeydown(e, doc);
        doc.addEventListener('keydown', handler, true);
        this.explorerContext.observeDocument(doc);
        this.cleanups.push(() => {
            doc.removeEventListener('keydown', handler, true);
        });
    }

    destroy(): void {
        this.resetSequence();
        this.explorerContext.destroy();
        runCleanups(this.cleanups, 'global key handler');
        this.cleanups = [];
        this.docs.clear();
    }

    private resetSequence(): void {
        this.keyBuffer = [];
        this.count = 0;
        this.countActive = false;
        if (this.timer !== null) {
            window.clearTimeout(this.timer);
            this.timer = null;
        }
        this.modeTracker?.setGlobalChord('');
        if (this.onGlobalChord && this.lastActiveDoc) {
            this.onGlobalChord('', [], this.lastActiveDoc);
        }
        this.lastActiveDoc = null;
    }

    private startTimeout(): void {
        if (this.timer !== null) window.clearTimeout(this.timer);
        this.timer = window.setTimeout(() => {
            // Keep sequence alive while which-key has pending completions
            // (matches editor which-key behavior: popup stays until command completes).
            const seq = this.keyBuffer.join('');
            if (seq) {
                const result = this.registry.resolve(seq);
                if (result.type === 'partial') {
                    this.startTimeout();
                    return;
                }
            }
            this.resetSequence();
        }, SEQUENCE_TIMEOUT);
    }

    private chordText(): string {
        const countStr = this.count > 0 ? String(this.count) : '';
        return countStr + this.keyBuffer.join('');
    }

    private updateChord(doc: Document): void {
        this.modeTracker?.setGlobalChord(this.chordText());
        const chord = this.chordText();
        const seq = this.keyBuffer.join('');
        if (this.onGlobalChord && seq) {
            const completions = this.registry.getCompletions(seq);
            this.onGlobalChord(chord, completions, doc);
        }
    }

    private shouldInterceptContent(e: KeyboardEvent, doc: Document): boolean {
        if (e.isComposing) return false;
        if (isEditorOrInputFocused(doc)) return false;
        if (isModalOpen(doc)) return false;
        if (this.isPluginLeafActive(e, doc)) return false;
        return true;
    }

    private shouldInterceptHints(e: KeyboardEvent, doc: Document): boolean {
        if (e.isComposing) return false;
        if (isEditorOrInputFocused(doc)) return false;
        return true;
    }

    private shouldInterceptExplorer(e: KeyboardEvent, doc: Document): boolean {
        if (e.isComposing) return false;
        if (isEditorOrInputFocused(doc)) return false;
        if (isModalOpen(doc)) return false;
        return this.explorerContext.isActive(doc, e.target);
    }

    private shouldInterceptStructural(
        e: KeyboardEvent,
        doc: Document,
    ): boolean {
        if (e.isComposing) return false;
        if (isEditorOrInputFocused(doc)) return false;
        if (isModalOpen(doc)) return false;
        return true;
    }

    private isPluginLeafActive(e: KeyboardEvent, doc: Document): boolean {
        // The File Explorer's j/k are the standard scroll entries branching on
        // context, so a focused explorer must not veto them as a plugin leaf.
        if (this.explorerContext.isActive(doc, e.target)) return false;
        // getMostRecentLeaf() is root-split biased and never reports a sidebar
        // leaf, so a focused sidebar pane looked like the main editor and
        // standard keys scrolled it. Prefer the leaf that actually gained focus.
        if (this.activeLeafViewType !== null) {
            return !this.getNavViewTypes().has(this.activeLeafViewType);
        }
        const leaf = this.app.workspace.getMostRecentLeaf();
        if (!leaf?.view) return false;
        const viewType =
            (leaf.view as { getViewType?: () => string }).getViewType?.() ?? '';
        return !this.getNavViewTypes().has(viewType);
    }

    private getNavViewTypes(): Set<string> {
        const custom = this.settings.workspaceNavViewTypes;
        if (custom && custom.trim()) {
            return new Set(
                custom
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
            );
        }
        return GLOBAL_NAV_VIEW_TYPES;
    }

    private makeDispatchContext(
        e: KeyboardEvent,
        doc: Document,
    ): GlobalDispatchContext {
        const target = e.target;
        return {
            inFileExplorer: this.explorerContext.isActive(doc, target),
            sendKey: (key: string) => {
                const KeyboardEventCtor = doc.defaultView?.KeyboardEvent;
                if (!KeyboardEventCtor || !target) return;
                const synthetic = new KeyboardEventCtor('keydown', {
                    key,
                    code: key,
                    bubbles: true,
                    cancelable: true,
                });
                this.translatedFileExplorerEvents.add(synthetic);
                target.dispatchEvent(synthetic);
            },
        };
    }

    private dispatch(entry: GlobalMapEntry, ctx: GlobalDispatchContext): void {
        const action = entry.action;
        if (action.type === 'obcommand') {
            const repeat = this.count || 1;
            for (let i = 0; i < repeat; i++) {
                executeCommand(this.app, action.commandId);
            }
        } else if (action.type === 'ex') {
            executeGlobalExCommand(
                this.app,
                action.command,
                undefined,
                this.openPicker,
            );
        } else if (action.type === 'builtin') {
            action.fn(this.app, this.count, ctx);
        }
    }

    private onKeydown(e: KeyboardEvent, doc: Document): void {
        if (this.translatedFileExplorerEvents.delete(e)) return;

        // Observe before workspace/editor/hint gates, including insert-mode
        // text that does not emit the adapter's vim-keypress event.
        observeKeyEvent(e);
        if (isHintModeActive()) return;

        if (
            e.key === 'Shift' ||
            e.key === 'Control' ||
            e.key === 'Alt' ||
            e.key === 'Meta'
        ) {
            return;
        }

        if (e.isComposing) return;

        const key = normalizeKeyEvent(e);
        const prospectiveSeq = [...this.keyBuffer, key].join('');

        const matchResult = this.registry.resolve(prospectiveSeq);
        let gateApplies:
            'hint' | 'standard' | 'structural' | 'explorer' | null = null;

        if (matchResult.type === 'exact') {
            gateApplies = matchResult.entry.gate;
        } else if (matchResult.type === 'partial') {
            const completions = this.registry.getCompletions(prospectiveSeq);
            const hasStructural = completions.some(
                (entry) => entry.gate === 'structural',
            );
            const hasStandard = completions.some(
                (entry) => entry.gate === 'standard',
            );
            const hasHint = completions.some((entry) => entry.gate === 'hint');
            // 'explorer' is last so a co-registered structural/standard
            // mapping wins a shared prefix. Single-key h/l take the exact
            // match above, so this chain is defensive for future multi-key
            // explorer mappings rather than a production path.
            const hasExplorer = completions.some(
                (entry) => entry.gate === 'explorer',
            );
            if (hasStructural) {
                gateApplies = 'structural';
            } else if (hasStandard) {
                gateApplies = 'standard';
            } else if (hasHint) {
                gateApplies = 'hint';
            } else if (hasExplorer) {
                gateApplies = 'explorer';
            }
        }

        // Continue accumulating count digits if already in count mode.
        // MUST precede the gate block: an unmapped digit yields
        // `gateApplies === null`, whose branch returns unconditionally, so
        // moving this below it truncates every count to its first digit.
        if (
            this.countActive &&
            this.keyBuffer.length === 0 &&
            !e.ctrlKey &&
            !e.altKey &&
            !e.metaKey &&
            !e.shiftKey &&
            e.key >= '0' &&
            e.key <= '9'
        ) {
            e.preventDefault();
            e.stopPropagation();
            this.count = this.count * 10 + parseInt(e.key, 10);
            this.startTimeout();
            this.updateChord(doc);
            return;
        }

        if (this.keyBuffer.length === 0) {
            if (gateApplies === 'structural') {
                if (!this.shouldInterceptStructural(e, doc)) return;
            } else if (gateApplies === 'hint') {
                if (!this.shouldInterceptHints(e, doc)) return;
            } else if (gateApplies === 'standard') {
                if (!this.shouldInterceptContent(e, doc)) return;
            } else if (gateApplies === 'explorer') {
                if (!this.shouldInterceptExplorer(e, doc)) return;
            } else {
                if (
                    !e.ctrlKey &&
                    !e.altKey &&
                    !e.metaKey &&
                    !e.shiftKey &&
                    e.key >= '1' &&
                    e.key <= '9' &&
                    !this.countActive
                ) {
                    if (!this.shouldInterceptContent(e, doc)) return;
                    e.preventDefault();
                    e.stopPropagation();
                    this.count = parseInt(e.key, 10);
                    this.countActive = true;
                    this.startTimeout();
                    this.updateChord(doc);
                    return;
                }
                return;
            }
        }

        e.preventDefault();
        e.stopPropagation();
        if (this.keyBuffer.length === 0) {
            this.lastActiveDoc = doc;
        }
        this.keyBuffer.push(key);
        const seq = this.keyBuffer.join('');
        const result = this.registry.resolve(seq);

        if (result.type === 'exact') {
            if (
                result.entry.gate === 'standard' &&
                this.isPluginLeafActive(e, doc)
            ) {
                this.resetSequence();
                return;
            }
            this.dispatch(result.entry, this.makeDispatchContext(e, doc));
            this.resetSequence();
        } else if (result.type === 'partial') {
            this.startTimeout();
            this.updateChord(doc);
        } else {
            this.resetSequence();
        }
    }
}
