import { Platform } from 'obsidian';
import { isExternalBackendActive } from '../external-mode';

/** A table widget mode that renders tables; `auto` resolves to one of them. */
export type TableWidgetMode = 'native' | 'reveal' | 'raw';

/**
 * The table widget mode in effect for the `tableWidgetMode` setting.
 *
 * `auto` is `reveal` while the Neovim backend owns keys and `native`
 * otherwise. Obsidian's table editor gives each cell an editor of its own,
 * and the backend mirrors only the note's editor, so Neovim never sees a cell
 * being edited; a revealed table is lines of the note, which Neovim edits,
 * follows into and draws its extmarks over. With the plugin's own vim,
 * `native` keeps Obsidian's widget while editing, works on mobile, and is the
 * mode most measured.
 */
export function effectiveTableWidgetMode(
    setting: string,
    externalBackend: boolean = isExternalBackendActive(),
): TableWidgetMode {
    if (setting === 'reveal' || setting === 'raw') return setting;
    if (setting === 'auto') return externalBackend ? 'reveal' : 'native';
    return 'native';
}

/**
 * Why the reveal table surface is not installed, or `null` when it is.
 *
 * Each value is a deliberate restriction rather than a missing feature, so the
 * reason is kept rather than collapsed to a boolean — a surface that silently
 * falls back reads to users as a bug.
 */
export type TableSurfaceBlocker = 'disabled' | 'mobile' | null;

export function resolveTableSurfaceBlocker(mode: string): TableSurfaceBlocker {
    if (mode !== 'reveal') return 'disabled';
    // Obsidian's own Vim key bindings are deliberately not a blocker. The
    // surface routes nothing through the bundled fork: the active table
    // becomes ordinary lines that whichever vim is running edits, measured
    // with Obsidian's own in `table-reveal-builtin-vim.e2e.ts`. Neither is
    // the Neovim backend, for the same reason.
    if (Platform.isMobile) return 'mobile';
    return null;
}

/** User-facing explanation for a blocked surface, or `null` when silent. */
export function describeTableSurfaceBlocker(
    blocker: TableSurfaceBlocker,
): string | null {
    switch (blocker) {
        case 'mobile':
            return 'Vim Motions: revealing table source is desktop-only for now. Using the native table editor.';
        case 'disabled':
        case null:
            return null;
    }
}
