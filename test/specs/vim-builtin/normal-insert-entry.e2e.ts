import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { testWithNeovim, startNvim, stopNvim } from '../../neovim/test-wrapper';
import { SUITES } from '../../neovim/test-definitions';

import { sendVimEscape } from '../../helpers';
describe('Normal mode — insert entry commands (Tier 1)', function () {
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

    const suite = SUITES.find((s) => s.name === 'normal-insert-entry');
    if (suite) {
        for (const tc of suite.cases) {
            testWithNeovim('normal-insert-entry', tc.name, {
                content: tc.content,
                cursor: tc.cursor,
                keys: [tc.keys],
            });
        }
    } else {
        it('suite "normal-insert-entry" exists in test-definitions', function () {
            // Reached only when the lookup above missed, so this fails by
            // construction. An assertion rather than a bare throw: the gate
            // cannot see a throw, and this prints the suite names that DO
            // exist, which is what answers "was it renamed?".
            expect(SUITES.map((s) => s.name)).toContain('normal-insert-entry');
        });
    }
});
