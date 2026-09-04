import { expect, test } from 'vitest';
import * as lua from '../../../src/lib/fengari/lua.js';
import * as lauxlib from '../../../src/lib/fengari/lauxlib.js';
import * as lualib from '../../../src/lib/fengari/lualib.js';
import { to_luastring } from '../../../src/lib/fengari/fengaricore.js';
import type { lua_State } from '../../../src/lib/fengari/lstate.js';

const inttable2array = function (t: {
    strong: Map<
        unknown,
        { key: { ttisnumber: () => boolean }; value: { value: number } }
    >;
}): number[] {
    let a: number[] = [];
    t.strong.forEach(function (v, k) {
        if (v.key.ttisnumber()) a[(k as number) - 1] = v.value.value;
    });
    return a;
};

const getTable = function (L: lua_State, idx: number) {
    return lua.lua_topointer(L, idx) as {
        strong: Map<
            unknown,
            { key: { ttisnumber: () => boolean }; value: { value: number } }
        >;
    };
};

test('table.concat', () => {
    let L = lauxlib.luaL_newstate();
    if (!L) throw Error('failed to create lua state');

    let luaCode = `
        return table.concat({1, 2, 3, 4, 5, 6, 7}, ",", 3, 5)
    `;
    {
        lualib.luaL_openlibs(L);
        expect(lauxlib.luaL_loadstring(L, to_luastring(luaCode))).toBe(
            lua.LUA_OK,
        );
        lua.lua_call(L, 0, -1);
    }

    expect(lua.lua_tojsstring(L, -1)).toBe('3,4,5');
});

test('table.pack', () => {
    let L = lauxlib.luaL_newstate();
    if (!L) throw Error('failed to create lua state');

    let luaCode = `
        return table.pack(1, 2, 3)
    `;
    {
        lualib.luaL_openlibs(L);
        expect(lauxlib.luaL_loadstring(L, to_luastring(luaCode))).toBe(
            lua.LUA_OK,
        );
        lua.lua_call(L, 0, -1);
    }

    const table = getTable(L, -1);
    expect(
        [...table.strong.entries()]
            .filter((e) => e[1].key.ttisnumber()) // Filter out the 'n' field
            .map((e) => e[1].value.value)
            .reverse(),
    ).toEqual([1, 2, 3]);
});

test('table.unpack', () => {
    let L = lauxlib.luaL_newstate();
    if (!L) throw Error('failed to create lua state');

    let luaCode = `
        return table.unpack({1, 2, 3, 4, 5}, 2, 4)
    `;
    {
        lualib.luaL_openlibs(L);
        expect(lauxlib.luaL_loadstring(L, to_luastring(luaCode))).toBe(
            lua.LUA_OK,
        );
        lua.lua_call(L, 0, -1);
    }

    expect(lua.lua_tointeger(L, -3)).toBe(2);
    expect(lua.lua_tointeger(L, -2)).toBe(3);
    expect(lua.lua_tointeger(L, -1)).toBe(4);
});

test('table.insert', () => {
    let L = lauxlib.luaL_newstate();
    if (!L) throw Error('failed to create lua state');

    let luaCode = `
        local t = {1, 3, 4}
        table.insert(t, 5)
        table.insert(t, 2, 2)
        return t
    `;
    {
        lualib.luaL_openlibs(L);
        expect(lauxlib.luaL_loadstring(L, to_luastring(luaCode))).toBe(
            lua.LUA_OK,
        );
        lua.lua_call(L, 0, -1);
    }

    const table = getTable(L, -1);
    expect(
        [...table.strong.entries()]
            .filter((e) => e[1].key.ttisnumber())
            .map((e) => e[1].value.value)
            .sort(),
    ).toEqual([1, 2, 3, 4, 5]);
});

test('table.remove', () => {
    let L = lauxlib.luaL_newstate();
    if (!L) throw Error('failed to create lua state');

    let luaCode = `
        local t = {1, 2, 3, 3, 4, 4}
        table.remove(t)
        table.remove(t, 3)
        return t
    `;
    {
        lualib.luaL_openlibs(L);
        expect(lauxlib.luaL_loadstring(L, to_luastring(luaCode))).toBe(
            lua.LUA_OK,
        );
        lua.lua_call(L, 0, -1);
    }

    const table = getTable(L, -1);
    expect(
        [...table.strong.entries()]
            .filter((e) => e[1].key.ttisnumber())
            .map((e) => e[1].value.value)
            .sort(),
    ).toEqual([1, 2, 3, 4]);
});

test('table.move', () => {
    let L = lauxlib.luaL_newstate();
    if (!L) throw Error('failed to create lua state');

    let luaCode = `
        local t1 = {3, 4, 5}
        local t2 = {1, 2, nil, nil, nil, 6}
        return table.move(t1, 1, #t1, 3, t2)
    `;
    {
        lualib.luaL_openlibs(L);
        expect(lauxlib.luaL_loadstring(L, to_luastring(luaCode))).toBe(
            lua.LUA_OK,
        );
        lua.lua_call(L, 0, -1);
    }

    const table = getTable(L, -1);
    expect(
        [...table.strong.entries()]
            .filter((e) => e[1].key.ttisnumber())
            .map((e) => e[1].value.value)
            .sort(),
    ).toEqual([1, 2, 3, 4, 5, 6]);
});

test('table.sort (<)', () => {
    let L = lauxlib.luaL_newstate();
    if (!L) throw Error('failed to create lua state');

    let luaCode = `
        local t = {3, 1, 5, ['just'] = 'tofuckitup', 2, 4}
        table.sort(t)
        return t
    `;
    {
        lualib.luaL_openlibs(L);
        expect(lauxlib.luaL_loadstring(L, to_luastring(luaCode))).toBe(
            lua.LUA_OK,
        );
        lua.lua_call(L, 0, -1);
    }

    expect(inttable2array(getTable(L, -1))).toEqual([1, 2, 3, 4, 5]);
});

test('table.sort with cmp function', () => {
    let L = lauxlib.luaL_newstate();
    if (!L) throw Error('failed to create lua state');

    let luaCode = `
        local t = {3, 1, 5, ['just'] = 'tofuckitup', 2, 4}
        table.sort(t, function (a, b)
            return a > b
        end)
        return t
    `;
    {
        lualib.luaL_openlibs(L);
        expect(lauxlib.luaL_loadstring(L, to_luastring(luaCode))).toBe(
            lua.LUA_OK,
        );
        lua.lua_call(L, 0, -1);
    }

    expect(inttable2array(getTable(L, -1))).toEqual([5, 4, 3, 2, 1]);
});
