import { lua, to_jsstring, to_luastring } from '../lib/fengari';
import type { lua_State } from '../lib/fengari';

const luaRawset = (
    lua as unknown as { lua_rawset: (L: lua_State, index: number) => void }
).lua_rawset;

const UNIMPLEMENTED_NAMESPACES = [
    'fs',
    'snippet',
    'hl',
    'health',
    'loader',
    'lpeg',
    're',
    'glob',
    'text',
    'base64',
    'spell',
    'secure',
    'pos',
    'range',
    'iter',
];

function readLuaString(L: lua_State, index: number): string | null {
    if (!lua.lua_isstring(L, index)) return null;
    const raw = lua.lua_tolstring(L, index);
    return raw ? to_jsstring(raw) : null;
}

export function injectNamespaceStubs(L: lua_State): void {
    lua.lua_getglobal(L, to_luastring('vim'));
    const vimIndex = lua.lua_gettop(L);
    const warned = new Set<string>();

    for (const ns of UNIMPLEMENTED_NAMESPACES) {
        lua.lua_newtable(L);
        const nsIndex = lua.lua_gettop(L);

        lua.lua_newtable(L);
        lua.lua_pushjsfunction(L, (state: lua_State) => {
            const key = readLuaString(state, 2) ?? '?';
            const warnKey = `vim.${ns}.${key}`;
            if (!warned.has(warnKey)) {
                warned.add(warnKey);
                console.warn(
                    `Vim Motions: vim.${ns}.${key} is not implemented in Obsidian`,
                );
            }
            lua.lua_pushjsfunction(state, () => 0);
            return 1;
        });
        lua.lua_setfield(L, -2, to_luastring('__index'));
        lua.lua_pushjsfunction(L, (state: lua_State) => {
            lua.lua_pushvalue(state, 2);
            lua.lua_pushvalue(state, 3);
            luaRawset(state, 1);
            return 0;
        });
        lua.lua_setfield(L, -2, to_luastring('__newindex'));
        lua.lua_setmetatable(L, nsIndex);

        lua.lua_setfield(L, vimIndex, to_luastring(ns));
    }

    lua.lua_pop(L, 1);
}
