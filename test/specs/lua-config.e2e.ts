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

    it('should not load init.lua when configMode is settings', async function () {
        await obsidianPage.write(
            '.obsidian.init.lua',
            'vim.opt.scrolloff = 99\n',
        );
        await browser.executeObsidian(async ({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<
                            string,
                            {
                                settings: { configMode: string };
                                saveSettings: () => Promise<void>;
                            }
                        >;
                    };
                }
            ).plugins.plugins['vim-motions'];
            if (plugin) {
                plugin.settings.configMode = 'settings';
                await plugin.saveSettings();
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
                                    { settings?: { configMode?: string } }
                                >;
                            };
                        }
                    ).plugins.plugins['vim-motions'];
                    return typeof plugin?.settings?.scrolloffLines === 'number';
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

    it('should support vim.fn.has for platform detection', async function () {
        await loadLuaConfig(
            'if vim.fn.has("desktop") == 1 then\n  vim.opt.scrolloff = 21\nend\n',
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
        expect(scrolloff).toBe(21);
    });

    it('should support vim.fn.has("obsidian") always returning 1', async function () {
        await loadLuaConfig(
            'if vim.fn.has("obsidian") == 1 then\n  vim.opt.scrolloff = 22\nend\n',
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
        expect(scrolloff).toBe(22);
    });

    it('should support vim.fn.expand("%") for active file path', async function () {
        await loadLuaConfig(
            'if vim.fn.expand("%") ~= "" then\n  vim.opt.scrolloff = 23\nelse\n  vim.opt.scrolloff = 99\nend\n',
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
        expect([23, 99]).toContain(scrolloff);
    });

    it('should support vim.fn.filereadable() for vault files', async function () {
        await loadLuaConfig(
            'if vim.fn.filereadable("Welcome.md") == 1 then\n  vim.opt.scrolloff = 24\nelse\n  vim.opt.scrolloff = 98\nend\n',
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
        expect(scrolloff).toBe(24);
    });

    it('should support vim.fn.localtime() returning a reasonable value', async function () {
        const now = Math.floor(Date.now() / 1000);
        await loadLuaConfig(
            `if vim.fn.localtime() >= ${now - 60} then\n  vim.opt.scrolloff = 25\nend\n`,
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
        expect(scrolloff).toBe(25);
    });

    it('should support vim.fn.isdirectory()', async function () {
        await loadLuaConfig(
            'if vim.fn.isdirectory(".obsidian") == 1 then\n  vim.opt.scrolloff = 26\nend\n',
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
        expect(scrolloff).toBe(26);
    });

    it('should support vim.fn.mode() returning a string', async function () {
        await loadLuaConfig(
            'if vim.fn.mode() ~= "" then\n  vim.opt.scrolloff = 27\nend\n',
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
        expect(scrolloff).toBe(27);
    });

    it('should support vim.notify() without crashing', async function () {
        await loadLuaConfig(
            'vim.notify("test notification")\nvim.opt.scrolloff = 28\n',
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
        expect(scrolloff).toBe(28);
    });

    it('should support nvim_create_autocmd for ModeChanged', async function () {
        await loadLuaConfig(
            'vim.api.nvim_create_autocmd("ModeChanged", {\n' +
                '    pattern = "*:*",\n' +
                '    callback = function(ev)\n' +
                '        if ev.data and ev.data.new_mode == "i" then\n' +
                '            vim.opt.scrolloff = 32\n' +
                '        end\n' +
                '    end\n' +
                '})\n',
        );
        await assertPluginLoaded();
    });

    it('should support nvim_create_augroup with clear', async function () {
        await loadLuaConfig(
            'local g = vim.api.nvim_create_augroup("test-group", { clear = true })\n' +
                'vim.api.nvim_create_autocmd("FocusGained", {\n' +
                '    group = g,\n' +
                '    callback = function() vim.opt.scrolloff = 33 end\n' +
                '})\n',
        );
        await assertPluginLoaded();
    });
});
