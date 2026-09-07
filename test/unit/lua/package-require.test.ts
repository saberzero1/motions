import { describe, it, expect } from 'vitest';
import {
    lua,
    lauxlib,
    lualib,
    to_jsstring,
    to_luastring,
} from '../../../src/lib/fengari';
import type { lua_State } from '../../../src/lib/fengari';
import { CoroutineRunner } from '../../../src/lua/coroutine-runner';
import { evalLuaAsync } from '../../../src/lua/engine';
import { injectPackageAndRequire } from '../../../src/lua/package';
import {
    LuaModuleSnapshot,
    type SnapshotAdapter,
} from '../../../src/lua/module-snapshot';

function newState(): lua_State {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    return L;
}

function fakeVault(tree: Record<string, string>): SnapshotAdapter {
    return {
        list: async (dir) => {
            const prefix = dir.endsWith('/') ? dir : `${dir}/`;
            const files: string[] = [];
            const folders = new Set<string>();
            for (const path of Object.keys(tree)) {
                if (!path.startsWith(prefix)) continue;
                const rest = path.slice(prefix.length);
                const slash = rest.indexOf('/');
                if (slash === -1) files.push(path);
                else folders.add(prefix + rest.slice(0, slash));
            }
            return { files, folders: [...folders] };
        },
        read: async (path) => {
            const v = tree[path];
            if (v === undefined) throw new Error(`missing ${path}`);
            return v;
        },
    };
}

async function snapshotOf(
    tree: Record<string, string>,
): Promise<LuaModuleSnapshot> {
    const snapshot = new LuaModuleSnapshot();
    await snapshot.rebuild(fakeVault(tree));
    return snapshot;
}

/**
 * Runs `code` the way a keymap callback runs: on the main state, via a plain
 * `lua_pcall`. Nothing here can yield, which is the condition under test.
 */
function runSynchronously(
    L: lua_State,
    code: string,
): { ok: boolean; error: string | null } {
    const status = lauxlib.luaL_dostring(L, to_luastring(code));
    if (status === lua.LUA_OK) return { ok: true, error: null };
    const msg = lua.lua_tolstring(L, -1);
    const error = msg ? to_jsstring(msg) : 'unknown error';
    lua.lua_pop(L, 1);
    return { ok: false, error };
}

function readGlobalString(L: lua_State, name: string): string {
    lua.lua_getglobal(L, to_luastring(name));
    const value = to_jsstring(lua.lua_tolstring(L, -1)!);
    lua.lua_pop(L, 1);
    return value;
}

function readGlobalBoolean(L: lua_State, name: string): boolean {
    lua.lua_getglobal(L, to_luastring(name));
    const value = lua.lua_toboolean(L, -1);
    lua.lua_pop(L, 1);
    return value;
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
            const missing = Promise.reject(
                new Error(`file not found: ${path}`),
            );
            // yieldWithPromise raises for a state that cannot yield, and does
            // so before taking the promise, leaving nobody to observe it. An
            // extra handler does not consume the rejection for the runner.
            missing.catch(() => {});
            return runner.yieldWithPromise(state, missing);
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

    // Negative control for the snapshot tests below. Without a snapshot the
    // synchronous path can only reach the adapter, and cannot yield to it —
    // this is the failure the snapshot exists to remove, so if this ever
    // passes, those tests have stopped discriminating.
    it('cannot serve a synchronous caller without a snapshot', async () => {
        const L = newState();
        const runner = new CoroutineRunner(L);
        setupFsRead(L, runner, { 'lua/lazy.lua': 'return { ok = true }' });
        injectPackageAndRequire(L, '.obsidian');

        const outcome = runSynchronously(
            L,
            `
            local ok, err = pcall(require, "lazy")
            OK = ok
            ERR = tostring(err)
            `,
        );
        expect(outcome.error).toBeNull();
        expect(readGlobalBoolean(L, 'OK')).toBe(false);
        expect(readGlobalString(L, 'ERR')).toContain('async-capable');

        runner.destroyAll();
        lua.lua_close(L);
    });

    it('resolves from the snapshot without touching the adapter', async () => {
        const L = newState();
        const runner = new CoroutineRunner(L);
        let reads = 0;
        setupFsRead(L, runner, {
            get 'lua/snapped.lua'() {
                reads++;
                return 'return { from = "adapter" }';
            },
        } as unknown as Record<string, string>);
        injectPackageAndRequire(L, '.obsidian', {
            snapshot: await snapshotOf({
                'lua/snapped.lua': 'return { from = "snapshot" }',
            }),
        });

        const result = await evalLuaAsync(
            L,
            'RESULT = require("snapped").from',
            runner,
        );
        expect(result.ok).toBe(true);
        expect(readGlobalString(L, 'RESULT')).toBe('snapshot');
        expect(reads).toBe(0);

        runner.destroyAll();
        lua.lua_close(L);
    });

    it('resolves a snapshot module from a synchronous callback', async () => {
        const L = newState();
        const runner = new CoroutineRunner(L);
        setupFsRead(L, runner, { 'lua/lazy.lua': 'return { ok = true }' });
        injectPackageAndRequire(L, '.obsidian', {
            snapshot: await snapshotOf({
                'lua/lazy.lua': 'return { ok = true }',
            }),
            isAsyncCapable: () => false,
        });

        const outcome = runSynchronously(
            L,
            `
            local mod = require("lazy")
            LOADED = (type(mod) == "table" and mod.ok == true)
            `,
        );
        expect(outcome.error).toBeNull();
        expect(readGlobalBoolean(L, 'LOADED')).toBe(true);

        runner.destroyAll();
        lua.lua_close(L);
    });

    it('falls back to init.lua within the snapshot', async () => {
        const L = newState();
        const runner = new CoroutineRunner(L);
        setupFsRead(L, runner, {});
        injectPackageAndRequire(L, '.obsidian', {
            snapshot: await snapshotOf({
                'lua/flash/init.lua': 'return { name = "flash" }',
            }),
            isAsyncCapable: () => false,
        });

        const outcome = runSynchronously(L, 'NAME = require("flash").name');
        expect(outcome.error).toBeNull();
        expect(readGlobalString(L, 'NAME')).toBe('flash');

        runner.destroyAll();
        lua.lua_close(L);
    });

    it('resolves a nested submodule from a synchronous callback', async () => {
        const L = newState();
        const runner = new CoroutineRunner(L);
        setupFsRead(L, runner, {});
        injectPackageAndRequire(L, '.obsidian', {
            snapshot: await snapshotOf({
                'lua/flash/init.lua': 'return {}',
                'lua/flash/search.lua': 'return { kind = "search" }',
            }),
            isAsyncCapable: () => false,
        });

        const outcome = runSynchronously(
            L,
            `
            local ok, mod = pcall(require, "flash.search")
            OK = ok
            KIND = ok and mod.kind or tostring(mod)
            `,
        );
        expect(outcome.error).toBeNull();
        expect(readGlobalBoolean(L, 'OK')).toBe(true);
        expect(readGlobalString(L, 'KIND')).toBe('search');

        runner.destroyAll();
        lua.lua_close(L);
    });

    it('names the snapshot when a synchronous caller misses', async () => {
        const L = newState();
        const runner = new CoroutineRunner(L);
        setupFsRead(L, runner, { 'lua/present.lua': 'return {}' });
        injectPackageAndRequire(L, '.obsidian', {
            snapshot: await snapshotOf({}),
            isAsyncCapable: () => false,
        });

        const outcome = runSynchronously(
            L,
            `
            local ok, err = pcall(require, "absent")
            OK = ok
            ERR = tostring(err)
            `,
        );
        expect(outcome.error).toBeNull();
        expect(readGlobalBoolean(L, 'OK')).toBe(false);

        const err = readGlobalString(L, 'ERR');
        expect(err).toContain("module 'absent'");
        expect(err).toContain('not present in the configuration snapshot');
        expect(err).toContain('lua/absent.lua');
        expect(err).toContain('lua/absent/init.lua');
        expect(err).not.toContain('async-capable');

        runner.destroyAll();
        lua.lua_close(L);
    });

    it('caches across synchronous calls, so a second require needs no I/O', async () => {
        const L = newState();
        const runner = new CoroutineRunner(L);
        setupFsRead(L, runner, {});
        injectPackageAndRequire(L, '.obsidian', {
            snapshot: await snapshotOf({
                'lua/once.lua': 'COUNT = (COUNT or 0) + 1 return { n = COUNT }',
            }),
            isAsyncCapable: () => false,
        });

        expect(runSynchronously(L, 'A = require("once")').error).toBeNull();
        expect(runSynchronously(L, 'B = require("once")').error).toBeNull();
        expect(runSynchronously(L, 'SAME = (A == B)').error).toBeNull();

        expect(readGlobalBoolean(L, 'SAME')).toBe(true);
        lua.lua_getglobal(L, to_luastring('COUNT'));
        expect(lua.lua_tonumber(L, -1)).toBe(1);
        lua.lua_pop(L, 1);

        runner.destroyAll();
        lua.lua_close(L);
    });

    it('still reads through the adapter for an async-capable caller', async () => {
        const L = newState();
        const runner = new CoroutineRunner(L);
        setupFsRead(L, runner, {
            'lua/adapter_only.lua': 'return { from = "adapter" }',
        });
        injectPackageAndRequire(L, '.obsidian', {
            snapshot: await snapshotOf({}),
            isAsyncCapable: (state) => runner.isAsyncCapable(state),
        });

        const result = await evalLuaAsync(
            L,
            'RESULT = require("adapter_only").from',
            runner,
        );
        expect(result.ok).toBe(true);
        expect(readGlobalString(L, 'RESULT')).toBe('adapter');

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
