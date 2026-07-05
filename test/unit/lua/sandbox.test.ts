import { describe, it, expect } from 'vitest';
import { lua, lauxlib, to_luastring } from 'fengari';
import type { lua_State } from 'fengari';
import { createSandboxedState, destroyState } from '../../../src/lua/engine';

function runLua(L: lua_State, code: string): number {
    return lauxlib.luaL_dostring(L, to_luastring(code));
}

describe('sandboxed Lua state', () => {
    it('should not allow os library', () => {
        const L = createSandboxedState();
        const status = runLua(L, 'return os.execute("ls")');
        expect(status).not.toBe(lua.LUA_OK);
        destroyState(L);
    });

    it('should not allow io library', () => {
        const L = createSandboxedState();
        const status = runLua(L, 'return io.open("/etc/passwd")');
        expect(status).not.toBe(lua.LUA_OK);
        destroyState(L);
    });

    it('should not allow debug library', () => {
        const L = createSandboxedState();
        const status = runLua(L, 'return debug.getinfo(1)');
        expect(status).not.toBe(lua.LUA_OK);
        destroyState(L);
    });

    it('should not allow require', () => {
        const L = createSandboxedState();
        const status = runLua(L, 'return require("fs")');
        expect(status).not.toBe(lua.LUA_OK);
        destroyState(L);
    });

    it('should not allow load', () => {
        const L = createSandboxedState();
        const status = runLua(L, 'return load("return 1")()');
        expect(status).not.toBe(lua.LUA_OK);
        destroyState(L);
    });

    it('should not allow dofile', () => {
        const L = createSandboxedState();
        const status = runLua(L, 'return dofile("/etc/passwd")');
        expect(status).not.toBe(lua.LUA_OK);
        destroyState(L);
    });

    it('should not allow loadfile', () => {
        const L = createSandboxedState();
        const status = runLua(L, 'return loadfile("/etc/passwd")');
        expect(status).not.toBe(lua.LUA_OK);
        destroyState(L);
    });

    it('should allow safe libraries', () => {
        const L = createSandboxedState();
        const status = runLua(L, 'return math.floor(3.7) + string.len("hi")');
        expect(status).toBe(lua.LUA_OK);
        expect(lua.lua_tonumber(L, -1)).toBe(5);
        destroyState(L);
    });
});
