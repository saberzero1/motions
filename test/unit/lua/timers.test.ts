import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { lua, lauxlib, to_jsstring, to_luastring } from 'fengari';
import {
    createSandboxedState,
    destroyState,
    evalLua,
} from '../../../src/lua/engine';
import { injectVimApi } from '../../../src/lua/api';
import { AutocmdManager } from '../../../src/lua/autocmd';
import { injectTimers } from '../../../src/lua/timers';

type LuaState = ReturnType<typeof createSandboxedState>;

function runLua(L: LuaState, code: string): number {
    return lauxlib.luaL_dostring(L, to_luastring(code));
}

function runLuaBoolean(L: LuaState, code: string): boolean {
    const status = runLua(L, code);
    expect(status).toBe(lua.LUA_OK);
    const value = lua.lua_toboolean(L, -1);
    lua.lua_pop(L, 1);
    return value;
}

function runLuaNumber(L: LuaState, code: string): number {
    const status = runLua(L, code);
    expect(status).toBe(lua.LUA_OK);
    const value = lua.lua_tonumber(L, -1);
    lua.lua_pop(L, 1);
    return value;
}

function runLuaString(L: LuaState, code: string): string {
    const status = runLua(L, code);
    expect(status).toBe(lua.LUA_OK);
    const value = lua.lua_tolstring(L, -1);
    const text = value ? to_jsstring(value) : '';
    lua.lua_pop(L, 1);
    return text;
}

function runEval(L: LuaState, code: string): void {
    const result = evalLua(L, code);
    expect(result.ok).toBe(true);
}

describe('vim timers', () => {
    let L: LuaState;
    let timerManager: ReturnType<typeof injectTimers>;

    beforeEach(() => {
        vi.useFakeTimers();
        if (typeof window === 'undefined') {
            (globalThis as Record<string, unknown>).window = globalThis;
        }
        L = createSandboxedState();
        const autocmdManager = new AutocmdManager(L);
        injectVimApi(L, {
            onSettingOverride: () => {},
            handleExCommand: () => {},
            getVaultName: () => 'vault',
            onKeymap: () => {},
            onKeymapDel: () => {},
            autocmdManager,
        });
        timerManager = injectTimers(L);
    });

    afterEach(() => {
        timerManager.destroyAll();
        destroyState(L);
        vi.useRealTimers();
    });

    it('vim.schedule(fn) runs on next tick', () => {
        runEval(
            L,
            `vim.g.test_var = false
            vim.schedule(function()
                vim.g.test_var = true
            end)`,
        );
        vi.advanceTimersByTime(0);
        expect(runLuaBoolean(L, 'return vim.g.test_var')).toBe(true);
    });

    it('vim.defer_fn(fn, timeout) fires after delay', () => {
        runEval(
            L,
            `vim.g.test_var = false
            vim.defer_fn(function()
                vim.g.test_var = true
            end, 100)`,
        );
        vi.advanceTimersByTime(50);
        expect(runLuaBoolean(L, 'return vim.g.test_var')).toBe(false);
        vi.advanceTimersByTime(60);
        expect(runLuaBoolean(L, 'return vim.g.test_var')).toBe(true);
    });

    it('vim.defer_fn can be cancelled', () => {
        runEval(
            L,
            `vim.g.test_var = false
            local handle = vim.defer_fn(function()
                vim.g.test_var = true
            end, 100)
            handle:close()`,
        );
        vi.advanceTimersByTime(150);
        expect(runLuaBoolean(L, 'return vim.g.test_var')).toBe(false);
    });

    it('vim.uv.new_timer() one-shot fires once', () => {
        runEval(
            L,
            `vim.g.count = 0
            local timer = vim.uv.new_timer()
            timer:start(50, 0, function()
                vim.g.count = vim.g.count + 1
            end)`,
        );
        vi.advanceTimersByTime(50);
        expect(runLuaNumber(L, 'return vim.g.count')).toBe(1);
        vi.advanceTimersByTime(50);
        expect(runLuaNumber(L, 'return vim.g.count')).toBe(1);
    });

    it('vim.uv.new_timer() repeating runs multiple times', () => {
        runEval(
            L,
            `vim.g.count = 0
            local timer = vim.uv.new_timer()
            timer:start(0, 100, function()
                vim.g.count = vim.g.count + 1
            end)`,
        );
        vi.advanceTimersByTime(350);
        const value = runLuaNumber(L, 'return vim.g.count');
        expect(value).toBeGreaterThanOrEqual(3);
        expect(value).toBeLessThanOrEqual(4);
    });

    it('timer:stop() halts repeating timers', () => {
        runEval(
            L,
            `vim.g.count = 0
            timer = vim.uv.new_timer()
            timer:start(0, 100, function()
                vim.g.count = vim.g.count + 1
            end)`,
        );
        vi.advanceTimersByTime(150);
        runEval(L, 'timer:stop()');
        const stoppedAt = runLuaNumber(L, 'return vim.g.count');
        vi.advanceTimersByTime(200);
        expect(runLuaNumber(L, 'return vim.g.count')).toBe(stoppedAt);
    });

    it('timer:close() marks closing state', () => {
        const value = runLuaBoolean(
            L,
            `local timer = vim.uv.new_timer()
            timer:close()
            return timer:is_closing()`,
        );
        expect(value).toBe(true);
    });

    it('vim.uv.hrtime() returns a positive number', () => {
        vi.advanceTimersByTime(1);
        const value = runLuaNumber(L, 'return vim.uv.hrtime()');
        expect(value).toBeGreaterThan(0);
    });

    it('vim.uv.now() returns a positive number', () => {
        const value = runLuaNumber(L, 'return vim.uv.now()');
        expect(value).toBeGreaterThan(0);
    });

    it('vim.loop aliases vim.uv', () => {
        vi.advanceTimersByTime(1);
        expect(runLuaString(L, 'return type(vim.loop)')).toBe('table');
        const value = runLuaNumber(L, 'return vim.loop.hrtime()');
        expect(value).toBeGreaterThan(0);
    });

    it('TimerManager.destroyAll() cancels pending timers', () => {
        runEval(
            L,
            `vim.g.count = 0
            vim.schedule(function()
                vim.g.count = vim.g.count + 1
            end)
            vim.defer_fn(function()
                vim.g.count = vim.g.count + 1
            end, 50)`,
        );
        timerManager.destroyAll();
        vi.advanceTimersByTime(100);
        expect(runLuaNumber(L, 'return vim.g.count')).toBe(0);
    });

    it('scheduled errors are reported without throwing', () => {
        const errorSpy = vi
            .spyOn(console, 'error')
            .mockImplementation(() => {});
        runEval(
            L,
            `vim.schedule(function()
                error('boom')
            end)`,
        );
        expect(() => vi.advanceTimersByTime(0)).not.toThrow();
        expect(errorSpy).toHaveBeenCalled();
        errorSpy.mockRestore();
    });
});
