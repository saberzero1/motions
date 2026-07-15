import type { EditorState } from '@codemirror/state';

export const TABLE_RE = /^\s*\|/;
export const SEPARATOR_RE = /^\s*\|[\s:]*-+[\s:|-]*\|\s*$/;

export interface TableRange {
    from: number;
    to: number;
    lines: string[];
}

/**
 * Scan the document for contiguous blocks of table lines (lines starting
 * with `|`).  Only blocks with 2+ lines are returned.
 */
export function findTableRanges(state: EditorState): TableRange[] {
    const doc = state.doc;
    const ranges: TableRange[] = [];
    let i = 1;
    while (i <= doc.lines) {
        const line = doc.line(i);
        if (!TABLE_RE.test(line.text)) {
            i++;
            continue;
        }
        const start = i;
        const lines: string[] = [line.text];
        i++;
        while (i <= doc.lines) {
            const next = doc.line(i);
            if (!TABLE_RE.test(next.text)) break;
            lines.push(next.text);
            i++;
        }
        if (lines.length >= 2) {
            ranges.push({
                from: doc.line(start).from,
                to: doc.line(start + lines.length - 1).to,
                lines,
            });
        }
    }
    return ranges;
}

export function cursorInRange(
    state: EditorState,
    from: number,
    to: number,
): boolean {
    return state.selection.ranges.some((r) => r.from <= to && r.to >= from);
}

/**
 * Count consecutive backslashes immediately before position `i` in `line`.
 */
function countPrecedingBackslashes(line: string, i: number): number {
    let count = 0;
    let j = i - 1;
    while (j >= 0 && line[j] === '\\') {
        count++;
        j--;
    }
    return count;
}

/**
 * Find positions of unescaped pipe characters in a line.
 * A pipe is escaped if preceded by an odd number of backslashes.
 * Returns array of 0-based indices of real pipe delimiters.
 */
export function findUnescapedPipes(line: string): number[] {
    const positions: number[] = [];
    for (let i = 0; i < line.length; i++) {
        if (line[i] === '|') {
            const backslashes = countPrecedingBackslashes(line, i);
            if (backslashes % 2 === 0) {
                // Even number of backslashes (including 0) = pipe is NOT escaped
                positions.push(i);
            }
        }
    }
    return positions;
}

/**
 * Split a table row into cells, respecting escaped pipes (\|).
 * Handles \\| (escaped backslash + real pipe) via parity check.
 * Returns the array of cell contents (excluding leading/trailing empty segments).
 */
export function splitCellsEscapeAware(line: string): string[] {
    const pipes = findUnescapedPipes(line);
    if (pipes.length < 2) return [];
    const cells: string[] = [];
    for (let i = 0; i < pipes.length - 1; i++) {
        const from = pipes[i];
        const to = pipes[i + 1];
        if (from !== undefined && to !== undefined) {
            cells.push(line.substring(from + 1, to));
        }
    }
    return cells;
}

function findCellBoundariesLocal(line: string): number[] {
    return findUnescapedPipes(line);
}

export type Alignment = 'left' | 'center' | 'right' | 'none';

export function parseAlignments(line: string): Alignment[] {
    return splitCellsEscapeAware(line).map((cell) => {
        const t = cell.trim();
        const l = t.startsWith(':');
        const r = t.endsWith(':');
        if (l && r) return 'center';
        if (r) return 'right';
        if (l) return 'left';
        return 'none';
    });
}

export function buildSepCell(width: number, align: Alignment): string {
    const d = '-'.repeat(Math.max(width, 3));
    switch (align) {
        case 'left':
            return `:${d.slice(1)}`;
        case 'right':
            return `${d.slice(1)}:`;
        case 'center':
            return `:${d.slice(2)}:`;
        default:
            return d;
    }
}

/**
 * Realign a table given its lines as strings.
 * Pure function: takes `string[]`, returns `string[]`.
 */
export function realignTableLines(lines: string[]): string[] {
    const rows: string[][] = [];
    let sepIdx = -1;
    let alignments: Alignment[] = [];

    for (let i = 0; i < lines.length; i++) {
        const text = lines[i];
        if (text === undefined) continue;
        if (SEPARATOR_RE.test(text)) {
            sepIdx = i;
            alignments = parseAlignments(text);
            rows.push([]);
        } else {
            rows.push(splitCellsEscapeAware(text).map((c) => c.trim()));
        }
    }

    const colCount = Math.max(...rows.map((r) => r.length));
    if (colCount <= 0) return lines;

    const colWidths: number[] = Array.from({ length: colCount }, () => 3);
    for (const row of rows) {
        for (let col = 0; col < row.length; col++) {
            const cell = row[col];
            if (cell !== undefined && cell.length > (colWidths[col] ?? 0)) {
                colWidths[col] = cell.length;
            }
        }
    }

    while (alignments.length < colCount) alignments.push('none');

    return rows.map((row, i) => {
        if (i === sepIdx) {
            const cells = colWidths.map((w, col) =>
                buildSepCell(w, alignments[col] ?? 'none'),
            );
            return `| ${cells.join(' | ')} |`;
        }
        const cells = colWidths.map((w, col) => (row[col] ?? '').padEnd(w));
        return `| ${cells.join(' | ')} |`;
    });
}

/**
 * Find the bounds (start/end line numbers) of the table containing `lineNum`.
 * Works on CM6 doc-like objects with `.line(n)` and `.lines`.
 */
export function findTableBounds(
    doc: { line(n: number): { text: string }; lines: number },
    lineNum: number,
): { start: number; end: number } | null {
    const lineObj = doc.line(lineNum);
    if (!TABLE_RE.test(lineObj.text)) return null;

    let start = lineNum;
    while (start > 1 && TABLE_RE.test(doc.line(start - 1).text)) start--;

    let end = lineNum;
    while (end < doc.lines && TABLE_RE.test(doc.line(end + 1).text)) end++;

    return { start, end };
}

export function getCellDocumentRange(
    doc: { line(n: number): { from: number; text: string } },
    tableFromLine: number,
    row: number,
    col: number,
): { from: number; to: number; text: string } | null {
    // row is 0-indexed within the table lines (0 = header, 1 = separator, 2+ = data)
    const line = doc.line(tableFromLine + row);
    const pipes = findCellBoundariesLocal(line.text);
    if (col < 0 || col >= pipes.length - 1) return null;
    const leftPipe = pipes[col]!;
    const rightPipe = pipes[col + 1]!;
    // Cell content is between leftPipe+1 and rightPipe (exclusive)
    const rawContent = line.text.substring(leftPipe + 1, rightPipe);
    // Trim leading/trailing space but track positions
    const text = rawContent.trim();
    if (text.length === 0) {
        const mid =
            line.from + leftPipe + 1 + Math.floor(rawContent.length / 2);
        return { from: mid, to: mid, text: '' };
    }
    const leadingSpace = rawContent.match(/^\s*/)?.[0].length ?? 0;
    const contentFrom = line.from + leftPipe + 1 + leadingSpace;
    const contentTo = contentFrom + text.length;
    return { from: contentFrom, to: contentTo, text };
}
