import { lua, lauxlib, to_luastring, to_jsstring } from '../../lib/fengari';
import type { lua_State } from '../../lib/fengari';
import type { LanguageTree } from '../../treesitter/language-tree';
import { pushTSTree } from './tree';
import { pushTSNode } from './node';

const luaToUserdata = lua.lua_touserdata as (
    L: lua_State,
    index: number,
) => LanguageTree | null;
const luaPushLightUserdata: (L: lua_State, data: object) => void =
    lua.lua_pushlightuserdata;

function readLuaString(L: lua_State, index: number): string | null {
    if (!lua.lua_isstring(L, index)) return null;
    const raw = lua.lua_tolstring(L, index);
    return raw ? to_jsstring(raw) : null;
}

function extractLanguageTree(L: lua_State, index: number): LanguageTree {
    lua.lua_getfield(L, index, to_luastring('_ltree'));
    const ltree = luaToUserdata(L, -1);
    lua.lua_pop(L, 1);
    if (!ltree) {
        lauxlib.luaL_error(L, to_luastring('Expected LanguageTree'));
        throw new Error('unreachable');
    }
    return ltree;
}

function readRange4(
    L: lua_State,
    index: number,
): {
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
} {
    lua.lua_rawgeti(L, index, 1);
    const sr = lua.lua_tonumber(L, -1);
    lua.lua_pop(L, 1);
    lua.lua_rawgeti(L, index, 2);
    const sc = lua.lua_tonumber(L, -1);
    lua.lua_pop(L, 1);
    lua.lua_rawgeti(L, index, 3);
    const er = lua.lua_tonumber(L, -1);
    lua.lua_pop(L, 1);
    lua.lua_rawgeti(L, index, 4);
    const ec = lua.lua_tonumber(L, -1);
    lua.lua_pop(L, 1);
    return { startRow: sr, startCol: sc, endRow: er, endCol: ec };
}

const ltreeMethods: Record<string, (state: lua_State) => number> = {
    parse: (state) => {
        const ltree = extractLanguageTree(state, 1);
        const trees = ltree.parse();

        lua.lua_newtable(state);
        let idx = 1;
        for (const [, tree] of trees) {
            pushTSTree(state, tree, ltree.source());
            lua.lua_rawseti(state, -2, idx++);
        }
        return 1;
    },

    trees: (state) => {
        const ltree = extractLanguageTree(state, 1);
        const trees = ltree.trees();

        lua.lua_newtable(state);
        let idx = 1;
        for (const [, tree] of trees) {
            pushTSTree(state, tree, ltree.source());
            lua.lua_rawseti(state, -2, idx++);
        }
        return 1;
    },

    lang: (state) => {
        const ltree = extractLanguageTree(state, 1);
        lua.lua_pushstring(state, to_luastring(ltree.lang()));
        return 1;
    },

    source: (state) => {
        extractLanguageTree(state, 1);
        lua.lua_pushinteger(state, 0);
        return 1;
    },

    children: (state) => {
        const ltree = extractLanguageTree(state, 1);
        const children = ltree.children();

        lua.lua_newtable(state);
        for (const [lang, child] of children) {
            pushLanguageTree(state, child);
            lua.lua_setfield(state, -2, to_luastring(lang));
        }
        return 1;
    },

    parent: (state) => {
        const ltree = extractLanguageTree(state, 1);
        const p = ltree.parent();
        if (!p) {
            lua.lua_pushnil(state);
        } else {
            pushLanguageTree(state, p);
        }
        return 1;
    },

    is_valid: (state) => {
        const ltree = extractLanguageTree(state, 1);
        lua.lua_pushboolean(state, ltree.isValid());
        return 1;
    },

    included_regions: (state) => {
        const ltree = extractLanguageTree(state, 1);
        const regions = ltree.includedRegions();
        lua.lua_newtable(state);
        for (let i = 0; i < regions.length; i++) {
            const group = regions[i]!;
            lua.lua_newtable(state);
            for (let j = 0; j < group.length; j++) {
                const r = group[j]!;
                lua.lua_newtable(state);
                lua.lua_pushinteger(state, r.startPosition.row);
                lua.lua_rawseti(state, -2, 1);
                lua.lua_pushinteger(state, r.startPosition.column);
                lua.lua_rawseti(state, -2, 2);
                lua.lua_pushinteger(state, r.startIndex);
                lua.lua_rawseti(state, -2, 3);
                lua.lua_pushinteger(state, r.endPosition.row);
                lua.lua_rawseti(state, -2, 4);
                lua.lua_pushinteger(state, r.endPosition.column);
                lua.lua_rawseti(state, -2, 5);
                lua.lua_pushinteger(state, r.endIndex);
                lua.lua_rawseti(state, -2, 6);
                lua.lua_rawseti(state, -2, j + 1);
            }
            lua.lua_rawseti(state, -2, i + 1);
        }
        return 1;
    },

    contains: (state) => {
        const ltree = extractLanguageTree(state, 1);
        if (!lua.lua_istable(state, 2)) {
            lua.lua_pushboolean(state, false);
            return 1;
        }
        const range = readRange4(state, 2);
        lua.lua_pushboolean(state, ltree.contains(range));
        return 1;
    },

    tree_for_range: (state) => {
        const ltree = extractLanguageTree(state, 1);
        if (!lua.lua_istable(state, 2)) {
            lua.lua_pushnil(state);
            return 1;
        }
        const range = readRange4(state, 2);
        const tree = ltree.treeForRange(range);
        if (!tree) {
            lua.lua_pushnil(state);
        } else {
            pushTSTree(state, tree, ltree.source());
        }
        return 1;
    },

    node_for_range: (state) => {
        const ltree = extractLanguageTree(state, 1);
        if (!lua.lua_istable(state, 2)) {
            lua.lua_pushnil(state);
            return 1;
        }
        const range = readRange4(state, 2);
        const node = ltree.nodeForRange(range);
        if (!node) {
            lua.lua_pushnil(state);
        } else {
            pushTSNode(state, node, ltree.source());
        }
        return 1;
    },

    named_node_for_range: (state) => {
        const ltree = extractLanguageTree(state, 1);
        if (!lua.lua_istable(state, 2)) {
            lua.lua_pushnil(state);
            return 1;
        }
        const range = readRange4(state, 2);
        const node = ltree.namedNodeForRange(range);
        if (!node) {
            lua.lua_pushnil(state);
        } else {
            pushTSNode(state, node, ltree.source());
        }
        return 1;
    },

    language_for_range: (state) => {
        const ltree = extractLanguageTree(state, 1);
        if (!lua.lua_istable(state, 2)) {
            pushLanguageTree(state, ltree);
            return 1;
        }
        const range = readRange4(state, 2);
        const result = ltree.languageForRange(range);
        pushLanguageTree(state, result);
        return 1;
    },

    for_each_tree: (state) => {
        const ltree = extractLanguageTree(state, 1);
        if (!lua.lua_isfunction(state, 2)) {
            return lauxlib.luaL_error(
                state,
                to_luastring('for_each_tree: expected function'),
            );
        }
        lua.lua_pushvalue(state, 2);
        const fnRef = lauxlib.luaL_ref(state, lua.LUA_REGISTRYINDEX);

        ltree.forEachTree((tree, lt) => {
            lua.lua_rawgeti(state, lua.LUA_REGISTRYINDEX, fnRef);
            pushTSTree(state, tree, lt.source());
            pushLanguageTree(state, lt);
            lua.lua_pcall(state, 2, 0, 0);
        });

        lauxlib.luaL_unref(state, lua.LUA_REGISTRYINDEX, fnRef);
        return 0;
    },

    register_cbs: (state) => {
        const ltree = extractLanguageTree(state, 1);
        if (!lua.lua_istable(state, 2)) return 0;

        const recursive = lua.lua_toboolean(state, 3);
        const cbNames = [
            'on_changedtree',
            'on_bytes',
            'on_child_added',
            'on_child_removed',
        ] as const;

        for (const cbName of cbNames) {
            lua.lua_getfield(state, 2, to_luastring(cbName));
            if (lua.lua_isfunction(state, -1)) {
                const ref = lauxlib.luaL_ref(state, lua.LUA_REGISTRYINDEX);
                const cbKey = cbName.replace(/^on_/, '') as
                    'changedtree' | 'bytes' | 'child_added' | 'child_removed';
                ltree.registerCbs(
                    {
                        [cbKey]: (...args: unknown[]) => {
                            lua.lua_rawgeti(state, lua.LUA_REGISTRYINDEX, ref);
                            lua.lua_pcall(state, 0, 0, 0);
                        },
                    },
                    recursive,
                );
            } else {
                lua.lua_pop(state, 1);
            }
        }
        return 0;
    },

    invalidate: (state) => {
        const ltree = extractLanguageTree(state, 1);
        ltree.invalidate();
        return 0;
    },

    destroy: (state) => {
        const ltree = extractLanguageTree(state, 1);
        ltree.destroy();
        return 0;
    },

    root: (state) => {
        const ltree = extractLanguageTree(state, 1);
        const rootNode = ltree.rootNode();
        if (!rootNode) {
            lua.lua_pushnil(state);
        } else {
            pushTSNode(state, rootNode, ltree.source());
        }
        return 1;
    },
};

export function pushLanguageTree(L: lua_State, ltree: LanguageTree): void {
    lua.lua_newtable(L);
    const tblIndex = lua.lua_gettop(L);

    luaPushLightUserdata(L, ltree);
    lua.lua_setfield(L, tblIndex, to_luastring('_ltree'));

    lua.lua_newtable(L);
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const key = readLuaString(state, 2);
        if (!key) {
            lua.lua_pushnil(state);
            return 1;
        }
        const method = ltreeMethods[key];
        if (method) {
            lua.lua_pushjsfunction(state, method);
            return 1;
        }
        lua.lua_pushnil(state);
        return 1;
    });
    lua.lua_setfield(L, -2, to_luastring('__index'));
    lua.lua_setmetatable(L, tblIndex);
}
