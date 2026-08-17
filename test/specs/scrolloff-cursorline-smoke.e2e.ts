import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    getCursorPos,
    sendVimEscape,
    vimKeys,
    setPluginSetting,
    getPluginSetting,
    PAUSE,
} from '../helpers';

describe('Scrolloff smoke', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);
    });

    it('scrolloff setting should be persisted when changed', async function () {
        await setPluginSetting('scrolloffLines', 5);
        const val = await getPluginSetting('scrolloffLines');
        expect(val).toBe(5);
    });

    it('cursor should remain at least scrolloff lines from edge', async function () {
        await setPluginSetting('scrolloffLines', 3);
        const lines = Array.from(
            { length: 50 },
            (_, i) => `line ${i + 1}`,
        ).join('\n');
        await setupEditor(lines, { line: 25, ch: 0 });

        await vimKeys('j', 'j', 'j', 'j', 'j');
        const pos = await getCursorPos();
        expect(pos.line).toBe(30);
    });

    after(async function () {
        await setPluginSetting('scrolloffLines', 0);
    });
});

describe('Cursorline smoke', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    it('cursorline setting should be persisted when changed', async function () {
        await setPluginSetting('cursorline', true);
        const val = await getPluginSetting('cursorline');
        expect(val).toBe(true);
    });

    it('cursorline can be enabled and disabled without error', async function () {
        await browser.executeObsidian(({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<
                            string,
                            {
                                settings: Record<string, unknown>;
                                reloadFeatures?: () => void;
                            }
                        >;
                    };
                }
            ).plugins.plugins['vim-motions'];
            if (plugin) {
                plugin.settings.cursorline = true;
                plugin.settings.cursorlineopt = 'both';
                plugin.reloadFeatures?.();
            }
        });
        await browser.pause(PAUSE.EDITOR_SETTLE);
        await setupEditor('line one\nline two\nline three', { line: 1, ch: 0 });

        const enabledVal = await getPluginSetting('cursorline');
        expect(enabledVal).toBe(true);

        await setPluginSetting('cursorline', false);
        const disabledVal = await getPluginSetting('cursorline');
        expect(disabledVal).toBe(false);
    });

    after(async function () {
        await setPluginSetting('cursorline', false);
    });
});
