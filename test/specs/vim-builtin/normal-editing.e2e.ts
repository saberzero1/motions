import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    vimKeys,
    getEditorValue,
    getCursorPos,
} from '../../helpers';

describe('Normal mode — editing commands (Tier 1)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await browser.keys(['Escape']);
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
            await browser.keys(['Escape']);
            await browser.pause(200);
            expect(await getEditorValue()).toBe('new\nkeep this');
        });

        it('C should change to end of line', async function () {
            await setupEditor('hello world', { line: 0, ch: 5 });
            await vimKeys('C');
            await browser.keys(['!']);
            await browser.keys(['Escape']);
            await browser.pause(200);
            expect(await getEditorValue()).toBe('hello!');
        });

        it('cw should change word', async function () {
            await setupEditor('old new end', { line: 0, ch: 0 });
            await vimKeys('c', 'w');
            await browser.keys(['r', 'e', 'p']);
            await browser.keys(['Escape']);
            await browser.pause(200);
            expect(await getEditorValue()).toBe('rep new end');
        });
    });

    describe('s / S', function () {
        it('s should substitute char and enter insert', async function () {
            await setupEditor('abcde', { line: 0, ch: 2 });
            await vimKeys('s');
            await browser.keys(['X']);
            await browser.keys(['Escape']);
            await browser.pause(200);
            expect(await getEditorValue()).toBe('abXde');
        });

        it('S should substitute entire line', async function () {
            await setupEditor('old line\nkeep', { line: 0, ch: 3 });
            await vimKeys('S');
            await browser.keys(['n', 'e', 'w']);
            await browser.keys(['Escape']);
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
            await browser.keys(['Escape']);
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
});
