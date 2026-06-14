import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

describe('Ex commands extended', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    it(':q should close current tab', async function () {
        await browser.executeObsidian(async ({ app }) => {
            const existing = app.vault.getAbstractFileByPath('TestFile.md');
            if (existing) await app.vault.delete(existing);
            await app.vault.create('TestFile.md', 'Test content');
        });
        await obsidianPage.openFile('TestFile.md');
        await browser.pause(300);

        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (view) view.editor.focus();
        });
        await browser.pause(300);

        const beforeCount = (await browser.executeObsidian(({ app }) => {
            return app.workspace.getLeavesOfType('markdown').length;
        })) as number;

        const result = await browser.executeObsidian(({ app, obsidian }) => {
            try {
                const Vim = (
                    window as unknown as Record<string, unknown> & {
                        CodeMirrorAdapter?: {
                            Vim?: {
                                handleEx: (cm: unknown, input: string) => void;
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
                Vim.handleEx(adapter, 'q');
                return { success: true };
            } catch (e) {
                return { error: String(e) };
            }
        });
        expect(result).toHaveProperty('success', true);

        await browser.pause(300);

        const afterCount = (await browser.executeObsidian(({ app }) => {
            return app.workspace.getLeavesOfType('markdown').length;
        })) as number;

        expect(afterCount).toBeLessThan(beforeCount);
    });

    it(':wq should save and close', async function () {
        await browser.executeObsidian(async ({ app }) => {
            const existing = app.vault.getAbstractFileByPath('TestFile2.md');
            if (existing) await app.vault.delete(existing);
            await app.vault.create('TestFile2.md', 'Original content');
        });
        await obsidianPage.openFile('TestFile2.md');
        await browser.pause(300);

        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            view.editor.setValue('Modified content');
            view.editor.focus();
        });
        await browser.pause(300);

        const beforeCount = (await browser.executeObsidian(({ app }) => {
            return app.workspace.getLeavesOfType('markdown').length;
        })) as number;

        const result = await browser.executeObsidian(({ app, obsidian }) => {
            try {
                const Vim = (
                    window as unknown as Record<string, unknown> & {
                        CodeMirrorAdapter?: {
                            Vim?: {
                                handleEx: (cm: unknown, input: string) => void;
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
                Vim.handleEx(adapter, 'wq');
                return { success: true };
            } catch (e) {
                return { error: String(e) };
            }
        });
        expect(result).toHaveProperty('success', true);

        await browser.pause(300);

        const afterCount = (await browser.executeObsidian(({ app }) => {
            return app.workspace.getLeavesOfType('markdown').length;
        })) as number;

        expect(afterCount).toBeLessThan(beforeCount);
    });

    it(':bp should go to previous tab', async function () {
        await browser.executeObsidian(async ({ app }) => {
            const existing = app.vault.getAbstractFileByPath('TestFile3.md');
            if (existing) await app.vault.delete(existing);
            await app.vault.create('TestFile3.md', 'Tab test');
        });
        await obsidianPage.openFile('TestFile3.md');
        await browser.pause(300);

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

        const result = await browser.executeObsidian(({ app, obsidian }) => {
            try {
                const Vim = (
                    window as unknown as Record<string, unknown> & {
                        CodeMirrorAdapter?: {
                            Vim?: {
                                handleEx: (cm: unknown, input: string) => void;
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
                Vim.handleEx(adapter, 'bp');
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

        expect(afterPath).not.toBe(beforePath);
    });

    it(':only should close all other tabs', async function () {
        await browser.executeObsidian(async ({ app }) => {
            const existing4 = app.vault.getAbstractFileByPath('TestFile4.md');
            if (existing4) await app.vault.delete(existing4);
            await app.vault.create('TestFile4.md', 'Only test 1');
            const existing5 = app.vault.getAbstractFileByPath('TestFile5.md');
            if (existing5) await app.vault.delete(existing5);
            await app.vault.create('TestFile5.md', 'Only test 2');
        });
        await obsidianPage.openFile('TestFile4.md');
        await browser.pause(200);
        await obsidianPage.openFile('TestFile5.md');
        await browser.pause(300);

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
                                handleEx: (cm: unknown, input: string) => void;
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
                Vim.handleEx(adapter, 'only');
                return { success: true };
            } catch (e) {
                return { error: String(e) };
            }
        });
        expect(result).toHaveProperty('success', true);

        await browser.pause(300);
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(200);
    });

    it(':back should navigate history backward', async function () {
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(300);

        await browser.executeObsidian(async ({ app }) => {
            const existing = app.vault.getAbstractFileByPath('TestBack.md');
            if (existing) await app.vault.delete(existing);
            await app.vault.create('TestBack.md', 'Back test');
        });
        await obsidianPage.openFile('TestBack.md');
        await browser.pause(300);

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
                                handleEx: (cm: unknown, input: string) => void;
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
                Vim.handleEx(adapter, 'back');
                return { success: true };
            } catch (e) {
                return { error: String(e) };
            }
        });
        expect(result).toHaveProperty('success', true);

        await browser.pause(500);
    });

    it(':forward should navigate history forward', async function () {
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(300);

        await browser.executeObsidian(async ({ app }) => {
            const existing = app.vault.getAbstractFileByPath('TestForward.md');
            if (existing) await app.vault.delete(existing);
            await app.vault.create('TestForward.md', 'Forward test');
        });
        await obsidianPage.openFile('TestForward.md');
        await browser.pause(300);

        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (view) view.editor.focus();
        });
        await browser.pause(300);

        const backResult = await browser.executeObsidian(
            ({ app, obsidian }) => {
                try {
                    const Vim = (
                        window as unknown as Record<string, unknown> & {
                            CodeMirrorAdapter?: {
                                Vim?: {
                                    handleEx: (
                                        cm: unknown,
                                        input: string,
                                    ) => void;
                                };
                            };
                        }
                    ).CodeMirrorAdapter?.Vim;
                    if (!Vim) return { error: 'No Vim' };
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { error: 'No view' };
                    const cm = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as Record<string, unknown>;
                    const adapter = cm?.cm;
                    if (!adapter) return { error: 'No adapter' };
                    Vim.handleEx(adapter, 'back');
                    return { success: true };
                } catch (e) {
                    return { error: String(e) };
                }
            },
        );
        expect(backResult).toHaveProperty('success', true);
        await browser.pause(500);

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
                                handleEx: (cm: unknown, input: string) => void;
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
                Vim.handleEx(adapter, 'forward');
                return { success: true };
            } catch (e) {
                return { error: String(e) };
            }
        });
        expect(result).toHaveProperty('success', true);

        await browser.pause(500);
    });

    it(':explorer should not error', async function () {
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(300);

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
                                handleEx: (cm: unknown, input: string) => void;
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
                Vim.handleEx(adapter, 'explorer');
                return { success: true };
            } catch (e) {
                return { error: String(e) };
            }
        });
        expect(result).toHaveProperty('success', true);
    });

    it(':ls should open buffer list without error', async function () {
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(300);
        const result = await browser.executeObsidian(({ app, obsidian }) => {
            try {
                const Vim = (
                    window as unknown as Record<string, unknown> & {
                        CodeMirrorAdapter?: {
                            Vim?: {
                                handleEx: (cm: unknown, input: string) => void;
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
                Vim.handleEx(adapter, 'ls');
                return { success: true };
            } catch (e) {
                return { error: String(e) };
            }
        });
        expect(result).toHaveProperty('success', true);
        await browser.pause(300);
        await browser.keys(['Escape']);
        await browser.pause(200);
    });
});
