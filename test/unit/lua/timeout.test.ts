import { describe, it, expect } from 'vitest';
import { lua, lauxlib, to_jsstring, to_luastring } from 'fengari';
import {
    createSandboxedState,
    destroyState,
    LUA_TIMEOUT_ERROR,
} from '../../../src/lua/engine';

describe('lua execution timeout', () => {
    it('should catch infinite loops', () => {
        const L = createSandboxedState();
        const start = Date.now();
        const status = lauxlib.luaL_dostring(
            L,
            to_luastring('while true do end'),
        );
        const duration = Date.now() - start;
        expect(status).not.toBe(lua.LUA_OK);
        expect(duration).toBeLessThan(5000);
        const message = lua.lua_tolstring(L, -1);
        const error = message ? to_jsstring(message) : '';
        expect(error).toContain(LUA_TIMEOUT_ERROR);
        lua.lua_pop(L, 1);
        destroyState(L);
    });

    it('should allow normal code', () => {
        const L = createSandboxedState();
        const status = lauxlib.luaL_dostring(
            L,
            to_luastring('local s=0 for i=1,10000 do s=s+i end return s'),
        );
        expect(status).toBe(lua.LUA_OK);
        expect(lua.lua_tonumber(L, -1)).toBe(50005000);
        destroyState(L);
    });
});
