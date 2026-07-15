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
