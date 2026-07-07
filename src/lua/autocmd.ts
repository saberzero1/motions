import type { TFile } from 'obsidian';
import { lauxlib, lua } from 'fengari';
import type { lua_State } from 'fengari';
import type { CmAdapter, VimModeChange } from '../types/vim-api';
import { simpleGlobMatch } from './fn';

export interface AutocmdEntry {
    id: number;
    event: string;
    group: number | null;
    pattern: string | null;
    callback: (ev: AutocmdEventData) => void;
    luaRef: number | null;
    once: boolean;
    desc: string;
}

export interface AutocmdEventData {
    event: string;
    file: string;
    match: string;
    buf: number;
    id: number;
    group: number | null;
    data: unknown;
}

export interface AugroupEntry {
    id: number;
    name: string;
}

export interface AutocmdRegisterOptions {
    group?: number | string | null;
    pattern?: string | null;
    callback: (ev: AutocmdEventData) => void;
    luaRef?: number | null;
    once?: boolean;
    desc?: string;
}

export interface AutocmdClearOptions {
    group?: number | string | null;
    event?: string | null;
    pattern?: string | null;
}

export interface AutocmdCallbacks {
    onModeChange: (
        handler: (mode: VimModeChange) => void,
        adapter?: CmAdapter | null,
    ) => (() => void) | void;
    onYank: (
        handler: (payload: AutocmdYankEvent) => void,
        adapter?: CmAdapter | null,
    ) => (() => void) | void;
    onCursorMoved: (
        handler: (filePath: string) => void,
        adapter?: CmAdapter | null,
    ) => (() => void) | void;
    onFileOpen: (handler: (file: TFile | null) => void) => (() => void) | void;
    onFocusGained: (handler: () => void) => (() => void) | void;
    onFocusLost: (handler: () => void) => (() => void) | void;
}

export interface AutocmdYankEvent {
    operator: string;
    regName: string;
    regContents: string;
    regType: string;
    visual: boolean;
}

interface AutocmdFireOptions {
    file?: string;
    match?: string;
    data?: unknown;
}

const EXT_TO_FILETYPE: Record<string, string> = {
    md: 'markdown',
    js: 'javascript',
    ts: 'typescript',
    jsx: 'javascript',
    tsx: 'typescript',
    py: 'python',
    lua: 'lua',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    css: 'css',
    html: 'html',
    xml: 'xml',
    txt: 'text',
    csv: 'csv',
    svg: 'svg',
};

const INSERT_MODES = new Set(['i', 'R']);

export class AutocmdManager {
    private registry = new Map<number, AutocmdEntry>();
    private augroups = new Map<string, AugroupEntry>();
    private nextAutocmdId = 1;
    private nextAugroupId = 1;
    private firingDepth = 0;
    private pendingReload = false;
    private activated = false;
    private previousMode = 'n';
    private currentMode = 'n';
    private lastFilePath: string | null = null;
    private globalCleanups: Array<() => void> = [];
    private adapterCleanups: Array<() => void> = [];
    private currentAdapter: CmAdapter | null = null;
    private callbacks: AutocmdCallbacks | null = null;
    private reloadCallback: (() => void) | null = null;
    private cursorHoldTimer: number | null = null;
    private cursorHoldTimeout = 4000;
    private previousLeafType: string | null = null;
    private previousLeafId: string | null = null;
    private previousLeafFilePath: string | null = null;
    private leafEnterDebounceTimer: number | null = null;

    constructor(private L: lua_State | null) {}

    setReloadCallback(callback: (() => void) | null): void {
        this.reloadCallback = callback;
    }

    setUpdateTime(ms: number): void {
        if (!Number.isFinite(ms) || ms < 0) return;
        this.cursorHoldTimeout = ms;
    }

    register(event: string, opts: AutocmdRegisterOptions): number {
        const id = this.nextAutocmdId++;
        const group = this.resolveGroupId(opts.group);
        const entry: AutocmdEntry = {
            id,
            event,
            group,
            pattern: opts.pattern ?? null,
            callback: opts.callback,
            luaRef: opts.luaRef ?? null,
            once: opts.once ?? false,
            desc: opts.desc ?? '',
        };
        this.registry.set(id, entry);
        return id;
    }

    createAugroup(name: string, opts?: { clear?: boolean }): number {
        const existing = this.augroups.get(name);
        if (existing) {
            if (opts?.clear !== false) {
                this.clearAutocmds({ group: existing.id });
            }
            return existing.id;
        }
        const id = this.nextAugroupId++;
        this.augroups.set(name, { id, name });
        return id;
    }

    deleteAutocmd(id: number): void {
        const entry = this.registry.get(id);
        if (!entry) return;
        this.registry.delete(id);
        if (this.L && entry.luaRef !== null) {
            lauxlib.luaL_unref(this.L, lua.LUA_REGISTRYINDEX, entry.luaRef);
        }
    }

    deleteAugroupByName(name: string): void {
        const entry = this.augroups.get(name);
        if (!entry) return;
        this.clearAutocmds({ group: entry.id });
        this.augroups.delete(name);
    }

    clearAutocmds(opts: AutocmdClearOptions): void {
        const groupId = this.resolveGroupId(opts.group);
        const targetEvent = opts.event ?? null;
        const targetPattern = opts.pattern ?? null;
        const ids: number[] = [];
        for (const entry of this.registry.values()) {
            if (groupId !== null && entry.group !== groupId) continue;
            if (targetEvent && entry.event !== targetEvent) continue;
            if (targetPattern && entry.pattern !== targetPattern) continue;
            ids.push(entry.id);
        }
        for (const id of ids) this.deleteAutocmd(id);
    }

    clearUngrouped(): void {
        const ids: number[] = [];
        for (const entry of this.registry.values()) {
            if (entry.group === null) ids.push(entry.id);
        }
        for (const id of ids) this.deleteAutocmd(id);
    }

    clearAll(): void {
        const ids = Array.from(this.registry.keys());
        for (const id of ids) this.deleteAutocmd(id);
        this.augroups.clear();
    }

    fire(event: string, data?: AutocmdFireOptions): void {
        if (this.firingDepth > 0) return;
        this.firingDepth++;
        const file = data?.file ?? '';
        const match =
            data?.match ??
            (event === 'BufEnter' ||
            event === 'BufLeave' ||
            event === 'BufWritePre' ||
            event === 'BufWritePost'
                ? file
                : '');
        const payload = data?.data ?? null;
        const toDelete: number[] = [];
        for (const entry of this.registry.values()) {
            if (entry.event !== event) continue;
            if (!this.shouldMatch(entry, match, file)) continue;
            const eventData: AutocmdEventData = {
                event,
                file,
                match,
                buf: 0,
                id: entry.id,
                group: entry.group,
                data: payload,
            };
            try {
                entry.callback(eventData);
            } catch (error) {
                console.error('Vim Motions: autocmd callback error', error);
            }
            if (entry.once) toDelete.push(entry.id);
        }
        for (const id of toDelete) this.deleteAutocmd(id);
        this.firingDepth--;
        if (this.firingDepth === 0 && this.pendingReload) {
            this.pendingReload = false;
            this.reloadCallback?.();
        }
    }

    activate(
        callbacks: AutocmdCallbacks,
        initialFilePath?: string | null,
    ): void {
        if (this.activated) return;
        this.activated = true;
        this.callbacks = callbacks;

        const fileCleanup = callbacks.onFileOpen((file) => {
            const nextPath = file?.path ?? null;
            if (this.lastFilePath) {
                this.fire('BufLeave', { file: this.lastFilePath });
            }
            this.lastFilePath = nextPath;
            if (nextPath) {
                this.fire('BufEnter', { file: nextPath });
            }
        });
        if (fileCleanup) this.globalCleanups.push(fileCleanup);

        if (initialFilePath) {
            this.lastFilePath = initialFilePath;
            this.fire('BufEnter', { file: initialFilePath });
        }

        const focusGainedCleanup = callbacks.onFocusGained(() => {
            this.fire('FocusGained');
        });
        if (focusGainedCleanup) this.globalCleanups.push(focusGainedCleanup);

        const focusLostCleanup = callbacks.onFocusLost(() => {
            this.fire('FocusLost');
        });
        if (focusLostCleanup) this.globalCleanups.push(focusLostCleanup);

        const modeCleanup = callbacks.onModeChange(this.handleModeChange);
        if (modeCleanup) this.adapterCleanups.push(modeCleanup);

        const yankCleanup = callbacks.onYank(this.handleYank);
        if (yankCleanup) this.adapterCleanups.push(yankCleanup);

        const cursorCleanup = callbacks.onCursorMoved(this.handleCursorMoved);
        if (cursorCleanup) this.adapterCleanups.push(cursorCleanup);
    }

    onActiveLeafChange(
        adapter: CmAdapter | null,
        leafInfo?: { type: string; id: string; filePath: string | null },
    ): void {
        // Fire LeafLeave for previous leaf (immediate, not debounced)
        if (this.previousLeafType !== null) {
            this.fire('LeafLeave', {
                file: this.previousLeafFilePath ?? '',
                match: this.previousLeafType,
                data: {
                    type: this.previousLeafType,
                    leaf_id: this.previousLeafId,
                },
            });
        }

        // Fire LeafEnter for new leaf (debounced)
        if (leafInfo) {
            if (this.leafEnterDebounceTimer !== null) {
                window.clearTimeout(this.leafEnterDebounceTimer);
            }
            const enterInfo = { ...leafInfo };
            this.leafEnterDebounceTimer = window.setTimeout(() => {
                this.leafEnterDebounceTimer = null;
                this.fire('LeafEnter', {
                    file: enterInfo.filePath ?? '',
                    match: enterInfo.type,
                    data: {
                        type: enterInfo.type,
                        leaf_id: enterInfo.id,
                    },
                });
            }, 50);
            this.previousLeafType = leafInfo.type;
            this.previousLeafId = leafInfo.id;
            this.previousLeafFilePath = leafInfo.filePath;
        } else {
            this.previousLeafType = null;
            this.previousLeafId = null;
            this.previousLeafFilePath = null;
        }

        // Existing adapter logic (unchanged)
        if (adapter === this.currentAdapter) return;
        this.detachAdapter();
        if (!adapter) return;
        this.currentAdapter = adapter;
        this.bindAdapter(adapter);
    }

    isFiring(): boolean {
        return this.firingDepth > 0;
    }

    deferReload(): void {
        this.pendingReload = true;
    }

    hasPendingReload(): boolean {
        return this.pendingReload;
    }

    getModeState(): { previousMode: string; currentMode: string } {
        return {
            previousMode: this.previousMode,
            currentMode: this.currentMode,
        };
    }

    destroy(): void {
        this.detachAdapter();
        if (this.cursorHoldTimer) {
            window.clearTimeout(this.cursorHoldTimer);
            this.cursorHoldTimer = null;
        }
        if (this.leafEnterDebounceTimer) {
            window.clearTimeout(this.leafEnterDebounceTimer);
            this.leafEnterDebounceTimer = null;
        }
        for (const cleanup of this.globalCleanups) cleanup();
        this.globalCleanups = [];
        this.callbacks = null;
        this.clearAll();
    }

    fireFileType(filePath: string): void {
        if (!filePath) return;
        const lastDot = filePath.lastIndexOf('.');
        if (lastDot === -1) return;
        const ext = filePath.substring(lastDot + 1).toLowerCase();
        const filetype = EXT_TO_FILETYPE[ext];
        if (filetype) {
            this.fire('FileType', {
                file: filePath,
                match: filetype,
            });
        }
    }

    private bindAdapter(adapter: CmAdapter | null): void {
        if (!adapter || !this.callbacks) return;
        const modeCleanup = this.callbacks.onModeChange(
            this.handleModeChange,
            adapter,
        );
        if (modeCleanup) this.adapterCleanups.push(modeCleanup);
        const yankCleanup = this.callbacks.onYank(this.handleYank, adapter);
        if (yankCleanup) this.adapterCleanups.push(yankCleanup);
        const cursorCleanup = this.callbacks.onCursorMoved(
            this.handleCursorMoved,
            adapter,
        );
        if (cursorCleanup) this.adapterCleanups.push(cursorCleanup);
    }

    private detachAdapter(): void {
        for (const cleanup of this.adapterCleanups) cleanup();
        this.adapterCleanups = [];
        this.currentAdapter = null;
    }

    private handleModeChange = (mode: VimModeChange): void => {
        const previous = this.currentMode;
        const next = this.modeToChar(mode);
        this.previousMode = previous;
        this.currentMode = next;
        const match = `${previous}:${next}`;
        this.fire('ModeChanged', {
            match,
            data: { old_mode: previous, new_mode: next },
        });
        if (INSERT_MODES.has(next) && !INSERT_MODES.has(previous)) {
            this.fire('InsertEnter');
        }
        if (INSERT_MODES.has(previous) && !INSERT_MODES.has(next)) {
            this.fire('InsertLeave');
        }
    };

    private handleYank = (payload: AutocmdYankEvent): void => {
        const contents = payload.regContents.split('\n');
        this.fire('TextYankPost', {
            data: {
                operator: payload.operator,
                regname: payload.regName,
                regcontents: contents,
                regtype: payload.regType,
                visual: payload.visual,
            },
        });
    };

    private handleCursorMoved = (filePath: string): void => {
        this.fire('CursorMoved', { file: filePath });
        if (this.cursorHoldTimer) {
            window.clearTimeout(this.cursorHoldTimer);
        }
        this.cursorHoldTimer = window.setTimeout(() => {
            this.fire('CursorHold', { file: filePath });
        }, this.cursorHoldTimeout);
    };

    private modeToChar(mode: VimModeChange): string {
        if (mode.mode === 'insert') return 'i';
        if (mode.mode === 'replace') return 'R';
        if (mode.mode === 'vreplace') return 'R';
        if (mode.mode === 'select') return 's';
        if (mode.mode === 'visual') {
            if (mode.subMode === 'linewise') return 'V';
            if (mode.subMode === 'blockwise') return '\x16';
            return 'v';
        }
        return 'n';
    }

    private resolveGroupId(group?: number | string | null): number | null {
        if (typeof group === 'number') return group;
        if (typeof group === 'string')
            return this.augroups.get(group)?.id ?? null;
        return null;
    }

    private shouldMatch(
        entry: AutocmdEntry,
        match: string,
        file: string,
    ): boolean {
        if (!entry.pattern) return true;
        if (
            entry.event === 'BufEnter' ||
            entry.event === 'BufLeave' ||
            entry.event === 'BufWritePre' ||
            entry.event === 'BufWritePost'
        ) {
            if (!file) return false;
            return simpleGlobMatch(entry.pattern, file);
        }
        if (entry.event === 'ModeChanged') {
            return simpleGlobMatch(entry.pattern, match);
        }
        return true;
    }
}
