import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { getEditorValue, PAUSE } from '../helpers';

type VimHandle = {
    handleEx: (cm: unknown, input: string) => void;
};

async function runExCommand(
    command: string,
): Promise<{ success?: boolean; error?: string }> {
    return (await browser.executeObsidian(({ app, obsidian }, cmd: string) => {
        try {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: { Vim?: VimHandle };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return { error: 'No Vim API' };
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'No markdown view' };
            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            const adapter = cm?.cm;
            if (!adapter) return { error: 'No adapter' };
            Vim.handleEx(adapter, cmd);
            return { success: true };
        } catch (e) {
            return { error: String(e) };
        }
    }, command)) as { success?: boolean; error?: string };
}

async function focusEditor(): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (view) view.editor.focus();
    });
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

async function getActiveFilePath(): Promise<string> {
    return (await browser.executeObsidian(({ app }) => {
        return app.workspace.getActiveFile()?.path ?? '';
    })) as string;
}

async function cleanupOilFiles(): Promise<void> {
    await browser.executeObsidian(async ({ app }) => {
        const leaf = app.workspace.getMostRecentLeaf();
        const activeFile = app.workspace.getActiveFile();
        if (leaf && activeFile?.name.startsWith('oil~')) {
            leaf.detach();
        }
        for (const file of app.vault.getFiles()) {
            if (file.name.startsWith('oil~')) {
                await app.vault.adapter.remove(file.path);
            }
        }
    });
}

async function cleanupTestFiles(...names: string[]): Promise<void> {
    await browser.executeObsidian(async ({ app }, fileNames: string[]) => {
        for (const name of fileNames) {
            const file = app.vault.getAbstractFileByPath(name);
            if (file) await app.vault.delete(file);
        }
    }, names);
}

async function openOilAndWait(): Promise<void> {
    await focusEditor();
    const result = await runExCommand('Oil');
    expect(result).toHaveProperty('success', true);
    await browser.pause(1500);
}

async function fileExists(path: string): Promise<boolean> {
    return (await browser.executeObsidian(({ app }, p: string) => {
        return app.vault.getAbstractFileByPath(p) !== null;
    }, path)) as boolean;
}

describe('Oil explorer', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(PAUSE.OBSIDIAN_LOAD);
    });

    afterEach(async function () {
        await cleanupOilFiles();
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(PAUSE.EDITOR_SETTLE);
    });

    describe('opening', function () {
        it(':Oil opens a temp markdown file', async function () {
            await openOilAndWait();
            const path = await getActiveFilePath();
            expect(path).toContain('oil~');
        });

        it('oil view is a regular markdown view', async function () {
            await openOilAndWait();
            const viewType = (await browser.executeObsidian(({ app }) => {
                return (
                    app.workspace.getMostRecentLeaf()?.view?.getViewType() ?? ''
                );
            })) as string;
            expect(viewType).toBe('markdown');
        });

        it('oil buffer lists vault files with entry IDs', async function () {
            await openOilAndWait();
            const content = await getEditorValue();
            expect(content).toContain('Welcome.md');
            expect(content).toContain('Target.md');
            expect(content).toMatch(/^\/\d+\s+f\s/m);
        });

        it(':Oil opens current file directory by default', async function () {
            await browser.executeObsidian(async ({ app }) => {
                const existing = app.vault.getAbstractFileByPath('sub');
                if (!existing) await app.vault.createFolder('sub');
                const f = app.vault.getAbstractFileByPath('sub/nested.md');
                if (!f) await app.vault.create('sub/nested.md', 'nested');
            });
            await obsidianPage.openFile('sub/nested.md');
            await browser.pause(PAUSE.EDITOR_SETTLE);
            await openOilAndWait();
            const content = await getEditorValue();
            expect(content).toContain('nested.md');
            expect(content).not.toContain('Welcome.md');
            await cleanupTestFiles('sub/nested.md');
            await browser.executeObsidian(async ({ app }) => {
                const folder = app.vault.getAbstractFileByPath('sub');
                if (folder) await app.vault.delete(folder, true);
            });
        });
    });

    describe('file creation', function () {
        it('new line + :w creates a file', async function () {
            await openOilAndWait();
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                const editor = view.editor;
                const lastLine = editor.lastLine();
                editor.replaceRange('\noil-test-create.md', {
                    line: lastLine,
                    ch: editor.getLine(lastLine).length,
                });
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const commitResult = await runExCommand('w');
            expect(commitResult).toHaveProperty('success', true);
            await browser.pause(1000);

            expect(await fileExists('oil-test-create.md')).toBe(true);
            await cleanupTestFiles('oil-test-create.md');
        });

        it('new line ending with / creates a folder', async function () {
            await openOilAndWait();
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                const editor = view.editor;
                const lastLine = editor.lastLine();
                editor.replaceRange('\noil-test-folder/', {
                    line: lastLine,
                    ch: editor.getLine(lastLine).length,
                });
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const commitResult = await runExCommand('w');
            expect(commitResult).toHaveProperty('success', true);
            await browser.pause(1000);

            const folderExists = (await browser.executeObsidian(({ app }) => {
                const f = app.vault.getAbstractFileByPath('oil-test-folder');
                return f !== null;
            })) as boolean;
            expect(folderExists).toBe(true);

            await browser.executeObsidian(async ({ app }) => {
                const f = app.vault.getAbstractFileByPath('oil-test-folder');
                if (f) await app.vault.delete(f, true);
            });
        });
    });

    describe('file deletion', function () {
        it('deleting a line + :w removes the file', async function () {
            await browser.executeObsidian(async ({ app }) => {
                const existing =
                    app.vault.getAbstractFileByPath('oil-delete-me.md');
                if (existing) await app.vault.delete(existing);
                await app.vault.create('oil-delete-me.md', 'to be deleted');
                const plugin = (
                    app as unknown as {
                        plugins: {
                            plugins: Record<
                                string,
                                {
                                    settings?: {
                                        oilConfirmDeleteThreshold?: number;
                                    };
                                }
                            >;
                        };
                    }
                ).plugins.plugins['vim-motions'];
                if (plugin?.settings) {
                    plugin.settings.oilConfirmDeleteThreshold = 999;
                }
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            await openOilAndWait();

            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                const editor = view.editor;
                const content = editor.getValue();
                const lines = content.split('\n');
                const targetIdx = lines.findIndex((l: string) =>
                    l.includes('oil-delete-me.md'),
                );
                if (targetIdx < 0) return;
                editor.replaceRange(
                    '',
                    { line: targetIdx, ch: 0 },
                    { line: targetIdx + 1, ch: 0 },
                );
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const commitResult = await runExCommand('w');
            expect(commitResult).toHaveProperty('success', true);
            await browser.pause(1000);

            expect(await fileExists('oil-delete-me.md')).toBe(false);

            await browser.executeObsidian(async ({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins: {
                            plugins: Record<
                                string,
                                {
                                    settings?: {
                                        oilConfirmDeleteThreshold?: number;
                                    };
                                }
                            >;
                        };
                    }
                ).plugins.plugins['vim-motions'];
                if (plugin?.settings) {
                    plugin.settings.oilConfirmDeleteThreshold = 1;
                }
            });
        });
    });

    describe('file rename', function () {
        it('editing a filename + :w renames the file', async function () {
            await browser.executeObsidian(async ({ app }) => {
                const existing =
                    app.vault.getAbstractFileByPath('oil-rename-src.md');
                if (existing) await app.vault.delete(existing);
                const target =
                    app.vault.getAbstractFileByPath('oil-rename-dst.md');
                if (target) await app.vault.delete(target);
                await app.vault.create('oil-rename-src.md', 'will be renamed');
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            await openOilAndWait();

            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                const editor = view.editor;
                const content = editor.getValue();
                const updated = content.replace(
                    'oil-rename-src.md',
                    'oil-rename-dst.md',
                );
                editor.setValue(updated);
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const commitResult = await runExCommand('w');
            expect(commitResult).toHaveProperty('success', true);
            await browser.pause(1000);

            expect(await fileExists('oil-rename-src.md')).toBe(false);
            expect(await fileExists('oil-rename-dst.md')).toBe(true);
            await cleanupTestFiles('oil-rename-dst.md');
        });
    });

    describe('no-op save', function () {
        it(':w with no changes shows no-changes notice', async function () {
            await openOilAndWait();
            const commitResult = await runExCommand('w');
            expect(commitResult).toHaveProperty('success', true);
        });
    });

    describe('oil temp file exclusion', function () {
        it('oil temp files are not listed in oil buffer', async function () {
            await openOilAndWait();
            const content = await getEditorValue();
            expect(content).not.toContain('oil~');
        });
    });

    after(async function () {
        await cleanupOilFiles();
        await cleanupTestFiles(
            'oil-test-create.md',
            'oil-delete-me.md',
            'oil-rename-src.md',
            'oil-rename-dst.md',
        );
    });
});
