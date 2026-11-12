import { describe, expect, it } from 'vitest';
import {
    autoindentIndents,
    markdownIndents,
} from '../../../src/vim/markdown-indent';

const all = (text: string, sw = 4) => {
    const lines = text.split('\n');
    return markdownIndents(lines, 0, lines.length - 1, sw, 4);
};

describe('markdownIndents', () => {
    it('keeps a nested list one shiftwidth per level', () => {
        expect(all('- a\n\t- b\n- c')).toEqual([0, 4, 0]);
    });

    it('brings an item more than one level deeper back to one', () => {
        expect(all('- a\n\t\t- b')).toEqual([0, 4]);
    });

    it('normalizes two-space nesting to shiftwidth', () => {
        expect(all('- a\n  - b\n    - c\n  - d\n- e')).toEqual([0, 4, 8, 4, 0]);
    });

    it('takes a continuation line to its item text', () => {
        expect(all('- item\ncontinued')).toEqual([0, 2]);
        expect(all('1. one\n   text\n2. two')).toEqual([0, 3, 0]);
    });

    it('takes a paragraph, a heading or a quote to no indent', () => {
        expect(all('para\n\tindented text')).toEqual([0, 0]);
        expect(all('# H\n\ttext')).toEqual([0, 0]);
        expect(all('> quote\n\t> x')).toEqual([0, 0]);
    });

    it('keeps a fenced code block and frontmatter as they are', () => {
        expect(all('```js\n\tcode\n```\n\tafter')).toEqual([
            null,
            null,
            null,
            0,
        ]);
        expect(all('---\n  k: v\n---\n\tx')).toEqual([null, null, null, 0]);
    });

    it('empties a blank line', () => {
        expect(all('- a\n   \n- b')).toEqual([0, 0, 0]);
    });

    it('ends a list at a paragraph after a blank line', () => {
        expect(all('- a\n\nb')).toEqual([0, 0, 0]);
        // An indented line after the blank still continues the item.
        expect(all('- a\n\n\tb')).toEqual([0, 0, 2]);
    });

    it('reads nesting above the range without moving it', () => {
        const lines = ['- a', '\t\t\t- b', '\t\t\t\t- c'];
        // b stays at 12 columns, so c, deeper than b, goes one level past it.
        expect(markdownIndents(lines, 2, 2, 4, 4)).toEqual([16]);
        expect(
            markdownIndents(['- a', '\t- b', '\t\t- c'], 2, 2, 4, 4),
        ).toEqual([8]);
    });
});

// Each row is Neovim 0.12.6's = on a Markdown buffer, which has no
// 'indentexpr', with tabstop=4: [text, first, last, columns per line].
describe('autoindentIndents', () => {
    it.each<[string, number, number, number[]]>([
        ['\tfoo\n\nbar', 2, 2, [4]],
        ['\tfoo\n   \nbar', 2, 2, [4]],
        ['\tfoo\n\nbar', 0, 2, [0, 0, 0]],
        ['  foo\nbar', 1, 1, [2]],
        ['\t\tfoo\nbar\nbaz', 1, 2, [8, 8]],
        ['    foo\n\tbar', 1, 1, [4]],
        ['a\n\tb\n\t\tc\nd', 2, 2, [4]],
        ['x\n\n\n\ty', 3, 3, [0]],
        ['- a\n\t- b\n\t\t- c', 0, 2, [0, 0, 0]],
        ['- a\n\t- b\n- c', 1, 1, [0]],
    ])('%j lines %i-%i', (text, first, last, expected) => {
        expect(autoindentIndents(text.split('\n'), first, last, 4)).toEqual(
            expected,
        );
    });
});
