import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

import {
    getWorkspaceSnapshot,
    handleEx,
    loadSingleFileWorkspace,
    loadTwoFileWorkspace,
    sendVimEscape,
    setupEditor,
    vimKeys,
} from '../helpers';

async function getInteractiveSurfaceCount(): Promise<number> {
    return (await browser.executeObsidian(
        () =>
            document.querySelectorAll(
                '.vim-motions-picker, .vim-motions-info-modal, .vim-motions-prompt-modal-container, .modal-container',
            ).length,
    )) as number;
}

async function waitForInteractiveSurface(): Promise<void> {
    await browser.waitUntil(
        async () => (await getInteractiveSurfaceCount()) > 0,
        {
            timeout: 5000,
            interval: 100,
            timeoutMsg: 'expected a Vim Motions picker or modal to open',
        },
    );
}

async function closeInteractiveSurface(): Promise<void> {
    await browser.keys(['Escape']);
    await browser.waitUntil(
        async () => (await getInteractiveSurfaceCount()) === 0,
        {
            timeout: 5000,
            interval: 100,
            timeoutMsg: 'expected the modal instance to close on Escape',
        },
    );

    await browser.keys(['g', 'O']);
    await waitForInteractiveSurface();
    await browser.keys(['Escape']);
    await browser.waitUntil(
        async () => (await getInteractiveSurfaceCount()) === 0,
        {
            timeout: 5000,
            interval: 100,
            timeoutMsg: 'expected the scope-check modal to close on Escape',
        },
    );
}

async function isFoldedAt(line: number): Promise<boolean> {
    return (await browser.executeObsidian(
        ({ app, obsidian, require: req }, targetLine: number) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return false;
            const { foldedRanges } = req('@codemirror/language') as {
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
            const iter = foldedRanges(cm6View.state).iter(docLine.from);
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

describe('Workspace navigation (Phase 2)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    beforeEach(async function () {
        await loadSingleFileWorkspace('Welcome.md');
    });

    it('gt activates the next tab', async function () {
        await loadTwoFileWorkspace('Welcome.md', 'Target.md', 'first');
        expect((await getWorkspaceSnapshot()).activeFile).toBe('Welcome.md');

        await vimKeys('g', 't');

        await browser.waitUntil(
            async () =>
                (await getWorkspaceSnapshot()).activeFile === 'Target.md',
            { timeout: 5000, interval: 100 },
        );
    });

    it(':sidebar left dispatches the left sidebar toggle', async function () {
        const result = await handleEx('sidebar left');

        expect(result.unknownCommand).toBe(false);
        expect(result.dispatchedCommands).toContain('app:toggle-left-sidebar');
    });

    it(':ob opens the command list', async function () {
        expect(await getInteractiveSurfaceCount()).toBe(0);

        const result = await handleEx('ob');

        expect(result.unknownCommand).toBe(false);
        await waitForInteractiveSurface();
        await closeInteractiveSurface();
    });

    it(':reg opens the register viewer', async function () {
        expect(await getInteractiveSurfaceCount()).toBe(0);

        const result = await handleEx('reg');

        expect(result.unknownCommand).toBe(false);
        await waitForInteractiveSurface();
        await closeInteractiveSurface();
    });

    it(':marks opens the marks viewer', async function () {
        expect(await getInteractiveSurfaceCount()).toBe(0);

        const result = await handleEx('marks');

        expect(result.unknownCommand).toBe(false);
        await waitForInteractiveSurface();
        await closeInteractiveSurface();
    });

    it(':w dispatches Obsidian’s save command', async function () {
        const result = await handleEx('w');

        expect(result.unknownCommand).toBe(false);
        expect(result.dispatchedCommands).toContain('editor:save-file');
    });

    it(':bn activates the next tab', async function () {
        await loadTwoFileWorkspace('Welcome.md', 'Target.md', 'first');
        expect((await getWorkspaceSnapshot()).activeFile).toBe('Welcome.md');

        const result = await handleEx('bn');

        expect(result.unknownCommand).toBe(false);
        await browser.waitUntil(
            async () =>
                (await getWorkspaceSnapshot()).activeFile === 'Target.md',
            { timeout: 5000, interval: 100 },
        );
    });

    it('za folds the heading at the cursor', async function () {
        await setupEditor(
            '# Heading\n\nSome content under heading\n\nMore content',
            { line: 0, ch: 0 },
        );
        expect(await isFoldedAt(0)).toBe(false);

        await vimKeys('z', 'a');

        await browser.waitUntil(async () => await isFoldedAt(0), {
            timeout: 5000,
            interval: 100,
        });
    });

    it('gd on a wikilink activates the linked file', async function () {
        await loadTwoFileWorkspace('Welcome.md', 'Target.md', 'second');
        await setupEditor('Go to [[Welcome]] now', { line: 0, ch: 10 });
        expect((await getWorkspaceSnapshot()).activeFile).toBe('Target.md');

        await vimKeys('g', 'd');

        await browser.waitUntil(
            async () =>
                (await getWorkspaceSnapshot()).activeFile === 'Welcome.md',
            { timeout: 5000, interval: 100 },
        );
    });

    it('gd outside a link should no-op', async function () {
        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            view.editor.setValue('No links here');
            view.editor.setCursor(0, 5);
            view.editor.focus();
        });
        await browser.pause(300);
        await sendVimEscape();
        await browser.pause(50);
        await browser.keys(['g', 'd']);
        await browser.pause(200);

        const result = await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            return { value: view?.editor.getValue() ?? '' };
        });
        expect(result).toHaveProperty('value', 'No links here');
    });

    it('gx on a URL opens that URL externally', async function () {
        const openedUrl = (await browser.executeObsidian(
            ({ app, obsidian }) => {
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
                if (!Vim) return null;
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return null;
                view.editor.setValue('Visit https://example.com today');
                view.editor.setCursor(0, 10);
                view.editor.focus();
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return null;
                let captured: string | null = null;
                const originalOpen = window.open;
                window.open = ((url?: string | URL) => {
                    captured = url?.toString() ?? null;
                    return null;
                }) as typeof window.open;
                try {
                    Vim.handleKey(adapter, 'g');
                    Vim.handleKey(adapter, 'x');
                } finally {
                    window.open = originalOpen;
                }
                return captured;
            },
        )) as string | null;

        expect(openedUrl).toBe('https://example.com');
    });

    it('gx outside a URL should no-op', async function () {
        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            view.editor.setValue('No URLs here');
            view.editor.setCursor(0, 5);
            view.editor.focus();
        });
        await browser.pause(300);
        await sendVimEscape();
        await browser.pause(50);
        await browser.keys(['g', 'x']);
        await browser.pause(200);
        const result = await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            return { value: view?.editor.getValue() ?? '' };
        });
        expect(result).toHaveProperty('value', 'No URLs here');
    });

    it(':buffers opens the buffer list', async function () {
        expect(await getInteractiveSurfaceCount()).toBe(0);

        const result = await handleEx('buffers');

        expect(result.unknownCommand).toBe(false);
        await waitForInteractiveSurface();
        await closeInteractiveSurface();
    });

    it(':backlinks opens the backlinks list', async function () {
        expect(await getInteractiveSurfaceCount()).toBe(0);

        const result = await handleEx('backlinks');

        expect(result.unknownCommand).toBe(false);
        await waitForInteractiveSurface();
        await closeInteractiveSurface();
    });

    it(':contextactions opens the context actions modal', async function () {
        // gra key binding was removed when gr became the replaceWithRegister
        // operator. contextActions is now accessible via the :contextactions
        // ex command.
        await setupEditor('- [ ] A task item', { line: 0, ch: 5 });
        expect(await getInteractiveSurfaceCount()).toBe(0);

        const result = await handleEx('contextactions');

        expect(result.unknownCommand).toBe(false);
        await waitForInteractiveSurface();
        await closeInteractiveSurface();
    });

    it(':grep opens vault search results', async function () {
        expect(await getInteractiveSurfaceCount()).toBe(0);

        const result = await handleEx('grep Welcome');

        expect(result.unknownCommand).toBe(false);
        await waitForInteractiveSurface();
        await closeInteractiveSurface();
    });

    it('gO opens the outline modal', async function () {
        await setupEditor(
            '# Heading 1\n\nSome text\n\n## Heading 2\n\nMore text',
            { line: 0, ch: 0 },
        );
        expect(await getInteractiveSurfaceCount()).toBe(0);

        await vimKeys('g', 'O');

        await waitForInteractiveSurface();
        await closeInteractiveSurface();
    });

    it('gd on a wikilink with display name should resolve the file path', async function () {
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
                view.editor.setValue('Go to [[Welcome|my display name]] now');
                view.editor.setCursor(0, 12);
                view.editor.focus();
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return { error: 'No adapter' };
                Vim.handleKey(adapter, 'g');
                Vim.handleKey(adapter, 'd');
                return { success: true };
            } catch (e) {
                return { error: String(e) };
            }
        });
        expect(result).toHaveProperty('success', true);
        await browser.pause(500);
        const openFile = (await browser.executeObsidian(({ app }) => {
            return app.workspace.getActiveFile()?.path ?? '';
        })) as string;
        expect(openFile).toBe('Welcome.md');
    });

    it('gd on a wikilink with heading should resolve correctly', async function () {
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
                view.editor.setValue('See [[Welcome#section]] here');
                view.editor.setCursor(0, 10);
                view.editor.focus();
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return { error: 'No adapter' };
                Vim.handleKey(adapter, 'g');
                Vim.handleKey(adapter, 'd');
                return { success: true };
            } catch (e) {
                return { error: String(e) };
            }
        });
        expect(result).toHaveProperty('success', true);
        await browser.pause(500);
        const openFile = (await browser.executeObsidian(({ app }) => {
            return app.workspace.getActiveFile()?.path ?? '';
        })) as string;
        expect(openFile).toBe('Welcome.md');
    });

    it('gD on a wikilink should open in a new tab', async function () {
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
                view.editor.setValue('Go to [[Target]] now');
                view.editor.setCursor(0, 10);
                view.editor.focus();
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return { error: 'No adapter' };
                Vim.handleKey(adapter, 'g');
                Vim.handleKey(adapter, 'D');
                return { success: true };
            } catch (e) {
                return { error: String(e) };
            }
        });
        expect(result).toHaveProperty('success', true);
        await browser.pause(500);
        const after = await browser.executeObsidian(({ app }) => {
            let leafCount = 0;
            app.workspace.iterateAllLeaves((leaf) => {
                if (leaf.view.getViewType() === 'markdown') leafCount++;
            });
            return {
                leafCount,
                activeFile: app.workspace.getActiveFile()?.path ?? '',
            };
        });
        expect(
            (after as { leafCount: number }).leafCount,
        ).toBeGreaterThanOrEqual(2);
        expect(after).toHaveProperty('activeFile', 'Target.md');
    });

    it('gD outside a link should no-op', async function () {
        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            view.editor.setValue('No links here');
            view.editor.setCursor(0, 5);
            view.editor.focus();
        });
        await browser.pause(300);
        await sendVimEscape();
        await browser.pause(50);
        await browser.keys(['g', 'D']);
        await browser.pause(200);

        const result = await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            return { value: view?.editor.getValue() ?? '' };
        });
        expect(result).toHaveProperty('value', 'No links here');
    });

    it('<C-w>gd on a wikilink should open in a horizontal split', async function () {
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
                view.editor.setValue('Go to [[Target]] now');
                view.editor.setCursor(0, 10);
                view.editor.focus();
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return { error: 'No adapter' };
                Vim.handleKey(adapter, '<C-w>');
                Vim.handleKey(adapter, 'g');
                Vim.handleKey(adapter, 'd');
                return { success: true };
            } catch (e) {
                return { error: String(e) };
            }
        });
        expect(result).toHaveProperty('success', true);
        await browser.pause(500);
        const after = await browser.executeObsidian(({ app }) => {
            const openFiles: string[] = [];
            app.workspace.iterateAllLeaves((leaf) => {
                if (leaf.view.getViewType() === 'markdown') {
                    const file = (
                        leaf.view as unknown as { file?: { path: string } }
                    ).file?.path;
                    if (file) openFiles.push(file);
                }
            });
            return { openFiles };
        });
        const openFiles = (after as { openFiles: string[] }).openFiles;
        expect(openFiles.length).toBeGreaterThanOrEqual(2);
        expect(openFiles).toContain('Target.md');
    });

    it('<C-w>gD on a wikilink should open in a vertical split', async function () {
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
                view.editor.setValue('Go to [[Target]] now');
                view.editor.setCursor(0, 10);
                view.editor.focus();
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return { error: 'No adapter' };
                Vim.handleKey(adapter, '<C-w>');
                Vim.handleKey(adapter, 'g');
                Vim.handleKey(adapter, 'D');
                return { success: true };
            } catch (e) {
                return { error: String(e) };
            }
        });
        expect(result).toHaveProperty('success', true);
        await browser.pause(500);
        const after = await browser.executeObsidian(({ app }) => {
            const openFiles: string[] = [];
            app.workspace.iterateAllLeaves((leaf) => {
                if (leaf.view.getViewType() === 'markdown') {
                    const file = (
                        leaf.view as unknown as { file?: { path: string } }
                    ).file?.path;
                    if (file) openFiles.push(file);
                }
            });
            return { openFiles };
        });
        const openFiles = (after as { openFiles: string[] }).openFiles;
        expect(openFiles.length).toBeGreaterThanOrEqual(2);
        expect(openFiles).toContain('Target.md');
    });

    it('<C-w>gd outside a link should no-op', async function () {
        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            view.editor.setValue('No links here');
            view.editor.setCursor(0, 5);
            view.editor.focus();
        });
        await browser.pause(300);
        await sendVimEscape();
        await browser.pause(50);

        const leavesBefore = await browser.executeObsidian(({ app }) => {
            const leaves: number[] = [];
            app.workspace.iterateAllLeaves((leaf) => {
                if (leaf.view.getViewType() === 'markdown') leaves.push(1);
            });
            return leaves.length;
        });

        await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as Record<string, unknown> & {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            handleKey: (cm: unknown, key: string) => boolean;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return;
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            const adapter = cm?.cm;
            if (!adapter) return;
            Vim.handleKey(adapter, '<C-w>');
            Vim.handleKey(adapter, 'g');
            Vim.handleKey(adapter, 'd');
        });
        await browser.pause(300);

        const leavesAfter = await browser.executeObsidian(({ app }) => {
            const leaves: number[] = [];
            app.workspace.iterateAllLeaves((leaf) => {
                if (leaf.view.getViewType() === 'markdown') leaves.push(1);
            });
            return leaves.length;
        });

        expect(leavesAfter).toBe(leavesBefore);
    });

    it(':ob dispatches a command by id', async function () {
        const result = await handleEx('ob editor:save-file');

        expect(result.unknownCommand).toBe(false);
        expect(result.dispatchedCommands).toContain('editor:save-file');
    });
});
