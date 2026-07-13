import { lua, lauxlib, to_jsstring, to_luastring } from 'fengari';
import type { lua_State } from 'fengari';
import { evalLua } from './engine';

const LUA_SNIPPET_DSL = `vim.snippet = vim.snippet or {}

function vim.snippet.t(text)
    return { type = "text", text = tostring(text) }
end

function vim.snippet.i(index, placeholder)
    return { type = "insert", index = index, placeholder = placeholder or "" }
end

function vim.snippet.c(index, choices)
    return { type = "choice", index = index, choices = choices }
end

function vim.snippet.rep(index)
    return { type = "rep", index = index }
end

function vim.snippet.f(fn, deps)
    return {
        type = "function",
        fn = fn,
        depends_on = deps or {},
    }
end

function vim.snippet.d(index, fn, deps)
    return {
        type = "dynamic",
        index = index,
        fn = fn,
        depends_on = deps or {},
    }
end

function vim.snippet.sn(index, nodes, opts)
    opts = opts or {}
    local flat = {}
    if #nodes > 0 and nodes[1] and type(nodes[1]) == "table" and nodes[1][1] then
        for _, node in ipairs(nodes[1]) do
            table.insert(flat, node)
        end
    else
        flat = nodes
    end
    return {
        _is_snippet_node = true,
        index = index,
        nodes = flat,
        stored = opts.stored,
    }
end

function vim.snippet.r(index, type_name)
    return {
        type = "restore",
        index = index,
        type_name = type_name or "",
    }
end

function vim.snippet.fmt(format_str, nodes, opts)
    local result = {}
    local node_idx = 1
    local delim_open = (opts and opts.delimiters and opts.delimiters:sub(1,1)) or "{"
    local delim_close = (opts and opts.delimiters and opts.delimiters:sub(2,2)) or "}"
    local pattern = delim_open .. delim_close
    local pos = 1
    while pos <= #format_str do
        local start, stop = format_str:find(pattern, pos, true)
        if start then
            if start > pos then
                table.insert(result, vim.snippet.t(format_str:sub(pos, start - 1)))
            end
            table.insert(result, nodes[node_idx])
            node_idx = node_idx + 1
            pos = stop + 1
        else
            table.insert(result, vim.snippet.t(format_str:sub(pos)))
            break
        end
    end
    return result
end

function vim.snippet.s(name, nodes, opts)
    opts = opts or {}
    local flat = {}
    if #nodes > 0 and nodes[1] and type(nodes[1]) == "table" and nodes[1][1] then
        for _, node in ipairs(nodes[1]) do
            table.insert(flat, node)
        end
    else
        flat = nodes
    end
    return {
        _is_snippet = true,
        name = name,
        nodes = flat,
        context = opts.context,
        description = opts.description,
    }
end
`;

export interface LuaSnippetNode {
    type: 'text' | 'insert' | 'choice' | 'rep' | 'function' | 'dynamic' | 'restore';
    text?: string;
    index?: number;
    placeholder?: string;
    choices?: LuaSnippetNode[];
    luaFnRef?: number;
    dependsOn?: number[];
    snNodes?: LuaSnippetNode[];
}

export interface LuaSnippetDef {
    trigger: string;
    name: string;
    nodes: LuaSnippetNode[];
    context?: string;
    description?: string;
    hasDynamic?: boolean;
}

function readLuaString(L: lua_State, index: number): string | null {
    if (!lua.lua_isstring(L, index)) return null;
    const val = lua.lua_tolstring(L, index);
    return val ? to_jsstring(val) : null;
}

function readLuaNumber(L: lua_State, index: number): number | null {
    if (!lua.lua_isnumber(L, index)) return null;
    return lua.lua_tonumber(L, index);
}

function readNumberArray(L: lua_State, index: number): number[] {
    if (!lua.lua_istable(L, index)) return [];
    const tableIndex = lua.lua_absindex(L, index);
    const len = lauxlib.luaL_len(L, tableIndex);
    const result: number[] = [];
    for (let i = 1; i <= len; i++) {
        lua.lua_rawgeti(L, tableIndex, i);
        if (lua.lua_isnumber(L, -1)) {
            result.push(lua.lua_tonumber(L, -1));
        }
        lua.lua_pop(L, 1);
    }
    return result;
}

function readSnippetNodeValue(
    L: lua_State,
    index: number,
): LuaSnippetNode | null {
    if (lua.lua_isstring(L, index)) {
        return { type: 'text', text: readLuaString(L, index) ?? '' };
    }
    if (lua.lua_istable(L, index)) {
        return readSnippetNode(L, index);
    }
    return null;
}

export function readSnippetNodes(
    L: lua_State,
    index: number,
): LuaSnippetNode[] {
    if (!lua.lua_istable(L, index)) return [];
    const tableIndex = lua.lua_absindex(L, index);
    const len = lauxlib.luaL_len(L, tableIndex);
    const nodes: LuaSnippetNode[] = [];
    for (let i = 1; i <= len; i++) {
        lua.lua_rawgeti(L, tableIndex, i);
        const node = readSnippetNodeValue(L, -1);
        if (node) nodes.push(node);
        lua.lua_pop(L, 1);
    }
    return nodes;
}

function readSnippetNode(L: lua_State, index: number): LuaSnippetNode {
    const tableIndex = lua.lua_absindex(L, index);
    lua.lua_getfield(L, tableIndex, to_luastring('type'));
    const typeValue = readLuaString(L, -1);
    lua.lua_pop(L, 1);

    switch (typeValue) {
        case 'text': {
            lua.lua_getfield(L, tableIndex, to_luastring('text'));
            const text = readLuaString(L, -1) ?? '';
            lua.lua_pop(L, 1);
            return { type: 'text', text };
        }
        case 'insert': {
            lua.lua_getfield(L, tableIndex, to_luastring('index'));
            const indexValue = readLuaNumber(L, -1) ?? 0;
            lua.lua_pop(L, 1);
            lua.lua_getfield(L, tableIndex, to_luastring('placeholder'));
            const placeholder = readLuaString(L, -1) ?? undefined;
            lua.lua_pop(L, 1);
            return { type: 'insert', index: indexValue, placeholder };
        }
        case 'choice': {
            lua.lua_getfield(L, tableIndex, to_luastring('index'));
            const indexValue = readLuaNumber(L, -1) ?? 0;
            lua.lua_pop(L, 1);
            lua.lua_getfield(L, tableIndex, to_luastring('choices'));
            const choices = readSnippetNodes(L, -1);
            lua.lua_pop(L, 1);
            return { type: 'choice', index: indexValue, choices };
        }
        case 'rep': {
            lua.lua_getfield(L, tableIndex, to_luastring('index'));
            const indexValue = readLuaNumber(L, -1) ?? 0;
            lua.lua_pop(L, 1);
            return { type: 'rep', index: indexValue };
        }
        case 'function': {
            lua.lua_getfield(L, tableIndex, to_luastring('fn'));
            if (!lua.lua_isfunction(L, -1)) {
                lua.lua_pop(L, 1);
                return { type: 'text', text: '[f() error: expected function]' };
            }
            const fnRef = lauxlib.luaL_ref(L, lua.LUA_REGISTRYINDEX);
            lua.lua_getfield(L, tableIndex, to_luastring('depends_on'));
            const deps = readNumberArray(L, -1);
            lua.lua_pop(L, 1);
            return { type: 'function', luaFnRef: fnRef, dependsOn: deps };
        }
        case 'dynamic': {
            lua.lua_getfield(L, tableIndex, to_luastring('index'));
            const indexValue = readLuaNumber(L, -1) ?? 0;
            lua.lua_pop(L, 1);
            lua.lua_getfield(L, tableIndex, to_luastring('fn'));
            if (!lua.lua_isfunction(L, -1)) {
                lua.lua_pop(L, 1);
                return { type: 'text', text: '[d() error: expected function]' };
            }
            const fnRef = lauxlib.luaL_ref(L, lua.LUA_REGISTRYINDEX);
            lua.lua_getfield(L, tableIndex, to_luastring('depends_on'));
            const deps = readNumberArray(L, -1);
            lua.lua_pop(L, 1);
            return {
                type: 'dynamic',
                index: indexValue,
                luaFnRef: fnRef,
                dependsOn: deps,
            };
        }
        case 'restore': {
            lua.lua_getfield(L, tableIndex, to_luastring('index'));
            const indexValue = readLuaNumber(L, -1) ?? 0;
            lua.lua_pop(L, 1);
            return { type: 'restore', index: indexValue };
        }
        default: {
            return { type: 'text', text: '' };
        }
    }
}

function hasDynamicNodes(nodes: LuaSnippetNode[]): boolean {
    for (const node of nodes) {
        if (node.type === 'function' || node.type === 'dynamic') return true;
        if (node.choices && hasDynamicNodes(node.choices)) return true;
        if (node.snNodes && hasDynamicNodes(node.snNodes)) return true;
    }
    return false;
}

function readSnippetDef(
    L: lua_State,
    index: number,
): Omit<LuaSnippetDef, 'trigger'> {
    const tableIndex = lua.lua_absindex(L, index);
    lua.lua_getfield(L, tableIndex, to_luastring('name'));
    const name = readLuaString(L, -1) ?? '';
    lua.lua_pop(L, 1);
    lua.lua_getfield(L, tableIndex, to_luastring('nodes'));
    const nodes = readSnippetNodes(L, -1);
    lua.lua_pop(L, 1);
    lua.lua_getfield(L, tableIndex, to_luastring('context'));
    const context = readLuaString(L, -1) ?? undefined;
    lua.lua_pop(L, 1);
    lua.lua_getfield(L, tableIndex, to_luastring('description'));
    const description = readLuaString(L, -1) ?? undefined;
    lua.lua_pop(L, 1);
    const hasDynamic = hasDynamicNodes(nodes);
    return { name, nodes, context, description, hasDynamic };
}

export function injectSnippetApi(L: lua_State): LuaSnippetDef[] {
    const luaSnippets: LuaSnippetDef[] = [];
    evalLua(L, LUA_SNIPPET_DSL);

    lua.lua_getglobal(L, to_luastring('vim'));
    const vimIndex = lua.lua_gettop(L);
    lua.lua_getfield(L, vimIndex, to_luastring('snippet'));
    let snippetIndex = lua.lua_gettop(L);
    if (!lua.lua_istable(L, snippetIndex)) {
        lua.lua_newtable(L);
        lua.lua_setfield(L, vimIndex, to_luastring('snippet'));
        lua.lua_pop(L, 1);
        lua.lua_getfield(L, vimIndex, to_luastring('snippet'));
        snippetIndex = lua.lua_gettop(L);
    }

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const trigger = readLuaString(state, 1);
        if (!trigger) {
            return lauxlib.luaL_error(
                state,
                to_luastring('vim.snippet.add expects a trigger string'),
            );
        }
        if (!lua.lua_istable(state, 2)) {
            return lauxlib.luaL_error(
                state,
                to_luastring('vim.snippet.add expects a snippet table'),
            );
        }
        const def = readSnippetDef(state, 2);
        luaSnippets.push({ trigger, ...def });
        return 0;
    });
    lua.lua_setfield(L, snippetIndex, to_luastring('add'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        if (!lua.lua_istable(state, 1)) {
            return lauxlib.luaL_error(
                state,
                to_luastring('vim.snippet.add_all expects a table'),
            );
        }
        const tableIndex = lua.lua_absindex(state, 1);
        lua.lua_pushnil(state);
        while (lua.lua_next(state, tableIndex) !== 0) {
            const trigger = readLuaString(state, -2);
            if (trigger && lua.lua_istable(state, -1)) {
                const def = readSnippetDef(state, -1);
                luaSnippets.push({ trigger, ...def });
            }
            lua.lua_pop(state, 1);
        }
        return 0;
    });
    lua.lua_setfield(L, snippetIndex, to_luastring('add_all'));

    lua.lua_pop(L, 2);
    return luaSnippets;
}
