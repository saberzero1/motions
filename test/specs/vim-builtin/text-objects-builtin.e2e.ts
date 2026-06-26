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

describe('Built-in text objects (Tier 1)', function () {
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

    describe('iw / aw (word)', function () {
        it('diw should delete inner word', async function () {
            await setupEditor('hello world foo', { line: 0, ch: 8 });
            await vimKeys('d', 'i', 'w');
            expect(await getEditorValue()).toBe('hello  foo');
        });

        it('daw should delete a word with space', async function () {
            await setupEditor('hello world foo', { line: 0, ch: 6 });
            await vimKeys('d', 'a', 'w');
            expect(await getEditorValue()).toBe('hello foo');
        });
    });

    describe('iw / aw edge cases', function () {
        it('diw with cursor on whitespace should delete whitespace', async function () {
            await setupEditor('hello   world', { line: 0, ch: 6 });
            await vimKeys('d', 'i', 'w');
            expect(await getEditorValue()).toBe('helloworld');
        });

        it('daw at end of line should delete trailing space', async function () {
            await setupEditor('hello world', { line: 0, ch: 6 });
            await vimKeys('d', 'a', 'w');
            expect(await getEditorValue()).toBe('hello');
        });

        it('ciw should change word and enter insert mode', async function () {
            await setupEditor('old text here', { line: 0, ch: 0 });
            await vimKeys('c', 'i', 'w');
            await browser.keys(['n', 'e', 'w']);
            await sendVimEscape();
            await browser.pause(200);
            expect(await getEditorValue()).toBe('new text here');
        });

        it('yiw should yank word without spaces', async function () {
            await setupEditor('hello world', { line: 0, ch: 7 });
            await vimKeys('y', 'i', 'w');
            await vimKeys('0');
            await vimKeys('P');
            const val = await getEditorValue();
            expect(val).toBe('worldhello world');
        });
    });

    describe('iW / aW (WORD)', function () {
        it('diW should delete inner WORD', async function () {
            await setupEditor('hello foo-bar baz', { line: 0, ch: 8 });
            await vimKeys('d', 'i', 'W');
            expect(await getEditorValue()).toBe('hello  baz');
        });

        it('daW should delete a WORD with space', async function () {
            await setupEditor('hello foo-bar baz', { line: 0, ch: 6 });
            await vimKeys('d', 'a', 'W');
            expect(await getEditorValue()).toBe('hello baz');
        });
    });

    describe('iW / aW edge cases', function () {
        it('diW should delete WORD with mixed punctuation', async function () {
            await setupEditor('hello foo.bar,baz end', { line: 0, ch: 10 });
            await vimKeys('d', 'i', 'W');
            expect(await getEditorValue()).toBe('hello  end');
        });

        it('daW should delete WORD including surrounding space', async function () {
            await setupEditor('hello foo.bar end', { line: 0, ch: 8 });
            await vimKeys('d', 'a', 'W');
            expect(await getEditorValue()).toBe('hello end');
        });
    });

    describe('is / as (sentence)', function () {
        it('dis should delete inner sentence', async function () {
            await setupEditor('First sentence. Second one. Third.', {
                line: 0,
                ch: 20,
            });
            await vimKeys('d', 'i', 's');
            const val = await getEditorValue();
            expect(val).not.toContain('Second one.');
        });
    });

    describe('is / as edge cases', function () {
        it('dis at paragraph boundary should delete sentence', async function () {
            await setupEditor('End of para.\n\nStart new.', {
                line: 0,
                ch: 0,
            });
            await vimKeys('d', 'i', 's');
            const val = await getEditorValue();
            expect(val).not.toContain('End of para.');
        });
    });

    describe('ip / ap (paragraph)', function () {
        it('dip should delete inner paragraph', async function () {
            await setupEditor('para one\nstill one\n\npara two', {
                line: 0,
                ch: 0,
            });
            await vimKeys('d', 'i', 'p');
            const val = await getEditorValue();
            expect(val).toContain('para two');
            expect(val).not.toContain('para one');
        });

        it('dap should delete paragraph with trailing blank', async function () {
            await setupEditor('para one\nstill one\n\npara two', {
                line: 0,
                ch: 0,
            });
            await vimKeys('d', 'a', 'p');
            expect(await getEditorValue()).toBe('para two');
        });
    });

    describe('i" / a" (double quote)', function () {
        it('di" should delete inside double quotes', async function () {
            await setupEditor('say "hello world" end', { line: 0, ch: 8 });
            await vimKeys('d', 'i', '"');
            expect(await getEditorValue()).toBe('say "" end');
        });

        it('da" should delete including quotes', async function () {
            await setupEditor('say "hello world" end', { line: 0, ch: 8 });
            await vimKeys('d', 'a', '"');
            expect(await getEditorValue()).toBe('say end');
        });
    });

    describe('i" / a" edge cases', function () {
        it('di" should handle escaped quotes inside', async function () {
            await setupEditor('say "he said \\"hi\\"" end', {
                line: 0,
                ch: 8,
            });
            await vimKeys('d', 'i', '"');
            const val = await getEditorValue();
            expect(val).toContain('""');
        });
    });

    describe('d2aw (text object with count)', function () {
        it('d2aw should delete 2 words with surrounding space', async function () {
            await setupEditor('one two three four', { line: 0, ch: 4 });
            await vimKeys('d', '2', 'a', 'w');
            expect(await getEditorValue()).toBe('one four');
        });
    });

    describe("i' / a' (single quote)", function () {
        it("di' should delete inside single quotes", async function () {
            await setupEditor("say 'hello' end", { line: 0, ch: 6 });
            await vimKeys('d', 'i', "'");
            expect(await getEditorValue()).toBe("say '' end");
        });
    });

    describe('i( / a( (parentheses)', function () {
        it('di( should delete inside parens', async function () {
            await setupEditor('call(arg1, arg2)', { line: 0, ch: 8 });
            await vimKeys('d', 'i', '(');
            expect(await getEditorValue()).toBe('call()');
        });

        it('da( should delete including parens', async function () {
            await setupEditor('call(arg1, arg2) end', { line: 0, ch: 8 });
            await vimKeys('d', 'a', '(');
            expect(await getEditorValue()).toBe('call end');
        });
    });

    describe('i( / a( edge cases', function () {
        it('di( with nested parens should delete innermost', async function () {
            await setupEditor('(outer (inner) more)', { line: 0, ch: 10 });
            await vimKeys('d', 'i', '(');
            expect(await getEditorValue()).toBe('(outer () more)');
        });

        it('di( across lines should delete contents (preserves bracket lines)', async function () {
            await setupEditor('(\nhello\n)', { line: 1, ch: 0 });
            await vimKeys('d', 'i', '(');
            expect(await getEditorValue()).toBe('(\n)');
        });

        it('di( with empty parens should not change', async function () {
            await setupEditor('call()', { line: 0, ch: 4 });
            await vimKeys('d', 'i', '(');
            expect(await getEditorValue()).toBe('call()');
        });
    });

    describe('i[ / a[ (square brackets)', function () {
        it('di[ should delete inside brackets', async function () {
            await setupEditor('arr[1, 2, 3]', { line: 0, ch: 6 });
            await vimKeys('d', 'i', '[');
            expect(await getEditorValue()).toBe('arr[]');
        });
    });

    describe('i{ / a{ (curly braces)', function () {
        it('di{ should delete inside braces', async function () {
            await setupEditor('obj{ key: val }', { line: 0, ch: 8 });
            await vimKeys('d', 'i', '{');
            expect(await getEditorValue()).toBe('obj{}');
        });

        it('da{ should delete including braces', async function () {
            await setupEditor('obj{ key: val } end', { line: 0, ch: 8 });
            await vimKeys('d', 'a', '{');
            expect(await getEditorValue()).toBe('obj end');
        });
    });

    describe('i{ / a{ edge cases', function () {
        it('di{ with nested braces should delete innermost', async function () {
            await setupEditor('{ outer { inner } more }', {
                line: 0,
                ch: 12,
            });
            await vimKeys('d', 'i', '{');
            expect(await getEditorValue()).toBe('{ outer {} more }');
        });
    });

    describe('multiline inner bracket (Neovim parity)', function () {
        it('di{ across lines should preserve bracket lines', async function () {
            await setupEditor('a{\n\tbar\n}b', { line: 1, ch: 1 });
            await vimKeys('d', 'i', '{');
            expect(await getEditorValue()).toBe('a{\n}b');
        });

        it('di[ across lines should preserve bracket lines', async function () {
            await setupEditor('a[\n\tcontent\n]b', { line: 1, ch: 1 });
            await vimKeys('d', 'i', '[');
            expect(await getEditorValue()).toBe('a[\n]b');
        });

        it('di< across lines should preserve bracket lines', async function () {
            await setupEditor('a<\n\tcontent\n>b', { line: 1, ch: 1 });
            await vimKeys('d', 'i', '<');
            expect(await getEditorValue()).toBe('a<\n>b');
        });

        it('di{ on same line should still collapse', async function () {
            await setupEditor('a{ hello }b', { line: 0, ch: 5 });
            await vimKeys('d', 'i', '{');
            expect(await getEditorValue()).toBe('a{}b');
        });

        it('di[ on same line should still collapse', async function () {
            await setupEditor('a[ hello ]b', { line: 0, ch: 5 });
            await vimKeys('d', 'i', '[');
            expect(await getEditorValue()).toBe('a[]b');
        });
    });

    describe('i[ / a[ edge cases', function () {
        it('di[ with nested brackets should delete innermost', async function () {
            await setupEditor('[outer [inner] more]', { line: 0, ch: 10 });
            await vimKeys('d', 'i', '[');
            expect(await getEditorValue()).toBe('[outer [] more]');
        });
    });

    describe('i< / a< (angle brackets)', function () {
        it('di< should delete inside angle brackets', async function () {
            await setupEditor('tag<content>end', { line: 0, ch: 6 });
            await vimKeys('d', 'i', '<');
            expect(await getEditorValue()).toBe('tag<>end');
        });
    });

    describe('it / at (tag)', function () {
        it('dit should delete inside HTML tag', async function () {
            await setupEditor('<div>content</div>', { line: 0, ch: 7 });
            await vimKeys('d', 'i', 't');
            expect(await getEditorValue()).toBe('<div></div>');
        });

        it('dat should delete entire tag', async function () {
            await setupEditor('before<div>content</div>after', {
                line: 0,
                ch: 12,
            });
            await vimKeys('d', 'a', 't');
            expect(await getEditorValue()).toBe('beforeafter');
        });

        it('dit should work with multiline tags', async function () {
            await setupEditor('<details>\ninner content\n</details>', {
                line: 1,
                ch: 0,
            });
            await vimKeys('d', 'i', 't');
            expect(await getEditorValue()).toBe('<details></details>');
        });

        it('dit should work with self-nesting tags', async function () {
            await setupEditor('<div>outer<div>inner</div>more</div>', {
                line: 0,
                ch: 15,
            });
            await vimKeys('d', 'i', 't');
            expect(await getEditorValue()).toBe(
                '<div>outer<div></div>more</div>',
            );
        });
    });

    describe('Neovim golden comparison', function () {
        before(async function () {
            await startNvim();
        });

        after(async function () {
            await stopNvim();
        });

        const suite = SUITES.find((s) => s.name === 'text-objects-builtin');
        if (suite) {
            for (const tc of suite.cases) {
                testWithNeovim('text-objects-builtin', tc.name, {
                    content: tc.content,
                    cursor: tc.cursor,
                    keys: [tc.keys],
                });
            }
        }
    });
});
