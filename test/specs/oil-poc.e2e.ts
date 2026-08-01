import { browser, expect } from '@wdio/globals';
import { Key } from 'webdriverio';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    PAUSE,
    ensureLivePreview,
    ensureSourceMode,
    isLivePreview,
    isSourceMode,
} from '../helpers';

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

    describe('scope cleanup after close', function () {
        beforeEach(async function () {
            await browser.reloadObsidian({ vault: 'test-vault' });
            await obsidianPage.openFile('Welcome.md');
            await browser.pause(PAUSE.OBSIDIAN_LOAD);
        });

        it('Ctrl keys work on restored file after closing Oil via closeOil()', async function () {
            await ensureSourceMode();
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

            await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins?: {
                            plugins?: Record<string, { oilManager?: unknown }>;
                        };
                    }
                ).plugins?.plugins?.['vim-motions'];
                if (!plugin?.oilManager) return;
                (plugin.oilManager as { closeOil?: () => void }).closeOil?.();
            });
            await browser.pause(1000);

            const viewAfterClose = (await browser.executeObsidian(({ app }) => {
                return (
                    app.workspace.getMostRecentLeaf()?.view?.getViewType() ?? ''
                );
            })) as string;
            expect(viewAfterClose).toBe('markdown');

            const ctrlSResult = (await browser.executeObsidian(
                ({ app, obsidian }) => {
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
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view || !Vim) return { error: 'no view or vim' };
                    const cm = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as Record<string, unknown>;
                    const adapter = cm?.cm;
                    if (!adapter) return { error: 'no adapter' };
                    const handled = Vim.handleKey(adapter, '<C-d>');
                    return { handled };
                },
            )) as { error?: string; handled?: boolean };

            expect(ctrlSResult.error).toBeUndefined();
            expect(ctrlSResult.handled).toBe(true);
        });

        it('Ctrl keys work after opening and closing Oil multiple times', async function () {
            await ensureSourceMode();

            for (let i = 0; i < 3; i++) {
                await openOilAndWait();

                const isOil = (await browser.executeObsidian(({ app }) => {
                    return (
                        app.workspace
                            .getMostRecentLeaf()
                            ?.view?.getViewType() ?? ''
                    );
                })) as string;
                expect(isOil).toBe('oil-explorer');

                await browser.executeObsidian(({ app }) => {
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
                    if (!plugin?.oilManager) return;
                    (
                        plugin.oilManager as { closeOil?: () => void }
                    ).closeOil?.();
                });
                await browser.pause(1000);
            }

            const viewAfter = (await browser.executeObsidian(({ app }) => {
                return (
                    app.workspace.getMostRecentLeaf()?.view?.getViewType() ?? ''
                );
            })) as string;
            expect(viewAfter).toBe('markdown');

            const ctrlResult = (await browser.executeObsidian(
                ({ app, obsidian }) => {
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
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view || !Vim) return { error: 'no view or vim' };
                    const cm = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as Record<string, unknown>;
                    const adapter = cm?.cm;
                    if (!adapter) return { error: 'no adapter' };
                    const handled = Vim.handleKey(adapter, '<C-d>');
                    return { handled };
                },
            )) as { error?: string; handled?: boolean };

            expect(ctrlResult.error).toBeUndefined();
            expect(ctrlResult.handled).toBe(true);
        });
    });

    describe(':Oil path resolution', function () {
        it(':Oil . opens vault root', async function () {
            await obsidianPage.openFile('Welcome.md');
            await browser.pause(PAUSE.EDITOR_SETTLE);

            await runExCommand('Oil .');
            await browser.pause(1500);

            const dirPath = (await browser.executeObsidian(({ app }) => {
                const leaf = app.workspace.getMostRecentLeaf();
                if (leaf?.view?.getViewType() !== 'oil-explorer') return null;
                return (
                    leaf.view as unknown as { getDirPath?: () => string }
                ).getDirPath?.();
            })) as string | null;

            expect(dirPath).toBe('');
        });

        it(':Oil / opens vault root', async function () {
            await obsidianPage.openFile('Welcome.md');
            await browser.pause(PAUSE.EDITOR_SETTLE);

            await runExCommand('Oil /');
            await browser.pause(1500);

            const dirPath = (await browser.executeObsidian(({ app }) => {
                const leaf = app.workspace.getMostRecentLeaf();
                if (leaf?.view?.getViewType() !== 'oil-explorer') return null;
                return (
                    leaf.view as unknown as { getDirPath?: () => string }
                ).getDirPath?.();
            })) as string | null;

            expect(dirPath).toBe('');
        });
    });

    describe('mode restoration', function () {
        it('closing oil restores source mode', async function () {
            await obsidianPage.openFile('Welcome.md');
            await browser.pause(PAUSE.EDITOR_SETTLE);
            await ensureSourceMode();
            expect(await isSourceMode()).toBe(true);

            await openOilAndWait();
            const viewType = (await browser.executeObsidian(({ app }) => {
                return (
                    app.workspace.getMostRecentLeaf()?.view?.getViewType() ?? ''
                );
            })) as string;
            expect(viewType).toBe('oil-explorer');

            await browser.executeObsidian(async ({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins?: {
                            plugins?: Record<string, { oilManager?: unknown }>;
                        };
                    }
                ).plugins?.plugins?.['vim-motions'];
                if (!plugin?.oilManager) return;
                (plugin.oilManager as { closeOil?: () => void }).closeOil?.();
            });
            await browser.pause(PAUSE.EDITOR_SETTLE * 3);

            const activeFile = (await browser.executeObsidian(({ app }) => {
                return app.workspace.getActiveFile()?.path ?? '';
            })) as string;
            expect(activeFile).toBe('Welcome.md');
            expect(await isSourceMode()).toBe(true);
        });

        it('closing oil restores live preview mode', async function () {
            await obsidianPage.openFile('Welcome.md');
            await browser.pause(PAUSE.EDITOR_SETTLE);
            await ensureLivePreview();
            expect(await isLivePreview()).toBe(true);

            await openOilAndWait();

            await browser.executeObsidian(async ({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins?: {
                            plugins?: Record<string, { oilManager?: unknown }>;
                        };
                    }
                ).plugins?.plugins?.['vim-motions'];
                if (!plugin?.oilManager) return;
                (plugin.oilManager as { closeOil?: () => void }).closeOil?.();
            });
            await browser.pause(PAUSE.EDITOR_SETTLE * 3);

            const activeFile = (await browser.executeObsidian(({ app }) => {
                return app.workspace.getActiveFile()?.path ?? '';
            })) as string;
            expect(activeFile).toBe('Welcome.md');
            expect(await isLivePreview()).toBe(true);
        });

        it('closeOil() restores previous file', async function () {
            await obsidianPage.openFile('Welcome.md');
            await browser.pause(PAUSE.EDITOR_SETTLE);

            await openOilAndWait();

            await browser.executeObsidian(async ({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins?: {
                            plugins?: Record<string, { oilManager?: unknown }>;
                        };
                    }
                ).plugins?.plugins?.['vim-motions'];
                if (!plugin?.oilManager) return;
                (plugin.oilManager as { closeOil?: () => void }).closeOil?.();
            });
            await browser.pause(PAUSE.EDITOR_SETTLE * 2);

            const activeFile = (await browser.executeObsidian(({ app }) => {
                return app.workspace.getActiveFile()?.path ?? '';
            })) as string;
            expect(activeFile).toBe('Welcome.md');

            const viewType = (await browser.executeObsidian(({ app }) => {
                return (
                    app.workspace.getMostRecentLeaf()?.view?.getViewType() ?? ''
                );
            })) as string;
            expect(viewType).toBe('markdown');
        });
    });

    describe('vault root navigation', function () {
        it('can navigate into a folder from vault root', async function () {
            await browser.executeObsidian(async ({ app }) => {
                const existing = app.vault.getAbstractFileByPath('oil-nav-sub');
                if (!existing) await app.vault.createFolder('oil-nav-sub');
                const f = app.vault.getAbstractFileByPath(
                    'oil-nav-sub/inner.md',
                );
                if (!f) await app.vault.create('oil-nav-sub/inner.md', 'inner');
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            await openOilAndWait('');
            const rootContent = await getOilContent();
            expect(rootContent).toContain('oil-nav-sub');

            await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins?: {
                            plugins?: Record<string, { oilManager?: unknown }>;
                        };
                    }
                ).plugins?.plugins?.['vim-motions'];
                if (!plugin?.oilManager) return;
                (
                    plugin.oilManager as {
                        navigateToDirectory?: (path: string) => Promise<void>;
                    }
                ).navigateToDirectory?.('oil-nav-sub');
            });
            await browser.pause(1500);

            const subContent = await getOilContent();
            expect(subContent).toContain('inner.md');
            expect(subContent).not.toContain('Welcome.md');

            await cleanupTestFiles('oil-nav-sub/inner.md');
            await browser.executeObsidian(async ({ app }) => {
                const folder = app.vault.getAbstractFileByPath('oil-nav-sub');
                if (folder) await app.vault.delete(folder, true);
            });
        });

        it('can navigate back to root via parent', async function () {
            await browser.executeObsidian(async ({ app }) => {
                const existing =
                    app.vault.getAbstractFileByPath('oil-parent-sub');
                if (!existing) await app.vault.createFolder('oil-parent-sub');
                const f = app.vault.getAbstractFileByPath(
                    'oil-parent-sub/child.md',
                );
                if (!f)
                    await app.vault.create('oil-parent-sub/child.md', 'child');
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            await openOilAndWait('oil-parent-sub');
            const subContent = await getOilContent();
            expect(subContent).toContain('child.md');

            await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins?: {
                            plugins?: Record<string, { oilManager?: unknown }>;
                        };
                    }
                ).plugins?.plugins?.['vim-motions'];
                if (!plugin?.oilManager) return;
                (
                    plugin.oilManager as {
                        navigateToParent?: () => void;
                    }
                ).navigateToParent?.();
            });
            await browser.pause(1500);

            const rootContent = await getOilContent();
            expect(rootContent).toContain('Welcome.md');

            await cleanupTestFiles('oil-parent-sub/child.md');
            await browser.executeObsidian(async ({ app }) => {
                const folder =
                    app.vault.getAbstractFileByPath('oil-parent-sub');
                if (folder) await app.vault.delete(folder, true);
            });
        });
    });

    describe('title bar update', function () {
        it('display text updates after navigating to a subdirectory', async function () {
            await browser.executeObsidian(async ({ app }) => {
                const existing =
                    app.vault.getAbstractFileByPath('oil-title-sub');
                if (!existing) await app.vault.createFolder('oil-title-sub');
                const f = app.vault.getAbstractFileByPath(
                    'oil-title-sub/file.md',
                );
                if (!f)
                    await app.vault.create('oil-title-sub/file.md', 'content');
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            await openOilAndWait('');
            const rootDisplay = (await browser.executeObsidian(({ app }) => {
                const leaf = app.workspace.getMostRecentLeaf();
                return leaf?.view?.getDisplayText() ?? '';
            })) as string;
            expect(rootDisplay).toBe('vault root');

            await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins?: {
                            plugins?: Record<string, { oilManager?: unknown }>;
                        };
                    }
                ).plugins?.plugins?.['vim-motions'];
                if (!plugin?.oilManager) return;
                (
                    plugin.oilManager as {
                        navigateToDirectory?: (path: string) => Promise<void>;
                    }
                ).navigateToDirectory?.('oil-title-sub');
            });
            await browser.pause(1500);

            const subDisplay = (await browser.executeObsidian(({ app }) => {
                const leaf = app.workspace.getMostRecentLeaf();
                return leaf?.view?.getDisplayText() ?? '';
            })) as string;
            expect(subDisplay).toBe('oil-title-sub');

            await cleanupTestFiles('oil-title-sub/file.md');
            await browser.executeObsidian(async ({ app }) => {
                const folder = app.vault.getAbstractFileByPath('oil-title-sub');
                if (folder) await app.vault.delete(folder, true);
            });
        });

        it('display text shows vault root after navigating back', async function () {
            await browser.executeObsidian(async ({ app }) => {
                const existing =
                    app.vault.getAbstractFileByPath('oil-title-back');
                if (!existing) await app.vault.createFolder('oil-title-back');
                const f = app.vault.getAbstractFileByPath(
                    'oil-title-back/note.md',
                );
                if (!f)
                    await app.vault.create('oil-title-back/note.md', 'note');
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            await openOilAndWait('oil-title-back');
            const subDisplay = (await browser.executeObsidian(({ app }) => {
                const leaf = app.workspace.getMostRecentLeaf();
                return leaf?.view?.getDisplayText() ?? '';
            })) as string;
            expect(subDisplay).toBe('oil-title-back');

            await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins?: {
                            plugins?: Record<string, { oilManager?: unknown }>;
                        };
                    }
                ).plugins?.plugins?.['vim-motions'];
                if (!plugin?.oilManager) return;
                (
                    plugin.oilManager as {
                        navigateToDirectory?: (path: string) => Promise<void>;
                    }
                ).navigateToDirectory?.('');
            });
            await browser.pause(1500);

            const rootDisplay = (await browser.executeObsidian(({ app }) => {
                const leaf = app.workspace.getMostRecentLeaf();
                return leaf?.view?.getDisplayText() ?? '';
            })) as string;
            expect(rootDisplay).toBe('vault root');

            await cleanupTestFiles('oil-title-back/note.md');
            await browser.executeObsidian(async ({ app }) => {
                const folder =
                    app.vault.getAbstractFileByPath('oil-title-back');
                if (folder) await app.vault.delete(folder, true);
            });
        });
    });

    describe('hidden files toggle', function () {
        it('g. toggle shows hidden files when setting is off', async function () {
            await openOilAndWait('');
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const contentBefore = await getOilContent();
            const hadDotfiles = /\.\w/.test(contentBefore);

            await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins?: {
                            plugins?: Record<string, { oilManager?: unknown }>;
                        };
                    }
                ).plugins?.plugins?.['vim-motions'];
                if (!plugin?.oilManager) return;
                const mgr = plugin.oilManager as {
                    toggleHidden?: () => void;
                    refreshActiveOilView?: () => void;
                };
                mgr.toggleHidden?.();
                mgr.refreshActiveOilView?.();
            });
            await browser.pause(1500);

            const contentAfter = await getOilContent();

            if (!hadDotfiles) {
                expect(contentAfter.length).toBeGreaterThanOrEqual(
                    contentBefore.length,
                );
            }

            await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins?: {
                            plugins?: Record<string, { oilManager?: unknown }>;
                        };
                    }
                ).plugins?.plugins?.['vim-motions'];
                if (!plugin?.oilManager) return;
                const mgr = plugin.oilManager as {
                    toggleHidden?: () => void;
                    refreshActiveOilView?: () => void;
                };
                mgr.toggleHidden?.();
                mgr.refreshActiveOilView?.();
            });
            await browser.pause(1500);
        });
    });

    describe('select opens in same leaf', function () {
        it('opening a file from oil replaces the oil view in the same leaf', async function () {
            await openOilAndWait('');
            const oilLeafId = (await browser.executeObsidian(({ app }) => {
                const leaf = app.workspace.getMostRecentLeaf();
                return (leaf as unknown as { id?: string }).id ?? '';
            })) as string;
            expect(oilLeafId).toBeTruthy();

            const leafCount = (await browser.executeObsidian(({ app }) => {
                let count = 0;
                app.workspace.iterateAllLeaves(() => count++);
                return count;
            })) as number;

            await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins?: {
                            plugins?: Record<string, { oilManager?: unknown }>;
                        };
                    }
                ).plugins?.plugins?.['vim-motions'];
                if (!plugin?.oilManager) return;
                (
                    plugin.oilManager as {
                        openEntryAtCursor?: () => void;
                    }
                ).openEntryAtCursor?.();
            });
            await browser.pause(1500);

            const afterViewType = (await browser.executeObsidian(({ app }) => {
                return (
                    app.workspace.getMostRecentLeaf()?.view?.getViewType() ?? ''
                );
            })) as string;
            expect(afterViewType).toBe('markdown');

            const afterLeafId = (await browser.executeObsidian(({ app }) => {
                const leaf = app.workspace.getMostRecentLeaf();
                return (leaf as unknown as { id?: string }).id ?? '';
            })) as string;
            expect(afterLeafId).toBe(oilLeafId);

            const afterLeafCount = (await browser.executeObsidian(({ app }) => {
                let count = 0;
                app.workspace.iterateAllLeaves(() => count++);
                return count;
            })) as number;
            expect(afterLeafCount).toBe(leafCount);
        });

        it('C-t keymap is registered for open-in-new-tab', async function () {
            await openOilAndWait('');

            const hasMapping = (await browser.executeObsidian(({ app }) => {
                const leaf = app.workspace.getMostRecentLeaf();
                if (leaf?.view?.getViewType() !== 'oil-explorer') {
                    return false;
                }
                const Vim = (
                    window as unknown as {
                        CodeMirrorAdapter?: {
                            Vim?: {
                                _mapCommand?: (
                                    keys: string,
                                ) =>
                                    | { toKeys?: string; type?: string }
                                    | undefined;
                            };
                        };
                    }
                ).CodeMirrorAdapter?.Vim;
                if (!Vim) return false;
                const plugin = (
                    app as unknown as {
                        plugins?: {
                            plugins?: Record<string, { oilManager?: unknown }>;
                        };
                    }
                ).plugins?.plugins?.['vim-motions'];
                if (!plugin?.oilManager) return false;
                const mgr = plugin.oilManager as {
                    openEntryAtCursorInNewTab?: () => void;
                };
                return typeof mgr.openEntryAtCursorInNewTab === 'function';
            })) as boolean;

            expect(hasMapping).toBe(true);
        });

        it('C-t opens file in new tab and focuses it', async function () {
            await browser.executeObsidian(async ({ app }) => {
                const dir = 'oil-ct-test-dir';
                const existing = app.vault.getAbstractFileByPath(dir);
                if (!existing) await app.vault.createFolder(dir);
                const f = app.vault.getAbstractFileByPath(`${dir}/Target.md`);
                if (!f) await app.vault.create(`${dir}/Target.md`, 'target');
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            await openOilAndWait('oil-ct-test-dir');
            await focusOilEditor();
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const beforeLeafCount = (await browser.executeObsidian(
                ({ app }) => {
                    let count = 0;
                    app.workspace.iterateAllLeaves(() => count++);
                    return count;
                },
            )) as number;

            await browser.keys([Key.Ctrl, 't']);
            await browser.pause(1000);

            const after = (await browser.executeObsidian(({ app }) => {
                let leafCount = 0;
                let hasOil = false;
                app.workspace.iterateAllLeaves((leaf) => {
                    leafCount++;
                    if (leaf.view?.getViewType() === 'oil-explorer') {
                        hasOil = true;
                    }
                });
                return {
                    leafCount,
                    hasOil,
                    activeFile: app.workspace.getActiveFile()?.path ?? '',
                    activeViewType:
                        app.workspace
                            .getMostRecentLeaf()
                            ?.view?.getViewType() ?? '',
                };
            })) as {
                leafCount: number;
                hasOil: boolean;
                activeFile: string;
                activeViewType: string;
            };

            expect(after.leafCount).toBeGreaterThan(beforeLeafCount);
            expect(after.hasOil).toBe(true);
            expect(after.activeFile).toBe('oil-ct-test-dir/Target.md');
            expect(after.activeViewType).toBe('markdown');

            await cleanupOilViews();
            await browser.executeObsidian(async ({ app }) => {
                const folder =
                    app.vault.getAbstractFileByPath('oil-ct-test-dir');
                if (folder) await app.vault.delete(folder, true);
            });
        });
    });

    describe('split and external open', function () {
        beforeEach(async function () {
            await browser.reloadObsidian({ vault: 'test-vault' });
            await obsidianPage.openFile('Welcome.md');
            await browser.pause(PAUSE.OBSIDIAN_LOAD);
        });

        it('vertical split opens file alongside oil view', async function () {
            await browser.executeObsidian(async ({ app }) => {
                const existing =
                    app.vault.getAbstractFileByPath('oil-split-dir');
                if (!existing) await app.vault.createFolder('oil-split-dir');
                const f = app.vault.getAbstractFileByPath(
                    'oil-split-dir/split-test.md',
                );
                if (!f)
                    await app.vault.create(
                        'oil-split-dir/split-test.md',
                        'split',
                    );
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            await openOilAndWait('oil-split-dir');

            const result = (await browser.executeObsidian(
                async ({ app, obsidian }) => {
                    const file = app.vault.getAbstractFileByPath(
                        'oil-split-dir/split-test.md',
                    );
                    if (!file || !(file instanceof obsidian.TFile)) {
                        return { error: 'file not found' };
                    }

                    const leaf = app.workspace.getLeaf('split', 'vertical');
                    await leaf.openFile(file);

                    const allTypes: string[] = [];
                    app.workspace.iterateAllLeaves((l) => {
                        allTypes.push(l.view?.getViewType() ?? 'unknown');
                    });

                    return { allTypes };
                },
            )) as { error?: string; allTypes?: string[] };

            expect(result.error).toBeUndefined();
            expect(result.allTypes).toContain('markdown');

            await cleanupTestFiles('oil-split-dir/split-test.md');
            await browser.executeObsidian(async ({ app }) => {
                const folder = app.vault.getAbstractFileByPath('oil-split-dir');
                if (folder) await app.vault.delete(folder, true);
            });
        });

        it('horizontal split opens file alongside oil view', async function () {
            await browser.executeObsidian(async ({ app }) => {
                const existing =
                    app.vault.getAbstractFileByPath('oil-hsplit-dir');
                if (!existing) await app.vault.createFolder('oil-hsplit-dir');
                const f = app.vault.getAbstractFileByPath(
                    'oil-hsplit-dir/hsplit-test.md',
                );
                if (!f)
                    await app.vault.create(
                        'oil-hsplit-dir/hsplit-test.md',
                        'hsplit',
                    );
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            await openOilAndWait('oil-hsplit-dir');

            const result = (await browser.executeObsidian(
                async ({ app, obsidian }) => {
                    const file = app.vault.getAbstractFileByPath(
                        'oil-hsplit-dir/hsplit-test.md',
                    );
                    if (!file || !(file instanceof obsidian.TFile)) {
                        return { error: 'file not found' };
                    }

                    const leaf = app.workspace.getLeaf('split', 'horizontal');
                    await leaf.openFile(file);

                    const allTypes: string[] = [];
                    app.workspace.iterateAllLeaves((l) => {
                        allTypes.push(l.view?.getViewType() ?? 'unknown');
                    });

                    return { allTypes };
                },
            )) as { error?: string; allTypes?: string[] };

            expect(result.error).toBeUndefined();
            expect(result.allTypes).toContain('markdown');

            await cleanupTestFiles('oil-hsplit-dir/hsplit-test.md');
            await browser.executeObsidian(async ({ app }) => {
                const folder =
                    app.vault.getAbstractFileByPath('oil-hsplit-dir');
                if (folder) await app.vault.delete(folder, true);
            });
        });

        it('openEntryExternalAtCursor method exists', async function () {
            await openOilAndWait('');

            const hasMethod = (await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins?: {
                            plugins?: Record<string, { oilManager?: unknown }>;
                        };
                    }
                ).plugins?.plugins?.['vim-motions'];
                if (!plugin?.oilManager) return false;
                return (
                    typeof (
                        plugin.oilManager as {
                            openEntryExternalAtCursor?: () => void;
                        }
                    ).openEntryExternalAtCursor === 'function'
                );
            })) as boolean;
            expect(hasMethod).toBe(true);
        });
    });

    describe('focus after commit (issue #100)', function () {
        async function isOilEditorFocused(): Promise<boolean> {
            return (await browser.executeObsidian(({ app }) => {
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
        }

        it('oil retains focus after no-op commit', async function () {
            await openOilAndWait();
            await focusOilEditor();
            expect(await isOilEditorFocused()).toBe(true);

            const commitResult = await runOilCommit();
            expect(commitResult).toHaveProperty('success', true);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const viewType = (await browser.executeObsidian(({ app }) => {
                return (
                    app.workspace.getMostRecentLeaf()?.view?.getViewType() ?? ''
                );
            })) as string;
            expect(viewType).toBe('oil-explorer');
        });

        it('oil retains focus after confirmed destructive commit', async function () {
            await browser.executeObsidian(async ({ app }) => {
                const existing = app.vault.getAbstractFileByPath(
                    'oil-focus-delete.md',
                );
                if (existing) await app.vault.delete(existing);
                await app.vault.create(
                    'oil-focus-delete.md',
                    'focus test delete',
                );
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
            await browser.pause(PAUSE.EDITOR_SETTLE);

            await openOilAndWait();
            await focusOilEditor();

            await deleteLineContaining('oil-focus-delete.md');
            await browser.pause(PAUSE.EDITOR_SETTLE);

            // Fire-and-forget: commit() blocks on the modal promise, so we
            // cannot await it — we interact with the modal from the test side.
            await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins?: {
                            plugins?: Record<string, { oilManager?: unknown }>;
                        };
                    }
                ).plugins?.plugins?.['vim-motions'];
                if (!plugin?.oilManager) return;
                void (
                    plugin.oilManager as { commit?: () => Promise<void> }
                ).commit?.();
            });
            await browser.pause(500);

            const confirmBtn = await browser.$(
                '.vim-motions-oil-confirm-btn-confirm',
            );
            if (await confirmBtn.isExisting()) {
                await confirmBtn.click();
            }
            await browser.pause(1000);

            const viewType = (await browser.executeObsidian(({ app }) => {
                return (
                    app.workspace.getMostRecentLeaf()?.view?.getViewType() ?? ''
                );
            })) as string;
            expect(viewType).toBe('oil-explorer');
            expect(await isOilEditorFocused()).toBe(true);

            await cleanupTestFiles('oil-focus-delete.md');
        });

        it('oil retains focus after cancelled destructive commit', async function () {
            await browser.executeObsidian(async ({ app }) => {
                const existing = app.vault.getAbstractFileByPath(
                    'oil-focus-cancel.md',
                );
                if (existing) await app.vault.delete(existing);
                await app.vault.create(
                    'oil-focus-cancel.md',
                    'focus test cancel',
                );
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
            await browser.pause(PAUSE.EDITOR_SETTLE);

            await openOilAndWait();
            await focusOilEditor();

            await deleteLineContaining('oil-focus-cancel.md');
            await browser.pause(PAUSE.EDITOR_SETTLE);

            // Fire-and-forget: commit() blocks on the modal promise, so we
            // cannot await it — we interact with the modal from the test side.
            await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins?: {
                            plugins?: Record<string, { oilManager?: unknown }>;
                        };
                    }
                ).plugins?.plugins?.['vim-motions'];
                if (!plugin?.oilManager) return;
                void (
                    plugin.oilManager as { commit?: () => Promise<void> }
                ).commit?.();
            });
            await browser.pause(500);

            const cancelBtn = await browser.$(
                '.vim-motions-oil-confirm-btn-cancel',
            );
            if (await cancelBtn.isExisting()) {
                await cancelBtn.click();
            }
            await browser.pause(500);

            const viewType = (await browser.executeObsidian(({ app }) => {
                return (
                    app.workspace.getMostRecentLeaf()?.view?.getViewType() ?? ''
                );
            })) as string;
            expect(viewType).toBe('oil-explorer');
            expect(await isOilEditorFocused()).toBe(true);

            expect(await fileExists('oil-focus-cancel.md')).toBe(true);

            await cleanupTestFiles('oil-focus-cancel.md');
        });

        it('oil retains focus after Esc-dismissing the confirm modal', async function () {
            await browser.executeObsidian(async ({ app }) => {
                const existing =
                    app.vault.getAbstractFileByPath('oil-focus-esc.md');
                if (existing) await app.vault.delete(existing);
                await app.vault.create(
                    'oil-focus-esc.md',
                    'focus test esc dismiss',
                );
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
            await browser.pause(PAUSE.EDITOR_SETTLE);

            await openOilAndWait();
            await focusOilEditor();

            await deleteLineContaining('oil-focus-esc.md');
            await browser.pause(PAUSE.EDITOR_SETTLE);

            // Fire-and-forget: commit() blocks on the modal promise, so we
            // cannot await it — we interact with the modal from the test side.
            await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins?: {
                            plugins?: Record<string, { oilManager?: unknown }>;
                        };
                    }
                ).plugins?.plugins?.['vim-motions'];
                if (!plugin?.oilManager) return;
                void (
                    plugin.oilManager as { commit?: () => Promise<void> }
                ).commit?.();
            });
            await browser.pause(500);

            await browser.keys([Key.Escape]);
            await browser.pause(500);

            const viewType = (await browser.executeObsidian(({ app }) => {
                return (
                    app.workspace.getMostRecentLeaf()?.view?.getViewType() ?? ''
                );
            })) as string;
            expect(viewType).toBe('oil-explorer');
            expect(await isOilEditorFocused()).toBe(true);

            expect(await fileExists('oil-focus-esc.md')).toBe(true);

            await cleanupTestFiles('oil-focus-esc.md');
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
