import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    vimKeys,
    vimRawKeys,
    getEditorValue,
    getCursorPos,
    sendVimEscape,
} from '../../helpers';
import { testWithNeovim, startNvim, stopNvim } from '../../neovim/test-wrapper';
import { SUITES } from '../../neovim/test-definitions';

describe('Normal mode — editing commands (Tier 1)', function () {
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

    describe('x / X', function () {
        it('x should delete char under cursor', async function () {
            await setupEditor('abcde', { line: 0, ch: 2 });
            await vimKeys('x');
            expect(await getEditorValue()).toBe('abde');
        });

        it('X should delete char before cursor', async function () {
            await setupEditor('abcde', { line: 0, ch: 2 });
            await vimKeys('X');
            expect(await getEditorValue()).toBe('acde');
        });

        it('3x should delete 3 chars', async function () {
            await setupEditor('abcde', { line: 0, ch: 0 });
            await vimKeys('3', 'x');
            expect(await getEditorValue()).toBe('de');
        });
    });

    describe('d / dd / D', function () {
        it('dd should delete current line', async function () {
            await setupEditor('line1\nline2\nline3', { line: 1, ch: 0 });
            await vimKeys('d', 'd');
            expect(await getEditorValue()).toBe('line1\nline3');
        });

        it('D should delete to end of line', async function () {
            await setupEditor('hello world', { line: 0, ch: 5 });
            await vimKeys('D');
            expect(await getEditorValue()).toBe('hello');
        });

        it('2dd should delete 2 lines', async function () {
            await setupEditor('one\ntwo\nthree\nfour', { line: 1, ch: 0 });
            await vimKeys('2', 'd', 'd');
            expect(await getEditorValue()).toBe('one\nfour');
        });

        it('dw should delete word', async function () {
            await setupEditor('hello world foo', { line: 0, ch: 0 });
            await vimKeys('d', 'w');
            expect(await getEditorValue()).toBe('world foo');
        });
    });

    describe('c / cc / C', function () {
        it('cc should change entire line', async function () {
            await setupEditor('old text\nkeep this', { line: 0, ch: 0 });
            await vimKeys('c', 'c');
            await browser.keys(['n', 'e', 'w']);
            await sendVimEscape();
            await browser.pause(200);
            expect(await getEditorValue()).toBe('new\nkeep this');
        });

        it('C should change to end of line', async function () {
            await setupEditor('hello world', { line: 0, ch: 5 });
            await vimKeys('C');
            await browser.keys(['!']);
            await sendVimEscape();
            await browser.pause(200);
            expect(await getEditorValue()).toBe('hello!');
        });

        it('cw should change word', async function () {
            await setupEditor('old new end', { line: 0, ch: 0 });
            await vimKeys('c', 'w');
            await browser.keys(['r', 'e', 'p']);
            await sendVimEscape();
            await browser.pause(200);
            expect(await getEditorValue()).toBe('rep new end');
        });
    });

    describe('s / S', function () {
        it('s should substitute char and enter insert', async function () {
            await setupEditor('abcde', { line: 0, ch: 2 });
            await vimKeys('s');
            await browser.keys(['X']);
            await sendVimEscape();
            await browser.pause(200);
            expect(await getEditorValue()).toBe('abXde');
        });

        it('S should substitute entire line', async function () {
            await setupEditor('old line\nkeep', { line: 0, ch: 3 });
            await vimKeys('S');
            await browser.keys(['n', 'e', 'w']);
            await sendVimEscape();
            await browser.pause(200);
            expect(await getEditorValue()).toBe('new\nkeep');
        });
    });

    describe('r / R', function () {
        it('r should replace single char', async function () {
            await setupEditor('abcde', { line: 0, ch: 2 });
            await vimKeys('r', 'X');
            expect(await getEditorValue()).toBe('abXde');
        });

        it('R should enter replace mode', async function () {
            await setupEditor('abcde', { line: 0, ch: 0 });
            await vimKeys('R');
            await browser.keys(['X', 'Y']);
            await sendVimEscape();
            await browser.pause(200);
            expect(await getEditorValue()).toBe('XYcde');
        });
    });

    describe('J / ~', function () {
        it('J should join lines with space', async function () {
            await setupEditor('hello\nworld', { line: 0, ch: 0 });
            await vimKeys('J');
            expect(await getEditorValue()).toBe('hello world');
        });

        it('~ should toggle case', async function () {
            await setupEditor('Hello', { line: 0, ch: 0 });
            await vimKeys('~');
            const val = await getEditorValue();
            expect(val.charAt(0)).toBe('h');
        });
    });

    describe('u / CTRL-R', function () {
        it('u should undo last change', async function () {
            await setupEditor('original', { line: 0, ch: 0 });
            await vimKeys('d', 'd');
            expect(await getEditorValue()).toBe('');
            await vimKeys('u');
            expect(await getEditorValue()).toBe('original');
        });

        it('. should repeat last change', async function () {
            await setupEditor('aaa\nbbb\nccc', { line: 0, ch: 0 });
            await vimKeys('d', 'd');
            expect(await getEditorValue()).toBe('bbb\nccc');
            await vimKeys('.');
            expect(await getEditorValue()).toBe('ccc');
        });
    });

    describe('. (repeat) edge cases', function () {
        it('. should repeat dw', async function () {
            await setupEditor('one two three four', { line: 0, ch: 0 });
            await vimKeys('d', 'w');
            expect(await getEditorValue()).toBe('two three four');
            await vimKeys('.');
            expect(await getEditorValue()).toBe('three four');
        });

        it('. should repeat >> (indent)', async function () {
            await setupEditor('one\ntwo', { line: 0, ch: 0 });
            await vimKeys('>', '>');
            await vimKeys('j');
            await vimKeys('.');
            const lines = (await getEditorValue()).split('\n');
            expect(
                lines[1]!.startsWith('\t') || lines[1]!.startsWith('  '),
            ).toBe(true);
        });

        it('3. should repeat with count', async function () {
            await setupEditor('abcde', { line: 0, ch: 0 });
            await vimKeys('x');
            expect(await getEditorValue()).toBe('bcde');
            await vimKeys('3', '.');
            expect(await getEditorValue()).toBe('e');
        });

        it('. should repeat cw with typed text', async function () {
            await setupEditor('old old old', { line: 0, ch: 0 });
            await vimRawKeys('cwnew \x1bw.');
            const val = await getEditorValue();
            expect(val).toBe('new  new  old');
        });
    });

    describe('. after visual mode', function () {
        it('. should repeat visual mode indent', async function () {
            await setupEditor('one\ntwo\nthree', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(50);
            await browser.keys(['V']);
            await browser.pause(30);
            await browser.keys(['>']);
            await browser.pause(300);
            await vimKeys('j');
            await vimKeys('.');
            const lines = (await getEditorValue()).split('\n');
            expect(
                lines[1]!.startsWith('\t') || lines[1]!.startsWith('  '),
            ).toBe(true);
        });
    });

    describe('Q (replay last macro)', function () {
        it('Q should replay last recorded macro', async function () {
            await setupEditor('line1\nline2\nline3\nline4', { line: 0, ch: 0 });
            await vimKeys('q', 'a');
            await vimKeys('d', 'd');
            await vimKeys('q');
            await vimKeys('Q');
            expect(await getEditorValue()).toBe('line3\nline4');
        });
    });

    describe('Neovim golden comparison', function () {
        before(async function () {
            await startNvim();
        });

        after(async function () {
            await stopNvim();
        });

        const suite = SUITES.find((s) => s.name === 'normal-editing');
        if (suite) {
            for (const tc of suite.cases) {
                testWithNeovim('normal-editing', tc.name, {
                    content: tc.content,
                    cursor: tc.cursor,
                    keys: [tc.keys],
                });
            }
        }
    });
});
