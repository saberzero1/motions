import type { App, MarkdownView } from 'obsidian';
import type { EditorView } from '@codemirror/view';
import type { VimApi, CmAdapter } from '../types/vim-api';
import {
    isBundledVimActive,
    getBundledVimApi,
    getBundledCmAdapter,
} from './bundled-vim';
import { isBuiltinVimEnabled } from '../util/vault';

let warnedMissing = false;

export function getVimApi(): VimApi | null {
    const builtin = window.CodeMirrorAdapter?.Vim ?? null;
    if (builtin) return builtin;

    if (isBundledVimActive()) return getBundledVimApi();

    if (!warnedMissing) {
        warnedMissing = true;
        console.warn(
            '[Vim Motions] No Vim API available. Enable Obsidian vim mode or let the plugin provide it.',
        );
    }
    return null;
}

export function getCmAdapter(view: MarkdownView): CmAdapter | null {
    try {
        const editorView = (view.editor as unknown as Record<string, unknown>)
            .cm as Record<string, unknown> | undefined;
        if (!editorView) return null;

        // Built-in vim path: editorView.cm is the CM5-compat adapter
        const builtinAdapter = editorView.cm as CmAdapter | undefined;
        if (builtinAdapter) return builtinAdapter;

        // Bundled vim path: the vim ViewPlugin sets view.cm on the EditorView
        if (isBundledVimActive()) {
            return getBundledCmAdapter(editorView as unknown as EditorView);
        }

        return null;
    } catch {
        return null;
    }
}

export function isVimEnabled(app: App): boolean {
    if (isBundledVimActive()) return true;
    return isBuiltinVimEnabled(app);
}
