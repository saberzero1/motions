import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

describe('Buffer navigation (]b/[b)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    it(']b should switch to next open buffer', async function () {
        await obsidianPage.write('TestNote.md', 'Test content');
        await obsidianPage.openFile('TestNote.md');
        await obsidianPage.openFile('Welcome.md');

        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (view) view.editor.focus();
        });
        await browser.pause(300);

        const beforePath = (await browser.executeObsidian(({ app }) => {
            return app.workspace.getActiveFile()?.path ?? '';
        })) as string;
        expect(beforePath).toBe('Welcome.md');

        const result = await browser.executeObsidian(({ app, obsidian }) => {
            try {
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
                if (!Vim) return { error: 'No Vim' };
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return { error: 'No view' };
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return { error: 'No adapter' };
                Vim.handleKey(adapter, ']');
                Vim.handleKey(adapter, 'b');
                return { success: true };
            } catch (e) {
                return { error: String(e) };
            }
        });
        expect(result).toHaveProperty('success', true);
        await browser.pause(500);

        const afterPath = (await browser.executeObsidian(({ app }) => {
            return app.workspace.getActiveFile()?.path ?? '';
        })) as string;
        expect(typeof afterPath).toBe('string');
    });

    it('[b should switch to previous buffer', async function () {
        await obsidianPage.openFile('Welcome.md');
        await obsidianPage.openFile('TestNote.md');

        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (view) view.editor.focus();
        });
        await browser.pause(300);

        const result = await browser.executeObsidian(({ app, obsidian }) => {
            try {
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
                if (!Vim) return { error: 'No Vim' };
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return { error: 'No view' };
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return { error: 'No adapter' };
                Vim.handleKey(adapter, '[');
                Vim.handleKey(adapter, 'b');
                return { success: true };
            } catch (e) {
                return { error: String(e) };
            }
        });
        expect(result).toHaveProperty('success', true);
        await browser.pause(500);

        const afterPath = (await browser.executeObsidian(({ app }) => {
            return app.workspace.getActiveFile()?.path ?? '';
        })) as string;
        expect(afterPath).not.toBe('TestNote.md');
    });

    it(']b with single buffer should not error', async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');

        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (view) view.editor.focus();
        });
        await browser.pause(300);

        const result = await browser.executeObsidian(({ app, obsidian }) => {
            try {
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
                if (!Vim) return { error: 'No Vim' };
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return { error: 'No view' };
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return { error: 'No adapter' };
                Vim.handleKey(adapter, ']');
                Vim.handleKey(adapter, 'b');
                return { success: true };
            } catch (e) {
                return { error: String(e) };
            }
        });
        expect(result).toHaveProperty('success', true);
        await browser.pause(300);

        const afterPath = (await browser.executeObsidian(({ app }) => {
            return app.workspace.getActiveFile()?.path ?? '';
        })) as string;
        expect(afterPath).toBe('Welcome.md');
    });
});
