import { describe, it, expect } from 'vitest';
import { lua, lauxlib, lualib, to_jsstring, to_luastring } from 'fengari';
import type { lua_State } from 'fengari';
import { CoroutineRunner } from '../../../src/lua/coroutine-runner';
import { CALLBACK_INSTRUCTION_LIMIT } from '../../../src/lua/engine';

function newState(): lua_State {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    return L;
}

function setupFsReadApi(
    L: lua_State,
    runner: CoroutineRunner,
    readFn: (path: string) => Promise<string>,
): void {
    lua.lua_getglobal(L, to_luastring('vim'));
    if (lua.lua_isnil(L, -1)) {
        lua.lua_pop(L, 1);
        lua.lua_newtable(L);
        lua.lua_setglobal(L, to_luastring('vim'));
        lua.lua_getglobal(L, to_luastring('vim'));
    }
    const vimIndex = lua.lua_gettop(L);

    lua.lua_newtable(L);
    const obIndex = lua.lua_gettop(L);

    lua.lua_newtable(L);
    const fsIndex = lua.lua_gettop(L);

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const path = lua.lua_tolstring(state, 1);
        if (!path) {
            return lauxlib.luaL_error(
                state,
                to_luastring('vim.ob.fs.read expects a path string'),
            );
        }
        const pathStr = to_jsstring(path);
        return runner.yieldWithPromise(state, readFn(pathStr));
    });
    lua.lua_setfield(L, fsIndex, to_luastring('read'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const path = lua.lua_tolstring(state, 1);
        if (!path) {
            return lauxlib.luaL_error(
                state,
                to_luastring('vim.ob.fs.readlines expects a path string'),
            );
        }
        const pathStr = to_jsstring(path);
        const promise = readFn(pathStr).then((content) => content.split('\n'));
        return runner.yieldWithPromise(state, promise);
    });
    lua.lua_setfield(L, fsIndex, to_luastring('readlines'));

    lua.lua_setfield(L, obIndex, to_luastring('fs'));
    lua.lua_setfield(L, vimIndex, to_luastring('ob'));
    lua.lua_pop(L, 1);
}

function loadAndRef(L: lua_State, code: string): number {
    expect(lauxlib.luaL_loadstring(L, to_luastring(code))).toBe(lua.LUA_OK);
    return lauxlib.luaL_ref(L, lua.LUA_REGISTRYINDEX);
}

describe('vim.ob.fs.read', () => {
    it('reads vault file from callback and returns content', async () => {
        const L = newState();
        const runner = new CoroutineRunner(L);
        setupFsReadApi(L, runner, (path) =>
            Promise.resolve(`content of ${path}`),
        );

        const ref = loadAndRef(
            L,
            `
            local content = vim.ob.fs.read("notes/test.md")
            RESULT = content
        `,
        );

        const result = await runner.invokeAsyncCapable(
            ref,
            () => 0,
            CALLBACK_INSTRUCTION_LIMIT,
        );
        expect(result.ok).toBe(true);

        lua.lua_getglobal(L, to_luastring('RESULT'));
        expect(to_jsstring(lua.lua_tolstring(L, -1)!)).toBe(
            'content of notes/test.md',
        );
        lua.lua_pop(L, 1);

        runner.destroyAll();
        lua.lua_close(L);
    });

    it('pcall catches error from nonexistent file', async () => {
        const L = newState();
        const runner = new CoroutineRunner(L);
        setupFsReadApi(L, runner, (path) =>
            Promise.reject(new Error(`file not found: ${path}`)),
        );

        const ref = loadAndRef(
            L,
            `
            local ok, err = pcall(vim.ob.fs.read, "nonexistent.md")
            PCALL_OK = ok
            PCALL_ERR = err
        `,
        );

        const result = await runner.invokeAsyncCapable(
            ref,
            () => 0,
            CALLBACK_INSTRUCTION_LIMIT,
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

    it('reads empty file and returns empty string', async () => {
        const L = newState();
        const runner = new CoroutineRunner(L);
        setupFsReadApi(L, runner, () => Promise.resolve(''));

        const ref = loadAndRef(
            L,
            `
            local content = vim.ob.fs.read("empty.md")
            RESULT = content
            RESULT_LEN = #content
        `,
        );

        const result = await runner.invokeAsyncCapable(
            ref,
            () => 0,
            CALLBACK_INSTRUCTION_LIMIT,
        );
        expect(result.ok).toBe(true);

        lua.lua_getglobal(L, to_luastring('RESULT'));
        expect(to_jsstring(lua.lua_tolstring(L, -1)!)).toBe('');
        lua.lua_pop(L, 1);

        lua.lua_getglobal(L, to_luastring('RESULT_LEN'));
        expect(lua.lua_tonumber(L, -1)).toBe(0);
        lua.lua_pop(L, 1);

        runner.destroyAll();
        lua.lua_close(L);
    });

    it('readlines returns table with correct line count', async () => {
        const L = newState();
        const runner = new CoroutineRunner(L);
        setupFsReadApi(L, runner, () =>
            Promise.resolve('line one\nline two\nline three'),
        );

        const ref = loadAndRef(
            L,
            `
            local lines = vim.ob.fs.readlines("test.md")
            LINE_COUNT = #lines
            LINE_1 = lines[1]
            LINE_3 = lines[3]
        `,
        );

        const result = await runner.invokeAsyncCapable(
            ref,
            () => 0,
            CALLBACK_INSTRUCTION_LIMIT,
        );
        expect(result.ok).toBe(true);

        lua.lua_getglobal(L, to_luastring('LINE_COUNT'));
        expect(lua.lua_tonumber(L, -1)).toBe(3);
        lua.lua_pop(L, 1);

        lua.lua_getglobal(L, to_luastring('LINE_1'));
        expect(to_jsstring(lua.lua_tolstring(L, -1)!)).toBe('line one');
        lua.lua_pop(L, 1);

        lua.lua_getglobal(L, to_luastring('LINE_3'));
        expect(to_jsstring(lua.lua_tolstring(L, -1)!)).toBe('line three');
        lua.lua_pop(L, 1);

        runner.destroyAll();
        lua.lua_close(L);
    });

    it('two sequential reads in one callback return correct values', async () => {
        const L = newState();
        const runner = new CoroutineRunner(L);
        setupFsReadApi(L, runner, (path) =>
            Promise.resolve(`contents of ${path}`),
        );

        const ref = loadAndRef(
            L,
            `
            local a = vim.ob.fs.read("file_a.md")
            local b = vim.ob.fs.read("file_b.md")
            RESULT_A = a
            RESULT_B = b
        `,
        );

        const result = await runner.invokeAsyncCapable(
            ref,
            () => 0,
            CALLBACK_INSTRUCTION_LIMIT,
        );
        expect(result.ok).toBe(true);

        lua.lua_getglobal(L, to_luastring('RESULT_A'));
        expect(to_jsstring(lua.lua_tolstring(L, -1)!)).toBe(
            'contents of file_a.md',
        );
        lua.lua_pop(L, 1);

        lua.lua_getglobal(L, to_luastring('RESULT_B'));
        expect(to_jsstring(lua.lua_tolstring(L, -1)!)).toBe(
            'contents of file_b.md',
        );
        lua.lua_pop(L, 1);

        runner.destroyAll();
        lua.lua_close(L);
    });

    it('snippet context blocks async read with error', async () => {
        const L = newState();
        const runner = new CoroutineRunner(L);
        setupFsReadApi(L, runner, () => Promise.resolve('data'));

        runner.setAsyncBlocked(true);

        const ref = loadAndRef(L, `return vim.ob.fs.read("test.md")`);
        const result = await runner.invokeAsyncCapable(
            ref,
            () => 0,
            CALLBACK_INSTRUCTION_LIMIT,
        );
        expect(result.ok).toBe(false);
        expect(result.error).toContain('snippet');

        runner.setAsyncBlocked(false);
        runner.destroyAll();
        lua.lua_close(L);
    });
});
