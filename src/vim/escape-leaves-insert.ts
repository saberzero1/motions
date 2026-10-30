import type { App, Component } from 'obsidian';
import { EditorView } from '@codemirror/view';
import { Vim } from '@replit/codemirror-vim';
import { getCmAdapterFromEditorView } from './vim-api';

/**
 * Escape leaves insert mode even when an Obsidian popup took it first (#196).
 *
 * Neovim closes its completion menu and leaves insert mode on one `<Esc>`
 * (measured on 0.12.5: `A`, `<C-n>`, `<Esc>` ends in normal mode with the
 * selected word kept). Obsidian's link suggestions, and any other popup that
 * registers Escape on its keymap scope, handle the key on `window` in the
 * capture phase and stop it there, so the engine never saw it: the first
 * Escape only closed the menu, and a user `imap <Esc>` could not help.
 *
 * Registered after Obsidian's keymap, this listener sees the same event with
 * `defaultPrevented` already set, which is the sign that Obsidian took the
 * key; a plain Escape reaches it unhandled. The exit runs after the event
 * has finished, and only if the editor is still in insert mode, so a key the
 * engine did see is never handled twice. `Vim.handleKey` keeps user `<Esc>`
 * mappings in play, as Neovim's `<Esc>` would.
 */
export function installEscapeLeavesInsert(
    app: App,
    owner: Component,
    enabled: () => boolean,
): void {
    const onKeydown = (e: KeyboardEvent): void => {
        if (e.key !== 'Escape' || !e.defaultPrevented || !enabled()) return;
        if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
        const target = e.target instanceof Element ? e.target : null;
        const editorEl = target?.closest<HTMLElement>('.cm-editor');
        const view = editorEl ? EditorView.findFromDOM(editorEl) : null;
        const cm = view ? getCmAdapterFromEditorView(view) : null;
        if (!cm?.state.vim?.insertMode) return;
        window.setTimeout(() => {
            if (cm.state.vim?.insertMode) {
                Vim.handleKey(cm as never, '<Esc>', 'user');
            }
        }, 0);
    };
    owner.registerDomEvent(window, 'keydown', onKeydown, true);
    // A pop-out window has its own keymap listener. Whether this one lands
    // after it is not guaranteed; if it does not, the first Escape there
    // only closes the popup, as before.
    owner.registerEvent(
        app.workspace.on('window-open', (win) => {
            owner.registerDomEvent(win.win, 'keydown', onKeydown, true);
        }),
    );
}
