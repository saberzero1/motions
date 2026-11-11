import { runScopeHandlers } from '@codemirror/view';
import type { EditorView } from '@codemirror/view';
import type { ActionArgs, ActionFn, CmAdapter } from '../types/vim-api';
import { classifySurface } from '../util/surface-gate';
import { getBundledVimApi } from './bundled-vim';

/**
 * Run `Tab` or `Shift-Tab` through the editor's own keymap, as it would have
 * run had the engine not taken the key. It is deferred a frame, as the native
 * cell motions in `table-cell-motions.ts` defer theirs, because in a table
 * cell editor the move refocuses another cell while the engine is still
 * handling the key.
 */
function handBack(view: EditorView, shift: boolean): void {
    window.requestAnimationFrame(() => {
        if (!view.dom.isConnected) return;
        runScopeHandlers(
            view,
            new KeyboardEvent('keydown', {
                key: 'Tab',
                code: 'Tab',
                keyCode: 9,
                shiftKey: shift,
            }),
            'editor',
        );
    });
}

/** `>>` or `<<` with the count typed before the key, as `3>>` would. */
function shiftLines(cm: CmAdapter, args: ActionArgs, keys: string): void {
    const count = args.repeatIsExplicit && args.repeat > 1 ? args.repeat : '';
    getBundledVimApi().feedKeys?.(cm, `${count}${keys}`, { noremap: true });
}

/**
 * Normal-mode `<Tab>` is `<C-i>`, as in Vim and Neovim — except in Obsidian's
 * own table cell editor, where Obsidian's `Tab` moves to the next cell and
 * #136 depends on it. That editor is Obsidian's construct, so its behaviour
 * wins there. The `<Tab>` mapping passes `fromTab` so the jump action can tell
 * it from `<C-i>`, which jumps everywhere.
 *
 * With `tabindent` on (#237), `<Tab>` is `>>` instead, and still moves to the
 * next cell in a table cell editor; `<C-i>` keeps jumping.
 */
export function withTableCellTab(
    jump: ActionFn,
    tabIndent: () => boolean,
): ActionFn {
    return (cm, actionArgs, vim) => {
        if (actionArgs.fromTab) {
            const view = cm.cm6;
            if (classifySurface(view) === 'table-cell') {
                handBack(view, false);
                return;
            }
            if (tabIndent()) {
                shiftLines(cm, actionArgs, '>>');
                return;
            }
        }
        jump(cm, actionArgs, vim);
    };
}

/**
 * Normal-mode `<S-Tab>`. Vim and Neovim give it no meaning, and the engine
 * used to let it through to Obsidian, which outdents the line; with
 * `tabindent` off that is still what it does, by handing the key back to the
 * editor's keymap. With `tabindent` on it is `<<`. In a table cell editor it
 * always moves to the previous cell, as Obsidian's `Shift-Tab` does there.
 */
export function createShiftTabAction(tabIndent: () => boolean): ActionFn {
    return (cm, actionArgs) => {
        const view = cm.cm6;
        if (tabIndent() && classifySurface(view) !== 'table-cell') {
            shiftLines(cm, actionArgs, '<<');
            return;
        }
        handBack(view, true);
    };
}
