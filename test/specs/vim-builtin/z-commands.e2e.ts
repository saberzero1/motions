import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    vimKeys,
    getCursorPos,
    sendVimEscape,
} from '../../helpers';

async function getScrollTop(): Promise<number> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return -1;
        const cm6 = (view.editor as unknown as Record<string, unknown>).cm as
            | { scrollDOM: HTMLElement }
            | undefined;
        return cm6?.scrollDOM.scrollTop ?? -1;
    })) as number;
}

describe('Normal mode — z-prefix commands (Tier 1)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(50);
    });

    describe('zz / zt / zb (scroll cursor to screen position)', function () {
        it('zz/zt/zb should produce distinct scroll positions in correct order', async function () {
            const lines = Array.from(
                { length: 200 },
                (_, i) => `line ${i + 1}`,
            ).join('\n');
            await setupEditor(lines, { line: 100, ch: 0 });

            await vimKeys('z', 'b');
            await browser.pause(100);
            const scrollZb = await getScrollTop();
            expect((await getCursorPos()).line).toBe(100);

            await vimKeys('z', 'z');
            await browser.pause(100);
            const scrollZz = await getScrollTop();
            expect((await getCursorPos()).line).toBe(100);

            await vimKeys('z', 't');
            await browser.pause(100);
            const scrollZt = await getScrollTop();
            expect((await getCursorPos()).line).toBe(100);

            expect(scrollZb).toBeLessThan(scrollZz);
            expect(scrollZz).toBeLessThan(scrollZt);
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
