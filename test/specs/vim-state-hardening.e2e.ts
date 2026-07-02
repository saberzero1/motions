import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    vimKeys,
    getCursorPos,
    getEditorValue,
    getVimMode,
    sendVimEscape,
    PAUSE,
} from '../helpers';

describe('Vim state hardening (issue #18)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);
    });

    describe('Stale prefix recovery via blur', function () {
        it('g prefix should not persist after editor blur', async function () {
            await setupEditor('line one\nline two\nline three', {
                line: 2,
                ch: 0,
            });

            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await browser.keys(['g']);
            await browser.pause(PAUSE.KEY_GAP);

            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                if (!cm) return;
                const editorView = cm as unknown as {
                    contentDOM?: HTMLElement;
                };
                editorView.contentDOM?.blur();
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                view.editor.focus();
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);
            await setupEditor('line one\nline two\nline three', {
                line: 0,
                ch: 0,
            });

            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await browser.keys(['G']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const pos = await getCursorPos();
            expect(pos.line).toBe(2);
        });
    });

    describe('gg and G after plugin reload', function () {
        it('gg should work after settings reload', async function () {
            await setupEditor('first\nsecond\nthird', { line: 2, ch: 0 });

            await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins: {
                            plugins: Record<
                                string,
                                { reloadFeatures: () => void }
                            >;
                        };
                    }
                ).plugins.plugins['vim-motions'];
                if (plugin) plugin.reloadFeatures();
            });
            await browser.pause(PAUSE.OBSIDIAN_LOAD);

            await vimKeys('g', 'g');
            const pos = await getCursorPos();
            expect(pos.line).toBe(0);
        });

        it('G should work after settings reload', async function () {
            await setupEditor('first\nsecond\nthird', { line: 0, ch: 0 });

            await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins: {
                            plugins: Record<
                                string,
                                { reloadFeatures: () => void }
                            >;
                        };
                    }
                ).plugins.plugins['vim-motions'];
                if (plugin) plugin.reloadFeatures();
            });
            await browser.pause(PAUSE.OBSIDIAN_LOAD);

            await vimKeys('G');
            const pos = await getCursorPos();
            expect(pos.line).toBe(2);
        });
    });

    describe('Keymap protection — defaults survive unmap', function () {
        it('gg should work after :unmap gg via ex', async function () {
            await setupEditor('aaa\nbbb\nccc', { line: 2, ch: 0 });

            await browser.executeObsidian(({ app, obsidian }) => {
                const Vim = (
                    window as unknown as {
                        CodeMirrorAdapter?: {
                            Vim?: {
                                unmap: (keys: string, ctx?: string) => boolean;
                            };
                        };
                    }
                ).CodeMirrorAdapter?.Vim;
                if (Vim) Vim.unmap('gg');
            });
            await browser.pause(PAUSE.MODE_SWITCH);

            await vimKeys('g', 'g');
            const pos = await getCursorPos();
            expect(pos.line).toBe(0);
        });

        it('j should work after Vim.unmap("j")', async function () {
            await setupEditor('line one\nline two', { line: 0, ch: 0 });

            await browser.executeObsidian(() => {
                const Vim = (
                    window as unknown as {
                        CodeMirrorAdapter?: {
                            Vim?: {
                                unmap: (keys: string, ctx?: string) => boolean;
                            };
                        };
                    }
                ).CodeMirrorAdapter?.Vim;
                if (Vim) Vim.unmap('j');
            });
            await browser.pause(PAUSE.MODE_SWITCH);

            await vimKeys('j');
            const pos = await getCursorPos();
            expect(pos.line).toBe(1);
        });
    });

    describe('resetKeymap recovers from corruption', function () {
        it('resetKeymap restores defaults after aggressive unmapping', async function () {
            await setupEditor('aaa\nbbb\nccc', { line: 0, ch: 0 });

            await browser.executeObsidian(() => {
                const Vim = (
                    window as unknown as {
                        CodeMirrorAdapter?: {
                            Vim?: {
                                unmap: (
                                    keys: string,
                                    ctx?: string,
                                    opts?: { includeDefaults?: boolean },
                                ) => boolean;
                                resetKeymap: () => void;
                            };
                        };
                    }
                ).CodeMirrorAdapter?.Vim;
                if (!Vim) return;
                Vim.unmap('j', undefined, { includeDefaults: true });
                Vim.unmap('gg', undefined, { includeDefaults: true });
                Vim.resetKeymap();
            });
            await browser.pause(PAUSE.MODE_SWITCH);

            await vimKeys('j');
            let pos = await getCursorPos();
            expect(pos.line).toBe(1);

            await vimKeys('g', 'g');
            pos = await getCursorPos();
            expect(pos.line).toBe(0);
        });
    });

    describe('Stale jumpList markers after document switch', function () {
        it('gg should work after switching to a shorter document', async function () {
            const longContent = Array.from(
                { length: 50 },
                (_, i) => `line ${i + 1}`,
            ).join('\n');
            await setupEditor(longContent, { line: 49, ch: 0 });
            await vimKeys('G');
            await browser.pause(PAUSE.KEY_GAP);
            await vimKeys('g', 'g');
            await browser.pause(PAUSE.KEY_GAP);

            await setupEditor('short', { line: 0, ch: 0 });
            await vimKeys('g', 'g');
            const pos = await getCursorPos();
            expect(pos.line).toBe(0);
        });

        it('G should work after switching to a shorter document', async function () {
            const longContent = Array.from(
                { length: 50 },
                (_, i) => `line ${i + 1}`,
            ).join('\n');
            await setupEditor(longContent, { line: 0, ch: 0 });
            await vimKeys('G');
            await browser.pause(PAUSE.KEY_GAP);

            await setupEditor('first\nsecond', { line: 0, ch: 0 });
            await vimKeys('G');
            const pos = await getCursorPos();
            expect(pos.line).toBe(1);
        });

        it('gg and G should work after reloadFeatures on shorter doc', async function () {
            const longContent = Array.from(
                { length: 30 },
                (_, i) => `line ${i + 1}`,
            ).join('\n');
            await setupEditor(longContent, { line: 29, ch: 0 });
            await vimKeys('G');
            await browser.pause(PAUSE.KEY_GAP);

            await setupEditor('a\nb\nc', { line: 0, ch: 0 });
            await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins: {
                            plugins: Record<
                                string,
                                { reloadFeatures: () => void }
                            >;
                        };
                    }
                ).plugins.plugins['vim-motions'];
                if (plugin) plugin.reloadFeatures();
            });
            await browser.pause(PAUSE.OBSIDIAN_LOAD);

            await vimKeys('G');
            let pos = await getCursorPos();
            expect(pos.line).toBe(2);

            await vimKeys('g', 'g');
            pos = await getCursorPos();
            expect(pos.line).toBe(0);
        });
    });

    describe('leaveVimMode cleanup from insert mode', function () {
        it('should not leave stale listeners after destroy in insert mode', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await vimKeys('i');
            const modeBefore = await getVimMode();
            expect(modeBefore).toBe('insert');

            const result = await browser.executeObsidian(
                ({ app, obsidian }) => {
                    const Vim = (
                        window as unknown as {
                            CodeMirrorAdapter?: {
                                Vim?: {
                                    leaveVimMode: (cm: unknown) => void;
                                    enterVimMode: (cm: unknown) => void;
                                };
                            };
                        }
                    ).CodeMirrorAdapter?.Vim;
                    if (!Vim) return { error: 'no Vim API' };
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { error: 'no view' };
                    const editorView = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as Record<string, unknown>;
                    const adapter = editorView?.cm;
                    if (!adapter) return { error: 'no adapter' };
                    Vim.leaveVimMode(adapter);
                    Vim.enterVimMode(adapter);
                    return { success: true };
                },
            );
            expect(result).toHaveProperty('success', true);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const modeAfter = await getVimMode();
            expect(modeAfter).toBe('normal');

            await vimKeys('j');
            const content = await getEditorValue();
            expect(content).toBe('hello world');
        });
    });
});
