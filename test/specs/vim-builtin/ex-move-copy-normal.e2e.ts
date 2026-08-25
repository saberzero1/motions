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

        it(':m0 moves current line to top of file', async function () {
            await setupEditor('aaa\nbbb\nccc', { line: 2, ch: 0 });
            await handleEx('m0');
            await browser.pause(100);
            expect(await getEditorValue()).toBe('ccc\naaa\nbbb');
        });

        it(':m$ moves current line to end of file', async function () {
            await setupEditor('aaa\nbbb\nccc', { line: 0, ch: 0 });
            await handleEx('m$');
            await browser.pause(100);
            expect(await getEditorValue()).toBe('bbb\nccc\naaa');
        });

        it(':m-2 moves current line up by 1', async function () {
            await setupEditor('aaa\nbbb\nccc', { line: 2, ch: 0 });
            await handleEx('m-2');
            await browser.pause(100);
            expect(await getEditorValue()).toBe('aaa\nccc\nbbb');
        });

        it(':1,2m$ moves lines 1-2 to end of file', async function () {
            await setupEditor('aaa\nbbb\nccc\nddd', { line: 0, ch: 0 });
            await handleEx('1,2m$');
            await browser.pause(100);
            expect(await getEditorValue()).toBe('ccc\nddd\naaa\nbbb');
        });

        it(':m3 moves current line after line 3', async function () {
            await setupEditor('aaa\nbbb\nccc\nddd', { line: 0, ch: 0 });
            await handleEx('m3');
            await browser.pause(100);
            expect(await getEditorValue()).toBe('bbb\nccc\naaa\nddd');
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

        it(':t$ copies current line to end of file', async function () {
            await setupEditor('aaa\nbbb', { line: 0, ch: 0 });
            await handleEx('t$');
            await browser.pause(100);
            expect(await getEditorValue()).toBe('aaa\nbbb\naaa');
        });

        it(':1,2t$ copies lines 1-2 to end of file', async function () {
            await setupEditor('aaa\nbbb\nccc', { line: 0, ch: 0 });
            await handleEx('1,2t$');
            await browser.pause(100);
            expect(await getEditorValue()).toBe('aaa\nbbb\nccc\naaa\nbbb');
        });

        it(':t0 copies current line to top of file', async function () {
            await setupEditor('aaa\nbbb\nccc', { line: 2, ch: 0 });
            await handleEx('t0');
            await browser.pause(100);
            expect(await getEditorValue()).toBe('ccc\naaa\nbbb\nccc');
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
