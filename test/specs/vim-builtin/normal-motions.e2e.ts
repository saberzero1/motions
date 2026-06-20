import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { setupEditor, vimKeys, getCursorPos } from '../../helpers';
import { testWithNeovim, startNvim, stopNvim } from '../../neovim/test-wrapper';
import { SUITES } from '../../neovim/test-definitions';

describe('Normal mode — cursor motions (Tier 1)', function () {
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

    const suite = SUITES.find((s) => s.name === 'normal-motions');
    if (suite) {
        for (const tc of suite.cases) {
            testWithNeovim('normal-motions', tc.name, {
                content: tc.content,
                cursor: tc.cursor,
                keys: [tc.keys],
            });
        }
    }

    describe('[obsidian] H / M / L (screen-relative)', function () {
        const longContent = Array.from(
            { length: 100 },
            (_, i) => `line ${i + 1}`,
        ).join('\n');

        it('H should move cursor near top of visible area', async function () {
            await setupEditor(longContent, { line: 50, ch: 0 });
            await vimKeys('H');
            const pos = await getCursorPos();
            expect(pos.line).toBeLessThan(50);
        });

        it('L should move cursor near bottom of visible area', async function () {
            await setupEditor(longContent, { line: 0, ch: 0 });
            await vimKeys('L');
            const pos = await getCursorPos();
            expect(pos.line).toBeGreaterThan(0);
        });

        it('M should move cursor between H and L', async function () {
            await setupEditor(longContent, { line: 0, ch: 0 });
            await vimKeys('H');
            const hLine = (await getCursorPos()).line;
            await vimKeys('L');
            const lLine = (await getCursorPos()).line;
            await vimKeys('M');
            const mLine = (await getCursorPos()).line;
            expect(mLine).toBeGreaterThanOrEqual(hLine);
            expect(mLine).toBeLessThanOrEqual(lLine);
        });

        it('H < M < L ordering should hold', async function () {
            await setupEditor(longContent, { line: 50, ch: 0 });
            await vimKeys('z', 'z');
            await vimKeys('H');
            const hLine = (await getCursorPos()).line;
            await vimKeys('M');
            const mLine = (await getCursorPos()).line;
            await vimKeys('L');
            const lLine = (await getCursorPos()).line;
            expect(hLine).toBeLessThanOrEqual(mLine);
            expect(mLine).toBeLessThanOrEqual(lLine);
        });
    });
});
