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

function installNativeErrorHandler(L: lua_State) {
    lua.lua_atnativeerror(L, function (errState) {
        const jsError = lua.lua_touserdata(errState, 1);
        const message =
            jsError instanceof Error ? jsError.message : String(jsError);
        lua.lua_pushstring(errState, to_luastring(message));
        return 1;
    });
}

function readString(L: lua_State, idx: number) {
    const bytes = lua.lua_tolstring(L, idx);
    return bytes ? to_jsstring(bytes) : null;
}

test('native TypeError is extractable via pcall with atnativeerror handler', () => {
    const L = newState();
    installNativeErrorHandler(L);

    lua.lua_pushjsfunction(L, function () {
        const obj = null;
        obj.foo;
        return 0;
    });
    lua.lua_setglobal(L, to_luastring('throw_type_error'));

    const status = lauxlib.luaL_dostring(
        L,
        to_luastring(`
        local ok, err = pcall(throw_type_error)
        assert(ok == false, "expected pcall to fail")
        assert(type(err) == "string", "expected string error, got " .. type(err))
        _G._captured_error = err
    `),
    );

    expect(status).toBe(lua.LUA_OK);
    lua.lua_getglobal(L, to_luastring('_captured_error'));
    const err = readString(L, -1);
    expect(err).toContain('Cannot read properties of null');
});

test('without atnativeerror handler, native error produces lost message', () => {
    const L = newState();

    lua.lua_pushjsfunction(L, function () {
        const obj = null;
        obj.foo;
        return 0;
    });
    lua.lua_setglobal(L, to_luastring('throw_type_error'));

    const status = lauxlib.luaL_dostring(
        L,
        to_luastring(`
        local ok, err = pcall(throw_type_error)
        _G._ok = ok
        _G._err_type = type(err)
        _G._err_is_string = (type(err) == "string") and "yes" or "no"
    `),
    );

    expect(status).toBe(lua.LUA_OK);
    lua.lua_getglobal(L, to_luastring('_ok'));
    expect(lua.lua_toboolean(L, -1)).toBe(false);
    lua.lua_pop(L, 1);

    lua.lua_getglobal(L, to_luastring('_err_is_string'));
    const isString = readString(L, -1);
    expect(isString).toBe('no');
});

test('native RangeError message is extractable', () => {
    const L = newState();
    installNativeErrorHandler(L);

    lua.lua_pushjsfunction(L, function () {
        new Array(-1);
        return 0;
    });
    lua.lua_setglobal(L, to_luastring('throw_range_error'));

    const status = lauxlib.luaL_dostring(
        L,
        to_luastring(`
        local ok, err = pcall(throw_range_error)
        assert(ok == false)
        _G._captured_error = err
    `),
    );

    expect(status).toBe(lua.LUA_OK);
    lua.lua_getglobal(L, to_luastring('_captured_error'));
    const err = readString(L, -1);
    expect(err).toContain('Invalid array length');
});

test('non-Error throw (string) is extractable', () => {
    const L = newState();
    installNativeErrorHandler(L);

    lua.lua_pushjsfunction(L, function () {
        throw 'custom string error';
    });
    lua.lua_setglobal(L, to_luastring('throw_string'));

    const status = lauxlib.luaL_dostring(
        L,
        to_luastring(`
        local ok, err = pcall(throw_string)
        assert(ok == false)
        _G._captured_error = err
    `),
    );

    expect(status).toBe(lua.LUA_OK);
    lua.lua_getglobal(L, to_luastring('_captured_error'));
    const err = readString(L, -1);
    expect(err).toBe('custom string error');
});

test('non-Error throw (number) is extractable', () => {
    const L = newState();
    installNativeErrorHandler(L);

    lua.lua_pushjsfunction(L, function () {
        throw 42;
    });
    lua.lua_setglobal(L, to_luastring('throw_number'));

    const status = lauxlib.luaL_dostring(
        L,
        to_luastring(`
        local ok, err = pcall(throw_number)
        assert(ok == false)
        _G._captured_error = err
    `),
    );

    expect(status).toBe(lua.LUA_OK);
    lua.lua_getglobal(L, to_luastring('_captured_error'));
    const err = readString(L, -1);
    expect(err).toBe('42');
});

test('pure Lua errors still work correctly with handler installed', () => {
    const L = newState();
    installNativeErrorHandler(L);

    const status = lauxlib.luaL_dostring(
        L,
        to_luastring(`
        local ok, err = pcall(function() error("test error") end)
        assert(ok == false)
        assert(err:find("test error"), "expected 'test error' in: " .. err)
    `),
    );

    expect(status).toBe(lua.LUA_OK);
});

test('handler covers coroutine threads (global_State shared)', () => {
    const L = newState();
    installNativeErrorHandler(L);

    lua.lua_pushjsfunction(L, function () {
        const obj = null;
        obj.bar;
        return 0;
    });
    lua.lua_setglobal(L, to_luastring('throw_in_thread'));

    const status = lauxlib.luaL_dostring(
        L,
        to_luastring(`
        local ok, err = pcall(throw_in_thread)
        assert(ok == false)
        assert(type(err) == "string")
        _G._captured_error = err
    `),
    );

    expect(status).toBe(lua.LUA_OK);
    lua.lua_getglobal(L, to_luastring('_captured_error'));
    const err = readString(L, -1);
    expect(err).toContain('Cannot read properties of null');
});
