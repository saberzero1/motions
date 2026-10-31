import { Notice } from 'obsidian';
import type { ExCommandArgs } from '../types/vim-api';
import type { VimRegistration } from './registration';
import { runImageAction, type ImageAction } from './image-embed';

const ACTIONS = new Set<string>(['grow', 'shrink', 'reset', 'edit']);
const USAGE = 'Usage: :image grow|shrink|reset|edit [count]';

/**
 * Obsidian's count is the line address, `:3image grow`, because its command
 * takes no count argument. A trailing count, `:image grow 3`, is accepted too:
 * the Neovim backend forwards arguments but not addresses.
 */
export function imageCommandCount(params: ExCommandArgs): number {
    const argument = params.args[1];
    if (argument !== undefined) {
        if (!/^\d+$/.test(argument) || Number(argument) < 1)
            throw new Error(USAGE);
        return Number(argument);
    }
    return Math.max(1, (params.lineEnd ?? params.line ?? 0) + 1);
}

/**
 * `:image`, as Obsidian 1.13 defines it on its own Vim, for the plugin's
 * engine. Obsidian's `g+`/`g-`/`g=`/`g<CR>` bindings are deliberately not
 * copied: `g+` and `g-` are Neovim's undo-time travel, already bound to the
 * undo tree, and the other two alone would be half a set.
 *
 * `afterEdit` runs when the action changed the note; the Neovim backend uses
 * it to send the edit on to Neovim.
 */
export function registerImageCommand(
    registration: VimRegistration,
    afterEdit: () => Promise<void> | void,
): void {
    registration.defineEx('image', 'image', (cm, params) => {
        const action = params.args[0];
        if (action === undefined || !ACTIONS.has(action) || params.args[2])
            throw new Error(USAGE);
        const count = imageCommandCount(params);
        if (!runImageAction(cm.cm6, action as ImageAction, count)) return;
        void Promise.resolve()
            .then(afterEdit)
            .catch((error: unknown) => {
                const message =
                    error instanceof Error ? error.message : String(error);
                new Notice(
                    `Vim Motions: :image did not reach Neovim: ${message}`,
                );
            });
    });
}
