import { describe, expect, it } from 'vitest';
import { realignTableLines } from '../../../src/vim/table-utils';

/**
 * Plan E1.1 — the width model `realignTableLines` pads by.
 *
 * `realignTableLines` had **no unit coverage at all**, which is how a
 * deliberately wrong width model passed 3543 unit tests during a negative
 * control. These cases are the fast-feedback half of
 * `test/specs/table-realign-conformance.e2e.ts`, which compares the same
 * function against Obsidian's live `TableEditor.rebuildTable()`.
 *
 * The expectations are **harvested from Obsidian**, not hand-written, and the
 * e2e spec is what keeps them honest. Obsidian pads by UTF-16 `String.length`,
 * not by display width:
 *
 * | specimen  | `.length` | display width | Obsidian's column |
 * |-----------|-----------|---------------|-------------------|
 * | `日本語`  | 3         | 6             | **3**             |
 * | ZWJ emoji | 8         | 2             | **8**             |
 * | flag      | 4         | 2             | **4**             |
 * | `日a😀`   | 4         | 5             | **4**             |
 */

const format = (specimen: string): string =>
    realignTableLines(['|h|x|', '|---|---|', `|${specimen}|y|`]).join('\n');

describe('realignTableLines width model', () => {
    it.each([
        ['ascii', 'ab', '| h   | x   |\n| --- | --- |\n| ab  | y   |'],
        [
            'cjk stays at length 3, not display width 6',
            '\u65e5\u672c\u8a9e',
            '| h   | x   |\n| --- | --- |\n| \u65e5\u672c\u8a9e | y   |',
        ],
        [
            'a combining mark counts both code units',
            'e\u0301',
            '| h   | x   |\n| --- | --- |\n| e\u0301  | y   |',
        ],
        [
            'an emoji counts its surrogate pair',
            '\ud83d\ude00',
            '| h   | x   |\n| --- | --- |\n| \ud83d\ude00  | y   |',
        ],
        [
            'a ZWJ sequence counts all eight units',
            '\ud83d\udc68\u200d\ud83d\udc69\u200d\ud83d\udc67',
            '| h        | x   |\n| -------- | --- |\n| \ud83d\udc68\u200d\ud83d\udc69\u200d\ud83d\udc67 | y   |',
        ],
        [
            'a flag counts its two regional indicators',
            '\ud83c\uddef\ud83c\uddf5',
            '| h    | x   |\n| ---- | --- |\n| \ud83c\uddef\ud83c\uddf5 | y   |',
        ],
        [
            'an escaped pipe counts its backslash',
            'a\\|b',
            '| h    | x   |\n| ---- | --- |\n| a\\|b | y   |',
        ],
        [
            'a wikilink containing a pipe is one cell',
            '[[p\\|al]]',
            '| h         | x   |\n| --------- | --- |\n| [[p\\|al]] | y   |',
        ],
        [
            'mixed scripts count units, not columns',
            '\u65e5a\ud83d\ude00',
            '| h    | x   |\n| ---- | --- |\n| \u65e5a\ud83d\ude00 | y   |',
        ],
    ])('%s', (_name, specimen, expected) => {
        expect(format(specimen)).toBe(expected);
    });

    it('pads every column to a minimum of three', () => {
        expect(realignTableLines(['|a|b|', '|-|-|', '|c|d|'])).toStrictEqual([
            '| a   | b   |',
            '| --- | --- |',
            '| c   | d   |',
        ]);
    });

    it('keeps alignment markers from the separator row', () => {
        expect(
            realignTableLines(['|a|b|c|', '|:-|-:|:-:|', '|d|e|f|']),
        ).toStrictEqual([
            '| a   | b   | c   |',
            '| :-- | --: | :-: |',
            '| d   | e   | f   |',
        ]);
    });
});
