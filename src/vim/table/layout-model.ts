import type { Text } from '@codemirror/state';
import {
    SEPARATOR_RE,
    findUnescapedPipes,
    parseAlignments,
    type Alignment,
    type TableRange,
} from '../table-utils';
import { findRenderableTableRanges } from './renderable-ranges';

export type RowKind = 'header' | 'separator' | 'data';

export interface TableCellLayout {
    row: number;
    column: number;
    /** Absolute offset just after the opening delimiter. */
    from: number;
    /** Absolute offset of the closing delimiter. */
    to: number;
    /** The raw slice between delimiters, padding included. */
    text: string;
    /** Absolute offsets of the trimmed content, for decorating text only. */
    contentFrom: number;
    contentTo: number;
    /**
     * Width of the trimmed content in UTF-16 code units.
     *
     * Units, not display columns, because that is the model Obsidian's own
     * formatter uses — measured, `日本語` occupies one column of width 3 and a
     * ZWJ emoji one of width 8. `test/unit/table/realign-width.test.ts` pins
     * it, and diverging here would put the layout out of step with the bytes
     * `realignTableLines` writes.
     */
    width: number;
}

export interface TableRowLayout {
    index: number;
    kind: RowKind;
    /** Absolute offsets of the row's line. */
    from: number;
    to: number;
    text: string;
    cells: TableCellLayout[];
    /** Absolute offsets of every unescaped delimiter on the row. */
    delimiters: number[];
    /**
     * Cells past the header's column count, excluded from `cells`.
     *
     * Recorded rather than dropped silently: the document keeps them
     * byte-identical, so a renderer that shows only `cells` is hiding content
     * and callers need to know it happened.
     */
    overflow: number;
}

export interface TableLayout {
    from: number;
    to: number;
    columnCount: number;
    alignments: Alignment[];
    /** Max content width per column, across header and data rows. */
    columnWidths: number[];
    rows: TableRowLayout[];
    /** True when any row's cell count differs from the header's. */
    malformed: boolean;
}

/**
 * The layout of one table, derived purely from its source.
 *
 * A pure function of text — no `EditorState`, no DOM — so it is unit-testable
 * the way `findRenderableTableRanges` is, and so the decoration layer and the
 * passive renderer can share one model instead of each re-deriving geometry.
 *
 * **Never throws.** It backs a `StateField`, where an exception takes the
 * whole editor down, and table source is user input that is malformed far more
 * often than not. Malformed shapes are given defined answers instead:
 *
 * - a row with **fewer** cells than the header yields fewer `cells`; the
 *   renderer draws the remainder as empty. Nothing is inserted into the
 *   document.
 * - a row with **more** is truncated for layout and the excess counted in
 *   `overflow`, again leaving the document byte-identical. Rewriting the row
 *   to fit would be an unrequested edit, and `owned` mode must not edit a
 *   document just to render it.
 * - a missing separator row is already excluded upstream by
 *   `findRenderableTableRanges`, so a `TableRange` reaching here has one at
 *   index 1; `buildTableLayout` still checks rather than assuming.
 */
export function buildTableLayout(table: TableRange): TableLayout | null {
    const header = table.lines[0];
    if (header === undefined) return null;
    const separator = table.lines[1];
    if (separator === undefined || !SEPARATOR_RE.test(separator)) return null;

    const columnCount = splitCount(header);
    if (columnCount <= 0) return null;

    const alignments = parseAlignments(separator);
    while (alignments.length < columnCount) alignments.push('none');

    const rows: TableRowLayout[] = [];
    const columnWidths: number[] = Array.from({ length: columnCount }, () => 0);
    let malformed = false;
    let lineFrom = table.from;

    for (let index = 0; index < table.lines.length; index++) {
        const text = table.lines[index];
        if (text === undefined) continue;

        const kind: RowKind =
            index === 1 ? 'separator' : index === 0 ? 'header' : 'data';
        const pipes = findUnescapedPipes(text);
        const delimiters = pipes.map((p) => lineFrom + p);
        const cells: TableCellLayout[] = [];

        // One cell per adjacent delimiter pair, so a row with a trailing
        // delimiter contributes no phantom final cell.
        const available = Math.max(0, pipes.length - 1);
        if (kind !== 'separator' && available !== columnCount) malformed = true;

        for (
            let column = 0;
            column < Math.min(available, columnCount);
            column++
        ) {
            const open = pipes[column];
            const close = pipes[column + 1];
            if (open === undefined || close === undefined) continue;
            const raw = text.slice(open + 1, close);
            const leading = raw.length - raw.trimStart().length;
            const trailing = raw.length - raw.trimEnd().length;
            const from = lineFrom + open + 1;
            const to = lineFrom + close;
            const content = raw.trim();
            cells.push({
                row: index,
                column,
                from,
                to,
                text: raw,
                contentFrom: from + leading,
                contentTo: to - trailing,
                width: content.length,
            });
            if (kind !== 'separator') {
                const current = columnWidths[column] ?? 0;
                if (content.length > current)
                    columnWidths[column] = content.length;
            }
        }

        rows.push({
            index,
            kind,
            from: lineFrom,
            to: lineFrom + text.length,
            text,
            cells,
            delimiters,
            overflow: Math.max(0, available - columnCount),
        });

        lineFrom += text.length + 1;
    }

    return {
        from: table.from,
        to: table.to,
        columnCount,
        alignments: alignments.slice(0, columnCount),
        columnWidths,
        rows,
        malformed,
    };
}

/** Layouts for every renderable table in the document, in document order. */
export function findTableLayouts(doc: Text): TableLayout[] {
    const out: TableLayout[] = [];
    for (const range of findRenderableTableRanges(doc)) {
        const layout = buildTableLayout(range);
        if (layout) out.push(layout);
    }
    return out;
}

/**
 * The cell containing `pos`, or null.
 *
 * A position on a delimiter belongs to no cell. Callers that need to resolve a
 * click on one — where the glyph is rendered but carries no content — must
 * decide which side to snap to themselves rather than having it guessed here.
 */
export function cellAt(
    layout: TableLayout,
    pos: number,
): TableCellLayout | null {
    for (const row of layout.rows) {
        if (pos < row.from || pos > row.to) continue;
        for (const cell of row.cells) {
            if (pos > cell.from - 1 && pos < cell.to) return cell;
        }
        return null;
    }
    return null;
}

function splitCount(line: string): number {
    return Math.max(0, findUnescapedPipes(line).length - 1);
}
