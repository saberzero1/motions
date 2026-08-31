import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    getEditorValue,
    getCursorPos,
    getVimMode,
    vimKeys,
    vimRawKeys,
    sendVimEscape,
    getRegisterContent,
    ensureLivePreview,
    PAUSE,
} from '../helpers';

const TOGGLE_SETTLE = 800;

async function executeToggleCommand(
    commandId: 'toggle-vim-mode' | 'enable-vim-mode' | 'disable-vim-mode',
): Promise<void> {
    await browser.executeObsidian(({ app }, id: string) => {
        (
            app as unknown as {
                commands: { executeCommandById(id: string): void };
            }
        ).commands.executeCommandById(`vim-motions:${id}`);
    }, commandId);
    await browser.pause(TOGGLE_SETTLE);
}

describe('Vim toggle resilience: functionality after disable→enable cycle', function () {
    before(async function () {
        this.timeout(30000);
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(PAUSE.OBSIDIAN_LOAD);
        await ensureLivePreview();

        await executeToggleCommand('disable-vim-mode');
        await executeToggleCommand('enable-vim-mode');
    });

    describe('cursor visibility', function () {
        it('cursor should be visible after toggle cycle', async function () {
            this.timeout(15000);
            await setupEditor('cursor test', { line: 0, ch: 0 });
            await browser.pause(PAUSE.EDITOR_SETTLE);
            const hasVimCursor = await browser.executeObsidian(() => {
                return !!document.querySelector('.cm-vimCursorLayer');
            });
            expect(hasVimCursor).toBe(true);
        });
    });

    describe('basic motions', function () {
        it('hjkl work', async function () {
            this.timeout(10000);
            await setupEditor('abcd\nefgh\nijkl\nmnop', {
                line: 1,
                ch: 1,
            });
            await vimKeys('j');
            expect((await getCursorPos()).line).toBe(2);
            await vimKeys('k');
            expect((await getCursorPos()).line).toBe(1);
            await vimKeys('l');
            expect((await getCursorPos()).ch).toBe(2);
            await vimKeys('h');
            expect((await getCursorPos()).ch).toBe(1);
        });

        it('w and b word motions work', async function () {
            this.timeout(10000);
            await setupEditor('one two three', { line: 0, ch: 0 });
            await vimKeys('w');
            expect((await getCursorPos()).ch).toBe(4);
            await vimKeys('b');
            expect((await getCursorPos()).ch).toBe(0);
        });
    });

    describe('operators', function () {
        it('dd deletes a line', async function () {
            this.timeout(10000);
            await setupEditor('line one\nline two\nline three', {
                line: 1,
                ch: 0,
            });
            await vimRawKeys('dd');
            const value = await getEditorValue();
            expect(value).toBe('line one\nline three');
        });

        it('yy yanks and p pastes', async function () {
            this.timeout(10000);
            await setupEditor('hello\nworld', { line: 0, ch: 0 });
            await vimRawKeys('yy');
            const reg = await getRegisterContent('"');
            expect(reg?.text).toContain('hello');
            await vimRawKeys('p');
            const value = await getEditorValue();
            expect(value).toContain('hello\nhello');
        });

        it('ciw changes inner word', async function () {
            this.timeout(10000);
            await setupEditor('hello world', { line: 0, ch: 0 });
            await vimRawKeys('ciw');
            const mode = await getVimMode();
            expect(mode).toBe('insert');
            await sendVimEscape();
        });
    });

    describe('modes', function () {
        it('i enters insert mode, Esc returns to normal', async function () {
            this.timeout(10000);
            await setupEditor('test', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await browser.executeObsidian(({ app, obsidian }) => {
                const Vim = (
                    window as unknown as {
                        CodeMirrorAdapter?: {
                            Vim?: {
                                handleKey: (cm: unknown, key: string) => void;
                            };
                        };
                    }
                ).CodeMirrorAdapter?.Vim;
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view || !Vim) return;
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (adapter) Vim.handleKey(adapter, 'i');
            });
            await browser.pause(PAUSE.MODE_SWITCH);
            const insertMode = await getVimMode();
            expect(insertMode).toBe('insert');

            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            const normalMode = await getVimMode();
            expect(normalMode).toBe('normal');
        });

        it('v enters visual mode', async function () {
            this.timeout(10000);
            await setupEditor('test', { line: 0, ch: 0 });
            await browser.executeObsidian(({ app, obsidian }) => {
                const Vim = (
                    window as unknown as {
                        CodeMirrorAdapter?: {
                            Vim?: {
                                handleKey: (cm: unknown, key: string) => void;
                            };
                        };
                    }
                ).CodeMirrorAdapter?.Vim;
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view || !Vim) return;
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (adapter) Vim.handleKey(adapter, 'v');
            });
            await browser.pause(PAUSE.MODE_SWITCH);
            const mode = await getVimMode();
            expect(mode).toBe('visual');
            await sendVimEscape();
        });
    });

    describe('ex commands', function () {
        it(':s substitute works', async function () {
            this.timeout(10000);
            await setupEditor('foo bar foo', { line: 0, ch: 0 });
            await browser.executeObsidian(({ app, obsidian }) => {
                const Vim = (
                    window as unknown as {
                        CodeMirrorAdapter?: {
                            Vim?: {
                                handleEx: (cm: unknown, input: string) => void;
                            };
                        };
                    }
                ).CodeMirrorAdapter?.Vim;
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view || !Vim) return;
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (adapter) Vim.handleEx(adapter, 's/foo/baz/g');
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);
            const value = await getEditorValue();
            expect(value).toBe('baz bar baz');
        });
    });

    describe('vim bridge', function () {
        it('window.CodeMirrorAdapter.Vim is available', async function () {
            const hasVim = await browser.executeObsidian(() => {
                const adapter = (
                    window as unknown as {
                        CodeMirrorAdapter?: { Vim?: unknown };
                    }
                ).CodeMirrorAdapter;
                return {
                    hasAdapter: !!adapter,
                    hasVim: !!adapter?.Vim,
                };
            });
            expect(
                (hasVim as { hasAdapter: boolean; hasVim: boolean }).hasVim,
            ).toBe(true);
        });
    });

    after(async function () {
        this.timeout(10000);
        await sendVimEscape();
    });
});
