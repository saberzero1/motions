import { describe, expect, it } from 'vitest';
import { minimalDiff } from '../../../src/vim/table/sync-up';

/**
 * Plan B Step 5.
 *
 * The load-bearing property is **minimality**. Forwarding the whole table as
 * one region-replacing change made the parent's vim record the entire synced
 * span in `lastInsertModeChanges`, so `.` replayed it: a single typed `Q`
 * produced `| Qaa   Qaa  |`. A one-character edit has to arrive as a
 * one-character insert.
 */

describe('minimalDiff', () => {
    it('reports nothing for identical text', () => {
        expect(minimalDiff('| aa |', '| aa |')).toBeNull();
    });

    it('reduces a single typed character to a single-character insert', () => {
        expect(minimalDiff('| aa   |', '| Qaa   |')).toStrictEqual({
            from: 2,
            to: 2,
            insert: 'Q',
        });
    });

    it('reduces a single deletion to an empty insert', () => {
        expect(minimalDiff('| Qaa   |', '| aa   |')).toStrictEqual({
            from: 2,
            to: 3,
            insert: '',
        });
    });

    it('keeps a repeated character edit to one character, not the whole run', () => {
        // Position inside the run is not determined — prefix-first lands at the
        // end of it — but the SIZE is what dot-repeat depends on. Asserting a
        // hand-picked offset here failed against an equally correct result.
        const diff = minimalDiff('| aa |', '| aaa |');
        if (!diff) throw new Error('expected a diff');
        expect(diff.insert).toBe('a');
        expect(diff.to - diff.from).toBe(0);
    });

    it('handles an edit at the very start and the very end', () => {
        expect(minimalDiff('abc', 'Xabc')).toStrictEqual({
            from: 0,
            to: 0,
            insert: 'X',
        });
        expect(minimalDiff('abc', 'abcX')).toStrictEqual({
            from: 3,
            to: 3,
            insert: 'X',
        });
    });

    it('handles a newline insertion, which grows the table by a row', () => {
        const diff = minimalDiff('| a |\n| b |', '| a |\n\n| b |');
        if (!diff) throw new Error('expected a diff');
        expect(diff.insert).toBe('\n');
        expect(diff.to - diff.from).toBe(0);
    });

    it('describes a replacement as one region', () => {
        expect(minimalDiff('| aa |', '| zz |')).toStrictEqual({
            from: 2,
            to: 4,
            insert: 'zz',
        });
    });

    it('handles emptying and filling', () => {
        expect(minimalDiff('abc', '')).toStrictEqual({
            from: 0,
            to: 3,
            insert: '',
        });
        expect(minimalDiff('', 'abc')).toStrictEqual({
            from: 0,
            to: 0,
            insert: 'abc',
        });
    });

    it('round-trips exactly even when the region splits a surrogate pair', () => {
        // Two emoji sharing a high surrogate diff to the low surrogate alone,
        // so the region boundary DOES fall inside the pair. Measured, against
        // an earlier claim here that it never does. That is fine: offsets are
        // code units, and reassembly is exact.
        const before = 'a\u{1F600}b';
        const after = 'a\u{1F601}b';
        const diff = minimalDiff(before, after);
        if (!diff) throw new Error('expected a diff');
        expect(
            before.slice(0, diff.from) + diff.insert + before.slice(diff.to),
        ).toBe(after);
        expect(diff.insert.length).toBe(1);
    });

    it('round-trips: applying the diff reproduces the target', () => {
        const cases: [string, string][] = [
            ['| aa   | 11 |', '| aaa  | 11 |'],
            ['| aa   | 11 |', '| aa   | 1 |'],
            ['one\ntwo', 'one\ntwo\nthree'],
            ['one\ntwo\nthree', 'one\nthree'],
            ['', 'x'],
            ['x', ''],
        ];
        for (const [before, after] of cases) {
            const diff = minimalDiff(before, after);
            if (!diff) throw new Error(`expected a diff for ${before}`);
            const applied =
                before.slice(0, diff.from) +
                diff.insert +
                before.slice(diff.to);
            expect(applied).toBe(after);
        }
    });
});
