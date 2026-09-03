import { lua, lauxlib, to_luastring, to_jsstring } from '../../lib/fengari';
import type { lua_State } from '../../lib/fengari';
import type { Node } from 'web-tree-sitter';

function luaToUserdata(L: lua_State, index: number): Node | null {
    return lua.lua_touserdata(L, index) as Node | null;
}

function luaPushLightUserdata(L: lua_State, data: Node): void {
    lua.lua_pushlightuserdata(L, data);
}

function readLuaString(L: lua_State, index: number): string | null {
    if (!lua.lua_isstring(L, index)) return null;
    const raw = lua.lua_tolstring(L, index);
    return raw ? to_jsstring(raw) : null;
}

function readLuaNumber(L: lua_State, index: number, label: string): number {
    if (!lua.lua_isnumber(L, index)) {
        lauxlib.luaL_error(L, to_luastring(`Expected ${label} to be a number`));
    }
    return lua.lua_tonumber(L, index);
}

function readLuaInteger(L: lua_State, index: number, label: string): number {
    return Math.trunc(readLuaNumber(L, index, label));
}

function extractSourceText(L: lua_State, index: number): string {
    lua.lua_getfield(L, index, to_luastring('_source'));
    const raw = lua.lua_tolstring(L, -1);
    const value = raw ? to_jsstring(raw) : null;
    lua.lua_pop(L, 1);
    if (value === null) {
        lauxlib.luaL_error(L, to_luastring('Missing node source text'));
        throw new Error('unreachable');
    }
    return value;
}

function readTreeTableIndex(L: lua_State, index: number): number | null {
    lua.lua_getfield(L, index, to_luastring('_tree'));
    const treeIndex = lua.lua_gettop(L);
    if (lua.lua_isnil(L, treeIndex)) {
        lua.lua_pop(L, 1);
        return null;
    }
    return treeIndex;
}

function applyTreeRef(L: lua_State, treeIndex: number | null): void {
    if (treeIndex === null) return;
    lua.lua_pushvalue(L, treeIndex);
    lua.lua_setfield(L, -2, to_luastring('_tree'));
}

function pushNodeOrNil(
    L: lua_State,
    node: Node | null,
    sourceText: string,
    treeIndex: number | null,
): void {
    if (!node) {
        if (treeIndex !== null) lua.lua_pop(L, 1);
        lua.lua_pushnil(L);
        return;
    }
    pushTSNode(L, node, sourceText);
    applyTreeRef(L, treeIndex);
    if (treeIndex !== null) lua.lua_remove(L, -2);
}

function pushNodeArray(
    L: lua_State,
    nodes: Node[],
    sourceText: string,
    treeIndex: number | null,
): void {
    lua.lua_newtable(L);
    for (let i = 0; i < nodes.length; i++) {
        const child = nodes[i];
        if (!child) continue;
        pushTSNode(L, child, sourceText);
        applyTreeRef(L, treeIndex);
        lua.lua_rawseti(L, -2, i + 1);
    }
}

export function extractNode(L: lua_State, index: number): Node {
    lua.lua_getfield(L, index, to_luastring('_node'));
    const node = luaToUserdata(L, -1);
    lua.lua_pop(L, 1);
    if (!node) {
        lauxlib.luaL_error(L, to_luastring('Expected node table'));
        throw new Error('unreachable');
    }
    return node;
}

function extractNodeArg(L: lua_State, index: number): Node {
    if (!lua.lua_istable(L, index)) {
        lauxlib.luaL_error(L, to_luastring('Expected node table argument'));
    }
    return extractNode(L, index);
}

function readStringArray(L: lua_State, index: number): string[] {
    if (!lua.lua_istable(L, index)) {
        lauxlib.luaL_error(L, to_luastring('Expected string array'));
    }
    const len = lauxlib.luaL_len(L, index);
    const result: string[] = [];
    for (let i = 1; i <= len; i++) {
        lua.lua_rawgeti(L, index, i);
        const value = readLuaString(L, -1);
        lua.lua_pop(L, 1);
        if (value === null) {
            lauxlib.luaL_error(L, to_luastring('Expected string in array'));
            throw new Error('unreachable');
        }
        result.push(value);
    }
    return result;
}

const nodeHandlers: Record<string, (L: lua_State) => number> = {
    parent: (state) => {
        const node = extractNode(state, 1);
        const sourceText = extractSourceText(state, 1);
        const treeIndex = readTreeTableIndex(state, 1);
        pushNodeOrNil(state, node.parent, sourceText, treeIndex);
        return 1;
    },
    child: (state) => {
        const node = extractNode(state, 1);
        const index = readLuaInteger(state, 2, 'child index');
        const sourceText = extractSourceText(state, 1);
        const treeIndex = readTreeTableIndex(state, 1);
        pushNodeOrNil(state, node.child(index), sourceText, treeIndex);
        return 1;
    },
    named_child: (state) => {
        const node = extractNode(state, 1);
        const index = readLuaInteger(state, 2, 'named child index');
        const sourceText = extractSourceText(state, 1);
        const treeIndex = readTreeTableIndex(state, 1);
        pushNodeOrNil(state, node.namedChild(index), sourceText, treeIndex);
        return 1;
    },
    next_sibling: (state) => {
        const node = extractNode(state, 1);
        const sourceText = extractSourceText(state, 1);
        const treeIndex = readTreeTableIndex(state, 1);
        pushNodeOrNil(state, node.nextSibling, sourceText, treeIndex);
        return 1;
    },
    prev_sibling: (state) => {
        const node = extractNode(state, 1);
        const sourceText = extractSourceText(state, 1);
        const treeIndex = readTreeTableIndex(state, 1);
        pushNodeOrNil(state, node.previousSibling, sourceText, treeIndex);
        return 1;
    },
    next_named_sibling: (state) => {
        const node = extractNode(state, 1);
        const sourceText = extractSourceText(state, 1);
        const treeIndex = readTreeTableIndex(state, 1);
        pushNodeOrNil(state, node.nextNamedSibling, sourceText, treeIndex);
        return 1;
    },
    prev_named_sibling: (state) => {
        const node = extractNode(state, 1);
        const sourceText = extractSourceText(state, 1);
        const treeIndex = readTreeTableIndex(state, 1);
        pushNodeOrNil(state, node.previousNamedSibling, sourceText, treeIndex);
        return 1;
    },
    child_with_descendant: (state) => {
        const node = extractNode(state, 1);
        const desc = extractNodeArg(state, 2);
        const sourceText = extractSourceText(state, 1);
        const treeIndex = readTreeTableIndex(state, 1);
        pushNodeOrNil(
            state,
            node.childWithDescendant(desc),
            sourceText,
            treeIndex,
        );
        return 1;
    },
    descendant_for_range: (state) => {
        const node = extractNode(state, 1);
        const startRow = readLuaInteger(state, 2, 'start row');
        const startCol = readLuaInteger(state, 3, 'start column');
        const endRow = readLuaInteger(state, 4, 'end row');
        const endCol = readLuaInteger(state, 5, 'end column');
        const sourceText = extractSourceText(state, 1);
        const treeIndex = readTreeTableIndex(state, 1);
        pushNodeOrNil(
            state,
            node.descendantForPosition(
                { row: startRow, column: startCol },
                { row: endRow, column: endCol },
            ),
            sourceText,
            treeIndex,
        );
        return 1;
    },
    named_descendant_for_range: (state) => {
        const node = extractNode(state, 1);
        const startRow = readLuaInteger(state, 2, 'start row');
        const startCol = readLuaInteger(state, 3, 'start column');
        const endRow = readLuaInteger(state, 4, 'end row');
        const endCol = readLuaInteger(state, 5, 'end column');
        const sourceText = extractSourceText(state, 1);
        const treeIndex = readTreeTableIndex(state, 1);
        pushNodeOrNil(
            state,
            node.namedDescendantForPosition(
                { row: startRow, column: startCol },
                { row: endRow, column: endCol },
            ),
            sourceText,
            treeIndex,
        );
        return 1;
    },
    named_children: (state) => {
        const node = extractNode(state, 1);
        const sourceText = extractSourceText(state, 1);
        const treeIndex = readTreeTableIndex(state, 1);
        pushNodeArray(state, node.namedChildren, sourceText, treeIndex);
        if (treeIndex !== null) lua.lua_remove(state, -2);
        return 1;
    },
    field: (state) => {
        const node = extractNode(state, 1);
        const name = readLuaString(state, 2);
        if (!name) {
            lauxlib.luaL_error(
                state,
                to_luastring('field expects a field name'),
            );
            throw new Error('unreachable');
        }
        const sourceText = extractSourceText(state, 1);
        const treeIndex = readTreeTableIndex(state, 1);
        pushNodeArray(
            state,
            node.childrenForFieldName(name),
            sourceText,
            treeIndex,
        );
        if (treeIndex !== null) lua.lua_remove(state, -2);
        return 1;
    },
    iter_children: (state) => {
        const node = extractNode(state, 1);
        const sourceText = extractSourceText(state, 1);
        let childIndex = 0;
        const childCount = node.childCount;
        let treeRef: number | null = null;
        lua.lua_getfield(state, 1, to_luastring('_tree'));
        if (!lua.lua_isnil(state, -1)) {
            treeRef = lauxlib.luaL_ref(state, lua.LUA_REGISTRYINDEX);
        } else {
            lua.lua_pop(state, 1);
        }
        let released = false;
        const iterator = (iterState: lua_State): number => {
            if (childIndex >= childCount) {
                if (treeRef !== null && !released) {
                    lauxlib.luaL_unref(
                        iterState,
                        lua.LUA_REGISTRYINDEX,
                        treeRef,
                    );
                    released = true;
                }
                lua.lua_pushnil(iterState);
                return 1;
            }
            const child = node.child(childIndex);
            const fieldName = node.fieldNameForChild(childIndex);
            childIndex += 1;
            if (!child) {
                lua.lua_pushnil(iterState);
                return 1;
            }
            pushTSNode(iterState, child, sourceText);
            if (treeRef !== null) {
                lua.lua_rawgeti(iterState, lua.LUA_REGISTRYINDEX, treeRef);
                lua.lua_setfield(iterState, -2, to_luastring('_tree'));
            }
            if (fieldName) {
                lua.lua_pushstring(iterState, to_luastring(fieldName));
            } else {
                lua.lua_pushnil(iterState);
            }
            return 2;
        };
        lua.lua_pushjsfunction(state, iterator);
        return 1;
    },
    child_count: (state) => {
        const node = extractNode(state, 1);
        lua.lua_pushinteger(state, node.childCount);
        return 1;
    },
    named_child_count: (state) => {
        const node = extractNode(state, 1);
        lua.lua_pushinteger(state, node.namedChildCount);
        return 1;
    },
    start: (state) => {
        const node = extractNode(state, 1);
        lua.lua_pushinteger(state, node.startPosition.row);
        lua.lua_pushinteger(state, node.startPosition.column);
        lua.lua_pushinteger(state, node.startIndex);
        return 3;
    },
    end_: (state) => {
        const node = extractNode(state, 1);
        lua.lua_pushinteger(state, node.endPosition.row);
        lua.lua_pushinteger(state, node.endPosition.column);
        lua.lua_pushinteger(state, node.endIndex);
        return 3;
    },
    range: (state) => {
        const node = extractNode(state, 1);
        const includeBytes = lua.lua_toboolean(state, 2);
        lua.lua_pushinteger(state, node.startPosition.row);
        lua.lua_pushinteger(state, node.startPosition.column);
        if (includeBytes) {
            lua.lua_pushinteger(state, node.startIndex);
            lua.lua_pushinteger(state, node.endPosition.row);
            lua.lua_pushinteger(state, node.endPosition.column);
            lua.lua_pushinteger(state, node.endIndex);
            return 6;
        }
        lua.lua_pushinteger(state, node.endPosition.row);
        lua.lua_pushinteger(state, node.endPosition.column);
        return 4;
    },
    byte_length: (state) => {
        const node = extractNode(state, 1);
        lua.lua_pushinteger(state, node.endIndex - node.startIndex);
        return 1;
    },
    type: (state) => {
        const node = extractNode(state, 1);
        lua.lua_pushstring(state, to_luastring(node.type));
        return 1;
    },
    symbol: (state) => {
        const node = extractNode(state, 1);
        lua.lua_pushinteger(state, node.typeId);
        return 1;
    },
    named: (state) => {
        const node = extractNode(state, 1);
        lua.lua_pushboolean(state, node.isNamed);
        return 1;
    },
    missing: (state) => {
        const node = extractNode(state, 1);
        lua.lua_pushboolean(state, node.isMissing);
        return 1;
    },
    extra: (state) => {
        const node = extractNode(state, 1);
        lua.lua_pushboolean(state, node.isExtra);
        return 1;
    },
    has_error: (state) => {
        const node = extractNode(state, 1);
        lua.lua_pushboolean(state, node.hasError);
        return 1;
    },
    has_changes: (state) => {
        const node = extractNode(state, 1);
        lua.lua_pushboolean(state, node.hasChanges);
        return 1;
    },
    sexpr: (state) => {
        const node = extractNode(state, 1);
        lua.lua_pushstring(state, to_luastring(node.toString()));
        return 1;
    },
    id: (state) => {
        const node = extractNode(state, 1);
        lua.lua_pushstring(state, to_luastring(String(node.id)));
        return 1;
    },
    equal: (state) => {
        const node = extractNode(state, 1);
        const other = extractNodeArg(state, 2);
        lua.lua_pushboolean(state, node.equals(other));
        return 1;
    },
    tree: (state) => {
        lua.lua_getfield(state, 1, to_luastring('_tree'));
        return 1;
    },
    __has_ancestor: (state) => {
        const node = extractNode(state, 1);
        const types = readStringArray(state, 2);
        let current = node.parent;
        while (current) {
            for (const type of types) {
                if (current.type === type) {
                    lua.lua_pushboolean(state, true);
                    return 1;
                }
            }
            current = current.parent;
        }
        lua.lua_pushboolean(state, false);
        return 1;
    },
};

export function pushTSNode(L: lua_State, node: Node, sourceText: string): void {
    lua.lua_newtable(L);
    const nodeIndex = lua.lua_gettop(L);
    luaPushLightUserdata(L, node);
    lua.lua_setfield(L, nodeIndex, to_luastring('_node'));
    lua.lua_pushstring(L, to_luastring(sourceText));
    lua.lua_setfield(L, nodeIndex, to_luastring('_source'));

    lua.lua_newtable(L);
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const key = readLuaString(state, 2);
        if (!key) {
            lua.lua_pushnil(state);
            return 1;
        }
        const handler = nodeHandlers[key];
        if (handler) {
            lua.lua_pushjsfunction(state, handler);
            return 1;
        }
        if (key === 'type') {
            const nodeValue = extractNode(state, 1);
            lua.lua_pushstring(state, to_luastring(nodeValue.type));
            return 1;
        }
        if (key === 'named') {
            const nodeValue = extractNode(state, 1);
            lua.lua_pushboolean(state, nodeValue.isNamed);
            return 1;
        }
        lua.lua_pushnil(state);
        return 1;
    });
    lua.lua_setfield(L, -2, to_luastring('__index'));
    lua.lua_setmetatable(L, nodeIndex);
}
