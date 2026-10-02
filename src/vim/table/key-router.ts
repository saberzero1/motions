import type { EditorView } from '@codemirror/view';
import { normalizeKeyEvent } from '../../workspace/global-mapping-registry';
import { getCmAdapterFromEditorView, getVimApi } from '../vim-api';

let routed = 0;

/** How many keys the router has forwarded to a parent's vim. */
export function getRoutedKeyCount(): number {
    return routed;
}

/**
 * Keys that carry no command and must not reach the parent's vim.
 *
 * A bare modifier produces `normalizeKeyEvent` output like `Shift`, which the
 * fork would treat as the literal `S`, `h`, `i`… sequence of a key name.
 */
const IGNORED_KEYS = new Set([
    'Shift',
    'Control',
    'Alt',
    'Meta',
    'CapsLock',
    'NumLock',
    'ScrollLock',
    'Dead',
    'Unidentified',
]);

/**
 * Sends every key pressed in the nested table editor to the **parent's** vim.
 *
 * One vim state has to own commands, mode, registers, undo and dot-repeat, and
 * it must be the parent's, because the parent holds the real document. The
 * nested editor exists to host focus and a caret inside a block-replaced range,
 * not to be a second editor with its own state.
 *
 * Routing to an **unfocused** parent works: `dd` dispatched through
 * `handleKey` against a blurred parent took `hello\nworld` to `world`
 * (measured). That is what makes the whole arrangement possible.
 *
 * Character input is **not** routable. `handleKey(adapter, 'X')` returns
 * `undefined` and inserts nothing, focused or not — the fork deliberately
 * leaves insert-mode characters to CodeMirror's native input path. So while the
 * parent is in insert mode, unmodified keys are left native to the nested
 * editor and reach the parent as document changes through `sync-up.ts`.
 *
 * `<Esc>` is the exception that must not be left native, and leaving it so is a
 * measured trap rather than a theoretical one: the parent never leaves insert
 * mode, and the `u` and `.` that follow are typed into the document as literal
 * text, which reads as plausible output rather than as an error. Modifier
 * combinations are routed too, since `<C-o>`, `<C-r>` and friends are commands
 * rather than text.
 *
 * Capture phase, because CodeMirror's own handlers are on the same element and
 * must not see the key first. Obsidian's `Keymap` runs earlier still, on
 * `window` capture, and a key it claims never arrives here at all — that is
 * existing documented behaviour, not a gap in this router.
 */
export function installKeyRouter(
    child: EditorView,
    parent: EditorView,
): () => void {
    const onKeyDown = (event: KeyboardEvent) => {
        if (IGNORED_KEYS.has(event.key)) return;
        // Composition is the one case that must stay native: an IME needs the
        // keystrokes it is composing from. Forwarding the commit is deferred.
        if (child.composing) return;

        const vim = getVimApi();
        const adapter = getCmAdapterFromEditorView(parent);
        if (!vim || !adapter) return;

        const modified = event.ctrlKey || event.altKey || event.metaKey;
        const insertMode = adapter.state?.vim?.insertMode === true;
        if (insertMode && !modified && event.key !== 'Escape') return;

        event.preventDefault();
        routed++;
        try {
            vim.handleKey(adapter, normalizeKeyEvent(event));
        } catch (err) {
            console.error('Vim Motions: table key routing failed:', err);
        }
    };

    child.contentDOM.addEventListener('keydown', onKeyDown, true);
    return () =>
        child.contentDOM.removeEventListener('keydown', onKeyDown, true);
}
