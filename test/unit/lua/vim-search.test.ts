import { describe, it, expect } from 'vitest';
import { searchBufferLines, type SearchDoc } from '../../../src/lua/vim-search';

/**
 * Characterization tests for `vim.fn.searchpos()`'s buffer search.
 *
 * The first block pins behaviour for patterns that are valid in BOTH dialects,
 * and existed before Vim-to-JS translation was introduced — its job is to show
 * the translation did not disturb them. The second block covers Vim syntax that
 * the translation added support for.
 */
function doc(...lines: string[]): SearchDoc {
    return {
        lineCount: () => lines.length,
        getLine: (i) => lines[i] ?? '',
    };
}

const sample = doc('alpha bravo alpha', 'charlie delta', 'echo alpha foxtrot');

describe('searchBufferLines — JavaScript-compatible patterns', () => {
    it('finds a forward match after the cursor, 1-based', () => {
        const hit = searchBufferLines(sample, 'bravo', '', 1, 0, null);
        expect(hit).toEqual({ line: 1, col: 7 });
    });

    it('starts at the cursor column, and at cursor-1 with the c flag', () => {
        // Non-'c' starts AT cursorCol (0-based), so a match sitting exactly on
        // the cursor is still returned. Vim's searchpos() starts *after* the
        // cursor. Recorded as-is; see the deviation note below.
        expect(searchBufferLines(sample, 'alpha', '', 1, 0, null)).toEqual({
            line: 1,
            col: 1,
        });
        expect(searchBufferLines(sample, 'alpha', '', 1, 1, null)).toEqual({
            line: 1,
            col: 13,
        });
        expect(searchBufferLines(sample, 'alpha', 'c', 1, 1, null)).toEqual({
            line: 1,
            col: 1,
        });
    });

    it('continues onto later lines', () => {
        expect(searchBufferLines(sample, 'foxtrot', '', 1, 0, null)).toEqual({
            line: 3,
            col: 12,
        });
    });

    it('wraps to the top by default, and not with the W flag', () => {
        expect(searchBufferLines(sample, 'charlie', '', 3, 0, null)).toEqual({
            line: 2,
            col: 1,
        });
        expect(
            searchBufferLines(sample, 'charlie', 'W', 3, 0, null),
        ).toBeNull();
    });

    it('searches backward with the b flag, taking the last match on a line', () => {
        expect(searchBufferLines(sample, 'alpha', 'b', 1, 18, null)).toEqual({
            line: 1,
            col: 13,
        });
    });

    it('honours stopline in both directions', () => {
        expect(searchBufferLines(sample, 'foxtrot', '', 1, 0, 2)).toBeNull();
        expect(searchBufferLines(sample, 'alpha', 'b', 3, 12, 3)).toEqual({
            line: 3,
            col: 6,
        });
    });

    it('returns null rather than throwing on an invalid regex', () => {
        expect(
            searchBufferLines(sample, '[unclosed', '', 1, 0, null),
        ).toBeNull();
    });

    it('supports real regex metacharacters', () => {
        expect(searchBufferLines(sample, 'a.pha', '', 1, 0, null)).toEqual({
            line: 1,
            col: 1,
        });
        expect(searchBufferLines(sample, '^charlie', '', 1, 0, null)).toEqual({
            line: 2,
            col: 1,
        });
        expect(searchBufferLines(sample, 'delta$', '', 1, 0, null)).toEqual({
            line: 2,
            col: 9,
        });
    });

    it('returns null when nothing matches', () => {
        expect(searchBufferLines(sample, 'zulu', '', 1, 0, null)).toBeNull();
    });
});

// Deviation from Vim, recorded rather than fixed: without the 'c' flag Vim
// begins searching after the cursor, whereas this begins at it. Changing that
// would alter behaviour for every existing caller, so it is out of scope here.
describe('searchBufferLines \u2014 vim regex dialect', () => {
    it('matches \\V very-nomagic patterns as flash emits them', () => {
        // flash builds `\Valpha\C` (search/pattern.lua:87,104).
        expect(
            searchBufferLines(sample, '\\Valpha\\C', '', 1, 0, null),
        ).toEqual({
            line: 1,
            col: 1,
        });
    });

    it('treats \\V metacharacters as literal', () => {
        expect(
            searchBufferLines(sample, '\\Va.pha', '', 1, 0, null),
        ).toBeNull();
    });

    it('honours \\c as a case-insensitivity flag', () => {
        expect(searchBufferLines(sample, '\\cALPHA', '', 1, 0, null)).toEqual({
            line: 1,
            col: 1,
        });
    });

    it('honours \\C as case-sensitive', () => {
        expect(
            searchBufferLines(sample, '\\CALPHA', '', 1, 0, null),
        ).toBeNull();
    });

    it('supports \\< \\> word boundaries', () => {
        expect(
            searchBufferLines(sample, '\\<alpha\\>', '', 1, 0, null),
        ).toEqual({
            line: 1,
            col: 1,
        });
        expect(
            searchBufferLines(sample, '\\<lpha\\>', '', 1, 0, null),
        ).toBeNull();
    });
});
