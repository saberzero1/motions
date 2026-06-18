import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { setupEditor, vimKeys, getCursorPos } from '../../helpers';

describe('Normal mode — z-prefix commands (Tier 1)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await browser.keys(['Escape']);
        await browser.pause(50);
    });

    describe('zz / zt / zb (scroll cursor to screen position)', function () {
        it('zz should not change cursor line', async function () {
            const lines = Array.from(
                { length: 50 },
                (_, i) => `line ${i + 1}`,
            ).join('\n');
            await setupEditor(lines, { line: 25, ch: 0 });
            await vimKeys('z', 'z');
            expect((await getCursorPos()).line).toBe(25);
        });

        it('zt should not change cursor line', async function () {
            const lines = Array.from(
                { length: 50 },
                (_, i) => `line ${i + 1}`,
            ).join('\n');
            await setupEditor(lines, { line: 25, ch: 0 });
            await vimKeys('z', 't');
            expect((await getCursorPos()).line).toBe(25);
        });

        it('zb should not change cursor line', async function () {
            const lines = Array.from(
                { length: 50 },
                (_, i) => `line ${i + 1}`,
            ).join('\n');
            await setupEditor(lines, { line: 25, ch: 0 });
            await vimKeys('z', 'b');
            expect((await getCursorPos()).line).toBe(25);
        });
    });

    describe('zh / zl / zH / zL (horizontal scroll)', function () {
        it('zh should not move cursor vertically', async function () {
            await setupEditor('short line', { line: 0, ch: 0 });
            await vimKeys('z', 'h');
            expect((await getCursorPos()).line).toBe(0);
        });

        it('zl should not move cursor vertically', async function () {
            await setupEditor('short line', { line: 0, ch: 0 });
            await vimKeys('z', 'l');
            expect((await getCursorPos()).line).toBe(0);
        });
    });
});
