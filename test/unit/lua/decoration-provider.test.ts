import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    lua,
    lauxlib,
    to_jsstring,
    to_luastring,
} from '../../../src/lib/fengari';
import { createSandboxedState, destroyState } from '../../../src/lua/engine';
import { injectVimApi } from '../../../src/lua/api';
import { DecorationProviderManager } from '../../../src/lua/decoration-provider';
import type { EditorView } from '@codemirror/view';

describe('nvim_set_decoration_provider', () => {
    let L: ReturnType<typeof createSandboxedState>;
    let manager: DecorationProviderManager;

    beforeEach(() => {
        L = createSandboxedState();
        manager = new DecorationProviderManager(L);
        injectVimApi(L, {
            onSettingOverride: () => {},
            handleExCommand: () => {},
            getVaultName: () => 'vault',
            onKeymap: () => {},
            onKeymapDel: () => {},
            decorationProviders: manager,
        });
    });

    afterEach(() => {
        destroyState(L);
        vi.restoreAllMocks();
    });

    function run(code: string): void {
        const status = lauxlib.luaL_dostring(L, to_luastring(code));
        const raw = status === lua.LUA_OK ? null : lua.lua_tolstring(L, -1);
        expect(status, raw ? to_jsstring(raw) : code).toBe(lua.LUA_OK);
    }

    function runExpectingError(code: string): string {
        const status = lauxlib.luaL_dostring(L, to_luastring(code));
        expect(status).not.toBe(lua.LUA_OK);
        const raw = lua.lua_tolstring(L, -1);
        const message = raw ? to_jsstring(raw) : '';
        lua.lua_pop(L, 1);
        return message;
    }

    const fakeView = {} as EditorView;
    const cycle = () => manager.runCycle(fakeView, 1, 10);

    function readOrder(): string {
        lua.lua_getglobal(L, to_luastring('order'));
        const raw = lua.lua_tolstring(L, -1);
        const value = raw ? to_jsstring(raw) : '';
        lua.lua_pop(L, 1);
        return value;
    }

    it('registers a provider with on_start', () => {
        expect(manager.hasProviders()).toBe(false);
        run(`
            local ns = vim.api.nvim_create_namespace('probe')
            vim.api.nvim_set_decoration_provider(ns, {
                on_start = function() end,
            })
        `);
        expect(manager.hasProviders()).toBe(true);
    });

    it('rejects on_line loudly rather than accepting it silently', () => {
        const message = runExpectingError(`
            vim.api.nvim_set_decoration_provider(1, {
                on_start = function() end,
                on_line = function() end,
            })
        `);
        expect(message).toContain('on_line');
        expect(message).toContain('not supported in Obsidian');
        expect(manager.hasProviders()).toBe(false);
    });

    it('rejects on_range loudly', () => {
        const message = runExpectingError(
            `vim.api.nvim_set_decoration_provider(1, { on_range = function() end })`,
        );
        expect(message).toContain('on_range');
    });

    it('an empty opts table removes the provider', () => {
        run(
            `vim.api.nvim_set_decoration_provider(7, { on_start = function() end })`,
        );
        expect(manager.hasProviders()).toBe(true);
        run(`vim.api.nvim_set_decoration_provider(7, {})`);
        expect(manager.hasProviders()).toBe(false);
    });

    it('invokes callbacks in Neovim order', () => {
        run(`
            order = ''
            vim.api.nvim_set_decoration_provider(1, {
                on_start = function() order = order .. 'start,' end,
                on_buf   = function() order = order .. 'buf,' end,
                on_win   = function() order = order .. 'win,' end,
                on_end   = function() order = order .. 'end,' end,
            })
        `);
        cycle();
        expect(readOrder()).toBe('start,buf,win,end,');
    });

    it('passes the window viewport to on_win', () => {
        run(`
            order = ''
            vim.api.nvim_set_decoration_provider(1, {
                on_win = function(win, buf, top, bot)
                    order = win .. ':' .. buf .. ':' .. top .. ':' .. bot
                end,
            })
        `);
        cycle();
        expect(readOrder()).toBe('0:0:1:10');
    });

    it('a false return from on_win stops the cycle for that provider', () => {
        run(`
            order = ''
            vim.api.nvim_set_decoration_provider(1, {
                on_win = function() order = order .. 'win,'; return false end,
                on_end = function() order = order .. 'end,' end,
            })
        `);
        cycle();
        expect(readOrder()).toBe('win,');
    });

    it('contains a throwing callback without propagating', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        run(`
            order = ''
            vim.api.nvim_set_decoration_provider(1, {
                on_start = function() error('boom') end,
            })
            vim.api.nvim_set_decoration_provider(2, {
                on_start = function() order = order .. 'survived' end,
            })
        `);
        expect(() => cycle()).not.toThrow();
        expect(readOrder()).toBe('survived');
    });

    it('faults a provider that fails repeatedly', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        run(`
            vim.api.nvim_set_decoration_provider(1, {
                on_start = function() error('boom') end,
            })
        `);
        for (let i = 0; i < 10; i++) cycle();
        expect(manager.hasProviders()).toBe(false);
    });

    it('re-registering the same namespace replaces the previous callbacks', () => {
        run(`
            order = ''
            vim.api.nvim_set_decoration_provider(1, {
                on_start = function() order = order .. 'first,' end,
            })
            vim.api.nvim_set_decoration_provider(1, {
                on_start = function() order = order .. 'second,' end,
            })
        `);
        cycle();
        expect(readOrder()).toBe('second,');
    });

    it('invalidate() bumps the generation so in-flight frames can bail', () => {
        const before = manager.currentGeneration();
        manager.invalidate();
        expect(manager.currentGeneration()).toBeGreaterThan(before);
    });

    it('dispose() drops every provider', () => {
        run(
            `vim.api.nvim_set_decoration_provider(1, { on_start = function() end })`,
        );
        expect(manager.hasProviders()).toBe(true);
        manager.dispose();
        expect(manager.hasProviders()).toBe(false);
        expect(() => cycle()).not.toThrow();
    });
});
