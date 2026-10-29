import { Platform } from 'obsidian';

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
