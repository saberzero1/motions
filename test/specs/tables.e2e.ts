import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { getEditorValue, vimKeys } from '../helpers';

describe('Table navigation (]|/[| and ]c/[c)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    describe(']| / [| (pipe keybinding)', function () {
        it(']| should move to next cell', async function () {
            const pos = (await browser.executeObsidian(({ app, obsidian }) => {
                const Vim = (
                    window as unknown as Record<string, unknown> & {
                        CodeMirrorAdapter?: {
                            Vim?: {
                                handleKey: (
                                    cm: unknown,
                                    key: string,
                                ) => boolean;
                            };
                        };
                    }
                ).CodeMirrorAdapter?.Vim;
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view || !Vim) return { line: -1, ch: -1 };
                view.editor.setValue(
                    '| A | B | C |\n|---|---|---|\n| 1 | 2 | 3 |',
                );
                view.editor.setCursor(0, 2);
                view.editor.focus();
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return { line: -1, ch: -1 };
                Vim.handleKey(adapter, ']');
                Vim.handleKey(adapter, '|');
                const cursor = view.editor.getCursor();
                return { line: cursor.line, ch: cursor.ch };
            })) as { line: number; ch: number };
            expect(pos.line).toBe(0);
            expect(pos.ch).toBeGreaterThan(3);
        });

        it(']| at last cell should wrap to next row', async function () {
            const pos = (await browser.executeObsidian(({ app, obsidian }) => {
                const Vim = (
                    window as unknown as Record<string, unknown> & {
                        CodeMirrorAdapter?: {
                            Vim?: {
                                handleKey: (
                                    cm: unknown,
                                    key: string,
                                ) => boolean;
                            };
                        };
                    }
                ).CodeMirrorAdapter?.Vim;
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view || !Vim) return { line: -1, ch: -1 };
                view.editor.setValue('| A | B |\n|---|---|\n| 1 | 2 |');
                view.editor.setCursor(0, 6);
                view.editor.focus();
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return { line: -1, ch: -1 };
                Vim.handleKey(adapter, ']');
                Vim.handleKey(adapter, '|');
                const cursor = view.editor.getCursor();
                return { line: cursor.line, ch: cursor.ch };
            })) as { line: number; ch: number };
            expect(pos.line).toBe(2);
        });

        it('[| should move to previous cell', async function () {
            const pos = (await browser.executeObsidian(({ app, obsidian }) => {
                const Vim = (
                    window as unknown as Record<string, unknown> & {
                        CodeMirrorAdapter?: {
                            Vim?: {
                                handleKey: (
                                    cm: unknown,
                                    key: string,
                                ) => boolean;
                            };
                        };
                    }
                ).CodeMirrorAdapter?.Vim;
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view || !Vim) return { line: -1, ch: -1 };
                view.editor.setValue(
                    '| A | B | C |\n|---|---|---|\n| 1 | 2 | 3 |',
                );
                view.editor.setCursor(0, 6);
                view.editor.focus();
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return { line: -1, ch: -1 };
                Vim.handleKey(adapter, '[');
                Vim.handleKey(adapter, '|');
                const cursor = view.editor.getCursor();
                return { line: cursor.line, ch: cursor.ch };
            })) as { line: number; ch: number };
            expect(pos.line).toBe(0);
            expect(pos.ch).toBeLessThan(5);
        });

        it(']| outside a table should no-op', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('Not a table line');
                view.editor.setCursor(0, 5);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys(']', '|');
            expect(await getEditorValue()).toBe('Not a table line');
        });
    });

    describe(']c / [c (alternative keybinding)', function () {
        it(']c should move to next cell', async function () {
            const pos = (await browser.executeObsidian(({ app, obsidian }) => {
                const Vim = (
                    window as unknown as Record<string, unknown> & {
                        CodeMirrorAdapter?: {
                            Vim?: {
                                handleKey: (
                                    cm: unknown,
                                    key: string,
                                ) => boolean;
                            };
                        };
                    }
                ).CodeMirrorAdapter?.Vim;
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view || !Vim) return { line: -1, ch: -1 };
                view.editor.setValue(
                    '| A | B | C |\n|---|---|---|\n| 1 | 2 | 3 |',
                );
                view.editor.setCursor(0, 2);
                view.editor.focus();
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return { line: -1, ch: -1 };
                Vim.handleKey(adapter, ']');
                Vim.handleKey(adapter, 'c');
                const cursor = view.editor.getCursor();
                return { line: cursor.line, ch: cursor.ch };
            })) as { line: number; ch: number };
            expect(pos.line).toBe(0);
            expect(pos.ch).toBeGreaterThan(3);
        });

        it(']c at last cell should wrap to next row', async function () {
            const pos = (await browser.executeObsidian(({ app, obsidian }) => {
                const Vim = (
                    window as unknown as Record<string, unknown> & {
                        CodeMirrorAdapter?: {
                            Vim?: {
                                handleKey: (
                                    cm: unknown,
                                    key: string,
                                ) => boolean;
                            };
                        };
                    }
                ).CodeMirrorAdapter?.Vim;
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view || !Vim) return { line: -1, ch: -1 };
                view.editor.setValue('| A | B |\n|---|---|\n| 1 | 2 |');
                view.editor.setCursor(0, 6);
                view.editor.focus();
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return { line: -1, ch: -1 };
                Vim.handleKey(adapter, ']');
                Vim.handleKey(adapter, 'c');
                const cursor = view.editor.getCursor();
                return { line: cursor.line, ch: cursor.ch };
            })) as { line: number; ch: number };
            expect(pos.line).toBe(2);
        });

        it('[c should move to previous cell', async function () {
            const pos = (await browser.executeObsidian(({ app, obsidian }) => {
                const Vim = (
                    window as unknown as Record<string, unknown> & {
                        CodeMirrorAdapter?: {
                            Vim?: {
                                handleKey: (
                                    cm: unknown,
                                    key: string,
                                ) => boolean;
                            };
                        };
                    }
                ).CodeMirrorAdapter?.Vim;
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view || !Vim) return { line: -1, ch: -1 };
                view.editor.setValue(
                    '| A | B | C |\n|---|---|---|\n| 1 | 2 | 3 |',
                );
                view.editor.setCursor(0, 6);
                view.editor.focus();
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return { line: -1, ch: -1 };
                Vim.handleKey(adapter, '[');
                Vim.handleKey(adapter, 'c');
                const cursor = view.editor.getCursor();
                return { line: cursor.line, ch: cursor.ch };
            })) as { line: number; ch: number };
            expect(pos.line).toBe(0);
            expect(pos.ch).toBeLessThan(5);
        });

        it('[c outside a table should no-op', async function () {
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.setValue('Not a table line');
                view.editor.setCursor(0, 5);
                view.editor.focus();
            });
            await browser.pause(300);
            await vimKeys(']', 'c');
            expect(await getEditorValue()).toBe('Not a table line');
        });
    });
});
