/**
 * Tests for the unfoldEffect normalizer (src/vim/fold-sync.ts).
 *
 * The normalizer is a transactionExtender that corrects mismatched
 * unfoldEffect ranges so unfolds succeed regardless of the source.
 * CM6's foldState requires an exact {from, to} match to remove a fold;
 * a mismatched range is silently ignored.
 *
 * These tests verify:
 * 1. Exact-match unfolds still work (no regression)
 * 2. Zero-width unfold ranges (the original bug) are corrected
 * 3. Wrong-to unfold ranges are corrected
 * 4. Vim command fold/unfold round-trips work
 * 5. Unfolds on non-folded lines are harmless no-ops
 */

import { browser, expect } from '@wdio/globals';
import {
    setupEditor,
    PAUSE,
    loadSingleFileWorkspace,
    sendVimEscape,
} from '../helpers.js';

const HEADING_DOC = [
    '# First Heading',
    '',
    'Content under first heading.',
    '',
    '## Second Heading',
    '',
    'Content under second heading.',
    '',
    '## Third Heading',
    '',
    'Content under third heading.',
].join('\n');

type VimApiWindow = {
    CodeMirrorAdapter?: {
        Vim?: { handleKey: (cm: unknown, key: string) => boolean };
    };
};

type CM6View = {
    state: {
        doc: {
            line: (n: number) => { from: number; to: number };
            length: number;
        };
    };
    dispatch: (spec: { effects: unknown | unknown[] }) => void;
};

type LangModule = {
    foldable: (
        state: unknown,
        from: number,
        to: number,
    ) => { from: number; to: number } | null;
    foldEffect: { of: (range: { from: number; to: number }) => unknown };
    unfoldEffect: { of: (range: { from: number; to: number }) => unknown };
    foldedRanges: (state: unknown) => {
        iter: (from?: number) => {
            value: unknown;
            from: number;
            to: number;
            next: () => void;
        };
    };
};

async function sendVimKeys(...keys: string[]): Promise<void> {
    await browser.executeObsidian(
        ({ app, obsidian }, keySequence: string[]) => {
            const Vim = (window as unknown as VimApiWindow).CodeMirrorAdapter
                ?.Vim;
            if (!Vim) return;
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            const adapter = cm?.cm;
            if (!adapter) return;
            for (const key of keySequence) {
                Vim.handleKey(adapter, key);
            }
        },
        keys,
    );
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

async function isFoldedAt(line: number): Promise<boolean> {
    return (await browser.executeObsidian(
        ({ app, obsidian, require: req }, targetLine: number) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return false;
            const lang = req('@codemirror/language') as LangModule;
            const cm6View = (view.editor as unknown as Record<string, unknown>)
                .cm as CM6View | undefined;
            if (!cm6View) return false;
            const docLine = cm6View.state.doc.line(targetLine + 1);
            const folded = lang.foldedRanges(cm6View.state);
            const iter = folded.iter(docLine.from);
            while (iter.value) {
                if (iter.from <= docLine.to && iter.to >= docLine.from)
                    return true;
                if (iter.from > docLine.to) break;
                iter.next();
            }
            return false;
        },
        line,
    )) as boolean;
}

async function countFolds(): Promise<number> {
    return (await browser.executeObsidian(({ app, obsidian, require: req }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return 0;
        const lang = req('@codemirror/language') as LangModule;
        const cm6View = (view.editor as unknown as Record<string, unknown>)
            .cm as CM6View | undefined;
        if (!cm6View) return 0;
        const folded = lang.foldedRanges(cm6View.state);
        let count = 0;
        const iter = folded.iter();
        while (iter.value) {
            count++;
            iter.next();
        }
        return count;
    })) as number;
}

interface FoldAndUnfoldResult {
    error?: string;
    foldCreated: boolean;
    foldRemovedAfterUnfold: boolean;
    foldRange?: { from: number; to: number };
    unfoldRange?: { from: number; to: number };
}

/**
 * Creates a fold on the given 0-indexed line, then dispatches an
 * unfoldEffect with the specified range.  Returns whether the fold
 * was created and whether it was successfully removed.
 */
async function foldThenUnfoldWithRange(
    content: string,
    foldLine: number,
    unfoldRangeFn: 'exact' | 'zero-width' | 'wrong-to' | 'line-from-only',
): Promise<FoldAndUnfoldResult> {
    return (await browser.executeObsidian(
        async (
            { app, obsidian, require: req },
            doc: string,
            targetLine: number,
            rangeType: string,
        ) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'No view' } as FoldAndUnfoldResult;

            view.editor.setValue(doc);
            view.editor.setCursor(targetLine, 0);
            view.editor.focus();
            await new Promise((r) => setTimeout(r, 500));

            const lang = req('@codemirror/language') as LangModule;
            const cm6View = (view.editor as unknown as Record<string, unknown>)
                .cm as CM6View | undefined;
            if (!cm6View)
                return { error: 'No CM6 view' } as FoldAndUnfoldResult;

            const docLine = cm6View.state.doc.line(targetLine + 1);
            const foldRange = lang.foldable(
                cm6View.state,
                docLine.from,
                docLine.to,
            );
            if (!foldRange)
                return {
                    error: 'Line not foldable',
                    foldCreated: false,
                    foldRemovedAfterUnfold: false,
                } as FoldAndUnfoldResult;

            cm6View.dispatch({ effects: lang.foldEffect.of(foldRange) });
            await new Promise((r) => setTimeout(r, 300));

            let foldCreated = false;
            const iterCheck = lang
                .foldedRanges(cm6View.state)
                .iter(docLine.from);
            while (iterCheck.value) {
                if (
                    iterCheck.from <= docLine.to &&
                    iterCheck.to >= docLine.from
                ) {
                    foldCreated = true;
                    break;
                }
                if (iterCheck.from > docLine.to) break;
                iterCheck.next();
            }

            if (!foldCreated)
                return {
                    foldCreated: false,
                    foldRemovedAfterUnfold: false,
                } as FoldAndUnfoldResult;

            let unfoldRange: { from: number; to: number };
            switch (rangeType) {
                case 'exact':
                    unfoldRange = { from: foldRange.from, to: foldRange.to };
                    break;
                case 'zero-width':
                    unfoldRange = { from: docLine.from, to: docLine.from };
                    break;
                case 'wrong-to':
                    unfoldRange = {
                        from: foldRange.from,
                        to: foldRange.from + 1,
                    };
                    break;
                case 'line-from-only':
                    unfoldRange = { from: docLine.from, to: docLine.to };
                    break;
                default:
                    unfoldRange = { from: foldRange.from, to: foldRange.to };
            }

            cm6View.dispatch({ effects: lang.unfoldEffect.of(unfoldRange) });
            await new Promise((r) => setTimeout(r, 300));

            let foldRemovedAfterUnfold = true;
            const iterAfter = lang
                .foldedRanges(cm6View.state)
                .iter(docLine.from);
            while (iterAfter.value) {
                if (
                    iterAfter.from <= docLine.to &&
                    iterAfter.to >= docLine.from
                ) {
                    foldRemovedAfterUnfold = false;
                    break;
                }
                if (iterAfter.from > docLine.to) break;
                iterAfter.next();
            }

            return {
                foldCreated,
                foldRemovedAfterUnfold,
                foldRange: { from: foldRange.from, to: foldRange.to },
                unfoldRange,
            } as FoldAndUnfoldResult;
        },
        content,
        foldLine,
        unfoldRangeFn,
    )) as FoldAndUnfoldResult;
}

describe('Unfold effect normalizer (#80)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await loadSingleFileWorkspace();
    });

    describe('exact-match unfold — no regression', function () {
        it('unfoldEffect with exact fold range removes the fold', async function () {
            const result = await foldThenUnfoldWithRange(
                HEADING_DOC,
                0,
                'exact',
            );
            expect(result.error).toBeUndefined();
            expect(result.foldCreated).toBe(true);
            expect(result.foldRemovedAfterUnfold).toBe(true);
        });

        it('works on ## headings too', async function () {
            const result = await foldThenUnfoldWithRange(
                HEADING_DOC,
                4,
                'exact',
            );
            expect(result.error).toBeUndefined();
            expect(result.foldCreated).toBe(true);
            expect(result.foldRemovedAfterUnfold).toBe(true);
        });
    });

    describe('zero-width unfold range — the original bug', function () {
        it('unfoldEffect {from: line.from, to: line.from} is normalized', async function () {
            const result = await foldThenUnfoldWithRange(
                HEADING_DOC,
                0,
                'zero-width',
            );
            expect(result.error).toBeUndefined();
            expect(result.foldCreated).toBe(true);
            expect(result.foldRemovedAfterUnfold).toBe(true);
        });

        it('zero-width unfold on ## heading is normalized', async function () {
            const result = await foldThenUnfoldWithRange(
                HEADING_DOC,
                4,
                'zero-width',
            );
            expect(result.error).toBeUndefined();
            expect(result.foldCreated).toBe(true);
            expect(result.foldRemovedAfterUnfold).toBe(true);
        });
    });

    describe('wrong-to unfold range', function () {
        it('unfoldEffect {from: fold.from, to: fold.from+1} is normalized', async function () {
            const result = await foldThenUnfoldWithRange(
                HEADING_DOC,
                0,
                'wrong-to',
            );
            expect(result.error).toBeUndefined();
            expect(result.foldCreated).toBe(true);
            expect(result.foldRemovedAfterUnfold).toBe(true);
        });
    });

    describe('line-boundary unfold range', function () {
        it('unfoldEffect {from: line.from, to: line.to} is normalized', async function () {
            const result = await foldThenUnfoldWithRange(
                HEADING_DOC,
                0,
                'line-from-only',
            );
            expect(result.error).toBeUndefined();
            expect(result.foldCreated).toBe(true);
            expect(result.foldRemovedAfterUnfold).toBe(true);
        });
    });

    describe('vim command round-trip', function () {
        it('zc then zo round-trips correctly', async function () {
            await setupEditor(HEADING_DOC, { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);

            await sendVimKeys('z', 'c');
            expect(await isFoldedAt(0)).toBe(true);

            await sendVimKeys('z', 'o');
            expect(await isFoldedAt(0)).toBe(false);
        });

        it('zM then zR round-trips correctly', async function () {
            await setupEditor(HEADING_DOC, { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);

            await sendVimKeys('z', 'M');
            expect(await countFolds()).toBeGreaterThan(0);

            await sendVimKeys('z', 'R');
            expect(await countFolds()).toBe(0);
        });
    });

    describe('no-op unfold on non-folded line', function () {
        it('unfoldEffect on non-folded line does not throw', async function () {
            const result = (await browser.executeObsidian(
                async ({ app, obsidian, require: req }, doc: string) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { error: 'No view' };

                    view.editor.setValue(doc);
                    view.editor.setCursor(2, 0);
                    view.editor.focus();
                    await new Promise((r) => setTimeout(r, 500));

                    const lang = req('@codemirror/language') as LangModule;
                    const cm6View = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as CM6View | undefined;
                    if (!cm6View) return { error: 'No CM6 view' };

                    const foldsBefore = (() => {
                        let count = 0;
                        const iter = lang.foldedRanges(cm6View.state).iter();
                        while (iter.value) {
                            count++;
                            iter.next();
                        }
                        return count;
                    })();

                    const line3 = cm6View.state.doc.line(3);
                    cm6View.dispatch({
                        effects: lang.unfoldEffect.of({
                            from: line3.from,
                            to: line3.from,
                        }),
                    });
                    await new Promise((r) => setTimeout(r, 300));

                    const foldsAfter = (() => {
                        let count = 0;
                        const iter = lang.foldedRanges(cm6View.state).iter();
                        while (iter.value) {
                            count++;
                            iter.next();
                        }
                        return count;
                    })();

                    return {
                        foldsBefore,
                        foldsAfter,
                        noChange: foldsBefore === foldsAfter,
                    };
                },
                HEADING_DOC,
            )) as Record<string, unknown>;

            expect(result.error).toBeUndefined();
            expect(result.noChange).toBe(true);
        });
    });

    describe('multiple folds — normalizer targets correct fold', function () {
        it('zero-width unfold on second heading unfolds only that heading', async function () {
            const result = (await browser.executeObsidian(
                async ({ app, obsidian, require: req }, doc: string) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { error: 'No view' };

                    view.editor.setValue(doc);
                    view.editor.setCursor(0, 0);
                    view.editor.focus();
                    await new Promise((r) => setTimeout(r, 500));

                    const lang = req('@codemirror/language') as LangModule;
                    const cm6View = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as CM6View | undefined;
                    if (!cm6View) return { error: 'No CM6 view' };

                    const line5 = cm6View.state.doc.line(5);
                    const line9 = cm6View.state.doc.line(9);
                    const range5 = lang.foldable(
                        cm6View.state,
                        line5.from,
                        line5.to,
                    );
                    const range9 = lang.foldable(
                        cm6View.state,
                        line9.from,
                        line9.to,
                    );
                    if (!range5 || !range9) return { error: 'Not foldable' };

                    cm6View.dispatch({
                        effects: [
                            lang.foldEffect.of(range5),
                            lang.foldEffect.of(range9),
                        ],
                    });
                    await new Promise((r) => setTimeout(r, 300));

                    const foldsAfterBoth = (() => {
                        let count = 0;
                        const iter = lang.foldedRanges(cm6View.state).iter();
                        while (iter.value) {
                            count++;
                            iter.next();
                        }
                        return count;
                    })();

                    cm6View.dispatch({
                        effects: lang.unfoldEffect.of({
                            from: line5.from,
                            to: line5.from,
                        }),
                    });
                    await new Promise((r) => setTimeout(r, 300));

                    let h2aStillFolded = false;
                    let h3StillFolded = false;
                    const iterAfter = lang.foldedRanges(cm6View.state).iter();
                    while (iterAfter.value) {
                        if (
                            iterAfter.from <= line5.to &&
                            iterAfter.to >= line5.from
                        )
                            h2aStillFolded = true;
                        if (
                            iterAfter.from <= line9.to &&
                            iterAfter.to >= line9.from
                        )
                            h3StillFolded = true;
                        iterAfter.next();
                    }

                    return {
                        foldsAfterBoth,
                        h2aStillFolded,
                        h3StillFolded,
                    };
                },
                HEADING_DOC,
            )) as Record<string, unknown>;

            expect(result.error).toBeUndefined();
            expect(result.foldsAfterBoth).toBe(2);
            expect(result.h2aStillFolded).toBe(false);
            expect(result.h3StillFolded).toBe(true);
        });
    });
});

const FRONTMATTER_DOC = [
    '---',
    'title: Test Note',
    'tags: [fold, test]',
    'date: 2026-07-22',
    '---',
    '',
    '# Heading After Frontmatter',
    '',
    'Body text after heading.',
].join('\n');

async function forceSourceMode(): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return;
        const state = view.getState();
        state.mode = 'source';
        state.source = true;
        view.setState(state, { history: false });
    });
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

interface FrontmatterFoldResult {
    error?: string;
    isSourceMode: boolean;
    foldRange: { from: number; to: number } | null;
    foldCreated: boolean;
    foldRemovedAfterUnfold: boolean;
    unfoldRange: { from: number; to: number } | null;
}

/**
 * In source mode, fold frontmatter on line 1, then dispatch an
 * unfoldEffect with a deliberately mismatched range.
 *
 * The frontmatter fold provider returns {from: lineEnd, to: closingEnd}
 * where lineEnd is the END of the first `---` line — not line.from.
 * This tests that the normalizer corrects ranges that use line.from
 * (start of `---`) instead of lineEnd (end of `---`).
 */
async function foldFrontmatterThenUnfold(
    unfoldStrategy: 'exact' | 'zero-width' | 'line-start' | 'line-boundary',
): Promise<FrontmatterFoldResult> {
    return (await browser.executeObsidian(
        async (
            { app, obsidian, require: req },
            doc: string,
            strategy: string,
        ) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'No view' } as FrontmatterFoldResult;

            const isSourceMode = (() => {
                try {
                    const st = view.getState();
                    return st.source === true || st.mode === 'source';
                } catch {
                    return false;
                }
            })();

            view.editor.setValue(doc);
            view.editor.setCursor(0, 0);
            view.editor.focus();
            await new Promise((r) => setTimeout(r, 500));

            const lang = req('@codemirror/language') as LangModule;
            const cm6View = (view.editor as unknown as Record<string, unknown>)
                .cm as CM6View | undefined;
            if (!cm6View)
                return { error: 'No CM6 view' } as FrontmatterFoldResult;

            const line1 = cm6View.state.doc.line(1);
            const foldRange = lang.foldable(
                cm6View.state,
                line1.from,
                line1.to,
            );
            if (!foldRange)
                return {
                    error: 'Frontmatter not foldable',
                    isSourceMode,
                    foldRange: null,
                    foldCreated: false,
                    foldRemovedAfterUnfold: false,
                    unfoldRange: null,
                } as FrontmatterFoldResult;

            cm6View.dispatch({ effects: lang.foldEffect.of(foldRange) });
            await new Promise((r) => setTimeout(r, 300));

            let foldCreated = false;
            const iterCheck = lang.foldedRanges(cm6View.state).iter(line1.from);
            while (iterCheck.value) {
                if (iterCheck.from <= line1.to && iterCheck.to >= line1.from) {
                    foldCreated = true;
                    break;
                }
                if (iterCheck.from > line1.to) break;
                iterCheck.next();
            }

            if (!foldCreated)
                return {
                    isSourceMode,
                    foldRange: { from: foldRange.from, to: foldRange.to },
                    foldCreated: false,
                    foldRemovedAfterUnfold: false,
                    unfoldRange: null,
                } as FrontmatterFoldResult;

            let unfoldRange: { from: number; to: number };
            switch (strategy) {
                case 'exact':
                    unfoldRange = { from: foldRange.from, to: foldRange.to };
                    break;
                case 'zero-width':
                    unfoldRange = { from: line1.from, to: line1.from };
                    break;
                case 'line-start':
                    unfoldRange = { from: line1.from, to: foldRange.to };
                    break;
                case 'line-boundary':
                    unfoldRange = { from: line1.from, to: line1.to };
                    break;
                default:
                    unfoldRange = { from: foldRange.from, to: foldRange.to };
            }

            cm6View.dispatch({ effects: lang.unfoldEffect.of(unfoldRange) });
            await new Promise((r) => setTimeout(r, 300));

            let foldRemovedAfterUnfold = true;
            const iterAfter = lang.foldedRanges(cm6View.state).iter(line1.from);
            while (iterAfter.value) {
                if (iterAfter.from <= line1.to && iterAfter.to >= line1.from) {
                    foldRemovedAfterUnfold = false;
                    break;
                }
                if (iterAfter.from > line1.to) break;
                iterAfter.next();
            }

            return {
                isSourceMode,
                foldRange: { from: foldRange.from, to: foldRange.to },
                foldCreated,
                foldRemovedAfterUnfold,
                unfoldRange,
            } as FrontmatterFoldResult;
        },
        FRONTMATTER_DOC,
        unfoldStrategy,
    )) as FrontmatterFoldResult;
}

describe('Frontmatter fold in source mode (#80)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await loadSingleFileWorkspace();
        await forceSourceMode();
    });

    after(async function () {
        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            const state = view.getState();
            state.mode = 'source';
            state.source = false;
            view.setState(state, { history: false });
        });
        await browser.pause(PAUSE.EDITOR_SETTLE);
    });

    it('frontmatter is foldable in source mode', async function () {
        const result = await foldFrontmatterThenUnfold('exact');
        expect(result.error).toBeUndefined();
        expect(result.isSourceMode).toBe(true);
        expect(result.foldRange).not.toBeNull();
        expect(result.foldCreated).toBe(true);
    });

    describe('exact-match unfold', function () {
        it('unfoldEffect with exact fold range removes frontmatter fold', async function () {
            const result = await foldFrontmatterThenUnfold('exact');
            expect(result.error).toBeUndefined();
            expect(result.foldCreated).toBe(true);
            expect(result.foldRemovedAfterUnfold).toBe(true);
        });
    });

    describe('zero-width unfold — original bug scenario', function () {
        it('unfoldEffect {from: line.from, to: line.from} is normalized for frontmatter', async function () {
            const result = await foldFrontmatterThenUnfold('zero-width');
            expect(result.error).toBeUndefined();
            expect(result.foldCreated).toBe(true);
            expect(result.foldRemovedAfterUnfold).toBe(true);
        });
    });

    describe('line-start mismatch — frontmatter-specific', function () {
        it('unfoldEffect {from: line.from, to: fold.to} is normalized', async function () {
            const result = await foldFrontmatterThenUnfold('line-start');
            expect(result.error).toBeUndefined();
            expect(result.foldCreated).toBe(true);
            expect(result.foldRemovedAfterUnfold).toBe(true);
        });
    });

    describe('line-boundary mismatch', function () {
        it('unfoldEffect {from: line.from, to: line.to} is normalized for frontmatter', async function () {
            const result = await foldFrontmatterThenUnfold('line-boundary');
            expect(result.error).toBeUndefined();
            expect(result.foldCreated).toBe(true);
            expect(result.foldRemovedAfterUnfold).toBe(true);
        });
    });

    describe('fold range starts at lineEnd not line.from', function () {
        it('frontmatter fold.from > line.from (fold starts after ---)', async function () {
            const result = await foldFrontmatterThenUnfold('exact');
            expect(result.error).toBeUndefined();
            expect(result.foldRange).not.toBeNull();
            if (result.foldRange) {
                expect(result.foldRange.from).toBeGreaterThan(0);
            }
        });
    });

    describe('vim zc/zo on frontmatter in source mode', function () {
        it('zc folds frontmatter and zo unfolds it', async function () {
            await setupEditor(FRONTMATTER_DOC, { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);

            await sendVimKeys('z', 'c');
            expect(await isFoldedAt(0)).toBe(true);

            await sendVimKeys('z', 'o');
            expect(await isFoldedAt(0)).toBe(false);
        });
    });
});
