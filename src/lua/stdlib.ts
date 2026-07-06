import { lua, lauxlib, to_jsstring, to_luastring } from 'fengari';
import type { lua_State } from 'fengari';
import { evalLua } from './engine';

type LuaTableEntry = {
    key: string | number;
    keyType: 'number' | 'string' | 'other';
    value: unknown;
};

const luaNext = (
    lua as unknown as { lua_next: (L: lua_State, index: number) => number }
).lua_next;

function readLuaAny(L: lua_State, index: number): unknown {
    if (lua.lua_isnil(L, index)) return null;
    if (lua.lua_isboolean(L, index)) return lua.lua_toboolean(L, index);
    if (lua.lua_isnumber(L, index)) return lua.lua_tonumber(L, index);
    if (lua.lua_isstring(L, index)) {
        const value = lua.lua_tolstring(L, index);
        return value ? to_jsstring(value) : '';
    }
    if (lua.lua_istable(L, index)) {
        return readLuaTable(L, index);
    }
    return null;
}

function readLuaTable(L: lua_State, index: number): unknown {
    lua.lua_pushvalue(L, index);
    const tableIndex = lua.lua_gettop(L);
    const entries: LuaTableEntry[] = [];
    let arrayCandidate = true;
    let maxIndex = 0;
    let numericCount = 0;

    lua.lua_pushnil(L);
    while (luaNext(L, tableIndex) !== 0) {
        let entry: LuaTableEntry;
        if (lua.lua_isnumber(L, -2)) {
            const key = lua.lua_tonumber(L, -2);
            const isInteger = Number.isInteger(key) && key >= 1;
            if (isInteger) {
                maxIndex = Math.max(maxIndex, key);
                numericCount += 1;
            } else {
                arrayCandidate = false;
            }
            entry = {
                key,
                keyType: 'number',
                value: readLuaAny(L, -1),
            };
            if (!isInteger) arrayCandidate = false;
        } else if (lua.lua_isstring(L, -2)) {
            const keyStr = to_jsstring(
                lua.lua_tolstring(L, -2) ?? to_luastring(''),
            );
            entry = {
                key: keyStr,
                keyType: 'string',
                value: readLuaAny(L, -1),
            };
            arrayCandidate = false;
        } else {
            const keyValue = readLuaAny(L, -2);
            entry = {
                key: typeof keyValue === 'string' ? keyValue : String(keyValue),
                keyType: 'other',
                value: readLuaAny(L, -1),
            };
            arrayCandidate = false;
        }
        entries.push(entry);
        lua.lua_pop(L, 1);
    }
    lua.lua_pop(L, 1);

    if (arrayCandidate && numericCount === maxIndex) {
        const result: unknown[] = [];
        for (const entry of entries) {
            if (entry.keyType === 'number' && Number.isInteger(entry.key)) {
                result[Number(entry.key) - 1] = entry.value;
            }
        }
        return result;
    }

    const result: Record<string, unknown> = {};
    for (const entry of entries) {
        const key =
            entry.keyType === 'string'
                ? entry.key
                : typeof entry.key === 'number'
                  ? String(entry.key)
                  : String(entry.key);
        result[key] = entry.value;
    }
    return result;
}

function pushLuaAny(L: lua_State, value: unknown): void {
    if (value === undefined || value === null) {
        lua.lua_pushnil(L);
        return;
    }
    if (typeof value === 'boolean') {
        lua.lua_pushboolean(L, value);
        return;
    }
    if (typeof value === 'number') {
        lua.lua_pushnumber(L, value);
        return;
    }
    if (typeof value === 'string') {
        lua.lua_pushstring(L, to_luastring(value));
        return;
    }
    if (Array.isArray(value)) {
        lua.lua_newtable(L);
        for (let i = 0; i < value.length; i++) {
            pushLuaAny(L, value[i]);
            lua.lua_rawseti(L, -2, i + 1);
        }
        return;
    }
    if (typeof value === 'object') {
        lua.lua_newtable(L);
        for (const [key, entry] of Object.entries(value)) {
            pushLuaAny(L, entry);
            lua.lua_setfield(L, -2, to_luastring(key));
        }
        return;
    }
    lua.lua_pushnil(L);
}

const luaSource = `
local vim = vim

local function is_list(t)
    if type(t) ~= 'table' then return false end
    local count = 0
    for k, _ in pairs(t) do
        if type(k) ~= 'number' or k <= 0 or k % 1 ~= 0 then
            return false
        end
        count = count + 1
    end
    for i = 1, count do
        if t[i] == nil then
            return false
        end
    end
    return true
end

local function deep_copy(obj, seen)
    if type(obj) ~= 'table' then return obj end
    if seen[obj] then return seen[obj] end
    local res = {}
    seen[obj] = res
    for k, v in pairs(obj) do
        res[deep_copy(k, seen)] = deep_copy(v, seen)
    end
    return res
end

function vim.deepcopy(obj)
    return deep_copy(obj, {})
end

local function merge_table(dst, src, behavior, deep)
    for k, v in pairs(src or {}) do
        local existing = dst[k]
        if deep
            and type(v) == 'table'
            and type(existing) == 'table'
            and (not is_list(v))
            and (not is_list(existing))
        then
            merge_table(existing, v, behavior, true)
        else
            if behavior == 'error' and existing ~= nil and existing ~= v then
                error('vim.tbl_extend: key conflict', 2)
            elseif behavior == 'keep' then
                if existing == nil then dst[k] = v end
            else
                dst[k] = v
            end
        end
    end
end

function vim.tbl_extend(behavior, ...)
    local result = {}
    local args = { ... }
    for _, tbl in ipairs(args) do
        merge_table(result, tbl or {}, behavior, false)
    end
    return result
end

function vim.tbl_deep_extend(behavior, ...)
    local result = {}
    local args = { ... }
    for _, tbl in ipairs(args) do
        merge_table(result, tbl or {}, behavior, true)
    end
    return result
end

function vim.tbl_contains(t, value, opts)
    local predicate = opts and opts.predicate
    if predicate then
        for _, v in pairs(t or {}) do
            if value(v) then return true end
        end
        return false
    end
    for _, v in pairs(t or {}) do
        if v == value then return true end
    end
    return false
end

function vim.tbl_keys(t)
    local result = {}
    for k, _ in pairs(t or {}) do
        table.insert(result, k)
    end
    return result
end

function vim.tbl_values(t)
    local result = {}
    for _, v in pairs(t or {}) do
        table.insert(result, v)
    end
    return result
end

function vim.tbl_map(fn, t)
    local result = {}
    for k, v in pairs(t or {}) do
        result[k] = fn(v, k)
    end
    return result
end

function vim.tbl_filter(fn, t)
    if is_list(t) then
        local result = {}
        for _, v in ipairs(t) do
            if fn(v) then table.insert(result, v) end
        end
        return result
    end
    local result = {}
    for k, v in pairs(t or {}) do
        if fn(v) then result[k] = v end
    end
    return result
end

function vim.tbl_count(t)
    local count = 0
    for _, _ in pairs(t or {}) do
        count = count + 1
    end
    return count
end

function vim.tbl_isempty(t)
    return next(t) == nil
end

function vim.tbl_get(t, ...)
    local current = t
    for i = 1, select('#', ...) do
        if type(current) ~= 'table' then return nil end
        local key = select(i, ...)
        current = current[key]
        if current == nil then return nil end
    end
    return current
end

function vim.list_extend(dst, src, start, finish)
    local first = start or 1
    local last = finish or #src
    for i = first, last do
        table.insert(dst, src[i])
    end
    return dst
end

function vim.split(s, sep, opts)
    opts = opts or {}
    local plain = opts.plain or false
    local trimempty = opts.trimempty or false
    local result = {}
    if sep == '' then
        for i = 1, #s do
            table.insert(result, s:sub(i, i))
        end
        return result
    end
    local start = 1
    while true do
        local i, j = string.find(s, sep, start, plain)
        if not i then
            local part = s:sub(start)
            if not (trimempty and part == '') then
                table.insert(result, part)
            end
            break
        end
        local part = s:sub(start, i - 1)
        if not (trimempty and part == '') then
            table.insert(result, part)
        end
        start = j + 1
    end
    return result
end

function vim.trim(s)
    return (s:gsub('^%s*(.-)%s*$', '%1'))
end

function vim.startswith(s, prefix)
    return s:sub(1, #prefix) == prefix
end

function vim.endswith(s, suffix)
    if #suffix == 0 then return true end
    return s:sub(-#suffix) == suffix
end

function vim.pesc(s)
    return (s:gsub('([%^%$%(%)%%%.%[%]%*%+%-%?])', '%%%1'))
end

function vim.stricmp(a, b)
    local la = string.lower(a)
    local lb = string.lower(b)
    if la == lb then return 0 end
    if la < lb then return -1 end
    return 1
end

local inspect = (function()
    local inspect = {}
    inspect._VERSION = 'inspect.lua 3.1.0'

    local function smart_quote(str)
        return string.format('%q', str)
    end

    local function is_identifier(str)
        return type(str) == 'string' and str:match('^[_%a][_%w]*$')
    end

    local function is_keyword(str)
        return ({
            ['and'] = true, ['break'] = true, ['do'] = true, ['else'] = true,
            ['elseif'] = true, ['end'] = true, ['false'] = true, ['for'] = true,
            ['function'] = true, ['goto'] = true, ['if'] = true, ['in'] = true,
            ['local'] = true, ['nil'] = true, ['not'] = true, ['or'] = true,
            ['repeat'] = true, ['return'] = true, ['then'] = true, ['true'] = true,
            ['until'] = true, ['while'] = true,
        })[str] == true
    end

    local function safe_tostring(value)
        local ok, res = pcall(tostring, value)
        if ok then return res end
        return '<error>'
    end

    local function sort_keys(a, b)
        if type(a) == type(b) then
            if type(a) == 'number' then return a < b end
            if type(a) == 'string' then return a < b end
            return safe_tostring(a) < safe_tostring(b)
        end
        return type(a) < type(b)
    end

    local function get_sequence_length(t)
        local len = 0
        for i = 1, math.huge do
            if t[i] == nil then break end
            len = i
        end
        return len
    end

    local function is_sequence(t)
        if type(t) ~= 'table' then return false end
        local len = get_sequence_length(t)
        for k, _ in pairs(t) do
            if type(k) ~= 'number' or k < 1 or k > len or k % 1 ~= 0 then
                return false
            end
        end
        return true, len
    end

    local function get_sorted_keys(t)
        local keys = {}
        for k in pairs(t) do table.insert(keys, k) end
        table.sort(keys, sort_keys)
        return keys
    end

    local function process_value(value, opts, depth, visited)
        local t = type(value)
        if t == 'string' then return smart_quote(value) end
        if t ~= 'table' then return safe_tostring(value) end
        if visited[value] then return '<cycle>' end
        if depth >= opts.depth then return '{...}' end

        visited[value] = true
        local isSeq, len = is_sequence(value)
        local parts = {}
        if isSeq then
            for i = 1, len do
                table.insert(parts, process_value(value[i], opts, depth + 1, visited))
            end
        else
            local keys = get_sorted_keys(value)
            for _, k in ipairs(keys) do
                local key_repr
                if is_identifier(k) and not is_keyword(k) then
                    key_repr = k
                else
                    key_repr = '[' .. process_value(k, opts, depth + 1, visited) .. ']'
                end
                local value_repr = process_value(value[k], opts, depth + 1, visited)
                table.insert(parts, key_repr .. ' = ' .. value_repr)
            end
        end
        visited[value] = nil

        if #parts == 0 then return '{}' end
        if opts.compact then
            return '{' .. table.concat(parts, ', ') .. '}'
        end
        local indent = string.rep(opts.indent, depth + 1)
        local closing = string.rep(opts.indent, depth)
        return '{' .. opts.newline
            .. indent .. table.concat(parts, ',' .. opts.newline .. indent)
            .. opts.newline .. closing .. '}'
    end

    return function(root, opts)
        opts = opts or {}
        opts.depth = opts.depth or math.huge
        opts.indent = opts.indent or '  '
        opts.newline = opts.newline or '\\n'
        opts.compact = opts.compact or false
        local processed = opts.process
        if processed then
            local wrapped = processed
            processed = function(value)
                return wrapped(value)
            end
        end
        local visited = {}
        if processed then
            local original = process_value
            process_value = function(value, inner_opts, depth, visited_inner)
                return original(processed(value), inner_opts, depth, visited_inner)
            end
        end
        return process_value(root, opts, 0, visited)
    end
end)()

function vim.inspect(value, opts)
    return inspect(value, opts)
end
`;

export function injectStdlib(L: lua_State): void {
    const result = evalLua(L, luaSource);
    if (!result.ok) {
        console.error(
            `Vim Motions: failed to load Lua stdlib: ${result.error}`,
        );
    }

    lua.lua_getglobal(L, to_luastring('vim'));
    lua.lua_getfield(L, -1, to_luastring('json'));
    if (lua.lua_isnil(L, -1)) {
        lua.lua_pop(L, 1);
        lua.lua_newtable(L);
        lua.lua_pushvalue(L, -1);
        lua.lua_setfield(L, -3, to_luastring('json'));
    }
    const jsonIndex = lua.lua_gettop(L);

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const value = readLuaAny(state, 1);
        const json = JSON.stringify(value ?? null);
        lua.lua_pushstring(state, to_luastring(json));
        return 1;
    });
    lua.lua_setfield(L, jsonIndex, to_luastring('encode'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const raw = lua.lua_tolstring(state, 1);
        const text = raw ? to_jsstring(raw) : '';
        try {
            const parsed: unknown = JSON.parse(text);
            pushLuaAny(state, parsed);
            return 1;
        } catch (error) {
            return lauxlib.luaL_error(
                state,
                to_luastring(`vim.json.decode: ${String(error)}`),
            );
        }
    });
    lua.lua_setfield(L, jsonIndex, to_luastring('decode'));

    lua.lua_pop(L, 2);
}
