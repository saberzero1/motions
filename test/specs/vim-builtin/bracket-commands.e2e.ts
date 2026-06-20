import { browser } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { testWithNeovim, startNvim, stopNvim } from '../../neovim/test-wrapper';
import { SUITES } from '../../neovim/test-definitions';

describe('Normal mode — bracket commands (Tier 1)', function () {
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

    const suite = SUITES.find((s) => s.name === 'bracket-commands');
    if (suite) {
        for (const tc of suite.cases) {
            testWithNeovim('bracket-commands', tc.name, {
                content: tc.content,
                cursor: tc.cursor,
                keys: [tc.keys],
            });
        }
    }
});
