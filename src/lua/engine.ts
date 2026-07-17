import { lua, lauxlib, lualib, to_jsstring, to_luastring } from 'fengari';
import type { lua_State } from 'fengari';
import { Notice } from 'obsidian';
import type { CoroutineRunner } from './coroutine-runner';

export const INSTRUCTION_LIMIT = 1_000_000;
export const LUA_TIMEOUT_ERROR = 'Lua execution timed out';

export const CALLBACK_INSTRUCTION_LIMIT = 500_000;
export const SNIPPET_INSTRUCTION_LIMIT = 100_000;

let lastErrorNoticeTime = 0;
const ERROR_NOTICE_COOLDOWN = 5000;

export function showLuaErrorNotice(message: string): void {
    const now = Date.now();
    if (now - lastErrorNoticeTime < ERROR_NOTICE_COOLDOWN) return;
    lastErrorNoticeTime = now;
    new Notice(`Vim Motions: ${message}`);
}

export function withInstructionGuard(
    L: lua_State,
    limit: number,
    fn: () => number,
): number {
    lua.lua_sethook(
        L,
        (hookState: lua_State) => {
            lauxlib.luaL_error(hookState, to_luastring(LUA_TIMEOUT_ERROR));
            return 0;
        },
        lua.LUA_MASKCOUNT,
        limit,
    );
    try {
        return fn();
    } finally {
        lua.lua_sethook(L, null, 0, 0);
    }
}

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
        'load', // re-enabled as sandboxed version by package.ts
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

export async function evalLuaAsync(
    L: lua_State,
    code: string,
    runner: CoroutineRunner,
): Promise<{ ok: boolean; error?: string }> {
    const loadStatus = lauxlib.luaL_loadstring(L, to_luastring(code));
    if (loadStatus !== lua.LUA_OK) {
        const msg = lua.lua_tolstring(L, -1);
        const error = msg ? to_jsstring(msg) : 'Lua syntax error';
        lua.lua_pop(L, 1);
        return { ok: false, error };
    }

    const chunkRef = lauxlib.luaL_ref(L, lua.LUA_REGISTRYINDEX);
    const result = await runner.invokeAsyncCapable(
        chunkRef,
        () => 0,
        INSTRUCTION_LIMIT,
    );
    lauxlib.luaL_unref(L, lua.LUA_REGISTRYINDEX, chunkRef);
    return result;
}
