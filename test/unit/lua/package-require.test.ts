import { describe, it, expect } from 'vitest';
import { lua, lauxlib, lualib, to_jsstring, to_luastring } from 'fengari';
import type { lua_State } from 'fengari';
import { CoroutineRunner } from '../../../src/lua/coroutine-runner';
import { evalLuaAsync } from '../../../src/lua/engine';
import { injectPackageAndRequire } from '../../../src/lua/package';

function newState(): lua_State {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    return L;
}

function setupFsRead(
    L: lua_State,
    runner: CoroutineRunner,
    files: Record<string, string>,
): void {
    lua.lua_getglobal(L, to_luastring('vim'));
    if (lua.lua_isnil(L, -1)) {
        lua.lua_pop(L, 1);
        lua.lua_newtable(L);
        lua.lua_setglobal(L, to_luastring('vim'));
        lua.lua_getglobal(L, to_luastring('vim'));
    }
    const vimIdx = lua.lua_gettop(L);

    lua.lua_newtable(L);
    const obIdx = lua.lua_gettop(L);

    lua.lua_newtable(L);
    const fsIdx = lua.lua_gettop(L);

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const pathBytes = lua.lua_tolstring(state, 1);
        if (!pathBytes) {
            return lauxlib.luaL_error(
                state,
                to_luastring('vim.ob.fs.read expects a path'),
            );
        }
        const path = to_jsstring(pathBytes);
        const content = files[path];
        if (content === undefined) {
            return runner.yieldWithPromise(
                state,
                Promise.reject(new Error(`file not found: ${path}`)),
            );
        }
        return runner.yieldWithPromise(state, Promise.resolve(content));
    });
    lua.lua_setfield(L, fsIdx, to_luastring('read'));

    lua.lua_setfield(L, obIdx, to_luastring('fs'));
    lua.lua_setfield(L, vimIdx, to_luastring('ob'));
    lua.lua_pop(L, 1);
}

describe('require()', () => {
    it('loads a module and returns its value', async () => {
        const L = newState();
        const runner = new CoroutineRunner(L);
        setupFsRead(L, runner, {
            'lua/mymodule.lua': 'return { greeting = "hello" }',
        });
        injectPackageAndRequire(L, '.obsidian');

        const result = await evalLuaAsync(
            L,
            `
            local m = require("mymodule")
            RESULT = m.greeting
            `,
            runner,
        );
        expect(result.ok).toBe(true);

        lua.lua_getglobal(L, to_luastring('RESULT'));
        expect(to_jsstring(lua.lua_tolstring(L, -1)!)).toBe('hello');
        lua.lua_pop(L, 1);

        runner.destroyAll();
        lua.lua_close(L);
    });

    it('caches modules — second require returns same table', async () => {
        const L = newState();
        const runner = new CoroutineRunner(L);
        let readCount = 0;
        const origFiles: Record<string, string> = {
            'lua/counter.lua': 'return { count = 42 }',
        };
        setupFsRead(
            L,
            runner,
            new Proxy(origFiles, {
                get(target, prop) {
                    if (typeof prop === 'string') readCount++;
                    return Reflect.get(target, prop);
                },
            }),
        );
        injectPackageAndRequire(L, '.obsidian');

        const result = await evalLuaAsync(
            L,
            `
            local a = require("counter")
            local b = require("counter")
            SAME = (a == b)
            COUNT = a.count
            `,
            runner,
        );
        expect(result.ok).toBe(true);

        lua.lua_getglobal(L, to_luastring('SAME'));
        expect(lua.lua_toboolean(L, -1)).toBe(true);
        lua.lua_pop(L, 1);

        lua.lua_getglobal(L, to_luastring('COUNT'));
        expect(lua.lua_tonumber(L, -1)).toBe(42);
        lua.lua_pop(L, 1);

        expect(readCount).toBe(1);

        runner.destroyAll();
        lua.lua_close(L);
    });

    it('resolves dot-separated names to subdirectories', async () => {
        const L = newState();
        const runner = new CoroutineRunner(L);
        setupFsRead(L, runner, {
            'lua/utils/strings.lua': 'return { upper = string.upper }',
        });
        injectPackageAndRequire(L, '.obsidian');

        const result = await evalLuaAsync(
            L,
            `
            local s = require("utils.strings")
            RESULT = s.upper("hello")
            `,
            runner,
        );
        expect(result.ok).toBe(true);

        lua.lua_getglobal(L, to_luastring('RESULT'));
        expect(to_jsstring(lua.lua_tolstring(L, -1)!)).toBe('HELLO');
        lua.lua_pop(L, 1);

        runner.destroyAll();
        lua.lua_close(L);
    });

    it('detects circular require and errors', async () => {
        const L = newState();
        const runner = new CoroutineRunner(L);
        setupFsRead(L, runner, {
            'lua/a.lua': 'require("b") return {}',
            'lua/b.lua': 'require("a") return {}',
        });
        injectPackageAndRequire(L, '.obsidian');

        const result = await evalLuaAsync(
            L,
            `
            local ok, err = pcall(require, "a")
            PCALL_OK = ok
            `,
            runner,
        );
        expect(result.ok).toBe(true);

        lua.lua_getglobal(L, to_luastring('PCALL_OK'));
        expect(lua.lua_toboolean(L, -1)).toBe(true);
        lua.lua_pop(L, 1);

        runner.destroyAll();
        lua.lua_close(L);
    });

    it('errors on missing module', async () => {
        const L = newState();
        const runner = new CoroutineRunner(L);
        setupFsRead(L, runner, {});
        injectPackageAndRequire(L, '.obsidian');

        const result = await evalLuaAsync(
            L,
            `
            local ok, err = pcall(require, "nonexistent")
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
        expect(err).toContain('nonexistent');
        expect(err).toContain('not found');
        lua.lua_pop(L, 1);

        runner.destroyAll();
        lua.lua_close(L);
    });

    it('rejects path traversal in module names', async () => {
        const L = newState();
        const runner = new CoroutineRunner(L);
        setupFsRead(L, runner, {});
        injectPackageAndRequire(L, '.obsidian');

        const result = await evalLuaAsync(
            L,
            `
            local ok, err = pcall(require, "../../etc/passwd")
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
        expect(err).toContain('path traversal');
        lua.lua_pop(L, 1);

        runner.destroyAll();
        lua.lua_close(L);
    });

    it('errors on module with syntax error', async () => {
        const L = newState();
        const runner = new CoroutineRunner(L);
        setupFsRead(L, runner, {
            'lua/broken.lua': 'this is not valid lua !!!',
        });
        injectPackageAndRequire(L, '.obsidian');

        const result = await evalLuaAsync(
            L,
            `
            local ok, err = pcall(require, "broken")
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
        expect(err).toContain('error loading module');
        lua.lua_pop(L, 1);

        runner.destroyAll();
        lua.lua_close(L);
    });

    it('errors on module with runtime error', async () => {
        const L = newState();
        const runner = new CoroutineRunner(L);
        setupFsRead(L, runner, {
            'lua/crasher.lua': 'error("module crashed")',
        });
        injectPackageAndRequire(L, '.obsidian');

        const result = await evalLuaAsync(
            L,
            `
            local ok, err = pcall(require, "crasher")
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
        expect(err).toContain("error in module 'crasher'");
        lua.lua_pop(L, 1);

        runner.destroyAll();
        lua.lua_close(L);
    });

    it('load() works as sandboxed string compilation', async () => {
        const L = newState();
        const runner = new CoroutineRunner(L);
        setupFsRead(L, runner, {});
        injectPackageAndRequire(L, '.obsidian');

        const result = await evalLuaAsync(
            L,
            `
            local fn = load("return 1 + 2")
            RESULT = fn()
            `,
            runner,
        );
        expect(result.ok).toBe(true);

        lua.lua_getglobal(L, to_luastring('RESULT'));
        expect(lua.lua_tonumber(L, -1)).toBe(3);
        lua.lua_pop(L, 1);

        runner.destroyAll();
        lua.lua_close(L);
    });

    it('load() returns nil + error for invalid syntax', async () => {
        const L = newState();
        const runner = new CoroutineRunner(L);
        setupFsRead(L, runner, {});
        injectPackageAndRequire(L, '.obsidian');

        const result = await evalLuaAsync(
            L,
            `
            local fn, err = load("invalid!!!")
            FN_NIL = (fn == nil)
            HAS_ERR = (err ~= nil)
            `,
            runner,
        );
        expect(result.ok).toBe(true);

        lua.lua_getglobal(L, to_luastring('FN_NIL'));
        expect(lua.lua_toboolean(L, -1)).toBe(true);
        lua.lua_pop(L, 1);

        lua.lua_getglobal(L, to_luastring('HAS_ERR'));
        expect(lua.lua_toboolean(L, -1)).toBe(true);
        lua.lua_pop(L, 1);

        runner.destroyAll();
        lua.lua_close(L);
    });
});
