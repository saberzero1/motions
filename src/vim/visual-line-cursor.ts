import type { EditorView } from '@codemirror/view';
import { getCmAdapterFromEditorView } from './vim-api';

interface VisualLineState {
    visualMode?: boolean;
    visualLine?: boolean;
    sel?: { head: { line: number; ch: number } } | null;
}

/**
 * Where the cursor of a visual-line selection sits, or `null` outside one.
 *
 * The editor's selection covers whole lines in visual-line mode, so its head
 * is a line boundary rather than the cursor. Vim's own head keeps its column,
 * which is where Neovim draws the cursor, held on the line's last character
 * the way a normal-mode cursor is (#231).
 */
export function visualLineCursorPos(view: EditorView): number | null {
    const vim = getCmAdapterFromEditorView(view)?.state?.vim as
        VisualLineState | undefined;
    const head = vim?.visualMode && vim.visualLine ? vim.sel?.head : null;
    if (!head) return null;
    const doc = view.state.doc;
    const line = doc.line(Math.max(1, Math.min(doc.lines, head.line + 1)));
    return line.from + Math.max(0, Math.min(head.ch, line.length - 1));
}
