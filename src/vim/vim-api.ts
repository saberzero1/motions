import type { MarkdownView } from 'obsidian';
import type { VimApi, CmAdapter } from '../types/vim-api';

let warnedMissing = false;

export function getVimApi(): VimApi | null {
    const api = window.CodeMirrorAdapter?.Vim ?? null;
    if (!api && !warnedMissing) {
        warnedMissing = true;
        console.warn(
            '[Vim Motions] CodeMirrorAdapter.Vim not available. Is Vim mode enabled?',
        );
    }
    return api;
}

export function getCmAdapter(view: MarkdownView): CmAdapter | null {
    try {
        const editorView = (view.editor as unknown as Record<string, unknown>)
            .cm as Record<string, unknown> | undefined;
        if (!editorView) return null;
        const adapter = editorView.cm as CmAdapter | undefined;
        return adapter ?? null;
    } catch {
        return null;
    }
}

export function isVimEnabled(app: {
    vault: { getConfig: (key: string) => unknown };
}): boolean {
    try {
        return (app.vault.getConfig('vimMode') as boolean) === true;
    } catch {
        return false;
    }
}
