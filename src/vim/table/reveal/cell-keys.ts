import {
    EditorSelection,
    Prec,
    type Extension,
    type Line,
    type Text,
} from '@codemirror/state';
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
import { findTableAt, type TableExtent } from './table-extent';

/**
 * Insert-mode keys that move between the cells of a revealed table, the way
 * Obsidian's own table editor moves in Live Preview (measured at 1.13.7):
 *
 * - `Tab` and `Shift-Tab` go to the next and previous cell, wrapping across
 *   rows, and `Tab` in the last cell adds a row.
 * - `Enter` goes to the same column in the next row, and on the last row adds
 *   one.
 * - `Shift-Enter` inserts `<br>`, which is what Obsidian's cell editor writes
 *   for a line break typed in a cell.
 *
 * At the end of a row, with nothing but whitespace after the caret, `Enter`
 * and `Shift-Enter` start a new line as in plain text, so a table can still be
 * typed row by row: once a separator is typed the table is revealed, and the
 * `Enter` that ends it must not drop the caret into a new row's first cell.
 * mkdnflow.nvim makes its `Enter` navigation opt-in for the same reason.
 *
 * Obsidian selects the content of the cell it moves to; here the caret lands
 * at the start of that content instead, as in mkdnflow.nvim, table-nvim and
 * org-mode, because a selection is not an insert-mode state in Vim.
 * `Shift-Tab` in the first cell does nothing, where Obsidian inserts a row
 * above the header.
 *
 * Anything that claims these keys first keeps them: a snippet expanding or
 * walking its tabstops, a completion popup, an insert-mode mapping (Vim sees
 * the key before any keymap), and the Neovim backend, which consumes keys
 * before CodeMirror does.
 */
export function revealCellKeys(): Extension {
    return Prec.high(
        keymap.of([
            {
                key: 'Tab',
                run: (view) => moveToCell(view, 1),
                shift: (view) => moveToCell(view, -1),
            },
            { key: 'Enter', run: moveDown, shift: insertLineBreak },
        ]),
    );
}

interface CellContext {
    doc: Text;
    line: Line;
    table: TableExtent;
    separatorLine: number;
    column: number;
}

/** The caret's table and cell, when one of these keys applies at all. */
function cellContext(view: EditorView): CellContext | null {
    if (getAnyVimAdapter(view)?.state?.vim?.insertMode !== true) return null;
    if (view.composing) return null;
    const { state } = view;
    const range = state.selection.main;
    if (state.selection.ranges.length !== 1 || !range.empty) return null;
    if (!isRevealedAt(state, range.head)) return null;
    const doc = state.doc;
    const line = doc.lineAt(range.head);
    const table = findTableAt(doc, line.number);
    if (!table) return null;
    return {
        doc,
        line,
        table,
        separatorLine: table.fromLine + 1,
        column: range.head - line.from,
    };
}

function rowAfter(ctx: CellContext, n: number): number | null {
    let next = n + 1;
    if (next === ctx.separatorLine) next++;
    return next <= ctx.table.toLine ? next : null;
}

function rowBefore(ctx: CellContext, n: number): number | null {
    let prev = n - 1;
    if (prev === ctx.separatorLine) prev--;
    return prev >= ctx.table.fromLine ? prev : null;
}

/** Put the caret at the start of cell `index` of `lineNo`, clamped. */
function place(
    view: EditorView,
    ctx: CellContext,
    lineNo: number,
    index: 'first' | 'last' | number,
): void {
    const target = ctx.doc.line(lineNo);
    const bounds = cellBounds(target.text);
    const count = bounds.length - 1;
    if (count < 1) return;
    const cell =
        index === 'first'
            ? 0
            : index === 'last'
              ? count - 1
              : Math.min(Math.max(index, 0), count - 1);
    const col = cellTextStart(target.text, bounds, cell);
    view.dispatch({
        selection: EditorSelection.cursor(target.from + col),
        scrollIntoView: true,
        userEvent: 'select',
    });
}

function moveToCell(view: EditorView, direction: 1 | -1): boolean {
    const ctx = cellContext(view);
    if (!ctx) return false;
    const { line, table, separatorLine } = ctx;

    if (line.number === separatorLine) {
        const target =
            direction === 1 ? rowAfter(ctx, line.number) : table.fromLine;
        if (target === null) appendRow(view, table.fromLine, table.toLine, 0);
        else place(view, ctx, target, direction === 1 ? 'first' : 'last');
        return true;
    }

    const bounds = cellBounds(line.text);
    const count = bounds.length - 1;
    const index = cellIndexAt(bounds, ctx.column);

    if (direction === 1) {
        if (index + 1 < count) {
            place(view, ctx, line.number, index + 1);
            return true;
        }
        const next = rowAfter(ctx, line.number);
        if (next !== null) place(view, ctx, next, 'first');
        else appendRow(view, line.number, table.toLine, 0);
        return true;
    }

    if (index - 1 >= 0 && index - 1 < count) {
        place(view, ctx, line.number, Math.min(index - 1, count - 1));
        return true;
    }
    const prev = rowBefore(ctx, line.number);
    if (prev !== null) place(view, ctx, prev, 'last');
    return true;
}

/** Whether only whitespace follows the caret on its line. */
function atRowEnd(ctx: CellContext): boolean {
    return ctx.line.text.slice(ctx.column).trim() === '';
}

function moveDown(view: EditorView): boolean {
    const ctx = cellContext(view);
    if (!ctx || atRowEnd(ctx)) return false;
    const { line, table, separatorLine } = ctx;
    const bounds = cellBounds(line.text);
    const count = bounds.length - 1;
    const index = Math.min(
        Math.max(cellIndexAt(bounds, ctx.column), 0),
        Math.max(count - 1, 0),
    );
    const next = rowAfter(ctx, line.number);
    if (next !== null) {
        place(view, ctx, next, index);
    } else {
        const template =
            line.number === separatorLine ? table.fromLine : line.number;
        appendRow(view, template, table.toLine, index);
    }
    return true;
}

function insertLineBreak(view: EditorView): boolean {
    const ctx = cellContext(view);
    if (!ctx || atRowEnd(ctx)) return false;
    // A line break has no place in the separator; swallowing the key keeps
    // the default newline from splitting it.
    if (ctx.line.number === ctx.separatorLine) return true;
    const at = ctx.line.from + ctx.column;
    view.dispatch({
        changes: { from: at, insert: '<br>' },
        selection: EditorSelection.cursor(at + 4),
        userEvent: 'input.type',
    });
    return true;
}

/**
 * Add an empty row after `afterLine`, with its pipes where `templateLine` has
 * them and any blockquote markers kept, and put the caret in cell `column`.
 */
function appendRow(
    view: EditorView,
    templateLine: number,
    afterLine: number,
    column: number,
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
    const count = bounds.length - 1;
    if (count < 1) return;
    const at = doc.line(afterLine).to;
    const cell = Math.min(Math.max(column, 0), count - 1);
    const col = cellTextStart(row, bounds, cell);
    view.dispatch({
        changes: { from: at, insert: '\n' + row },
        selection: EditorSelection.cursor(at + 1 + col),
        scrollIntoView: true,
        userEvent: 'input.type',
    });
}
