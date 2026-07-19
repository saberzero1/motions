import { describe, it, expect } from 'vitest';
import {
    subwordInnerTextObject,
    subwordAroundTextObject,
} from '../../src/text-objects/subword';
import {
    numberInnerTextObject,
    numberAroundTextObject,
} from '../../src/text-objects/number';
import {
    anyQuoteInnerTextObject,
    anyQuoteAroundTextObject,
} from '../../src/text-objects/any-quote';
import {
    createDoubleBracketInner,
    createDoubleBracketAround,
} from '../../src/text-objects/double-bracket';
import { urlTextObject } from '../../src/text-objects/url';
import {
    argumentInnerTextObject,
    argumentAroundTextObject,
} from '../../src/text-objects/argument';
import type {
    CmAdapter,
    VimState,
    MotionArgs,
    VimPos,
} from '../../src/types/vim-api';

// --- Test helpers ---

function mockCm(lines: string | string[]): CmAdapter {
    const lineArray = typeof lines === 'string' ? [lines] : lines;
    return {
        getLine(n: number) {
            return lineArray[n] ?? '';
        },
        firstLine() {
            return 0;
        },
        lastLine() {
            return lineArray.length - 1;
        },
    } as unknown as CmAdapter;
}

const mockVim: VimState = {};
const mockMotionArgs: MotionArgs = { repeat: 1 };

type TextObjectResult = [VimPos, VimPos] | null | undefined;

function callTextObject(
    fn: typeof subwordInnerTextObject,
    line: string,
    ch: number,
): TextObjectResult {
    const cm = mockCm(line);
    const head: VimPos = { line: 0, ch };
    return fn(cm, head, mockMotionArgs, mockVim, undefined) as TextObjectResult;
}

function callTextObjectMultiline(
    fn: typeof subwordInnerTextObject,
    lines: string[],
    pos: VimPos,
): TextObjectResult {
    const cm = mockCm(lines);
    return fn(cm, pos, mockMotionArgs, mockVim, undefined) as TextObjectResult;
}

// --- Subword text object (iS/aS) ---

describe('subwordInnerTextObject', () => {
    it('selects camelCase segment "Case"', () => {
        const result = callTextObject(
            subwordInnerTextObject,
            'camelCaseWord',
            6,
        );
        expect(result).not.toBeNull();
        const [from, to] = result!;
        expect(from).toEqual({ line: 0, ch: 5 });
        expect(to).toEqual({ line: 0, ch: 9 });
    });

    it('selects snake_case segment "case"', () => {
        const result = callTextObject(
            subwordInnerTextObject,
            'snake_case_word',
            7,
        );
        expect(result).not.toBeNull();
        const [from, to] = result!;
        expect(from).toEqual({ line: 0, ch: 6 });
        expect(to).toEqual({ line: 0, ch: 10 });
    });

    it('selects whole simple word', () => {
        const result = callTextObject(subwordInnerTextObject, 'simple', 2);
        expect(result).not.toBeNull();
        const [from, to] = result!;
        expect(from).toEqual({ line: 0, ch: 0 });
        expect(to).toEqual({ line: 0, ch: 6 });
    });

    it('returns null on whitespace-only', () => {
        const result = callTextObject(subwordInnerTextObject, '   ', 1);
        expect(result).toBeNull();
    });

    it('selects first segment of camelCase at start', () => {
        const result = callTextObject(subwordInnerTextObject, 'camelCase', 0);
        expect(result).not.toBeNull();
        const [from, to] = result!;
        expect(from).toEqual({ line: 0, ch: 0 });
        expect(to).toEqual({ line: 0, ch: 5 });
    });
});

describe('subwordAroundTextObject', () => {
    it('includes trailing separator for snake_case', () => {
        const result = callTextObject(
            subwordAroundTextObject,
            'snake_case_word',
            0,
        );
        expect(result).not.toBeNull();
        const [from, to] = result!;
        // "snake" is [0,5), around includes trailing "_"
        expect(from).toEqual({ line: 0, ch: 0 });
        expect(to).toEqual({ line: 0, ch: 6 });
    });

    it('includes leading separator when no trailing', () => {
        const result = callTextObject(subwordAroundTextObject, 'snake_case', 6);
        expect(result).not.toBeNull();
        const [from, to] = result!;
        // "case" is [6,10), no trailing sep, leading "_" at 5
        expect(from).toEqual({ line: 0, ch: 5 });
        expect(to).toEqual({ line: 0, ch: 10 });
    });
});

// --- Number text object (in/an) ---

describe('numberInnerTextObject', () => {
    it('selects basic integer', () => {
        const result = callTextObject(numberInnerTextObject, 'value = 42', 8);
        expect(result).not.toBeNull();
        const [from, to] = result!;
        expect(from).toEqual({ line: 0, ch: 8 });
        expect(to).toEqual({ line: 0, ch: 10 });
    });

    it('selects negative float', () => {
        const result = callTextObject(numberInnerTextObject, 'x = -3.14', 5);
        expect(result).not.toBeNull();
        const [from, to] = result!;
        expect(from).toEqual({ line: 0, ch: 4 });
        expect(to).toEqual({ line: 0, ch: 9 });
    });

    it('returns null when no numbers present', () => {
        const result = callTextObject(numberInnerTextObject, 'no numbers', 3);
        expect(result).toBeNull();
    });

    it('seeks forward to next number when cursor is before', () => {
        const result = callTextObject(
            numberInnerTextObject,
            'before 99 after',
            3,
        );
        expect(result).not.toBeNull();
        const [from, to] = result!;
        expect(from).toEqual({ line: 0, ch: 7 });
        expect(to).toEqual({ line: 0, ch: 9 });
    });

    it('selects number at exact start', () => {
        const result = callTextObject(numberInnerTextObject, '123abc', 0);
        expect(result).not.toBeNull();
        const [from, to] = result!;
        expect(from).toEqual({ line: 0, ch: 0 });
        expect(to).toEqual({ line: 0, ch: 3 });
    });
});

describe('numberAroundTextObject', () => {
    it('includes trailing whitespace', () => {
        const result = callTextObject(numberAroundTextObject, 'x = 42 ;', 4);
        expect(result).not.toBeNull();
        const [from, to] = result!;
        expect(from).toEqual({ line: 0, ch: 4 });
        expect(to).toEqual({ line: 0, ch: 7 });
    });

    it('includes leading whitespace when no trailing', () => {
        const result = callTextObject(numberAroundTextObject, 'value 99', 6);
        expect(result).not.toBeNull();
        const [from, to] = result!;
        expect(from).toEqual({ line: 0, ch: 5 });
        expect(to).toEqual({ line: 0, ch: 8 });
    });
});

// --- Any-quote text object (iq/aq) ---

describe('anyQuoteInnerTextObject', () => {
    it('selects content inside double quotes', () => {
        const result = callTextObject(
            anyQuoteInnerTextObject,
            'say "hello" now',
            6,
        );
        expect(result).not.toBeNull();
        const [from, to] = result!;
        expect(from).toEqual({ line: 0, ch: 5 });
        expect(to).toEqual({ line: 0, ch: 10 });
    });

    it('selects content inside single quotes', () => {
        const result = callTextObject(
            anyQuoteInnerTextObject,
            "see 'test' here",
            6,
        );
        expect(result).not.toBeNull();
        const [from, to] = result!;
        expect(from).toEqual({ line: 0, ch: 5 });
        expect(to).toEqual({ line: 0, ch: 9 });
    });

    it('selects content inside backticks', () => {
        const result = callTextObject(
            anyQuoteInnerTextObject,
            'use `code` here',
            6,
        );
        expect(result).not.toBeNull();
        const [from, to] = result!;
        expect(from).toEqual({ line: 0, ch: 5 });
        expect(to).toEqual({ line: 0, ch: 9 });
    });

    it('returns null when no quotes present', () => {
        const result = callTextObject(anyQuoteInnerTextObject, 'no quotes', 3);
        expect(result).toBeNull();
    });

    it('seeks forward to next quote pair when cursor is before', () => {
        const result = callTextObject(
            anyQuoteInnerTextObject,
            'before "word" after',
            0,
        );
        expect(result).not.toBeNull();
        const [from, to] = result!;
        expect(from).toEqual({ line: 0, ch: 8 });
        expect(to).toEqual({ line: 0, ch: 12 });
    });

    it('returns null for empty quotes', () => {
        const result = callTextObject(anyQuoteInnerTextObject, 'empty ""', 7);
        expect(result).toBeNull();
    });

    it('handles escaped quotes', () => {
        const result = callTextObject(
            anyQuoteInnerTextObject,
            'say "he\\"llo" end',
            6,
        );
        expect(result).not.toBeNull();
        const [from, to] = result!;
        expect(from).toEqual({ line: 0, ch: 5 });
        expect(to).toEqual({ line: 0, ch: 12 });
    });
});

describe('anyQuoteAroundTextObject', () => {
    it('includes the quotes themselves', () => {
        const result = callTextObject(
            anyQuoteAroundTextObject,
            'say "hello" now',
            6,
        );
        expect(result).not.toBeNull();
        const [from, to] = result!;
        expect(from).toEqual({ line: 0, ch: 4 });
        expect(to).toEqual({ line: 0, ch: 11 });
    });

    it('includes single quotes', () => {
        const result = callTextObject(
            anyQuoteAroundTextObject,
            "has 'val' end",
            6,
        );
        expect(result).not.toBeNull();
        const [from, to] = result!;
        expect(from).toEqual({ line: 0, ch: 4 });
        expect(to).toEqual({ line: 0, ch: 9 });
    });
});

// --- Double-bracket text object (iD/aD) ---

describe('createDoubleBracketInner', () => {
    const doubleBracketInner = createDoubleBracketInner(100);

    it('selects content between [[ and ]]', () => {
        const result = callTextObject(
            doubleBracketInner,
            'see [[link]] here',
            7,
        );
        expect(result).not.toBeNull();
        const [from, to] = result!;
        expect(from).toEqual({ line: 0, ch: 6 });
        expect(to).toEqual({ line: 0, ch: 10 });
    });

    it('returns null when no brackets present', () => {
        const result = callTextObject(doubleBracketInner, 'no brackets', 5);
        expect(result).toBeNull();
    });

    it('selects content with pipe alias', () => {
        const result = callTextObject(
            doubleBracketInner,
            'see [[page|alias]] end',
            10,
        );
        expect(result).not.toBeNull();
        const [from, to] = result!;
        expect(from).toEqual({ line: 0, ch: 6 });
        expect(to).toEqual({ line: 0, ch: 16 });
    });

    it('returns null for empty brackets [[]]', () => {
        const result = callTextObject(doubleBracketInner, 'empty [[]] here', 6);
        expect(result).toBeNull();
    });

    it('works with multiline content', () => {
        const lines = ['start [[', 'content', ']] end'];
        const result = callTextObjectMultiline(doubleBracketInner, lines, {
            line: 1,
            ch: 3,
        });
        expect(result).not.toBeNull();
        const [from, to] = result!;
        expect(from).toEqual({ line: 0, ch: 8 });
        expect(to).toEqual({ line: 2, ch: 0 });
    });
});

describe('createDoubleBracketAround', () => {
    const doubleBracketAround = createDoubleBracketAround(100);

    it('includes the [[ and ]] delimiters', () => {
        const result = callTextObject(
            doubleBracketAround,
            'see [[link]] here',
            7,
        );
        expect(result).not.toBeNull();
        const [from, to] = result!;
        expect(from).toEqual({ line: 0, ch: 4 });
        expect(to).toEqual({ line: 0, ch: 12 });
    });
});

// --- URL text object (gL) ---

describe('urlTextObject', () => {
    it('selects a basic URL', () => {
        const result = callTextObject(
            urlTextObject,
            'go to https://example.com now',
            10,
        );
        expect(result).not.toBeNull();
        const [from, to] = result!;
        expect(from).toEqual({ line: 0, ch: 6 });
        expect(to).toEqual({ line: 0, ch: 25 });
    });

    it('returns null when no URL present', () => {
        const result = callTextObject(urlTextObject, 'no url here', 3);
        expect(result).toBeNull();
    });

    it('trims trailing period', () => {
        const result = callTextObject(
            urlTextObject,
            'See http://example.com/path.',
            10,
        );
        expect(result).not.toBeNull();
        const [from, to] = result!;
        expect(from).toEqual({ line: 0, ch: 4 });
        expect(to).toEqual({ line: 0, ch: 27 });
    });

    it('trims trailing comma', () => {
        const result = callTextObject(
            urlTextObject,
            'link: https://x.co/a, more',
            10,
        );
        expect(result).not.toBeNull();
        const [from, to] = result!;
        expect(from).toEqual({ line: 0, ch: 6 });
        expect(to).toEqual({ line: 0, ch: 20 });
    });

    it('trims unbalanced trailing paren', () => {
        const result = callTextObject(
            urlTextObject,
            '(https://example.com/path)',
            10,
        );
        expect(result).not.toBeNull();
        const [from, to] = result!;
        expect(from).toEqual({ line: 0, ch: 1 });
        expect(to).toEqual({ line: 0, ch: 25 });
    });

    it('stops before excluded chars like )', () => {
        const result = callTextObject(
            urlTextObject,
            'see https://en.wikipedia.org/wiki/Test_(page) end',
            10,
        );
        expect(result).not.toBeNull();
        const [from, to] = result!;
        expect(from).toEqual({ line: 0, ch: 4 });
        expect(to).toEqual({ line: 0, ch: 44 });
    });

    it('seeks forward to URL when cursor is before', () => {
        const result = callTextObject(urlTextObject, 'go https://x.com end', 0);
        expect(result).not.toBeNull();
        const [from, to] = result!;
        expect(from).toEqual({ line: 0, ch: 3 });
        expect(to).toEqual({ line: 0, ch: 16 });
    });
});

// --- Argument text object (i,/a,) ---

describe('argumentInnerTextObject', () => {
    it('selects middle argument trimmed', () => {
        const result = callTextObject(
            argumentInnerTextObject,
            'fn(a, b, c)',
            6,
        );
        expect(result).not.toBeNull();
        const [from, to] = result!;
        expect(from).toEqual({ line: 0, ch: 6 });
        expect(to).toEqual({ line: 0, ch: 7 });
    });

    it('selects first argument', () => {
        const result = callTextObject(
            argumentInnerTextObject,
            'fn(first, second)',
            4,
        );
        expect(result).not.toBeNull();
        const [from, to] = result!;
        expect(from).toEqual({ line: 0, ch: 3 });
        expect(to).toEqual({ line: 0, ch: 8 });
    });

    it('selects last argument', () => {
        const result = callTextObject(
            argumentInnerTextObject,
            'fn(a, last)',
            7,
        );
        expect(result).not.toBeNull();
        const [from, to] = result!;
        expect(from).toEqual({ line: 0, ch: 6 });
        expect(to).toEqual({ line: 0, ch: 10 });
    });

    it('returns null for empty parens', () => {
        const result = callTextObject(argumentInnerTextObject, 'fn()', 3);
        expect(result).toBeNull();
    });

    it('handles nested brackets', () => {
        const result = callTextObject(
            argumentInnerTextObject,
            'fn(a, [x, y], c)',
            14,
        );
        expect(result).not.toBeNull();
        const [from, to] = result!;
        expect(from).toEqual({ line: 0, ch: 14 });
        expect(to).toEqual({ line: 0, ch: 15 });
    });

    it('handles single argument', () => {
        const result = callTextObject(argumentInnerTextObject, 'fn(only)', 4);
        expect(result).not.toBeNull();
        const [from, to] = result!;
        expect(from).toEqual({ line: 0, ch: 3 });
        expect(to).toEqual({ line: 0, ch: 7 });
    });
});

describe('argumentAroundTextObject', () => {
    it('includes trailing comma and space for middle argument', () => {
        const result = callTextObject(
            argumentAroundTextObject,
            'fn(a, b, c)',
            6,
        );
        expect(result).not.toBeNull();
        const [from, to] = result!;
        // Middle arg "b" — right boundary is comma, includes ", "
        expect(from).toEqual({ line: 0, ch: 6 });
        expect(to).toEqual({ line: 0, ch: 9 });
    });

    it('includes leading comma for last argument', () => {
        const result = callTextObject(
            argumentAroundTextObject,
            'fn(a, last)',
            7,
        );
        expect(result).not.toBeNull();
        const [from, to] = result!;
        // "last" — left boundary is comma, includes ", " before
        expect(from).toEqual({ line: 0, ch: 4 });
        expect(to).toEqual({ line: 0, ch: 10 });
    });

    it('returns null for empty parens', () => {
        const result = callTextObject(argumentAroundTextObject, 'fn()', 3);
        expect(result).toBeNull();
    });
});
