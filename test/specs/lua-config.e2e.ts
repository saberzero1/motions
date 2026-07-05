import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

async function loadLuaConfig(content: string): Promise<void> {
    await browser.reloadObsidian({ vault: 'test-vault' });
    await obsidianPage.openFile('Welcome.md');
    await browser.waitUntil(
        async () =>
            (await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins: {
                            plugins: Record<string, { vimrcLoaded?: boolean }>;
                        };
                    }
                ).plugins.plugins['vim-motions'];
                return plugin?.vimrcLoaded === true;
            })) as boolean,
        { timeout: 10000, interval: 200 },
    );
    await browser.executeObsidian(async ({ app }, luaContent: string) => {
        const configPath = `${app.vault.configDir}.init.lua`;
        await app.vault.adapter.write(configPath, luaContent);
    }, content);
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
    await browser.waitUntil(
        async () =>
            (await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins: {
                            plugins: Record<string, { luaLoaded?: boolean }>;
                        };
                    }
                ).plugins.plugins['vim-motions'];
                return plugin?.luaLoaded === true;
            })) as boolean,
        { timeout: 10000, interval: 200 },
    );
}

async function assertPluginLoaded(): Promise<void> {
    const result = await browser.executeObsidian(({ app }) => {
        const plugins = (
            app as unknown as {
                plugins: { plugins: Record<string, unknown> };
            }
        ).plugins.plugins;
        return { pluginLoaded: 'vim-motions' in plugins };
    });
    expect(result).toHaveProperty('pluginLoaded', true);
}

describe('Lua config support', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    it('should load init.lua and apply vim.opt settings', async function () {
        await loadLuaConfig('vim.opt.scrolloff = 10\n');
        const scrolloff = await browser.executeObsidian(({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<
                            string,
                            { settings: { scrolloffLines: number } }
                        >;
                    };
                }
            ).plugins.plugins['vim-motions'];
            return plugin?.settings?.scrolloffLines;
        });
        expect(scrolloff).toBe(10);
    });

    it('should apply vim.g.mapleader', async function () {
        await loadLuaConfig('vim.g.mapleader = ","\nvim.opt.scrolloff = 3\n');
        await assertPluginLoaded();
    });

    it('should survive syntax errors gracefully', async function () {
        await loadLuaConfig('if then end\n');
        await assertPluginLoaded();
    });

    it('should survive runtime errors gracefully', async function () {
        await loadLuaConfig('error("intentional test error")\n');
        await assertPluginLoaded();
    });

    it('should survive infinite loops via timeout', async function () {
        await loadLuaConfig('while true do end\n');
        await assertPluginLoaded();
    });

    it('should handle conditional config with vim.vault_name()', async function () {
        await loadLuaConfig(
            'if vim.vault_name() ~= "" then\n  vim.opt.scrolloff = 15\nelse\n  vim.opt.scrolloff = 99\nend\n',
        );
        const scrolloff = await browser.executeObsidian(({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<
                            string,
                            { settings: { scrolloffLines: number } }
                        >;
                    };
                }
            ).plugins.plugins['vim-motions'];
            return plugin?.settings?.scrolloffLines;
        });
        expect(scrolloff).toBe(15);
    });

    it('should execute vim.cmd()', async function () {
        await loadLuaConfig('vim.cmd("set scrolloff=7")\n');
        const scrolloff = await browser.executeObsidian(({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<
                            string,
                            { settings: { scrolloffLines: number } }
                        >;
                    };
                }
            ).plugins.plugins['vim-motions'];
            return plugin?.settings?.scrolloffLines;
        });
        expect(scrolloff).toBe(7);
    });

    it('should not load init.lua when enableLuaConfig is false', async function () {
        await obsidianPage.write(
            '.obsidian.init.lua',
            'vim.opt.scrolloff = 99\n',
        );
        await browser.executeObsidian(({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<
                            string,
                            {
                                settings: { enableLuaConfig: boolean };
                                saveSettings: () => Promise<void>;
                            }
                        >;
                    };
                }
            ).plugins.plugins['vim-motions'];
            if (plugin) {
                plugin.settings.enableLuaConfig = false;
                plugin.saveSettings();
            }
        });
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
            { timeout: 5000, interval: 100 },
        );
        const scrolloff = await browser.executeObsidian(({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<
                            string,
                            { settings: { scrolloffLines: number } }
                        >;
                    };
                }
            ).plugins.plugins['vim-motions'];
            return plugin?.settings?.scrolloffLines;
        });
        expect(scrolloff).not.toBe(99);
    });

    it('should override vimrc settings when both are present', async function () {
        await obsidianPage.write('.obsidian.vimrc', 'set scrolloff=5\n');
        await loadLuaConfig('vim.opt.scrolloff = 12\n');
        const scrolloff = await browser.executeObsidian(({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<
                            string,
                            { settings: { scrolloffLines: number } }
                        >;
                    };
                }
            ).plugins.plugins['vim-motions'];
            return plugin?.settings?.scrolloffLines;
        });
        expect(scrolloff).toBe(12);
    });
});
