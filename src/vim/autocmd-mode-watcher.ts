import {
    ViewPlugin,
    type EditorView,
    type PluginValue,
    type ViewUpdate,
} from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { getCmAdapterFromEditorView } from './vim-api';
import type { CmAdapter, VimModeChange } from '../types/vim-api';

type ModeChangeCallback = (mode: VimModeChange) => void;

let onModeChange: ModeChangeCallback | null = null;

class AutocmdModeWatcher implements PluginValue {
    private adapter: CmAdapter | null = null;
    private handler: ((mode: VimModeChange) => void) | null = null;
    private destroyed = false;

    constructor(private view: EditorView) {
        this.tryBind();
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
        this.unbind();
    }

    private tryBind(): void {
        const adapter = getCmAdapterFromEditorView(this.view);
        if (!adapter) return;
        this.adapter = adapter;
        this.bind();
    }

    private bind(): void {
        if (!this.adapter) return;
        this.handler = (mode: VimModeChange) => {
            if (this.destroyed) return;
            onModeChange?.(mode);
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
    }
}

export function setAutocmdModeCallbacks(cb: ModeChangeCallback): void {
    onModeChange = cb;
}

export function clearAutocmdModeCallbacks(): void {
    onModeChange = null;
}

export function createAutocmdModeWatcherExtension(): Extension {
    return ViewPlugin.fromClass(AutocmdModeWatcher);
}
