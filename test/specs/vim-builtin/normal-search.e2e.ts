import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    vimKeys,
    getCursorPos,
    sendVimEscape,
} from '../../helpers';
import { testWithNeovim, startNvim, stopNvim } from '../../neovim/test-wrapper';
import { SUITES } from '../../neovim/test-definitions';

describe('Normal mode — search and find (Tier 1)', function () {
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

    const suite = SUITES.find((s) => s.name === 'normal-search');
    if (suite) {
        for (const tc of suite.cases) {
            testWithNeovim('normal-search', tc.name, {
                content: tc.content,
                cursor: tc.cursor,
                keys: [tc.keys],
            });
        }
    }

    describe('[obsidian] ; / ,', function () {
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

        it('; should repeat t forward (stopping before char)', async function () {
            await setupEditor('aXbXcXd', { line: 0, ch: 0 });
            await vimKeys('t', 'X');
            expect((await getCursorPos()).ch).toBe(0);
            await vimKeys(';');
            expect((await getCursorPos()).ch).toBe(2);
        });

        it(', should reverse T direction', async function () {
            await setupEditor('aXbXcXd', { line: 0, ch: 6 });
            await vimKeys('T', 'X');
            expect((await getCursorPos()).ch).toBe(6);
            await vimKeys(',');
            const pos = await getCursorPos();
            expect(pos.ch).toBeLessThanOrEqual(6);
        });
    });

    describe('/ and ? search', function () {
        it('/ should search forward', async function () {
            await setupEditor('aaa bbb ccc bbb ddd', { line: 0, ch: 0 });
            await sendVimEscape();
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

    describe('n/N wrap around', function () {
        // BUG: n/N wrap-around assertion unreliable — search lands on unexpected occurrence depending on CM Vim's incsearch state
        it.skip('n should wrap to start when reaching end', async function () {
            await setupEditor('foo bar foo baz', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(50);
            await browser.keys(['/']);
            await browser.pause(100);
            await browser.keys(['f', 'o', 'o']);
            await browser.keys(['Enter']);
            await browser.pause(300);
            await vimKeys('n');
            const pos1 = await getCursorPos();
            await vimKeys('n');
            const pos2 = await getCursorPos();
            expect(pos2.ch).toBeLessThanOrEqual(pos1.ch);
        });
    });

    describe('* / # edge cases', function () {
        it('* on last occurrence should wrap to first', async function () {
            await setupEditor('cat dog cat', { line: 0, ch: 8 });
            await vimKeys('*');
            expect((await getCursorPos()).ch).toBe(0);
        });

        it('# on first occurrence should wrap to last', async function () {
            await setupEditor('cat dog cat', { line: 0, ch: 0 });
            await vimKeys('#');
            expect((await getCursorPos()).ch).toBe(8);
        });
    });

    describe('? (backward search)', function () {
        it('? should search backward', async function () {
            await setupEditor('aaa bbb ccc bbb ddd', { line: 0, ch: 18 });
            await sendVimEscape();
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
