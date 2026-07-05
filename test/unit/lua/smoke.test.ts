import { describe, it, expect } from 'vitest';
import fengari from 'fengari';

const { lua, lauxlib, lualib } = fengari;

describe('fengari smoke test', () => {
    it('should create a Lua state and execute code', () => {
        const L = lauxlib.luaL_newstate();
        lualib.luaL_openlibs(L);
        const status = lauxlib.luaL_dostring(
            L,
            fengari.to_luastring('return 1 + 1'),
        );
        expect(status).toBe(lua.LUA_OK);
        expect(lua.lua_tonumber(L, -1)).toBe(2);
        lua.lua_close(L);
    });
});
