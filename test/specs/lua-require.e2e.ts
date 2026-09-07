import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    loadLuaConfig,
    getPluginSetting,
    setPluginSetting,
    setupEditor,
    vimRawKeys,
    getEditorValue,
    PAUSE,
} from '../helpers';

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

async function reloadLuaConfigInPlace(): Promise<void> {
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

    await reloadLuaConfigInPlace();
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

    it('rawget is available', async function () {
        await loadLuaConfig(
            'local ok = pcall(function() rawget({}, 1) end)\nvim.opt.scrolloff = ok and 90 or 86',
        );
        expect(await getPluginSetting('scrolloffLines')).toBe(90);
    });

    it('rawset is available', async function () {
        await loadLuaConfig(
            'local ok = pcall(function() rawset({}, 1, 1) end)\nvim.opt.scrolloff = ok and 90 or 87',
        );
        expect(await getPluginSetting('scrolloffLines')).toBe(90);
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

describe('Lua require() — modules beside a custom init.lua (#177)', function () {
    const CONFIG_DIR = 'issue177';
    const CONFIG_PATH = `${CONFIG_DIR}/init.lua`;
    const MODULE_PATH = `${CONFIG_DIR}/lua/regex.lua`;
    const NESTED_MODULE_PATH = `${CONFIG_DIR}/lua/deep/nested.lua`;

    async function loadFromCustomPath(configBody: string): Promise<void> {
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

        await writeVaultFile(CONFIG_PATH, configBody);
        await writeVaultFile(MODULE_PATH, 'return { val = 42 }');
        await writeVaultFile(NESTED_MODULE_PATH, 'return { val = 43 }');
        await browser.pause(300);

        await setPluginSetting('luaConfigPath', CONFIG_PATH);
        // A sentinel distinct from every value the modules set, so the
        // assertions cannot pass on a stale value left by an earlier spec.
        await setPluginSetting('scrolloffLines', 3);
        await reloadLuaConfigInPlace();
    }

    after(async function () {
        await setPluginSetting('luaConfigPath', '');
        await removeVaultFile(MODULE_PATH);
        await removeVaultFile(NESTED_MODULE_PATH);
        await removeVaultFile(CONFIG_PATH);
    });

    it('resolves a module from the configured init.lua directory', async function () {
        await loadFromCustomPath(
            'local m = require("regex")\nvim.opt.scrolloff = m.val',
        );
        expect(await getPluginSetting('scrolloffLines')).toBe(42);
    });

    it('resolves a dot-separated submodule from that directory', async function () {
        await loadFromCustomPath(
            'local m = require("deep.nested")\nvim.opt.scrolloff = m.val',
        );
        expect(await getPluginSetting('scrolloffLines')).toBe(43);
    });

    it('still resolves vault-root modules when a custom path is set', async function () {
        await loadFromCustomPath(
            'local m = require("rootmod")\nvim.opt.scrolloff = m.val',
        );
        // Written after the load above, so this needs its own reload.
        await writeVaultFile('lua/rootmod.lua', 'return { val = 44 }');
        await browser.pause(300);
        await reloadLuaConfigInPlace();
        try {
            expect(await getPluginSetting('scrolloffLines')).toBe(44);
        } finally {
            await removeVaultFile('lua/rootmod.lua');
        }
    });

    it('serves the config directory to a synchronous keymap callback', async function () {
        await loadFromCustomPath(
            [
                `vim.keymap.set('n', 'Q', function()`,
                `  local ok, m = pcall(require, 'regex')`,
                `  local out = ok and ('ok:' .. tostring(m.val)) or ('err:' .. tostring(m))`,
                `  vim.api.nvim_buf_set_lines(0, 0, -1, false, { out })`,
                `end)`,
            ].join('\n'),
        );

        await setupEditor('placeholder', { line: 0, ch: 0 });
        await vimRawKeys('Q');
        await browser.pause(PAUSE.EDITOR_SETTLE);
        expect((await getEditorValue()).trim()).toBe('ok:42');
    });
});

describe('Lua require() — the snapshot reload boundary', function () {
    const LATE_MODULE = 'lua/late_addition.lua';

    // Requires from a keymap callback, which runs on the main state and cannot
    // yield — so it is served by the snapshot alone, never by a vault read.
    const PROBE_LUA = [
        `vim.keymap.set('n', 'Q', function()`,
        `  local ok, res = pcall(require, 'late_addition')`,
        `  local out`,
        `  if ok then out = 'ok:' .. tostring(res.marker)`,
        `  else out = 'err:' .. tostring(res) end`,
        `  vim.api.nvim_buf_set_lines(0, 0, -1, false, { out })`,
        `end)`,
    ].join('\n');

    async function pressProbe(): Promise<string> {
        await setupEditor('placeholder', { line: 0, ch: 0 });
        await vimRawKeys('Q');
        await browser.pause(PAUSE.EDITOR_SETTLE);
        return (await getEditorValue()).trim();
    }

    after(async function () {
        await removeVaultFile(LATE_MODULE);
    });

    it('takes a reload to see a file created after the snapshot', async function () {
        await removeVaultFile(LATE_MODULE);
        await loadLuaConfigWithModules({}, PROBE_LUA);

        expect(await pressProbe()).toContain('err:');

        await writeVaultFile(LATE_MODULE, 'return { marker = "late" }');
        await browser.pause(300);

        // The file is on disk now. It is still not requirable, and the message
        // names the snapshot rather than claiming the module does not exist —
        // that distinction is what makes the reload boundary discoverable.
        const afterWrite = await pressProbe();
        expect(afterWrite).toContain(
            'not present in the configuration snapshot',
        );
        expect(afterWrite).toContain(LATE_MODULE);
        expect(afterWrite).toContain('lua/late_addition/init.lua');

        await reloadLuaConfigInPlace();

        expect(await pressProbe()).toBe('ok:late');
    });
});
