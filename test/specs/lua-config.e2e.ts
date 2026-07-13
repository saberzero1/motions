import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    vimKeys,
    getEditorValue,
    getRegisterContent,
    sendVimEscape,
    PAUSE,
} from '../helpers';

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

    it('should apply vim.obsidian.cursor.set for cursor shapes', async function () {
        await loadLuaConfig(
            'vim.obsidian.cursor.set({ normal = "bar", insert = "block" })\n',
        );
        const shapes = await browser.executeObsidian(({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<
                            string,
                            {
                                settings: {
                                    cursorShapes: Record<string, string>;
                                };
                            }
                        >;
                    };
                }
            ).plugins.plugins['vim-motions'];
            return plugin?.settings?.cursorShapes;
        });
        expect(shapes).toHaveProperty('normal', 'bar');
        expect(shapes).toHaveProperty('insert', 'block');
    });

    it('should apply vim.obsidian.modeprompt.set for mode prompts', async function () {
        await loadLuaConfig(
            'vim.obsidian.modeprompt.set({ normal = "NOR", insert = "INS" })\n',
        );
        const prompts = await browser.executeObsidian(({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<
                            string,
                            {
                                settings: {
                                    modePrompts: Record<string, string>;
                                };
                            }
                        >;
                    };
                }
            ).plugins.plugins['vim-motions'];
            return plugin?.settings?.modePrompts;
        });
        expect(prompts).toHaveProperty('normal', 'NOR');
        expect(prompts).toHaveProperty('insert', 'INS');
    });

    it('should apply custom surround pair via vim.obsidian.surround.set (ys)', async function () {
        await loadLuaConfig(
            'vim.obsidian.surround.set("l", { left = "[[", right = "]]" })\n',
        );
        await setupEditor('hello world', { line: 0, ch: 0 });
        await vimKeys('y', 's', 'i', 'w', 'l');
        expect(await getEditorValue()).toBe('[[hello]] world');
    });

    it('should delete custom surround pair via ds', async function () {
        await loadLuaConfig(
            'vim.obsidian.surround.set("l", { left = "[[", right = "]]" })\n',
        );
        await setupEditor('[[hello]] world', { line: 0, ch: 3 });
        await vimKeys('d', 's', 'l');
        expect(await getEditorValue()).toBe('hello world');
    });

    it('should change custom surround pair via cs', async function () {
        await loadLuaConfig(
            'vim.obsidian.surround.set("l", { left = "[[", right = "]]" })\n',
        );
        await setupEditor('[[hello]] world', { line: 0, ch: 3 });
        await vimKeys('c', 's', 'l', ')');
        expect(await getEditorValue()).toBe('(hello) world');
    });

    it('should apply batch surround pairs via vim.obsidian.surround.add', async function () {
        await loadLuaConfig(
            'vim.obsidian.surround.add({\n' +
                '    { "l", left = "[[", right = "]]" },\n' +
                '    { "m", left = "$$", right = "$$" },\n' +
                '})\n',
        );
        await setupEditor('hello world', { line: 0, ch: 0 });
        await vimKeys('y', 's', 'i', 'w', 'm');
        expect(await getEditorValue()).toBe('$$hello$$ world');
    });

    it('should not break builtin surround after custom pair registration', async function () {
        await loadLuaConfig(
            'vim.obsidian.surround.set("l", { left = "[[", right = "]]" })\n',
        );
        await setupEditor('(hello) world', { line: 0, ch: 3 });
        await vimKeys('d', 's', ')');
        expect(await getEditorValue()).toBe('hello world');
    });

    it('should register leader binding that executes an Obsidian command', async function () {
        await loadLuaConfig(
            'vim.g.mapleader = "\\\\"\n' +
                'vim.obsidian.leader.set("z", "app:reload", { desc = "Reload" })\n',
        );
        await assertPluginLoaded();
    });

    it('should register batch leader bindings via vim.obsidian.leader.add', async function () {
        await loadLuaConfig(
            'vim.g.mapleader = "\\\\"\n' +
                'vim.obsidian.leader.add({\n' +
                '    { "z", "app:reload", desc = "Reload" },\n' +
                '})\n',
        );
        await assertPluginLoaded();
    });

    it('should surround entire line with custom pair via yss', async function () {
        await loadLuaConfig(
            'vim.obsidian.surround.set("l", { left = "[[", right = "]]" })\n',
        );
        await setupEditor('hello world', { line: 0, ch: 0 });
        await vimKeys('y', 's', 's', 'l');
        expect(await getEditorValue()).toBe('[[hello world]]');
    });

    it('should surround visual selection with custom pair via S', async function () {
        await loadLuaConfig(
            'vim.obsidian.surround.set("l", { left = "[[", right = "]]" })\n',
        );
        await setupEditor('hello world', { line: 0, ch: 0 });
        await vimKeys('v', 'e', 'S', 'l');
        expect(await getEditorValue()).toBe('[[hello]] world');
    });

    it('should remove custom pair via vim.obsidian.surround.del', async function () {
        await loadLuaConfig(
            'vim.obsidian.surround.set("l", { left = "[[", right = "]]" })\n' +
                'vim.obsidian.surround.del("l")\n',
        );
        await setupEditor('[[hello]] world', { line: 0, ch: 3 });
        await vimKeys('d', 's', 'l');
        expect(await getEditorValue()).toBe('[[hello]] world');
    });

    it('should reject all reserved surround chars gracefully', async function () {
        await loadLuaConfig(
            'local reserved = { "(", ")", "[", "]", "{", "}", "<", ">", "b", "B", "r", "a", "t", "T", "f", "F", \'"\', "\'", "`" }\n' +
                'local all_rejected = true\n' +
                'for _, ch in ipairs(reserved) do\n' +
                '    local ok = pcall(function() vim.obsidian.surround.set(ch, { left = "<<", right = ">>" }) end)\n' +
                '    if ok then all_rejected = false end\n' +
                'end\n' +
                'if all_rejected then vim.opt.scrolloff = 99 end\n',
        );
        await assertPluginLoaded();
    });

    it('should survive vim.obsidian.surround.set with reserved char gracefully', async function () {
        await loadLuaConfig(
            'local ok, err = pcall(function()\n' +
                '    vim.obsidian.surround.set("(", { left = "<<", right = ">>" })\n' +
                'end)\n' +
                'if not ok then vim.opt.scrolloff = 42 end\n',
        );
        await assertPluginLoaded();
    });

    it('should survive vim.obsidian.leader.del without error', async function () {
        await loadLuaConfig(
            'vim.g.mapleader = "\\\\"\n' +
                'vim.obsidian.leader.set("z", "app:reload", { desc = "Reload" })\n' +
                'vim.obsidian.leader.del("z")\n',
        );
        await assertPluginLoaded();
    });

    describe('vim.opt.clipboard via Lua', function () {
        before(async function () {
            await loadLuaConfig('vim.opt.clipboard = "unnamed"\n');
        });

        it('should apply clipboard=unnamed from init.lua', async function () {
            const clip = await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins: {
                            plugins: Record<
                                string,
                                { settings: { clipboard: string } }
                            >;
                        };
                    }
                ).plugins.plugins['vim-motions'];
                return plugin?.settings?.clipboard;
            });
            expect(clip).toBe('unnamed');
        });

        it('yy should populate the + register when clipboard=unnamed set via Lua', async function () {
            await setupEditor('lua clipboard test', { line: 0, ch: 0 });
            await vimKeys('y', 'y');
            const reg = await getRegisterContent('+');
            expect(reg).not.toBeNull();
            expect(reg!.text).toContain('lua clipboard test');
        });

        it('yw should populate the + register when clipboard=unnamed set via Lua', async function () {
            await setupEditor('hello world', { line: 0, ch: 0 });
            await vimKeys('y', 'w');
            const reg = await getRegisterContent('+');
            expect(reg).not.toBeNull();
            expect(reg!.text).toContain('hello');
        });

        it('dd should populate the + register when clipboard=unnamed set via Lua', async function () {
            await setupEditor('delete me\nkeep me', { line: 0, ch: 0 });
            await vimKeys('d', 'd');
            const reg = await getRegisterContent('+');
            expect(reg).not.toBeNull();
            expect(reg!.text).toContain('delete me');
        });
    });

    it('should apply vim.opt.textwidth from init.lua', async function () {
        await loadLuaConfig('vim.opt.textwidth = 120\n');
        const tw = await browser.executeObsidian(({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<
                            string,
                            { settings: { textwidth: number } }
                        >;
                    };
                }
            ).plugins.plugins['vim-motions'];
            return plugin?.settings?.textwidth;
        });
        expect(tw).toBe(120);
    });

    it('should apply vim.opt.tw alias from init.lua', async function () {
        await loadLuaConfig('vim.opt.tw = 100\n');
        const tw = await browser.executeObsidian(({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<
                            string,
                            { settings: { textwidth: number } }
                        >;
                    };
                }
            ).plugins.plugins['vim-motions'];
            return plugin?.settings?.textwidth;
        });
        expect(tw).toBe(100);
    });

    describe('vimrc + Lua override precedence (lua-vimrc mode)', function () {
        async function loadDualConfig(
            vimrcContent: string,
            luaContent: string,
        ): Promise<void> {
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
                    plugin.settings.configMode = 'lua-vimrc';
                    await plugin.saveSettings();
                }
            });
            await obsidianPage.write('.obsidian.vimrc', vimrcContent);
            const luaPath = await browser.executeObsidian(({ app }) => {
                return `${app.vault.configDir}.init.lua`;
            });
            await obsidianPage.write(luaPath as string, luaContent);
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
                                        { luaLoaded?: boolean }
                                    >;
                                };
                            }
                        ).plugins.plugins['vim-motions'];
                        return plugin?.luaLoaded === true;
                    })) as boolean,
                { timeout: 15000, interval: 200 },
            );
        }

        it('Lua clipboard should override vimrc clipboard', async function () {
            await loadDualConfig(
                'set clipboard=unnamed\n',
                'vim.opt.clipboard = "unnamedplus"\n',
            );
            const clip = await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins: {
                            plugins: Record<
                                string,
                                { settings: { clipboard: string } }
                            >;
                        };
                    }
                ).plugins.plugins['vim-motions'];
                return plugin?.settings?.clipboard;
            });
            expect(clip).toBe('unnamedplus');
        });

        it('Lua textwidth should override vimrc textwidth', async function () {
            await loadDualConfig(
                'set textwidth=100\n',
                'vim.opt.textwidth = 72\n',
            );
            const tw = await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins: {
                            plugins: Record<
                                string,
                                { settings: { textwidth: number } }
                            >;
                        };
                    }
                ).plugins.plugins['vim-motions'];
                return plugin?.settings?.textwidth;
            });
            expect(tw).toBe(72);
        });

        it('Lua scrolloff should override vimrc scrolloff', async function () {
            await loadDualConfig(
                'set scrolloff=3\n',
                'vim.opt.scrolloff = 15\n',
            );
            const so = await browser.executeObsidian(({ app }) => {
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
            expect(so).toBe(15);
        });

        it('unknown Lua option should not break vimrc clipboard', async function () {
            await loadDualConfig(
                'set clipboard=unnamed\n',
                'vim.opt.nonexistentoption = "foo"\n',
            );
            const clip = await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins: {
                            plugins: Record<
                                string,
                                { settings: { clipboard: string } }
                            >;
                        };
                    }
                ).plugins.plugins['vim-motions'];
                return plugin?.settings?.clipboard;
            });
            expect(clip).toBe('unnamed');
        });

        it('invalid Lua textwidth should not overwrite valid vimrc textwidth', async function () {
            await loadDualConfig(
                'set textwidth=100\n',
                'vim.opt.textwidth = -5\n',
            );
            const tw = await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins: {
                            plugins: Record<
                                string,
                                { settings: { textwidth: number } }
                            >;
                        };
                    }
                ).plugins.plugins['vim-motions'];
                return plugin?.settings?.textwidth;
            });
            expect(tw).toBe(100);
        });
    });
});
