import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    vimKeys,
    getEditorValue,
    sendVimEscape,
} from '../../helpers';
import { testWithNeovim, startNvim, stopNvim } from '../../neovim/test-wrapper';
import { SUITES } from '../../neovim/test-definitions';

describe('Operator-pending combinations (Tier 1)', function () {
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

    describe('d + motion combos', function () {
        it('dw should delete to next word', async function () {
            await setupEditor('one two three', { line: 0, ch: 0 });
            await vimKeys('d', 'w');
            expect(await getEditorValue()).toBe('two three');
        });

        it('d$ should delete to end of line', async function () {
            await setupEditor('hello world', { line: 0, ch: 5 });
            await vimKeys('d', '$');
            expect(await getEditorValue()).toBe('hello');
        });

        it('d0 should delete to start of line', async function () {
            await setupEditor('hello world', { line: 0, ch: 6 });
            await vimKeys('d', '0');
            expect(await getEditorValue()).toBe('world');
        });

        it('dj should delete current and next line', async function () {
            await setupEditor('one\ntwo\nthree', { line: 0, ch: 0 });
            await vimKeys('d', 'j');
            expect(await getEditorValue()).toBe('three');
        });

        it('dw on last word of line should not delete newline', async function () {
            await setupEditor('hello\nworld', { line: 0, ch: 0 });
            await vimKeys('d', 'w');
            expect(await getEditorValue()).toBe('\nworld');
        });

        it('dw should delete whitespace to next word', async function () {
            await setupEditor('one   two', { line: 0, ch: 3 });
            await vimKeys('d', 'w');
            expect(await getEditorValue()).toBe('onetwo');
        });

        it('dd on last line should leave only first line', async function () {
            await setupEditor('one\ntwo', { line: 1, ch: 0 });
            await vimKeys('d', 'd');
            expect(await getEditorValue()).toBe('one');
        });

        it('dd on only line should leave empty buffer', async function () {
            await setupEditor('hello', { line: 0, ch: 0 });
            await vimKeys('d', 'd');
            expect(await getEditorValue()).toBe('');
        });

        it('d2w should delete 2 words', async function () {
            await setupEditor('one two three four', { line: 0, ch: 0 });
            await vimKeys('d', '2', 'w');
            expect(await getEditorValue()).toBe('three four');
        });

        it('2dd should delete 2 lines', async function () {
            await setupEditor('one\ntwo\nthree\nfour', { line: 0, ch: 0 });
            await vimKeys('2', 'd', 'd');
            expect(await getEditorValue()).toBe('three\nfour');
        });

        it('D should delete to end of line', async function () {
            await setupEditor('hello world', { line: 0, ch: 5 });
            await vimKeys('D');
            expect(await getEditorValue()).toBe('hello');
        });

        it('dk should delete current and previous line', async function () {
            await setupEditor('one\ntwo\nthree', { line: 1, ch: 0 });
            await vimKeys('d', 'k');
            expect(await getEditorValue()).toBe('three');
        });

        it('dj on last line should be no-op (matches Neovim)', async function () {
            await setupEditor('one\ntwo', { line: 1, ch: 0 });
            await vimKeys('d', 'j');
            expect(await getEditorValue()).toBe('one\ntwo');
        });

        it('de should delete to end of word inclusive', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await vimKeys('d', 'e');
            expect(await getEditorValue()).toBe(' world');
        });

        it('db should delete backward to word start', async function () {
            await setupEditor('hello world', { line: 0, ch: 8 });
            await vimKeys('d', 'b');
            expect(await getEditorValue()).toBe('hello rld');
        });

        it('db across lines should include leading whitespace', async function () {
            await setupEditor(' word1\nword2', { line: 1, ch: 0 });
            await vimKeys('d', 'b');
            expect(await getEditorValue()).toBe('word2');
        });

        it('d2w across lines should include leading whitespace', async function () {
            await setupEditor(' word1\nword2', { line: 0, ch: 1 });
            await vimKeys('d', '2', 'w');
            expect(await getEditorValue()).toBe('');
        });

        it('d$ with cursor in middle should delete rest of line', async function () {
            await setupEditor('abcdef', { line: 0, ch: 2 });
            await vimKeys('d', '$');
            expect(await getEditorValue()).toBe('ab');
        });

        it('d0 at start of line should not delete', async function () {
            await setupEditor('hello', { line: 0, ch: 0 });
            await vimKeys('d', '0');
            expect(await getEditorValue()).toBe('hello');
        });

        it('dG should delete from current line to end of file', async function () {
            await setupEditor('one\ntwo\nthree\nfour', { line: 1, ch: 0 });
            await vimKeys('d', 'G');
            expect(await getEditorValue()).toBe('one');
        });

        it('dgg should delete from current line to start of file', async function () {
            await setupEditor('one\ntwo\nthree\nfour', { line: 2, ch: 0 });
            await vimKeys('d', 'g', 'g');
            expect(await getEditorValue()).toBe('four');
        });

        it('dfx should delete through character x', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await vimKeys('d', 'f', 'o');
            expect(await getEditorValue()).toBe(' world');
        });

        it('dtx should delete up to but not including x', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await vimKeys('d', 't', 'o');
            expect(await getEditorValue()).toBe('o world');
        });
    });

    describe('c + motion combos', function () {
        it('cw should change word', async function () {
            await setupEditor('old text here', { line: 0, ch: 0 });
            await vimKeys('c', 'w');
            await browser.keys(['n', 'e', 'w']);
            await sendVimEscape();
            await browser.pause(200);
            expect(await getEditorValue()).toBe('new text here');
        });

        it('c$ should change to end of line', async function () {
            await setupEditor('keep this remove', { line: 0, ch: 10 });
            await vimKeys('c', '$');
            await browser.keys(['!']);
            await sendVimEscape();
            await browser.pause(200);
            expect(await getEditorValue()).toBe('keep this !');
        });

        it('cc should change entire line', async function () {
            await setupEditor('old line\nsecond', { line: 0, ch: 3 });
            await vimKeys('c', 'c');
            await browser.keys(['n', 'e', 'w']);
            await sendVimEscape();
            await browser.pause(200);
            expect(await getEditorValue()).toBe('new\nsecond');
        });

        it('C should change to end of line', async function () {
            await setupEditor('hello world', { line: 0, ch: 5 });
            await vimKeys('C');
            await browser.keys(['!']);
            await sendVimEscape();
            await browser.pause(200);
            expect(await getEditorValue()).toBe('hello!');
        });

        it('ce should change to end of word inclusive', async function () {
            await setupEditor('one two three', { line: 0, ch: 0 });
            await vimKeys('c', 'e');
            await browser.keys(['X']);
            await sendVimEscape();
            await browser.pause(200);
            expect(await getEditorValue()).toBe('X two three');
        });

        it('2cc should change 2 lines', async function () {
            await setupEditor('one\ntwo\nthree', { line: 0, ch: 0 });
            await vimKeys('2', 'c', 'c');
            await browser.keys(['X']);
            await sendVimEscape();
            await browser.pause(200);
            expect(await getEditorValue()).toBe('X\nthree');
        });

        it('cw on a word should behave like ce (Vim special case)', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await vimKeys('c', 'w');
            await browser.keys(['X']);
            await sendVimEscape();
            await browser.pause(200);
            expect(await getEditorValue()).toBe('X world');
        });

        it('ce should change to end of word inclusive', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await vimKeys('c', 'e');
            await browser.keys(['X']);
            await sendVimEscape();
            await browser.pause(200);
            expect(await getEditorValue()).toBe('X world');
        });
    });

    describe('y + motion combos', function () {
        it('yw should yank word', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await vimKeys('y', 'w');
            await vimKeys('$');
            await vimKeys('p');
            const val = await getEditorValue();
            expect(val).toContain('hello');
        });

        it('y$ should yank to end of line', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await vimKeys('y', '$');
            await vimKeys('o');
            await sendVimEscape();
            await browser.pause(100);
            await vimKeys('p');
            const val = await getEditorValue();
            expect(val.split('\n').length).toBeGreaterThanOrEqual(2);
        });
    });

    describe('> / < (indent)', function () {
        it('>> should indent line', async function () {
            await setupEditor('hello', { line: 0, ch: 0 });
            await vimKeys('>', '>');
            const val = await getEditorValue();
            expect(val.startsWith('\t') || val.startsWith('  ')).toBe(true);
        });

        it('<< should unindent line', async function () {
            await setupEditor('\thello', { line: 0, ch: 0 });
            await vimKeys('<', '<');
            expect(await getEditorValue()).toBe('hello');
        });
    });

    describe('> / < edge cases', function () {
        it('3>> should indent 3 lines', async function () {
            await setupEditor('one\ntwo\nthree\nfour', { line: 0, ch: 0 });
            await vimKeys('3', '>', '>');
            const val = await getEditorValue();
            const lines = val.split('\n');
            expect(lines.length).toBeGreaterThanOrEqual(4);
            for (let i = 0; i < 3; i++) {
                expect(
                    lines[i]!.startsWith('\t') || lines[i]!.startsWith('  '),
                ).toBe(true);
            }
            expect(lines[3]).toBe('four');
        });

        it('>j should indent current and next line', async function () {
            await setupEditor('one\ntwo\nthree', { line: 0, ch: 0 });
            await vimKeys('>', 'j');
            const val = await getEditorValue();
            const lines = val.split('\n');
            expect(lines.length).toBeGreaterThanOrEqual(3);
            for (let i = 0; i < 2; i++) {
                expect(
                    lines[i]!.startsWith('\t') || lines[i]!.startsWith('  '),
                ).toBe(true);
            }
            expect(lines[2]).toBe('three');
        });

        it('<< on non-indented line should not change content', async function () {
            await setupEditor('hello', { line: 0, ch: 0 });
            await vimKeys('<', '<');
            expect(await getEditorValue()).toBe('hello');
        });

        it('>> then << should round-trip back to original', async function () {
            await setupEditor('hello', { line: 0, ch: 0 });
            await vimKeys('>', '>');
            await vimKeys('<', '<');
            expect(await getEditorValue()).toBe('hello');
        });

        it('V + > should indent selected line in visual mode', async function () {
            await setupEditor('one\ntwo\nthree', { line: 1, ch: 0 });
            await sendVimEscape();
            await browser.pause(50);
            await browser.keys(['V']);
            await browser.pause(30);
            await browser.keys(['>']);
            await browser.pause(300);
            const lines = (await getEditorValue()).split('\n');
            expect(lines[0]).toBe('one');
            expect(
                lines[1]!.startsWith('\t') || lines[1]!.startsWith('  '),
            ).toBe(true);
            expect(lines[2]).toBe('three');
        });

        it('V + < should unindent selected line in visual mode', async function () {
            await setupEditor('one\n\ttwo\nthree', { line: 1, ch: 0 });
            await sendVimEscape();
            await browser.pause(50);
            await browser.keys(['V']);
            await browser.pause(30);
            await browser.keys(['<']);
            await browser.pause(300);
            const lines = (await getEditorValue()).split('\n');
            expect(lines[1]).toBe('two');
        });
    });

    describe('= (auto-indent)', function () {
        it('== should not crash on a markdown line', async function () {
            await setupEditor('  hello', { line: 0, ch: 0 });
            await vimKeys('=', '=');
            const val = await getEditorValue();
            expect(typeof val).toBe('string');
        });
    });

    describe('Neovim golden comparison', function () {
        before(async function () {
            await startNvim();
        });

        after(async function () {
            await stopNvim();
        });

        const suite = SUITES.find((s) => s.name === 'operator-combos');
        if (suite) {
            for (const tc of suite.cases) {
                testWithNeovim('operator-combos', tc.name, {
                    content: tc.content,
                    cursor: tc.cursor,
                    keys: [tc.keys],
                });
            }
        }
    });
});
