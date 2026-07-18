import { browser } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { sendVimEscape } from '../../helpers';
import { testWithNeovim, startNvim, stopNvim } from '../../neovim/test-wrapper';
import { SUITES } from '../../neovim/test-definitions';

describe('Flash golden: stock f/F/t/T vs Neovim (Tier 1)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await browser.executeObsidian(({ app }) => {
            const plugin = (app as unknown as Record<string, unknown>)
                .plugins as Record<string, unknown> | undefined;
            const internal = (plugin?.plugins as Record<string, unknown>)?.[
                'vim-motions'
            ] as { settings: Record<string, unknown> } | undefined;
            if (internal?.settings) {
                internal.settings.enableFlash = false;
            }
        });
        await startNvim();
    });

    after(async function () {
        await stopNvim();
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(50);
    });

    const suite = SUITES.find((s) => s.name === 'flash-golden');
    if (suite) {
        for (const tc of suite.cases) {
            testWithNeovim('flash-golden', tc.name, {
                content: tc.content,
                cursor: tc.cursor,
                keys: [tc.keys],
            });
        }
    }
});
