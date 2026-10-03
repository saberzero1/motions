import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { snapOutOfDelimiter } from './layout-model';

const SURFACE_SELECTOR = '.vim-motions-table-surface';
const NESTED_SELECTOR = '.vim-motions-table-nested';
const ROW_SELECTOR = '.vim-motions-table-surface-row';

/**
 * The character offset of a point within a row, by hit-testing the text.
 *
 * Measured from the row's own text nodes rather than from the monospace
 * advance width. The grid is monospace and dividing by a measured cell width
 * would mostly work, but it reintroduces the font-metric question the
 * typography work already settled, and it is wrong on a row containing any
 * glyph whose advance differs — a CJK cell, an emoji, a ligature if a theme
 * re-enables them.
 */
function charIndexFromPoint(
    row: HTMLElement,
    x: number,
    y: number,
    lineLength: number,
): number {
    const doc = row.ownerDocument;
    // Typed by the DOM lib but marked deprecated, and absent on hosts that
    // only implement the `caretPositionFromPoint` successor, so guarded.
    const caret =
        typeof doc.caretRangeFromPoint === 'function'
            ? doc.caretRangeFromPoint(x, y)
            : null;
    // No hit test available, or a click past the end of the text: the end of
    // the line is where a click to the right of a line lands in any editor.
    if (!caret) return lineLength;

    let seen = 0;
    const walker = doc.createTreeWalker(row, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node !== null) {
        const length = (node.textContent ?? '').length;
        if (node === caret.startContainer) {
            return Math.min(seen + caret.startOffset, lineLength);
        }
        seen += length;
        node = walker.nextNode();
    }
    // The hit landed on an element rather than a text node — a gap between
    // spans, or the row's own padding.
    return Math.min(seen, lineLength);
}

/**
 * Places the cursor when the passive table grid is clicked.
 *
 * Without this, clicking a table the cursor is not already inside does
 * **nothing**: measured with a real pointer event, the parent's head stayed at
 * 0 and no nested editor mounted. The grid is a block-replace widget, and
 * `TableSurfaceWidget` deliberately does not override `ignoreEvent` — making
 * it return `false` was measured to stop every key reaching the editor — so
 * CodeMirror never maps a click on it to a document position.
 *
 * The earlier click work covered the *other* surface. `table-click-and-
 * clipboard.e2e.ts` moves the cursor into the table programmatically first,
 * which mounts the nested editor, and then clicks inside that editor, where
 * CodeMirror resolves the position itself and `selectionUpExtension` carries
 * it to the parent. That is cell-to-cell movement within a table already being
 * edited, and it never exercised entering one.
 *
 * The position is resolved from the DOM rather than from the state field:
 * `posAtDOM` on the widget's root gives the replaced range's start, and each
 * row element already carries its own line text in `dataset.vimMotionsRow`,
 * which `paintRow` maintains as its repaint guard. Reading those avoids
 * re-deriving the table's geometry from a second source that could disagree
 * with what is on screen.
 */
export function createTableSurfaceClick(): Extension {
    return EditorView.domEventHandlers({
        mousedown: (event, view) => {
            if (event.button !== 0) return false;
            const target = event.target;
            if (!(target instanceof HTMLElement)) return false;

            // The nested editor resolves its own clicks, and its rows are the
            // same classes as the passive grid's.
            if (target.closest(NESTED_SELECTOR) !== null) return false;

            const root = target.closest(SURFACE_SELECTOR);
            if (!(root instanceof HTMLElement)) return false;
            const row = target.closest(ROW_SELECTOR);
            if (!(row instanceof HTMLElement)) return false;
            const container = row.parentElement;
            if (!container) return false;

            const rowEls = Array.from(container.children).filter(
                (el): el is HTMLElement => el instanceof HTMLElement,
            );
            const rowIndex = rowEls.indexOf(row);
            if (rowIndex < 0) return false;

            const lines = rowEls.map(
                (el) => el.dataset['vimMotionsRow'] ?? el.textContent ?? '',
            );
            const line = lines[rowIndex] ?? '';

            const tableFrom = view.posAtDOM(root);
            const charIndex = charIndexFromPoint(
                row,
                event.clientX,
                event.clientY,
                line.length,
            );
            const withinTable =
                lines
                    .slice(0, rowIndex)
                    .reduce((sum, text) => sum + text.length + 1, 0) +
                charIndex;

            const target_ = tableFrom + snapOutOfDelimiter(lines, withinTable);
            if (target_ < 0 || target_ > view.state.doc.length) return false;

            // Claimed, so the browser does not also start a selection drag
            // over a widget whose text is not the document's.
            event.preventDefault();
            view.dispatch({ selection: { anchor: target_ } });
            // The parent must hold focus before the host's reconcile runs: it
            // mounts the nested editor for a cursor inside a table and hands
            // focus to it, and a click that left focus on `<body>` would leave
            // the table rendered but dead to the keyboard.
            view.focus();
            return true;
        },
    });
}
