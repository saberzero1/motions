import { describe, it, expect, vi } from 'vitest';
import { lua, lauxlib, to_jsstring, to_luastring } from 'fengari';
import { createSandboxedState, destroyState } from '../../../src/lua/engine';
import { injectVimApi } from '../../../src/lua/api';
import { AutocmdManager } from '../../../src/lua/autocmd';

type LuaState = ReturnType<typeof createSandboxedState>;

const injectApi = (
    L: LuaState,
    callbacks: Omit<Parameters<typeof injectVimApi>[1], 'autocmdManager'>,
) => injectVimApi(L, { ...callbacks, autocmdManager: new AutocmdManager(L) });

describe('vim api', () => {
    it('should set vim.opt values via onSettingOverride', () => {
        const L = createSandboxedState();
        const onSettingOverride = vi.fn();
        injectApi(L, {
            onSettingOverride,
            handleExCommand: () => {},
            getVaultName: () => 'vault',
            onKeymap: () => {},
            onKeymapDel: () => {},
        });

        const status = lauxlib.luaL_dostring(
            L,
            to_luastring('vim.opt.scrolloff = 3'),
        );
        expect(status).toBe(lua.LUA_OK);
        expect(onSettingOverride).toHaveBeenCalledWith(
            'scrolloffLines',
            3,
            'vim.opt.scrolloff = 3',
        );
        destroyState(L);
    });

    it('should handle vim.opt.guicursor', () => {
        const L = createSandboxedState();
        const onSettingOverride = vi.fn();
        injectApi(L, {
            onSettingOverride,
            handleExCommand: () => {},
            getVaultName: () => 'vault',
            onKeymap: () => {},
            onKeymapDel: () => {},
        });

        const status = lauxlib.luaL_dostring(
            L,
            to_luastring('vim.opt.guicursor = "n:bar,i:block"'),
        );
        expect(status).toBe(lua.LUA_OK);
        expect(onSettingOverride).toHaveBeenCalledWith(
            'cursorShapes',
            { normal: 'bar', insert: 'block' },
            'vim.opt.guicursor = "n:bar,i:block"',
        );
        destroyState(L);
    });

    it('should read vim.opt values via getOption', () => {
        const L = createSandboxedState();
        injectApi(L, {
            onSettingOverride: () => {},
            handleExCommand: () => {},
            getVaultName: () => 'vault',
            onKeymap: () => {},
            onKeymapDel: () => {},
            getOption: (name) => (name === 'scrolloff' ? 7 : undefined),
        });

        const status = lauxlib.luaL_dostring(
            L,
            to_luastring('return vim.opt.scrolloff'),
        );
        expect(status).toBe(lua.LUA_OK);
        expect(lua.lua_tonumber(L, -1)).toBe(7);
        destroyState(L);
    });

    it('should set vim.g.mapleader via callback', () => {
        const L = createSandboxedState();
        const setLeaderKey = vi.fn();
        injectApi(L, {
            onSettingOverride: () => {},
            handleExCommand: () => {},
            getVaultName: () => 'vault',
            onKeymap: () => {},
            onKeymapDel: () => {},
            setLeaderKey,
        });

        const status = lauxlib.luaL_dostring(
            L,
            to_luastring('vim.g.mapleader = ","'),
        );
        expect(status).toBe(lua.LUA_OK);
        expect(setLeaderKey).toHaveBeenCalledWith(',');
        destroyState(L);
    });

    it('should register vim.keymap.set string mapping', () => {
        const L = createSandboxedState();
        const onKeymap = vi.fn();
        injectApi(L, {
            onSettingOverride: () => {},
            handleExCommand: () => {},
            getVaultName: () => 'vault',
            onKeymap,
            onKeymapDel: () => {},
        });

        const status = lauxlib.luaL_dostring(
            L,
            to_luastring(
                "vim.keymap.set('n', 'x', 'y', { desc = 'Do thing' })",
            ),
        );
        expect(status).toBe(lua.LUA_OK);
        expect(onKeymap).toHaveBeenCalledWith(
            expect.objectContaining({
                mode: 'normal',
                lhs: 'x',
                rhs: 'y',
                desc: 'Do thing',
                isFn: false,
            }),
        );
        destroyState(L);
    });

    it('should register vim.keymap.set function mapping', () => {
        const L = createSandboxedState();
        const onKeymap = vi.fn();
        injectApi(L, {
            onSettingOverride: () => {},
            handleExCommand: () => {},
            getVaultName: () => 'vault',
            onKeymap,
            onKeymapDel: () => {},
        });

        const status = lauxlib.luaL_dostring(
            L,
            to_luastring("vim.keymap.set('n', 'x', function() end)"),
        );
        expect(status).toBe(lua.LUA_OK);
        expect(onKeymap).toHaveBeenCalledWith(
            expect.objectContaining({
                mode: 'normal',
                lhs: 'x',
                isFn: true,
            }),
        );
        destroyState(L);
    });

    it('should forward vim.cmd calls to handler', () => {
        const L = createSandboxedState();
        const handleExCommand = vi.fn();
        injectApi(L, {
            onSettingOverride: () => {},
            handleExCommand,
            getVaultName: () => 'vault',
            onKeymap: () => {},
            onKeymapDel: () => {},
        });

        const status = lauxlib.luaL_dostring(
            L,
            to_luastring("vim.cmd('echo hi')"),
        );
        expect(status).toBe(lua.LUA_OK);
        expect(handleExCommand).toHaveBeenCalledWith('echo hi');
        destroyState(L);
    });

    it('should report syntax errors with line number', () => {
        const L = createSandboxedState();
        injectApi(L, {
            onSettingOverride: () => {},
            handleExCommand: () => {},
            getVaultName: () => 'vault',
            onKeymap: () => {},
            onKeymapDel: () => {},
        });

        const status = lauxlib.luaL_dostring(L, to_luastring('local x = '));
        expect(status).not.toBe(lua.LUA_OK);
        const message = lua.lua_tolstring(L, -1);
        const error = message ? to_jsstring(message) : '';
        expect(error).toMatch(/:1:/);
        lua.lua_pop(L, 1);
        destroyState(L);
    });

    it('should report runtime errors', () => {
        const L = createSandboxedState();
        injectApi(L, {
            onSettingOverride: () => {},
            handleExCommand: () => {},
            getVaultName: () => 'vault',
            onKeymap: () => {},
            onKeymapDel: () => {},
        });

        const status = lauxlib.luaL_dostring(L, to_luastring("error('boom')"));
        expect(status).not.toBe(lua.LUA_OK);
        const message = lua.lua_tolstring(L, -1);
        const error = message ? to_jsstring(message) : '';
        expect(error).toContain('boom');
        lua.lua_pop(L, 1);
        destroyState(L);
    });

    it('should call vim.notify callback', () => {
        const L = createSandboxedState();
        const showNotice = vi.fn();
        injectApi(L, {
            onSettingOverride: () => {},
            handleExCommand: () => {},
            getVaultName: () => 'vault',
            onKeymap: () => {},
            onKeymapDel: () => {},
            showNotice,
        });

        const status = lauxlib.luaL_dostring(
            L,
            to_luastring('vim.notify("hello")'),
        );
        expect(status).toBe(lua.LUA_OK);
        expect(showNotice).toHaveBeenCalledWith('hello');
        destroyState(L);
    });

    it('should register user commands via vim.api.nvim_create_user_command with string RHS', () => {
        const L = createSandboxedState();
        const handleExCommand = vi.fn();
        const defineExCommand = vi.fn();
        injectApi(L, {
            onSettingOverride: () => {},
            handleExCommand,
            getVaultName: () => 'vault',
            onKeymap: () => {},
            onKeymapDel: () => {},
            defineExCommand,
        });

        const status = lauxlib.luaL_dostring(
            L,
            to_luastring('vim.api.nvim_create_user_command("W", "w", {})'),
        );
        expect(status).toBe(lua.LUA_OK);
        expect(defineExCommand).toHaveBeenCalledWith('W', expect.any(Function));
        destroyState(L);
    });

    it('should register user commands via vim.api.nvim_create_user_command with function callback', () => {
        const L = createSandboxedState();
        const defineExCommand = vi.fn();
        injectApi(L, {
            onSettingOverride: () => {},
            handleExCommand: () => {},
            getVaultName: () => 'vault',
            onKeymap: () => {},
            onKeymapDel: () => {},
            defineExCommand,
        });

        const status = lauxlib.luaL_dostring(
            L,
            to_luastring(
                'vim.api.nvim_create_user_command("MyCmd", function(opts) end, {})',
            ),
        );
        expect(status).toBe(lua.LUA_OK);
        expect(defineExCommand).toHaveBeenCalledWith(
            'MyCmd',
            expect.any(Function),
        );
        destroyState(L);
    });

    it('should error on unsupported vim.api functions', () => {
        const L = createSandboxedState();
        injectApi(L, {
            onSettingOverride: () => {},
            handleExCommand: () => {},
            getVaultName: () => 'vault',
            onKeymap: () => {},
            onKeymapDel: () => {},
        });

        const status = lauxlib.luaL_dostring(
            L,
            to_luastring('return vim.api.nvim_buf_get_mark(0, "a")'),
        );
        expect(status).not.toBe(lua.LUA_OK);
        const err = lua.lua_tolstring(L, -1);
        expect(err ? to_jsstring(err) : '').toContain(
            'nvim_create_user_command',
        );
        destroyState(L);
    });

    describe('vim.obsidian', () => {
        it('should return vault name', () => {
            const L = createSandboxedState();
            injectApi(L, {
                onSettingOverride: () => {},
                handleExCommand: () => {},
                getVaultName: () => 'vault',
                onKeymap: () => {},
                onKeymapDel: () => {},
            });

            const status = lauxlib.luaL_dostring(
                L,
                to_luastring('return vim.obsidian.vault_name()'),
            );
            expect(status).toBe(lua.LUA_OK);
            const value = lua.lua_tolstring(L, -1);
            expect(value ? to_jsstring(value) : '').toBe('vault');
            destroyState(L);
        });

        it('should return app version', () => {
            const L = createSandboxedState();
            injectApi(L, {
                onSettingOverride: () => {},
                handleExCommand: () => {},
                getVaultName: () => 'vault',
                onKeymap: () => {},
                onKeymapDel: () => {},
                getAppVersion: () => '1.2.3',
            });

            const status = lauxlib.luaL_dostring(
                L,
                to_luastring('return vim.obsidian.app_version()'),
            );
            expect(status).toBe(lua.LUA_OK);
            const value = lua.lua_tolstring(L, -1);
            expect(value ? to_jsstring(value) : '').toBe('1.2.3');
            destroyState(L);
        });

        it('should alias as vim.ob', () => {
            const L = createSandboxedState();
            injectApi(L, {
                onSettingOverride: () => {},
                handleExCommand: () => {},
                getVaultName: () => 'vault',
                onKeymap: () => {},
                onKeymapDel: () => {},
            });

            const status = lauxlib.luaL_dostring(
                L,
                to_luastring('return vim.ob == vim.obsidian'),
            );
            expect(status).toBe(lua.LUA_OK);
            expect(lua.lua_toboolean(L, -1)).toBe(true);
            destroyState(L);
        });

        it('should return current file info', () => {
            const L = createSandboxedState();
            injectApi(L, {
                onSettingOverride: () => {},
                handleExCommand: () => {},
                getVaultName: () => 'vault',
                onKeymap: () => {},
                onKeymapDel: () => {},
                getCurrentFile: () => ({
                    path: 'notes/test.md',
                    name: 'test.md',
                    extension: 'md',
                    basename: 'test',
                }),
            });

            const status = lauxlib.luaL_dostring(
                L,
                to_luastring(
                    'local file = vim.obsidian.current_file()\nreturn file.path .. "|" .. file.name .. "|" .. file.extension .. "|" .. file.basename',
                ),
            );
            expect(status).toBe(lua.LUA_OK);
            const value = lua.lua_tolstring(L, -1);
            expect(value ? to_jsstring(value) : '').toBe(
                'notes/test.md|test.md|md|test',
            );
            destroyState(L);
        });

        it('should return nil for current_file when no file', () => {
            const L = createSandboxedState();
            injectApi(L, {
                onSettingOverride: () => {},
                handleExCommand: () => {},
                getVaultName: () => 'vault',
                onKeymap: () => {},
                onKeymapDel: () => {},
                getCurrentFile: () => null,
            });

            const status = lauxlib.luaL_dostring(
                L,
                to_luastring('return vim.obsidian.current_file() == nil'),
            );
            expect(status).toBe(lua.LUA_OK);
            expect(lua.lua_toboolean(L, -1)).toBe(true);
            destroyState(L);
        });

        it('should return plugin version', () => {
            const L = createSandboxedState();
            injectApi(L, {
                onSettingOverride: () => {},
                handleExCommand: () => {},
                getVaultName: () => 'vault',
                onKeymap: () => {},
                onKeymapDel: () => {},
                getPluginVersion: () => '2.5.0',
            });

            const status = lauxlib.luaL_dostring(
                L,
                to_luastring('return vim.obsidian.plugin_version()'),
            );
            expect(status).toBe(lua.LUA_OK);
            const value = lua.lua_tolstring(L, -1);
            expect(value ? to_jsstring(value) : '').toBe('2.5.0');
            destroyState(L);
        });

        it('should return vault path', () => {
            const L = createSandboxedState();
            injectApi(L, {
                onSettingOverride: () => {},
                handleExCommand: () => {},
                getVaultName: () => 'vault',
                onKeymap: () => {},
                onKeymapDel: () => {},
                getVaultPath: () => '/home/user/vault',
            });

            const status = lauxlib.luaL_dostring(
                L,
                to_luastring('return vim.obsidian.vault_path()'),
            );
            expect(status).toBe(lua.LUA_OK);
            const value = lua.lua_tolstring(L, -1);
            expect(value ? to_jsstring(value) : '').toBe('/home/user/vault');
            destroyState(L);
        });

        it('should call run_command with command id', () => {
            const L = createSandboxedState();
            const executeCommand = vi.fn();
            injectApi(L, {
                onSettingOverride: () => {},
                handleExCommand: () => {},
                getVaultName: () => 'vault',
                onKeymap: () => {},
                onKeymapDel: () => {},
                executeCommand,
            });

            const status = lauxlib.luaL_dostring(
                L,
                to_luastring('vim.obsidian.run_command("app:reload")'),
            );
            expect(status).toBe(lua.LUA_OK);
            expect(executeCommand).toHaveBeenCalledWith('app:reload');
            destroyState(L);
        });

        it('should return list of commands', () => {
            const L = createSandboxedState();
            injectApi(L, {
                onSettingOverride: () => {},
                handleExCommand: () => {},
                getVaultName: () => 'vault',
                onKeymap: () => {},
                onKeymapDel: () => {},
                listCommands: () => [{ id: 'app:reload', name: 'Reload' }],
            });

            const status = lauxlib.luaL_dostring(
                L,
                to_luastring(
                    'local cmds = vim.obsidian.list_commands()\nreturn cmds[1].id .. "|" .. cmds[1].name',
                ),
            );
            expect(status).toBe(lua.LUA_OK);
            const value = lua.lua_tolstring(L, -1);
            expect(value ? to_jsstring(value) : '').toBe('app:reload|Reload');
            destroyState(L);
        });

        it('should call open_file with path', () => {
            const L = createSandboxedState();
            const openFile = vi.fn();
            injectApi(L, {
                onSettingOverride: () => {},
                handleExCommand: () => {},
                getVaultName: () => 'vault',
                onKeymap: () => {},
                onKeymapDel: () => {},
                openFile,
            });

            const status = lauxlib.luaL_dostring(
                L,
                to_luastring('vim.obsidian.open_file("notes/test.md")'),
            );
            expect(status).toBe(lua.LUA_OK);
            expect(openFile).toHaveBeenCalledWith('notes/test.md');
            destroyState(L);
        });
    });

    describe('vim.env', () => {
        it('should return HOME as vault path', () => {
            const L = createSandboxedState();
            injectApi(L, {
                onSettingOverride: () => {},
                handleExCommand: () => {},
                getVaultName: () => 'vault',
                onKeymap: () => {},
                onKeymapDel: () => {},
                getVaultPath: () => '/vault',
            });

            const status = lauxlib.luaL_dostring(
                L,
                to_luastring('return vim.env.HOME'),
            );
            expect(status).toBe(lua.LUA_OK);
            const value = lua.lua_tolstring(L, -1);
            expect(value ? to_jsstring(value) : '').toBe('/vault');
            destroyState(L);
        });

        it('should return nil for unknown keys', () => {
            const L = createSandboxedState();
            injectApi(L, {
                onSettingOverride: () => {},
                handleExCommand: () => {},
                getVaultName: () => 'vault',
                onKeymap: () => {},
                onKeymapDel: () => {},
            });

            const status = lauxlib.luaL_dostring(
                L,
                to_luastring('return vim.env.DOES_NOT_EXIST == nil'),
            );
            expect(status).toBe(lua.LUA_OK);
            expect(lua.lua_toboolean(L, -1)).toBe(true);
            destroyState(L);
        });

        it('should allow setting custom env vars', () => {
            const L = createSandboxedState();
            injectApi(L, {
                onSettingOverride: () => {},
                handleExCommand: () => {},
                getVaultName: () => 'vault',
                onKeymap: () => {},
                onKeymapDel: () => {},
            });

            const status = lauxlib.luaL_dostring(
                L,
                to_luastring(
                    'vim.env.MY_CUSTOM = "value"\nreturn vim.env.MY_CUSTOM',
                ),
            );
            expect(status).toBe(lua.LUA_OK);
            const value = lua.lua_tolstring(L, -1);
            expect(value ? to_jsstring(value) : '').toBe('value');
            destroyState(L);
        });

        it('should return TERM as obsidian', () => {
            const L = createSandboxedState();
            injectApi(L, {
                onSettingOverride: () => {},
                handleExCommand: () => {},
                getVaultName: () => 'vault',
                onKeymap: () => {},
                onKeymapDel: () => {},
            });

            const status = lauxlib.luaL_dostring(
                L,
                to_luastring('return vim.env.TERM'),
            );
            expect(status).toBe(lua.LUA_OK);
            const value = lua.lua_tolstring(L, -1);
            expect(value ? to_jsstring(value) : '').toBe('obsidian');
            destroyState(L);
        });
    });

    describe('vim.obsidian.keymap', () => {
        it('should call onGlobalKeymap with set', () => {
            const L = createSandboxedState();
            const onGlobalKeymap = vi.fn();
            injectApi(L, {
                onSettingOverride: () => {},
                handleExCommand: () => {},
                getVaultName: () => 'vault',
                onKeymap: () => {},
                onKeymapDel: () => {},
                onGlobalKeymap,
            });

            const status = lauxlib.luaL_dostring(
                L,
                to_luastring(
                    'vim.obsidian.keymap.set(",f", ":obcommand switcher:open", { desc = "Open file" })',
                ),
            );
            expect(status).toBe(lua.LUA_OK);
            expect(onGlobalKeymap).toHaveBeenCalledWith({
                lhs: ',f',
                rhs: ':obcommand switcher:open',
                desc: 'Open file',
            });
            destroyState(L);
        });

        it('should call onGlobalKeymapDel with del', () => {
            const L = createSandboxedState();
            const onGlobalKeymapDel = vi.fn();
            injectApi(L, {
                onSettingOverride: () => {},
                handleExCommand: () => {},
                getVaultName: () => 'vault',
                onKeymap: () => {},
                onKeymapDel: () => {},
                onGlobalKeymapDel,
            });

            const status = lauxlib.luaL_dostring(
                L,
                to_luastring('vim.obsidian.keymap.del(",f")'),
            );
            expect(status).toBe(lua.LUA_OK);
            expect(onGlobalKeymapDel).toHaveBeenCalledWith(',f');
            destroyState(L);
        });

        it('should error if rhs does not start with colon', () => {
            const L = createSandboxedState();
            injectApi(L, {
                onSettingOverride: () => {},
                handleExCommand: () => {},
                getVaultName: () => 'vault',
                onKeymap: () => {},
                onKeymapDel: () => {},
            });

            const status = lauxlib.luaL_dostring(
                L,
                to_luastring('vim.obsidian.keymap.set(",f", "invalid")'),
            );
            expect(status).not.toBe(lua.LUA_OK);
            destroyState(L);
        });

        it('should replace leader key in lhs', () => {
            const L = createSandboxedState();
            const onGlobalKeymap = vi.fn();
            injectApi(L, {
                onSettingOverride: () => {},
                handleExCommand: () => {},
                getVaultName: () => 'vault',
                onKeymap: () => {},
                onKeymapDel: () => {},
                onGlobalKeymap,
                getLeaderKey: () => ',',
            });

            const status = lauxlib.luaL_dostring(
                L,
                to_luastring(
                    'vim.obsidian.keymap.set("<leader>f", ":obcommand app:reload")',
                ),
            );
            expect(status).toBe(lua.LUA_OK);
            expect(onGlobalKeymap).toHaveBeenCalledWith({
                lhs: ',f',
                rhs: ':obcommand app:reload',
                desc: undefined,
            });
            destroyState(L);
        });
    });

    describe('vim.obsidian.whichkey', () => {
        it('should call onWhichKeyGroupLabel with set_group', () => {
            const L = createSandboxedState();
            const onWhichKeyGroupLabel = vi.fn();
            injectApi(L, {
                onSettingOverride: () => {},
                handleExCommand: () => {},
                getVaultName: () => 'vault',
                onKeymap: () => {},
                onKeymapDel: () => {},
                onWhichKeyGroupLabel,
                getLeaderKey: () => ',',
            });

            const status = lauxlib.luaL_dostring(
                L,
                to_luastring(
                    'vim.obsidian.whichkey.set_group("<leader>t", "Table")',
                ),
            );
            expect(status).toBe(lua.LUA_OK);
            expect(onWhichKeyGroupLabel).toHaveBeenCalledWith(
                ',t',
                'Table',
                'editor',
            );
            destroyState(L);
        });

        it('should call onWhichKeyCommandLabel with set_label', () => {
            const L = createSandboxedState();
            const onWhichKeyCommandLabel = vi.fn();
            injectApi(L, {
                onSettingOverride: () => {},
                handleExCommand: () => {},
                getVaultName: () => 'vault',
                onKeymap: () => {},
                onKeymapDel: () => {},
                onWhichKeyCommandLabel,
            });

            const status = lauxlib.luaL_dostring(
                L,
                to_luastring(
                    'vim.obsidian.whichkey.set_label(",w", "Save file")',
                ),
            );
            expect(status).toBe(lua.LUA_OK);
            expect(onWhichKeyCommandLabel).toHaveBeenCalledWith(
                ',w',
                'Save file',
                'editor',
            );
            destroyState(L);
        });

        it('should support global context option', () => {
            const L = createSandboxedState();
            const onWhichKeyGroupLabel = vi.fn();
            injectApi(L, {
                onSettingOverride: () => {},
                handleExCommand: () => {},
                getVaultName: () => 'vault',
                onKeymap: () => {},
                onKeymapDel: () => {},
                onWhichKeyGroupLabel,
            });

            const status = lauxlib.luaL_dostring(
                L,
                to_luastring(
                    'vim.obsidian.whichkey.set_group(",", "+leader", { context = "global" })',
                ),
            );
            expect(status).toBe(lua.LUA_OK);
            expect(onWhichKeyGroupLabel).toHaveBeenCalledWith(
                ',',
                '+leader',
                'global',
            );
            destroyState(L);
        });

        it('should batch-add group and command labels with add()', () => {
            const L = createSandboxedState();
            const onWhichKeyGroupLabel = vi.fn();
            const onWhichKeyCommandLabel = vi.fn();
            injectApi(L, {
                onSettingOverride: () => {},
                handleExCommand: () => {},
                getVaultName: () => 'vault',
                onKeymap: () => {},
                onKeymapDel: () => {},
                onWhichKeyGroupLabel,
                onWhichKeyCommandLabel,
                getLeaderKey: () => ',',
            });

            const status = lauxlib.luaL_dostring(
                L,
                to_luastring(`
                    vim.obsidian.whichkey.add({
                        { "<leader>f", group = "Find" },
                        { "<leader>g", group = "Git" },
                        { "<leader>w", desc = "Save file" },
                    })
                `),
            );
            expect(status).toBe(lua.LUA_OK);
            expect(onWhichKeyGroupLabel).toHaveBeenCalledTimes(2);
            expect(onWhichKeyGroupLabel).toHaveBeenCalledWith(
                ',f',
                'Find',
                'editor',
            );
            expect(onWhichKeyGroupLabel).toHaveBeenCalledWith(
                ',g',
                'Git',
                'editor',
            );
            expect(onWhichKeyCommandLabel).toHaveBeenCalledTimes(1);
            expect(onWhichKeyCommandLabel).toHaveBeenCalledWith(
                ',w',
                'Save file',
                'editor',
            );
            destroyState(L);
        });

        it('should support global context in add()', () => {
            const L = createSandboxedState();
            const onWhichKeyGroupLabel = vi.fn();
            const onWhichKeyCommandLabel = vi.fn();
            injectApi(L, {
                onSettingOverride: () => {},
                handleExCommand: () => {},
                getVaultName: () => 'vault',
                onKeymap: () => {},
                onKeymapDel: () => {},
                onWhichKeyGroupLabel,
                onWhichKeyCommandLabel,
                getLeaderKey: () => ',',
            });

            const status = lauxlib.luaL_dostring(
                L,
                to_luastring(`
                    vim.obsidian.whichkey.add({
                        { "<leader>f", group = "Find", context = "global" },
                        { "<leader>e", desc = "Explorer", context = "global" },
                    })
                `),
            );
            expect(status).toBe(lua.LUA_OK);
            expect(onWhichKeyGroupLabel).toHaveBeenCalledWith(
                ',f',
                'Find',
                'global',
            );
            expect(onWhichKeyCommandLabel).toHaveBeenCalledWith(
                ',e',
                'Explorer',
                'global',
            );
            destroyState(L);
        });

        it('should skip entries without a key in add()', () => {
            const L = createSandboxedState();
            const onWhichKeyGroupLabel = vi.fn();
            injectApi(L, {
                onSettingOverride: () => {},
                handleExCommand: () => {},
                getVaultName: () => 'vault',
                onKeymap: () => {},
                onKeymapDel: () => {},
                onWhichKeyGroupLabel,
                getLeaderKey: () => ',',
            });

            const status = lauxlib.luaL_dostring(
                L,
                to_luastring(`
                    vim.obsidian.whichkey.add({
                        { group = "No key" },
                        { "<leader>t", group = "Table" },
                    })
                `),
            );
            expect(status).toBe(lua.LUA_OK);
            expect(onWhichKeyGroupLabel).toHaveBeenCalledTimes(1);
            expect(onWhichKeyGroupLabel).toHaveBeenCalledWith(
                ',t',
                'Table',
                'editor',
            );
            destroyState(L);
        });

        it('should skip entries with neither group nor desc in add()', () => {
            const L = createSandboxedState();
            const onWhichKeyGroupLabel = vi.fn();
            const onWhichKeyCommandLabel = vi.fn();
            injectApi(L, {
                onSettingOverride: () => {},
                handleExCommand: () => {},
                getVaultName: () => 'vault',
                onKeymap: () => {},
                onKeymapDel: () => {},
                onWhichKeyGroupLabel,
                onWhichKeyCommandLabel,
                getLeaderKey: () => ',',
            });

            const status = lauxlib.luaL_dostring(
                L,
                to_luastring(`
                    vim.obsidian.whichkey.add({
                        { "<leader>x" },
                        { "<leader>t", group = "Table" },
                    })
                `),
            );
            expect(status).toBe(lua.LUA_OK);
            expect(onWhichKeyGroupLabel).toHaveBeenCalledTimes(1);
            expect(onWhichKeyCommandLabel).toHaveBeenCalledTimes(0);
            destroyState(L);
        });

        it('should error when add() receives a non-table argument', () => {
            const L = createSandboxedState();
            injectApi(L, {
                onSettingOverride: () => {},
                handleExCommand: () => {},
                getVaultName: () => 'vault',
                onKeymap: () => {},
                onKeymapDel: () => {},
                getLeaderKey: () => ',',
            });

            const status = lauxlib.luaL_dostring(
                L,
                to_luastring('vim.obsidian.whichkey.add("not a table")'),
            );
            expect(status).not.toBe(lua.LUA_OK);
            destroyState(L);
        });

        it('should ignore reserved mode field in add()', () => {
            const L = createSandboxedState();
            const onWhichKeyGroupLabel = vi.fn();
            injectApi(L, {
                onSettingOverride: () => {},
                handleExCommand: () => {},
                getVaultName: () => 'vault',
                onKeymap: () => {},
                onKeymapDel: () => {},
                onWhichKeyGroupLabel,
                getLeaderKey: () => ',',
            });

            const status = lauxlib.luaL_dostring(
                L,
                to_luastring(`
                    vim.obsidian.whichkey.add({
                        { "<leader>t", group = "Table", mode = { "n", "v" } },
                    })
                `),
            );
            expect(status).toBe(lua.LUA_OK);
            expect(onWhichKeyGroupLabel).toHaveBeenCalledWith(
                ',t',
                'Table',
                'editor',
            );
            destroyState(L);
        });
    });

    describe('vim.opt table (array) support', () => {
        it('should join table values with commas for string options', () => {
            const L = createSandboxedState();
            const onSettingOverride = vi.fn();
            injectApi(L, {
                onSettingOverride,
                handleExCommand: () => {},
                getVaultName: () => 'vault',
                onKeymap: () => {},
                onKeymapDel: () => {},
            });

            const status = lauxlib.luaL_dostring(
                L,
                to_luastring(
                    'vim.opt.workspacenavviewtypes = {"markdown", "graph", "pdf"}',
                ),
            );
            expect(status).toBe(lua.LUA_OK);
            expect(onSettingOverride).toHaveBeenCalledWith(
                'workspaceNavViewTypes',
                'markdown,graph,pdf',
                expect.any(String),
            );
            destroyState(L);
        });

        it('should still accept string values for string options', () => {
            const L = createSandboxedState();
            const onSettingOverride = vi.fn();
            injectApi(L, {
                onSettingOverride,
                handleExCommand: () => {},
                getVaultName: () => 'vault',
                onKeymap: () => {},
                onKeymapDel: () => {},
            });

            const status = lauxlib.luaL_dostring(
                L,
                to_luastring(
                    'vim.opt.workspacenavviewtypes = "markdown,graph"',
                ),
            );
            expect(status).toBe(lua.LUA_OK);
            expect(onSettingOverride).toHaveBeenCalledWith(
                'workspaceNavViewTypes',
                'markdown,graph',
                expect.any(String),
            );
            destroyState(L);
        });

        it('should handle empty table as empty string', () => {
            const L = createSandboxedState();
            const onSettingOverride = vi.fn();
            injectApi(L, {
                onSettingOverride,
                handleExCommand: () => {},
                getVaultName: () => 'vault',
                onKeymap: () => {},
                onKeymapDel: () => {},
            });

            const status = lauxlib.luaL_dostring(
                L,
                to_luastring('vim.opt.workspacenavviewtypes = {}'),
            );
            expect(status).toBe(lua.LUA_OK);
            expect(onSettingOverride).toHaveBeenCalledWith(
                'workspaceNavViewTypes',
                '',
                expect.any(String),
            );
            destroyState(L);
        });

        it('should not apply table conversion to non-string options', () => {
            const L = createSandboxedState();
            const onSettingOverride = vi.fn();
            injectApi(L, {
                onSettingOverride,
                handleExCommand: () => {},
                getVaultName: () => 'vault',
                onKeymap: () => {},
                onKeymapDel: () => {},
            });

            const status = lauxlib.luaL_dostring(
                L,
                to_luastring('vim.opt.scrolloff = 5'),
            );
            expect(status).toBe(lua.LUA_OK);
            expect(onSettingOverride).toHaveBeenCalledWith(
                'scrolloffLines',
                5,
                'vim.opt.scrolloff = 5',
            );
            destroyState(L);
        });
    });

    describe('vim.g.mode_prompt', () => {
        it('should round-trip mode_prompt values', () => {
            const L = createSandboxedState();
            const onSettingOverride = vi.fn();
            injectApi(L, {
                onSettingOverride,
                handleExCommand: () => {},
                getVaultName: () => 'vault',
                onKeymap: () => {},
                onKeymapDel: () => {},
            });

            const status = lauxlib.luaL_dostring(
                L,
                to_luastring(
                    'vim.g.mode_prompt_normal = "N"\nreturn vim.g.mode_prompt_normal',
                ),
            );
            expect(status).toBe(lua.LUA_OK);
            const value = lua.lua_tolstring(L, -1);
            expect(value ? to_jsstring(value) : '').toBe('N');
            expect(onSettingOverride).toHaveBeenCalledWith(
                'modePrompts.normal',
                'N',
                'vim.g.mode_prompt_normal = "N"',
            );
            destroyState(L);
        });
    });
});
