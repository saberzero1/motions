import type { ActionArgs } from '../types/vim-api';

/**
 * The register and count typed before an expr mapping, as keys.
 *
 * Neovim leaves both pending, so the keys the expression returns pick them
 * up. Measured on 0.12.6:
 * - `3Q` with `Q` returning `j` moves 3 lines.
 * - `"a2Y` and `2"aY` with `Y` returning `yy` both yank 2 lines into `a`.
 * - `3X` with `X` returning `""`, then `j`, moves 3 lines: the count waits
 *   for the next key.
 *
 * The fork clears its input state before it runs the mapping's action, so the
 * expr callback feeds this prefix back ahead of the returned keys.
 */
export function pendingPrefix(args: ActionArgs | undefined): string {
    if (!args) return '';
    let prefix = '';
    if (args.registerName) prefix += `"${args.registerName}`;
    if (args.repeatIsExplicit && args.repeat > 0) prefix += String(args.repeat);
    return prefix;
}
