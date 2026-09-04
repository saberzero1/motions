import * as lua from '../../../src/lib/fengari/lua.js';
import type { lua_State } from '../../../src/lib/fengari/lstate.js';
import * as lauxlib from '../../../src/lib/fengari/lauxlib.js';
import * as lualib from '../../../src/lib/fengari/lualib.js';
import * as lstate from '../../../src/lib/fengari/lstate.js';
import {
    to_luastring,
    to_jsstring,
} from '../../../src/lib/fengari/fengaricore.js';
import * as lobject from '../../../src/lib/fengari/lobject.js';
import { constant_types } from '../../../src/lib/fengari/defs.js';

function newState(): lua_State {
    const L = lauxlib.luaL_newstate();
    if (!L) throw Error('failed to create lua state');
    lualib.luaL_openlibs(L);
    return L;
}

function luaExpectOk(L: lua_State, code: string) {
    const status = lauxlib.luaL_dostring(L, to_luastring(code));
    if (status !== lua.LUA_OK) {
        const msg = lua.lua_tolstring(L, -1);
        throw new Error(msg ? to_jsstring(msg) : 'Lua error');
    }
}

function readString(L: lua_State, idx: number) {
    const bytes = lua.lua_tolstring(L, idx);
    return bytes ? to_jsstring(bytes) : null;
}

test('userdata with __gc: finalizer fires when queue is drained', () => {
    const L = newState();
    const g = L.l_G;

    const gcFunc = new lobject.TValue(constant_types.LUA_TLCF, function (
        gcState,
    ) {
        lua.lua_pushboolean(gcState, 1);
        lua.lua_setglobal(gcState, to_luastring('gc_fired'));
        return 0;
    });

    luaExpectOk(L, `_G.gc_fired = false`);

    g.finalizerQueue.push({ gcFunc: gcFunc });
    luaExpectOk(L, `collectgarbage("collect")`);

    lua.lua_getglobal(L, to_luastring('gc_fired'));
    expect(lua.lua_toboolean(L, -1)).toBe(true);
});

test('userdata without __gc: no registration overhead', () => {
    const L = newState();
    const g = L.l_G;

    lua.lua_newuserdata(L, 0);
    lua.lua_newtable(L);
    lua.lua_setmetatable(L, -2);
    lua.lua_pop(L, 1);

    expect(g.finalizerTokens.size).toBe(0);
});

test('__gc on table metatable: does NOT register', () => {
    const L = newState();
    const g = L.l_G;

    luaExpectOk(
        L,
        `
        local t = {}
        setmetatable(t, { __gc = function() end })
    `,
    );

    expect(g.finalizerTokens.size).toBe(0);
});

test('__gc that errors: error silently swallowed, other finalizers still run', () => {
    const L = newState();
    const g = L.l_G;
    const errorGcFunc = new lobject.TValue(
        constant_types.LUA_TLCF,
        function () {
            throw new Error('gc boom');
        },
    );
    const okGcFunc = new lobject.TValue(constant_types.LUA_TLCF, function (
        gcState,
    ) {
        lua.lua_pushboolean(gcState, 1);
        lua.lua_setglobal(gcState, to_luastring('second_gc_fired'));
        return 0;
    });

    luaExpectOk(L, `_G.second_gc_fired = false`);

    g.finalizerQueue.push({ gcFunc: errorGcFunc });
    g.finalizerQueue.push({ gcFunc: okGcFunc });
    luaExpectOk(L, `collectgarbage("collect")`);

    lua.lua_getglobal(L, to_luastring('second_gc_fired'));
    expect(lua.lua_toboolean(L, -1)).toBe(true);
});

test('lua_setmetatable with mt=nil unregisters FR entry', () => {
    const L = newState();
    const g = L.l_G;

    lua.lua_newuserdata(L, 0);
    lua.lua_newtable(L);
    lua.lua_pushjsfunction(L, function () {
        return 0;
    });
    lua.lua_setfield(L, -2, to_luastring('__gc'));
    lua.lua_setmetatable(L, -2);

    expect(g.finalizerTokens.size).toBe(1);

    lua.lua_pushnil(L);
    lua.lua_setmetatable(L, -2);

    expect(g.finalizerTokens.size).toBe(0);
    lua.lua_pop(L, 1);
});

test('lua_setmetatable changing metatable: old registration revoked', () => {
    const L = newState();
    const g = L.l_G;

    lua.lua_newuserdata(L, 0);

    lua.lua_newtable(L);
    lua.lua_pushjsfunction(L, function () {
        return 0;
    });
    lua.lua_setfield(L, -2, to_luastring('__gc'));
    lua.lua_setmetatable(L, -2);
    expect(g.finalizerTokens.size).toBe(1);

    lua.lua_newtable(L);
    lua.lua_pushjsfunction(L, function () {
        return 0;
    });
    lua.lua_setfield(L, -2, to_luastring('__gc'));
    lua.lua_setmetatable(L, -2);
    expect(g.finalizerTokens.size).toBe(1);

    lua.lua_pop(L, 1);
});

test('recursive drain blocked via reentrance guard', () => {
    const L = newState();
    const g = L.l_G;
    const recursiveGcFunc = new lobject.TValue(
        constant_types.LUA_TLCF,
        function (gcState) {
            lauxlib.luaL_dostring(
                gcState,
                to_luastring('collectgarbage("collect")'),
            );
            lua.lua_pushboolean(gcState, 1);
            lua.lua_setglobal(gcState, to_luastring('recursive_gc_done'));
            return 0;
        },
    );

    luaExpectOk(L, `_G.recursive_gc_done = false`);

    g.finalizerQueue.push({ gcFunc: recursiveGcFunc });
    luaExpectOk(L, `collectgarbage("collect")`);

    lua.lua_getglobal(L, to_luastring('recursive_gc_done'));
    expect(lua.lua_toboolean(L, -1)).toBe(true);
});

test('lua_close drains pending finalizers', () => {
    const L = newState();
    const g = L.l_G;
    let gcFired = false;

    const gcFunc = new lobject.TValue(constant_types.LUA_TLCF, function () {
        gcFired = true;
        return 0;
    });

    g.finalizerQueue.push({ gcFunc: gcFunc });

    expect(gcFired).toBe(false);
    lua.lua_close(L);
    expect(gcFired).toBe(true);
});

test('lua_close prevents post-close FR callbacks', () => {
    const L = newState();
    const g = L.l_G;

    lua.lua_close(L);
    expect(g.vmAlive).toBe(false);
    expect(g.finalizerTokens.size).toBe(0);
});

test('environments without FinalizationRegistry: no errors', () => {
    const L = newState();
    const g = L.l_G;
    const originalFR = g.finalizerRegistry;
    g.finalizerRegistry = null;

    lua.lua_newuserdata(L, 0);
    lua.lua_newtable(L);
    lua.lua_pushjsfunction(L, function () {
        return 0;
    });
    lua.lua_setfield(L, -2, to_luastring('__gc'));
    lua.lua_setmetatable(L, -2);
    lua.lua_pop(L, 1);

    expect(g.finalizerTokens.size).toBe(0);

    luaExpectOk(L, `collectgarbage("collect")`);

    g.finalizerRegistry = originalFR;
});
