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

describe('Built-in ex commands (Tier 1)', function () {
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

    const suite = SUITES.find((s) => s.name === 'ex-commands-builtin');
    if (suite) {
        for (const tc of suite.cases) {
            testWithNeovim('ex-commands-builtin', tc.name, {
                content: tc.content,
                cursor: tc.cursor,
                keys: [tc.keys],
            });
        }
    }

    describe(':s (substitute)', function () {
        it(':s/old/new/ should replace first occurrence on line', async function () {
            await setupEditor('old old old', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(50);
            await browser.keys([':']);
            await browser.pause(100);
            await browser.keys([
                's',
                '/',
                'o',
                'l',
                'd',
                '/',
                'n',
                'e',
                'w',
                '/',
            ]);
            await browser.keys(['Enter']);
            await browser.pause(300);
            expect(await getEditorValue()).toBe('new old old');
        });

        it(':s/old/new/g should replace all on line', async function () {
            await setupEditor('old old old', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(50);
            await browser.keys([':']);
            await browser.pause(100);
            await browser.keys([
                's',
                '/',
                'o',
                'l',
                'd',
                '/',
                'n',
                'e',
                'w',
                '/',
                'g',
            ]);
            await browser.keys(['Enter']);
            await browser.pause(300);
            expect(await getEditorValue()).toBe('new new new');
        });
    });

    describe(':sort', function () {
        it(':sort should sort lines', async function () {
            await setupEditor('cherry\napple\nbanana', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(50);
            await browser.keys([':']);
            await browser.pause(100);
            await browser.keys(['s', 'o', 'r', 't']);
            await browser.keys(['Enter']);
            await browser.pause(300);
            expect(await getEditorValue()).toBe('apple\nbanana\ncherry');
        });
    });

    describe(':d (delete lines)', function () {
        it(':d should delete current line', async function () {
            await setupEditor('one\ntwo\nthree', { line: 1, ch: 0 });
            await sendVimEscape();
            await browser.pause(50);
            await browser.keys([':']);
            await browser.pause(100);
            await browser.keys(['d']);
            await browser.keys(['Enter']);
            await browser.pause(300);
            expect(await getEditorValue()).toBe('one\nthree');
        });
    });
});
