import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    vimKeys,
    getEditorValue,
    getCursorPos,
    sendVimEscape,
} from '../../helpers';
import { testWithNeovim, startNvim, stopNvim } from '../../neovim/test-wrapper';
import { SUITES } from '../../neovim/test-definitions';

describe('Visual mode (Tier 1)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await startNvim();
    });

    after(async function () {
        await stopNvim();
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(50);
    });

    describe('v (charwise)', function () {
        it('v + motion + d should delete selection', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(50);
            await browser.keys(['v']);
            await browser.pause(30);
            await browser.keys(['e']);
            await browser.pause(30);
            await browser.keys(['d']);
            await browser.pause(300);
            expect(await getEditorValue()).toBe(' world');
        });

        it('v + motion + y should yank selection', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(50);
            await browser.keys(['v']);
            await browser.pause(30);
            await browser.keys(['e']);
            await browser.pause(30);
            await browser.keys(['y']);
            await browser.pause(300);
            await vimKeys('$');
            await vimKeys('p');
            expect(await getEditorValue()).toContain('hello');
        });
    });

    describe('V (linewise)', function () {
        it('V + d should delete entire line', async function () {
            await setupEditor('line1\nline2\nline3', { line: 1, ch: 0 });
            await sendVimEscape();
            await browser.pause(50);
            await browser.keys(['V']);
            await browser.pause(30);
            await browser.keys(['d']);
            await browser.pause(300);
            expect(await getEditorValue()).toBe('line1\nline3');
        });

        it('V + j + d should delete multiple lines', async function () {
            await setupEditor('one\ntwo\nthree\nfour', { line: 1, ch: 0 });
            await sendVimEscape();
            await browser.pause(50);
            await browser.keys(['V']);
            await browser.pause(30);
            await browser.keys(['j']);
            await browser.pause(30);
            await browser.keys(['d']);
            await browser.pause(300);
            expect(await getEditorValue()).toBe('one\nfour');
        });

        it('V + J should join selected lines', async function () {
            await setupEditor('line one\nline two\nline three', {
                line: 0,
                ch: 0,
            });
            await sendVimEscape();
            await browser.pause(50);
            await browser.keys(['V']);
            await browser.pause(30);
            await browser.keys(['j']);
            await browser.pause(30);
            await browser.keys(['J']);
            await browser.pause(300);
            expect(await getEditorValue()).toBe(
                'line one line two\nline three',
            );
        });
    });

    describe('visual + indent', function () {
        it('v + > should indent selection', async function () {
            await setupEditor('hello\nworld', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(50);
            await browser.keys(['V']);
            await browser.pause(30);
            await browser.keys(['>']);
            await browser.pause(300);
            const val = await getEditorValue();
            expect(val.startsWith('\t') || val.startsWith('  ')).toBe(true);
        });
    });

    describe('visual + text objects', function () {
        it('vi" should select inside quotes', async function () {
            await setupEditor('say "hello world" end', { line: 0, ch: 8 });
            await sendVimEscape();
            await browser.pause(50);
            await browser.keys(['v']);
            await browser.pause(30);
            await browser.keys(['i']);
            await browser.pause(30);
            await browser.keys(['"']);
            await browser.pause(30);
            await browser.keys(['d']);
            await browser.pause(300);
            expect(await getEditorValue()).toBe('say "" end');
        });

        it('vaw should select a word', async function () {
            await setupEditor('hello world foo', { line: 0, ch: 7 });
            await sendVimEscape();
            await browser.pause(50);
            await browser.keys(['v']);
            await browser.pause(30);
            await browser.keys(['a']);
            await browser.pause(30);
            await browser.keys(['w']);
            await browser.pause(30);
            await browser.keys(['d']);
            await browser.pause(300);
            expect(await getEditorValue()).toBe('hello foo');
        });
    });

    describe('CTRL-V (visual block)', function () {
        it('CTRL-V should enter block visual and delete column', async function () {
            await setupEditor('abc\ndef\nghi', { line: 0, ch: 0 });
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return;
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm as Record<string, unknown> | undefined;
                if (!adapter) return;
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
                if (!Vim) return;
                Vim.handleKey(adapter, '<C-v>');
                Vim.handleKey(adapter, 'j');
                Vim.handleKey(adapter, 'j');
                Vim.handleKey(adapter, 'x');
            });
            await browser.pause(300);
            expect(await getEditorValue()).toBe('bc\nef\nhi');
        });
    });

    describe('V + y should yank linewise', function () {
        it('V + y should produce linewise register', async function () {
            await setupEditor('hello world\nsecond line', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(50);
            await browser.keys(['V']);
            await browser.pause(30);
            await browser.keys(['y']);
            await browser.pause(300);
            const { getRegisterContent } = await import('../../helpers');
            const reg = await getRegisterContent('"');
            expect(reg).not.toBeNull();
            expect(reg!.linewise).toBe(true);
        });
    });

    describe('v + count + motion', function () {
        it('v3l + d should delete 4 characters', async function () {
            await setupEditor('abcdefgh', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(50);
            await browser.keys(['v']);
            await browser.pause(30);
            await browser.keys(['3', 'l']);
            await browser.pause(30);
            await browser.keys(['d']);
            await browser.pause(300);
            expect(await getEditorValue()).toBe('efgh');
        });
    });

    describe('gv (reselect last visual)', function () {
        it('gv should reselect and allow delete', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(50);
            await browser.keys(['v']);
            await browser.pause(30);
            await browser.keys(['e']);
            await browser.pause(30);
            await sendVimEscape();
            await browser.pause(50);
            await vimKeys('g', 'v');
            await browser.pause(100);
            await browser.keys(['d']);
            await browser.pause(300);
            expect(await getEditorValue()).toBe(' world');
        });
    });

    describe('visual + text objects (extended)', function () {
        it('viw should select word under cursor', async function () {
            await setupEditor('hello world foo', { line: 0, ch: 7 });
            await sendVimEscape();
            await browser.pause(50);
            await browser.keys(['v']);
            await browser.pause(30);
            await browser.keys(['i', 'w']);
            await browser.pause(30);
            await browser.keys(['d']);
            await browser.pause(300);
            expect(await getEditorValue()).toBe('hello  foo');
        });
    });

    describe('visual at document boundaries', function () {
        it('v + G + d should delete from cursor to end of document', async function () {
            await setupEditor('one\ntwo\nthree', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(50);
            await browser.keys(['v']);
            await browser.pause(30);
            await browser.keys(['G']);
            await browser.pause(30);
            await browser.keys(['$']);
            await browser.pause(30);
            await browser.keys(['d']);
            await browser.pause(300);
            expect(await getEditorValue()).toBe('');
        });

        it('V at last line + d should delete last line', async function () {
            await setupEditor('one\ntwo\nthree', { line: 2, ch: 0 });
            await sendVimEscape();
            await browser.pause(50);
            await browser.keys(['V']);
            await browser.pause(30);
            await browser.keys(['d']);
            await browser.pause(300);
            expect(await getEditorValue()).toBe('one\ntwo');
        });
    });

    describe('visual mode cursor at end-of-line', function () {
        it('v + $ should keep cursor on last character, not past EOL', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(50);
            await browser.keys(['v']);
            await browser.pause(30);
            await browser.keys(['$']);
            await browser.pause(300);
            const pos = await getCursorPos();
            expect(pos.line).toBe(0);
            expect(pos.ch).toBeLessThanOrEqual(11);
        });

        it('v + l to end of line should not displace cursor past content', async function () {
            await setupEditor('abc', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(50);
            await browser.keys(['v']);
            await browser.pause(30);
            await browser.keys(['l', 'l']);
            await browser.pause(300);
            const pos = await getCursorPos();
            expect(pos.line).toBe(0);
            expect(pos.ch).toBeLessThanOrEqual(3);
        });

        it('V on a short line should render cursor within line bounds', async function () {
            await setupEditor('hi\nlonger line\nend', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(50);
            await browser.keys(['V']);
            await browser.pause(300);
            const pos = await getCursorPos();
            expect(pos.line).toBe(0);
        });
    });

    describe('o (swap visual anchor)', function () {
        it('o should swap cursor to other end of selection', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(50);
            await browser.keys(['v']);
            await browser.pause(30);
            await browser.keys(['e']);
            await browser.pause(30);
            await browser.keys(['o']);
            await browser.pause(100);
            const pos = await getCursorPos();
            expect(pos.ch).toBe(0);
        });
    });

    describe('Neovim golden comparison', function () {
        before(async function () {
            await startNvim();
        });

        after(async function () {
            await stopNvim();
        });

        const suite = SUITES.find((s) => s.name === 'visual-mode');
        if (suite) {
            for (const tc of suite.cases) {
                testWithNeovim('visual-mode', tc.name, {
                    content: tc.content,
                    cursor: tc.cursor,
                    keys: [tc.keys],
                });
            }
        }
    });
});
