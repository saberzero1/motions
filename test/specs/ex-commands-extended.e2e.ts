import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

import {
    dismissNotices,
    getNotices,
    getWorkspaceSnapshot,
    handleEx,
    loadTwoFileWorkspace,
} from '../helpers';

async function isPickerOpen(): Promise<boolean> {
    return (await browser.executeObsidian(
        () => document.querySelector('.vim-motions-picker') !== null,
    )) as boolean;
}

async function closePicker(): Promise<void> {
    await browser.keys(['Escape']);
    await browser.waitUntil(async () => !(await isPickerOpen()), {
        timeout: 5000,
        interval: 100,
        timeoutMsg: 'expected the buffer picker instance to close on Escape',
    });
}

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

    it(':only closes every other markdown tab', async function () {
        await loadTwoFileWorkspace('Welcome.md', 'Target.md', 'second');
        expect((await getWorkspaceSnapshot()).markdownLeafCount).toBe(2);

        const result = await handleEx('only');

        expect(result.unknownCommand).toBe(false);
        await browser.waitUntil(
            async () => (await getWorkspaceSnapshot()).markdownLeafCount === 1,
            { timeout: 5000, interval: 100 },
        );
        expect((await getWorkspaceSnapshot()).activeFile).toBe('Target.md');
    });

    it(':back dispatches Obsidian’s history-back command', async function () {
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

        const result = await handleEx('back');

        expect(result.unknownCommand).toBe(false);
        expect(result.dispatchedCommands).toContain('app:go-back');
    });

    it(':forward dispatches Obsidian’s history-forward command', async function () {
        const result = await handleEx('forward');

        expect(result.unknownCommand).toBe(false);
        expect(result.dispatchedCommands).toContain('app:go-forward');
    });

    it(':explorer dispatches reveal-active-file', async function () {
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(300);

        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (view) view.editor.focus();
        });
        await browser.pause(300);

        const result = await handleEx('explorer');

        expect(result.unknownCommand).toBe(false);
        expect(result.dispatchedCommands).toContain(
            'file-explorer:reveal-active-file',
        );
    });

    it(':ls opens the buffer picker', async function () {
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(300);
        expect(await isPickerOpen()).toBe(false);

        const result = await handleEx('ls');

        expect(result.unknownCommand).toBe(false);
        await browser.waitUntil(async () => await isPickerOpen(), {
            timeout: 5000,
            interval: 100,
            timeoutMsg: 'expected :ls to open the buffer picker',
        });
        await closePicker();
    });

    it(':violations! clears recorded invariant violations', async function () {
        const violationMessage = 'violations bang e2e control';
        await browser.executeObsidian(async ({ app }, message: string) => {
            const plugin = app.plugins.plugins['vim-motions'] as unknown as {
                loadData(): Promise<Record<string, unknown> | null>;
                loadSettings(): Promise<void>;
            };
            const loadData = plugin.loadData.bind(plugin);
            plugin.loadData = async () => ({
                ...(await loadData()),
                configMode: message,
            });
            try {
                await plugin.loadSettings();
            } finally {
                plugin.loadData = loadData;
                await plugin.loadSettings();
            }
        }, violationMessage);
        await dismissNotices();

        await handleEx('violations');
        expect(
            (await getNotices()).some((notice) =>
                notice.includes(violationMessage),
            ),
        ).toBe(true);
        await dismissNotices();

        const result = await handleEx('violations!');
        expect(result.unknownCommand).toBe(false);
        await dismissNotices();

        await handleEx('violations');
        expect(await getNotices()).toContain(
            'No invariant violations recorded.',
        );
    });
});
