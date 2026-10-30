import { $, browser, expect } from '@wdio/globals';
import { Key } from 'webdriverio';
import { obsidianPage } from 'wdio-obsidian-service';
import { getRegisterContent, handleEx, PAUSE } from '../helpers';

/**
 * `<C-y>` in a picker yanks the selected item (#171): a command's id from
 * `:commands` (which `:obcommand` with no argument opens), a file's path from
 * `:files`. It goes through the register controller as `y` does, so it lands
 * in the unnamed register and register 0. Measured before the change: `<C-y>`
 * did nothing and left the picker open.
 */

type PluginRef = {
    settings: { pickerKeymap: Record<string, string[]> };
    saveSettings: () => Promise<void>;
};

async function openPicker(command: string, query: string): Promise<void> {
    const result = await handleEx(command);
    expect(result.unknownCommand).toBe(false);
    await browser.waitUntil(
        async () =>
            (await browser.executeObsidian(
                () => !!document.querySelector('.vim-motions-picker'),
            )) as boolean,
        { timeout: 3000, interval: 100, timeoutMsg: `${command} did not open` },
    );
    await $('.vim-motions-picker-input').setValue(query);
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

async function pickerOpen(): Promise<boolean> {
    return (await browser.executeObsidian(
        () => !!document.querySelector('.vim-motions-picker'),
    )) as boolean;
}

async function pressYank(): Promise<void> {
    await browser.keys([Key.Ctrl, 'y']);
    await browser.keys([Key.Ctrl]);
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

async function clearUnnamed(): Promise<void> {
    await browser.executeObsidian(() => {
        (
            window as unknown as {
                CodeMirrorAdapter: {
                    Vim: {
                        getRegisterController(): {
                            unnamedRegister: { setText(t: string): void };
                        };
                    };
                };
            }
        ).CodeMirrorAdapter.Vim.getRegisterController().unnamedRegister.setText(
            '',
        );
    });
}

describe('yanking from a picker (#171)', function () {
    this.timeout(120000);

    beforeEach(async function () {
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(PAUSE.EDITOR_SETTLE);
        await clearUnnamed();
    });

    afterEach(async function () {
        if (await pickerOpen()) await browser.keys(['Escape']);
    });

    it('<C-y> on a command yanks its id and closes the picker', async function () {
        await openPicker('obcommand', 'editor:toggle-bold');

        await pressYank();

        expect(await pickerOpen()).toBe(false);
        expect((await getRegisterContent('"'))?.text).toBe(
            'editor:toggle-bold',
        );
        expect((await getRegisterContent('0'))?.text).toBe(
            'editor:toggle-bold',
        );
    });

    it('<C-y> on a file yanks its path', async function () {
        await openPicker('files', 'Welcome');

        await pressYank();

        expect((await getRegisterContent('"'))?.text).toBe('Welcome.md');
    });

    it('a keymap saved before the yank key existed still gets it', async function () {
        // Settings saved by an earlier version carry a pickerKeymap without
        // `yank`; the shallow settings merge used to keep it whole.
        await browser.executeObsidian(async ({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins: { plugins: Record<string, PluginRef> };
                }
            ).plugins.plugins['vim-motions'];
            if (!plugin) return;
            delete plugin.settings.pickerKeymap.yank;
            await plugin.saveSettings();
        });
        await obsidianPage.disablePlugin('vim-motions');
        await browser.pause(PAUSE.OBSIDIAN_LOAD);
        await obsidianPage.enablePlugin('vim-motions');
        await browser.pause(PAUSE.OBSIDIAN_LOAD);
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(PAUSE.EDITOR_SETTLE);
        await clearUnnamed();

        await openPicker('files', 'Welcome');
        await pressYank();

        expect((await getRegisterContent('"'))?.text).toBe('Welcome.md');
    });
});
