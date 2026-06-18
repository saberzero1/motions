import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { setupEditor, vimKeys, getEditorValue } from '../../helpers';

describe('Normal mode — insert entry commands (Tier 1)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await browser.keys(['Escape']);
        await browser.pause(50);
    });

    describe('i / a', function () {
        it('i should insert text before cursor', async function () {
            await setupEditor('hello', { line: 0, ch: 2 });
            await vimKeys('i');
            await browser.keys(['X']);
            await browser.keys(['Escape']);
            await browser.pause(200);
            expect(await getEditorValue()).toBe('heXllo');
        });

        it('a should insert text after cursor', async function () {
            await setupEditor('hello', { line: 0, ch: 2 });
            await vimKeys('a');
            await browser.keys(['X']);
            await browser.keys(['Escape']);
            await browser.pause(200);
            expect(await getEditorValue()).toBe('helXlo');
        });
    });

    describe('I / A', function () {
        it('I should insert at first non-blank', async function () {
            await setupEditor('  hello', { line: 0, ch: 4 });
            await vimKeys('I');
            await browser.keys(['X']);
            await browser.keys(['Escape']);
            await browser.pause(200);
            expect(await getEditorValue()).toBe('  Xhello');
        });

        it('A should append at end of line', async function () {
            await setupEditor('hello', { line: 0, ch: 0 });
            await vimKeys('A');
            await browser.keys(['!']);
            await browser.keys(['Escape']);
            await browser.pause(200);
            expect(await getEditorValue()).toBe('hello!');
        });
    });

    describe('o / O', function () {
        it('o should open line below and enter insert', async function () {
            await setupEditor('line1\nline2', { line: 0, ch: 0 });
            await vimKeys('o');
            await browser.keys(['n', 'e', 'w']);
            await browser.keys(['Escape']);
            await browser.pause(200);
            expect(await getEditorValue()).toBe('line1\nnew\nline2');
        });

        it('O should open line above and enter insert', async function () {
            await setupEditor('line1\nline2', { line: 1, ch: 0 });
            await vimKeys('O');
            await browser.keys(['n', 'e', 'w']);
            await browser.keys(['Escape']);
            await browser.pause(200);
            expect(await getEditorValue()).toBe('line1\nnew\nline2');
        });
    });
});
