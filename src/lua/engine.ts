import { lua, lauxlib, lualib, to_jsstring, to_luastring } from 'fengari';
import type { lua_State } from 'fengari';

const INSTRUCTION_LIMIT = 1_000_000;
export const LUA_TIMEOUT_ERROR = 'Lua execution timed out';

export function createSandboxedState(): lua_State {
    const L: lua_State = lauxlib.luaL_newstate();

    lauxlib.luaL_requiref(L, to_luastring('_G'), lualib.luaopen_base, 1);
    lua.lua_pop(L, 1);
    lauxlib.luaL_requiref(L, to_luastring('string'), lualib.luaopen_string, 1);
    lua.lua_pop(L, 1);
    lauxlib.luaL_requiref(L, to_luastring('table'), lualib.luaopen_table, 1);
    lua.lua_pop(L, 1);
    lauxlib.luaL_requiref(L, to_luastring('math'), lualib.luaopen_math, 1);
    lua.lua_pop(L, 1);
    lauxlib.luaL_requiref(
        L,
        to_luastring('coroutine'),
        lualib.luaopen_coroutine,
        1,
    );
    lua.lua_pop(L, 1);
    lauxlib.luaL_requiref(L, to_luastring('utf8'), lualib.luaopen_utf8, 1);
    lua.lua_pop(L, 1);

    for (const name of [
        'dofile',
        'loadfile',
        'load',
        'rawget',
        'rawset',
        'rawequal',
    ]) {
        lua.lua_pushnil(L);
        lua.lua_setglobal(L, to_luastring(name));
    }

    lua.lua_sethook(
        L,
        (hookState: lua_State) => {
            lauxlib.luaL_error(hookState, to_luastring(LUA_TIMEOUT_ERROR));
            return 0;
        },
        lua.LUA_MASKCOUNT,
        INSTRUCTION_LIMIT,
    );

    return L;
}

export function destroyState(L: lua_State): void {
    lua.lua_close(L);
}

export function evalLua(
    L: lua_State,
    code: string,
): { ok: boolean; error?: string } {
    const status = lauxlib.luaL_dostring(L, to_luastring(code));
    if (status !== lua.LUA_OK) {
        const message = lua.lua_tolstring(L, -1);
        const error = message ? to_jsstring(message) : 'Unknown Lua error';
        lua.lua_pop(L, 1);
        return { ok: false, error };
    }
    return { ok: true };
}
