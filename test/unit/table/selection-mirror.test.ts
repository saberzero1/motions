import { describe, expect, it } from 'vitest';
import {
    mirrorRange,
    type LineOffsets,
} from '../../../src/vim/table/selection-mirror';
import type { VimState } from '../../../src/types/vim-api';

/**
 * Plan B Step 6.
 *
 * The two sources are not interchangeable, and that is the whole reason this
 * function exists: charwise visual leaves the parent's own CM6 selection as the
 * real range, while linewise leaves it collapsed and keeps the range in
 * `vim.sel`'s line numbers.
 */

// A table occupying lines 2..4 of the parent (zero-based), starting at 20.
const TABLE = { from: 20, to: 70 };
const LINES: LineOffsets = {
    start: (line) => [0, 11, 20, 37, 54][line] ?? 0,
    end: (line) => [10, 11, 36, 53, 70][line] ?? 0,
};

const normal: VimState = { visualMode: false };
const charwise: VimState = { visualMode: true, visualLine: false };
const linewise = (anchorLine: number, headLine: number): VimState => ({
    visualMode: true,
    visualLine: true,
    sel: {
        anchor: { line: anchorLine, ch: 0 },
        head: { line: headLine, ch: 0 },
    },
});

describe('mirrorRange', () => {
    it('collapses to a caret when not in visual mode', () => {
        expect(
            mirrorRange(normal, { anchor: 25, head: 30 }, LINES, TABLE),
        ).toStrictEqual({ anchor: 10, head: 10 });
    });

    it('uses the parent CM6 range directly for charwise visual', () => {
        expect(
            mirrorRange(charwise, { anchor: 24, head: 27 }, LINES, TABLE),
        ).toStrictEqual({ anchor: 4, head: 7 });
    });

    it('preserves a backwards charwise range', () => {
        expect(
            mirrorRange(charwise, { anchor: 30, head: 24 }, LINES, TABLE),
        ).toStrictEqual({ anchor: 10, head: 4 });
    });

    it('expands linewise to whole lines, ignoring the collapsed parent selection', () => {
        // The parent selection is collapsed at the line start, exactly as
        // measured after V. Using it would render nothing.
        expect(
            mirrorRange(linewise(3, 3), { anchor: 37, head: 37 }, LINES, TABLE),
        ).toStrictEqual({ anchor: 37 - 20, head: 53 - 20 });
    });

    it('spans two rows for a downward linewise range', () => {
        expect(
            mirrorRange(linewise(3, 4), { anchor: 37, head: 37 }, LINES, TABLE),
        ).toStrictEqual({ anchor: 17, head: 50 });
    });

    it('keeps the head above the anchor for an upward linewise range', () => {
        expect(
            mirrorRange(linewise(4, 3), { anchor: 54, head: 54 }, LINES, TABLE),
        ).toStrictEqual({ anchor: 50, head: 17 });
    });

    it('clamps a range that has left the table', () => {
        const out = mirrorRange(
            charwise,
            { anchor: 24, head: 400 },
            LINES,
            TABLE,
        );
        expect(out).toStrictEqual({ anchor: 4, head: 50 });
        // An unclamped head would throw when dispatched against the child.
        expect(out.head).toBeLessThanOrEqual(TABLE.to - TABLE.from);
    });

    it('clamps a range starting before the table', () => {
        expect(
            mirrorRange(charwise, { anchor: 5, head: 24 }, LINES, TABLE),
        ).toStrictEqual({ anchor: 0, head: 4 });
    });

    it('falls back to the parent range when linewise has no sel', () => {
        const noSel: VimState = { visualMode: true, visualLine: true };
        expect(
            mirrorRange(noSel, { anchor: 24, head: 27 }, LINES, TABLE),
        ).toStrictEqual({ anchor: 4, head: 7 });
    });

    it('treats visual block as charwise rather than throwing', () => {
        const block: VimState = {
            visualMode: true,
            visualBlock: true,
            visualLine: false,
        };
        expect(
            mirrorRange(block, { anchor: 24, head: 40 }, LINES, TABLE),
        ).toStrictEqual({ anchor: 4, head: 20 });
    });

    it('collapses to a caret when the adapter has no vim state at all', () => {
        expect(
            mirrorRange(undefined, { anchor: 25, head: 30 }, LINES, TABLE),
        ).toStrictEqual({ anchor: 10, head: 10 });
    });

    describe('keepNonEmpty, for snippet tabstops', () => {
        // A tabstop is a non-empty selection in *insert* mode, so the
        // visual-mode branches above never see it and the default collapse
        // hides it. The first test here is paired with the existing
        // "collapses to a caret when not in visual mode", which passes no
        // flag and is what proves the default is unchanged.
        it('preserves a non-empty range outside visual mode', () => {
            expect(
                mirrorRange(
                    normal,
                    { anchor: 25, head: 30 },
                    LINES,
                    TABLE,
                    true,
                ),
            ).toStrictEqual({ anchor: 5, head: 10 });
        });

        it('preserves a backwards range', () => {
            expect(
                mirrorRange(
                    normal,
                    { anchor: 30, head: 25 },
                    LINES,
                    TABLE,
                    true,
                ),
            ).toStrictEqual({ anchor: 10, head: 5 });
        });

        it('still collapses an already-empty selection', () => {
            // Between tabstops the parent's selection is a caret, and drawing
            // a zero-width "range" is not the same thing as a caret.
            expect(
                mirrorRange(
                    normal,
                    { anchor: 25, head: 25 },
                    LINES,
                    TABLE,
                    true,
                ),
            ).toStrictEqual({ anchor: 5, head: 5 });
        });

        it('clamps a preserved range to the table', () => {
            expect(
                mirrorRange(
                    normal,
                    { anchor: 24, head: 400 },
                    LINES,
                    TABLE,
                    true,
                ),
            ).toStrictEqual({ anchor: 4, head: 50 });
        });

        it('leaves visual mode taking precedence', () => {
            // The flag must not override linewise expansion: a visual
            // selection during a session is still a visual selection.
            expect(
                mirrorRange(
                    linewise(3, 3),
                    { anchor: 37, head: 37 },
                    LINES,
                    TABLE,
                    true,
                ),
            ).toStrictEqual({ anchor: 17, head: 33 });
        });
    });
});
