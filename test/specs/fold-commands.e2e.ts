import { browser, expect } from '@wdio/globals';
import {
    setupEditor,
    getCursorPos,
    getEditorValue,
    PAUSE,
    loadSingleFileWorkspace,
    sendVimEscape,
} from '../helpers.js';

const MULTI_HEADING_DOC = [
    '# Heading 1',
    '',
    'Content under h1.',
    '',
    '## Heading 2a',
    '',
    'Content under h2a.',
    '',
    '## Heading 2b',
    '',
    'Content under h2b.',
    '',
    '### Heading 3',
    '',
    'Content under h3.',
].join('\n');

type VimApiWindow = {
    CodeMirrorAdapter?: {
        Vim?: {
            handleKey: (cm: unknown, key: string) => boolean;
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
            const lang = req('@codemirror/language') as {
                foldedRanges: (state: unknown) => {
                    iter: (from?: number) => {
                        value: unknown;
                        from: number;
                        to: number;
                        next: () => void;
                    };
                };
            };
            const cm6View = (view.editor as unknown as Record<string, unknown>)
                .cm as
                | {
                      state: {
                          doc: {
                              line: (n: number) => { from: number; to: number };
                          };
                      };
                  }
                | undefined;
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
        const lang = req('@codemirror/language') as {
            foldedRanges: (state: unknown) => {
                iter: () => {
                    value: unknown;
                    next: () => void;
                };
            };
        };
        const cm6View = (view.editor as unknown as Record<string, unknown>)
            .cm as { state: unknown } | undefined;
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

describe('Fold commands (Phase 2)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await loadSingleFileWorkspace();
    });

    describe('zf — create fold', function () {
        it('zf in visual line mode creates a fold', async function () {
            await setupEditor(MULTI_HEADING_DOC, { line: 2, ch: 0 });

            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await sendVimKeys('V', 'j', 'j', 'z', 'f');

            expect(await isFoldedAt(2)).toBe(true);
        });

        it('zf fold can be removed with zo', async function () {
            await setupEditor(MULTI_HEADING_DOC, { line: 2, ch: 0 });

            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await sendVimKeys('V', 'j', 'j', 'z', 'f');
            expect(await isFoldedAt(2)).toBe(true);

            await sendVimKeys('z', 'o');
            expect(await isFoldedAt(2)).toBe(false);
        });
    });

    describe('zd — delete fold at cursor', function () {
        it('zd removes fold at cursor position', async function () {
            await setupEditor(MULTI_HEADING_DOC, { line: 0, ch: 0 });

            await sendVimKeys('z', 'c');
            expect(await isFoldedAt(0)).toBe(true);

            await sendVimKeys('z', 'd');
            expect(await isFoldedAt(0)).toBe(false);
        });

        it('zD removes fold at cursor (same as zd)', async function () {
            await setupEditor(MULTI_HEADING_DOC, { line: 0, ch: 0 });

            await sendVimKeys('z', 'c');
            expect(await isFoldedAt(0)).toBe(true);

            await sendVimKeys('z', 'D');
            expect(await isFoldedAt(0)).toBe(false);
        });
    });

    describe('zE — eliminate all folds', function () {
        it('zE removes all folds in the document', async function () {
            await setupEditor(MULTI_HEADING_DOC, { line: 0, ch: 0 });

            await sendVimKeys('z', 'M');
            expect(await countFolds()).toBeGreaterThan(0);

            await sendVimKeys('z', 'E');
            expect(await countFolds()).toBe(0);
        });
    });

    describe('zm/zr — incremental fold level', function () {
        it('zm folds headings incrementally', async function () {
            await setupEditor(MULTI_HEADING_DOC, { line: 0, ch: 0 });

            const foldsBefore = await countFolds();
            await sendVimKeys('z', 'm');
            const foldsAfterFirst = await countFolds();

            expect(foldsAfterFirst).toBeGreaterThan(foldsBefore);
        });

        it('zr unfolds headings incrementally', async function () {
            await setupEditor(MULTI_HEADING_DOC, { line: 0, ch: 0 });

            await sendVimKeys('z', 'm');
            const foldsAfterFold = await countFolds();

            await sendVimKeys('z', 'r');
            const foldsAfterUnfold = await countFolds();

            expect(foldsAfterUnfold).toBeLessThan(foldsAfterFold);
        });

        it('zm then zr round-trips correctly', async function () {
            await setupEditor(MULTI_HEADING_DOC, { line: 0, ch: 0 });

            const foldsBefore = await countFolds();
            await sendVimKeys('z', 'm');
            await sendVimKeys('z', 'r');
            const foldsAfter = await countFolds();

            expect(foldsAfter).toBe(foldsBefore);
        });

        it('multiple zm increases fold depth', async function () {
            await setupEditor(MULTI_HEADING_DOC, { line: 0, ch: 0 });

            await sendVimKeys('z', 'm');
            const foldsLevel1 = await countFolds();

            await sendVimKeys('z', 'm');
            const foldsLevel2 = await countFolds();

            expect(foldsLevel2).toBeGreaterThanOrEqual(foldsLevel1);
        });
    });

    describe('no regression — document content unchanged', function () {
        it('fold operations preserve document content', async function () {
            await setupEditor(MULTI_HEADING_DOC, { line: 0, ch: 0 });

            const contentBefore = await getEditorValue();
            await sendVimKeys('z', 'm');
            await sendVimKeys('z', 'm');
            await sendVimKeys('z', 'r');
            await sendVimKeys('z', 'r');
            const contentAfter = await getEditorValue();

            expect(contentAfter).toBe(contentBefore);
        });
    });
});
