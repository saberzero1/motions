import { describe, it, expect } from 'vitest';
import { findSubwordBoundaries, findSubwordEnds } from '../../src/util/subword';
import {
    subwordForward,
    subwordBackward,
    subwordEndForward,
    subwordEndBackward,
} from '../../src/motions/subword';

describe('findSubwordBoundaries', () => {
    it.each([
        ['camelCase', [0, 5]],
        ['snake_case_word', [0, 6, 11]],
        ['kebab-case-word', [0, 6, 11]],
        ['HTMLParser', [0, 4]],
        ['getHTMLElement', [0, 3, 7]],
        ['ALLCAPS', [0]],
        ['simple', [0]],
        ['a', [0]],
        ['', []],
        ['  ---  ', []],
        ['word123number', [0, 4, 7]],
        ['XMLHTTPRequest', [0, 7]],
        ['__dunder__', [2]],
    ] as [string, number[]][])(
        'returns correct boundaries for %j',
        (input, expected) => {
            expect(findSubwordBoundaries(input)).toEqual(expected);
        },
    );
});

describe('findSubwordEnds', () => {
    it.each([
        ['camelCase', [5, 9]],
        ['snake_case', [5, 10]],
        ['HTMLParser', [4, 10]],
        ['', []],
    ] as [string, number[]][])(
        'returns correct ends for %j',
        (input, expected) => {
            expect(findSubwordEnds(input)).toEqual(expected);
        },
    );
});

describe('subword motions', () => {
    function mockCm(lines: string[]) {
        return {
            getLine(n: number) {
                return lines[n] ?? '';
            },
            firstLine() {
                return 0;
            },
            lastLine() {
                return lines.length - 1;
            },
        };
    }

    const motionArgs = (repeat = 1) => ({ repeat });

    describe('subwordForward', () => {
        it('moves to next subword boundary', () => {
            const cm = mockCm(['camelCaseWord']);
            const result = subwordForward(
                cm,
                { line: 0, ch: 0 },
                motionArgs(),
                undefined as never,
                undefined,
            );
            expect(result).toEqual({ line: 0, ch: 5 });
        });

        it('moves from second subword to third', () => {
            const cm = mockCm(['camelCaseWord']);
            const result = subwordForward(
                cm,
                { line: 0, ch: 5 },
                motionArgs(),
                undefined as never,
                undefined,
            );
            expect(result).toEqual({ line: 0, ch: 9 });
        });

        it('respects repeat count', () => {
            const cm = mockCm(['camelCaseWord']);
            const result = subwordForward(
                cm,
                { line: 0, ch: 0 },
                motionArgs(2),
                undefined as never,
                undefined,
            );
            expect(result).toEqual({ line: 0, ch: 9 });
        });

        it('wraps to next line', () => {
            const cm = mockCm(['end', 'startWord']);
            const result = subwordForward(
                cm,
                { line: 0, ch: 0 },
                motionArgs(),
                undefined as never,
                undefined,
            );
            expect(result).toEqual({ line: 1, ch: 0 });
        });

        it('returns head at end of file', () => {
            const cm = mockCm(['word']);
            const head = { line: 0, ch: 0 };
            const result = subwordForward(
                cm,
                head,
                motionArgs(),
                undefined as never,
                undefined,
            );
            expect(result).toEqual(head);
        });

        it('skips blank lines when crossing lines', () => {
            const cm = mockCm(['end', '', 'next']);
            const result = subwordForward(
                cm,
                { line: 0, ch: 0 },
                motionArgs(),
                undefined as never,
                undefined,
            );
            expect(result).toEqual({ line: 2, ch: 0 });
        });
    });

    describe('subwordBackward', () => {
        it('moves to previous subword boundary', () => {
            const cm = mockCm(['camelCaseWord']);
            const result = subwordBackward(
                cm,
                { line: 0, ch: 9 },
                motionArgs(),
                undefined as never,
                undefined,
            );
            expect(result).toEqual({ line: 0, ch: 5 });
        });

        it('moves from second subword to first', () => {
            const cm = mockCm(['camelCaseWord']);
            const result = subwordBackward(
                cm,
                { line: 0, ch: 5 },
                motionArgs(),
                undefined as never,
                undefined,
            );
            expect(result).toEqual({ line: 0, ch: 0 });
        });

        it('respects repeat count', () => {
            const cm = mockCm(['camelCaseWord']);
            const result = subwordBackward(
                cm,
                { line: 0, ch: 9 },
                motionArgs(2),
                undefined as never,
                undefined,
            );
            expect(result).toEqual({ line: 0, ch: 0 });
        });

        it('wraps to previous line', () => {
            const cm = mockCm(['camelCase', 'next']);
            const result = subwordBackward(
                cm,
                { line: 1, ch: 0 },
                motionArgs(),
                undefined as never,
                undefined,
            );
            expect(result).toEqual({ line: 0, ch: 5 });
        });

        it('returns head at start of file', () => {
            const cm = mockCm(['word']);
            const head = { line: 0, ch: 0 };
            const result = subwordBackward(
                cm,
                head,
                motionArgs(),
                undefined as never,
                undefined,
            );
            expect(result).toEqual(head);
        });
    });

    describe('subwordEndForward', () => {
        it('moves to end of current subword', () => {
            const cm = mockCm(['camelCaseWord']);
            const result = subwordEndForward(
                cm,
                { line: 0, ch: 0 },
                motionArgs(),
                undefined as never,
                undefined,
            );
            expect(result).toEqual({ line: 0, ch: 4 });
        });

        it('moves to end of next subword', () => {
            const cm = mockCm(['camelCaseWord']);
            const result = subwordEndForward(
                cm,
                { line: 0, ch: 4 },
                motionArgs(),
                undefined as never,
                undefined,
            );
            expect(result).toEqual({ line: 0, ch: 8 });
        });

        it('respects repeat count', () => {
            const cm = mockCm(['camelCaseWord']);
            const result = subwordEndForward(
                cm,
                { line: 0, ch: 0 },
                motionArgs(2),
                undefined as never,
                undefined,
            );
            expect(result).toEqual({ line: 0, ch: 8 });
        });

        it('wraps to next line', () => {
            const cm = mockCm(['ab', 'camelCase']);
            const result = subwordEndForward(
                cm,
                { line: 0, ch: 1 },
                motionArgs(),
                undefined as never,
                undefined,
            );
            expect(result).toEqual({ line: 1, ch: 4 });
        });

        it('returns head at end of file', () => {
            const cm = mockCm(['ab']);
            const head = { line: 0, ch: 1 };
            const result = subwordEndForward(
                cm,
                head,
                motionArgs(),
                undefined as never,
                undefined,
            );
            expect(result).toEqual(head);
        });
    });

    describe('subwordEndBackward', () => {
        it('moves to end of previous subword', () => {
            const cm = mockCm(['camelCaseWord']);
            const result = subwordEndBackward(
                cm,
                { line: 0, ch: 12 },
                motionArgs(),
                undefined as never,
                undefined,
            );
            expect(result).toEqual({ line: 0, ch: 8 });
        });

        it('respects repeat count', () => {
            const cm = mockCm(['camelCaseWord']);
            const result = subwordEndBackward(
                cm,
                { line: 0, ch: 12 },
                motionArgs(2),
                undefined as never,
                undefined,
            );
            expect(result).toEqual({ line: 0, ch: 4 });
        });

        it('wraps to previous line', () => {
            const cm = mockCm(['camelCase', 'x']);
            const result = subwordEndBackward(
                cm,
                { line: 1, ch: 0 },
                motionArgs(),
                undefined as never,
                undefined,
            );
            expect(result).toEqual({ line: 0, ch: 8 });
        });

        it('returns head at start of file', () => {
            const cm = mockCm(['word']);
            const head = { line: 0, ch: 0 };
            const result = subwordEndBackward(
                cm,
                head,
                motionArgs(),
                undefined as never,
                undefined,
            );
            expect(result).toEqual(head);
        });
    });
});
