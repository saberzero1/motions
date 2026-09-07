import { lua, lauxlib, to_jsstring, to_luastring } from '../lib/fengari';
import type { lua_State } from '../lib/fengari';
import { CALLBACK_INSTRUCTION_LIMIT, registerStateCleanup } from './engine';
import type { CoroutineRunner } from './coroutine-runner';

function readString(L: lua_State, index: number): string | null {
    const raw = lua.lua_tolstring(L, index);
    return raw ? to_jsstring(raw) : null;
}

export interface UiSelectItem {
    index: number;
    label: string;
}

export interface UiSelectHandle {
    close(): void;
}

export interface UiCallbacks {
    /** Returns an error string when no handler exists, else null on success. */
    openPath?: (path: string) => string | null;
    openSelect?: (
        items: UiSelectItem[],
        opts: { prompt?: string; kind?: string },
        onChoice: (index: number | null) => void,
    ) => UiSelectHandle | void;
    showInputPrompt?: (
        prompt: string,
        defaultText: string,
    ) => Promise<string | null>;
}

interface PendingRequest {
    settled: boolean;
    callbackRef: number;
    itemsRef?: number;
    handle?: UiSelectHandle | void;
}

/**
 * `vim.ui` is a plain, mutable table with no metatable.
 *
 * dressing.nvim, telescope-ui-select and snacks all replace these fields
 * wholesale (`vim.ui.select = function(...) end`) and some restore the
 * original afterwards. Any `__index`/`__newindex` guard would break that
 * idiom, which is the main reason the namespace exists at all.
 */
export function injectUiApi(
    L: lua_State,
    callbacks: UiCallbacks,
    runner: CoroutineRunner | undefined,
): void {
    const pending = new Set<PendingRequest>();
    let destroyed = false;

    const release = (req: PendingRequest): void => {
        if (req.callbackRef !== undefined) {
            lauxlib.luaL_unref(L, lua.LUA_REGISTRYINDEX, req.callbackRef);
        }
        if (req.itemsRef !== undefined) {
            lauxlib.luaL_unref(L, lua.LUA_REGISTRYINDEX, req.itemsRef);
        }
        pending.delete(req);
    };

    const settle = (
        req: PendingRequest,
        pushArgs: (thread: lua_State) => number,
    ): void => {
        if (destroyed || req.settled) return;
        req.settled = true;
        const ref = req.callbackRef;
        if (runner) {
            void runner.invokeAsyncCapable(
                ref,
                pushArgs,
                CALLBACK_INSTRUCTION_LIMIT,
            );
        } else {
            lua.lua_rawgeti(L, lua.LUA_REGISTRYINDEX, ref);
            const argc = pushArgs(L);
            lua.lua_pcall(L, argc, 0, 0);
        }
        release(req);
    };

    registerStateCleanup(L, () => {
        destroyed = true;
        for (const req of [...pending]) {
            req.settled = true;
            req.handle?.close();
            release(req);
        }
    });

    lua.lua_getglobal(L, to_luastring('vim'));
    const vimIndex = lua.lua_gettop(L);

    lua.lua_newtable(L);
    const uiIndex = lua.lua_gettop(L);

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        if (!lua.lua_istable(state, 1)) {
            return lauxlib.luaL_error(
                state,
                to_luastring('vim.ui.select: items must be a table'),
            );
        }
        if (!lua.lua_isfunction(state, 3)) {
            return lauxlib.luaL_error(
                state,
                to_luastring('vim.ui.select: on_choice must be a function'),
            );
        }

        let prompt: string | undefined;
        let kind: string | undefined;
        let hasFormat = false;
        if (lua.lua_istable(state, 2)) {
            lua.lua_getfield(state, 2, to_luastring('prompt'));
            if (lua.lua_isstring(state, -1)) {
                prompt = readString(state, -1) ?? '';
            }
            lua.lua_pop(state, 1);
            lua.lua_getfield(state, 2, to_luastring('kind'));
            if (lua.lua_isstring(state, -1)) {
                kind = readString(state, -1) ?? undefined;
            }
            lua.lua_pop(state, 1);
            lua.lua_getfield(state, 2, to_luastring('format_item'));
            hasFormat = lua.lua_isfunction(state, -1);
            lua.lua_pop(state, 1);
        }

        // `format_item` is applied eagerly, once per item, exactly as Neovim's
        // own default implementation does for `inputlist()`. Calling it lazily
        // would mean re-entering Lua from JS during picker rendering.
        const count = lua.lua_rawlen(state, 1);
        const items: UiSelectItem[] = [];
        for (let i = 1; i <= count; i++) {
            lua.lua_rawgeti(state, 1, i);
            let label: string;
            if (hasFormat) {
                lua.lua_getfield(state, 2, to_luastring('format_item'));
                lua.lua_pushvalue(state, -2);
                if (lua.lua_pcall(state, 1, 1, 0) === lua.LUA_OK) {
                    label = readString(state, -1) ?? `item ${i}`;
                } else {
                    label = `item ${i}`;
                }
                lua.lua_pop(state, 1);
            } else {
                label = readString(state, -1) ?? `item ${i}`;
            }
            lua.lua_pop(state, 1);
            items.push({ index: i, label });
        }

        lua.lua_pushvalue(state, 1);
        const itemsRef = lauxlib.luaL_ref(state, lua.LUA_REGISTRYINDEX);
        lua.lua_pushvalue(state, 3);
        const callbackRef = lauxlib.luaL_ref(state, lua.LUA_REGISTRYINDEX);

        if (!callbacks.openSelect) {
            lauxlib.luaL_unref(state, lua.LUA_REGISTRYINDEX, itemsRef);
            lauxlib.luaL_unref(state, lua.LUA_REGISTRYINDEX, callbackRef);
            // Never settle with nil here. A caller cannot tell that apart from
            // "the user cancelled", which is the silent-misbehaviour failure
            // this project treats as worse than an outright error.
            return lauxlib.luaL_error(
                state,
                to_luastring(
                    'vim.ui.select: no selection UI is available in this context',
                ),
            );
        }

        const req: PendingRequest = { settled: false, callbackRef, itemsRef };
        pending.add(req);

        req.handle = callbacks.openSelect(items, { prompt, kind }, (index) => {
            settle(req, (thread) => {
                if (index === null) {
                    lua.lua_pushnil(thread);
                    lua.lua_pushnil(thread);
                    return 2;
                }
                // The ORIGINAL Lua value, not a rendered string: items are
                // commonly tables and `on_choice` must receive identity.
                lua.lua_rawgeti(thread, lua.LUA_REGISTRYINDEX, itemsRef);
                lua.lua_rawgeti(thread, -1, index);
                lua.lua_remove(thread, -2);
                lua.lua_pushinteger(thread, index);
                return 2;
            });
        });

        return 0;
    });
    lua.lua_setfield(L, uiIndex, to_luastring('select'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        if (!lua.lua_isfunction(state, 2)) {
            return lauxlib.luaL_error(
                state,
                to_luastring('vim.ui.input: on_confirm must be a function'),
            );
        }
        let prompt = '';
        let defaultText = '';
        if (lua.lua_istable(state, 1)) {
            lua.lua_getfield(state, 1, to_luastring('prompt'));
            if (lua.lua_isstring(state, -1)) {
                prompt = readString(state, -1) ?? '';
            }
            lua.lua_pop(state, 1);
            lua.lua_getfield(state, 1, to_luastring('default'));
            if (lua.lua_isstring(state, -1)) {
                defaultText = readString(state, -1) ?? '';
            }
            lua.lua_pop(state, 1);
        }

        lua.lua_pushvalue(state, 2);
        const callbackRef = lauxlib.luaL_ref(state, lua.LUA_REGISTRYINDEX);
        const req: PendingRequest = { settled: false, callbackRef };
        pending.add(req);

        const prompter = callbacks.showInputPrompt;
        if (!prompter) {
            settle(req, (thread) => {
                lua.lua_pushnil(thread);
                return 1;
            });
            return 0;
        }

        void prompter(prompt, defaultText).then((value) => {
            settle(req, (thread) => {
                // Neovim distinguishes these: '' means the user confirmed an
                // empty string, nil means the user cancelled.
                if (value === null) lua.lua_pushnil(thread);
                else lua.lua_pushstring(thread, to_luastring(value));
                return 1;
            });
        });
        return 0;
    });
    lua.lua_setfield(L, uiIndex, to_luastring('input'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const path = readString(state, 1);
        if (path === null) {
            return lauxlib.luaL_error(
                state,
                to_luastring('vim.ui.open: path must be a string'),
            );
        }
        if (lua.lua_istable(state, 2)) {
            lua.lua_getfield(state, 2, to_luastring('cmd'));
            const hasCmd = !lua.lua_isnil(state, -1);
            lua.lua_pop(state, 1);
            if (hasCmd) {
                return lauxlib.luaL_error(
                    state,
                    to_luastring(
                        'vim.ui.open: opts.cmd is not supported in Obsidian; arbitrary command execution is not permitted',
                    ),
                );
            }
        }

        const error = callbacks.openPath
            ? callbacks.openPath(path)
            : 'vim.ui.open: no handler available on this platform';
        if (error !== null) {
            // Neovim's own no-handler shape. On mobile this is not a fudge:
            // there genuinely is no handler, which is what it reports.
            lua.lua_pushnil(state);
            lua.lua_pushstring(state, to_luastring(error));
            return 2;
        }

        // `openWithDefaultApp` is detached and cannot fail late, so a
        // completed-successfully handle is accurate. Not a real SystemObj.
        lua.lua_newtable(state);
        lua.lua_pushjsfunction(state, (inner: lua_State) => {
            lua.lua_newtable(inner);
            lua.lua_pushinteger(inner, 0);
            lua.lua_setfield(inner, -2, to_luastring('code'));
            lua.lua_pushinteger(inner, 0);
            lua.lua_setfield(inner, -2, to_luastring('signal'));
            lua.lua_pushstring(inner, to_luastring(''));
            lua.lua_setfield(inner, -2, to_luastring('stdout'));
            lua.lua_pushstring(inner, to_luastring(''));
            lua.lua_setfield(inner, -2, to_luastring('stderr'));
            return 1;
        });
        lua.lua_setfield(state, -2, to_luastring('wait'));
        return 1;
    });
    lua.lua_setfield(L, uiIndex, to_luastring('open'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        // '' is exactly what Neovim returns when no progress is active, and
        // none ever is here. Semantically true, not a plausible-looking lie.
        lua.lua_pushstring(state, to_luastring(''));
        return 1;
    });
    lua.lua_setfield(L, uiIndex, to_luastring('progress_status'));

    lua.lua_pushvalue(L, uiIndex);
    lua.lua_setfield(L, vimIndex, to_luastring('ui'));
    lua.lua_pop(L, 2);
}
