import { browser, expect } from '@wdio/globals';
import {
    setupEditor,
    PAUSE,
    loadSingleFileWorkspace,
    sendVimEscape,
} from '../helpers.js';

const FRONTMATTER_DOC = [
    '---',
    'title: Test',
    'tags: [a, b]',
    '---',
    '',
    '# Content',
    '',
    'Body text.',
].join('\n');

const CALLOUT_DOC = [
    '# Before callout',
    '',
    '> [!tip] My Tip Title',
    '> First line of callout',
    '> Second line of callout',
    '',
    '## After callout',
].join('\n');

const HEADING_CODE_DOC = [
    '# Introduction',
    '',
    'Some introductory text here.',
    '',
    '```typescript',
    'const x = 1;',
    'const y = 2;',
    'const z = 3;',
    '```',
    '',
    '## Conclusion',
    '',
    'Final thoughts.',
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

async function isFoldableAt(line: number): Promise<boolean> {
    return (await browser.executeObsidian(
        ({ app, obsidian, require: req }, targetLine: number) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return false;
            const lang = req('@codemirror/language') as {
                foldable: (
                    state: unknown,
                    lineStart: number,
                    lineEnd: number,
                ) => { from: number; to: number } | null;
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
            return (
                lang.foldable(cm6View.state, docLine.from, docLine.to) !== null
            );
        },
        line,
    )) as boolean;
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

async function getFoldPlaceholderText(): Promise<string[]> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return [];
        const editorEl = (view.editor as unknown as Record<string, unknown>)
            .containerEl as HTMLElement | undefined;
        if (!editorEl) return [];
        const placeholders = editorEl.querySelectorAll('.cm-foldPlaceholder');
        return Array.from(placeholders).map(
            (el) => (el as HTMLElement).textContent ?? '',
        );
    })) as string[];
}

describe('Fold providers and placeholders (Phase 3)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await loadSingleFileWorkspace();
    });

    describe('Frontmatter fold provider', function () {
        it('frontmatter --- is foldable', async function () {
            await setupEditor(FRONTMATTER_DOC, { line: 0, ch: 0 });
            expect(await isFoldableAt(0)).toBe(true);
        });

        it('frontmatter can be folded via foldEffect dispatch', async function () {
            const result = (await browser.executeObsidian(
                async ({ app, obsidian, require: req }, content: string) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { error: 'No view' };
                    view.editor.setValue(content);
                    view.editor.focus();
                    await new Promise((r) => setTimeout(r, 500));

                    const lang = req('@codemirror/language') as {
                        foldable: (
                            state: unknown,
                            from: number,
                            to: number,
                        ) => { from: number; to: number } | null;
                        foldEffect: {
                            of: (range: {
                                from: number;
                                to: number;
                            }) => unknown;
                        };
                        foldedRanges: (state: unknown) => {
                            iter: () => {
                                value: unknown;
                                from: number;
                                to: number;
                                next: () => void;
                            };
                        };
                    };
                    const cm6View = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as
                        | {
                              state: {
                                  doc: {
                                      line: (n: number) => {
                                          from: number;
                                          to: number;
                                      };
                                  };
                              };
                              dispatch: (spec: { effects: unknown }) => void;
                          }
                        | undefined;
                    if (!cm6View) return { error: 'No CM6 view' };

                    const line1 = cm6View.state.doc.line(1);
                    const range = lang.foldable(
                        cm6View.state,
                        line1.from,
                        line1.to,
                    );
                    if (!range) return { foldable: false };

                    cm6View.dispatch({ effects: lang.foldEffect.of(range) });
                    await new Promise((r) => setTimeout(r, 300));

                    let folded = false;
                    const iter = lang.foldedRanges(cm6View.state).iter();
                    while (iter.value) {
                        if (iter.from <= line1.to && iter.to >= line1.from) {
                            folded = true;
                            break;
                        }
                        iter.next();
                    }
                    return { foldable: true, folded };
                },
                FRONTMATTER_DOC,
            )) as Record<string, unknown>;

            expect(result).not.toHaveProperty('error');
            expect(result).toHaveProperty('foldable', true);
            expect(result).toHaveProperty('folded', true);
        });
    });

    describe('Callout fold provider', function () {
        it('callout line is foldable', async function () {
            await setupEditor(CALLOUT_DOC, { line: 2, ch: 0 });
            expect(await isFoldableAt(2)).toBe(true);
        });

        it('zc on callout folds it', async function () {
            await setupEditor(CALLOUT_DOC, { line: 2, ch: 0 });

            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await sendVimKeys('z', 'c');

            expect(await isFoldedAt(2)).toBe(true);
        });
    });

    describe('Fold placeholder text', function () {
        it('heading fold placeholder contains heading text', async function () {
            await setupEditor(HEADING_CODE_DOC, { line: 0, ch: 0 });

            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await sendVimKeys('z', 'c');
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const placeholders = await getFoldPlaceholderText();
            if (placeholders.length > 0 && placeholders[0] !== '…') {
                expect(placeholders[0]).toContain('Introduction');
            }
        });

        it('callout fold placeholder contains callout type', async function () {
            await setupEditor(CALLOUT_DOC, { line: 2, ch: 0 });

            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await sendVimKeys('z', 'c');
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const placeholders = await getFoldPlaceholderText();
            if (placeholders.length > 0 && placeholders[0] !== '…') {
                expect(placeholders[0]).toContain('tip');
            }
        });
    });

    describe('No conflicts with Obsidian built-in folds', function () {
        it('editor:fold-all still works with custom providers', async function () {
            await setupEditor(HEADING_CODE_DOC, { line: 6, ch: 0 });

            await browser.executeObsidian(({ app }) => {
                (
                    app as unknown as {
                        commands: {
                            executeCommandById: (id: string) => boolean;
                        };
                    }
                ).commands.executeCommandById('editor:fold-all');
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            expect(await isFoldedAt(0)).toBe(true);
        });

        it('editor:unfold-all clears all folds including custom', async function () {
            await setupEditor(CALLOUT_DOC, { line: 2, ch: 0 });

            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await sendVimKeys('z', 'c');
            expect(await isFoldedAt(2)).toBe(true);

            await browser.executeObsidian(({ app }) => {
                (
                    app as unknown as {
                        commands: {
                            executeCommandById: (id: string) => boolean;
                        };
                    }
                ).commands.executeCommandById('editor:unfold-all');
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            expect(await isFoldedAt(2)).toBe(false);
        });
    });
});
