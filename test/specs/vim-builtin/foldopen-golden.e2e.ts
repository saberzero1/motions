import { browser } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { sendVimEscape } from '../../helpers';
import { testWithNeovim, startNvim, stopNvim } from '../../neovim/test-wrapper';
import { SUITES } from '../../neovim/test-definitions';

describe('Foldopen cursor behaviour (Tier 1 golden)', function () {
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

    const suite = SUITES.find((s) => s.name === 'foldopen');
    if (suite) {
        for (const tc of suite.cases) {
            testWithNeovim('foldopen', tc.name, {
                content: tc.content,
                cursor: tc.cursor,
                keys: [tc.keys],
                luaSetup: tc.luaSetup,
            });
        }
    } else {
        it('suite "foldopen" exists in test-definitions', function () {
            throw new Error(
                'Suite "foldopen" not found in SUITES — was it renamed in test-definitions.ts?',
            );
        });
    }
});
