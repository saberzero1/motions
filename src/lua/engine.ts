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

import { runCleanups } from '../util/cleanup';
setPlatformProvider({
    isDesktop: Platform.isDesktop,
    requireModule: (window as Window & { require?: (module: string) => object })
        .require,
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

-- LuaJIT's bit library. Neovim runs LuaJIT, so plugins use bit.band/bor/...
-- rather than Lua 5.3's native & | operators. Every result is normalised to a
-- SIGNED 32-bit integer, which is what LuaJIT returns: bit.bnot(0) is -1, not
-- 4294967295.
--
-- Implemented with arithmetic rather than the native operators on purpose.
-- Lua 5.3's & requires both operands to have an exact integer representation,
-- and this VM widens integers to 53 bits, so a value that arrived as a float
-- raises "number has no integer representation". Arithmetic sidesteps the
-- integer subtype entirely; 32 iterations is irrelevant at these call rates.
if not bit then
    local function norm(x)
        x = tonumber(x) or 0
        x = x >= 0 and math.floor(x) or -math.floor(-x)
        x = x % 4294967296
        if x >= 2147483648 then x = x - 4294967296 end
        return x
    end
    local function u32(x) return norm(x) % 4294967296 end

    local function apply(a, b, f)
        local r, place = 0, 1
        a, b = u32(a), u32(b)
        for _ = 1, 32 do
            local abit, bbit = a % 2, b % 2
            if f(abit, bbit) == 1 then r = r + place end
            a = (a - abit) / 2
            b = (b - bbit) / 2
            place = place * 2
        end
        return norm(r)
    end

    local function variadic(f)
        return function(x, ...)
            local r = norm(x)
            for i = 1, select('#', ...) do
                r = apply(r, (select(i, ...)), f)
            end
            return norm(r)
        end
    end

    local AND = function(a, b) return (a == 1 and b == 1) and 1 or 0 end
    local OR = function(a, b) return (a == 1 or b == 1) and 1 or 0 end
    local XOR = function(a, b) return a ~= b and 1 or 0 end

    bit = {
        tobit = norm,
        band = variadic(AND),
        bor = variadic(OR),
        bxor = variadic(XOR),
        bnot = function(x) return norm(-u32(x) - 1) end,
        lshift = function(x, n)
            n = n % 32
            return norm(u32(x) * (2 ^ n))
        end,
        rshift = function(x, n)
            n = n % 32
            return norm(math.floor(u32(x) / (2 ^ n)))
        end,
        arshift = function(x, n)
            n = n % 32
            return norm(math.floor(norm(x) / (2 ^ n)))
        end,
        bswap = function(x)
            local u = u32(x)
            local b0 = u % 256
            local b1 = math.floor(u / 256) % 256
            local b2 = math.floor(u / 65536) % 256
            local b3 = math.floor(u / 16777216) % 256
            return norm(b0 * 16777216 + b1 * 65536 + b2 * 256 + b3)
        end,
    }
    bit.rol = function(x, n)
        n = n % 32
        if n == 0 then return norm(x) end
        local u = u32(x)
        return norm((u * (2 ^ n)) % 4294967296 + math.floor(u / (2 ^ (32 - n))))
    end
    bit.ror = function(x, n) return bit.rol(x, 32 - (n % 32)) end
    bit.tohex = function(x, n)
        n = n or 8
        local upper = n < 0
        n = math.min(math.abs(n), 8)
        local s = string.format('%08x', u32(x))
        s = s:sub(-n)
        return upper and s:upper() or s
    end
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

const stateCleanups = new WeakMap<lua_State, Array<() => void>>();

export function registerStateCleanup(L: lua_State, cleanup: () => void): void {
    const cleanups = stateCleanups.get(L) ?? [];
    cleanups.push(cleanup);
    stateCleanups.set(L, cleanups);
}

export function destroyState(L: lua_State): void {
    const cleanups = stateCleanups.get(L) ?? [];
    stateCleanups.delete(L);
    runCleanups(cleanups, 'Lua state');
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
