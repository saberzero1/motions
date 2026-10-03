import { Platform, editorLivePreviewField, type App } from 'obsidian';
import type { EditorState } from '@codemirror/state';
import { isBuiltinVimEnabled } from '../../util/vault';
import type { ShouldRender } from './surface-field';

/**
 * Why the owned table surface is not installed, or `null` when it is.
 *
 * Each value is a deliberate restriction rather than a missing feature, so the
 * reason is kept rather than collapsed to a boolean — a surface that silently
 * falls back reads to users as a bug.
 */
export type TableSurfaceBlocker = 'disabled' | 'builtin-vim' | 'mobile' | null;

export function resolveTableSurfaceBlocker(
    app: App,
    mode: string,
): TableSurfaceBlocker {
    if (mode !== 'owned') return 'disabled';
    // The bundled fork is the only engine the surface has been measured
    // against. Obsidian's own vim is a third engine without the fork's
    // extended API, and supporting it unmeasured is how a silent regression
    // class appears.
    if (isBuiltinVimEnabled(app)) return 'builtin-vim';
    if (Platform.isMobile) return 'mobile';
    // RPC is deliberately **not** a blocker. Under the Neovim backend the
    // surface renders as a presentational table: the child is inert and never
    // focused, so Neovim keeps owning keys, IME, floats and the command line.
    // What Neovim *draws* — extmarks, flash labels, diagnostics, folds — does
    // not appear inside the table, which is stated in the setting's own
    // description rather than in a notice, because a notice only fires when a
    // blocker exists and there is no longer one.
    return null;
}

/** User-facing explanation for a blocked surface, or `null` when silent. */
export function describeTableSurfaceBlocker(
    blocker: TableSurfaceBlocker,
): string | null {
    switch (blocker) {
        case 'builtin-vim':
            return "Vim Motions: owned table rendering needs Obsidian's own Vim key bindings turned off. Using the native table editor.";
        case 'mobile':
            return 'Vim Motions: owned table rendering is desktop-only for now. Using the native table editor.';
        case 'disabled':
        case null:
            return null;
    }
}

/**
 * Per-view gate: render only in Live Preview.
 *
 * Separate from the blockers above because it is a property of each view
 * rather than of the plugin's configuration — one leaf can be in Source mode
 * while another shows Live Preview. Read with `false` so a surface without the
 * field, such as an embedded editor, is treated as not Live Preview rather
 * than throwing.
 */
export function livePreviewOnly(): ShouldRender {
    return (state: EditorState) =>
        state.field(editorLivePreviewField, false) === true;
}
