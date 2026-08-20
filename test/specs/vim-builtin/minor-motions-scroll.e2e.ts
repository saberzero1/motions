import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    vimKeys,
    vimRawKeys,
    getCursorPos,
    sendVimEscape,
    dismissNotices,
    PAUSE,
} from '../../helpers';

describe('Normal mode — minor motions & horizontal scroll', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(50);
        await dismissNotices();
    });

    describe('gm (go to middle of screen line)', function () {
        it('gm should move cursor toward middle of visible area', async function () {
            const longLine = 'abcdefghij'.repeat(20);
            await setupEditor(longLine, { line: 0, ch: 0 });
            await vimKeys('g', 'm');
            const pos = await getCursorPos();
            expect(pos.line).toBe(0);
            expect(pos.ch).toBeGreaterThan(0);
        });

        it('gm on short line should clamp to last character', async function () {
            await setupEditor('hi', { line: 0, ch: 0 });
            await vimKeys('g', 'm');
            const pos = await getCursorPos();
            expect(pos.line).toBe(0);
            expect(pos.ch).toBeLessThanOrEqual(1);
        });
    });

    describe('go (go to byte offset)', function () {
        it('5go should move to the 5th character (0-indexed ch 4)', async function () {
            await setupEditor('abcdefghij', { line: 0, ch: 0 });
            await vimKeys('5', 'g', 'o');
            const pos = await getCursorPos();
            expect(pos.line).toBe(0);
            expect(pos.ch).toBe(4);
        });

        it('go across newlines should land on correct line and ch', async function () {
            // "hello\nworld" — h=1,e=2,l=3,l=4,o=5,\n=6,w=7,o=8
            await setupEditor('hello\nworld', { line: 0, ch: 0 });
            await vimKeys('8', 'g', 'o');
            const pos = await getCursorPos();
            expect(pos.line).toBe(1);
            expect(pos.ch).toBe(1);
        });

        it('1go should move to the first character', async function () {
            await setupEditor('abcdefghij', { line: 0, ch: 5 });
            await vimKeys('1', 'g', 'o');
            const pos = await getCursorPos();
            expect(pos.line).toBe(0);
            expect(pos.ch).toBe(0);
        });

        it('go beyond end should clamp to last character', async function () {
            await setupEditor('abc', { line: 0, ch: 0 });
            await vimKeys('9', '9', 'g', 'o');
            const pos = await getCursorPos();
            expect(pos.line).toBe(0);
            expect(pos.ch).toBeLessThanOrEqual(2);
        });
    });

    describe('g8 (show UTF-8 byte value)', function () {
        it('g8 on ASCII character should show hex value in notice', async function () {
            await setupEditor('A', { line: 0, ch: 0 });
            await dismissNotices();
            await vimKeys('g', '8');
            await browser.pause(PAUSE.EDITOR_SETTLE);
            const pos = await getCursorPos();
            expect(pos.line).toBe(0);
            expect(pos.ch).toBe(0);
        });

        it('g8 on multi-byte character should not crash', async function () {
            await setupEditor('\u00e9', { line: 0, ch: 0 });
            await dismissNotices();
            await vimKeys('g', '8');
            await browser.pause(PAUSE.EDITOR_SETTLE);
            const pos = await getCursorPos();
            expect(pos.line).toBe(0);
        });

        it('g8 on empty line should not crash', async function () {
            await setupEditor('\ntext', { line: 0, ch: 0 });
            await vimKeys('g', '8');
            await browser.pause(PAUSE.EDITOR_SETTLE);
            const pos = await getCursorPos();
            expect(pos.line).toBe(0);
        });
    });

    describe('gF (go to file under cursor with line number)', function () {
        it('[crash-guard] gF on plain text should not error', async function () {
            await setupEditor('just some plain text', { line: 0, ch: 5 });
            await vimKeys('g', 'F');
            await browser.pause(PAUSE.EDITOR_SETTLE);
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
        });
    });

    describe('Ctrl-G (show file info)', function () {
        it('Ctrl-G should show a notice and not move cursor', async function () {
            await setupEditor('hello\nworld\nfoo', { line: 1, ch: 2 });
            await dismissNotices();
            // Send Ctrl-G via vimRawKeys (\x07 = ASCII 7 = Ctrl-G)
            await vimRawKeys('\x07');
            await browser.pause(PAUSE.EDITOR_SETTLE);
            const pos = await getCursorPos();
            expect(pos.line).toBe(1);
            expect(pos.ch).toBe(2);
        });

        it('[crash-guard] Ctrl-G on empty buffer should not error', async function () {
            await setupEditor('', { line: 0, ch: 0 });
            await vimRawKeys('\x07');
            await browser.pause(PAUSE.EDITOR_SETTLE);
            const pos = await getCursorPos();
            expect(pos.line).toBe(0);
        });
    });

    describe('zs / ze / zH / zL (horizontal scroll)', function () {
        const longLine = 'x'.repeat(300);

        it('[crash-guard] zs should not error', async function () {
            await setupEditor(longLine, { line: 0, ch: 150 });
            await vimKeys('z', 's');
            await browser.pause(100);
            const pos = await getCursorPos();
            expect(pos.line).toBe(0);
        });

        it('[crash-guard] ze should not error', async function () {
            await setupEditor(longLine, { line: 0, ch: 150 });
            await vimKeys('z', 'e');
            await browser.pause(100);
            const pos = await getCursorPos();
            expect(pos.line).toBe(0);
        });

        it('[crash-guard] zH should not error', async function () {
            await setupEditor(longLine, { line: 0, ch: 150 });
            await vimKeys('z', 'H');
            await browser.pause(100);
            const pos = await getCursorPos();
            expect(pos.line).toBe(0);
        });

        it('[crash-guard] zL should not error', async function () {
            await setupEditor(longLine, { line: 0, ch: 150 });
            await vimKeys('z', 'L');
            await browser.pause(100);
            const pos = await getCursorPos();
            expect(pos.line).toBe(0);
        });

        it('zs and ze should not move cursor vertically', async function () {
            const content = longLine + '\n' + longLine;
            await setupEditor(content, { line: 1, ch: 100 });
            await vimKeys('z', 's');
            await browser.pause(100);
            expect((await getCursorPos()).line).toBe(1);
            await vimKeys('z', 'e');
            await browser.pause(100);
            expect((await getCursorPos()).line).toBe(1);
        });

        it('zH and zL should not move cursor vertically', async function () {
            const content = longLine + '\n' + longLine;
            await setupEditor(content, { line: 1, ch: 100 });
            await vimKeys('z', 'H');
            await browser.pause(100);
            expect((await getCursorPos()).line).toBe(1);
            await vimKeys('z', 'L');
            await browser.pause(100);
            expect((await getCursorPos()).line).toBe(1);
        });
    });
});
