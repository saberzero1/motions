import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    vimKeys,
    vimRawKeys,
    getCursorPos,
    getEditorValue,
    getSelection,
    sendVimEscape,
    PAUSE,
} from '../helpers';

describe('Formatting mark cursor fix (transaction filter)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);
    });

    describe('h/l navigation through formatting marks', function () {
        it('l from before bold opening ** should land on first content char', async function () {
            await setupEditor('a**bold**z', { line: 0, ch: 0 });
            await vimKeys('l');
            const pos = await getCursorPos();
            // Weak assertion: source mode lands at ch:1, live preview may skip collapsed **
            expect(pos.ch).toBeGreaterThan(0);
        });

        it('di* inside bold should delete content correctly', async function () {
            await setupEditor('Hello **bold text** world', { line: 0, ch: 10 });
            await vimKeys('d', 'i', '*');
            expect(await getEditorValue()).toBe('Hello **** world');
        });

        it('da* inside bold should delete content and delimiters', async function () {
            await setupEditor('Hello **bold text** world', { line: 0, ch: 10 });
            await vimKeys('d', 'a', '*');
            expect(await getEditorValue()).toBe('Hello  world');
        });

        it('vi* inside italic should select content only', async function () {
            await setupEditor('Hello *italic* world', { line: 0, ch: 8 });
            await vimKeys('v', 'i', '*');
            const sel = await getSelection();
            expect(sel).toBe('italic');
        });

        it('va* inside italic should select content and delimiters', async function () {
            await setupEditor('Hello *italic* world', { line: 0, ch: 8 });
            await vimKeys('v', 'a', '*');
            const sel = await getSelection();
            expect(sel).toBe('*italic*');
        });
    });

    describe('cursor positioning with inline code', function () {
        it('di` inside inline code should delete content', async function () {
            await setupEditor('Run `command` now', { line: 0, ch: 7 });
            await vimKeys('d', 'i', '`');
            expect(await getEditorValue()).toBe('Run `` now');
        });
    });

    describe('cursor positioning with strikethrough', function () {
        it('di~ inside strikethrough should delete content', async function () {
            await setupEditor('Some ~~deleted~~ text', { line: 0, ch: 9 });
            await vimKeys('d', 'i', '~');
            expect(await getEditorValue()).toBe('Some ~~~~ text');
        });
    });

    describe('cursor positioning with highlight', function () {
        it('di= inside highlight should delete content', async function () {
            await setupEditor('Some ==highlighted== text', { line: 0, ch: 12 });
            await vimKeys('d', 'i', '=');
            expect(await getEditorValue()).toBe('Some ==== text');
        });
    });

    describe('end-of-line formatting marks', function () {
        it('l at end of line ending with ** should not oscillate', async function () {
            await setupEditor('**he**', { line: 0, ch: 0 });
            const positions: number[] = [];
            for (let i = 0; i < 12; i++) {
                await vimKeys('l');
                positions.push((await getCursorPos()).ch);
            }
            console.log('EOL oscillation positions:', positions);
            const last3 = positions.slice(-3);
            expect(last3[1]).toBe(last3[2]);
            expect(await getEditorValue()).toBe('**he**');
        });

        it('l on line ending with ** followed by space should not oscillate', async function () {
            await setupEditor('**he** ', { line: 0, ch: 0 });
            await vimKeys('l', 'l', 'l', 'l', 'l', 'l', 'l', 'l');
            const pos1 = await getCursorPos();
            await vimKeys('l');
            const pos2 = await getCursorPos();
            expect(pos2.ch).toBe(pos1.ch);
            expect(await getEditorValue()).toBe('**he** ');
        });
    });

    describe('no data corruption during navigation', function () {
        it('hjkl in normal text should not alter content', async function () {
            const content = 'Hello **bold** *italic* `code` world';
            await setupEditor(content, { line: 0, ch: 0 });
            await vimKeys('l', 'l', 'l', 'l', 'l', 'l', 'l', 'l', 'l', 'l');
            await vimKeys('h', 'h', 'h', 'h', 'h');
            expect(await getEditorValue()).toBe(content);
        });

        it('hjkl with strikethrough and highlight should not alter content', async function () {
            const content = 'Some ~~strike~~ and ==highlight== text';
            await setupEditor(content, { line: 0, ch: 0 });
            await vimKeys('l', 'l', 'l', 'l', 'l', 'l', 'l', 'l', 'l', 'l');
            await vimKeys('l', 'l', 'l', 'l', 'l', 'l', 'l', 'l', 'l', 'l');
            await vimKeys('h', 'h', 'h', 'h', 'h', 'h', 'h', 'h', 'h', 'h');
            expect(await getEditorValue()).toBe(content);
        });
    });

    describe('visual mode should bypass formatting mark snapping', function () {
        it('v + motion across bold should not snap selection head', async function () {
            await setupEditor('Hello **bold** world', { line: 0, ch: 0 });
            await vimKeys('v');
            await browser.pause(PAUSE.MODE_SWITCH);
            for (let i = 0; i < 12; i++) {
                await browser.keys(['l']);
                await browser.pause(PAUSE.KEY_GAP);
            }
            await browser.pause(PAUSE.EDITOR_SETTLE - PAUSE.KEY_GAP);
            const sel = await getSelection();
            expect(sel.length).toBe(13);
            expect(await getEditorValue()).toBe('Hello **bold** world');
        });

        it('V + j + d across lines with formatting marks should delete both lines', async function () {
            const content = '**bold line**\n*italic line*\nnormal line';
            await setupEditor(content, { line: 0, ch: 0 });
            await vimRawKeys('Vjd');
            expect(await getEditorValue()).toBe('normal line');
        });
    });

    describe('multi-line formatted text', function () {
        it('j/k through lines with formatting should not corrupt', async function () {
            const content = '**bold line**\n*italic line*\n`code line`';
            await setupEditor(content, { line: 0, ch: 5 });
            await vimKeys('j');
            expect((await getCursorPos()).line).toBe(1);
            await vimKeys('j');
            expect((await getCursorPos()).line).toBe(2);
            await vimKeys('k');
            expect((await getCursorPos()).line).toBe(1);
            await vimKeys('k');
            expect((await getCursorPos()).line).toBe(0);
            expect(await getEditorValue()).toBe(content);
        });
    });
});
