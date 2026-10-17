import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { sendVimEscape } from '../../helpers';
import { testWithNeovim, startNvim, stopNvim } from '../../neovim/test-wrapper';
import { SUITES } from '../../neovim/test-definitions';

describe('Surround (Tier 1 golden)', function () {
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

    const suite = SUITES.find((s) => s.name === 'surround');
    if (suite) {
        for (const tc of suite.cases) {
            testWithNeovim('surround', tc.name, {
                content: tc.content,
                cursor: tc.cursor,
                keys: [tc.keys],
            });
        }
    } else {
        it('suite "surround" exists in test-definitions', function () {
            // Reached only when the lookup above missed, so this fails by
            // construction. An assertion rather than a bare throw: the gate
            // cannot see a throw, and this prints the suite names that DO
            // exist, which is what answers "was it renamed?".
            expect(SUITES.map((s) => s.name)).toContain('surround');
        });
    }
});
