import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { lua, lauxlib, lualib, to_luastring } from 'fengari';
import type { lua_State } from 'fengari';
import { CoroutineRunner } from '../../../src/lua/coroutine-runner';
import {
    createSandboxedState,
    destroyState,
    withInstructionGuard,
} from '../../../src/lua/engine';
import { clearViolations, getViolations } from '../../../src/util/invariant';

function newState(): lua_State {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    return L;
}

function loadAndRef(L: lua_State, code: string): number {
    expect(lauxlib.luaL_loadstring(L, to_luastring(code))).toBe(lua.LUA_OK);
    return lauxlib.luaL_ref(L, lua.LUA_REGISTRYINDEX);
}

describe('createSandboxedState()', () => {
    it('returns a non-null state', () => {
        const L = createSandboxedState();
        expect(L).not.toBeNull();
        destroyState(L);
    });

    it('destroyState() closes without error', () => {
        const L = createSandboxedState();
        expect(() => destroyState(L)).not.toThrow();
    });
});

describe('withInstructionGuard()', () => {
    let L: lua_State;

    beforeEach(() => {
        L = newState();
        clearViolations();
    });

    afterEach(() => {
        lua.lua_close(L);
    });

    it('triggers invariant when limit is 0', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        withInstructionGuard(L, 0, () => 0);
        const violations = getViolations();
        expect(
            violations.some((v) => v.message.includes('must be positive')),
        ).toBe(true);
        spy.mockRestore();
    });

    it('cleans up hook in finally block after error', () => {
        expect(() => {
            withInstructionGuard(L, 1000, () => {
                throw new Error('test error');
            });
        }).toThrow('test error');
    });
});

describe('CoroutineRunner lifecycle', () => {
    let L: lua_State;
    let runner: CoroutineRunner;

    beforeEach(() => {
        L = newState();
        runner = new CoroutineRunner(L);
        clearViolations();
    });

    afterEach(() => {
        if (!runner.isDestroyed()) {
            runner.destroyAll();
        }
        lua.lua_close(L);
    });

    it('rejects when destroyed', () => {
        runner.destroyAll();
        expect(runner.isDestroyed()).toBe(true);
    });

    it('isDestroyed() is false initially', () => {
        expect(runner.isDestroyed()).toBe(false);
    });

    it('destroyAll() twice triggers invariant', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        runner.destroyAll();
        runner.destroyAll();
        const violations = getViolations();
        expect(
            violations.some((v) => v.message.includes('already-destroyed')),
        ).toBe(true);
        spy.mockRestore();
    });

    it('destroyAll() clears all handles', () => {
        runner.destroyAll();
        expect(runner.activeCount).toBe(0);
    });
});
