import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { setupEditor, vimKeys, getCursorPos } from '../../helpers';

describe('Normal mode — search and find (Tier 1)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await browser.keys(['Escape']);
        await browser.pause(50);
    });

    describe('f / F / t / T', function () {
        it('f should find char to the right', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await vimKeys('f', 'w');
            expect((await getCursorPos()).ch).toBe(6);
        });

        it('F should find char to the left', async function () {
            await setupEditor('hello world', { line: 0, ch: 10 });
            await vimKeys('F', 'o');
            expect((await getCursorPos()).ch).toBe(7);
        });

        it('t should move till before char to the right', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await vimKeys('t', 'w');
            expect((await getCursorPos()).ch).toBe(5);
        });

        it('T should move till after char to the left', async function () {
            await setupEditor('hello world', { line: 0, ch: 10 });
            await vimKeys('T', 'o');
            expect((await getCursorPos()).ch).toBe(8);
        });

        it('2f should find second occurrence', async function () {
            await setupEditor('abacada', { line: 0, ch: 0 });
            await vimKeys('2', 'f', 'a');
            expect((await getCursorPos()).ch).toBe(4);
        });
    });

    describe('; / ,', function () {
        it('; should repeat last f forward', async function () {
            await setupEditor('one two three two end', { line: 0, ch: 0 });
            await vimKeys('f', 't');
            const first = (await getCursorPos()).ch;
            await vimKeys(';');
            const second = (await getCursorPos()).ch;
            expect(second).toBeGreaterThan(first);
        });

        it(', should repeat last f in reverse', async function () {
            await setupEditor('aXbXcXd', { line: 0, ch: 0 });
            await vimKeys('f', 'X');
            await vimKeys(';');
            const pos = (await getCursorPos()).ch;
            await vimKeys(',');
            expect((await getCursorPos()).ch).toBeLessThan(pos);
        });
    });

    describe('/ and ? search', function () {
        it('/ should search forward', async function () {
            await setupEditor('aaa bbb ccc bbb ddd', { line: 0, ch: 0 });
            await browser.keys(['Escape']);
            await browser.pause(50);
            await browser.keys(['/']);
            await browser.pause(100);
            await browser.keys(['b', 'b', 'b']);
            await browser.keys(['Enter']);
            await browser.pause(300);
            const pos = await getCursorPos();
            expect(pos.ch).toBe(4);
        });

        it('n should repeat search forward', async function () {
            await vimKeys('n');
            const pos = await getCursorPos();
            expect(pos.ch).toBe(12);
        });

        it('N should repeat search backward', async function () {
            await vimKeys('N');
            const pos = await getCursorPos();
            expect(pos.ch).toBe(4);
        });
    });

    describe('* / #', function () {
        it('* should search word under cursor forward', async function () {
            await setupEditor('foo bar foo baz foo', { line: 0, ch: 0 });
            await vimKeys('*');
            const pos = await getCursorPos();
            expect(pos.ch).toBe(8);
        });

        it('# should search word under cursor backward', async function () {
            await setupEditor('foo bar foo baz foo', { line: 0, ch: 16 });
            await vimKeys('#');
            const pos = await getCursorPos();
            expect(pos.ch).toBe(8);
        });
    });

    describe('? (backward search)', function () {
        it('? should search backward', async function () {
            await setupEditor('aaa bbb ccc bbb ddd', { line: 0, ch: 18 });
            await browser.keys(['Escape']);
            await browser.pause(50);
            await browser.keys(['?']);
            await browser.pause(100);
            await browser.keys(['b', 'b', 'b']);
            await browser.keys(['Enter']);
            await browser.pause(300);
            const pos = await getCursorPos();
            expect(pos.ch).toBe(12);
        });
    });
});
