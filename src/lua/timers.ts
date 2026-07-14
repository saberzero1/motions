import { lua, lauxlib, to_jsstring, to_luastring } from 'fengari';
import type { lua_State } from 'fengari';
import {
    CALLBACK_INSTRUCTION_LIMIT,
    evalLua,
    showLuaErrorNotice,
    withInstructionGuard,
} from './engine';

type LuaRef = { L: lua_State; ref: number };
type TimerHandle = number;

const safeSetTimeout = (fn: () => void, ms: number): TimerHandle =>
    window.setTimeout(fn, ms);
const safeSetInterval = (fn: () => void, ms: number): TimerHandle =>
    window.setInterval(fn, ms);
const safeClearTimeout = (id: TimerHandle): void => window.clearTimeout(id);
const safeClearInterval = (id: TimerHandle): void => window.clearInterval(id);

export class TimerManager {
    private activeTimers = new Set<number>();
    private timerHandles = new Map<number, TimerHandle>();
    private luaRefs: LuaRef[] = [];
    private destroyed = false;
    private nextTimerId = 1;

    destroyAll(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        for (const id of [...this.activeTimers]) {
            this.clearTimer(id);
        }
        for (const entry of [...this.luaRefs]) {
            lauxlib.luaL_unref(entry.L, lua.LUA_REGISTRYINDEX, entry.ref);
        }
        this.luaRefs = [];
    }

    isDestroyed(): boolean {
        return this.destroyed;
    }

    trackTimer(handle: TimerHandle): number {
        const id = this.nextTimerId++;
        this.activeTimers.add(id);
        this.timerHandles.set(id, handle);
        return id;
    }

    untrackTimer(id: number): void {
        this.activeTimers.delete(id);
        this.timerHandles.delete(id);
    }

    clearTimer(id: number): void {
        const handle = this.timerHandles.get(id);
        if (handle) {
            safeClearTimeout(handle);
            safeClearInterval(handle);
        }
        this.timerHandles.delete(id);
        this.activeTimers.delete(id);
    }

    trackRef(L: lua_State, ref: number): LuaRef {
        const entry = { L, ref };
        this.luaRefs.push(entry);
        return entry;
    }

    unref(entry: LuaRef): void {
        const index = this.luaRefs.indexOf(entry);
        if (index === -1) return;
        this.luaRefs.splice(index, 1);
        lauxlib.luaL_unref(entry.L, lua.LUA_REGISTRYINDEX, entry.ref);
    }
}

function invokeLuaCallback(manager: TimerManager, entry: LuaRef): void {
    if (manager.isDestroyed()) {
        manager.unref(entry);
        return;
    }
    try {
        lua.lua_rawgeti(entry.L, lua.LUA_REGISTRYINDEX, entry.ref);
        const status = withInstructionGuard(
            entry.L,
            CALLBACK_INSTRUCTION_LIMIT,
            () => lua.lua_pcall(entry.L, 0, 0, 0),
        );
        if (status !== lua.LUA_OK) {
            const message = lua.lua_tolstring(entry.L, -1);
            const error = message ? to_jsstring(message) : 'Lua callback error';
            console.error(`Vim Motions: ${error}`);
            showLuaErrorNotice(error);
            lua.lua_pop(entry.L, 1);
        }
    } catch (error) {
        console.error(error);
    }
}

function createTimerHandle(
    L: lua_State,
    state: {
        closed: boolean;
        active: boolean;
        timeoutId: number | null;
        intervalId: number | null;
        refEntry: LuaRef | null;
    },
    manager: TimerManager,
    onClose?: () => void,
    handleIndex?: number,
): number {
    const stop = () => {
        if (state.timeoutId !== null) {
            manager.clearTimer(state.timeoutId);
            state.timeoutId = null;
        }
        if (state.intervalId !== null) {
            manager.clearTimer(state.intervalId);
            state.intervalId = null;
        }
        state.active = false;
    };

    const close = () => {
        if (state.closed) return;
        stop();
        state.closed = true;
        if (state.refEntry) {
            manager.unref(state.refEntry);
            state.refEntry = null;
        }
        onClose?.();
    };

    const resolvedIndex =
        handleIndex ?? (lua.lua_newtable(L), lua.lua_gettop(L));

    lua.lua_pushjsfunction(L, () => {
        stop();
        return 0;
    });
    lua.lua_setfield(L, resolvedIndex, to_luastring('stop'));

    lua.lua_pushjsfunction(L, () => {
        close();
        return 0;
    });
    lua.lua_setfield(L, resolvedIndex, to_luastring('close'));

    lua.lua_pushjsfunction(L, (stateRef: lua_State) => {
        lua.lua_pushboolean(stateRef, state.closed);
        return 1;
    });
    lua.lua_setfield(L, resolvedIndex, to_luastring('is_closing'));

    lua.lua_pushjsfunction(L, (stateRef: lua_State) => {
        lua.lua_pushboolean(stateRef, state.active);
        return 1;
    });
    lua.lua_setfield(L, resolvedIndex, to_luastring('is_active'));

    return resolvedIndex;
}

function getTimerStartArgs(L: lua_State): {
    delayIndex: number;
    repeatIndex: number;
    callbackIndex: number;
} {
    const firstIsNumber = lua.lua_isnumber(L, 1);
    if (firstIsNumber) {
        return { delayIndex: 1, repeatIndex: 2, callbackIndex: 3 };
    }
    return { delayIndex: 2, repeatIndex: 3, callbackIndex: 4 };
}

export function injectTimers(L: lua_State): TimerManager {
    const manager = new TimerManager();

    lua.lua_getglobal(L, to_luastring('vim'));
    const vimIndex = lua.lua_gettop(L);

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        if (!lua.lua_isfunction(state, 1)) {
            return lauxlib.luaL_error(
                state,
                to_luastring('vim.schedule expects a function'),
            );
        }
        lua.lua_pushvalue(state, 1);
        const ref = lauxlib.luaL_ref(state, lua.LUA_REGISTRYINDEX);
        const entry = manager.trackRef(state, ref);

        let timerId = 0;
        const handle = safeSetTimeout(() => {
            manager.untrackTimer(timerId);
            invokeLuaCallback(manager, entry);
            manager.unref(entry);
        }, 0);
        timerId = manager.trackTimer(handle);
        return 0;
    });
    lua.lua_setfield(L, vimIndex, to_luastring('schedule'));
    lua.lua_pop(L, 1);

    const scheduleWrapResult = evalLua(
        L,
        `vim.schedule_wrap = function(fn)
            return function(...)
                local args = {...}
                vim.schedule(function() fn(unpack(args)) end)
            end
        end`,
    );
    if (!scheduleWrapResult.ok) {
        console.error(`Vim Motions: ${scheduleWrapResult.error}`);
    }

    lua.lua_getglobal(L, to_luastring('vim'));
    const vimIndexAfterSchedule = lua.lua_gettop(L);

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        if (!lua.lua_isfunction(state, 1)) {
            return lauxlib.luaL_error(
                state,
                to_luastring('vim.defer_fn expects a function'),
            );
        }
        if (!lua.lua_isnumber(state, 2)) {
            return lauxlib.luaL_error(
                state,
                to_luastring('vim.defer_fn expects a timeout number'),
            );
        }

        lua.lua_pushvalue(state, 1);
        const ref = lauxlib.luaL_ref(state, lua.LUA_REGISTRYINDEX);
        const entry = manager.trackRef(state, ref);
        const delay = lua.lua_tonumber(state, 2);

        const timerState = {
            closed: false,
            active: true,
            timeoutId: null as number | null,
            intervalId: null as number | null,
            refEntry: entry as LuaRef | null,
        };

        let timerId = 0;
        const handle = safeSetTimeout(() => {
            manager.untrackTimer(timerId);
            timerState.active = false;
            invokeLuaCallback(manager, entry);
            if (timerState.refEntry) {
                manager.unref(timerState.refEntry);
                timerState.refEntry = null;
            }
        }, delay);
        timerId = manager.trackTimer(handle);
        timerState.timeoutId = timerId;

        createTimerHandle(state, timerState, manager);
        return 1;
    });
    lua.lua_setfield(L, vimIndexAfterSchedule, to_luastring('defer_fn'));

    lua.lua_newtable(L);
    const uvIndex = lua.lua_gettop(L);

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const timerState = {
            closed: false,
            active: false,
            timeoutId: null as number | null,
            intervalId: null as number | null,
            refEntry: null as LuaRef | null,
        };

        lua.lua_newtable(state);
        const timerTableIndex = lua.lua_gettop(state);

        lua.lua_pushjsfunction(state, (stateRef: lua_State) => {
            if (timerState.closed) return 0;
            const { delayIndex, repeatIndex, callbackIndex } =
                getTimerStartArgs(stateRef);
            if (!lua.lua_isnumber(stateRef, delayIndex)) {
                return lauxlib.luaL_error(
                    stateRef,
                    to_luastring('timer.start expects a delay number'),
                );
            }
            if (!lua.lua_isnumber(stateRef, repeatIndex)) {
                return lauxlib.luaL_error(
                    stateRef,
                    to_luastring('timer.start expects a repeat number'),
                );
            }
            if (!lua.lua_isfunction(stateRef, callbackIndex)) {
                return lauxlib.luaL_error(
                    stateRef,
                    to_luastring('timer.start expects a callback function'),
                );
            }

            if (timerState.timeoutId !== null) {
                manager.clearTimer(timerState.timeoutId);
                timerState.timeoutId = null;
            }
            if (timerState.intervalId !== null) {
                manager.clearTimer(timerState.intervalId);
                timerState.intervalId = null;
            }

            if (timerState.refEntry) {
                manager.unref(timerState.refEntry);
                timerState.refEntry = null;
            }

            lua.lua_pushvalue(stateRef, callbackIndex);
            const ref = lauxlib.luaL_ref(stateRef, lua.LUA_REGISTRYINDEX);
            timerState.refEntry = manager.trackRef(stateRef, ref);

            const delay = lua.lua_tonumber(stateRef, delayIndex);
            const repeat = lua.lua_tonumber(stateRef, repeatIndex);
            timerState.active = true;

            if (repeat === 0) {
                let timeoutId = 0;
                const timeoutHandle = safeSetTimeout(() => {
                    manager.untrackTimer(timeoutId);
                    timerState.active = false;
                    if (timerState.refEntry) {
                        invokeLuaCallback(manager, timerState.refEntry);
                        manager.unref(timerState.refEntry);
                        timerState.refEntry = null;
                    }
                }, delay);
                timeoutId = manager.trackTimer(timeoutHandle);
                timerState.timeoutId = timeoutId;
            } else if (repeat > 0) {
                let timeoutId = 0;
                const timeoutHandle = safeSetTimeout(() => {
                    manager.untrackTimer(timeoutId);
                    timerState.timeoutId = null;
                    if (timerState.refEntry) {
                        invokeLuaCallback(manager, timerState.refEntry);
                    }
                    const intervalHandle = safeSetInterval(() => {
                        if (!timerState.refEntry) return;
                        invokeLuaCallback(manager, timerState.refEntry);
                    }, repeat);
                    const intervalId = manager.trackTimer(intervalHandle);
                    timerState.intervalId = intervalId;
                }, delay);
                timeoutId = manager.trackTimer(timeoutHandle);
                timerState.timeoutId = timeoutId;
            }

            return 0;
        });
        lua.lua_setfield(state, timerTableIndex, to_luastring('start'));

        createTimerHandle(
            state,
            timerState,
            manager,
            () => {
                timerState.active = false;
            },
            timerTableIndex,
        );

        return 1;
    });
    lua.lua_setfield(L, uvIndex, to_luastring('new_timer'));

    lua.lua_pushjsfunction(L, () => {
        lua.lua_pushnumber(L, Math.round(performance.now() * 1e6));
        return 1;
    });
    lua.lua_setfield(L, uvIndex, to_luastring('hrtime'));

    lua.lua_pushjsfunction(L, () => {
        lua.lua_pushnumber(L, Date.now());
        return 1;
    });
    lua.lua_setfield(L, uvIndex, to_luastring('now'));

    lua.lua_pushvalue(L, uvIndex);
    lua.lua_setfield(L, vimIndexAfterSchedule, to_luastring('uv'));
    lua.lua_pushvalue(L, uvIndex);
    lua.lua_setfield(L, vimIndexAfterSchedule, to_luastring('loop'));
    lua.lua_pop(L, 2);

    return manager;
}
