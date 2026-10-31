import type { App, Component } from 'obsidian';
import { EditorView } from '@codemirror/view';
import { isKeyInterceptActive } from '@replit/codemirror-vim';
import type { VimState } from '../types/vim-api';
import { getImageController } from './image-embed';
import { getCmAdapterFromEditorView } from './vim-api';

const FORWARD: Record<string, boolean> = {
    l: true,
    ArrowRight: true,
    h: false,
    ArrowLeft: false,
};

/**
 * Idle normal mode, as Obsidian's adapter tests it before a key reaches its
 * engine: no count, operator or pending key. A count therefore still moves
 * past an image, and `dl` still deletes.
 */
function isIdleNormal(vim: VimState): boolean {
    if (vim.insertMode || vim.visualMode || vim.expectLiteralNext) return false;
    const input = vim.inputState;
    const prefix = input?.prefixRepeat;
    return (
        !input?.operator &&
        !(Array.isArray(prefix) && prefix.length > 0) &&
        !(input?.keyBuffer && input.keyBuffer.length > 0) &&
        !(vim as { surroundState?: unknown }).surroundState
    );
}

/**
 * `h` and `l` select an image the cursor reaches, and leave it, as they do
 * under Obsidian 1.13's own Vim (#218). A selected image shows Obsidian's
 * accent outline and its buttons, and `:image` acts on it. This deviates from
 * Neovim on purpose: an embed is Obsidian syntax, rendered as one object.
 *
 * Obsidian makes the check in its adapter before the engine sees the key, so
 * it applies to the physical key and ahead of any mapping. This listener is
 * the same seam: on `window` in the capture phase, ahead of the editor's own
 * listeners, and it stops only a key it used.
 */
export function installImageSelectKeys(app: App, owner: Component): void {
    const onKeydown = (e: KeyboardEvent): void => {
        if (e.defaultPrevented || e.isComposing) return;
        if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
        const forward = FORWARD[e.key];
        if (forward === undefined || isKeyInterceptActive()) return;
        const target = e.target instanceof Element ? e.target : null;
        const editorEl = target?.closest<HTMLElement>('.cm-editor');
        const view = editorEl ? EditorView.findFromDOM(editorEl) : null;
        const vim = view ? getCmAdapterFromEditorView(view)?.state.vim : null;
        if (!view || !vim || !isIdleNormal(vim)) return;
        if (!getImageController(view)?.enterOrExitImage(forward)) return;
        e.preventDefault();
        e.stopPropagation();
    };
    owner.registerDomEvent(window, 'keydown', onKeydown, true);
    owner.registerEvent(
        app.workspace.on('window-open', (win) => {
            owner.registerDomEvent(win.win, 'keydown', onKeydown, true);
        }),
    );
}
