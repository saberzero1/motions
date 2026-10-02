import type { Text } from '@codemirror/state';
import { FRONTMATTER_DELIMITER } from '../../fold/frontmatter';
import { SEPARATOR_RE, TABLE_RE, type TableRange } from '../table-utils';

/**
 * Table ranges that are safe to *render* — i.e. to block-replace.
 *
 * Deliberately separate from `findTableRanges`, which matches any two or more
 * contiguous lines beginning with `|` and has no separator-row, fence or
 * frontmatter awareness. That laxity is harmless while Obsidian's parser
 * decides what renders, and `src/motions/tables.ts` and the table text objects
 * depend on it, so it must not be tightened in place.
 *
 * It stops being harmless the moment a highest-precedence block replace is
 * keyed on it: two `| foo` lines inside a fenced code block would be replaced
 * by a fake table.
 *
 * Takes a `Text` rather than an `EditorState` so it is constructible in a unit
 * test without an editor.
 */
export function findRenderableTableRanges(doc: Text): TableRange[] {
    const skip = buildSkipMask(doc);
    const ranges: TableRange[] = [];

    let lineNo = 1;
    while (lineNo <= doc.lines) {
        if (skip[lineNo] || !TABLE_RE.test(doc.line(lineNo).text)) {
            lineNo++;
            continue;
        }

        const start = lineNo;
        const lines: string[] = [];
        while (lineNo <= doc.lines) {
            if (skip[lineNo]) break;
            const text = doc.line(lineNo).text;
            if (!TABLE_RE.test(text)) break;
            lines.push(text);
            lineNo++;
        }

        if (isRenderableTable(lines)) {
            ranges.push({
                from: doc.line(start).from,
                to: doc.line(start + lines.length - 1).to,
                lines,
            });
        }
    }

    return ranges;
}

/**
 * A block Obsidian would render as a table: a header row, then a separator.
 *
 * The separator must be the **second** line. A block whose separator appears
 * later is not a table to any Markdown parser, and a block with no separator
 * at all is just consecutive lines that happen to start with `|`.
 */
function isRenderableTable(lines: string[]): boolean {
    if (lines.length < 2) return false;
    const separator = lines[1];
    if (separator === undefined) return false;
    return SEPARATOR_RE.test(separator);
}

/**
 * Line numbers (1-based) that must not contribute to a table block.
 *
 * Covers start-of-document frontmatter and fenced code blocks. Frontmatter is
 * resolved first so that a fence marker inside it cannot toggle fence state.
 *
 * Fence matching is intentionally simpler than CommonMark: a run of three or
 * more backticks or tildes opens, and a run of the same character at least as
 * long closes. Info strings are ignored. This covers the cases a Markdown
 * table can realistically be nested in without importing a parser.
 */
function buildSkipMask(doc: Text): boolean[] {
    const skip: boolean[] = new Array<boolean>(doc.lines + 2).fill(false);
    let lineNo = 1;

    if (doc.lines >= 1 && FRONTMATTER_DELIMITER.test(doc.line(1).text)) {
        skip[1] = true;
        lineNo = 2;
        while (lineNo <= doc.lines) {
            skip[lineNo] = true;
            const closed = FRONTMATTER_DELIMITER.test(doc.line(lineNo).text);
            lineNo++;
            if (closed) break;
        }
    }

    let fence: { char: string; length: number } | null = null;
    for (; lineNo <= doc.lines; lineNo++) {
        const text = doc.line(lineNo).text;
        const marker = matchFenceMarker(text);

        if (fence === null) {
            if (marker !== null) {
                fence = marker;
                skip[lineNo] = true;
            }
            continue;
        }

        skip[lineNo] = true;
        if (
            marker !== null &&
            marker.char === fence.char &&
            marker.length >= fence.length
        ) {
            fence = null;
        }
    }

    return skip;
}

function matchFenceMarker(
    text: string,
): { char: string; length: number } | null {
    const match = /^\s*(`{3,}|~{3,})/.exec(text);
    if (!match) return null;
    const run = match[1];
    if (run === undefined) return null;
    const char = run[0];
    if (char === undefined) return null;
    return { char, length: run.length };
}
