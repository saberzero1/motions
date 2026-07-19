import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    vimKeys,
    getEditorValue,
    sendVimEscape,
} from '../helpers';

describe('Extended text objects', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(50);
    });

    describe('Subword (iS/aS)', function () {
        it('diS on camelCaseWord at ch:6 should delete inner subword', async function () {
            await setupEditor('camelCaseWord', { line: 0, ch: 6 });
            await vimKeys('d', 'i', 'S');
            const content = await getEditorValue();
            expect(content).toBe('camelWord');
        });

        it('daS on snake_case_word at ch:7 should delete subword and separator', async function () {
            await setupEditor('snake_case_word', { line: 0, ch: 7 });
            await vimKeys('d', 'a', 'S');
            const content = await getEditorValue();
            expect(content).toBe('snake_word');
        });
    });

    describe('Number (in)', function () {
        it('din on integer should delete the number', async function () {
            await setupEditor('value = 42', { line: 0, ch: 9 });
            await vimKeys('d', 'i', 'n');
            const content = await getEditorValue();
            expect(content).toBe('value = ');
        });

        it('din on negative float should delete the number', async function () {
            await setupEditor('x = -3.14', { line: 0, ch: 5 });
            await vimKeys('d', 'i', 'n');
            const content = await getEditorValue();
            expect(content).toBe('x = ');
        });
    });

    describe('Any quote (iq/aq)', function () {
        it('diq should delete content inside quotes', async function () {
            await setupEditor('say "hello" end', { line: 0, ch: 7 });
            await vimKeys('d', 'i', 'q');
            const content = await getEditorValue();
            expect(content).toBe('say "" end');
        });

        it('daq should delete quotes and content', async function () {
            await setupEditor('say "hello" end', { line: 0, ch: 7 });
            await vimKeys('d', 'a', 'q');
            const content = await getEditorValue();
            expect(content).toBe('say  end');
        });
    });

    describe('Double bracket / wikilink (iD/aD)', function () {
        it('diD should delete content inside double brackets', async function () {
            await setupEditor('see [[link]] end', { line: 0, ch: 7 });
            await vimKeys('d', 'i', 'D');
            const content = await getEditorValue();
            expect(content).toBe('see [[]] end');
        });

        it('daD should delete entire double bracket pair', async function () {
            await setupEditor('see [[link]] end', { line: 0, ch: 7 });
            await vimKeys('d', 'a', 'D');
            const content = await getEditorValue();
            expect(content).toBe('see  end');
        });
    });

    describe('URL (gL)', function () {
        it('dgL should delete URL', async function () {
            await setupEditor('go https://x.com end', { line: 0, ch: 5 });
            await vimKeys('d', 'g', 'L');
            const content = await getEditorValue();
            expect(content).toBe('go  end');
        });
    });

    describe('Argument / comma (i,/a,)', function () {
        it('di, should delete inner argument', async function () {
            await setupEditor('fn(hello, world)', { line: 0, ch: 5 });
            await vimKeys('d', 'i', ',');
            const content = await getEditorValue();
            expect(content).toBe('fn(, world)');
        });

        it('da, should delete argument with separator', async function () {
            await setupEditor('fn(hello, world)', { line: 0, ch: 5 });
            await vimKeys('d', 'a', ',');
            const content = await getEditorValue();
            expect(content).toBe('fn(world)');
        });
    });
});
