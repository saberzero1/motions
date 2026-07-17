import { describe, it, expect } from 'vitest';
import { lua, lauxlib, lualib, to_jsstring, to_luastring } from 'fengari';
import type { lua_State } from 'fengari';
import { CoroutineRunner } from '../../../src/lua/coroutine-runner';
import { evalLuaAsync, createSandboxedState } from '../../../src/lua/engine';

function setupAsyncReadGlobal(
    L: lua_State,
    runner: CoroutineRunner,
    readFn: (path: string) => Promise<string>,
): void {
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const pathBytes = lua.lua_tolstring(state, 1);
        if (!pathBytes) {
            return lauxlib.luaL_error(
                state,
                to_luastring('async_read expects a string'),
            );
        }
        return runner.yieldWithPromise(state, readFn(to_jsstring(pathBytes)));
    });
    lua.lua_setglobal(L, to_luastring('async_read'));
}

describe('evalLuaAsync', () => {
    it('runs sync Lua code identically to evalLua', async () => {
        const L = createSandboxedState();
        const runner = new CoroutineRunner(L);

        const result = await evalLuaAsync(L, 'SYNC_RESULT = 1 + 2', runner);
        expect(result.ok).toBe(true);

        lua.lua_getglobal(L, to_luastring('SYNC_RESULT'));
        expect(lua.lua_tonumber(L, -1)).toBe(3);
        lua.lua_pop(L, 1);

        runner.destroyAll();
        lua.lua_close(L);
    });

    it('returns syntax errors without crashing', async () => {
        const L = createSandboxedState();
        const runner = new CoroutineRunner(L);

        const result = await evalLuaAsync(
            L,
            'this is not valid lua !!!',
            runner,
        );
        expect(result.ok).toBe(false);
        expect(result.error).toBeDefined();

        runner.destroyAll();
        lua.lua_close(L);
    });

    it('supports top-level async calls via yield/resume', async () => {
        const L = createSandboxedState();
        const runner = new CoroutineRunner(L);
        setupAsyncReadGlobal(L, runner, (path) =>
            Promise.resolve(`content of ${path}`),
        );

        const result = await evalLuaAsync(
            L,
            `
            local content = async_read("test.md")
            ASYNC_RESULT = content
            `,
            runner,
        );
        expect(result.ok).toBe(true);

        lua.lua_getglobal(L, to_luastring('ASYNC_RESULT'));
        expect(to_jsstring(lua.lua_tolstring(L, -1)!)).toBe(
            'content of test.md',
        );
        lua.lua_pop(L, 1);

        runner.destroyAll();
        lua.lua_close(L);
    });

    it('supports sequential async calls at top level', async () => {
        const L = createSandboxedState();
        const runner = new CoroutineRunner(L);
        setupAsyncReadGlobal(L, runner, (path) => Promise.resolve(`[${path}]`));

        const result = await evalLuaAsync(
            L,
            `
            local a = async_read("file_a.md")
            local b = async_read("file_b.md")
            RESULT_A = a
            RESULT_B = b
            `,
            runner,
        );
        expect(result.ok).toBe(true);

        lua.lua_getglobal(L, to_luastring('RESULT_A'));
        expect(to_jsstring(lua.lua_tolstring(L, -1)!)).toBe('[file_a.md]');
        lua.lua_pop(L, 1);

        lua.lua_getglobal(L, to_luastring('RESULT_B'));
        expect(to_jsstring(lua.lua_tolstring(L, -1)!)).toBe('[file_b.md]');
        lua.lua_pop(L, 1);

        runner.destroyAll();
        lua.lua_close(L);
    });

    it('pcall catches async errors at top level', async () => {
        const L = createSandboxedState();
        const runner = new CoroutineRunner(L);
        setupAsyncReadGlobal(L, runner, () =>
            Promise.reject(new Error('file not found')),
        );

        const result = await evalLuaAsync(
            L,
            `
            local ok, err = pcall(async_read, "missing.md")
            PCALL_OK = ok
            PCALL_ERR = err
            `,
            runner,
        );
        expect(result.ok).toBe(true);

        lua.lua_getglobal(L, to_luastring('PCALL_OK'));
        expect(lua.lua_toboolean(L, -1)).toBe(false);
        lua.lua_pop(L, 1);

        lua.lua_getglobal(L, to_luastring('PCALL_ERR'));
        const err = to_jsstring(lua.lua_tolstring(L, -1)!);
        expect(err).toContain('file not found');
        lua.lua_pop(L, 1);

        runner.destroyAll();
        lua.lua_close(L);
    });

    it('side effects from before and after yield are both captured', async () => {
        const L = createSandboxedState();
        const runner = new CoroutineRunner(L);
        setupAsyncReadGlobal(L, runner, () => Promise.resolve('data'));

        const result = await evalLuaAsync(
            L,
            `
            BEFORE_YIELD = "set"
            local content = async_read("test.md")
            AFTER_YIELD = "also set"
            CONTENT = content
            `,
            runner,
        );
        expect(result.ok).toBe(true);

        lua.lua_getglobal(L, to_luastring('BEFORE_YIELD'));
        expect(to_jsstring(lua.lua_tolstring(L, -1)!)).toBe('set');
        lua.lua_pop(L, 1);

        lua.lua_getglobal(L, to_luastring('AFTER_YIELD'));
        expect(to_jsstring(lua.lua_tolstring(L, -1)!)).toBe('also set');
        lua.lua_pop(L, 1);

        lua.lua_getglobal(L, to_luastring('CONTENT'));
        expect(to_jsstring(lua.lua_tolstring(L, -1)!)).toBe('data');
        lua.lua_pop(L, 1);

        runner.destroyAll();
        lua.lua_close(L);
    });

    it('instruction limit is enforced at INSTRUCTION_LIMIT (1M)', async () => {
        const L = createSandboxedState();
        const runner = new CoroutineRunner(L);

        const result = await evalLuaAsync(L, 'while true do end', runner);
        expect(result.ok).toBe(false);
        expect(result.error).toContain('timed out');

        runner.destroyAll();
        lua.lua_close(L);
    });
});
