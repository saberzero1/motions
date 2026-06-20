import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    vimKeys,
    getCursorPos,
    getEditorValue,
} from '../../helpers';
import { testWithNeovim, startNvim, stopNvim } from '../../neovim/test-wrapper';
import { SUITES } from '../../neovim/test-definitions';

describe('Normal mode — g-prefix commands (Tier 1)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await startNvim();
    });

    after(async function () {
        await stopNvim();
    });

    afterEach(async function () {
        await browser.keys(['Escape']);
        await browser.pause(50);
    });

    const suite = SUITES.find((s) => s.name === 'g-commands');
    if (suite) {
        for (const tc of suite.cases) {
            testWithNeovim('g-commands', tc.name, {
                content: tc.content,
                cursor: tc.cursor,
                keys: [tc.keys],
            });
        }
    }

    describe('gj / gk (display lines)', function () {
        it('gj should move one display line down', async function () {
            await setupEditor('short\nline two', { line: 0, ch: 0 });
            await vimKeys('g', 'j');
            expect((await getCursorPos()).line).toBe(1);
        });

        it('gk should move one display line up', async function () {
            await setupEditor('line one\nshort', { line: 1, ch: 0 });
            await vimKeys('g', 'k');
            expect((await getCursorPos()).line).toBe(0);
        });
    });

    describe('g0 / g$ / g^', function () {
        it('g0 should move to start of display line', async function () {
            await setupEditor('hello world', { line: 0, ch: 5 });
            await vimKeys('g', '0');
            expect((await getCursorPos()).ch).toBe(0);
        });

        it('g$ should move to end of display line', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await vimKeys('g', '$');
            expect((await getCursorPos()).ch).toBe(10);
        });
    });

    describe('gu / gU / g~', function () {
        it('guu should lowercase entire line', async function () {
            await setupEditor('HELLO WORLD', { line: 0, ch: 0 });
            await vimKeys('g', 'u', 'u');
            expect(await getEditorValue()).toBe('hello world');
        });

        it('gUU should uppercase entire line', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await vimKeys('g', 'U', 'U');
            expect(await getEditorValue()).toBe('HELLO WORLD');
        });

        it('guw should lowercase word', async function () {
            await setupEditor('HELLO world', { line: 0, ch: 0 });
            await vimKeys('g', 'u', 'w');
            expect(await getEditorValue()).toBe('hello world');
        });

        it('gUw should uppercase word', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await vimKeys('g', 'U', 'w');
            expect(await getEditorValue()).toBe('HELLO world');
        });

        it('g~~ should toggle case of line', async function () {
            await setupEditor('Hello World', { line: 0, ch: 0 });
            await vimKeys('g', '~', '~');
            expect(await getEditorValue()).toBe('hELLO wORLD');
        });
    });

    describe('gI / gJ', function () {
        it('gI should insert at column 0', async function () {
            await setupEditor('  hello', { line: 0, ch: 4 });
            await vimKeys('g', 'I');
            await browser.keys(['X']);
            await browser.keys(['Escape']);
            await browser.pause(200);
            expect(await getEditorValue()).toBe('X  hello');
        });

        it('gJ should join lines without space', async function () {
            await setupEditor('hello\nworld', { line: 0, ch: 0 });
            await vimKeys('g', 'J');
            expect(await getEditorValue()).toBe('helloworld');
        });
    });

    describe('gv', function () {
        it('gv should reselect last visual selection', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await browser.keys(['Escape']);
            await browser.pause(50);
            await browser.keys(['v']);
            await browser.pause(30);
            await browser.keys(['e']);
            await browser.pause(30);
            await browser.keys(['Escape']);
            await browser.pause(100);
            await browser.keys(['g']);
            await browser.pause(30);
            await browser.keys(['v']);
            await browser.pause(30);
            await browser.keys(['d']);
            await browser.pause(300);
            expect(await getEditorValue()).toBe(' world');
        });
    });

    describe('gn / gN (search and select)', function () {
        it('gn should select next search match', async function () {
            await setupEditor('foo bar foo baz foo', { line: 0, ch: 0 });
            await browser.keys(['Escape']);
            await browser.pause(50);
            await browser.keys(['/']);
            await browser.pause(100);
            await browser.keys(['f', 'o', 'o']);
            await browser.keys(['Enter']);
            await browser.pause(300);
            await vimKeys('g', 'n');
            await vimKeys('d');
            const val = await getEditorValue();
            expect(val.startsWith('foo bar ')).toBe(true);
        });

        it('cgn should change next search match', async function () {
            await setupEditor('old bar old baz old', { line: 0, ch: 0 });
            await browser.keys(['Escape']);
            await browser.pause(50);
            await browser.keys(['/']);
            await browser.pause(100);
            await browser.keys(['o', 'l', 'd']);
            await browser.keys(['Enter']);
            await browser.pause(300);
            await vimKeys('c', 'g', 'n');
            await browser.keys(['n', 'e', 'w']);
            await browser.keys(['Escape']);
            await browser.pause(300);
            const val = await getEditorValue();
            expect(val).toContain('new');
        });
    });

    describe('g; / g, (changelist navigation)', function () {
        it('g; should jump to position of previous change', async function () {
            await setupEditor('aaa\nbbb\nccc\nddd\neee', { line: 0, ch: 0 });
            await vimKeys('i');
            await browser.keys(['X']);
            await browser.keys(['Escape']);
            await browser.pause(200);
            await vimKeys('3', 'j');
            await vimKeys('i');
            await browser.keys(['Y']);
            await browser.keys(['Escape']);
            await browser.pause(200);
            const posAfterEdits = await getCursorPos();
            expect(posAfterEdits.line).toBe(3);
            await vimKeys('g', ';');
            const posAfterGSemicolon = await getCursorPos();
            expect(posAfterGSemicolon.line).toBeLessThanOrEqual(3);
        });

        it('g, should not error after g;', async function () {
            await setupEditor('aaa\nbbb\nccc', { line: 0, ch: 0 });
            await vimKeys('i');
            await browser.keys(['X']);
            await browser.keys(['Escape']);
            await browser.pause(200);
            await vimKeys('j');
            await vimKeys('i');
            await browser.keys(['Y']);
            await browser.keys(['Escape']);
            await browser.pause(200);
            await vimKeys('g', ';');
            await vimKeys('g', ',');
            const pos = await getCursorPos();
            expect(pos.line).toBeGreaterThanOrEqual(0);
        });
    });

    describe('ga (character info)', function () {
        it('ga should not error on a normal character', async function () {
            await setupEditor('Hello', { line: 0, ch: 0 });
            await vimKeys('g', 'a');
            expect((await getCursorPos()).ch).toBe(0);
        });

        it('ga on empty line should not crash', async function () {
            await setupEditor('', { line: 0, ch: 0 });
            await vimKeys('g', 'a');
            expect((await getCursorPos()).line).toBe(0);
        });
    });
});
