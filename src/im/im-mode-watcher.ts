import {
    ViewPlugin,
    type EditorView,
    type PluginValue,
    type ViewUpdate,
} from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { getCmAdapterFromEditorView } from '../vim/vim-api';
import type { CmAdapter, VimModeChange } from '../types/vim-api';
import { onExternalVimMode } from '../vim/external-mode';

type ImModeCallback = (viewId: string) => void;

const INSERT_MODES = new Set(['insert', 'replace']);

let onEnterInsert: ImModeCallback | null = null;
let onLeaveInsert: ImModeCallback | null = null;
let cleanupCallback: ((viewId: string) => void) | null = null;
let nextId = 0;
const viewsById = new Map<string, EditorView>();

class ImModeWatcher implements PluginValue {
    private adapter: CmAdapter | null = null;
    private handler: ((mode: VimModeChange) => void) | null = null;
    private externalCleanup: (() => void) | null = null;
    private inInsert = false;
    private destroyed = false;
    readonly viewId: string;

    constructor(private view: EditorView) {
        this.viewId = `imw_${nextId++}`;
        viewsById.set(this.viewId, view);
        this.tryBind();
        // A backend that owns keys reports its mode here instead of through
        // the fork's event, which never fires while the fork is stood down.
        this.externalCleanup = onExternalVimMode((mode) => {
            if (mode === null) return;
            this.applyMode(INSERT_MODES.has(mode));
        });
    }

    private applyMode(nowInsert: boolean): void {
        if (this.destroyed) return;
        if (nowInsert && !this.inInsert) {
            this.inInsert = true;
            onEnterInsert?.(this.viewId);
        } else if (!nowInsert && this.inInsert) {
            this.inInsert = false;
            onLeaveInsert?.(this.viewId);
        }
    }

    update(_update: ViewUpdate): void {
        if (this.destroyed) return;
        if (!this.adapter) {
            this.tryBind();
            return;
        }
        const current = getCmAdapterFromEditorView(this.view);
        if (current && current !== this.adapter) {
            this.unbind();
            this.adapter = current;
            this.bind();
        }
    }

    destroy(): void {
        this.destroyed = true;
        this.externalCleanup?.();
        this.externalCleanup = null;
        this.unbind();
        viewsById.delete(this.viewId);
        cleanupCallback?.(this.viewId);
    }

    private tryBind(): void {
        const adapter = getCmAdapterFromEditorView(this.view);
        if (!adapter) return;
        this.adapter = adapter;
        this.bind();
    }

    private bind(): void {
        if (!this.adapter) return;
        const vim = (this.adapter.state as Record<string, unknown>).vim as
            Record<string, unknown> | undefined;
        this.inInsert =
            vim?.insertMode === true ||
            (vim?.mode as string | undefined) === 'replace';

        this.handler = (mode: VimModeChange) => {
            this.applyMode(INSERT_MODES.has(mode.mode));
        };
        this.adapter.on('vim-mode-change', this.handler);
    }

    private unbind(): void {
        if (this.adapter && this.handler) {
            this.adapter.off(
                'vim-mode-change',
                this.handler as (...args: unknown[]) => void,
            );
        }
        this.adapter = null;
        this.handler = null;
        this.inInsert = false;
    }
}

export function setImModeCallbacks(
    onEnter: ImModeCallback,
    onLeave: ImModeCallback,
    onCleanup: (viewId: string) => void,
): void {
    onEnterInsert = onEnter;
    onLeaveInsert = onLeave;
    cleanupCallback = onCleanup;
}

export function clearImModeCallbacks(): void {
    onEnterInsert = null;
    onLeaveInsert = null;
    cleanupCallback = null;
}

/** Resolve a watcher id back to its live CM6 view for host area mapping. */
export function getImEditorView(viewId: string): EditorView | null {
    return viewsById.get(viewId) ?? null;
}

export function createImModeWatcherExtension(): Extension {
    return ViewPlugin.fromClass(ImModeWatcher);
}

/** @internal — exposed for unit tests only. */
export function _resetWatchers(): void {
    onEnterInsert = null;
    onLeaveInsert = null;
    cleanupCallback = null;
    nextId = 0;
    viewsById.clear();
}
