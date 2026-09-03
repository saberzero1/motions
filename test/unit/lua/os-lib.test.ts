import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    lua,
    lauxlib,
    to_jsstring,
    to_luastring,
} from '../../../src/lib/fengari';
import { createSandboxedState, destroyState } from '../../../src/lua/engine';

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

describe('os library', () => {
    let L: LuaState;

    beforeEach(() => {
        L = createSandboxedState();
    });

    afterEach(() => {
        destroyState(L);
    });

    describe('browser-safe functions', () => {
        it('os.date returns a non-empty string', () => {
            const status = runLua(L, 'return os.date()');
            assertLuaOk(L, status);
            const value = lua.lua_tolstring(L, -1);
            expect(value).not.toBeNull();
            expect(to_jsstring(value!).length).toBeGreaterThan(0);
        });

        it('os.time returns a positive number', () => {
            const status = runLua(L, 'return os.time()');
            assertLuaOk(L, status);
            expect(lua.lua_tonumber(L, -1)).toBeGreaterThan(0);
        });

        it('os.difftime returns the difference', () => {
            const status = runLua(L, 'return os.difftime(100, 50)');
            assertLuaOk(L, status);
            expect(lua.lua_tonumber(L, -1)).toBe(50);
        });

        it('os.clock returns a non-negative number', () => {
            const status = runLua(L, 'return os.clock()');
            assertLuaOk(L, status);
            expect(lua.lua_tonumber(L, -1)).toBeGreaterThanOrEqual(0);
        });

        it('os.date with format specifier', () => {
            const status = runLua(L, 'return os.date("%Y")');
            assertLuaOk(L, status);
            const value = lua.lua_tolstring(L, -1);
            const year = to_jsstring(value!);
            expect(Number(year)).toBeGreaterThanOrEqual(2024);
        });

        it('os.date("*t") returns a table', () => {
            const status = runLua(L, 'local t = os.date("*t"); return t.year');
            assertLuaOk(L, status);
            expect(lua.lua_tonumber(L, -1)).toBeGreaterThanOrEqual(2024);
        });
    });

    describe('blocked functions', () => {
        it('os.execute is nil (defense-in-depth)', () => {
            const status = runLua(L, 'return os.execute');
            assertLuaOk(L, status);
            expect(lua.lua_isnil(L, -1)).toBe(true);
        });

        it('os.exit is nil (defense-in-depth)', () => {
            const status = runLua(L, 'return os.exit');
            assertLuaOk(L, status);
            expect(lua.lua_isnil(L, -1)).toBe(true);
        });
    });

    describe('desktop-gated functions', () => {
        it('os.getenv returns a value for HOME/PATH', () => {
            const status = runLua(
                L,
                'return os.getenv("HOME") or os.getenv("PATH")',
            );
            assertLuaOk(L, status);
            if (lua.lua_isnil(L, -1)) {
                // Mobile/browser environment — getenv returns nil, which is correct
                return;
            }
            const value = lua.lua_tolstring(L, -1);
            expect(value).not.toBeNull();
            expect(to_jsstring(value!).length).toBeGreaterThan(0);
        });

        it('os.getenv returns nil for nonexistent variable', () => {
            const status = runLua(
                L,
                'return os.getenv("FENGARI_NONEXISTENT_TEST_VAR_12345")',
            );
            assertLuaOk(L, status);
            expect(lua.lua_isnil(L, -1)).toBe(true);
        });

        it('os.tmpname returns a string or nil', () => {
            const status = runLua(L, 'return os.tmpname()');
            assertLuaOk(L, status);
            if (lua.lua_isnil(L, -1)) {
                // Mobile/browser — nil is correct
                return;
            }
            const value = lua.lua_tolstring(L, -1);
            expect(value).not.toBeNull();
            expect(to_jsstring(value!)).toContain('lua_');
        });

        it('os.remove returns nil with error for nonexistent file', () => {
            const status = runLua(
                L,
                'local ok, err = os.remove("/tmp/fengari_nonexistent_test_file_12345"); return ok, err',
            );
            assertLuaOk(L, status);
            expect(lua.lua_isnil(L, 1)).toBe(true);
        });

        it('os.rename returns nil with error for nonexistent source', () => {
            const status = runLua(
                L,
                'local ok, err = os.rename("/tmp/fengari_nonexistent_src_12345", "/tmp/fengari_nonexistent_dst_12345"); return ok, err',
            );
            assertLuaOk(L, status);
            expect(lua.lua_isnil(L, 1)).toBe(true);
        });
    });
});
