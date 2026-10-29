import { EditorSelection, type Extension, type Text } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { cellBounds, rowPrefixLength } from './cells';
import { isRevealedAt } from './reveal-field';
import { findTableAt } from './table-extent';

/**
 * Two things typing a `|` does in reveal mode that plain text would not.
 *
 * A `|` inside an unclosed `[[` on a revealed row is written as `\|`, so a
 * wikilink alias or an embed size stays inside its cell. Obsidian's own cell
 * editor escapes every pipe typed in a cell; a revealed table cannot, because
 * there a typed pipe is how a new column is made, so only the pipes a
 * wikilink claims are escaped.
 *
 * `||` typed as the whole of the line below a table header that has no
 * separator yet becomes that separator, one column per header cell, sized to
 * the header's cells. This is vim-table-mode's `||`, and the shortcut this
 * plugin had before it moved to Obsidian's table editor. It is limited to a
 * header without a separator, so `||` typed as a row of an existing table
 * stays a row.
 */
export function revealTypingAssists(): Extension {
    return EditorView.inputHandler.of((view, from, to, text) => {
        if (text !== '|' || from !== to) return false;
        return generateSeparator(view, from) || escapeWikilinkPipe(view, from);
    });
}

function escapeWikilinkPipe(view: EditorView, pos: number): boolean {
    const { state } = view;
    if (!isRevealedAt(state, pos)) return false;
    const line = state.doc.lineAt(pos);
    if (!findTableAt(state.doc, line.number)) return false;
    const before = line.text.slice(0, pos - line.from);
    if (before.lastIndexOf('[[') <= before.lastIndexOf(']]')) return false;
    // A pipe the user escaped already stays as typed.
    let backslashes = 0;
    for (let i = before.length - 1; i >= 0 && before[i] === '\\'; i--) {
        backslashes++;
    }
    if (backslashes % 2 === 1) return false;
    view.dispatch({
        changes: { from: pos, insert: '\\|' },
        selection: EditorSelection.cursor(pos + 2),
        userEvent: 'input.type',
    });
    return true;
}

function generateSeparator(view: EditorView, pos: number): boolean {
    const doc = view.state.doc;
    const line = doc.lineAt(pos);
    if (line.number < 2) return false;
    const prefix = rowPrefixLength(line.text);
    const before = line.text.slice(0, pos - line.from);
    const after = line.text.slice(pos - line.from);
    if (before.slice(prefix).trim() !== '|' || after.trim() !== '') {
        return false;
    }
    const header = doc.line(line.number - 1);
    if (!isHeaderWithoutSeparator(doc, header.number)) return false;

    const bounds = cellBounds(header.text);
    if (bounds.length < 2) return false;
    const cells: string[] = [];
    for (let i = 0; i < bounds.length - 1; i++) {
        const inner = (bounds[i + 1] ?? 0) - (bounds[i] ?? 0) - 1;
        cells.push('-'.repeat(Math.max(3, inner - 2)));
    }
    const separator = line.text.slice(0, prefix) + `| ${cells.join(' | ')} |`;
    view.dispatch({
        changes: { from: line.from, to: line.to, insert: separator },
        selection: EditorSelection.cursor(line.from + separator.length),
        userEvent: 'input.type',
    });
    return true;
}

/**
 * Whether `lineNo` is the first line of a run of pipe rows that no table has
 * claimed yet: it has cells, it is not part of a table with a separator, and
 * the line above it is not a row.
 */
function isHeaderWithoutSeparator(doc: Text, lineNo: number): boolean {
    const text = doc.line(lineNo).text;
    if (cellBounds(text).length < 2 || !text.includes('|')) return false;
    if (findTableAt(doc, lineNo)) return false;
    if (lineNo === 1) return true;
    const above = doc.line(lineNo - 1).text;
    return !above.slice(rowPrefixLength(above)).includes('|');
}
