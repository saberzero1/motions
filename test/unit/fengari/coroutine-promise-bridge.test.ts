import type { lua_State } from '../../../src/lib/fengari/lstate.js';
/**
 * Phase 0 Spike: Validate lua_yieldk continuations in fengari.
 *
 * These tests prove that the coroutine↔Promise bridge mechanism works
 * before committing to the full implementation. Each test validates one
 * aspect of the yield/resume/continuation protocol.
 *
 * Setup pattern: globals (C-functions) are registered on the main state.
 * A thread is created via lua_newthread. The Lua chunk is compiled directly
 * on the thread (which shares globals). lua_resume drives execution.
 *
 * NOTE: lua_newthread pushes the thread onto the PARENT's stack. Do NOT
 * lua_xmove the top of the parent stack after lua_newthread — that moves
 * the thread value itself. Instead, compile the chunk on the thread directly.
 */

import * as lua from '../../../src/lib/fengari/lua.js';
import * as lauxlib from '../../../src/lib/fengari/lauxlib.js';
import * as lualib from '../../../src/lib/fengari/lualib.js';
import {
    to_luastring,
    to_jsstring,
} from '../../../src/lib/fengari/fengaricore.js';

function newState(): lua_State {
    const L = lauxlib.luaL_newstate();
    if (!L) throw Error('failed to create lua state');
    lualib.luaL_openlibs(L);
    return L;
}

function readString(L, index) {
    const val = lua.lua_tolstring(L, index);
    return val ? to_jsstring(val) : null;
}

function createThread(L, luaCode) {
    const thread = lua.lua_newthread(L);
    expect(lauxlib.luaL_loadstring(thread, to_luastring(luaCode))).toBe(
        lua.LUA_OK,
    );
    return thread;
}

// Test 1: C-function yields via lua_yieldk, JS resumes, continuation receives value
test('T1: basic yield/resume with continuation', () => {
    const L = newState();

    let continuationCalled = false;
    let continuationStatus = null;
    let continuationCtx = null;

    lua.lua_pushjsfunction(L, function (state) {
        const CONTEXT_ID = 42;
        const continuation = function (contState, status, ctx) {
            continuationCalled = true;
            continuationStatus = status;
            continuationCtx = ctx;
            return 1;
        };
        return lua.lua_yieldk(state, 0, CONTEXT_ID, continuation);
    });
    lua.lua_setglobal(L, to_luastring('async_read'));

    const thread = createThread(L, `return async_read()`);

    let status = lua.lua_resume(thread, L, 0);
    expect(status).toBe(lua.LUA_YIELD);
    expect(continuationCalled).toBe(false);

    lua.lua_pushstring(thread, to_luastring('file content here'));
    status = lua.lua_resume(thread, L, 1);

    expect(status).toBe(lua.LUA_OK);
    expect(continuationCalled).toBe(true);
    expect(continuationStatus).toBe(lua.LUA_YIELD);
    expect(continuationCtx).toBe(42);
    expect(readString(thread, -1)).toBe('file content here');
});

// Test 2: lua_isyieldable returns correct values
test('T2: lua_isyieldable is true in coroutine, false on main state', () => {
    const L = newState();
    expect(lua.lua_isyieldable(L)).toBe(false);

    let yieldableInside = null;

    lua.lua_pushjsfunction(L, function (state) {
        yieldableInside = lua.lua_isyieldable(state);
        lua.lua_pushboolean(state, yieldableInside ? 1 : 0);
        return 1;
    });
    lua.lua_setglobal(L, to_luastring('check_yieldable'));

    const thread = createThread(L, `return check_yieldable()`);
    const status = lua.lua_resume(thread, L, 0);

    expect(status).toBe(lua.LUA_OK);
    expect(yieldableInside).toBe(true);
});

// Test 3: pcall across yield boundary
test('T3: pcall around yielding function — yield propagates through pcall', () => {
    const L = newState();

    lua.lua_pushjsfunction(L, function (state) {
        return lua.lua_yieldk(state, 0, 0, function (s) {
            return 1;
        });
    });
    lua.lua_setglobal(L, to_luastring('async_op'));

    const thread = createThread(
        L,
        `
        local ok, result = pcall(async_op)
        return ok, result
    `,
    );

    let status = lua.lua_resume(thread, L, 0);
    expect(status).toBe(lua.LUA_YIELD);

    lua.lua_pushstring(thread, to_luastring('success value'));
    status = lua.lua_resume(thread, L, 1);

    expect(status).toBe(lua.LUA_OK);
    expect(lua.lua_toboolean(thread, -2)).toBe(true);
    expect(readString(thread, -1)).toBe('success value');
});

// Test 4: Instruction count hook across yield/resume
test('T4: instruction hook on thread fires after resume', () => {
    const L = newState();
    let hookFired = false;

    lua.lua_pushjsfunction(L, function (state) {
        return lua.lua_yieldk(state, 0, 0, function (s) {
            return 1;
        });
    });
    lua.lua_setglobal(L, to_luastring('async_op'));

    const thread = createThread(
        L,
        `
        local val = async_op()
        local sum = 0
        for i = 1, 1000000 do
            sum = sum + i
        end
        return val, sum
    `,
    );

    let status = lua.lua_resume(thread, L, 0);
    expect(status).toBe(lua.LUA_YIELD);

    lua.lua_sethook(
        thread,
        function (hookState) {
            hookFired = true;
            lauxlib.luaL_error(
                hookState,
                to_luastring('instruction limit exceeded'),
            );
        },
        lua.LUA_MASKCOUNT,
        100,
    );

    lua.lua_pushstring(thread, to_luastring('resumed'));
    status = lua.lua_resume(thread, L, 1);

    expect(hookFired).toBe(true);
    expect(status).not.toBe(lua.LUA_OK);
    expect(status).not.toBe(lua.LUA_YIELD);
    expect(readString(thread, -1)).toContain('instruction limit exceeded');
});

// Test 5: Error propagation via continuation (nil + errmsg protocol)
test('T5: continuation detects nil marker and calls luaL_error', () => {
    const L = newState();

    lua.lua_pushjsfunction(L, function (state) {
        const continuation = function (contState) {
            if (lua.lua_isnil(contState, 1)) {
                const errMsg = lua.lua_tolstring(contState, 2);
                return lauxlib.luaL_error(
                    contState,
                    errMsg || to_luastring('unknown error'),
                );
            }
            return 1;
        };
        return lua.lua_yieldk(state, 0, 0, continuation);
    });
    lua.lua_setglobal(L, to_luastring('async_op'));

    const thread = createThread(L, `return async_op()`);

    let status = lua.lua_resume(thread, L, 0);
    expect(status).toBe(lua.LUA_YIELD);

    lua.lua_pushnil(thread);
    lua.lua_pushstring(thread, to_luastring('file not found: test.md'));
    status = lua.lua_resume(thread, L, 2);

    expect(status).toBe(lua.LUA_ERRRUN);
    expect(readString(thread, -1)).toContain('file not found: test.md');
});

// Test 6: Error propagation through pcall across yield
test('T6: pcall catches continuation error after yield/resume', () => {
    const L = newState();

    lua.lua_pushjsfunction(L, function (state) {
        const continuation = function (contState) {
            if (lua.lua_isnil(contState, 1)) {
                const errMsg = lua.lua_tolstring(contState, 2);
                return lauxlib.luaL_error(
                    contState,
                    errMsg || to_luastring('unknown error'),
                );
            }
            return 1;
        };
        return lua.lua_yieldk(state, 0, 0, continuation);
    });
    lua.lua_setglobal(L, to_luastring('async_op'));

    const thread = createThread(
        L,
        `
        local ok, err = pcall(async_op)
        return ok, err
    `,
    );

    let status = lua.lua_resume(thread, L, 0);
    expect(status).toBe(lua.LUA_YIELD);

    lua.lua_pushnil(thread);
    lua.lua_pushstring(thread, to_luastring('file not found: test.md'));
    status = lua.lua_resume(thread, L, 2);

    expect(status).toBe(lua.LUA_OK);
    expect(lua.lua_toboolean(thread, -2)).toBe(false);
    expect(readString(thread, -1)).toContain('file not found: test.md');
});

// Test 7: Double yield (sequential async calls)
test('T7: two sequential yields — both resume correctly', () => {
    const L = newState();
    let yieldCount = 0;

    lua.lua_pushjsfunction(L, function (state) {
        yieldCount++;
        return lua.lua_yieldk(state, 0, 0, function (s) {
            return 1;
        });
    });
    lua.lua_setglobal(L, to_luastring('async_op'));

    const thread = createThread(
        L,
        `
        local a = async_op()
        local b = async_op()
        return a, b
    `,
    );

    let status = lua.lua_resume(thread, L, 0);
    expect(status).toBe(lua.LUA_YIELD);
    expect(yieldCount).toBe(1);

    lua.lua_pushstring(thread, to_luastring('value_a'));
    status = lua.lua_resume(thread, L, 1);
    expect(status).toBe(lua.LUA_YIELD);
    expect(yieldCount).toBe(2);

    lua.lua_pushstring(thread, to_luastring('value_b'));
    status = lua.lua_resume(thread, L, 1);

    expect(status).toBe(lua.LUA_OK);
    expect(readString(thread, -2)).toBe('value_a');
    expect(readString(thread, -1)).toBe('value_b');
});

// Test 8 (informational): Lua-level coroutine.create captures yields internally
test('T8: Lua coroutine.create captures yield — JS host cannot detect it', () => {
    const L = newState();

    lua.lua_pushjsfunction(L, function (state) {
        return lua.lua_yieldk(state, 0, 0, function (s) {
            return 1;
        });
    });
    lua.lua_setglobal(L, to_luastring('async_op'));

    // coroutine.create wraps the yielding function — the yield is captured
    // by the inner coroutine, not propagated to the outer thread
    const thread = createThread(
        L,
        `
        local co = coroutine.create(function()
            local val = async_op()
            return val .. " processed"
        end)
        local ok, yielded = coroutine.resume(co)
        return coroutine.status(co)
    `,
    );

    const status = lua.lua_resume(thread, L, 0);

    // Outer thread completes — the yield was captured by the inner coroutine.
    // JS host sees LUA_OK, not LUA_YIELD.
    // CONCLUSION: Lua-level coroutines are NOT suitable for the bridge.
    // The bridge MUST use C-level lua_newthread so JS can detect LUA_YIELD.
    expect(status).toBe(lua.LUA_OK);
    expect(readString(thread, -1)).toBe('suspended');
});
