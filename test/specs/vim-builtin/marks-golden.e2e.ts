import { browser } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { sendVimEscape } from '../../helpers';
import { testWithNeovim, startNvim, stopNvim } from '../../neovim/test-wrapper';
import { SUITES } from '../../neovim/test-definitions';

describe('Marks (Tier 1 golden)', function () {
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

    const suite = SUITES.find((s) => s.name === 'marks');
    if (suite) {
        for (const tc of suite.cases) {
            testWithNeovim('marks', tc.name, {
                content: tc.content,
                cursor: tc.cursor,
                keys: [tc.keys],
            });
        }
    }
});
