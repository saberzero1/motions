import { browser } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { SUITES } from '../../neovim/test-definitions';
import { testWithNeovim, startNvim, stopNvim } from '../../neovim/test-wrapper';
import { sendVimEscape } from '../../helpers';

const suite = SUITES.find((s) => s.name === 'lua-keymaps');

describe('Lua config keymaps (golden comparison)', function () {
    before(async function () {
        await startNvim();
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    after(async function () {
        await stopNvim();
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(50);
    });

    if (suite) {
        for (const tc of suite.cases) {
            testWithNeovim('lua-keymaps', tc.name, {
                content: tc.content,
                cursor: tc.cursor,
                keys: [tc.keys],
                luaSetup: tc.luaSetup,
            });
        }
    }
});
