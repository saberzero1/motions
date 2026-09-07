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
 * Convert `<br>`, `<br/>`, `<br />` tags in cell markdown to real newlines
 * for editing in the cell editor.
 */
