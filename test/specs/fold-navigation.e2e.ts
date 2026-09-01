import { browser, expect } from '@wdio/globals';
import {
    setupEditor,
    getCursorPos,
    PAUSE,
    loadSingleFileWorkspace,
    sendVimEscape,
    setPluginSetting,
} from '../helpers.js';

const FOLDED_HEADING_DOC = [
    'Preamble line.',
    '',
    '## First Section',
    '',
    'Content under first section.',
    '',
    '## Second Section',
    '',
    'Content under second section.',
    '',
    '## Third Section',
    '',
    'Content under third section.',
].join('\n');

type VimApiWindow = {
    CodeMirrorAdapter?: {
        Vim?: { handleKey: (cm: unknown, key: string) => boolean };
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

describe('Fold-aware navigation (Phase 4)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await loadSingleFileWorkspace();
    });

    describe('foldAwareNavigation setting', function () {
        afterEach(async function () {
            await setPluginSetting('foldAwareNavigation', false);
            await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins: {
                            plugins: Record<
                                string,
                                { reloadFeatures: () => void }
                            >;
                        };
                    }
                ).plugins.plugins['vim-motions'];
                plugin?.reloadFeatures();
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);
        });

        it(']h into folded section auto-opens fold when enabled', async function () {
            await setPluginSetting('foldAwareNavigation', true);
            await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins: {
                            plugins: Record<
                                string,
                                { reloadFeatures: () => void }
                            >;
                        };
                    }
                ).plugins.plugins['vim-motions'];
                plugin?.reloadFeatures();
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            await setupEditor(FOLDED_HEADING_DOC, { line: 0, ch: 0 });

            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await sendVimKeys('z', 'M');
            expect(await isFoldedAt(2)).toBe(true);

            await sendVimKeys(']', 'h');
            const cursor = await getCursorPos();
            expect(cursor.line).toBe(2);
            expect(await isFoldedAt(2)).toBe(false);
        });

        it(']h into folded section does NOT auto-open when disabled', async function () {
            await setPluginSetting('foldAwareNavigation', false);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            await setupEditor(FOLDED_HEADING_DOC, { line: 0, ch: 0 });

            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await sendVimKeys('z', 'M');
            expect(await isFoldedAt(2)).toBe(true);

            await sendVimKeys(']', 'h');
            expect(await isFoldedAt(2)).toBe(true);
        });

        it('j/k motions do NOT auto-open folds (Neovim foldopen parity)', async function () {
            await setPluginSetting('foldAwareNavigation', true);
            await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins: {
                            plugins: Record<
                                string,
                                { reloadFeatures: () => void }
                            >;
                        };
                    }
                ).plugins.plugins['vim-motions'];
                plugin?.reloadFeatures();
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            await setupEditor(FOLDED_HEADING_DOC, { line: 0, ch: 0 });

            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await sendVimKeys('z', 'M');
            expect(await isFoldedAt(2)).toBe(true);

            await sendVimKeys('j', 'j', 'j');
            expect(await isFoldedAt(2)).toBe(true);

            await sendVimKeys('k');
            expect(await isFoldedAt(2)).toBe(true);
        });

        it('j from fold line skips past the fold (Neovim parity)', async function () {
            await setPluginSetting('foldAwareNavigation', true);
            await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins: {
                            plugins: Record<
                                string,
                                { reloadFeatures: () => void }
                            >;
                        };
                    }
                ).plugins.plugins['vim-motions'];
                plugin?.reloadFeatures();
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            await setupEditor(FOLDED_HEADING_DOC, { line: 0, ch: 0 });

            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await sendVimKeys('z', 'M');
            await browser.pause(PAUSE.EDITOR_SETTLE);

            expect(await isFoldedAt(2)).toBe(true);
            expect(await isFoldedAt(6)).toBe(true);
            expect(await isFoldedAt(10)).toBe(true);

            await sendVimKeys('j', 'j');
            const posOnFold = await getCursorPos();
            expect(posOnFold.line).toBe(2);

            await sendVimKeys('j');
            const posAfterFold = await getCursorPos();
            expect(posAfterFold.line).toBeGreaterThan(2);
            expect(posAfterFold.line).toBeLessThanOrEqual(6);
            expect(await isFoldedAt(2)).toBe(true);
        });

        it('k from below fold lands on fold line, not inside', async function () {
            await setPluginSetting('foldAwareNavigation', true);
            await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins: {
                            plugins: Record<
                                string,
                                { reloadFeatures: () => void }
                            >;
                        };
                    }
                ).plugins.plugins['vim-motions'];
                plugin?.reloadFeatures();
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            await setupEditor(FOLDED_HEADING_DOC, { line: 0, ch: 0 });

            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await sendVimKeys('z', 'M');
            await browser.pause(PAUSE.EDITOR_SETTLE);

            expect(await isFoldedAt(2)).toBe(true);
            expect(await isFoldedAt(6)).toBe(true);
            expect(await isFoldedAt(10)).toBe(true);

            await sendVimKeys('j', 'j');
            const posOnFold = await getCursorPos();
            expect(posOnFold.line).toBe(2);

            await sendVimKeys('j');
            const posAfterFold1 = await getCursorPos();
            expect(posAfterFold1.line).toBeGreaterThan(2);
            expect(await isFoldedAt(2)).toBe(true);

            await sendVimKeys('k');
            const posBack = await getCursorPos();
            expect(posBack.line).toBe(2);
            expect(await isFoldedAt(2)).toBe(true);
        });

        it('k motion upward does NOT auto-open fold', async function () {
            await setPluginSetting('foldAwareNavigation', true);
            await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins: {
                            plugins: Record<
                                string,
                                { reloadFeatures: () => void }
                            >;
                        };
                    }
                ).plugins.plugins['vim-motions'];
                plugin?.reloadFeatures();
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            await setupEditor(FOLDED_HEADING_DOC, { line: 12, ch: 0 });

            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await sendVimKeys('z', 'M');
            expect(await isFoldedAt(2)).toBe(true);
            expect(await isFoldedAt(6)).toBe(true);
            expect(await isFoldedAt(10)).toBe(true);

            await sendVimKeys('k', 'k', 'k', 'k');
            expect(await isFoldedAt(2)).toBe(true);
            expect(await isFoldedAt(6)).toBe(true);
            expect(await isFoldedAt(10)).toBe(true);
        });
    });
});
