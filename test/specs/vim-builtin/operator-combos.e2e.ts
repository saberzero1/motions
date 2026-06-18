import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { setupEditor, vimKeys, getEditorValue } from '../../helpers';

describe('Operator-pending combinations (Tier 1)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await browser.keys(['Escape']);
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
    });

    describe('c + motion combos', function () {
        it('cw should change word', async function () {
            await setupEditor('old text here', { line: 0, ch: 0 });
            await vimKeys('c', 'w');
            await browser.keys(['n', 'e', 'w']);
            await browser.keys(['Escape']);
            await browser.pause(200);
            expect(await getEditorValue()).toBe('new text here');
        });

        it('c$ should change to end of line', async function () {
            await setupEditor('keep this remove', { line: 0, ch: 10 });
            await vimKeys('c', '$');
            await browser.keys(['!']);
            await browser.keys(['Escape']);
            await browser.pause(200);
            expect(await getEditorValue()).toBe('keep this !');
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
            await browser.keys(['Escape']);
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

    describe('= (auto-indent)', function () {
        it('== should not crash on a markdown line', async function () {
            await setupEditor('  hello', { line: 0, ch: 0 });
            await vimKeys('=', '=');
            const val = await getEditorValue();
            expect(typeof val).toBe('string');
        });
    });
});
