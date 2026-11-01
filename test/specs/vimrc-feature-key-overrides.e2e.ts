import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { setPluginSettingAndReload, setupEditor } from '../helpers';

// A vimrc mapping on a key the plugin binds itself (#205). Re-registering a
// feature removed its entries and added them again, and the removal took the
// user's mapping for the same keys with it: once Obsidian had started,
// `nmap gw <Plug>(easymotion-bd-w)` left `gw` as hard-wrap's operator, and
// `nnoremap Y yy` left `Y` as the plugin's `y$`. A reload after Obsidian had
// started put them back, which is why tests that reload the vimrc never saw it.

const VIMRC = ['nmap gw <Plug>(easymotion-bd-w)', 'nnoremap Y yy'].join('\n');

interface Entry {
    keys: string;
    type: string;
    toKeys?: string;
}

/** Writes the vimrc, then loads the plugin from cold, as Obsidian's start does. */
async function coldLoad(vimrc: string): Promise<void> {
    await browser.reloadObsidian({ vault: 'test-vault' });
    await obsidianPage.openFile('Welcome.md');
    await obsidianPage.write('.obsidian.vimrc', vimrc);
    await browser.executeObsidian(async ({ app }) => {
        const plugins = (
            app as unknown as {
                plugins: {
                    disablePlugin(id: string): Promise<void>;
                    enablePlugin(id: string): Promise<void>;
                };
            }
        ).plugins;
        await plugins.disablePlugin('vim-motions');
        await plugins.enablePlugin('vim-motions');
    });
    await browser.pause(1000);
    // The vimrc loads on the first leaf change, which Obsidian's start fires.
    // Exactly one: every later pane switch re-applies the vimrc's mappings,
    // which put them back on top and hid the defect until the user switched.
    await obsidianPage.openFile('Target.md');
    await browser.waitUntil(
        async () =>
            (await browser.executeObsidian(
                ({ app }) =>
                    (
                        app as unknown as {
                            plugins: {
                                plugins: Record<
                                    string,
                                    { vimrcLoaded?: boolean }
                                >;
                            };
                        }
                    ).plugins.plugins['vim-motions']?.vimrcLoaded === true,
            )) as boolean,
        { timeout: 15000, interval: 200, timeoutMsg: 'the vimrc did not load' },
    );
}

async function entries(keys: string[]): Promise<Entry[]> {
    return (await browser.executeObsidian((_ctx, wanted: string[]) => {
        const Vim = (
            window as unknown as {
                CodeMirrorAdapter: { Vim: { getKeymap(): Entry[] } };
            }
        ).CodeMirrorAdapter.Vim;
        return Vim.getKeymap()
            .filter((entry) => wanted.includes(entry.keys))
            .map((entry) => ({
                keys: entry.keys,
                type: entry.type,
                toKeys: entry.toKeys,
            }));
    }, keys)) as Entry[];
}

/** What `gw` and `Y` do: EasyMotion labels shown, and what `Y` yanked. */
async function behaviour(): Promise<{ gwLabels: boolean; yanked: string }> {
    await setupEditor('one two three four five', { line: 0, ch: 8 });
    await browser.keys(['Escape']);
    await browser.pause(150);
    await browser.keys(['g']);
    await browser.keys(['w']);
    await browser.pause(400);
    const gwLabels =
        ((await browser.execute(
            () =>
                document.querySelectorAll('.vim-motions-easymotion-label')
                    .length,
        )) as number) > 0;
    await browser.keys(['Escape']);
    await browser.pause(150);
    await browser.keys(['Escape']);
    await browser.keys(['Y']);
    await browser.pause(300);
    const yanked = (await browser.executeObsidian(() => {
        const Vim = (
            window as unknown as {
                CodeMirrorAdapter: {
                    Vim: {
                        getRegisterController(): {
                            getRegister(name: string): { toString(): string };
                        };
                    };
                };
            }
        ).CodeMirrorAdapter.Vim;
        return Vim.getRegisterController().getRegister('"').toString();
    })) as string;
    return { gwLabels, yanked };
}

describe('vimrc mappings on keys the plugin binds (#205)', function () {
    this.timeout(180000);

    it('keep working once Obsidian has started', async function () {
        await coldLoad(VIMRC);
        expect(await behaviour()).toEqual({
            gwLabels: true,
            yanked: 'one two three four five\n',
        });
    });

    it('keep working after settings changes and pane switches, without piling up copies', async function () {
        await coldLoad(VIMRC);
        await setPluginSettingAndReload('yankHighlightDuration', 301);
        await setPluginSettingAndReload('yankHighlightDuration', 300);
        // Each pane switch re-applies the vimrc's mappings too.
        await obsidianPage.openFile('Welcome.md');
        await obsidianPage.openFile('Target.md');
        await browser.pause(300);
        const mapped = (await entries(['gw', 'Y'])).filter(
            (entry) => entry.type === 'keyToKey',
        );
        expect({ behaviour: await behaviour(), mapped }).toEqual({
            behaviour: { gwLabels: true, yanked: 'one two three four five\n' },
            mapped: [
                {
                    keys: 'Y',
                    type: 'keyToKey',
                    toKeys: 'yy',
                },
                {
                    keys: 'gw',
                    type: 'keyToKey',
                    toKeys: '<Plug>(easymotion-bd-w)',
                },
                { keys: 'Y', type: 'keyToKey', toKeys: 'y$' },
            ],
        });
    });

    // Removed from the vimrc and reloaded, `Y` is the plugin's `y$` again:
    // the old mapping went, and nothing of the plugin's went with it.
    it('give the key back to the plugin when removed from the vimrc', async function () {
        await coldLoad(VIMRC);
        await obsidianPage.write(
            '.obsidian.vimrc',
            'nmap gw <Plug>(easymotion-bd-w)',
        );
        await browser.executeObsidian(async ({ app }) => {
            await (
                app as unknown as {
                    plugins: {
                        plugins: Record<
                            string,
                            { reloadAllConfigs?: () => Promise<void> }
                        >;
                    };
                }
            ).plugins.plugins['vim-motions']?.reloadAllConfigs?.();
        });
        await browser.pause(500);
        expect(await behaviour()).toEqual({
            gwLabels: true,
            yanked: 'three four five',
        });
    });
});
