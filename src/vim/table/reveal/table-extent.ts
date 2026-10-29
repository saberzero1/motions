import type { EditorSelection, Text } from '@codemirror/state';

/** A table block, by line, as the reveal surface understands it. */
export interface TableExtent {
    /** First line of the table (1-based, inclusive): the header row. */
    fromLine: number;
    /** Last line of the table (1-based, inclusive). */
    toLine: number;
    /** Offset of the start of `fromLine`. */
    from: number;
    /** Offset of the end of `toLine`. */
    to: number;
}

/**
 * Selections spanning more lines than this are only checked at their ends.
 *
 * A table lying wholly inside a selection is revealed so a visual selection
 * through it stays visible, but `ggVG` over a long note would otherwise scan
 * every line on every transaction while visual mode is active.
 */
const INTERIOR_SCAN_LIMIT = 5000;

const QUOTE_PREFIX = /^(?:[ \t]{0,3}>)+[ \t]?/;
const SEPARATOR = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;

function body(text: string): string {
    return text.replace(QUOTE_PREFIX, '');
}

/** A line that can belong to a table: non-blank, with a pipe somewhere. */
function isRowCandidate(text: string): boolean {
    const b = body(text);
    return b.trim() !== '' && b.includes('|');
}

/**
 * A delimiter row. A pipe is required so a thematic break (`---`) under a line
 * containing a pipe is not mistaken for one.
 */
function isSeparator(text: string): boolean {
    const b = body(text);
    return b.includes('|') && b.includes('-') && SEPARATOR.test(b);
}

/**
 * The table containing line `lineNo`, or null.
 *
 * Deliberately **wider** than Obsidian's own idea of a table, and that is the
 * load-bearing property. The reveal surface asks Obsidian not to replace a
 * table, so a line Obsidian renders as part of a table but this misses gets
 * hidden again with the caret still inside it — and Obsidian's widget then
 * takes the caret into a cell editor of its own. Measured: deleting a row's
 * leading pipe with `x` did exactly that under a pipe-led matcher, after which
 * `u` was typed into the cell as text. Revealing too much costs nothing,
 * because the highlight the surface places on a non-table line draws nothing.
 *
 * So rows are any non-blank lines containing a pipe, contiguous with a header
 * that is followed by a delimiter row — GFM's shape, which Obsidian's HyperMD
 * parser only narrows. Blockquote markers are ignored, so a table quoted with
 * `>` is still found.
 */
export function findTableAt(doc: Text, lineNo: number): TableExtent | null {
    if (lineNo < 1 || lineNo > doc.lines) return null;
    if (!isRowCandidate(doc.line(lineNo).text)) return null;

    let top = lineNo;
    while (top > 1 && isRowCandidate(doc.line(top - 1).text)) top--;

    // The header is the first line in the run whose successor is a delimiter.
    // A delimiter-looking line further down is a data row of this table.
    let header = -1;
    for (let n = top; n <= lineNo && n < doc.lines; n++) {
        if (
            isSeparator(doc.line(n + 1).text) &&
            !isSeparator(doc.line(n).text)
        ) {
            header = n;
            break;
        }
    }
    if (header === -1) return null;

    let bottom = header + 1;
    while (bottom < doc.lines && isRowCandidate(doc.line(bottom + 1).text)) {
        bottom++;
    }
    if (lineNo > bottom) return null;

    return {
        fromLine: header,
        toLine: bottom,
        from: doc.line(header).from,
        to: doc.line(bottom).to,
    };
}

/**
 * Every table a selection touches, in document order, without duplicates.
 *
 * A range touches a table when either end lies inside it or, for ranges of
 * moderate size, when the table lies wholly between its ends.
 */
export function tablesTouchedBy(
    doc: Text,
    selection: EditorSelection,
): TableExtent[] {
    const found = new Map<number, TableExtent>();
    const add = (extent: TableExtent | null): void => {
        if (extent) found.set(extent.fromLine, extent);
    };

    for (const range of selection.ranges) {
        const first = doc.lineAt(range.from).number;
        const last = doc.lineAt(range.to).number;
        add(findTableAt(doc, first));
        if (last !== first) add(findTableAt(doc, last));
        if (last - first > INTERIOR_SCAN_LIMIT) continue;

        let line = first + 1;
        while (line < last) {
            const extent = findTableAt(doc, line);
            if (extent) {
                add(extent);
                line = extent.toLine + 1;
            } else {
                line++;
            }
        }
    }

    return [...found.values()].sort((a, b) => a.fromLine - b.fromLine);
}

/**
 * The text range of each of a table's rows, which is what the reveal surface
 * highlights.
 *
 * Touching the table anywhere is enough to keep Obsidian's builder from
 * replacing it, but not enough for its inline renderer: that reveals a
 * construct — bold, a link, inline math — only when a highlight touches the
 * construct's own span, measured with `[[x]]` still rendering as `x` under a
 * highlight on the row's newline. Covering every row's text reveals every
 * construct, which is what lets padded columns line up as source.
 */
export function rowRanges(
    doc: Text,
    extent: TableExtent,
): { from: number; to: number }[] {
    const out: { from: number; to: number }[] = [];
    for (let n = extent.fromLine; n <= extent.toLine; n++) {
        const line = doc.line(n);
        if (line.to > line.from) out.push({ from: line.from, to: line.to });
    }
    return out;
}
