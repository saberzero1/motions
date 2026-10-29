import { findUnescapedPipes } from '../../table-utils';

/** Blockquote markers before a row, as `table-extent.ts` strips them. */
const QUOTE_PREFIX = /^(?:[ \t]{0,3}>)+[ \t]?/;

/** Offset at which a row's own text starts, past any blockquote markers. */
export function rowPrefixLength(text: string): number {
    return QUOTE_PREFIX.exec(text)?.[0].length ?? 0;
}

/**
 * The cell boundaries of one table row, as offsets into `text`: the row's
 * unescaped pipes, with a virtual boundary standing in for a missing leading
 * or trailing pipe, since GFM makes both optional. Cell `i` lies strictly
 * between `bounds[i]` and `bounds[i + 1]`. Empty for a blank row.
 */
export function cellBounds(text: string): number[] {
    const start = rowPrefixLength(text);
    const end = text.trimEnd().length;
    if (end <= start || text.slice(start).trim() === '') return [];
    const bounds = findUnescapedPipes(text).filter((p) => p >= start);
    const first = start + text.slice(start).search(/\S/);
    if (bounds[0] !== first) bounds.unshift(start - 1);
    if (bounds[bounds.length - 1] !== end - 1) bounds.push(end);
    return bounds;
}

/**
 * The cell holding column `col`: `-1` before the first boundary, and
 * `bounds.length - 1` (one past the last cell) after the last. A column on a
 * boundary counts as the end of the cell before it, which is where the caret
 * sits after typing at the end of a cell.
 */
export function cellIndexAt(bounds: readonly number[], col: number): number {
    if (bounds.length === 0 || col <= (bounds[0] ?? 0)) return -1;
    for (let i = 0; i < bounds.length - 1; i++) {
        if (col <= (bounds[i + 1] ?? 0)) return i;
    }
    return bounds.length - 1;
}

/**
 * Where the content of cell `index` starts: its first non-blank character, or
 * one space past the opening pipe for a blank cell, so typed text gets the
 * usual padding.
 */
export function cellTextStart(
    text: string,
    bounds: readonly number[],
    index: number,
): number {
    const from = (bounds[index] ?? 0) + 1;
    const to = bounds[index + 1] ?? text.length;
    let i = from;
    while (i < to && (text[i] === ' ' || text[i] === '\t')) i++;
    return i < to ? i : Math.min(from + 1, Math.max(from, to));
}
