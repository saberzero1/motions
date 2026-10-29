import type { MarkdownView } from 'obsidian';
import type { EditorView } from '@codemirror/view';
import type { VimApi, CmAdapter } from '../types/vim-api';
import { getEditorView } from '../util/editor';
import {
    isBundledVimActive,
    getBundledVimApi,
    getBundledCmAdapter,
} from './bundled-vim';

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

export function getCmAdapterFromEditorView(
    editorView: EditorView,
): CmAdapter | null {
    if (!isBundledVimActive()) return null;
    try {
        return getBundledCmAdapter(editorView);
    } catch {
        return null;
    }
}

/**
 * The vim adapter driving `editorView`, whichever engine provides it.
 * Obsidian's built-in vim attaches its adapter as `editorView.cm`, which
 * `getCmAdapterFromEditorView` never reads, so a feature that must also work
 * under Obsidian's own Vim key bindings resolves the adapter here.
 */
export function getAnyVimAdapter(editorView: EditorView): CmAdapter | null {
    const own = (editorView as unknown as { cm?: CmAdapter }).cm;
    return own ?? getCmAdapterFromEditorView(editorView);
}

export function getCmAdapter(view: MarkdownView): CmAdapter | null {
    try {
        const editorView = getEditorView(view);
        if (!editorView) return null;

        // Built-in vim path: editorView.cm is the CM5-compat adapter
        const builtinAdapter = (editorView as unknown as { cm?: CmAdapter }).cm;
        if (builtinAdapter) return builtinAdapter;

        // Bundled vim path: the vim ViewPlugin sets view.cm on the EditorView
        if (isBundledVimActive()) {
            return getBundledCmAdapter(editorView);
        }

        return null;
    } catch {
        return null;
    }
}
