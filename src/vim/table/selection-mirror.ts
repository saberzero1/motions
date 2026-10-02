import type { VimState } from '../../types/vim-api';

export interface ChildRange {
    anchor: number;
    head: number;
}

/** Line offsets of the parent document, zero-based. */
export interface LineOffsets {
    start(line: number): number;
    end(line: number): number;
}

export interface TableBounds {
    from: number;
    to: number;
}

/**
 * The parent's visual range, expressed in the nested editor's coordinates.
 *
 * The nested editor is focused, so its own selection is what the browser
 * renders. Without this the user is in visual mode with nothing visible —
 * measured as `selectionLayerRects: 0`, which is close to the "loses state,
 * status bar still says V-Line" symptom in issue #167.
 *
 * Two sources, because the fork populates them differently and the difference
 * was measured rather than assumed:
 *
 * - **charwise** (`v`): the parent's own CM6 selection already *is* the range
 *   (`anchor: 48, head: 49` after `v`, `head: 51` after `vll`), so it is used
 *   directly and the inclusive head needs no adjustment.
 * - **linewise** (`V`): the parent's CM6 selection is **collapsed** at the line
 *   start, and the range exists only as `vim.sel`'s line numbers. It is
 *   expanded to whole lines here.
 *
 * Visual **block** no longer comes through here as a single range. The parent
 * carries one range per row and `mirrorRanges` mirrors all of them, so a
 * rectangular selection renders as one — this function sees block mode only
 * when the parent happens to hold a single range, where charwise handling is
 * also the correct answer.
 *
 * The child's document is exactly the parent's slice, so translation is a
 * subtraction. Results are clamped, because a visual range can extend past the
 * table once a motion leaves it, and an out-of-range selection throws.
 */
/**
 * Every parent range in the child's coordinates, plus which one is main.
 *
 * Visual block is the case this exists for. The parent really does carry one
 * range per row — measured, `<C-v>` over three rows yields three ranges
 * holding exactly the cell texts — and mirroring only `.main` renders a
 * single-row selection for a multi-row block, which misreports what the
 * operator will act on.
 *
 * Single-range selections are delegated to `mirrorRange`, so charwise,
 * linewise and caret behaviour are unchanged; only the genuinely multi-range
 * case takes the new path.
 */
export function mirrorRanges(
    vim: VimState | undefined,
    selection: { ranges: readonly ChildRange[]; mainIndex: number },
    lines: LineOffsets,
    table: TableBounds,
    keepNonEmpty = false,
): { ranges: ChildRange[]; mainIndex: number } {
    const first = selection.ranges[0];
    if (selection.ranges.length <= 1) {
        const single = mirrorRange(
            vim,
            first ?? { anchor: table.from, head: table.from },
            lines,
            table,
            keepNonEmpty,
        );
        return { ranges: [single], mainIndex: 0 };
    }

    const width = table.to - table.from;
    const clamp = (offset: number) =>
        Math.max(0, Math.min(offset - table.from, width));
    return {
        ranges: selection.ranges.map((r) => ({
            anchor: clamp(r.anchor),
            head: clamp(r.head),
        })),
        mainIndex: Math.max(
            0,
            Math.min(selection.mainIndex, selection.ranges.length - 1),
        ),
    };
}

export function mirrorRange(
    vim: VimState | undefined,
    parentSelection: ChildRange,
    lines: LineOffsets,
    table: TableBounds,
    keepNonEmpty = false,
): ChildRange {
    const width = table.to - table.from;
    const clamp = (offset: number) =>
        Math.max(0, Math.min(offset - table.from, width));

    if (!vim?.visualMode) {
        // A snippet tabstop is a non-empty selection in *insert* mode, which
        // the collapse below would hide: measured, the child's selected text
        // was empty at every tabstop while the parent's read `page`, so the
        // user could not see which field they were on. Opt-in rather than
        // unconditional, because normal mode also carries a non-empty CM6
        // selection for the block cursor and drawing that would be wrong.
        if (keepNonEmpty && parentSelection.anchor !== parentSelection.head) {
            return {
                anchor: clamp(parentSelection.anchor),
                head: clamp(parentSelection.head),
            };
        }
        const head = clamp(parentSelection.head);
        return { anchor: head, head };
    }

    if (vim.visualLine) {
        const anchorLine = vim.sel?.anchor.line;
        const headLine = vim.sel?.head.line;
        if (anchorLine !== undefined && headLine !== undefined) {
            const first = Math.min(anchorLine, headLine);
            const last = Math.max(anchorLine, headLine);
            const forward = headLine >= anchorLine;
            const top = clamp(lines.start(first));
            const bottom = clamp(lines.end(last));
            return forward
                ? { anchor: top, head: bottom }
                : { anchor: bottom, head: top };
        }
    }

    return {
        anchor: clamp(parentSelection.anchor),
        head: clamp(parentSelection.head),
    };
}
