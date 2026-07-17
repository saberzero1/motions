import { lua, lauxlib, to_jsstring, to_luastring } from 'fengari';
import type { lua_State } from 'fengari';
import { pushLuaAny } from './api';

const ASYNC_TIMEOUT_MS = 10_000;
const MAX_CONCURRENT = 16;

function safeSetTimeout(callback: () => void, ms: number): number {
    return window.setTimeout(callback, ms);
}

function safeClearTimeout(id: number): void {
    window.clearTimeout(id);
}

interface CoroutineHandle {
    id: number;
    thread: lua_State;
    threadRef: number;
    instructionLimit: number;
    createdAt: number;
    timeoutId: number | null;
    cancelAwait: (() => void) | null;
}

interface PromiseResult {
    ok: boolean;
    error?: string;
}

export class AsyncRegistry {
    private pending = new Map<number, Promise<unknown>>();

    store(threadRef: number, promise: Promise<unknown>): void {
        this.pending.set(threadRef, promise);
    }

    retrieve(threadRef: number): Promise<unknown> | undefined {
        return this.pending.get(threadRef);
    }

    clear(threadRef: number): void {
        this.pending.delete(threadRef);
    }

    clearAll(): void {
        this.pending.clear();
    }
}

export class CoroutineRunner {
    private mainState: lua_State;
    private registry = new AsyncRegistry();
    private handles = new Map<number, CoroutineHandle>();
    private nextId = 0;
    private destroyed = false;
    private asyncBlocked = false;
    private threadRefByState = new Map<lua_State, number>();

    constructor(mainState: lua_State) {
        this.mainState = mainState;
    }

    async invokeAsyncCapable(
        funcRef: number,
        pushArgs: (thread: lua_State) => number,
        instructionLimit: number,
    ): Promise<PromiseResult> {
        if (this.destroyed) {
            return { ok: false, error: 'Lua state destroyed' };
        }
        if (this.handles.size >= MAX_CONCURRENT) {
            return {
                ok: false,
                error: 'too many concurrent async operations',
            };
        }

        const thread = lua.lua_newthread(this.mainState);
        const threadRef = lauxlib.luaL_ref(
            this.mainState,
            lua.LUA_REGISTRYINDEX,
        );
        this.threadRefByState.set(thread, threadRef);

        lua.lua_rawgeti(thread, lua.LUA_REGISTRYINDEX, funcRef);
        const nargs = pushArgs(thread);

        this.setInstructionHook(thread, instructionLimit);

        try {
            let status = lua.lua_resume(thread, this.mainState, nargs);

            while (status === lua.LUA_YIELD) {
                const promise = this.registry.retrieve(threadRef);
                if (!promise) {
                    this.cleanup(thread, threadRef);
                    return {
                        ok: false,
                        error: 'coroutine yielded without async operation',
                    };
                }
                this.registry.clear(threadRef);

                let result: unknown;
                let rejected = false;
                try {
                    result = await this.awaitWithTimeout(
                        promise,
                        threadRef,
                        thread,
                        instructionLimit,
                    );
                } catch (err) {
                    rejected = true;
                    result = err instanceof Error ? err.message : String(err);
                }

                if (this.destroyed) {
                    return {
                        ok: false,
                        error: 'Lua state destroyed during async operation',
                    };
                }

                this.removeHandle(threadRef);
                this.setInstructionHook(thread, instructionLimit);

                if (rejected) {
                    lua.lua_pushnil(thread);
                    lua.lua_pushstring(thread, to_luastring(result as string));
                    status = lua.lua_resume(thread, this.mainState, 2);
                } else {
                    pushLuaAny(thread, result);
                    status = lua.lua_resume(thread, this.mainState, 1);
                }
            }

            if (status === lua.LUA_OK) {
                this.cleanup(thread, threadRef);
                return { ok: true };
            }

            const msg = lua.lua_tolstring(thread, -1);
            const error = msg ? to_jsstring(msg) : 'Lua callback error';
            this.cleanup(thread, threadRef);
            return { ok: false, error };
        } finally {
            lua.lua_sethook(thread, null, 0, 0);
        }
    }

    yieldWithPromise(L: lua_State, promise: Promise<unknown>): number {
        if (this.asyncBlocked) {
            return lauxlib.luaL_error(
                L,
                to_luastring('async APIs cannot be called from snippet nodes'),
            );
        }

        const threadRef = this.threadRefByState.get(L);
        if (threadRef === undefined) {
            return lauxlib.luaL_error(
                L,
                to_luastring(
                    'async APIs can only be called from async-capable callbacks',
                ),
            );
        }

        this.registry.store(threadRef, promise);

        const continuation = (
            contState: lua_State,
            _status: number,
            _ctx: number,
        ): number => {
            const top = lua.lua_gettop(contState);
            if (top >= 2 && lua.lua_isnil(contState, top - 1)) {
                const errMsg = lua.lua_tolstring(contState, top);
                return lauxlib.luaL_error(
                    contState,
                    errMsg ?? to_luastring('unknown async error'),
                );
            }
            return 1;
        };

        return lua.lua_yieldk(L, 0, 0, continuation);
    }

    setAsyncBlocked(blocked: boolean): void {
        this.asyncBlocked = blocked;
    }

    destroyAll(): void {
        this.destroyed = true;
        for (const handle of this.handles.values()) {
            if (handle.timeoutId !== null) {
                safeClearTimeout(handle.timeoutId);
            }
            handle.cancelAwait?.();
            lauxlib.luaL_unref(
                this.mainState,
                lua.LUA_REGISTRYINDEX,
                handle.threadRef,
            );
        }
        this.handles.clear();
        this.registry.clearAll();
        this.threadRefByState.clear();
    }

    get activeCount(): number {
        return this.handles.size;
    }

    isDestroyed(): boolean {
        return this.destroyed;
    }

    private setInstructionHook(thread: lua_State, limit: number): void {
        lua.lua_sethook(
            thread,
            (hookState: lua_State) => {
                lauxlib.luaL_error(
                    hookState,
                    to_luastring('Lua execution timed out'),
                );
                return 0;
            },
            lua.LUA_MASKCOUNT,
            limit,
        );
    }

    private awaitWithTimeout(
        promise: Promise<unknown>,
        threadRef: number,
        thread: lua_State,
        instructionLimit: number,
    ): Promise<unknown> {
        return new Promise((resolve, reject) => {
            const handle: CoroutineHandle = {
                id: this.nextId++,
                thread,
                threadRef,
                instructionLimit,
                createdAt: Date.now(),
                timeoutId: null,
                cancelAwait: null,
            };

            handle.timeoutId = safeSetTimeout(() => {
                this.removeHandle(threadRef);
                reject(new Error('async operation timed out'));
            }, ASYNC_TIMEOUT_MS);

            handle.cancelAwait = () => {
                reject(new Error('Lua state destroyed during async operation'));
            };

            this.handles.set(threadRef, handle);

            promise.then(
                (value) => {
                    if (this.destroyed || !this.handles.has(threadRef)) return;
                    if (handle.timeoutId !== null) {
                        safeClearTimeout(handle.timeoutId);
                    }
                    resolve(value);
                },
                (err) => {
                    if (this.destroyed || !this.handles.has(threadRef)) return;
                    if (handle.timeoutId !== null) {
                        safeClearTimeout(handle.timeoutId);
                    }
                    reject(err instanceof Error ? err : new Error(String(err)));
                },
            );
        });
    }

    private removeHandle(threadRef: number): void {
        const handle = this.handles.get(threadRef);
        if (!handle) return;
        if (handle.timeoutId !== null) {
            safeClearTimeout(handle.timeoutId);
        }
        this.handles.delete(threadRef);
    }

    private cleanup(thread: lua_State, threadRef: number): void {
        this.removeHandle(threadRef);
        this.threadRefByState.delete(thread);
        lauxlib.luaL_unref(this.mainState, lua.LUA_REGISTRYINDEX, threadRef);
    }
}
