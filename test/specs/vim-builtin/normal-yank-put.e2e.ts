import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    vimKeys,
    vimHandleKeys,
    getEditorValue,
    getRegisterContent,
    getCursorPos,
    sendVimEscape,
    getVimMode,
} from '../../helpers';
import { testWithNeovim, startNvim, stopNvim } from '../../neovim/test-wrapper';
import { SUITES } from '../../neovim/test-definitions';

describe('Normal mode — yank and put (Tier 1)', function () {
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

    describe('yy / Y / yw', function () {
        it('yy should yank current line into default register', async function () {
            await setupEditor('hello world\nsecond line', { line: 0, ch: 0 });
            await vimKeys('y', 'y');
            const reg = await getRegisterContent('"');
            expect(reg).not.toBeNull();
            expect(reg!.text).toContain('hello world');
            expect(reg!.linewise).toBe(true);
        });

        it('yw should yank word', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await vimKeys('y', 'w');
            const reg = await getRegisterContent('"');
            expect(reg).not.toBeNull();
            expect(reg!.text).toContain('hello');
        });
    });

    describe('p / P', function () {
        it('p should paste yanked text after cursor', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await vimKeys('y', 'w');
            const reg = await getRegisterContent('"');
            expect(reg).not.toBeNull();
            expect(reg!.text).toContain('hello');
            await vimKeys('$');
            await vimKeys('p');
            const val = await getEditorValue();
            expect(val.length).toBeGreaterThan('hello world'.length);
            expect((val.match(/hello/g) ?? []).length).toBe(2);
        });

        it('P should paste yanked text before cursor', async function () {
            await setupEditor('world', { line: 0, ch: 0 });
            await vimKeys('y', 'w');
            const reg = await getRegisterContent('"');
            expect(reg).not.toBeNull();
            expect(reg!.text).toContain('world');
            await vimKeys('P');
            const val = await getEditorValue();
            expect((val.match(/world/g) ?? []).length).toBe(2);
        });

        it('dd then p should paste deleted line below', async function () {
            await setupEditor('first\nsecond\nthird', { line: 0, ch: 0 });
            await vimKeys('d', 'd');
            await vimKeys('p');
            expect(await getEditorValue()).toBe('second\nfirst\nthird');
        });
    });

    describe('named registers', function () {
        it('"ayy should yank into register a', async function () {
            await setupEditor('alpha line\nbeta line', { line: 0, ch: 0 });
            await vimKeys('"', 'a', 'y', 'y');
            const reg = await getRegisterContent('a');
            expect(reg).not.toBeNull();
            expect(reg!.text).toContain('alpha');
        });

        it('"ap should paste from register a', async function () {
            await setupEditor('alpha line\nbeta line', { line: 0, ch: 0 });
            await vimKeys('"', 'a', 'y', 'y');
            await vimKeys('G');
            await vimKeys('"', 'a', 'p');
            const val = await getEditorValue();
            expect(val).toContain('alpha');
        });
    });

    describe('append to register ("A)', function () {
        it('"Ayy should append to register a', async function () {
            await setupEditor('first\nsecond\nthird', { line: 0, ch: 0 });
            await vimKeys('"', 'a', 'y', 'y');
            await vimKeys('j');
            await vimKeys('"', 'A', 'y', 'y');
            const reg = await getRegisterContent('a');
            expect(reg).not.toBeNull();
            expect(reg!.text).toContain('first');
            expect(reg!.text).toContain('second');
        });
    });

    describe('". (last inserted text)', function () {
        it('". should contain last inserted text', async function () {
            await setupEditor('hello', { line: 0, ch: 5 });
            await vimKeys('a');
            await browser.keys([' ', 'w', 'o', 'r', 'l', 'd']);
            await sendVimEscape();
            await browser.pause(200);
            const reg = await getRegisterContent('.');
            expect(reg).not.toBeNull();
            expect(reg!.text).toContain('world');
        });
    });

    describe('register 0', function () {
        it('yy should populate register 0', async function () {
            await setupEditor('yanked line\nother', { line: 0, ch: 0 });
            await vimKeys('y', 'y');
            const reg = await getRegisterContent('0');
            expect(reg).not.toBeNull();
            expect(reg!.text).toContain('yanked');
        });
    });

    describe('gp / gP (paste and move past)', function () {
        it('gp should paste and move cursor past pasted text', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await vimKeys('y', 'w');
            await vimKeys('$');
            await vimKeys('g', 'p');
            const val = await getEditorValue();
            expect(val).toBe('hello worldhello ');
            const pos = await getCursorPos();
            expect(pos.ch).toBeGreaterThan(10);
        });
    });

    describe('yank edge cases', function () {
        it('yy should set linewise flag', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await vimKeys('y', 'y');
            const reg = await getRegisterContent('"');
            expect(reg).not.toBeNull();
            expect(reg!.linewise).toBe(true);
        });

        it('yw should not set linewise flag', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await vimKeys('y', 'w');
            const reg = await getRegisterContent('"');
            expect(reg).not.toBeNull();
            expect(reg!.linewise).toBe(false);
        });

        it('y$ should yank to end without newline', async function () {
            await setupEditor('hello world\nsecond', { line: 0, ch: 6 });
            await vimKeys('y', '$');
            const reg = await getRegisterContent('"');
            expect(reg).not.toBeNull();
            expect(reg!.text).toBe('world');
            expect(reg!.linewise).toBe(false);
        });

        it('2yy should yank 2 lines', async function () {
            await setupEditor('one\ntwo\nthree', { line: 0, ch: 0 });
            await vimKeys('2', 'y', 'y');
            const reg = await getRegisterContent('"');
            expect(reg).not.toBeNull();
            expect(reg!.text).toContain('one');
            expect(reg!.text).toContain('two');
            expect(reg!.linewise).toBe(true);
        });

        it('dd then dd should update default register', async function () {
            await setupEditor('first\nsecond\nthird', { line: 0, ch: 0 });
            await vimKeys('d', 'd');
            await vimKeys('d', 'd');
            const reg = await getRegisterContent('"');
            expect(reg).not.toBeNull();
            expect(reg!.text).toContain('second');
        });
    });

    describe('numbered register rotation', function () {
        it('"1 should contain last delete after dd', async function () {
            await setupEditor('first\nsecond\nthird', { line: 0, ch: 0 });
            await vimKeys('d', 'd');
            const reg = await getRegisterContent('1');
            expect(reg).not.toBeNull();
            expect(reg!.text).toContain('first');
        });

        it('consecutive dd should rotate numbered registers', async function () {
            await setupEditor('aaa\nbbb\nccc\nddd', { line: 0, ch: 0 });
            await vimKeys('d', 'd');
            await vimKeys('d', 'd');
            const reg1 = await getRegisterContent('1');
            expect(reg1).not.toBeNull();
            expect(reg1!.text).toContain('bbb');
            const reg2 = await getRegisterContent('2');
            expect(reg2).not.toBeNull();
            expect(reg2!.text).toContain('aaa');
        });
    });

    describe('Y (Neovim: yank to end of line)', function () {
        it('Y should yank from cursor to end of line, not entire line', async function () {
            await setupEditor('hello world', { line: 0, ch: 6 });
            await vimKeys('Y');
            const reg = await getRegisterContent('"');
            expect(reg).not.toBeNull();
            expect(reg!.text).toBe('world');
            expect(reg!.linewise).toBe(false);
        });
    });

    describe('visual mode paste (#139)', function () {
        it('v + p should replace selection with yanked text', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await vimKeys('y', 'w');
            await vimHandleKeys('wviwp');
            const val = await getEditorValue();
            expect(val).toBe('hello hello ');
        });

        it('V + p should replace selected line with yanked line (#139)', async function () {
            await setupEditor('aaa\nbbb\nccc', { line: 0, ch: 0 });
            await vimKeys('y', 'y');
            await vimHandleKeys('jVp');
            const val = await getEditorValue();
            expect(val).toBe('aaa\naaa\nccc');
        });

        it('V + P should replace selected line with yanked line (#139)', async function () {
            await setupEditor('aaa\nbbb\nccc', { line: 0, ch: 0 });
            await vimKeys('y', 'y');
            await vimHandleKeys('jVP');
            const val = await getEditorValue();
            expect(val).toBe('aaa\naaa\nccc');
        });

        it('v + P should replace selection with yanked word (#139)', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await vimKeys('y', 'w');
            await vimHandleKeys('wviwP');
            const val = await getEditorValue();
            expect(val).toBe('hello hello ');
        });

        it('visual paste should put replaced text into unnamed register', async function () {
            await setupEditor('aaa bbb', { line: 0, ch: 0 });
            await vimKeys('y', 'i', 'w');
            await vimHandleKeys('wviwp');
            const reg = await getRegisterContent('"');
            expect(reg).not.toBeNull();
            expect(reg!.text).toBe('bbb');
        });

        it('v + gp should replace selection and move past (#139)', async function () {
            await setupEditor('aaa bbb ccc', { line: 0, ch: 0 });
            await vimKeys('y', 'i', 'w');
            await vimHandleKeys('wviwgp');
            const val = await getEditorValue();
            expect(val).toBe('aaa aaa ccc');
        });

        it('should return to normal mode after visual paste', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await vimKeys('y', 'w');
            await vimHandleKeys('wviwp');
            const mode = await getVimMode();
            expect(mode).toBe('normal');
        });
    });

    describe('Neovim golden comparison', function () {
        before(async function () {
            await startNvim();
        });

        after(async function () {
            await stopNvim();
        });

        const suite = SUITES.find((s) => s.name === 'normal-yank-put');
        if (suite) {
            for (const tc of suite.cases) {
                testWithNeovim('normal-yank-put', tc.name, {
                    content: tc.content,
                    cursor: tc.cursor,
                    keys: [tc.keys],
                });
            }
        } else {
            it('suite "normal-yank-put" exists in test-definitions', function () {
                throw new Error(
                    'Suite "normal-yank-put" not found in SUITES — was it renamed in test-definitions.ts?',
                );
            });
        }
    });
});
