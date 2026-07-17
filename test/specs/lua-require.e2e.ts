import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { loadLuaConfig, getPluginSetting, PAUSE } from '../helpers';

type PluginRef = {
    vimrcLoaded?: boolean;
    luaLoaded?: boolean;
    loadLuaConfigForTest?: () => Promise<void>;
};

async function writeVaultFile(path: string, content: string): Promise<void> {
    await browser.executeObsidian(
        async ({ app }, p: string, c: string) => {
            const dir = p.substring(0, p.lastIndexOf('/'));
            if (dir) {
                try {
                    await app.vault.adapter.mkdir(dir);
                } catch {
                    /* exists */
                }
            }
            await app.vault.adapter.write(p, c);
        },
        path,
        content,
    );
}

async function removeVaultFile(path: string): Promise<void> {
    await browser.executeObsidian(async ({ app }, p: string) => {
        try {
            await app.vault.adapter.remove(p);
        } catch {
            /* absent */
        }
    }, path);
}

async function loadLuaConfigWithModules(
    modules: Record<string, string>,
    luaContent: string,
): Promise<void> {
    await browser.reloadObsidian({ vault: 'test-vault' });
    await obsidianPage.openFile('Welcome.md');
    await browser.waitUntil(
        async () =>
            (await browser.executeObsidian(({ app }) => {
                const p = (
                    app as unknown as {
                        plugins: { plugins: Record<string, PluginRef> };
                    }
                ).plugins.plugins['vim-motions'];
                return p?.vimrcLoaded === true;
            })) as boolean,
        { timeout: 10000, interval: 200 },
    );

    for (const [path, content] of Object.entries(modules)) {
        await writeVaultFile(path, content);
    }
    await browser.pause(300);

    await browser.executeObsidian(async ({ app }, lua: string) => {
        await app.vault.adapter.write(`${app.vault.configDir}.init.lua`, lua);
    }, luaContent);

    await browser.executeObsidian(async ({ app }) => {
        const p = (
            app as unknown as {
                plugins: { plugins: Record<string, PluginRef> };
            }
        ).plugins.plugins['vim-motions'];
        await p?.loadLuaConfigForTest?.();
    });

    await browser.waitUntil(
        async () =>
            (await browser.executeObsidian(({ app }) => {
                const p = (
                    app as unknown as {
                        plugins: { plugins: Record<string, PluginRef> };
                    }
                ).plugins.plugins['vim-motions'];
                return p?.luaLoaded === true;
            })) as boolean,
        { timeout: 10000, interval: 200 },
    );
}

describe('Lua require() — functional behavior', function () {
    it('require loads a module and returns its exported table', async function () {
        await loadLuaConfigWithModules(
            { 'lua/testmod.lua': 'local M = {}\nM.value = 99\nreturn M' },
            'local m = require("testmod")\nvim.opt.scrolloff = m.value',
        );
        expect(await getPluginSetting('scrolloffLines')).toBe(99);
    });

    it('require caches modules — second call returns same table', async function () {
        await loadLuaConfigWithModules(
            { 'lua/testmod.lua': 'return { id = math.random(1, 999999) }' },
            'local a = require("testmod")\nlocal b = require("testmod")\nvim.opt.scrolloff = (a == b) and 77 or 78',
        );
        expect(await getPluginSetting('scrolloffLines')).toBe(77);
    });

    it('require resolves dot-separated names to subdirectories', async function () {
        await loadLuaConfigWithModules(
            { 'lua/utils/strings.lua': 'return { val = 55 }' },
            'local s = require("utils.strings")\nvim.opt.scrolloff = s.val',
        );
        expect(await getPluginSetting('scrolloffLines')).toBe(55);
    });

    it('require passes module return value to caller', async function () {
        await loadLuaConfigWithModules(
            { 'lua/testmod.lua': 'return 42' },
            'local val = require("testmod")\nvim.opt.scrolloff = val',
        );
        expect(await getPluginSetting('scrolloffLines')).toBe(42);
    });

    it('module can use vim.opt', async function () {
        await loadLuaConfigWithModules(
            { 'lua/testmod.lua': 'vim.opt.scrolloff = 66\nreturn true' },
            'require("testmod")',
        );
        expect(await getPluginSetting('scrolloffLines')).toBe(66);
    });

    it('module can require other modules', async function () {
        await loadLuaConfigWithModules(
            {
                'lua/modA.lua': 'return { from_a = 10 }',
                'lua/modB.lua':
                    'local a = require("modA")\nreturn { sum = a.from_a + 20 }',
            },
            'local b = require("modB")\nvim.opt.scrolloff = b.sum',
        );
        expect(await getPluginSetting('scrolloffLines')).toBe(30);
    });

    it('module that returns nil caches true in package.loaded', async function () {
        await loadLuaConfigWithModules(
            { 'lua/sideeffect.lua': 'vim.opt.scrolloff = 88' },
            'require("sideeffect")\nlocal cached = package.loaded["sideeffect"]\nif cached == true then vim.opt.scrolloff = 89 end',
        );
        expect(await getPluginSetting('scrolloffLines')).toBe(89);
    });
});

describe('Lua require() — error handling', function () {
    it('missing module produces descriptive error catchable by pcall', async function () {
        await loadLuaConfig(
            'local ok, err = pcall(require, "nonexistent")\n' +
                'if not ok and err:find("not found") then vim.opt.scrolloff = 71 end',
        );
        expect(await getPluginSetting('scrolloffLines')).toBe(71);
    });

    it('module with syntax error produces descriptive error', async function () {
        await loadLuaConfigWithModules(
            { 'lua/broken.lua': 'this is !! not valid lua' },
            'local ok, err = pcall(require, "broken")\n' +
                'if not ok and err:find("error loading module") then vim.opt.scrolloff = 72 end',
        );
        expect(await getPluginSetting('scrolloffLines')).toBe(72);
    });

    it('module with runtime error produces descriptive error', async function () {
        await loadLuaConfigWithModules(
            { 'lua/crasher.lua': 'error("module crashed on purpose")' },
            'local ok, err = pcall(require, "crasher")\n' +
                'if not ok and err:find("error in module") then vim.opt.scrolloff = 73 end',
        );
        expect(await getPluginSetting('scrolloffLines')).toBe(73);
    });

    it('failed require clears package.loaded sentinel', async function () {
        await loadLuaConfigWithModules(
            { 'lua/crasher.lua': 'error("crash")' },
            'pcall(require, "crasher")\nvim.opt.scrolloff = (package.loaded["crasher"] == nil) and 74 or 75',
        );
        expect(await getPluginSetting('scrolloffLines')).toBe(74);
    });
});

describe('Lua require() — sandbox security', function () {
    it('path traversal via ".." is rejected', async function () {
        await loadLuaConfig(
            'local ok, err = pcall(require, "../../etc/passwd")\n' +
                'if not ok and err:find("path traversal") then vim.opt.scrolloff = 81 end',
        );
        expect(await getPluginSetting('scrolloffLines')).toBe(81);
    });

    it('absolute path starting with "/" is rejected', async function () {
        await loadLuaConfig(
            'local ok, err = pcall(require, "/etc/passwd")\n' +
                'if not ok and err:find("path traversal") then vim.opt.scrolloff = 82 end',
        );
        expect(await getPluginSetting('scrolloffLines')).toBe(82);
    });

    it('backslash path is rejected', async function () {
        await loadLuaConfig(
            'local ok, err = pcall(require, "\\\\Windows\\\\System32")\n' +
                'if not ok and err:find("path traversal") then vim.opt.scrolloff = 83 end',
        );
        expect(await getPluginSetting('scrolloffLines')).toBe(83);
    });

    it('dofile remains disabled', async function () {
        await loadLuaConfig(
            'local ok = pcall(function() dofile("test") end)\nvim.opt.scrolloff = ok and 90 or 84',
        );
        expect(await getPluginSetting('scrolloffLines')).toBe(84);
    });

    it('loadfile remains disabled', async function () {
        await loadLuaConfig(
            'local ok = pcall(function() loadfile("test") end)\nvim.opt.scrolloff = ok and 90 or 85',
        );
        expect(await getPluginSetting('scrolloffLines')).toBe(85);
    });

    it('rawget remains disabled', async function () {
        await loadLuaConfig(
            'local ok = pcall(function() rawget({}, 1) end)\nvim.opt.scrolloff = ok and 90 or 86',
        );
        expect(await getPluginSetting('scrolloffLines')).toBe(86);
    });

    it('rawset remains disabled', async function () {
        await loadLuaConfig(
            'local ok = pcall(function() rawset({}, 1, 1) end)\nvim.opt.scrolloff = ok and 90 or 87',
        );
        expect(await getPluginSetting('scrolloffLines')).toBe(87);
    });

    it('load() works for string compilation', async function () {
        await loadLuaConfig(
            'local fn = load("return 1 + 2")\nvim.opt.scrolloff = fn()',
        );
        expect(await getPluginSetting('scrolloffLines')).toBe(3);
    });

    it('load() returns nil + error for invalid syntax', async function () {
        await loadLuaConfig(
            'local fn, err = load("invalid!!!")\nvim.opt.scrolloff = (fn == nil and err ~= nil) and 88 or 90',
        );
        expect(await getPluginSetting('scrolloffLines')).toBe(88);
    });

    it('module cannot escape sandbox via load()', async function () {
        await loadLuaConfigWithModules(
            {
                'lua/testmod.lua':
                    'local fn = load("return dofile")\nlocal df = fn()\nreturn { escaped = df ~= nil }',
            },
            'local m = require("testmod")\nvim.opt.scrolloff = m.escaped and 90 or 89',
        );
        expect(await getPluginSetting('scrolloffLines')).toBe(89);
    });

    it('modules are restricted to lua/ path', async function () {
        await loadLuaConfig(
            'local ok, err = pcall(require, "Welcome")\n' +
                'if not ok and err:find("not found") then vim.opt.scrolloff = 91 end',
        );
        expect(await getPluginSetting('scrolloffLines')).toBe(91);
    });
});
