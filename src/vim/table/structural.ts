import {
    SEPARATOR_RE,
    realignTableLines,
    splitCellsEscapeAware,
} from '../table-utils';

/**
 * Text-based row and column operations for the owned table surface.
 *
 * Obsidian's `editor:table-*` commands are already registered as vim actions,
 * but they drive Obsidian's private `TableEditor` through the table widget —
 * which `owned` mode removes. Measured, with the cursor in a table: ten of
 * them leave the document **byte-identical** in `owned` while changing it
 * correctly in `native`. Only `:tablerealign` works in both, because it alone
 * is text-based.
 *
 * So these operate on the table's lines and nothing else. No `TableEditor`, no
 * `editMode.tableCell`, no `.cm-table-widget` — the surface deletes all three,
 * and depending on them is what made the existing commands inert.
 *
 * Every function is pure: `string[]` in, `string[]` out, unit-testable with no
 * DOM. Each returns the input array unchanged when the operation does not
 * apply, so a caller can compare by identity to know whether anything
 * happened.
 */

/** Index of the separator row, or -1. Always 1 in a renderable table. */
function separatorIndex(lines: string[]): number {
    return lines.findIndex((l) => SEPARATOR_RE.test(l));
}

function cellsOf(line: string): string[] {
    return splitCellsEscapeAware(line).map((c) => c.trim());
}

function rowFrom(cells: string[]): string {
    return `| ${cells.join(' | ')} |`;
}

/** Data rows are everything after the separator. */
function firstDataRow(lines: string[]): number {
    const sep = separatorIndex(lines);
    return sep < 0 ? 1 : sep + 1;
}

function columnCount(lines: string[]): number {
    const header = lines[0];
    return header === undefined ? 0 : cellsOf(header).length;
}

function finish(lines: string[]): string[] {
    return realignTableLines(lines);
}

/**
 * A new empty row below `row`, or above it.
 *
 * Clamped to the data region: a row inserted between the header and the
 * separator produces a table no Markdown parser will render, and the caller
 * asking for it is always a cursor on the header.
 */
export function insertRow(
    lines: string[],
    row: number,
    where: 'before' | 'after',
): string[] {
    const columns = columnCount(lines);
    if (columns <= 0) return lines;
    const min = firstDataRow(lines);
    const target = where === 'after' ? row + 1 : row;
    const at = Math.min(Math.max(target, min), lines.length);
    const blank = rowFrom(Array.from({ length: columns }, () => ''));
    const next = [...lines];
    next.splice(at, 0, blank);
    return finish(next);
}

/**
 * Remove a data row.
 *
 * The header and the separator are structural, so a request on either is a
 * no-op rather than an error — `dd` on a header should not silently destroy
 * the table's shape.
 */
export function deleteRow(lines: string[], row: number): string[] {
    const sep = separatorIndex(lines);
    if (row <= sep || row < 0 || row >= lines.length) return lines;
    const next = [...lines];
    next.splice(row, 1);
    return finish(next);
}

/** Swap a data row with its neighbour, clamped to the data region. */
export function moveRow(
    lines: string[],
    row: number,
    direction: 'up' | 'down',
): string[] {
    const min = firstDataRow(lines);
    const target = direction === 'up' ? row - 1 : row + 1;
    if (row < min || target < min || target >= lines.length) return lines;
    const next = [...lines];
    const a = next[row];
    const b = next[target];
    if (a === undefined || b === undefined) return lines;
    next[row] = b;
    next[target] = a;
    return finish(next);
}

/**
 * Apply a per-row cell transform to **every** line, separator included.
 *
 * The separator is the trap in every column operation: a column added to the
 * data rows but not to it produces a table Obsidian will not render, and no
 * row-level assertion notices. `realignTableLines` rebuilds the separator from
 * the alignments it parses, so the placeholder only has to keep the cell
 * count right.
 */
function mapColumns(
    lines: string[],
    transform: (cells: string[], isSeparator: boolean) => string[] | null,
): string[] {
    const sep = separatorIndex(lines);
    const next: string[] = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line === undefined) continue;
        const result = transform(cellsOf(line), i === sep);
        if (result === null) return lines;
        next.push(rowFrom(result));
    }
    return finish(next);
}

export function insertColumn(
    lines: string[],
    col: number,
    where: 'before' | 'after',
): string[] {
    const columns = columnCount(lines);
    if (columns <= 0) return lines;
    const at = Math.min(
        Math.max(where === 'after' ? col + 1 : col, 0),
        columns,
    );
    return mapColumns(lines, (cells, isSeparator) => {
        const copy = [...cells];
        copy.splice(at, 0, isSeparator ? '---' : '');
        return copy;
    });
}

/** Remove a column, unless it is the only one left. */
export function deleteColumn(lines: string[], col: number): string[] {
    const columns = columnCount(lines);
    if (columns <= 1 || col < 0 || col >= columns) return lines;
    return mapColumns(lines, (cells) => {
        const copy = [...cells];
        copy.splice(col, 1);
        return copy;
    });
}

/** Swap a column with its neighbour, in every row including the separator. */
export function moveColumn(
    lines: string[],
    col: number,
    direction: 'left' | 'right',
): string[] {
    const columns = columnCount(lines);
    const target = direction === 'left' ? col - 1 : col + 1;
    if (col < 0 || col >= columns || target < 0 || target >= columns) {
        return lines;
    }
    return mapColumns(lines, (cells) => {
        const copy = [...cells];
        const a = copy[col];
        const b = copy[target];
        if (a === undefined || b === undefined) return null;
        copy[col] = b;
        copy[target] = a;
        return copy;
    });
}
