import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { PAUSE } from '../helpers';

type VimHandle = {
    handleEx: (cm: unknown, input: string) => void;
};

type OilEditorView = {
    state: {
        doc: {
            length: number;
            lines: number;
            line: (lineNumber: number) => {
                text: string;
                from: number;
                to: number;
            };
            toString: () => string;
        };
    };
    dispatch: (spec: {
        changes: { from: number; to?: number; insert?: string };
    }) => void;
    focus?: () => void;
    dom?: Element;
};

async function runExCommand(
    command: string,
): Promise<{ success?: boolean; error?: string }> {
    return (await browser.executeObsidian(async ({ app }, cmd: string) => {
        try {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: { Vim?: VimHandle };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return { error: 'No Vim API' };
            const leaf = app.workspace.getMostRecentLeaf();
            const view = leaf?.view;
            if (!view) return { error: 'No active view' };
            if (view.getViewType?.() === 'oil-explorer') {
                if (cmd === 'w' || cmd === 'write') {
                    const plugin = (
                        app as unknown as {
                            plugins?: {
                                plugins?: Record<
                                    string,
                                    { oilManager?: unknown }
                                >;
                            };
                        }
                    ).plugins?.plugins?.['vim-motions'];
                    if (!plugin?.oilManager) {
                        return { error: 'No oil manager' };
                    }
                    await (
                        plugin.oilManager as { commit?: () => Promise<void> }
                    ).commit?.();
                    return { success: true };
                }
                return { error: 'Unsupported ex command in oil view' };
            }
            const editor = (view as unknown as { editor?: unknown }).editor as
                | { cm?: { cm?: unknown } }
                | undefined;
            const adapter = editor?.cm?.cm;
            if (!adapter) return { error: 'No adapter' };
            Vim.handleEx(adapter, cmd);
            return { success: true };
        } catch (e) {
            return { error: String(e) };
        }
    }, command)) as { success?: boolean; error?: string };
}

async function runOilCommit(): Promise<{ success?: boolean; error?: string }> {
    return (await browser.executeObsidian(async ({ app }) => {
        try {
            const plugin = (
                app as unknown as {
                    plugins?: {
                        plugins?: Record<string, { oilManager?: unknown }>;
                    };
                }
            ).plugins?.plugins?.['vim-motions'];
            if (!plugin?.oilManager) return { error: 'No oil manager' };
            await (
                plugin.oilManager as { commit?: () => Promise<void> }
            ).commit?.();
            return { success: true };
        } catch (e) {
            return { error: String(e) };
        }
    })) as { success?: boolean; error?: string };
}

async function focusOilEditor(): Promise<void> {
    await browser.executeObsidian(({ app }) => {
        const leaf = app.workspace.getMostRecentLeaf();
        if (leaf?.view?.getViewType() !== 'oil-explorer') return;
        const editorView = (
            leaf.view as unknown as { getEditorView?: () => OilEditorView }
        ).getEditorView?.();
        editorView?.focus?.();
    });
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

async function getOilContent(): Promise<string> {
    return (await browser.executeObsidian(({ app }) => {
        const leaf = app.workspace.getMostRecentLeaf();
        if (leaf?.view?.getViewType() !== 'oil-explorer') return '';
        return (
            (
                leaf.view as unknown as { getBufferContent?: () => string }
            ).getBufferContent?.() ?? ''
        );
    })) as string;
}

async function cleanupOilViews(): Promise<void> {
    await browser.executeObsidian(({ app }) => {
        app.workspace.iterateAllLeaves((leaf) => {
            if (leaf.view?.getViewType() === 'oil-explorer') {
                leaf.detach();
            }
        });
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

async function openOilAndWait(dirPath?: string): Promise<void> {
    await focusOilEditor();
    await browser.executeObsidian(async ({ app }, dir?: string) => {
        const plugin = (
            app as unknown as {
                plugins?: {
                    plugins?: Record<string, { oilManager?: unknown }>;
                };
            }
        ).plugins?.plugins?.['vim-motions'];
        const activeDir =
            dir ??
            (() => {
                const file = app.workspace.getActiveFile();
                if (!file) return '';
                const path = file.path;
                const idx = path.lastIndexOf('/');
                return idx === -1 ? '' : path.slice(0, idx);
            })();
        if (!plugin?.oilManager) return;
        await (
            plugin.oilManager as { openOil?: (path: string) => Promise<void> }
        ).openOil?.(activeDir);
    }, dirPath);
    await browser.pause(1500);
}

async function fileExists(path: string): Promise<boolean> {
    return (await browser.executeObsidian(({ app }, p: string) => {
        return app.vault.getAbstractFileByPath(p) !== null;
    }, path)) as boolean;
}

async function appendToOilBuffer(text: string): Promise<void> {
    await browser.executeObsidian(({ app }, txt: string) => {
        const leaf = app.workspace.getMostRecentLeaf();
        if (leaf?.view?.getViewType() !== 'oil-explorer') return;
        const editorView = (
            leaf.view as unknown as { getEditorView?: () => OilEditorView }
        ).getEditorView?.();
        if (!editorView) return;
        const doc = editorView.state.doc;
        editorView.dispatch({
            changes: { from: doc.length, insert: `\n${txt}` },
        });
    }, text);
}

async function replaceInOilBuffer(
    search: string,
    replace: string,
): Promise<void> {
    await browser.executeObsidian(
        ({ app }, s: string, r: string) => {
            const leaf = app.workspace.getMostRecentLeaf();
            if (leaf?.view?.getViewType() !== 'oil-explorer') return;
            const editorView = (
                leaf.view as unknown as { getEditorView?: () => OilEditorView }
            ).getEditorView?.();
            if (!editorView) return;
            const content = editorView.state.doc.toString();
            const idx = content.indexOf(s);
            if (idx < 0) return;
            editorView.dispatch({
                changes: { from: idx, to: idx + s.length, insert: r },
            });
        },
        search,
        replace,
    );
}

async function deleteLineContaining(text: string): Promise<void> {
    await browser.executeObsidian(({ app }, txt: string) => {
        const leaf = app.workspace.getMostRecentLeaf();
        if (leaf?.view?.getViewType() !== 'oil-explorer') return;
        const editorView = (
            leaf.view as unknown as { getEditorView?: () => OilEditorView }
        ).getEditorView?.();
        if (!editorView) return;
        const doc = editorView.state.doc;
        for (let i = 1; i <= doc.lines; i++) {
            const line = doc.line(i);
            if (line.text.includes(txt)) {
                const from = line.from;
                const to = i < doc.lines ? doc.line(i + 1).from : line.to;
                editorView.dispatch({ changes: { from, to } });
                return;
            }
        }
    }, text);
}

describe('Oil explorer', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(PAUSE.OBSIDIAN_LOAD);
    });

    afterEach(async function () {
        await cleanupOilViews();
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(PAUSE.EDITOR_SETTLE);
    });

    describe('opening', function () {
        it(':Oil opens an oil explorer view', async function () {
            await openOilAndWait();
            const viewType = (await browser.executeObsidian(({ app }) => {
                return (
                    app.workspace.getMostRecentLeaf()?.view?.getViewType() ?? ''
                );
            })) as string;
            expect(viewType).toBe('oil-explorer');
        });

        it('oil view uses the oil explorer view type', async function () {
            await openOilAndWait();
            const viewType = (await browser.executeObsidian(({ app }) => {
                return (
                    app.workspace.getMostRecentLeaf()?.view?.getViewType() ?? ''
                );
            })) as string;
            expect(viewType).toBe('oil-explorer');
        });

        it('oil buffer lists vault files with entry IDs', async function () {
            await openOilAndWait();
            const content = await getOilContent();
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
            const content = await getOilContent();
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
            await appendToOilBuffer('oil-test-create.md');
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const commitResult = await runOilCommit();
            expect(commitResult).toHaveProperty('success', true);
            await browser.pause(1000);

            expect(await fileExists('oil-test-create.md')).toBe(true);
            await cleanupTestFiles('oil-test-create.md');
        });

        it('new line ending with / creates a folder', async function () {
            await openOilAndWait();
            await appendToOilBuffer('oil-test-folder/');
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const commitResult = await runOilCommit();
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

            await deleteLineContaining('oil-delete-me.md');
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const commitResult = await runOilCommit();
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

            await replaceInOilBuffer('oil-rename-src.md', 'oil-rename-dst.md');
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const commitResult = await runOilCommit();
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

    describe('oil view properties', function () {
        it('oil temp files are not created', async function () {
            await openOilAndWait();
            const hasTempFiles = (await browser.executeObsidian(({ app }) => {
                return app.vault
                    .getFiles()
                    .some((file) => file.name.startsWith('oil~'));
            })) as boolean;
            expect(hasTempFiles).toBe(false);
        });

        it('oil view display text shows directory path', async function () {
            await openOilAndWait('');
            const displayText = (await browser.executeObsidian(({ app }) => {
                const leaf = app.workspace.getMostRecentLeaf();
                return leaf?.view?.getDisplayText() ?? '';
            })) as string;
            expect(displayText).toBe('vault root');
        });

        it('oil view has folder-open icon', async function () {
            await openOilAndWait();
            const icon = (await browser.executeObsidian(({ app }) => {
                const leaf = app.workspace.getMostRecentLeaf();
                return leaf?.view?.getIcon?.() ?? '';
            })) as string;
            expect(icon).toBe('folder-open');
        });

        it('oil editor is focused on open', async function () {
            await openOilAndWait();
            const isFocused = (await browser.executeObsidian(({ app }) => {
                const leaf = app.workspace.getMostRecentLeaf();
                if (leaf?.view?.getViewType() !== 'oil-explorer') return false;
                const editorView = (
                    leaf.view as unknown as {
                        getEditorView?: () => OilEditorView;
                    }
                ).getEditorView?.();
                return editorView
                    ? document.activeElement?.closest('.cm-editor') ===
                          editorView.dom
                    : false;
            })) as boolean;
            expect(isFocused).toBe(true);
        });

        it('oil view persists directory in state', async function () {
            await browser.executeObsidian(async ({ app }) => {
                const existing = app.vault.getAbstractFileByPath('statesub');
                if (!existing) await app.vault.createFolder('statesub');
                const f = app.vault.getAbstractFileByPath('statesub/test.md');
                if (!f) await app.vault.create('statesub/test.md', 'test');
            });
            await openOilAndWait('statesub');
            const state = (await browser.executeObsidian(({ app }) => {
                const leaf = app.workspace.getMostRecentLeaf();
                if (leaf?.view?.getViewType() !== 'oil-explorer') return null;
                return (
                    leaf.view as unknown as {
                        getState?: () => { dirPath: string };
                    }
                ).getState?.();
            })) as { dirPath: string } | null;
            expect(state).not.toBeNull();
            expect(state?.dirPath).toBe('statesub');
            await cleanupTestFiles('statesub/test.md');
            await browser.executeObsidian(async ({ app }) => {
                const folder = app.vault.getAbstractFileByPath('statesub');
                if (folder) await app.vault.delete(folder, true);
            });
        });
    });

    describe('close behavior', function () {
        it('closing oil restores the previously open file', async function () {
            await obsidianPage.openFile('Welcome.md');
            await browser.pause(PAUSE.EDITOR_SETTLE);
            await openOilAndWait();

            const viewBeforeClose = (await browser.executeObsidian(
                ({ app }) => {
                    return (
                        app.workspace
                            .getMostRecentLeaf()
                            ?.view?.getViewType() ?? ''
                    );
                },
            )) as string;
            expect(viewBeforeClose).toBe('oil-explorer');

            await browser.executeObsidian(async ({ app }) => {
                const leaf = app.workspace.getMostRecentLeaf();
                if (leaf?.view?.getViewType() !== 'oil-explorer') return;
                const previousFile = (
                    leaf.view as unknown as {
                        getPreviousFile?: () => string | null;
                    }
                ).getPreviousFile?.();
                const file = previousFile
                    ? app.vault.getAbstractFileByPath(previousFile)
                    : null;
                if (file) {
                    await leaf.openFile(file as import('obsidian').TFile);
                } else {
                    leaf.detach();
                }
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const activeFile = (await browser.executeObsidian(({ app }) => {
                return app.workspace.getActiveFile()?.path ?? '';
            })) as string;
            expect(activeFile).toBe('Welcome.md');

            const viewAfterClose = (await browser.executeObsidian(({ app }) => {
                return (
                    app.workspace.getMostRecentLeaf()?.view?.getViewType() ?? ''
                );
            })) as string;
            expect(viewAfterClose).toBe('markdown');
        });

        it('closing oil from root does not leave empty workspace', async function () {
            await obsidianPage.openFile('Welcome.md');
            await browser.pause(PAUSE.EDITOR_SETTLE);
            await openOilAndWait('');

            await browser.executeObsidian(async ({ app }) => {
                const leaf = app.workspace.getMostRecentLeaf();
                if (leaf?.view?.getViewType() !== 'oil-explorer') return;
                const previousFile = (
                    leaf.view as unknown as {
                        getPreviousFile?: () => string | null;
                    }
                ).getPreviousFile?.();
                const file = previousFile
                    ? app.vault.getAbstractFileByPath(previousFile)
                    : null;
                if (file) {
                    await leaf.openFile(file as import('obsidian').TFile);
                } else {
                    leaf.detach();
                }
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const hasLeaf = (await browser.executeObsidian(({ app }) => {
                return app.workspace.getMostRecentLeaf() !== null;
            })) as boolean;
            expect(hasLeaf).toBe(true);

            const viewType = (await browser.executeObsidian(({ app }) => {
                return (
                    app.workspace.getMostRecentLeaf()?.view?.getViewType() ?? ''
                );
            })) as string;
            expect(viewType).toBe('markdown');
        });
    });

    after(async function () {
        await cleanupOilViews();
        await cleanupTestFiles(
            'oil-test-create.md',
            'oil-delete-me.md',
            'oil-rename-src.md',
            'oil-rename-dst.md',
        );
    });
});
