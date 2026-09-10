import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

import {
    dismissNotices,
    getNotices,
    getWorkspaceSnapshot,
    handleEx,
    loadSingleFileWorkspace,
    loadTwoFileWorkspace,
    setupEditor,
    vimHandleKeys,
    vimKeys,
} from '../helpers';

async function countFolds(): Promise<number> {
    return (await browser.executeObsidian(({ app, obsidian, require: req }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return 0;
        const { foldedRanges } = req('@codemirror/language') as {
            foldedRanges: (state: unknown) => {
                iter: () => { value: unknown; next: () => void };
            };
        };
        const cm6View = (view.editor as unknown as Record<string, unknown>)
            .cm as { state: unknown } | undefined;
        if (!cm6View) return 0;
        const iter = foldedRanges(cm6View.state).iter();
        let count = 0;
        while (iter.value) {
            count++;
            iter.next();
        }
        return count;
    })) as number;
}

async function getModalCount(): Promise<number> {
    return (await browser.executeObsidian(
        () => document.querySelectorAll('.modal-container').length,
    )) as number;
}

async function waitForModal(): Promise<void> {
    await browser.waitUntil(async () => (await getModalCount()) > 0, {
        timeout: 5000,
        interval: 100,
        timeoutMsg: 'expected a modal to open',
    });
}

async function closeModal(): Promise<void> {
    await browser.keys(['Escape']);
    await browser.waitUntil(async () => (await getModalCount()) === 0, {
        timeout: 5000,
        interval: 100,
        timeoutMsg: 'expected the modal instance to close on Escape',
    });
}
describe('Workspace extended', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    describe('Split operations', function () {
        it('<C-w>v should split vertically', async function () {
            const beforeCount = (await browser.executeObsidian(({ app }) => {
                return app.workspace.getLeavesOfType('markdown').length;
            })) as number;

            const result = (await browser.executeObsidian(
                ({ app, obsidian }) => {
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
                        view.editor.focus();
                        const cm = (
                            view.editor as unknown as Record<string, unknown>
                        ).cm as Record<string, unknown>;
                        const adapter = cm?.cm;
                        if (!adapter) return { error: 'No adapter' };
                        Vim.handleKey(adapter, '<C-w>');
                        Vim.handleKey(adapter, 'v');
                        return { success: true };
                    } catch (e) {
                        return { error: String(e) };
                    }
                },
            )) as { success?: boolean; error?: string };
            expect(result).toHaveProperty('success', true);

            await browser.pause(300);

            const afterCount = (await browser.executeObsidian(({ app }) => {
                return app.workspace.getLeavesOfType('markdown').length;
            })) as number;

            expect(afterCount).toBeGreaterThan(beforeCount);
        });

        it('<C-w>s should split horizontally', async function () {
            const beforeCount = (await browser.executeObsidian(({ app }) => {
                return app.workspace.getLeavesOfType('markdown').length;
            })) as number;

            const result = (await browser.executeObsidian(
                ({ app, obsidian }) => {
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
                        view.editor.focus();
                        const cm = (
                            view.editor as unknown as Record<string, unknown>
                        ).cm as Record<string, unknown>;
                        const adapter = cm?.cm;
                        if (!adapter) return { error: 'No adapter' };
                        Vim.handleKey(adapter, '<C-w>');
                        Vim.handleKey(adapter, 's');
                        return { success: true };
                    } catch (e) {
                        return { error: String(e) };
                    }
                },
            )) as { success?: boolean; error?: string };
            expect(result).toHaveProperty('success', true);

            await browser.pause(300);

            const afterCount = (await browser.executeObsidian(({ app }) => {
                return app.workspace.getLeavesOfType('markdown').length;
            })) as number;

            expect(afterCount).toBeGreaterThan(beforeCount);
        });

        it('<C-w>c should close tab (leaf count decreases)', async function () {
            const splitResult = (await browser.executeObsidian(
                ({ app, obsidian }) => {
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
                        view.editor.focus();
                        const cm = (
                            view.editor as unknown as Record<string, unknown>
                        ).cm as Record<string, unknown>;
                        const adapter = cm?.cm;
                        if (!adapter) return { error: 'No adapter' };
                        Vim.handleKey(adapter, '<C-w>');
                        Vim.handleKey(adapter, 'v');
                        return { success: true };
                    } catch (e) {
                        return { error: String(e) };
                    }
                },
            )) as { success?: boolean; error?: string };
            expect(splitResult).toHaveProperty('success', true);

            await browser.pause(300);

            const beforeCount = (await browser.executeObsidian(({ app }) => {
                return app.workspace.getLeavesOfType('markdown').length;
            })) as number;

            const result = (await browser.executeObsidian(
                ({ app, obsidian }) => {
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
                        view.editor.focus();
                        const cm = (
                            view.editor as unknown as Record<string, unknown>
                        ).cm as Record<string, unknown>;
                        const adapter = cm?.cm;
                        if (!adapter) return { error: 'No adapter' };
                        Vim.handleKey(adapter, '<C-w>');
                        Vim.handleKey(adapter, 'c');
                        return { success: true };
                    } catch (e) {
                        return { error: String(e) };
                    }
                },
            )) as { success?: boolean; error?: string };
            expect(result).toHaveProperty('success', true);

            await browser.pause(300);

            const afterCount = (await browser.executeObsidian(({ app }) => {
                return app.workspace.getLeavesOfType('markdown').length;
            })) as number;

            expect(afterCount).toBeLessThan(beforeCount);
        });

        it('<C-w>o should close other tabs', async function () {
            const split1Result = (await browser.executeObsidian(
                ({ app, obsidian }) => {
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
                        view.editor.focus();
                        const cm = (
                            view.editor as unknown as Record<string, unknown>
                        ).cm as Record<string, unknown>;
                        const adapter = cm?.cm;
                        if (!adapter) return { error: 'No adapter' };
                        Vim.handleKey(adapter, '<C-w>');
                        Vim.handleKey(adapter, 'v');
                        return { success: true };
                    } catch (e) {
                        return { error: String(e) };
                    }
                },
            )) as { success?: boolean; error?: string };
            expect(split1Result).toHaveProperty('success', true);

            await browser.pause(300);

            const split2Result = (await browser.executeObsidian(
                ({ app, obsidian }) => {
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
                        view.editor.focus();
                        const cm = (
                            view.editor as unknown as Record<string, unknown>
                        ).cm as Record<string, unknown>;
                        const adapter = cm?.cm;
                        if (!adapter) return { error: 'No adapter' };
                        Vim.handleKey(adapter, '<C-w>');
                        Vim.handleKey(adapter, 'v');
                        return { success: true };
                    } catch (e) {
                        return { error: String(e) };
                    }
                },
            )) as { success?: boolean; error?: string };
            expect(split2Result).toHaveProperty('success', true);

            await browser.pause(300);

            const beforeCount = (await browser.executeObsidian(({ app }) => {
                return app.workspace.getLeavesOfType('markdown').length;
            })) as number;

            expect(beforeCount).toBeGreaterThanOrEqual(3);

            const result = (await browser.executeObsidian(
                ({ app, obsidian }) => {
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
                        view.editor.focus();
                        const cm = (
                            view.editor as unknown as Record<string, unknown>
                        ).cm as Record<string, unknown>;
                        const adapter = cm?.cm;
                        if (!adapter) return { error: 'No adapter' };
                        Vim.handleKey(adapter, '<C-w>');
                        Vim.handleKey(adapter, 'o');
                        return { success: true };
                    } catch (e) {
                        return { error: String(e) };
                    }
                },
            )) as { success?: boolean; error?: string };
            expect(result).toHaveProperty('success', true);

            await browser.pause(300);

            const afterCount = (await browser.executeObsidian(({ app }) => {
                return app.workspace.getLeavesOfType('markdown').length;
            })) as number;

            expect(afterCount).toBeLessThan(beforeCount);
        });
    });

    describe('Fold operations', function () {
        it('zc folds the heading at the cursor', async function () {
            await loadSingleFileWorkspace();
            await setupEditor(
                '# Heading\n\nContent under heading\n\nMore content',
                { line: 0, ch: 0 },
            );
            expect(await countFolds()).toBe(0);

            await vimKeys('z', 'c');

            expect(await countFolds()).toBe(1);
        });

        it('zo unfolds the heading at the cursor', async function () {
            await loadSingleFileWorkspace();
            await setupEditor(
                '# Heading\n\nContent under heading\n\nMore content',
                { line: 0, ch: 0 },
            );
            await vimKeys('z', 'c');
            expect(await countFolds()).toBe(1);

            await vimKeys('z', 'o');

            expect(await countFolds()).toBe(0);
        });

        it('zM folds all headings', async function () {
            await loadSingleFileWorkspace();
            await setupEditor('# H1\ntext\n## H2\ntext', { line: 0, ch: 0 });
            expect(await countFolds()).toBe(0);

            await vimKeys('z', 'M');

            expect(await countFolds()).toBeGreaterThan(0);
        });

        it('zR unfolds all headings', async function () {
            await loadSingleFileWorkspace();
            await setupEditor('# H1\ntext\n## H2\ntext', { line: 0, ch: 0 });
            await vimKeys('z', 'M');
            expect(await countFolds()).toBeGreaterThan(0);

            await vimKeys('z', 'R');

            expect(await countFolds()).toBe(0);
        });
    });

    describe('Recursive fold operations', function () {
        it('zO unfolds nested headings at the cursor', async function () {
            await loadSingleFileWorkspace();
            await setupEditor('# Heading\n\nContent\n\n## Sub\n\nMore', {
                line: 0,
                ch: 0,
            });
            await vimKeys('z', 'C');
            expect(await countFolds()).toBeGreaterThan(0);

            await vimKeys('z', 'O');

            expect(await countFolds()).toBe(0);
        });

        it('zC folds nested headings at the cursor', async function () {
            await loadSingleFileWorkspace();
            await setupEditor('# Heading\n\nContent\n\n## Sub\n\nMore', {
                line: 0,
                ch: 0,
            });
            expect(await countFolds()).toBe(0);

            await vimKeys('z', 'C');

            expect(await countFolds()).toBeGreaterThan(0);
        });

        it('zA folds nested headings when they are open', async function () {
            await loadSingleFileWorkspace();
            await setupEditor('# Heading\n\nContent\n\n## Sub\n\nMore', {
                line: 0,
                ch: 0,
            });
            expect(await countFolds()).toBe(0);

            await vimKeys('z', 'A');

            expect(await countFolds()).toBeGreaterThan(0);
        });
    });

    describe('Tab navigation', function () {
        it('gT activates the previous tab', async function () {
            await loadTwoFileWorkspace('Welcome.md', 'Target.md', 'second');
            expect((await getWorkspaceSnapshot()).activeFile).toBe('Target.md');

            await vimKeys('g', 'T');

            await browser.waitUntil(
                async () =>
                    (await getWorkspaceSnapshot()).activeFile === 'Welcome.md',
                { timeout: 5000, interval: 100 },
            );
        });
    });

    describe('Workspace keybindings', function () {
        it('gf opens the file switcher', async function () {
            await loadSingleFileWorkspace();
            expect(await getModalCount()).toBe(0);

            await vimKeys('g', 'f');

            await waitForModal();
            await closeModal();
        });

        it(':renamenote dispatches Obsidian’s rename command', async function () {
            // grn key binding was removed when gr became the replaceWithRegister
            // operator. renameNote is now accessible via the :renamenote ex command.
            await loadSingleFileWorkspace();

            const result = await handleEx('renamenote');

            expect(result.unknownCommand).toBe(false);
            expect(result.dispatchedCommands).toContain(
                'workspace:edit-file-title',
            );
        });

        it(':showbacklinks dispatches Obsidian’s backlinks command', async function () {
            // grr key binding was removed when gr became the replaceWithRegister
            // operator (grr = replace current line with register). showBacklinks
            // is now accessible via the :showbacklinks ex command.
            await loadSingleFileWorkspace();

            const result = await handleEx('showbacklinks');

            expect(result.unknownCommand).toBe(false);
            expect(result.dispatchedCommands).toContain('backlink:open');
        });

        it('<C-w>h should focus left pane without error', async function () {
            await obsidianPage.openFile('Welcome.md');
            await browser.pause(300);

            const splitResult = (await browser.executeObsidian(
                ({ app, obsidian }) => {
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
                        view.editor.focus();
                        const cm = (
                            view.editor as unknown as Record<string, unknown>
                        ).cm as Record<string, unknown>;
                        const adapter = cm?.cm;
                        if (!adapter) return { error: 'No adapter' };
                        Vim.handleKey(adapter, '<C-w>');
                        Vim.handleKey(adapter, 'v');
                        return { success: true };
                    } catch (e) {
                        return { error: String(e) };
                    }
                },
            )) as { success?: boolean; error?: string };
            expect(splitResult).toHaveProperty('success', true);
            await browser.pause(300);

            const result = (await browser.executeObsidian(
                ({ app, obsidian }) => {
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
                        view.editor.focus();
                        const cm = (
                            view.editor as unknown as Record<string, unknown>
                        ).cm as Record<string, unknown>;
                        const adapter = cm?.cm;
                        if (!adapter) return { error: 'No adapter' };
                        Vim.handleKey(adapter, '<C-w>');
                        Vim.handleKey(adapter, 'h');
                        return { success: true };
                    } catch (e) {
                        return { error: String(e) };
                    }
                },
            )) as { success?: boolean; error?: string };
            expect(result).toHaveProperty('success', true);
        });

        it('<C-w>l should focus right pane without error', async function () {
            await obsidianPage.openFile('Welcome.md');
            await browser.pause(300);

            const splitResult = (await browser.executeObsidian(
                ({ app, obsidian }) => {
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
                        view.editor.focus();
                        const cm = (
                            view.editor as unknown as Record<string, unknown>
                        ).cm as Record<string, unknown>;
                        const adapter = cm?.cm;
                        if (!adapter) return { error: 'No adapter' };
                        Vim.handleKey(adapter, '<C-w>');
                        Vim.handleKey(adapter, 'v');
                        return { success: true };
                    } catch (e) {
                        return { error: String(e) };
                    }
                },
            )) as { success?: boolean; error?: string };
            expect(splitResult).toHaveProperty('success', true);
            await browser.pause(300);

            (await browser.executeObsidian(({ app, obsidian }) => {
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
                    view.editor.focus();
                    const cm = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as Record<string, unknown>;
                    const adapter = cm?.cm;
                    if (!adapter) return { error: 'No adapter' };
                    Vim.handleKey(adapter, '<C-w>');
                    Vim.handleKey(adapter, 'h');
                    return { success: true };
                } catch (e) {
                    return { error: String(e) };
                }
            })) as { success?: boolean; error?: string };
            await browser.pause(300);

            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (view) {
                    (
                        window as unknown as Record<string, unknown>
                    ).__testPrevView = view;
                }
            });

            const result = (await browser.executeObsidian(
                ({ app, obsidian }) => {
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
                        view.editor.focus();
                        const cm = (
                            view.editor as unknown as Record<string, unknown>
                        ).cm as Record<string, unknown>;
                        const adapter = cm?.cm;
                        if (!adapter) return { error: 'No adapter' };
                        Vim.handleKey(adapter, '<C-w>');
                        Vim.handleKey(adapter, 'l');
                        return { success: true };
                    } catch (e) {
                        return { error: String(e) };
                    }
                },
            )) as { success?: boolean; error?: string };
            expect(result).toHaveProperty('success', true);

            await browser.pause(300);

            const leafChanged = (await browser.executeObsidian(
                ({ app, obsidian }) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    const prev = (window as unknown as Record<string, unknown>)
                        .__testPrevView;
                    return view !== prev;
                },
            )) as boolean;

            expect(leafChanged).toBe(true);
        });

        it('<C-w>j should focus pane below without error', async function () {
            await obsidianPage.openFile('Welcome.md');
            await browser.pause(300);

            const splitResult = (await browser.executeObsidian(
                ({ app, obsidian }) => {
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
                        view.editor.focus();
                        const cm = (
                            view.editor as unknown as Record<string, unknown>
                        ).cm as Record<string, unknown>;
                        const adapter = cm?.cm;
                        if (!adapter) return { error: 'No adapter' };
                        Vim.handleKey(adapter, '<C-w>');
                        Vim.handleKey(adapter, 's');
                        return { success: true };
                    } catch (e) {
                        return { error: String(e) };
                    }
                },
            )) as { success?: boolean; error?: string };
            expect(splitResult).toHaveProperty('success', true);
            await browser.pause(300);

            const result = (await browser.executeObsidian(
                ({ app, obsidian }) => {
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
                        view.editor.focus();
                        const cm = (
                            view.editor as unknown as Record<string, unknown>
                        ).cm as Record<string, unknown>;
                        const adapter = cm?.cm;
                        if (!adapter) return { error: 'No adapter' };
                        Vim.handleKey(adapter, '<C-w>');
                        Vim.handleKey(adapter, 'j');
                        return { success: true };
                    } catch (e) {
                        return { error: String(e) };
                    }
                },
            )) as { success?: boolean; error?: string };
            expect(result).toHaveProperty('success', true);
        });

        it('<C-w>k should focus pane above without error', async function () {
            await obsidianPage.openFile('Welcome.md');
            await browser.pause(300);

            const splitResult = (await browser.executeObsidian(
                ({ app, obsidian }) => {
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
                        view.editor.focus();
                        const cm = (
                            view.editor as unknown as Record<string, unknown>
                        ).cm as Record<string, unknown>;
                        const adapter = cm?.cm;
                        if (!adapter) return { error: 'No adapter' };
                        Vim.handleKey(adapter, '<C-w>');
                        Vim.handleKey(adapter, 's');
                        return { success: true };
                    } catch (e) {
                        return { error: String(e) };
                    }
                },
            )) as { success?: boolean; error?: string };
            expect(splitResult).toHaveProperty('success', true);
            await browser.pause(300);

            const result = (await browser.executeObsidian(
                ({ app, obsidian }) => {
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
                        view.editor.focus();
                        const cm = (
                            view.editor as unknown as Record<string, unknown>
                        ).cm as Record<string, unknown>;
                        const adapter = cm?.cm;
                        if (!adapter) return { error: 'No adapter' };
                        Vim.handleKey(adapter, '<C-w>');
                        Vim.handleKey(adapter, 'k');
                        return { success: true };
                    } catch (e) {
                        return { error: String(e) };
                    }
                },
            )) as { success?: boolean; error?: string };
            expect(result).toHaveProperty('success', true);
        });

        it('g<C-g> shows document statistics', async function () {
            await loadSingleFileWorkspace();
            await setupEditor('some text here with words', { line: 0, ch: 0 });
            await dismissNotices();
            expect(await getNotices()).toEqual([]);

            await vimHandleKeys('g\u0007');

            expect(await getNotices()).toContain(
                'Line 1 of 1; Word 5; Char 25',
            );
        });
    });

    describe('Regression tests', function () {
        it('<C-w> followed by invalid suffix should not execute the suffix', async function () {
            await obsidianPage.openFile('Welcome.md');
            await browser.pause(300);

            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (view) {
                    view.editor.setValue('hello');
                    view.editor.setCursor(0, 0);
                    view.editor.focus();
                }
            });
            await browser.pause(200);

            const result = (await browser.executeObsidian(
                ({ app, obsidian }) => {
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
                        view.editor.focus();
                        const cm = (
                            view.editor as unknown as Record<string, unknown>
                        ).cm as Record<string, unknown>;
                        const adapter = cm?.cm;
                        if (!adapter) return { error: 'No adapter' };
                        Vim.handleKey(adapter, '<C-w>');
                        Vim.handleKey(adapter, 'x');
                        return { success: true };
                    } catch (e) {
                        return { error: String(e) };
                    }
                },
            )) as { success?: boolean; error?: string };
            expect(result).toHaveProperty('success', true);

            await browser.pause(300);

            const content = (await browser.executeObsidian(
                ({ app, obsidian }) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    return view?.editor.getValue() ?? '';
                },
            )) as string;

            expect(content).toBe('hello');
        });
    });
});
