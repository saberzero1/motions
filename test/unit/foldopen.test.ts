import { describe, expect, it, beforeEach, vi } from 'vitest';

vi.mock('@replit/codemirror-vim', () => ({
    foldopenAnnotation: { of: (v: unknown) => v },
}));

vi.mock('@codemirror/state', () => ({
    EditorState: {
        transactionExtender: { of: () => ({}) },
    },
}));

vi.mock('@codemirror/view', () => ({
    EditorView: { scrollIntoView: vi.fn() },
    ViewPlugin: { fromClass: vi.fn(() => ({})) },
}));

vi.mock('@codemirror/language', () => ({
    foldEffect: {},
    unfoldEffect: { of: vi.fn() },
    foldedRanges: vi.fn(() => ({ iter: () => ({ value: null }) })),
}));

import {
    setFoldopen,
    getFoldopen,
    setFoldAwareNavigation,
    shouldUnfold,
} from '../../src/vim/fold-sync';

describe('foldopen option', () => {
    beforeEach(() => {
        setFoldAwareNavigation(true);
    });

    describe('setFoldopen / getFoldopen', () => {
        it('parses comma-separated categories', () => {
            setFoldopen('block,hor,search');
            expect(getFoldopen()).toBe('block,hor,search');
        });

        it('handles whitespace in values', () => {
            setFoldopen('block , hor , search');
            expect(getFoldopen()).toBe('block,hor,search');
        });

        it('empty string disables all categories', () => {
            setFoldopen('');
            expect(getFoldopen()).toBe('');
        });

        it('single category', () => {
            setFoldopen('block');
            expect(getFoldopen()).toBe('block');
        });

        it('all category', () => {
            setFoldopen('all');
            expect(getFoldopen()).toBe('all');
        });

        it('accepts quickfix and tag even though no motions emit them', () => {
            setFoldopen('quickfix,tag');
            expect(getFoldopen()).toBe('quickfix,tag');
        });
    });

    describe('setFoldAwareNavigation (backward compat)', () => {
        it('true sets Neovim default foldopen', () => {
            setFoldAwareNavigation(true);
            const categories = getFoldopen().split(',');
            expect(categories).toContain('block');
            expect(categories).toContain('hor');
            expect(categories).toContain('mark');
            expect(categories).toContain('percent');
            expect(categories).toContain('search');
            expect(categories).toContain('undo');
            expect(categories).not.toContain('jump');
            expect(categories).not.toContain('insert');
            expect(categories).not.toContain('all');
        });

        it('false empties the foldopen set', () => {
            setFoldAwareNavigation(false);
            expect(getFoldopen()).toBe('');
        });
    });

    describe('shouldUnfold', () => {
        it('returns false for null category', () => {
            setFoldAwareNavigation(true);
            expect(shouldUnfold(null)).toBe(false);
        });

        it('returns true for category in the active set', () => {
            setFoldopen('block,hor');
            expect(shouldUnfold('block')).toBe(true);
            expect(shouldUnfold('hor')).toBe(true);
        });

        it('returns false for category NOT in the active set', () => {
            setFoldopen('block,hor');
            expect(shouldUnfold('search')).toBe(false);
            expect(shouldUnfold('mark')).toBe(false);
            expect(shouldUnfold('jump')).toBe(false);
            expect(shouldUnfold('percent')).toBe(false);
            expect(shouldUnfold('undo')).toBe(false);
            expect(shouldUnfold('insert')).toBe(false);
            expect(shouldUnfold('tag')).toBe(false);
        });

        it('"all" enables every category', () => {
            setFoldopen('all');
            expect(shouldUnfold('block')).toBe(true);
            expect(shouldUnfold('hor')).toBe(true);
            expect(shouldUnfold('mark')).toBe(true);
            expect(shouldUnfold('search')).toBe(true);
            expect(shouldUnfold('jump')).toBe(true);
            expect(shouldUnfold('percent')).toBe(true);
            expect(shouldUnfold('undo')).toBe(true);
            expect(shouldUnfold('insert')).toBe(true);
            expect(shouldUnfold('tag')).toBe(true);
        });

        it('"all" still returns false for null', () => {
            setFoldopen('all');
            expect(shouldUnfold(null)).toBe(false);
        });

        it('empty set rejects everything', () => {
            setFoldopen('');
            expect(shouldUnfold('block')).toBe(false);
            expect(shouldUnfold('hor')).toBe(false);
            expect(shouldUnfold('search')).toBe(false);
        });

        describe('individual categories with default foldopen', () => {
            beforeEach(() => {
                setFoldAwareNavigation(true);
            });

            it('block: accepted (in default)', () => {
                expect(shouldUnfold('block')).toBe(true);
            });

            it('hor: accepted (in default)', () => {
                expect(shouldUnfold('hor')).toBe(true);
            });

            it('mark: accepted (in default)', () => {
                expect(shouldUnfold('mark')).toBe(true);
            });

            it('percent: accepted (in default)', () => {
                expect(shouldUnfold('percent')).toBe(true);
            });

            it('search: accepted (in default)', () => {
                expect(shouldUnfold('search')).toBe(true);
            });

            it('undo: accepted (in default)', () => {
                expect(shouldUnfold('undo')).toBe(true);
            });

            it('jump: rejected (NOT in default)', () => {
                expect(shouldUnfold('jump')).toBe(false);
            });

            it('insert: rejected (NOT in default)', () => {
                expect(shouldUnfold('insert')).toBe(false);
            });

            it('tag: rejected (NOT in default)', () => {
                expect(shouldUnfold('tag')).toBe(false);
            });
        });

        describe('custom single-category sets', () => {
            it('only block: accepts block, rejects others', () => {
                setFoldopen('block');
                expect(shouldUnfold('block')).toBe(true);
                expect(shouldUnfold('hor')).toBe(false);
                expect(shouldUnfold('search')).toBe(false);
            });

            it('only hor: accepts hor, rejects block', () => {
                setFoldopen('hor');
                expect(shouldUnfold('hor')).toBe(true);
                expect(shouldUnfold('block')).toBe(false);
            });

            it('only mark: accepts mark, rejects hor', () => {
                setFoldopen('mark');
                expect(shouldUnfold('mark')).toBe(true);
                expect(shouldUnfold('hor')).toBe(false);
            });

            it('only percent: accepts percent, rejects mark', () => {
                setFoldopen('percent');
                expect(shouldUnfold('percent')).toBe(true);
                expect(shouldUnfold('mark')).toBe(false);
            });

            it('only search: accepts search, rejects hor', () => {
                setFoldopen('search');
                expect(shouldUnfold('search')).toBe(true);
                expect(shouldUnfold('hor')).toBe(false);
            });

            it('only undo: accepts undo, rejects search', () => {
                setFoldopen('undo');
                expect(shouldUnfold('undo')).toBe(true);
                expect(shouldUnfold('search')).toBe(false);
            });

            it('only jump: accepts jump, rejects block', () => {
                setFoldopen('jump');
                expect(shouldUnfold('jump')).toBe(true);
                expect(shouldUnfold('block')).toBe(false);
            });

            it('only insert: accepts insert, rejects hor', () => {
                setFoldopen('insert');
                expect(shouldUnfold('insert')).toBe(true);
                expect(shouldUnfold('hor')).toBe(false);
            });

            it('only tag: accepts tag, rejects search', () => {
                setFoldopen('tag');
                expect(shouldUnfold('tag')).toBe(true);
                expect(shouldUnfold('search')).toBe(false);
            });

            it('only quickfix: accepts quickfix, rejects block', () => {
                setFoldopen('quickfix');
                expect(shouldUnfold('quickfix' as never)).toBe(true);
                expect(shouldUnfold('block')).toBe(false);
            });
        });

        describe('category combinations', () => {
            it('block,search: accepts both, rejects hor', () => {
                setFoldopen('block,search');
                expect(shouldUnfold('block')).toBe(true);
                expect(shouldUnfold('search')).toBe(true);
                expect(shouldUnfold('hor')).toBe(false);
            });

            it('hor,jump,insert: accepts all three, rejects block', () => {
                setFoldopen('hor,jump,insert');
                expect(shouldUnfold('hor')).toBe(true);
                expect(shouldUnfold('jump')).toBe(true);
                expect(shouldUnfold('insert')).toBe(true);
                expect(shouldUnfold('block')).toBe(false);
            });

            it('Neovim default matches foldAwareNavigation(true)', () => {
                setFoldopen('block,hor,mark,percent,search,undo');
                const defaultSet = getFoldopen();
                setFoldAwareNavigation(true);
                const boolSet = getFoldopen();
                expect(new Set(defaultSet.split(','))).toEqual(
                    new Set(boolSet.split(',')),
                );
            });
        });
    });
});
