import { describe, it, expect } from 'vitest';
import {
    parseCursorlineOpt,
    cursorlineFlags,
    CURSORLINE_OPTIONS,
    type CursorlineOpt,
} from '../../src/vim/cursorline-option';

describe('parseCursorlineOpt', () => {
    it('accepts each canonical spelling unchanged', () => {
        for (const key of Object.keys(CURSORLINE_OPTIONS) as CursorlineOpt[]) {
            expect(parseCursorlineOpt(key)).toBe(key);
        }
    });

    it('expands both to line+number', () => {
        expect(parseCursorlineOpt('both')).toBe('both');
        expect(cursorlineFlags('both')).toEqual({
            number: true,
            line: true,
            screenline: false,
        });
    });

    it('normalizes comma lists regardless of order', () => {
        expect(parseCursorlineOpt('line,number')).toBe('both');
        expect(parseCursorlineOpt('number,line')).toBe('both');
        expect(parseCursorlineOpt('screenline,number')).toBe(
            'screenline,number',
        );
        expect(parseCursorlineOpt('number,screenline')).toBe(
            'screenline,number',
        );
    });

    it('treats both as an alias that may be combined redundantly', () => {
        expect(parseCursorlineOpt('both,number')).toBe('both');
        expect(parseCursorlineOpt('both,line')).toBe('both');
    });

    it('rejects line combined with screenline', () => {
        expect(parseCursorlineOpt('line,screenline')).toBeNull();
        expect(parseCursorlineOpt('screenline,line')).toBeNull();
        expect(parseCursorlineOpt('both,screenline')).toBeNull();
    });

    it('rejects duplicates, unknown tokens and empty input', () => {
        expect(parseCursorlineOpt('number,number')).toBeNull();
        expect(parseCursorlineOpt('nope')).toBeNull();
        expect(parseCursorlineOpt('')).toBeNull();
        expect(parseCursorlineOpt(',')).toBeNull();
        expect(parseCursorlineOpt('number,')).toBeNull();
        expect(parseCursorlineOpt('NUMBER')).toBeNull();
    });

    it('tolerates surrounding whitespace', () => {
        expect(parseCursorlineOpt(' line , number ')).toBe('both');
    });
});

describe('cursorlineFlags', () => {
    it.each([
        ['number', { number: true, line: false, screenline: false }],
        ['line', { number: false, line: true, screenline: false }],
        ['screenline', { number: false, line: false, screenline: true }],
        ['both', { number: true, line: true, screenline: false }],
        ['screenline,number', { number: true, line: false, screenline: true }],
    ] as const)('maps %s', (opt, expected) => {
        expect(cursorlineFlags(opt)).toEqual(expected);
    });

    it('never reports line and screenline together', () => {
        for (const key of Object.keys(CURSORLINE_OPTIONS) as CursorlineOpt[]) {
            const flags = cursorlineFlags(key);
            expect(flags.line && flags.screenline).toBe(false);
        }
    });
});
