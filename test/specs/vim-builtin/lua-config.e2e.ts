import { browser, expect } from '@wdio/globals';
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
    } else {
        it('suite "lua-keymaps" exists in test-definitions', function () {
            // Reached only when the lookup above missed, so this fails by
            // construction. An assertion rather than a bare throw: the gate
            // cannot see a throw, and this prints the suite names that DO
            // exist, which is what answers "was it renamed?".
            expect(SUITES.map((s) => s.name)).toContain('lua-keymaps');
        });
    }
});
