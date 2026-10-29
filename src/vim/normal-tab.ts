import { runScopeHandlers } from '@codemirror/view';
import type { ActionFn } from '../types/vim-api';
import { classifySurface } from '../util/surface-gate';

/**
 * Normal-mode `<Tab>` is `<C-i>`, as in Vim and Neovim — except in Obsidian's
 * own table cell editor, where Obsidian's `Tab` moves to the next cell and
 * #136 depends on it. That editor is Obsidian's construct, so its behaviour
 * wins there. The `<Tab>` mapping passes `fromTab` so the jump action can tell
 * it from `<C-i>`, which jumps everywhere.
 *
 * The cell move is Obsidian's: the synthetic key is run through the cell
 * editor's own keymap rather than reimplemented. It is deferred a frame, as
 * the native cell motions in `table-cell-motions.ts` defer theirs, because
 * the move refocuses another cell while the engine is still handling the key.
 */
export function withTableCellTab(jump: ActionFn): ActionFn {
    return (cm, actionArgs, vim) => {
        const view = cm.cm6;
        if (actionArgs.fromTab && classifySurface(view) === 'table-cell') {
            window.requestAnimationFrame(() => {
                if (!view.dom.isConnected) return;
                runScopeHandlers(
                    view,
                    new KeyboardEvent('keydown', {
                        key: 'Tab',
                        code: 'Tab',
                        keyCode: 9,
                    }),
                    'editor',
                );
            });
            return;
        }
        jump(cm, actionArgs, vim);
    };
}
