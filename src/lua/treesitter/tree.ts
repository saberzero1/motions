import { lua, lauxlib, to_luastring, to_jsstring } from 'fengari';
import type { lua_State } from 'fengari';
import type { Tree } from 'web-tree-sitter';
import { pushTSNode } from './node';
import { pushRange4, pushRange6 } from './range';

function luaToUserdata(L: lua_State, index: number): Tree | null {
    return lua.lua_touserdata(L, index) as Tree | null;
}

function luaPushLightUserdata(L: lua_State, data: Tree): void {
    lua.lua_pushlightuserdata(L, data);
}

function readLuaString(L: lua_State, index: number): string | null {
    if (!lua.lua_isstring(L, index)) return null;
    const raw = lua.lua_tolstring(L, index);
    return raw ? to_jsstring(raw) : null;
}

function extractSourceText(L: lua_State, index: number): string {
    lua.lua_getfield(L, index, to_luastring('_source'));
    const raw = lua.lua_tolstring(L, -1);
    const value = raw ? to_jsstring(raw) : null;
    lua.lua_pop(L, 1);
    if (value === null) {
        lauxlib.luaL_error(L, to_luastring('Missing tree source text'));
        throw new Error('unreachable');
    }
    return value;
}

export function extractTree(L: lua_State, index: number): Tree {
    lua.lua_getfield(L, index, to_luastring('_tree'));
    const tree = luaToUserdata(L, -1);
    lua.lua_pop(L, 1);
    if (!tree) {
        lauxlib.luaL_error(L, to_luastring('Expected tree table'));
        throw new Error('unreachable');
    }
    return tree;
}

const treeHandlers: Record<string, (L: lua_State) => number> = {
    root: (state) => {
        const tree = extractTree(state, 1);
        const sourceText = extractSourceText(state, 1);
        pushTSNode(state, tree.rootNode, sourceText);
        lua.lua_pushvalue(state, 1);
        lua.lua_setfield(state, -2, to_luastring('_tree'));
        return 1;
    },
    copy: (state) => {
        const tree = extractTree(state, 1);
        const sourceText = extractSourceText(state, 1);
        pushTSTree(state, tree.copy(), sourceText);
        return 1;
    },
    included_ranges: (state) => {
        const tree = extractTree(state, 1);
        const includeBytes = lua.lua_toboolean(state, 2);
        const ranges = tree.getIncludedRanges();
        lua.lua_newtable(state);
        for (let i = 0; i < ranges.length; i++) {
            const range = ranges[i];
            if (!range) continue;
            if (includeBytes) {
                pushRange6(
                    state,
                    range.startPosition.row,
                    range.startPosition.column,
                    range.startIndex,
                    range.endPosition.row,
                    range.endPosition.column,
                    range.endIndex,
                );
            } else {
                pushRange4(
                    state,
                    range.startPosition.row,
                    range.startPosition.column,
                    range.endPosition.row,
                    range.endPosition.column,
                );
            }
            lua.lua_rawseti(state, -2, i + 1);
        }
        return 1;
    },
};

export function pushTSTree(L: lua_State, tree: Tree, sourceText: string): void {
    lua.lua_newtable(L);
    const treeIndex = lua.lua_gettop(L);
    luaPushLightUserdata(L, tree);
    lua.lua_setfield(L, treeIndex, to_luastring('_tree'));
    lua.lua_pushstring(L, to_luastring(sourceText));
    lua.lua_setfield(L, treeIndex, to_luastring('_source'));

    lua.lua_newtable(L);
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const key = readLuaString(state, 2);
        if (!key) {
            lua.lua_pushnil(state);
            return 1;
        }
        const handler = treeHandlers[key];
        if (handler) {
            lua.lua_pushjsfunction(state, handler);
            return 1;
        }
        lua.lua_pushnil(state);
        return 1;
    });
    lua.lua_setfield(L, -2, to_luastring('__index'));
    lua.lua_setmetatable(L, treeIndex);
}
