import { lua, lauxlib, to_jsstring, to_luastring } from '../lib/fengari';
import type { lua_State } from '../lib/fengari';
import {
    CALLBACK_INSTRUCTION_LIMIT,
    registerStateCleanup,
    withInstructionGuard,
} from './engine';
import { replaceTermcodes } from './termcodes';

export function injectOnKey(
    L: lua_State,
    vimIndex: number,
    allocateNamespace: (requested: number) => number,
    observe?: (handler: (key: string) => void) => () => void,
): void {
    const refs = new Map<number, number>();
    let dispatching = false;
    let destroyed = false;
    const remove = (ns: number): void => {
        const ref = refs.get(ns);
        if (ref === undefined) return;
        refs.delete(ns);
        lauxlib.luaL_unref(L, lua.LUA_REGISTRYINDEX, ref);
    };
    const unsubscribe = observe?.((key) => {
        if (destroyed || dispatching || refs.size === 0) return;
        // This host observation point is pre-mapping. Both key and typed are
        // the physical input; mapped expansions and callback return values do
        // not alter the host pipeline (unlike Neovim's post-mapping hook).
        const notation =
            Array.from(key).length > 1 && !key.startsWith('<')
                ? `<${key}>`
                : key;
        const bytes = replaceTermcodes(to_luastring(notation), true, true);
        dispatching = true;
        const top = lua.lua_gettop(L);
        const hook = lua.lua_gethook(L);
        const mask = lua.lua_gethookmask(L);
        const count = lua.lua_gethookcount(L);
        try {
            for (const [ns, ref] of [...refs]) {
                if (refs.get(ns) !== ref) continue;
                try {
                    lua.lua_rawgeti(L, lua.LUA_REGISTRYINDEX, ref);
                    lua.lua_pushstring(L, bytes);
                    lua.lua_pushstring(L, bytes);
                    const status = withInstructionGuard(
                        L,
                        CALLBACK_INSTRUCTION_LIMIT,
                        () => lua.lua_pcall(L, 2, 0, 0),
                    );
                    if (status !== lua.LUA_OK) {
                        const message = lua.lua_tolstring(L, -1);
                        throw new Error(
                            message
                                ? to_jsstring(message)
                                : 'unknown Lua error',
                        );
                    }
                } catch (error) {
                    remove(ns);
                    console.error(
                        `Vim Motions: vim.on_key callback ${ns} failed`,
                        error,
                    );
                } finally {
                    lua.lua_settop(L, top);
                }
            }
        } finally {
            lua.lua_sethook(L, hook, mask, count);
            dispatching = false;
        }
    });
    registerStateCleanup(L, () => {
        destroyed = true;
        unsubscribe?.();
        for (const ns of refs.keys()) remove(ns);
    });

    lua.lua_pushjsfunction(L, (state) => {
        if (!lua.lua_isnoneornil(state, 1) && !lua.lua_isfunction(state, 1)) {
            return lauxlib.luaL_error(
                state,
                to_luastring('vim.on_key: expected function or nil'),
            );
        }
        if (lua.lua_isnoneornil(state, 1) && lua.lua_isnoneornil(state, 2)) {
            lua.lua_pushinteger(state, refs.size);
            return 1;
        }
        const requested = lauxlib.luaL_optinteger(state, 2, 0);
        if (requested < 0) {
            return lauxlib.luaL_error(
                state,
                to_luastring('vim.on_key: expected non-negative namespace'),
            );
        }
        const ns = allocateNamespace(requested);
        remove(ns);
        if (lua.lua_isfunction(state, 1)) {
            lua.lua_pushvalue(state, 1);
            refs.set(ns, lauxlib.luaL_ref(state, lua.LUA_REGISTRYINDEX));
        }
        lua.lua_pushinteger(state, ns);
        return 1;
    });
    lua.lua_setfield(L, vimIndex, to_luastring('on_key'));
}
