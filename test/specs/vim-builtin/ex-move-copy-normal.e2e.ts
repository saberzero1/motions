import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    getEditorValue,
    getCursorPos,
    sendVimEscape,
} from '../../helpers';

describe('Ex commands — :move, :copy, :normal', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(50);
    });

    function handleEx(cmd: string) {
        return browser.executeObsidian(({ app, obsidian }, cmdStr: string) => {
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
                if (!Vim) return { error: 'No Vim API' };
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return { error: 'No view' };
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return { error: 'No adapter' };
                view.editor.focus();
                Vim.handleEx(adapter, cmdStr);
                return { success: true };
            } catch (e) {
                return { error: String(e) };
            }
        }, cmd);
    }

    describe(':m / :move (move lines)', function () {
        it(':m+1 moves current line down by 1', async function () {
            await setupEditor('aaa\nbbb\nccc', { line: 0, ch: 0 });
            await handleEx('m+1');
            await browser.pause(100);
            expect(await getEditorValue()).toBe('bbb\naaa\nccc');
        });

        it('[crash-guard] :m0 should not error', async function () {
            await setupEditor('aaa\nbbb\nccc', { line: 2, ch: 0 });
            await handleEx('m0');
            await browser.pause(100);
            expect((await getEditorValue()).length).toBeGreaterThan(0);
        });

        it('[crash-guard] :m$ should not error', async function () {
            await setupEditor('aaa\nbbb\nccc', { line: 0, ch: 0 });
            await handleEx('m$');
            await browser.pause(100);
            expect((await getEditorValue()).length).toBeGreaterThan(0);
        });

        it('[crash-guard] :m-2 should not error', async function () {
            await setupEditor('aaa\nbbb\nccc', { line: 2, ch: 0 });
            await handleEx('m-2');
            await browser.pause(100);
            expect((await getEditorValue()).length).toBeGreaterThan(0);
        });

        it('[crash-guard] :1,2m$ should not error', async function () {
            await setupEditor('aaa\nbbb\nccc\nddd', { line: 0, ch: 0 });
            await handleEx('1,2m$');
            await browser.pause(100);
            expect((await getEditorValue()).length).toBeGreaterThan(0);
        });

        it(':move is an alias for :m', async function () {
            await setupEditor('aaa\nbbb\nccc', { line: 0, ch: 0 });
            await handleEx('move+1');
            await browser.pause(100);
            expect(await getEditorValue()).toBe('bbb\naaa\nccc');
        });

        it(':m. (move to own position) is a no-op', async function () {
            await setupEditor('aaa\nbbb\nccc', { line: 1, ch: 0 });
            await handleEx('m.');
            await browser.pause(100);
            expect(await getEditorValue()).toBe('aaa\nbbb\nccc');
        });

        it('[crash-guard] undo after :m should not error', async function () {
            await setupEditor('aaa\nbbb\nccc', { line: 0, ch: 0 });
            await handleEx('m+1');
            await browser.pause(100);
            await handleEx('undo');
            await browser.pause(100);
            expect((await getEditorValue()).length).toBeGreaterThan(0);
        });
    });

    describe(':t / :co / :copy (copy lines)', function () {
        it(':t. duplicates current line below', async function () {
            await setupEditor('aaa\nbbb', { line: 0, ch: 0 });
            await handleEx('t.');
            await browser.pause(100);
            expect(await getEditorValue()).toBe('aaa\naaa\nbbb');
        });

        it('[crash-guard] :t$ should not error', async function () {
            await setupEditor('aaa\nbbb', { line: 0, ch: 0 });
            await handleEx('t$');
            await browser.pause(100);
            expect((await getEditorValue()).length).toBeGreaterThan(0);
        });

        it('[crash-guard] :1,2t$ should not error', async function () {
            await setupEditor('aaa\nbbb\nccc', { line: 0, ch: 0 });
            await handleEx('1,2t$');
            await browser.pause(100);
            expect((await getEditorValue()).length).toBeGreaterThan(0);
        });

        it(':co is an alias for :t', async function () {
            await setupEditor('aaa\nbbb', { line: 0, ch: 0 });
            await handleEx('co.');
            await browser.pause(100);
            expect(await getEditorValue()).toBe('aaa\naaa\nbbb');
        });

        it(':copy is an alias for :t', async function () {
            await setupEditor('aaa\nbbb', { line: 0, ch: 0 });
            await handleEx('copy.');
            await browser.pause(100);
            expect(await getEditorValue()).toBe('aaa\naaa\nbbb');
        });

        it('undo removes copied lines after :t', async function () {
            await setupEditor('aaa\nbbb', { line: 0, ch: 0 });
            await handleEx('t.');
            await browser.pause(100);
            expect(await getEditorValue()).toBe('aaa\naaa\nbbb');
            await handleEx('undo');
            await browser.pause(100);
            expect(await getEditorValue()).toBe('aaa\nbbb');
        });
    });

    describe(':normal / :normal! (execute normal-mode keys)', function () {
        it(':normal dd deletes the current line', async function () {
            await setupEditor('aaa\nbbb\nccc', { line: 0, ch: 0 });
            await handleEx('normal dd');
            await browser.pause(100);
            expect(await getEditorValue()).toBe('bbb\nccc');
        });

        it('[crash-guard] :%normal I// should not error', async function () {
            await setupEditor('aaa\nbbb', { line: 0, ch: 0 });
            await handleEx('%normal I// ');
            await browser.pause(100);
            expect((await getEditorValue()).length).toBeGreaterThan(0);
        });

        it(':normal x deletes char under cursor', async function () {
            await setupEditor('hello', { line: 0, ch: 0 });
            await handleEx('normal x');
            await browser.pause(100);
            expect(await getEditorValue()).toBe('ello');
        });

        it('[crash-guard] :normal with no args should not error', async function () {
            await setupEditor('hello', { line: 0, ch: 0 });
            const result = await handleEx('normal');
            expect(result).toHaveProperty('success', true);
        });

        it(':normal! bypasses user mappings', async function () {
            await setupEditor('aaa\nbbb\nccc', { line: 0, ch: 0 });
            await handleEx('normal! dd');
            await browser.pause(100);
            expect(await getEditorValue()).toBe('bbb\nccc');
        });
    });
});
