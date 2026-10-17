import {
    ViewPlugin,
    type EditorView,
    type PluginValue,
    type ViewUpdate,
} from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { getCmAdapterFromEditorView } from './vim-api';
import type { CmAdapter } from '../types/vim-api';

const freshSelections = new WeakSet<object>();

class VisualExitTracker implements PluginValue {
    private adapter: CmAdapter | null = null;
    private handler: (() => void) | null = null;
    private lastSeen: unknown = undefined;
    private destroyed = false;

    constructor(private view: EditorView) {
        this.tryBind();
    }

    update(_update: ViewUpdate): void {
        if (this.destroyed) return;
        const current = getCmAdapterFromEditorView(this.view);
        if (!current || current === this.adapter) return;
        this.unbind();
        this.bind(current);
    }

    destroy(): void {
        this.destroyed = true;
        this.unbind();
    }

    private tryBind(): void {
        const adapter = getCmAdapterFromEditorView(this.view);
        if (adapter) this.bind(adapter);
    }

    private bind(adapter: CmAdapter): void {
        this.adapter = adapter;
        this.lastSeen = adapter.state.vim?.lastSelection;
        this.handler = () => {
            if (this.destroyed) return;
            const last = adapter.state.vim?.lastSelection;
            if (last === this.lastSeen) return;
            this.lastSeen = last;
            if (typeof last !== 'object' || last === null) return;
            freshSelections.add(last);
            queueMicrotask(() => freshSelections.delete(last));
        };
        adapter.on('vim-mode-change', this.handler);
    }

    private unbind(): void {
        if (this.adapter && this.handler) {
            this.adapter.off('vim-mode-change', this.handler);
        }
        this.adapter = null;
        this.handler = null;
    }
}

export function leftVisualModeThisTask(cm: CmAdapter): boolean {
    const last = cm.state.vim?.lastSelection;
    return (
        typeof last === 'object' && last !== null && freshSelections.has(last)
    );
}

export function visualExitTrackerExtension(): Extension {
    return ViewPlugin.fromClass(VisualExitTracker);
}
