import {
    lua,
    lauxlib,
    lualib,
    to_jsstring,
    to_luastring,
    setPlatformProvider,
} from '../lib/fengari';
import type { lua_State } from '../lib/fengari';
import { Notice, Platform } from 'obsidian';
import type { CoroutineRunner } from './coroutine-runner';
import { invariant } from '../util/invariant';

setPlatformProvider({
    isDesktop: Platform.isDesktop,
    requireModule: (
        window as Window & { require?: (module: string) => unknown }
    ).require,
});

export const INSTRUCTION_LIMIT = 1_000_000;
export const LUA_TIMEOUT_ERROR = 'Lua execution timed out';

export const CALLBACK_INSTRUCTION_LIMIT = 500_000;
export const SNIPPET_INSTRUCTION_LIMIT = 100_000;
export const EXPR_INSTRUCTION_LIMIT = 100_000;

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
    invariant(limit > 0, `Instruction limit must be positive, got ${limit}`);
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
    const L = lauxlib.luaL_newstate();
    if (!L) throw new Error('failed to create Lua state');

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
    lauxlib.luaL_requiref(L, to_luastring('os'), lualib.luaopen_os, 1);
    lua.lua_pop(L, 1);

    // Defense-in-depth: nil out dangerous os functions even though the fork
    // already stubs them — prevents regressions if the fork code changes.
    lua.lua_getglobal(L, to_luastring('os'));
    lua.lua_pushnil(L);
    lua.lua_setfield(L, -2, to_luastring('execute'));
    lua.lua_pushnil(L);
    lua.lua_setfield(L, -2, to_luastring('exit'));
    lua.lua_pop(L, 1);

    if (lualib.luaopen_debug) {
        lauxlib.luaL_requiref(
            L,
            to_luastring('debug'),
            lualib.luaopen_debug,
            1,
        );
        lua.lua_pop(L, 1);
    }

    for (const name of [
        'dofile',
        'loadfile',
        'load', // re-enabled as sandboxed version by package.ts
    ]) {
        lua.lua_pushnil(L);
        lua.lua_setglobal(L, to_luastring(name));
    }

    const luaCompatShims = `
-- Lua 5.1 globals moved/removed in 5.3
unpack = table.unpack
loadstring = load
string.gfind = string.gmatch

-- Table functions removed in 5.3
table.maxn = function(t)
    local n = 0
    for k in pairs(t) do
        if type(k) == 'number' and k > n then n = k end
    end
    return n
end
table.getn = function(t) return #t end
table.foreach = function(t, f)
    for k, v in pairs(t) do
        local r = f(k, v)
        if r ~= nil then return r end
    end
end
table.foreachi = function(t, f)
    for i = 1, #t do
        local r = f(i, t[i])
        if r ~= nil then return r end
    end
end

-- Math functions removed/renamed in 5.3
math.atan2 = math.atan
math.log10 = function(x) return math.log(x, 10) end
math.mod = math.fmod
math.pow = function(x, y) return x ^ y end
math.cosh = function(x) return (math.exp(x) + math.exp(-x)) / 2 end
math.sinh = function(x) return (math.exp(x) - math.exp(-x)) / 2 end
math.tanh = function(x)
    local e2x = math.exp(2 * x)
    return (e2x - 1) / (e2x + 1)
end
math.frexp = function(x)
    if x == 0 then return 0, 0 end
    local e = math.floor(math.log(math.abs(x), 2)) + 1
    return x / 2^e, e
end
math.ldexp = function(m, e) return m * 2^e end

-- LuaJIT bit library (wrapping Lua 5.3 native bitwise operators)
if not bit then
    bit = {}
    bit.band   = function(a, b) return a & b end
    bit.bor    = function(a, b) return a | b end
    bit.bxor   = function(a, b) return a ~ b end
    bit.bnot   = function(a) return ~a end
    bit.lshift = function(a, n) return (a << n) & 0xFFFFFFFF end
    bit.rshift = function(a, n) return (a & 0xFFFFFFFF) >> n end
    bit.arshift = function(a, n)
        a = a & 0xFFFFFFFF
        if a >= 0x80000000 then a = a - 0x100000000 end
        if n >= 32 then return a < 0 and -1 or 0 end
        return math.floor(a / 2^n)
    end
    bit.rol = function(a, n)
        a = a & 0xFFFFFFFF
        n = n % 32
        return ((a << n) | (a >> (32 - n))) & 0xFFFFFFFF
    end
    bit.ror = function(a, n)
        a = a & 0xFFFFFFFF
        n = n % 32
        return ((a >> n) | (a << (32 - n))) & 0xFFFFFFFF
    end
    bit.tobit = function(a)
        a = a & 0xFFFFFFFF
        if a >= 0x80000000 then return a - 0x100000000 end
        return a
    end
    bit.tohex = function(a, n)
        n = n or 8
        a = a & 0xFFFFFFFF
        return string.format('%0' .. math.abs(n) .. (n > 0 and 'x' or 'X'), a)
    end
    bit.bswap = function(a)
        a = a & 0xFFFFFFFF
        return ((a & 0xFF) << 24) | (((a >> 8) & 0xFF) << 16) |
               (((a >> 16) & 0xFF) << 8) | ((a >> 24) & 0xFF)
    end
end

-- LuaJIT jit.* stubs (no-op to prevent crashes)
if not jit then
    jit = {
        on = function() end,
        off = function() end,
        flush = function() end,
        status = function() return false end,
        version = 'fengari',
        version_num = 0,
        os = 'Other',
        arch = 'portable',
    }
end

-- getfenv/setfenv stubs (removed in Lua 5.3, can't be perfectly emulated)
if not getfenv then
    getfenv = function() return _G end
    setfenv = function() end
end

-- coroutine.isyieldable (not in 5.1)
if not coroutine.isyieldable then
    coroutine.isyieldable = function() return false end
end
`;
    lauxlib.luaL_dostring(L, to_luastring(luaCompatShims));

    lua.lua_sethook(
        L,
        (hookState: lua_State) => {
            lauxlib.luaL_error(hookState, to_luastring(LUA_TIMEOUT_ERROR));
            return 0;
        },
        lua.LUA_MASKCOUNT,
        INSTRUCTION_LIMIT,
    );

    lua.lua_atnativeerror(L, (errState: lua_State) => {
        const jsError = lua.lua_touserdata(errState, 1);
        let message: string;
        if (jsError instanceof Error) {
            message = jsError.message;
        } else if (typeof jsError === 'string') {
            message = jsError;
        } else {
            message = 'unknown error';
        }
        lua.lua_pushstring(errState, to_luastring(message));
        return 1;
    });

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
