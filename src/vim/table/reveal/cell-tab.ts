import { EditorSelection, Prec, type Extension } from '@codemirror/state';
import { keymap, type EditorView } from '@codemirror/view';
import { getAnyVimAdapter } from '../../vim-api';
import { findUnescapedPipes } from '../../table-utils';
import {
    cellBounds,
    cellIndexAt,
    cellTextStart,
    rowPrefixLength,
} from './cells';
import { isRevealedAt } from './reveal-field';
import { findTableAt } from './table-extent';

/**
 * Insert-mode `Tab` and `Shift-Tab` in a revealed table move to the next and
 * previous cell, wrapping across rows, and `Tab` in the last cell adds a row.
 *
 * Obsidian's own table editor does the same in Live Preview, measured at
 * 1.13.7, except that it selects the content of the cell it moves to; here
 * the caret lands at the start of that content instead, as it does in
 * mkdnflow.nvim, table-nvim and org-mode, because a selection is not an
 * insert-mode state in Vim. `Shift-Tab` in the first cell does nothing,
 * where Obsidian inserts a row above the header.
 *
 * Anything that claims `Tab` first keeps it: a snippet expanding or walking
 * its tabstops, an insert-mode mapping (Vim sees the key before any keymap),
 * and the Neovim backend, which consumes keys before CodeMirror does.
 */
export function revealCellTab(): Extension {
    return Prec.high(
        keymap.of([
            {
                key: 'Tab',
                run: (view) => moveToCell(view, 1),
                shift: (view) => moveToCell(view, -1),
            },
        ]),
    );
}

function moveToCell(view: EditorView, direction: 1 | -1): boolean {
    if (getAnyVimAdapter(view)?.state?.vim?.insertMode !== true) {
        return false;
    }
    const { state } = view;
    const range = state.selection.main;
    if (state.selection.ranges.length !== 1 || !range.empty) return false;
    if (!isRevealedAt(state, range.head)) return false;

    const doc = state.doc;
    const line = doc.lineAt(range.head);
    const table = findTableAt(doc, line.number);
    if (!table) return false;
    const separatorLine = table.fromLine + 1;

    const place = (lineNo: number, index: 'first' | 'last' | number): void => {
        const target = doc.line(lineNo);
        const bounds = cellBounds(target.text);
        const count = bounds.length - 1;
        if (count < 1) return;
        const cell =
            index === 'first' ? 0 : index === 'last' ? count - 1 : index;
        const col = cellTextStart(target.text, bounds, cell);
        view.dispatch({
            selection: EditorSelection.cursor(target.from + col),
            scrollIntoView: true,
            userEvent: 'select',
        });
    };

    const rowAfter = (n: number): number | null => {
        let next = n + 1;
        if (next === separatorLine) next++;
        return next <= table.toLine ? next : null;
    };
    const rowBefore = (n: number): number | null => {
        let prev = n - 1;
        if (prev === separatorLine) prev--;
        return prev >= table.fromLine ? prev : null;
    };

    if (line.number === separatorLine) {
        const target = direction === 1 ? rowAfter(line.number) : table.fromLine;
        if (target === null) appendRow(view, table.fromLine, table.toLine);
        else place(target, direction === 1 ? 'first' : 'last');
        return true;
    }

    const bounds = cellBounds(line.text);
    const count = bounds.length - 1;
    const index = cellIndexAt(bounds, range.head - line.from);

    if (direction === 1) {
        if (index + 1 < count) {
            place(line.number, index + 1);
            return true;
        }
        const next = rowAfter(line.number);
        if (next !== null) place(next, 'first');
        else appendRow(view, line.number, table.toLine);
        return true;
    }

    if (index - 1 >= 0 && index - 1 < count) {
        place(line.number, Math.min(index - 1, count - 1));
        return true;
    }
    const prev = rowBefore(line.number);
    if (prev !== null) place(prev, 'last');
    return true;
}

/**
 * Add an empty row after `afterLine`, with its pipes where `templateLine` has
 * them and any blockquote markers kept, and put the caret in its first cell.
 */
function appendRow(
    view: EditorView,
    templateLine: number,
    afterLine: number,
): void {
    const doc = view.state.doc;
    const template = doc.line(templateLine).text;
    const prefix = rowPrefixLength(template);
    const chars = Array.from(template.slice(prefix), () => ' ');
    for (const p of findUnescapedPipes(template)) {
        if (p >= prefix) chars[p - prefix] = '|';
    }
    const row = template.slice(0, prefix) + chars.join('').trimEnd();
    const bounds = cellBounds(row);
    if (bounds.length < 2) return;
    const at = doc.line(afterLine).to;
    const col = cellTextStart(row, bounds, 0);
    view.dispatch({
        changes: { from: at, insert: '\n' + row },
        selection: EditorSelection.cursor(at + 1 + col),
        scrollIntoView: true,
        userEvent: 'input.type',
    });
}
