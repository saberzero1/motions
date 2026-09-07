import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    lua,
    lauxlib,
    to_jsstring,
    to_luastring,
} from '../../../src/lib/fengari';
import { createSandboxedState, destroyState } from '../../../src/lua/engine';

/**
 * LuaJIT `bit` library semantics.
 *
 * Neovim runs LuaJIT, so plugins use `bit.band` rather than Lua 5.3's native
 * `&`. The distinguishing detail is that every LuaJIT bit operation returns a
 * SIGNED 32-bit integer — `bit.bnot(0)` is `-1`, and `bit.band(0xFFFFFFFF,
 * 0xFFFFFFFF)` is `-1`, not `4294967295`. Expected values below are LuaJIT's.
 */
describe('LuaJIT bit library compatibility', () => {
    let L: ReturnType<typeof createSandboxedState>;

    beforeEach(() => {
        L = createSandboxedState();
    });
    afterEach(() => {
        destroyState(L);
    });

    function num(expr: string): number {
        const status = lauxlib.luaL_dostring(L, to_luastring(`return ${expr}`));
        const raw = status === lua.LUA_OK ? null : lua.lua_tolstring(L, -1);
        expect(status, raw ? to_jsstring(raw) : expr).toBe(lua.LUA_OK);
        const v = lua.lua_tonumber(L, -1);
        lua.lua_pop(L, 1);
        return v;
    }

    function str(expr: string): string {
        const status = lauxlib.luaL_dostring(L, to_luastring(`return ${expr}`));
        expect(status).toBe(lua.LUA_OK);
        const raw = lua.lua_tolstring(L, -1);
        const v = raw ? to_jsstring(raw) : '';
        lua.lua_pop(L, 1);
        return v;
    }

    it('exists as a global', () => {
        expect(num("type(bit) == 'table' and 1 or 0")).toBe(1);
    });

    it('returns signed 32-bit results, as LuaJIT does', () => {
        expect(num('bit.bnot(0)')).toBe(-1);
        expect(num('bit.band(0xFFFFFFFF, 0xFFFFFFFF)')).toBe(-1);
        expect(num('bit.tobit(0xFFFFFFFF)')).toBe(-1);
        expect(num('bit.tobit(4294967296)')).toBe(0);
    });

    it('implements band, bor, bxor including the variadic forms', () => {
        expect(num('bit.band(0xF0, 0x3C)')).toBe(0x30);
        expect(num('bit.bor(0xF0, 0x0F)')).toBe(0xff);
        expect(num('bit.bxor(0xF0, 0xFF)')).toBe(0x0f);
        expect(num('bit.band(0xFF, 0x3C, 0x0F)')).toBe(0x0c);
        expect(num('bit.bor(1, 2, 4, 8)')).toBe(15);
    });

    it('distinguishes logical rshift from arithmetic arshift', () => {
        expect(num('bit.rshift(-1, 1)')).toBe(0x7fffffff);
        expect(num('bit.arshift(-1, 1)')).toBe(-1);
        expect(num('bit.arshift(-8, 2)')).toBe(-2);
        expect(num('bit.rshift(256, 8)')).toBe(1);
    });

    it('implements lshift with 32-bit wrap', () => {
        expect(num('bit.lshift(1, 4)')).toBe(16);
        expect(num('bit.lshift(1, 31)')).toBe(-2147483648);
        expect(num('bit.lshift(1, 32)')).toBe(1);
    });

    it('implements rol, ror and bswap', () => {
        expect(num('bit.rol(0x12345678, 8)')).toBe(0x34567812);
        expect(num('bit.ror(0x12345678, 8)')).toBe(0x78123456);
        expect(num('bit.rol(0x12345678, 0)')).toBe(0x12345678);
        expect(num('bit.bswap(0x12345678)')).toBe(0x78563412);
    });

    it('implements tohex, with a negative width meaning uppercase', () => {
        expect(str('bit.tohex(255)')).toBe('000000ff');
        expect(str('bit.tohex(255, 4)')).toBe('00ff');
        expect(str('bit.tohex(255, -4)')).toBe('00FF');
        expect(str('bit.tohex(-1)')).toBe('ffffffff');
    });

    it('coerces float arguments the way tobit does', () => {
        expect(num('bit.band(4.0, 12.0)')).toBe(4);
        expect(num('bit.tobit(3.7)')).toBe(3);
    });
});
