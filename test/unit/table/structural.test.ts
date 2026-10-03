import { describe, expect, it } from 'vitest';
import {
    deleteColumn,
    deleteRow,
    insertColumn,
    insertRow,
    moveColumn,
    moveRow,
} from '../../../src/vim/table/structural';

/**
 * Plan E2.3 — text-based structural operations.
 *
 * Every column case asserts the **separator row** too. A column added to the
 * data rows but not to the separator produces a table Obsidian will not
 * render, and a row-level assertion cannot see it — that is the
 * characteristic failure of column operations.
 *
 * Results come back realigned, because `realignTableLines` is what the owned
 * surface's grid is measured against and a ragged intermediate would be a
 * different document from the one the user ends up with.
 */

const TABLE = ['| h1 | h2 |', '| --- | --- |', '| aa | bb |', '| cc | dd |'];

const ALIGNED = [
    '| h1  | h2  |',
    '| --- | --- |',
    '| aa  | bb  |',
    '| cc  | dd  |',
];

describe('insertRow', () => {
    it('adds an empty row below, with the right cell count', () => {
        expect(insertRow(TABLE, 2, 'after')).toStrictEqual([
            '| h1  | h2  |',
            '| --- | --- |',
            '| aa  | bb  |',
            '|     |     |',
            '| cc  | dd  |',
        ]);
    });

    it('adds an empty row above', () => {
        expect(insertRow(TABLE, 2, 'before')).toStrictEqual([
            '| h1  | h2  |',
            '| --- | --- |',
            '|     |     |',
            '| aa  | bb  |',
            '| cc  | dd  |',
        ]);
    });

    it('never inserts between the header and the separator', () => {
        // A row there produces a table no parser renders, and the request can
        // only come from a cursor on the header.
        expect(insertRow(TABLE, 0, 'before')).toStrictEqual([
            '| h1  | h2  |',
            '| --- | --- |',
            '|     |     |',
            '| aa  | bb  |',
            '| cc  | dd  |',
        ]);
    });
});

describe('deleteRow', () => {
    it('removes a data row and leaves the structure intact', () => {
        expect(deleteRow(TABLE, 2)).toStrictEqual([
            '| h1  | h2  |',
            '| --- | --- |',
            '| cc  | dd  |',
        ]);
    });

    it('refuses the header and the separator', () => {
        expect(deleteRow(TABLE, 0)).toBe(TABLE);
        expect(deleteRow(TABLE, 1)).toBe(TABLE);
    });

    it('refuses an out-of-range row', () => {
        expect(deleteRow(TABLE, 99)).toBe(TABLE);
    });
});

describe('moveRow', () => {
    it('swaps two data rows downward', () => {
        expect(moveRow(TABLE, 2, 'down')).toStrictEqual([
            '| h1  | h2  |',
            '| --- | --- |',
            '| cc  | dd  |',
            '| aa  | bb  |',
        ]);
    });

    it('swaps two data rows upward', () => {
        expect(moveRow(TABLE, 3, 'up')).toStrictEqual([
            '| h1  | h2  |',
            '| --- | --- |',
            '| cc  | dd  |',
            '| aa  | bb  |',
        ]);
    });

    it('never moves a row across the separator', () => {
        // Obsidian's own command swaps a data row with the header here, which
        // leaves the table's heading meaning silently changed.
        expect(moveRow(TABLE, 2, 'up')).toBe(TABLE);
        expect(moveRow(TABLE, 3, 'down')).toBe(TABLE);
    });
});

describe('insertColumn', () => {
    it('inserts before the column, separator included', () => {
        expect(insertColumn(TABLE, 0, 'before')).toStrictEqual([
            '|     | h1  | h2  |',
            '| --- | --- | --- |',
            '|     | aa  | bb  |',
            '|     | cc  | dd  |',
        ]);
    });

    it('inserts after the column, separator included', () => {
        expect(insertColumn(TABLE, 0, 'after')).toStrictEqual([
            '| h1  |     | h2  |',
            '| --- | --- | --- |',
            '| aa  |     | bb  |',
            '| cc  |     | dd  |',
        ]);
    });
});

describe('deleteColumn', () => {
    it('removes the column from every row including the separator', () => {
        expect(deleteColumn(TABLE, 0)).toStrictEqual([
            '| h2  |',
            '| --- |',
            '| bb  |',
            '| dd  |',
        ]);
    });

    it('refuses to remove the last column', () => {
        const single = ['| h1  |', '| --- |', '| aa  |'];
        expect(deleteColumn(single, 0)).toBe(single);
    });
});

describe('moveColumn', () => {
    it('swaps columns in every row including the separator', () => {
        expect(moveColumn(TABLE, 0, 'right')).toStrictEqual([
            '| h2  | h1  |',
            '| --- | --- |',
            '| bb  | aa  |',
            '| dd  | cc  |',
        ]);
    });

    it('is a no-op at the left edge', () => {
        // The nav overlay no-ops here too; a scenario starting at column 0 and
        // asserting a swap would assert something that correctly never
        // happens.
        expect(moveColumn(TABLE, 0, 'left')).toBe(TABLE);
    });

    it('is a no-op at the right edge', () => {
        expect(moveColumn(TABLE, 1, 'right')).toBe(TABLE);
    });
});

describe('alignment survives a column operation', () => {
    const aligned = [
        '| h1 | h2 | h3 |',
        '|:---|---:|:--:|',
        '| aa | bb | cc |',
    ];

    it('keeps each column with its own marker when a column moves', () => {
        expect(moveColumn(aligned, 0, 'right')).toStrictEqual([
            '| h2  | h1  | h3  |',
            '| --: | :-- | :-: |',
            '| bb  | aa  | cc  |',
        ]);
    });

    it('gives a new column no alignment', () => {
        expect(insertColumn(aligned, 0, 'before')[1]).toBe(
            '| --- | :-- | --: | :-: |',
        );
    });
});

describe('identity when nothing applies', () => {
    it('returns the same array so a caller can compare by identity', () => {
        expect(deleteRow(TABLE, 1)).toBe(TABLE);
        expect(moveColumn(TABLE, 0, 'left')).toBe(TABLE);
    });

    it('survives a table with no separator', () => {
        const junk = ['| a | b |', '| c | d |'];
        expect(() => deleteRow(junk, 1)).not.toThrow();
        expect(() => insertColumn(junk, 0, 'after')).not.toThrow();
    });

    it('survives an empty input', () => {
        expect(insertRow([], 0, 'after')).toStrictEqual([]);
        expect(deleteColumn([], 0)).toStrictEqual([]);
    });

    it('realigns on the way out', () => {
        // The ragged input and the aligned baseline describe the same table.
        expect(moveRow(TABLE, 2, 'down')[0]).toBe(ALIGNED[0]);
    });
});
