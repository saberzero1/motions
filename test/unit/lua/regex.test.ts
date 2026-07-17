import { describe, it, expect } from 'vitest';
import { lua, lauxlib, to_jsstring, to_luastring } from 'fengari';
import { createSandboxedState, destroyState } from '../../../src/lua/engine';
import { injectVimApi } from '../../../src/lua/api';
import { AutocmdManager } from '../../../src/lua/autocmd';
import { injectStdlib } from '../../../src/lua/stdlib';

type LuaState = ReturnType<typeof createSandboxedState>;

function runLua(L: LuaState, code: string): number {
    lua.lua_settop(L, 0);
    return lauxlib.luaL_dostring(L, to_luastring(code));
}

function assertLuaOk(L: LuaState, status: number): void {
    if (status === lua.LUA_OK) return;
    const value = lua.lua_tolstring(L, -1);
    const error = value ? to_jsstring(value) : 'Lua error';
    lua.lua_pop(L, 1);
    throw new Error(error);
}

function runLuaString(L: LuaState, code: string): string {
    const status = runLua(L, code);
    assertLuaOk(L, status);
    const value = lua.lua_tolstring(L, -1);
    const text = value ? to_jsstring(value) : '';
    lua.lua_pop(L, 1);
    return text;
}

function runLuaNumbers(L: LuaState, code: string): number[] {
    const status = runLua(L, code);
    assertLuaOk(L, status);
    const count = lua.lua_gettop(L);
    const values: number[] = [];
    for (let i = 1; i <= count; i++) {
        values.push(lua.lua_tonumber(L, i));
    }
    lua.lua_settop(L, 0);
    return values;
}

function runLuaBoolean(L: LuaState, code: string): boolean {
    const status = runLua(L, code);
    assertLuaOk(L, status);
    const value = lua.lua_toboolean(L, -1);
    lua.lua_pop(L, 1);
    return value;
}

function runLuaIsNil(L: LuaState, code: string): boolean {
    const status = runLua(L, code);
    assertLuaOk(L, status);
    const isNil = lua.lua_isnil(L, -1);
    lua.lua_pop(L, 1);
    return isNil;
}

function runLuaError(L: LuaState, code: string): string {
    const status = runLua(L, code);
    expect(status).not.toBe(lua.LUA_OK);
    const value = lua.lua_tolstring(L, -1);
    const error = value ? to_jsstring(value) : '';
    lua.lua_pop(L, 1);
    return error;
}

function setupState(): LuaState {
    const L = createSandboxedState();
    const autocmdManager = new AutocmdManager(L);
    injectVimApi(L, {
        onSettingOverride: () => {},
        handleExCommand: () => {},
        getVaultName: () => 'vault',
        onKeymap: () => {},
        onKeymapDel: () => {},
        autocmdManager,
    });
    injectStdlib(L);
    return L;
}

describe('vim.regex', () => {
    it('constructs regex objects and validates patterns', () => {
        const L = setupState();
        expect(
            runLuaString(L, "local re = vim.regex('hello'); return type(re)"),
        ).toBe('table');
        const invalidError = runLuaString(
            L,
            "local ok, err = pcall(vim.regex, '[invalid'); return tostring(ok) .. '|' .. err",
        );
        expect(invalidError.startsWith('false|')).toBe(true);
        expect(invalidError).toContain('invalid regular expression');
        const missingPattern = runLuaString(
            L,
            'local ok, err = pcall(vim.regex); return tostring(ok) .. "|" .. err',
        );
        expect(missingPattern.startsWith('false|')).toBe(true);
        expect(missingPattern).toContain('vim.regex: pattern required');
        destroyState(L);
    });

    it('matches strings with match_str', () => {
        const L = setupState();
        expect(
            runLuaNumbers(
                L,
                "local s, e = vim.regex('hello'):match_str('hello world'); return s, e",
            ),
        ).toEqual([0, 5]);
        expect(
            runLuaNumbers(
                L,
                "local s, e = vim.regex('\\\\d+'):match_str('abc 123 def'); return s, e",
            ),
        ).toEqual([4, 7]);
        expect(
            runLuaIsNil(L, "return vim.regex('xyz'):match_str('hello')"),
        ).toBe(true);
        expect(runLuaIsNil(L, "return vim.regex('a'):match_str('')")).toBe(
            true,
        );
        destroyState(L);
    });

    it('aliases match_line to match_str', () => {
        const L = setupState();
        expect(
            runLuaNumbers(
                L,
                "local s, e = vim.regex('world'):match_line('hello world'); return s, e",
            ),
        ).toEqual([6, 11]);
        destroyState(L);
    });

    it('matches from an offset with match_pos', () => {
        const L = setupState();
        expect(
            runLuaNumbers(
                L,
                "local s, e = vim.regex('o'):match_pos('hello world', 5); return s, e",
            ),
        ).toEqual([7, 8]);
        destroyState(L);
    });

    it('replaces matches and supports captures', () => {
        const L = setupState();
        expect(
            runLuaString(
                L,
                "return vim.regex('world'):replace('hello world', 'lua')",
            ),
        ).toBe('hello lua');
        expect(
            runLuaString(
                L,
                "return vim.regex('(\\\\w+)'):replace('hello world', '$1!')",
            ),
        ).toBe('hello! world');
        expect(
            runLuaString(
                L,
                "return vim.regex('o', 'g'):replace('hello world', '0')",
            ),
        ).toBe('hell0 w0rld');
        destroyState(L);
    });

    it('tests patterns', () => {
        const L = setupState();
        expect(
            runLuaBoolean(L, "return vim.regex('hello'):test('hello world')"),
        ).toBe(true);
        expect(
            runLuaBoolean(L, "return vim.regex('xyz'):test('hello world')"),
        ).toBe(false);
        destroyState(L);
    });

    it('respects flags', () => {
        const L = setupState();
        expect(
            runLuaBoolean(L, "return vim.regex('[A-Z]', 'i'):test('hello')"),
        ).toBe(true);
        expect(
            runLuaBoolean(L, "return vim.regex('[A-Z]'):test('hello')"),
        ).toBe(false);
        destroyState(L);
    });

    it('returns errors for invalid regex patterns', () => {
        const L = setupState();
        const error = runLuaString(
            L,
            "local ok, err = pcall(vim.regex, '['); return tostring(ok) .. '|' .. err",
        );
        expect(error.startsWith('false|')).toBe(true);
        expect(error).toContain('invalid regular expression');
        destroyState(L);
    });

    it('errors when pattern is missing', () => {
        const L = setupState();
        const error = runLuaError(L, 'return vim.regex()');
        expect(error).toContain('vim.regex: pattern required');
        destroyState(L);
    });
});
