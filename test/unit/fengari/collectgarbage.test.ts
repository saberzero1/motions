import type { lua_State } from '../../../src/lib/fengari/lstate.js';
import * as lua from '../../../src/lib/fengari/lua.js';
import * as lauxlib from '../../../src/lib/fengari/lauxlib.js';
import * as lualib from '../../../src/lib/fengari/lualib.js';
import {
    to_luastring,
    to_jsstring,
} from '../../../src/lib/fengari/fengaricore.js';

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

function luaExpectError(L: lua_State, code: string) {
    const status = lauxlib.luaL_dostring(L, to_luastring(code));
    expect(status).not.toBe(lua.LUA_OK);
    const msg = lua.lua_tolstring(L, -1);
    lua.lua_pop(L, 1);
    return msg ? to_jsstring(msg) : '';
}

test('collectgarbage("collect") returns 0 without error', () => {
    const L = newState();
    luaExpectOk(
        L,
        `
        local result = collectgarbage("collect")
        assert(result == 0, "expected 0, got " .. tostring(result))
    `,
    );
});

test('collectgarbage() default mode returns 0 without error', () => {
    const L = newState();
    luaExpectOk(
        L,
        `
        local result = collectgarbage()
        assert(result == 0, "expected 0, got " .. tostring(result))
    `,
    );
});

test('collectgarbage("count") returns two values: 0, 0', () => {
    const L = newState();
    luaExpectOk(
        L,
        `
        local k, b = collectgarbage("count")
        assert(k == 0, "expected k=0, got " .. tostring(k))
        assert(b == 0, "expected b=0, got " .. tostring(b))
    `,
    );
});

test('collectgarbage("isrunning") returns false', () => {
    const L = newState();
    luaExpectOk(
        L,
        `
        local r = collectgarbage("isrunning")
        assert(r == false, "expected false, got " .. tostring(r))
    `,
    );
});

test('collectgarbage("stop") returns 0 without error', () => {
    const L = newState();
    luaExpectOk(
        L,
        `
        local r = collectgarbage("stop")
        assert(r == 0, "expected 0, got " .. tostring(r))
    `,
    );
});

test('collectgarbage("restart") returns 0 without error', () => {
    const L = newState();
    luaExpectOk(
        L,
        `
        local r = collectgarbage("restart")
        assert(r == 0, "expected 0, got " .. tostring(r))
    `,
    );
});

test('collectgarbage("step") returns 0 without error', () => {
    const L = newState();
    luaExpectOk(
        L,
        `
        local r = collectgarbage("step")
        assert(r == 0, "expected 0, got " .. tostring(r))
    `,
    );
});

test('collectgarbage("setpause", 100) returns 0 without error', () => {
    const L = newState();
    luaExpectOk(
        L,
        `
        local r = collectgarbage("setpause", 100)
        assert(r == 0, "expected 0, got " .. tostring(r))
    `,
    );
});

test('collectgarbage("setstepmul", 100) returns 0 without error', () => {
    const L = newState();
    luaExpectOk(
        L,
        `
        local r = collectgarbage("setstepmul", 100)
        assert(r == 0, "expected 0, got " .. tostring(r))
    `,
    );
});

test('pcall(collectgarbage, "collect") succeeds', () => {
    const L = newState();
    luaExpectOk(
        L,
        `
        local ok, err = pcall(collectgarbage, "collect")
        assert(ok == true, "pcall failed: " .. tostring(err))
    `,
    );
});

test('pcall(collectgarbage, "invalid") fails with bad argument', () => {
    const L = newState();
    luaExpectOk(
        L,
        `
        local ok, err = pcall(collectgarbage, "invalid")
        assert(ok == false, "expected pcall to fail")
        assert(type(err) == "string", "expected string error")
    `,
    );
});
