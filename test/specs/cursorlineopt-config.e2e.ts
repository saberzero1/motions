import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { PAUSE } from '../helpers';

const CANONICAL = ['number', 'line', 'screenline', 'both', 'screenline,number'];

/**
 * The `cursorlineopt` grammar is unit-tested and its two renderers are
 * e2e-tested, but those tests assign `plugin.settings.cursorlineopt` directly.
 * Nothing exercised the wire between them: the `normalize` hook on string
 * options in the vimrc loader, and the `defineOption` registration in
 * `src/vim/options.ts`.
 *
 * That gap is the same shape as the two defects this option already produced —
 * a value that is parsed, stored and displayed while never reaching what
 * renders it — so the normalization is asserted through the real `set` and
 * `vim.opt` paths here.
 */

async function readOpt(): Promise<string> {
    return (await browser.executeObsidian(({ app }) => {
        const plugin = (
            app as unknown as {
                plugins: {
                    plugins: Record<
                        string,
                        { settings: Record<string, unknown> }
                    >;
                };
            }
        ).plugins.plugins['vim-motions'];
        if (!plugin) throw new Error('readOpt: plugin not found');
        return String(plugin.settings.cursorlineopt);
    })) as string;
}

async function setOpt(value: string): Promise<void> {
    await browser.executeObsidian(async ({ app }, v: string) => {
        const plugin = (
            app as unknown as {
                plugins: {
                    plugins: Record<
                        string,
                        {
                            settings: Record<string, unknown>;
                            saveSettings: () => Promise<void>;
                        }
                    >;
                };
            }
        ).plugins.plugins['vim-motions'];
        plugin.settings.cursorlineopt = v;
        await plugin.saveSettings();
    }, value);
}

async function loadVimrc(body: string): Promise<void> {
    await obsidianPage.write('.obsidian.vimrc', body);
    await browser.executeObsidian(({ app }) => {
        (
            app as unknown as {
                commands: { executeCommandById: (id: string) => void };
            }
        ).commands.executeCommandById('vim-motions:reload-configuration');
    });
    await browser.pause(PAUSE.EDITOR_SETTLE * 3);
}

async function loadLua(body: string): Promise<void> {
    await browser.executeObsidian(async ({ app }, lua: string) => {
        await app.vault.adapter.write(`${app.vault.configDir}.init.lua`, lua);
    }, body);
    await browser.executeObsidian(async ({ app }) => {
        const plugin = (
            app as unknown as {
                plugins: {
                    plugins: Record<
                        string,
                        { loadLuaConfigForTest?: () => Promise<void> }
                    >;
                };
            }
        ).plugins.plugins['vim-motions'];
        await plugin?.loadLuaConfigForTest?.();
    });
    await browser.pause(PAUSE.EDITOR_SETTLE * 3);
}

describe('cursorlineopt normalization through vimrc and Lua', function () {
    before(async function () {
        this.timeout(60000);
        await obsidianPage.write('.obsidian.vimrc', '');
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await browser.waitUntil(
            async () =>
                (await browser.executeObsidian(({ app }) => {
                    const plugin = (
                        app as unknown as {
                            plugins: {
                                plugins: Record<
                                    string,
                                    { vimrcLoaded?: boolean }
                                >;
                            };
                        }
                    ).plugins.plugins['vim-motions'];
                    return plugin?.vimrcLoaded === true;
                })) as boolean,
            { timeout: 15000, interval: 200 },
        );
        await browser.pause(PAUSE.OBSIDIAN_LOAD);
    });

    after(async function () {
        await obsidianPage.resetVault();
    });

    it('normalizes a vimrc comma list to its canonical spelling', async function () {
        await setOpt('number');
        await loadVimrc('set cursorlineopt=line,number\n');
        expect(await readOpt()).toBe('both');
    });

    it('normalizes the culopt alias and reversed order', async function () {
        await setOpt('number');
        await loadVimrc('set culopt=number,screenline\n');
        expect(await readOpt()).toBe('screenline,number');
    });

    it('rejects a vimrc value Neovim rejects', async function () {
        await setOpt('line');
        await loadVimrc('set cursorlineopt=line,screenline\n');
        // Reloading the config rebuilds settings from the persisted base, so
        // the surviving value is not necessarily the one set above. What must
        // hold is that the illegal string never became the setting.
        const after = await readOpt();
        expect(after).not.toBe('line,screenline');
        expect(CANONICAL).toContain(after);
    });

    it('normalizes a Lua comma list to its canonical spelling', async function () {
        await setOpt('number');
        await loadVimrc('');
        await loadLua('vim.opt.cursorlineopt = "line,number"\n');
        expect(await readOpt()).toBe('both');
    });

    it('rejects a Lua value Neovim rejects', async function () {
        await setOpt('screenline');
        await loadLua('vim.opt.cursorlineopt = "both,screenline"\n');
        const after = await readOpt();
        expect(after).not.toBe('both,screenline');
        expect(CANONICAL).toContain(after);
    });
});
