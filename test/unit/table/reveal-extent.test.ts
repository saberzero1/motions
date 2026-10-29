import { describe, expect, it } from 'vitest';
import { EditorSelection, Text } from '@codemirror/state';
import {
    findTableAt,
    rowRanges,
    tablesTouchedBy,
} from '../../../src/vim/table/reveal/table-extent';

/**
 * The reveal surface's table finder.
 *
 * Its load-bearing property is being a **superset** of what Obsidian renders
 * as a table. Revealing a line that is not a table row costs nothing; failing
 * to reveal one that is hides the table again around the caret and hands it
 * to Obsidian's cell editor. The leading-pipe case below is the one the spike
 * hit.
 */

const doc = (...lines: string[]): Text => Text.of(lines);

const TABLE = [
    'Line above',
    '',
    '| Name | Value |',
    '|------|-------|',
    '| aa   | 11    |',
    '| bb   | 22    |',
    '',
    'Below',
];

describe('findTableAt', () => {
    it('finds the same extent from the header, delimiter and data rows', () => {
        const d = doc(...TABLE);
        for (const line of [3, 4, 5, 6]) {
            expect(findTableAt(d, line)).toEqual({
                fromLine: 3,
                toLine: 6,
                from: d.line(3).from,
                to: d.line(6).to,
            });
        }
    });

    it('finds nothing outside the table', () => {
        const d = doc(...TABLE);
        for (const line of [1, 2, 7, 8]) {
            expect(findTableAt(d, line)).toBeNull();
        }
    });

    it('keeps a row whose leading pipe was deleted inside the table', () => {
        const d = doc(
            '| Name | Value |',
            '|------|-------|',
            ' aa   | 11    |',
            '| bb   | 22    |',
        );
        expect(findTableAt(d, 3)).toMatchObject({ fromLine: 1, toLine: 4 });
        expect(findTableAt(d, 4)).toMatchObject({ fromLine: 1, toLine: 4 });
    });

    it('requires a delimiter row under the header', () => {
        const d = doc('| a | b |', '| c | d |');
        expect(findTableAt(d, 1)).toBeNull();
        expect(findTableAt(d, 2)).toBeNull();
    });

    it('does not take a thematic break for a delimiter row', () => {
        const d = doc('a | b', '---', 'after');
        expect(findTableAt(d, 1)).toBeNull();
    });

    it('finds a table without outer pipes', () => {
        const d = doc('a | b', '--|--', '1 | 2');
        expect(findTableAt(d, 3)).toMatchObject({ fromLine: 1, toLine: 3 });
    });

    it('finds a table quoted with ">"', () => {
        const d = doc('> | a | b |', '> |---|---|', '> | 1 | 2 |');
        expect(findTableAt(d, 2)).toMatchObject({ fromLine: 1, toLine: 3 });
    });

    it('starts at the header when pipe-bearing text precedes it', () => {
        const d = doc('x | y', '| a | b |', '|---|---|', '| 1 | 2 |');
        expect(findTableAt(d, 4)).toMatchObject({ fromLine: 2, toLine: 4 });
        expect(findTableAt(d, 1)).toBeNull();
    });

    it('treats a header-only table as a table', () => {
        const d = doc('| a | b |', '|---|---|');
        expect(findTableAt(d, 1)).toMatchObject({ fromLine: 1, toLine: 2 });
    });
});

describe('tablesTouchedBy', () => {
    const TWO = [
        '| a | b |',
        '|---|---|',
        '| 1 | 2 |',
        '',
        'between',
        '',
        '| c | d |',
        '|---|---|',
        '| 3 | 4 |',
    ];

    it('reports the table under a cursor and nothing else', () => {
        const d = doc(...TWO);
        const touched = tablesTouchedBy(
            d,
            EditorSelection.single(d.line(8).from + 1),
        );
        expect(touched.map((t) => t.fromLine)).toEqual([7]);
    });

    it('reports nothing for a cursor between tables', () => {
        const d = doc(...TWO);
        expect(
            tablesTouchedBy(d, EditorSelection.single(d.line(5).from)),
        ).toEqual([]);
    });

    it('reports a table lying wholly inside a selection', () => {
        const d = doc('top', '', ...TWO.slice(0, 3), '', 'bottom');
        const touched = tablesTouchedBy(d, EditorSelection.single(0, d.length));
        expect(touched.map((t) => t.fromLine)).toEqual([3]);
    });

    it('reports each table once across several ranges', () => {
        const d = doc(...TWO);
        const touched = tablesTouchedBy(
            d,
            EditorSelection.create([
                EditorSelection.cursor(d.line(1).from),
                EditorSelection.cursor(d.line(3).from),
                EditorSelection.cursor(d.line(9).from),
            ]),
        );
        expect(touched.map((t) => t.fromLine)).toEqual([1, 7]);
    });
});

describe('rowRanges', () => {
    it('lists the full text range of every row', () => {
        const d = doc(...TABLE);
        const extent = findTableAt(d, 3);
        if (!extent) throw new Error('fixture has no table');
        expect(rowRanges(d, extent)).toEqual(
            [3, 4, 5, 6].map((n) => ({
                from: d.line(n).from,
                to: d.line(n).to,
            })),
        );
    });
});
