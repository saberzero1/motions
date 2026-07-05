import { describe, it, expect, vi } from 'vitest';
import { lua, lauxlib, to_jsstring, to_luastring } from 'fengari';
import { createSandboxedState, destroyState } from '../../../src/lua/engine';
import { injectVimApi } from '../../../src/lua/api';

describe('vim api', () => {
    it('should set vim.opt values via onSettingOverride', () => {
        const L = createSandboxedState();
        const onSettingOverride = vi.fn();
        injectVimApi(L, {
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

    it('should read vim.opt values via getOption', () => {
        const L = createSandboxedState();
        injectVimApi(L, {
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
        injectVimApi(L, {
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
        injectVimApi(L, {
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
        injectVimApi(L, {
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
        injectVimApi(L, {
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
        injectVimApi(L, {
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
        injectVimApi(L, {
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
        injectVimApi(L, {
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
        injectVimApi(L, {
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
        injectVimApi(L, {
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
        injectVimApi(L, {
            onSettingOverride: () => {},
            handleExCommand: () => {},
            getVaultName: () => 'vault',
            onKeymap: () => {},
            onKeymapDel: () => {},
        });

        const status = lauxlib.luaL_dostring(
            L,
            to_luastring('return vim.api.nvim_buf_get_lines(0, 0, -1, false)'),
        );
        expect(status).not.toBe(lua.LUA_OK);
        const err = lua.lua_tolstring(L, -1);
        expect(err ? to_jsstring(err) : '').toContain(
            'nvim_create_user_command',
        );
        destroyState(L);
    });
});
