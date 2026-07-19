import { describe, it, expect } from 'vitest';
import { createAsymmetricPairTextObject } from '../../src/text-objects/pair-util';
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

function callPairTextObject(
    open: string,
    close: string,
    lines: string | string[],
    pos: VimPos,
    inner: boolean,
    options?: { multiline?: boolean; scanLimit?: number },
): TextObjectResult {
    const multiline = options?.multiline ?? true;
    const scanLimit = options?.scanLimit ?? 50;
    const fn = createAsymmetricPairTextObject(
        open,
        close,
        multiline,
        inner,
        scanLimit,
    );
    const cm = mockCm(lines);
    return fn(cm, pos, mockMotionArgs, mockVim, undefined) as TextObjectResult;
}

// --- Asymmetric pairs (open !== close) ---

describe('createAsymmetricPairTextObject - asymmetric pairs', () => {
    describe('basic pair < / >', () => {
        it('selects inner content between angle brackets', () => {
            const result = callPairTextObject(
                '<',
                '>',
                'say <hello> end',
                { line: 0, ch: 6 },
                true,
            );
            expect(result).not.toBeNull();
            const [from, to] = result!;
            expect(from).toEqual({ line: 0, ch: 5 });
            expect(to).toEqual({ line: 0, ch: 10 });
        });

        it('selects around including delimiters', () => {
            const result = callPairTextObject(
                '<',
                '>',
                'say <hello> end',
                { line: 0, ch: 6 },
                false,
            );
            expect(result).not.toBeNull();
            const [from, to] = result!;
            expect(from).toEqual({ line: 0, ch: 4 });
            expect(to).toEqual({ line: 0, ch: 11 });
        });

        it('returns null when no brackets present', () => {
            const result = callPairTextObject(
                '<',
                '>',
                'no brackets here',
                { line: 0, ch: 5 },
                true,
            );
            expect(result).toBeNull();
        });
    });

    describe('nesting ( / )', () => {
        it('selects innermost pair when cursor inside nested parens', () => {
            // f(g(x))  cursor at 4 is on 'x', inside inner ()
            const result = callPairTextObject(
                '(',
                ')',
                'f(g(x))',
                { line: 0, ch: 4 },
                true,
            );
            expect(result).not.toBeNull();
            const [from, to] = result!;
            expect(from).toEqual({ line: 0, ch: 4 });
            expect(to).toEqual({ line: 0, ch: 5 });
        });

        it('selects outer pair when cursor is in outer context', () => {
            // f(g(x))  cursor at 2 is on 'g', inside outer () but outside inner
            const result = callPairTextObject(
                '(',
                ')',
                'f(g(x))',
                { line: 0, ch: 2 },
                true,
            );
            expect(result).not.toBeNull();
            const [from, to] = result!;
            expect(from).toEqual({ line: 0, ch: 2 });
            expect(to).toEqual({ line: 0, ch: 6 });
        });
    });

    describe('multi-char delimiters [[ / ]]', () => {
        it('selects inner content between wikilink brackets', () => {
            const result = callPairTextObject(
                '[[',
                ']]',
                'see [[link]] end',
                { line: 0, ch: 7 },
                true,
            );
            expect(result).not.toBeNull();
            const [from, to] = result!;
            expect(from).toEqual({ line: 0, ch: 6 });
            expect(to).toEqual({ line: 0, ch: 10 });
        });

        it('selects around including multi-char brackets', () => {
            const result = callPairTextObject(
                '[[',
                ']]',
                'see [[link]] end',
                { line: 0, ch: 7 },
                false,
            );
            expect(result).not.toBeNull();
            const [from, to] = result!;
            expect(from).toEqual({ line: 0, ch: 4 });
            expect(to).toEqual({ line: 0, ch: 12 });
        });
    });

    describe('multi-line', () => {
        it('finds pair spanning multiple lines', () => {
            const lines = ['start (', '  content', ')'];
            const result = callPairTextObject(
                '(',
                ')',
                lines,
                { line: 1, ch: 3 },
                true,
            );
            expect(result).not.toBeNull();
            const [from, to] = result!;
            expect(from).toEqual({ line: 0, ch: 7 });
            expect(to).toEqual({ line: 2, ch: 0 });
        });

        it('selects around including delimiters across lines', () => {
            const lines = ['start (', '  content', ')'];
            const result = callPairTextObject(
                '(',
                ')',
                lines,
                { line: 1, ch: 3 },
                false,
            );
            expect(result).not.toBeNull();
            const [from, to] = result!;
            expect(from).toEqual({ line: 0, ch: 6 });
            expect(to).toEqual({ line: 2, ch: 1 });
        });
    });

    describe('scanLimit', () => {
        it('returns null when pair is beyond scanLimit', () => {
            // Create 60 lines with open paren on line 0 and close on line 59
            const lines = ['('];
            for (let i = 1; i < 59; i++) {
                lines.push('  line ' + i);
            }
            lines.push(')');
            // Cursor at line 30, scanLimit = 5 (can't reach either delimiter)
            const result = callPairTextObject(
                '(',
                ')',
                lines,
                { line: 30, ch: 2 },
                true,
                { scanLimit: 5 },
            );
            expect(result).toBeNull();
        });

        it('finds pair within scanLimit', () => {
            const lines = ['(', '  content', ')'];
            const result = callPairTextObject(
                '(',
                ')',
                lines,
                { line: 1, ch: 2 },
                true,
                { scanLimit: 5 },
            );
            expect(result).not.toBeNull();
        });
    });

    describe('edge cases', () => {
        it('returns null for empty content between delimiters (inner)', () => {
            const result = callPairTextObject(
                '<',
                '>',
                '<>',
                { line: 0, ch: 0 },
                true,
            );
            expect(result).toBeNull();
        });

        it('returns null when cursor is on opening delimiter (forward scan double-counts)', () => {
            const result = callPairTextObject(
                '<',
                '>',
                '<hello>',
                { line: 0, ch: 0 },
                true,
            );
            expect(result).toBeNull();
        });

        it('returns null for unmatched opening', () => {
            const result = callPairTextObject(
                '(',
                ')',
                '(unclosed',
                { line: 0, ch: 3 },
                true,
            );
            expect(result).toBeNull();
        });

        it('returns null for unmatched closing', () => {
            const result = callPairTextObject(
                '(',
                ')',
                'unclosed)',
                { line: 0, ch: 3 },
                true,
            );
            expect(result).toBeNull();
        });

        it('does not cross lines when multiline is false', () => {
            const lines = ['start (', '  content', ')'];
            const result = callPairTextObject(
                '(',
                ')',
                lines,
                { line: 1, ch: 3 },
                true,
                { multiline: false },
            );
            expect(result).toBeNull();
        });
    });
});

// --- Symmetric pairs (open === close) ---

describe('createAsymmetricPairTextObject - symmetric pairs', () => {
    describe('double-star ** / **', () => {
        it('selects inner content between ** pairs', () => {
            const result = callPairTextObject(
                '**',
                '**',
                'say **bold** end',
                { line: 0, ch: 8 },
                true,
            );
            expect(result).not.toBeNull();
            const [from, to] = result!;
            expect(from).toEqual({ line: 0, ch: 6 });
            expect(to).toEqual({ line: 0, ch: 10 });
        });

        it('selects around including delimiters', () => {
            const result = callPairTextObject(
                '**',
                '**',
                'say **bold** end',
                { line: 0, ch: 8 },
                false,
            );
            expect(result).not.toBeNull();
            const [from, to] = result!;
            expect(from).toEqual({ line: 0, ch: 4 });
            expect(to).toEqual({ line: 0, ch: 12 });
        });

        it('returns null when no markers present', () => {
            const result = callPairTextObject(
                '**',
                '**',
                'no stars here',
                { line: 0, ch: 5 },
                true,
            );
            expect(result).toBeNull();
        });
    });

    describe('single backtick ` / `', () => {
        it('selects inner content between backticks', () => {
            const result = callPairTextObject(
                '`',
                '`',
                'use `code` here',
                { line: 0, ch: 6 },
                true,
            );
            expect(result).not.toBeNull();
            const [from, to] = result!;
            expect(from).toEqual({ line: 0, ch: 5 });
            expect(to).toEqual({ line: 0, ch: 9 });
        });

        it('selects around including backticks', () => {
            const result = callPairTextObject(
                '`',
                '`',
                'use `code` here',
                { line: 0, ch: 6 },
                false,
            );
            expect(result).not.toBeNull();
            const [from, to] = result!;
            expect(from).toEqual({ line: 0, ch: 4 });
            expect(to).toEqual({ line: 0, ch: 10 });
        });
    });

    describe('edge cases', () => {
        it('returns null for empty content between symmetric delimiters (inner)', () => {
            // ```` → two backticks adjacent, no content
            const result = callPairTextObject(
                '``',
                '``',
                'a ```` b',
                { line: 0, ch: 3 },
                true,
            );
            expect(result).toBeNull();
        });

        it('selects first pair when multiple symmetric pairs exist', () => {
            // 'a `x` b `y` c' cursor at ch=3 inside first pair
            const result = callPairTextObject(
                '`',
                '`',
                'a `x` b `y` c',
                { line: 0, ch: 3 },
                true,
            );
            expect(result).not.toBeNull();
            const [from, to] = result!;
            expect(from).toEqual({ line: 0, ch: 3 });
            expect(to).toEqual({ line: 0, ch: 4 });
        });

        it('selects second pair when cursor is inside it', () => {
            // 'a `x` b `y` c' cursor at ch=9 inside second pair
            const result = callPairTextObject(
                '`',
                '`',
                'a `x` b `y` c',
                { line: 0, ch: 9 },
                true,
            );
            expect(result).not.toBeNull();
            const [from, to] = result!;
            expect(from).toEqual({ line: 0, ch: 9 });
            expect(to).toEqual({ line: 0, ch: 10 });
        });

        it('returns null when cursor is outside all pairs', () => {
            const result = callPairTextObject(
                '`',
                '`',
                'a `x` b `y` c',
                { line: 0, ch: 0 },
                true,
            );
            expect(result).toBeNull();
        });

        it('symmetric pairs only work on single line', () => {
            // Symmetric pair matching in this implementation is single-line only
            const lines = ['start **', 'bold text', '** end'];
            const result = callPairTextObject(
                '**',
                '**',
                lines,
                { line: 1, ch: 3 },
                true,
            );
            expect(result).toBeNull();
        });
    });
});
