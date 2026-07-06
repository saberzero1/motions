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

function runLuaNumber(L: LuaState, code: string): number {
    const status = runLua(L, code);
    assertLuaOk(L, status);
    const value = lua.lua_tonumber(L, -1);
    lua.lua_pop(L, 1);
    return value;
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

describe('vim stdlib', () => {
    it('should implement tbl_deep_extend force', () => {
        const L = setupState();
        const [a, c, d] = runLuaNumbers(
            L,
            "local t=vim.tbl_deep_extend('force',{a=1,b={c=2}},{a=3,b={d=4}}); return t.a, t.b.c, t.b.d",
        );
        expect(a).toBe(3);
        expect(c).toBe(2);
        expect(d).toBe(4);
        destroyState(L);
    });

    it('should implement tbl_deep_extend keep', () => {
        const L = setupState();
        const [a, b] = runLuaNumbers(
            L,
            "local t=vim.tbl_deep_extend('keep',{a=1},{a=2,b=3}); return t.a, t.b",
        );
        expect(a).toBe(1);
        expect(b).toBe(3);
        destroyState(L);
    });

    it('should implement tbl_deep_extend error', () => {
        const L = setupState();
        const error = runLuaError(
            L,
            "return vim.tbl_deep_extend('error',{a=1},{a=2})",
        );
        expect(error.length).toBeGreaterThan(0);
        destroyState(L);
    });

    it('should implement tbl_extend', () => {
        const L = setupState();
        const [a, b] = runLuaNumbers(
            L,
            "local t=vim.tbl_extend('force',{a=1},{b=2}); return t.a, t.b",
        );
        expect(a).toBe(1);
        expect(b).toBe(2);
        destroyState(L);
    });

    it('should implement tbl_contains', () => {
        const L = setupState();
        expect(runLuaBoolean(L, 'return vim.tbl_contains({1,2,3}, 2)')).toBe(
            true,
        );
        expect(runLuaBoolean(L, 'return vim.tbl_contains({1,2,3}, 4)')).toBe(
            false,
        );
        expect(
            runLuaBoolean(
                L,
                "return vim.tbl_contains({'a','b'}, function(v) return v == 'b' end, {predicate=true})",
            ),
        ).toBe(true);
        destroyState(L);
    });

    it('should implement tbl_keys and tbl_values', () => {
        const L = setupState();
        expect(
            runLuaString(
                L,
                "local k=vim.tbl_keys({a=1,b=2}); table.sort(k); return table.concat(k, ',')",
            ),
        ).toBe('a,b');
        expect(
            runLuaString(
                L,
                "local v=vim.tbl_values({a=1,b=2}); table.sort(v); return table.concat(v, ',')",
            ),
        ).toBe('1,2');
        destroyState(L);
    });

    it('should implement tbl_map and tbl_filter', () => {
        const L = setupState();
        expect(
            runLuaString(
                L,
                'local t=vim.tbl_map(function(v) return v*2 end,{1,2,3}); return table.concat(t, ",")',
            ),
        ).toBe('2,4,6');
        expect(
            runLuaString(
                L,
                'local t=vim.tbl_filter(function(v) return v>1 end,{1,2,3}); return table.concat(t, ",")',
            ),
        ).toBe('2,3');
        destroyState(L);
    });

    it('should implement tbl_count and tbl_isempty', () => {
        const L = setupState();
        expect(runLuaNumber(L, 'return vim.tbl_count({a=1,b=2,c=3})')).toBe(3);
        expect(runLuaBoolean(L, 'return vim.tbl_isempty({})')).toBe(true);
        expect(runLuaBoolean(L, 'return vim.tbl_isempty({a=1})')).toBe(false);
        destroyState(L);
    });

    it('should implement tbl_get', () => {
        const L = setupState();
        expect(
            runLuaNumber(
                L,
                "return vim.tbl_get({a={b={c=42}}}, 'a', 'b', 'c')",
            ),
        ).toBe(42);
        expect(runLuaIsNil(L, "return vim.tbl_get({a=1}, 'x', 'y')")).toBe(
            true,
        );
        destroyState(L);
    });

    it('should implement split', () => {
        const L = setupState();
        expect(
            runLuaString(
                L,
                "return table.concat(vim.split('a,b,c', ','), ',')",
            ),
        ).toBe('a,b,c');
        expect(
            runLuaString(
                L,
                "return table.concat(vim.split('a,,b', ',', {trimempty=true}), ',')",
            ),
        ).toBe('a,b');
        expect(
            runLuaString(
                L,
                "return table.concat(vim.split('a.b', '.', {plain=true}), ',')",
            ),
        ).toBe('a,b');
        destroyState(L);
    });

    it('should implement trim and string helpers', () => {
        const L = setupState();
        expect(runLuaString(L, "return vim.trim('  hi  ')")).toBe('hi');
        expect(runLuaBoolean(L, "return vim.startswith('hello', 'hel')")).toBe(
            true,
        );
        expect(
            runLuaBoolean(L, "return vim.startswith('hello', 'world')"),
        ).toBe(false);
        expect(runLuaBoolean(L, "return vim.endswith('hello', 'lo')")).toBe(
            true,
        );
        expect(runLuaBoolean(L, "return vim.endswith('hello', 'xx')")).toBe(
            false,
        );
        destroyState(L);
    });

    it('should implement inspect', () => {
        const L = setupState();
        const listInspect = runLuaString(L, 'return vim.inspect({1,2,3})');
        expect(listInspect).toContain('1');
        expect(listInspect).toContain('3');
        const nestedInspect = runLuaString(
            L,
            "return vim.inspect({nested={key='val'}})",
        );
        expect(nestedInspect).toContain('nested');
        expect(nestedInspect).toContain('val');
        destroyState(L);
    });

    it('should implement json encode/decode', () => {
        const L = setupState();
        const json = runLuaString(L, "return vim.json.encode({a=1, b='two'})");
        expect(JSON.parse(json)).toEqual({ a: 1, b: 'two' });
        expect(runLuaNumber(L, `return vim.json.decode('{"x":42}').x`)).toBe(
            42,
        );
        expect(
            runLuaNumber(
                L,
                'local t=vim.json.decode(vim.json.encode({a=1})); return t.a',
            ),
        ).toBe(1);
        expect(runLuaString(L, 'return vim.json.encode({1,2,3})')).toBe(
            '[1,2,3]',
        );
        destroyState(L);
    });

    it('should implement pesc and deepcopy', () => {
        const L = setupState();
        expect(runLuaString(L, "return vim.pesc('hello.world')")).toBe(
            'hello%.world',
        );
        const [orig, copy] = runLuaNumbers(
            L,
            'local t={a={b=1}} local c=vim.deepcopy(t); c.a.b=2; return t.a.b, c.a.b',
        );
        expect(orig).toBe(1);
        expect(copy).toBe(2);
        destroyState(L);
    });

    it('should expose vim.log.levels', () => {
        const L = setupState();
        const [info, error] = runLuaNumbers(
            L,
            'return vim.log.levels.INFO, vim.log.levels.ERROR',
        );
        expect(info).toBe(2);
        expect(error).toBe(4);
        destroyState(L);
    });

    it('should implement stricmp', () => {
        const L = setupState();
        expect(runLuaNumber(L, 'return vim.stricmp("ABC", "abc")')).toBe(0);
        expect(runLuaNumber(L, 'return vim.stricmp("a", "b")')).toBe(-1);
        expect(runLuaNumber(L, 'return vim.stricmp("b", "a")')).toBe(1);
        expect(runLuaNumber(L, 'return vim.stricmp("", "")')).toBe(0);
        expect(runLuaNumber(L, 'return vim.stricmp("Hello", "HELLO")')).toBe(0);
        destroyState(L);
    });
});
