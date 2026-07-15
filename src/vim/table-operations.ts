import type { EditorView } from '@codemirror/view';
import type { TableRange } from './table-utils';
import { SEPARATOR_RE, splitCellsEscapeAware } from './table-utils';

function buildRow(cells: string[]): string {
    return `| ${cells.join(' | ')} |`;
}

function getColCount(table: TableRange): number {
    return splitCellsEscapeAware(table.lines[0] ?? '').length;
}

function lineFrom(view: EditorView, table: TableRange, row: number): number {
    const firstLine = view.state.doc.lineAt(table.from).number;
    return view.state.doc.line(firstLine + row).from;
}

function lineTo(view: EditorView, table: TableRange, row: number): number {
    const firstLine = view.state.doc.lineAt(table.from).number;
    return view.state.doc.line(firstLine + row).to;
}

function firstDataRowIndex(table: TableRange): number {
    for (let i = 1; i < table.lines.length; i++) {
        if (!SEPARATOR_RE.test(table.lines[i] ?? '')) return i;
    }
    return table.lines.length;
}

function clampToDataRow(table: TableRange, row: number): number {
    if (row <= 0 || SEPARATOR_RE.test(table.lines[row] ?? '')) {
        return firstDataRowIndex(table);
    }
    return row;
}

export function tableAddRowAfter(
    view: EditorView,
    table: TableRange,
    row: number,
): void {
    const targetRow = clampToDataRow(table, row);
    const colCount = getColCount(table);
    const emptyCells = Array.from({ length: colCount }, () => '   ');
    const newRow = buildRow(emptyCells);
    const insertAfter = Math.min(targetRow, table.lines.length - 1);
    const insertPos = lineTo(view, table, insertAfter);
    view.dispatch({
        changes: { from: insertPos, to: insertPos, insert: '\n' + newRow },
    });
}

export function tableAddRowBefore(
    view: EditorView,
    table: TableRange,
    row: number,
): void {
    const targetRow = clampToDataRow(table, row);
    const colCount = getColCount(table);
    const emptyCells = Array.from({ length: colCount }, () => '   ');
    const newRow = buildRow(emptyCells);
    const insertPos = lineFrom(view, table, targetRow);
    view.dispatch({
        changes: { from: insertPos, to: insertPos, insert: newRow + '\n' },
    });
}

export function tableDeleteRow(
    view: EditorView,
    table: TableRange,
    row: number,
): void {
    if (row <= 0 || SEPARATOR_RE.test(table.lines[row] ?? '')) return;
    const dataCount = table.lines.filter(
        (l, i) => i > 0 && !SEPARATOR_RE.test(l),
    ).length;
    if (dataCount <= 1) return;
    const from = lineFrom(view, table, row);
    const to = lineTo(view, table, row);
    const doc = view.state.doc;
    if (to < doc.length) {
        view.dispatch({ changes: { from, to: to + 1 } });
    } else if (from > 0) {
        view.dispatch({ changes: { from: from - 1, to } });
    }
}

export function tableMoveRowDown(
    view: EditorView,
    table: TableRange,
    row: number,
): void {
    if (row <= 0 || SEPARATOR_RE.test(table.lines[row] ?? '')) return;
    if (row >= table.lines.length - 1) return;
    const nextRow = row + 1;
    if (SEPARATOR_RE.test(table.lines[nextRow] ?? '')) return;
    const fromA = lineFrom(view, table, row);
    const toA = lineTo(view, table, row);
    const fromB = lineFrom(view, table, nextRow);
    const toB = lineTo(view, table, nextRow);
    const textA = view.state.doc.sliceString(fromA, toA);
    const textB = view.state.doc.sliceString(fromB, toB);
    view.dispatch({
        changes: [
            { from: fromB, to: toB, insert: textA },
            { from: fromA, to: toA, insert: textB },
        ],
    });
}

export function tableMoveRowUp(
    view: EditorView,
    table: TableRange,
    row: number,
): void {
    if (row <= 0 || SEPARATOR_RE.test(table.lines[row] ?? '')) return;
    const prevRow = row - 1;
    if (SEPARATOR_RE.test(table.lines[prevRow] ?? '')) return;
    tableMoveRowDown(view, table, prevRow);
}

export function tableAddColAfter(
    view: EditorView,
    table: TableRange,
    col: number,
): void {
    const firstLine = view.state.doc.lineAt(table.from).number;
    const changes: { from: number; to: number; insert: string }[] = [];
    for (let i = 0; i < table.lines.length; i++) {
        const line = view.state.doc.line(firstLine + i);
        const cells = splitCellsEscapeAware(line.text);
        const isSep = SEPARATOR_RE.test(line.text);
        const newCell = isSep ? ' --- ' : '     ';
        cells.splice(col + 1, 0, newCell);
        changes.push({ from: line.from, to: line.to, insert: buildRow(cells) });
    }
    view.dispatch({ changes });
}

export function tableAddColBefore(
    view: EditorView,
    table: TableRange,
    col: number,
): void {
    const firstLine = view.state.doc.lineAt(table.from).number;
    const changes: { from: number; to: number; insert: string }[] = [];
    for (let i = 0; i < table.lines.length; i++) {
        const line = view.state.doc.line(firstLine + i);
        const cells = splitCellsEscapeAware(line.text);
        const isSep = SEPARATOR_RE.test(line.text);
        const newCell = isSep ? ' --- ' : '     ';
        cells.splice(col, 0, newCell);
        changes.push({ from: line.from, to: line.to, insert: buildRow(cells) });
    }
    view.dispatch({ changes });
}

export function tableDeleteCol(
    view: EditorView,
    table: TableRange,
    col: number,
): void {
    const colCount = getColCount(table);
    if (colCount <= 1) return;
    const firstLine = view.state.doc.lineAt(table.from).number;
    const changes: { from: number; to: number; insert: string }[] = [];
    for (let i = 0; i < table.lines.length; i++) {
        const line = view.state.doc.line(firstLine + i);
        const cells = splitCellsEscapeAware(line.text);
        cells.splice(col, 1);
        changes.push({ from: line.from, to: line.to, insert: buildRow(cells) });
    }
    view.dispatch({ changes });
}

export function tableMoveColRight(
    view: EditorView,
    table: TableRange,
    col: number,
): void {
    const colCount = getColCount(table);
    if (col >= colCount - 1) return;
    const firstLine = view.state.doc.lineAt(table.from).number;
    const changes: { from: number; to: number; insert: string }[] = [];
    for (let i = 0; i < table.lines.length; i++) {
        const line = view.state.doc.line(firstLine + i);
        const cells = splitCellsEscapeAware(line.text);
        const temp = cells[col] ?? '';
        cells[col] = cells[col + 1] ?? '';
        cells[col + 1] = temp;
        changes.push({ from: line.from, to: line.to, insert: buildRow(cells) });
    }
    view.dispatch({ changes });
}

export function tableMoveColLeft(
    view: EditorView,
    table: TableRange,
    col: number,
): void {
    if (col <= 0) return;
    tableMoveColRight(view, table, col - 1);
}

export function tableRealign(view: EditorView, table: TableRange): void {
    const rows: string[][] = [];
    let sepIdx = -1;
    type Align = 'left' | 'center' | 'right' | 'none';
    let alignments: Align[] = [];

    for (let i = 0; i < table.lines.length; i++) {
        const text = table.lines[i] ?? '';
        if (SEPARATOR_RE.test(text)) {
            sepIdx = i;
            alignments = splitCellsEscapeAware(text).map((cell) => {
                const t = cell.trim();
                const l = t.startsWith(':');
                const r = t.endsWith(':');
                if (l && r) return 'center';
                if (r) return 'right';
                if (l) return 'left';
                return 'none';
            });
            rows.push([]);
        } else {
            rows.push(splitCellsEscapeAware(text).map((c) => c.trim()));
        }
    }

    const colCount = Math.max(...rows.map((r) => r.length));
    if (colCount <= 0) return;

    const colWidths = Array.from({ length: colCount }, () => 3);
    for (const row of rows) {
        for (let c = 0; c < row.length; c++) {
            if ((row[c]?.length ?? 0) > (colWidths[c] ?? 0)) {
                colWidths[c] = row[c]!.length;
            }
        }
    }
    while (alignments.length < colCount) alignments.push('none');

    const newLines = rows.map((row, i) => {
        if (i === sepIdx) {
            const cells = colWidths.map((w, c) => {
                const a = alignments[c] ?? 'none';
                const d = '-'.repeat(Math.max(w, 3));
                if (a === 'left') return `:${d.slice(1)}`;
                if (a === 'right') return `${d.slice(1)}:`;
                if (a === 'center') return `:${d.slice(2)}:`;
                return d;
            });
            return `| ${cells.join(' | ')} |`;
        }
        const cells = colWidths.map((w, c) => (row[c] ?? '').padEnd(w));
        return `| ${cells.join(' | ')} |`;
    });

    const newText = newLines.join('\n');
    if (newText === table.lines.join('\n')) return;
    view.dispatch({
        changes: { from: table.from, to: table.to, insert: newText },
    });
}
