import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { setupEditor, getCursorPos, getEditorValue } from '../../helpers';
import { testWithNeovim, startNvim, stopNvim } from '../../neovim/test-wrapper';
import { SUITES } from '../../neovim/test-definitions';

describe('Normal mode — scroll commands (Tier 1)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await startNvim();
    });

    after(async function () {
        await stopNvim();
    });

    afterEach(async function () {
        await browser.keys(['Escape']);
        await browser.pause(50);
    });

    const suite = SUITES.find((s) => s.name === 'normal-scroll');
    if (suite) {
        for (const tc of suite.cases) {
            testWithNeovim('normal-scroll', tc.name, {
                content: tc.content,
                cursor: tc.cursor,
                keys: [tc.keys],
            });
        }
    }

    const longContent = Array.from(
        { length: 100 },
        (_, i) => `line ${i + 1}`,
    ).join('\n');

    describe('CTRL-D / CTRL-U', function () {
        it('CTRL-D should scroll down', async function () {
            await setupEditor(longContent, { line: 0, ch: 0 });
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm as Record<string, unknown> | undefined;
                if (!adapter) return;
                const Vim = (
                    window as unknown as {
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
                if (!Vim) return;
                Vim.handleKey(adapter, '<C-d>');
            });
            await browser.pause(300);
            const pos = await getCursorPos();
            expect(pos.line).toBeGreaterThan(0);
        });

        it('CTRL-U should scroll up', async function () {
            await setupEditor(longContent, { line: 50, ch: 0 });
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm as Record<string, unknown> | undefined;
                if (!adapter) return;
                const Vim = (
                    window as unknown as {
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
                if (!Vim) return;
                Vim.handleKey(adapter, '<C-u>');
            });
            await browser.pause(300);
            const pos = await getCursorPos();
            expect(pos.line).toBeLessThan(50);
        });
    });

    describe('CTRL-F / CTRL-B', function () {
        it('CTRL-F should page forward', async function () {
            await setupEditor(longContent, { line: 0, ch: 0 });
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm as Record<string, unknown> | undefined;
                if (!adapter) return;
                const Vim = (
                    window as unknown as {
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
                if (!Vim) return;
                Vim.handleKey(adapter, '<C-f>');
            });
            await browser.pause(300);
            const pos = await getCursorPos();
            expect(pos.line).toBeGreaterThan(5);
        });

        it('CTRL-B should page backward', async function () {
            await setupEditor(longContent, { line: 50, ch: 0 });
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm as Record<string, unknown> | undefined;
                if (!adapter) return;
                const Vim = (
                    window as unknown as {
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
                if (!Vim) return;
                Vim.handleKey(adapter, '<C-b>');
            });
            await browser.pause(300);
            const pos = await getCursorPos();
            expect(pos.line).toBeLessThan(50);
        });
    });

    describe('CTRL-E / CTRL-Y', function () {
        it('CTRL-E should scroll down without moving cursor line', async function () {
            await setupEditor(longContent, { line: 10, ch: 0 });
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm as Record<string, unknown> | undefined;
                if (!adapter) return;
                const Vim = (
                    window as unknown as {
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
                if (!Vim) return;
                Vim.handleKey(adapter, '<C-e>');
            });
            await browser.pause(300);
            const pos = await getCursorPos();
            expect(pos.line).toBeGreaterThanOrEqual(10);
        });
    });

    describe('CTRL-A / CTRL-X', function () {
        it('CTRL-A should increment number under cursor', async function () {
            await setupEditor('count: 5', { line: 0, ch: 7 });
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm as Record<string, unknown> | undefined;
                if (!adapter) return;
                const Vim = (
                    window as unknown as {
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
                if (!Vim) return;
                Vim.handleKey(adapter, '<C-a>');
            });
            await browser.pause(300);
            expect(await getEditorValue()).toBe('count: 6');
        });

        it('CTRL-X should decrement number under cursor', async function () {
            await setupEditor('count: 5', { line: 0, ch: 7 });
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm as Record<string, unknown> | undefined;
                if (!adapter) return;
                const Vim = (
                    window as unknown as {
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
                if (!Vim) return;
                Vim.handleKey(adapter, '<C-x>');
            });
            await browser.pause(300);
            expect(await getEditorValue()).toBe('count: 4');
        });
    });
});
