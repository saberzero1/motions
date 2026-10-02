import { describe, expect, it } from 'vitest';
import { Text } from '@codemirror/state';
import {
    buildTableLayout,
    cellAt,
    findTableLayouts,
} from '../../../src/vim/table/layout-model';
import type { TableRange } from '../../../src/vim/table-utils';

/**
 * Plan E1.3 — the parsed layout model.
 *
 * Pure text in, geometry out, so none of this needs an editor. The malformed
 * cases are the point rather than an afterthought: this model backs a
 * `StateField`, where a throw takes the whole editor down, and table source is
 * user input that is malformed more often than not.
 */

const range = (lines: string[], from = 0): TableRange => ({
    from,
    to: from + lines.join('\n').length,
    lines,
});

const WELL_FORMED = ['| h1 | h2 |', '|:---|---:|', '| aa | 11 |'];

describe('buildTableLayout', () => {
    it('derives columns, alignment and widths from the source', () => {
        const layout = buildTableLayout(range(WELL_FORMED));
        expect(layout).not.toBeNull();
        expect(layout!.columnCount).toBe(2);
        expect(layout!.alignments).toStrictEqual(['left', 'right']);
        expect(layout!.columnWidths).toStrictEqual([2, 2]);
        expect(layout!.malformed).toBe(false);
        expect(layout!.rows.map((r) => r.kind)).toStrictEqual([
            'header',
            'separator',
            'data',
        ]);
    });

    it('places cell ranges at absolute document offsets', () => {
        const layout = buildTableLayout(range(WELL_FORMED))!;
        const header = layout.rows[0]!;
        // `| h1 | h2 |` — delimiters at 0, 5, 10.
        expect(header.delimiters).toStrictEqual([0, 5, 10]);
        expect(header.cells[0]).toMatchObject({
            row: 0,
            column: 0,
            from: 1,
            to: 5,
            text: ' h1 ',
            contentFrom: 2,
            contentTo: 4,
            width: 2,
        });

        // The third line starts at 24, so its offsets are shifted by that.
        const data = layout.rows[2]!;
        expect(data.from).toBe(24);
        expect(data.delimiters).toStrictEqual([24, 29, 34]);
        expect(data.cells[0]).toMatchObject({
            from: 25,
            to: 29,
            contentFrom: 26,
            contentTo: 28,
        });
    });

    it('honours a non-zero table offset', () => {
        const layout = buildTableLayout(range(WELL_FORMED, 100))!;
        expect(layout.rows[0]!.delimiters).toStrictEqual([100, 105, 110]);
        expect(layout.rows[2]!.from).toBe(124);
    });

    it('does not treat an escaped pipe as a delimiter', () => {
        const layout = buildTableLayout(
            range(['| a\\|b | c |', '|---|---|', '| d | e |']),
        )!;
        expect(layout.columnCount).toBe(2);
        expect(layout.rows[0]!.cells[0]!.text).toBe(' a\\|b ');
        expect(layout.rows[0]!.cells[0]!.width).toBe('a\\|b'.length);
    });

    it('measures width in UTF-16 units, matching the formatter', () => {
        // Deliberately the same model as realignTableLines, which was measured
        // to agree with Obsidian's own: 日本語 is width 3, not 6.
        const layout = buildTableLayout(
            range(['| \u65e5\u672c\u8a9e | b |', '|---|---|', '| c | d |']),
        )!;
        expect(layout.columnWidths[0]).toBe(3);
    });

    describe('malformed input, which must never throw', () => {
        it('a row with fewer cells yields fewer cells and flags malformed', () => {
            const layout = buildTableLayout(
                range(['| a | b | c |', '|---|---|---|', '| d |']),
            )!;
            expect(layout.columnCount).toBe(3);
            expect(layout.rows[2]!.cells).toHaveLength(1);
            expect(layout.rows[2]!.overflow).toBe(0);
            expect(layout.malformed).toBe(true);
            // The document is untouched: nothing was padded into the row.
            expect(layout.rows[2]!.text).toBe('| d |');
        });

        it('a row with more cells is truncated for layout only', () => {
            const layout = buildTableLayout(
                range(['| a | b |', '|---|---|', '| c | d | e | f |']),
            )!;
            expect(layout.columnCount).toBe(2);
            expect(layout.rows[2]!.cells).toHaveLength(2);
            expect(layout.rows[2]!.overflow).toBe(2);
            expect(layout.malformed).toBe(true);
            // Byte-identical — rendering must not rewrite the user's row.
            expect(layout.rows[2]!.text).toBe('| c | d | e | f |');
        });

        it('returns null without a separator row', () => {
            expect(
                buildTableLayout(range(['| a | b |', '| c | d |'])),
            ).toBeNull();
        });

        it('returns null for a single line', () => {
            expect(buildTableLayout(range(['| a | b |']))).toBeNull();
        });

        it('returns null when the header has no delimiter pair', () => {
            expect(buildTableLayout(range(['|', '|---|']))).toBeNull();
        });

        it.each([
            ['empty lines', ['', '']],
            ['pipes only', ['||', '||']],
            ['separator first', ['|---|', '|---|']],
            ['ragged junk', ['|a', '|-|', '||||']],
            ['whitespace', ['   ', '   ']],
        ])('survives %s', (_name, lines) => {
            expect(() => buildTableLayout(range(lines))).not.toThrow();
        });

        it('keeps a zero-width cell addressable', () => {
            const layout = buildTableLayout(
                range(['| a | b |', '|---|---|', '|| d |']),
            )!;
            expect(layout.rows[2]!.cells[0]).toMatchObject({
                text: '',
                width: 0,
            });
        });
    });
});

describe('cellAt', () => {
    const layout = buildTableLayout(range(WELL_FORMED))!;

    it('resolves a position inside a cell', () => {
        expect(cellAt(layout, 2)).toMatchObject({ row: 0, column: 0 });
        expect(cellAt(layout, 7)).toMatchObject({ row: 0, column: 1 });
        expect(cellAt(layout, 26)).toMatchObject({ row: 2, column: 0 });
    });

    it('returns null on a delimiter, rather than guessing a side', () => {
        // Which side a click on a rendered delimiter should snap to is the
        // caller's decision; guessing here would hide it.
        expect(cellAt(layout, 0)).toBeNull();
        expect(cellAt(layout, 5)).toBeNull();
        expect(cellAt(layout, 10)).toBeNull();
    });

    it('returns null outside the table', () => {
        expect(cellAt(layout, 999)).toBeNull();
    });
});

describe('findTableLayouts', () => {
    it('finds every renderable table in document order', () => {
        const doc = Text.of([
            'intro',
            '',
            '| a | b |',
            '|---|---|',
            '| c | d |',
            '',
            '| e |',
            '|---|',
            '',
        ]);
        const layouts = findTableLayouts(doc);
        expect(layouts).toHaveLength(2);
        expect(layouts[0]!.columnCount).toBe(2);
        expect(layouts[1]!.columnCount).toBe(1);
        // Offsets are absolute, so the second table starts after the first.
        expect(layouts[1]!.from).toBeGreaterThan(layouts[0]!.to);
    });

    it('skips a fenced block that looks like a table', () => {
        const doc = Text.of([
            '```',
            '| a | b |',
            '|---|---|',
            '```',
            '',
            '| c | d |',
            '|---|---|',
        ]);
        const layouts = findTableLayouts(doc);
        expect(layouts).toHaveLength(1);
        expect(layouts[0]!.rows[0]!.text).toBe('| c | d |');
    });
});
