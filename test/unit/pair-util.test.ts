import { describe, expect, it } from 'vitest';
import { createAsymmetricPairTextObject } from '../../src/text-objects/pair-util';
import type { VimPos } from '../../src/types/vim-api';

function mockCm(lines: string[]) {
    return {
        getLine: (n: number) => lines[n] ?? '',
        firstLine: () => 0,
        lastLine: () => lines.length - 1,
    };
}

function call(
    open: string,
    close: string,
    multiline: boolean,
    inner: boolean,
    scanLimit: number,
    lines: string[],
    head: VimPos,
): [VimPos, VimPos] | null {
    const fn = createAsymmetricPairTextObject(
        open,
        close,
        multiline,
        inner,
        scanLimit,
    );
    const cm = mockCm(lines);
    const result = fn(cm as never, head, {} as never, {} as never);
    if (!result) return null;
    return result as [VimPos, VimPos];
}

describe('pair-util — symmetric delimiters', () => {
    it('finds inner content between single-char symmetric delimiters', () => {
        const result = call("'", "'", false, true, 100, ["hello 'world' end"], {
            line: 0,
            ch: 8,
        });
        expect(result).not.toBeNull();
        expect(result![0]).toEqual({ line: 0, ch: 7 });
        expect(result![1]).toEqual({ line: 0, ch: 12 });
    });

    it('finds around content for symmetric delimiters', () => {
        const result = call(
            "'",
            "'",
            false,
            false,
            100,
            ["hello 'world' end"],
            { line: 0, ch: 8 },
        );
        expect(result).not.toBeNull();
        expect(result![0]).toEqual({ line: 0, ch: 6 });
        expect(result![1]).toEqual({ line: 0, ch: 13 });
    });

    it('returns null when cursor is outside symmetric pair', () => {
        const result = call("'", "'", false, true, 100, ["hello 'world' end"], {
            line: 0,
            ch: 0,
        });
        expect(result).toBeNull();
    });

    it('returns null for inner when pair is empty', () => {
        const result = call("'", "'", false, true, 100, ["''"], {
            line: 0,
            ch: 0,
        });
        expect(result).toBeNull();
    });

    it('handles multi-char symmetric delimiters', () => {
        const result = call(
            '**',
            '**',
            false,
            true,
            100,
            ['hello **bold** end'],
            { line: 0, ch: 10 },
        );
        expect(result).not.toBeNull();
        expect(result![0]).toEqual({ line: 0, ch: 8 });
        expect(result![1]).toEqual({ line: 0, ch: 12 });
    });
});

describe('pair-util — asymmetric delimiters', () => {
    it('finds inner content between parens', () => {
        const result = call('(', ')', true, true, 100, ['foo(bar)'], {
            line: 0,
            ch: 5,
        });
        expect(result).not.toBeNull();
        expect(result![0]).toEqual({ line: 0, ch: 4 });
        expect(result![1]).toEqual({ line: 0, ch: 7 });
    });

    it('finds around content including parens', () => {
        const result = call('(', ')', true, false, 100, ['foo(bar)'], {
            line: 0,
            ch: 5,
        });
        expect(result).not.toBeNull();
        expect(result![0]).toEqual({ line: 0, ch: 3 });
        expect(result![1]).toEqual({ line: 0, ch: 8 });
    });

    it('handles nested delimiters', () => {
        const result = call('(', ')', true, true, 100, ['foo(bar(baz))'], {
            line: 0,
            ch: 9,
        });
        expect(result).not.toBeNull();
        expect(result![0]).toEqual({ line: 0, ch: 8 });
        expect(result![1]).toEqual({ line: 0, ch: 11 });
    });

    it('handles multiline delimiters', () => {
        const result = call('(', ')', true, true, 100, ['foo(', '  bar', ')'], {
            line: 1,
            ch: 2,
        });
        expect(result).not.toBeNull();
        expect(result![0].line).toBe(0);
        expect(result![1].line).toBe(2);
    });

    it('returns null when no matching pair found', () => {
        const result = call('(', ')', true, true, 100, ['no parens here'], {
            line: 0,
            ch: 5,
        });
        expect(result).toBeNull();
    });

    it('returns null for inner of empty pair', () => {
        const result = call('(', ')', true, true, 100, ['()'], {
            line: 0,
            ch: 0,
        });
        expect(result).toBeNull();
    });

    it('respects scan limit for multiline', () => {
        const lines = ['(', ...Array.from({ length: 20 }, () => 'x'), ')'];
        const result = call('(', ')', true, true, 5, lines, {
            line: 10,
            ch: 0,
        });
        expect(result).toBeNull();
    });

    it('handles curly braces', () => {
        const result = call('{', '}', true, true, 100, ['if {true}'], {
            line: 0,
            ch: 5,
        });
        expect(result).not.toBeNull();
        expect(result![0]).toEqual({ line: 0, ch: 4 });
        expect(result![1]).toEqual({ line: 0, ch: 8 });
    });

    it('handles square brackets', () => {
        const result = call('[', ']', true, true, 100, ['arr[0]'], {
            line: 0,
            ch: 4,
        });
        expect(result).not.toBeNull();
        expect(result![0]).toEqual({ line: 0, ch: 4 });
        expect(result![1]).toEqual({ line: 0, ch: 5 });
    });

    it('handles multi-char asymmetric delimiters', () => {
        const result = call('```', '```', false, true, 100, ['```code```'], {
            line: 0,
            ch: 5,
        });
        expect(result).not.toBeNull();
        expect(result![0]).toEqual({ line: 0, ch: 3 });
        expect(result![1]).toEqual({ line: 0, ch: 7 });
    });
});
