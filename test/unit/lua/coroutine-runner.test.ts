import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { lua, lauxlib, lualib, to_jsstring, to_luastring } from 'fengari';
import type { lua_State } from 'fengari';
import { CoroutineRunner } from '../../../src/lua/coroutine-runner';

function newState(): lua_State {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    return L;
}

function registerYieldingFunction(
    L: lua_State,
    name: string,
    runner: CoroutineRunner,
): void {
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const promise = new Promise<string>((resolve) => {
            setTimeout(() => resolve('async result'), 0);
        });
        return runner.yieldWithPromise(state, promise);
    });
    lua.lua_setglobal(L, to_luastring(name));
}

function registerSyncFunction(L: lua_State, name: string): void {
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        lua.lua_pushstring(state, to_luastring('sync result'));
        return 1;
    });
    lua.lua_setglobal(L, to_luastring(name));
}

function loadAndRef(L: lua_State, code: string): number {
    expect(lauxlib.luaL_loadstring(L, to_luastring(code))).toBe(lua.LUA_OK);
    return lauxlib.luaL_ref(L, lua.LUA_REGISTRYINDEX);
}

describe('CoroutineRunner', () => {
    let L: lua_State;
    let runner: CoroutineRunner;

    beforeEach(() => {
        L = newState();
        runner = new CoroutineRunner(L);
    });

    afterEach(() => {
        runner.destroyAll();
        lua.lua_close(L);
    });

    it('T1: sync function (no yield) completes with ok=true', async () => {
        registerSyncFunction(L, 'sync_fn');
        const ref = loadAndRef(L, 'return sync_fn()');

        const result = await runner.invokeAsyncCapable(ref, () => 0, 500_000);
        expect(result.ok).toBe(true);
    });

    it('T2: async function yields and resumes with correct value', async () => {
        lua.lua_pushjsfunction(L, (state: lua_State) => {
            const promise = Promise.resolve('hello from async');
            return runner.yieldWithPromise(state, promise);
        });
        lua.lua_setglobal(L, to_luastring('async_fn'));

        const ref = loadAndRef(
            L,
            `
            local val = async_fn()
            RESULT = val
        `,
        );

        const result = await runner.invokeAsyncCapable(ref, () => 0, 500_000);
        expect(result.ok).toBe(true);

        lua.lua_getglobal(L, to_luastring('RESULT'));
        const val = lua.lua_tolstring(L, -1);
        expect(val ? to_jsstring(val) : null).toBe('hello from async');
        lua.lua_pop(L, 1);
    });

    it('T3: rejected Promise propagates as Lua error', async () => {
        lua.lua_pushjsfunction(L, (state: lua_State) => {
            const promise = Promise.reject(new Error('read failed'));
            return runner.yieldWithPromise(state, promise);
        });
        lua.lua_setglobal(L, to_luastring('failing_fn'));

        const ref = loadAndRef(L, 'return failing_fn()');

        const result = await runner.invokeAsyncCapable(ref, () => 0, 500_000);
        expect(result.ok).toBe(false);
        expect(result.error).toContain('read failed');
    });

    it('T4: rejected Promise caught by pcall returns (false, errmsg)', async () => {
        lua.lua_pushjsfunction(L, (state: lua_State) => {
            const promise = Promise.reject(new Error('not found'));
            return runner.yieldWithPromise(state, promise);
        });
        lua.lua_setglobal(L, to_luastring('failing_fn'));

        const ref = loadAndRef(
            L,
            `
            local ok, err = pcall(failing_fn)
            PCALL_OK = ok
            PCALL_ERR = err
        `,
        );

        const result = await runner.invokeAsyncCapable(ref, () => 0, 500_000);
        expect(result.ok).toBe(true);

        lua.lua_getglobal(L, to_luastring('PCALL_OK'));
        expect(lua.lua_toboolean(L, -1)).toBe(false);
        lua.lua_pop(L, 1);

        lua.lua_getglobal(L, to_luastring('PCALL_ERR'));
        const err = lua.lua_tolstring(L, -1);
        expect(err ? to_jsstring(err) : '').toContain('not found');
        lua.lua_pop(L, 1);
    });

    it('T5: instruction limit exceeded returns error', async () => {
        registerSyncFunction(L, 'sync_fn');
        const ref = loadAndRef(
            L,
            `
            local sum = 0
            for i = 1, 10000000 do sum = sum + i end
            return sum
        `,
        );

        const result = await runner.invokeAsyncCapable(ref, () => 0, 100);
        expect(result.ok).toBe(false);
        expect(result.error).toContain('timed out');
    });

    it('T6: timeout on slow Promise returns error', async () => {
        vi.useFakeTimers();

        lua.lua_pushjsfunction(L, (state: lua_State) => {
            const promise = new Promise<string>(() => {
                // never resolves
            });
            return runner.yieldWithPromise(state, promise);
        });
        lua.lua_setglobal(L, to_luastring('slow_fn'));

        const ref = loadAndRef(L, 'return slow_fn()');

        const resultPromise = runner.invokeAsyncCapable(ref, () => 0, 500_000);

        await vi.advanceTimersByTimeAsync(11_000);

        const result = await resultPromise;
        expect(result.ok).toBe(false);
        expect(result.error).toContain('timed out');

        vi.useRealTimers();
    });

    it('T7: 17th concurrent operation returns error', async () => {
        lua.lua_pushjsfunction(L, (state: lua_State) => {
            const promise = new Promise<string>(() => {});
            return runner.yieldWithPromise(state, promise);
        });
        lua.lua_setglobal(L, to_luastring('blocking_fn'));

        const promises: Promise<{ ok: boolean; error?: string }>[] = [];
        for (let i = 0; i < 16; i++) {
            const ref = loadAndRef(L, 'return blocking_fn()');
            promises.push(runner.invokeAsyncCapable(ref, () => 0, 500_000));
        }

        expect(runner.activeCount).toBe(16);

        const ref17 = loadAndRef(L, 'return blocking_fn()');
        const result = await runner.invokeAsyncCapable(ref17, () => 0, 500_000);
        expect(result.ok).toBe(false);
        expect(result.error).toContain('too many');
    });

    it('T8: destroyAll cleans up pending coroutines', async () => {
        lua.lua_pushjsfunction(L, (state: lua_State) => {
            const promise = new Promise<string>(() => {});
            return runner.yieldWithPromise(state, promise);
        });
        lua.lua_setglobal(L, to_luastring('blocking_fn'));

        const ref = loadAndRef(L, 'return blocking_fn()');
        const resultPromise = runner.invokeAsyncCapable(ref, () => 0, 500_000);

        expect(runner.activeCount).toBe(1);

        runner.destroyAll();

        expect(runner.activeCount).toBe(0);
        expect(runner.isDestroyed()).toBe(true);

        const result = await resultPromise;
        expect(result.ok).toBe(false);
        expect(result.error).toContain('destroyed');
    });

    it('T9: double yield (sequential async calls) returns both values', async () => {
        let callCount = 0;
        lua.lua_pushjsfunction(L, (state: lua_State) => {
            callCount++;
            const value = `value_${callCount}`;
            const promise = Promise.resolve(value);
            return runner.yieldWithPromise(state, promise);
        });
        lua.lua_setglobal(L, to_luastring('async_fn'));

        const ref = loadAndRef(
            L,
            `
            local a = async_fn()
            local b = async_fn()
            RESULT_A = a
            RESULT_B = b
        `,
        );

        const result = await runner.invokeAsyncCapable(ref, () => 0, 500_000);
        expect(result.ok).toBe(true);

        lua.lua_getglobal(L, to_luastring('RESULT_A'));
        expect(to_jsstring(lua.lua_tolstring(L, -1)!)).toBe('value_1');
        lua.lua_pop(L, 1);

        lua.lua_getglobal(L, to_luastring('RESULT_B'));
        expect(to_jsstring(lua.lua_tolstring(L, -1)!)).toBe('value_2');
        lua.lua_pop(L, 1);
    });

    it('T10: setAsyncBlocked prevents yield with error', async () => {
        lua.lua_pushjsfunction(L, (state: lua_State) => {
            const promise = Promise.resolve('value');
            return runner.yieldWithPromise(state, promise);
        });
        lua.lua_setglobal(L, to_luastring('async_fn'));

        runner.setAsyncBlocked(true);

        const ref = loadAndRef(L, 'return async_fn()');
        const result = await runner.invokeAsyncCapable(ref, () => 0, 500_000);
        expect(result.ok).toBe(false);
        expect(result.error).toContain('snippet');

        runner.setAsyncBlocked(false);
    });

    it('T11: instruction hook fires on thread, not main state', async () => {
        lua.lua_pushjsfunction(L, (state: lua_State) => {
            const promise = Promise.resolve('resumed');
            return runner.yieldWithPromise(state, promise);
        });
        lua.lua_setglobal(L, to_luastring('async_fn'));

        const ref = loadAndRef(
            L,
            `
            local val = async_fn()
            local sum = 0
            for i = 1, 10000000 do sum = sum + i end
            return sum
        `,
        );

        const result = await runner.invokeAsyncCapable(ref, () => 0, 200);
        expect(result.ok).toBe(false);
        expect(result.error).toContain('timed out');
    });
});
