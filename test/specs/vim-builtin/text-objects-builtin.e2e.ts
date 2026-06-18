import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { setupEditor, vimKeys, getEditorValue } from '../../helpers';

describe('Built-in text objects (Tier 1)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await browser.keys(['Escape']);
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
            expect(await getEditorValue()).toBe('say  end');
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
});
