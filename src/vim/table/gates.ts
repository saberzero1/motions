import { Platform, editorLivePreviewField, type App } from 'obsidian';
import type { EditorState } from '@codemirror/state';
import { isBuiltinVimEnabled } from '../../util/vault';
import type { ShouldRender } from './surface-field';

/**
 * Why a plugin-owned table surface is not installed, or `null` when it is.
 *
 * Each value is a deliberate restriction rather than a missing feature, so the
 * reason is kept rather than collapsed to a boolean — a surface that silently
 * falls back reads to users as a bug.
 */
export type TableSurfaceBlocker = 'disabled' | 'builtin-vim' | 'mobile' | null;

/** The `tableWidgetMode` values that install a surface of the plugin's own. */
export type TableSurfaceMode = 'owned' | 'reveal';

export function resolveTableSurfaceBlocker(
    app: App,
    mode: string,
    surface: TableSurfaceMode,
): TableSurfaceBlocker {
    if (mode !== surface) return 'disabled';
    // The bundled fork is the only engine these surfaces have been measured
    // against. Obsidian's own vim is a third engine without the fork's
    // extended API, and supporting it unmeasured is how a silent regression
    // class appears. `reveal` depends on no fork API at all, so this is the
    // first restriction to lift once it is measured there.
    if (isBuiltinVimEnabled(app)) return 'builtin-vim';
    if (Platform.isMobile) return 'mobile';
    // RPC is deliberately **not** a blocker. Under the Neovim backend `owned`
    // renders as a presentational table: the child is inert and never
    // focused, so Neovim keeps owning keys, IME, floats and the command line.
    // `reveal` needs nothing at all there — the table becomes ordinary lines
    // of the buffer Neovim already mirrors.
    return null;
}

const SURFACE_LABEL: Record<TableSurfaceMode, string> = {
    owned: 'owned table rendering',
    reveal: 'revealing table source',
};

/** User-facing explanation for a blocked surface, or `null` when silent. */
export function describeTableSurfaceBlocker(
    blocker: TableSurfaceBlocker,
    surface: TableSurfaceMode,
): string | null {
    const label = SURFACE_LABEL[surface];
    switch (blocker) {
        case 'builtin-vim':
            return `Vim Motions: ${label} needs Obsidian's own Vim key bindings turned off. Using the native table editor.`;
        case 'mobile':
            return `Vim Motions: ${label} is desktop-only for now. Using the native table editor.`;
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
