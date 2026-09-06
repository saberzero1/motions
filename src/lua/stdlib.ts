import { lua, lauxlib, to_jsstring, to_luastring } from '../lib/fengari';
import type { lua_State } from '../lib/fengari';
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

function vim.is_callable(f)
    if type(f) == 'function' then return true end
    local mt = getmetatable(f)
    return mt ~= nil and type(rawget(mt, '__call')) == 'function'
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

-- Stubs for unimplemented vim.* utilities
vim.NIL = vim.NIL or {}
vim.EMPTY = vim.EMPTY or vim.NIL

vim.log = vim.log or {}
vim.log.levels = vim.log.levels or { DEBUG = 0, INFO = 1, WARN = 2, ERROR = 3, OFF = 4 }

vim.F = vim.F or {}
vim.F.if_nil = vim.F.if_nil or function(val, default)
    if val == nil then return default end
    return val
end
vim.F.ok_or_nil = vim.F.ok_or_nil or function(status, ...)
    if status then return ... end
    return nil
end

if not vim.notify_once then
    local _notify_once_seen = {}
    function vim.notify_once(msg, level, opts)
        if _notify_once_seen[msg] then
            return false
        end
        _notify_once_seen[msg] = true
        vim.notify(msg, level, opts)
        return true
    end
end

if not vim.schedule_wrap then
    function vim.schedule_wrap(fn)
        return function(...)
            local args = { ... }
            vim.schedule(function() fn(table.unpack(args)) end)
        end
    end
end

if not vim.print then
    function vim.print(...)
        local args = { ... }
        for i, v in ipairs(args) do
            args[i] = vim.inspect(v)
        end
        print(table.concat(args, '\t'))
        return ...
    end
end

if not vim.validate then
    local _validate_type_aliases = {
        b = 'boolean',
        c = 'callable',
        f = 'function',
        n = 'number',
        s = 'string',
        t = 'table',
    }

    local function _validate_is_type(val, t)
        return type(val) == t or (t == 'callable' and vim.is_callable(val))
    end

    local function _validate_is_valid(param_name, val, validator, message, allow_alias)
        if type(validator) == 'string' then
            local expected = allow_alias and _validate_type_aliases[validator] or validator
            if not expected or expected == '' then
                return string.format('invalid type name: %s', tostring(validator))
            end
            if not _validate_is_type(val, expected) then
                return string.format('%s: expected %s, got %s', param_name, message or expected, type(val))
            end
        elseif vim.is_callable(validator) then
            local valid, opt_msg = validator(val)
            if not valid then
                local err_msg = string.format('%s: expected %s, got %s',
                    param_name, message or '?', tostring(val))
                if opt_msg then
                    err_msg = err_msg .. '. Info: ' .. tostring(opt_msg)
                end
                return err_msg
            end
        elseif type(validator) == 'table' then
            for _, t in ipairs(validator) do
                local expected = allow_alias and _validate_type_aliases[t] or t
                if expected and _validate_is_type(val, expected) then
                    return nil
                end
            end
            local names = {}
            for _, t in ipairs(validator) do
                local expected = allow_alias and _validate_type_aliases[t] or t
                table.insert(names, expected or t)
            end
            return string.format('%s: expected %s, got %s',
                param_name, table.concat(names, '|'), type(val))
        else
            return string.format('invalid validator: %s', tostring(validator))
        end
    end

    local function _validate_spec(opt)
        local report
        for param_name, spec in pairs(opt) do
            local err_msg
            if type(spec) ~= 'table' then
                err_msg = string.format('opt[%s]: expected table, got %s', param_name, type(spec))
            else
                local value, validator = spec[1], spec[2]
                local msg = type(spec[3]) == 'string' and spec[3] or nil
                local optional = spec[3] == true
                if not (optional and value == nil) then
                    err_msg = _validate_is_valid(param_name, value, validator, msg, true)
                end
            end
            if err_msg then
                report = report or {}
                report[param_name] = err_msg
            end
        end
        if report then
            local sorted_keys = {}
            for k in pairs(report) do table.insert(sorted_keys, tostring(k)) end
            table.sort(sorted_keys)
            if sorted_keys[1] then
                return report[sorted_keys[1]] or report[tonumber(sorted_keys[1])]
            end
        end
    end

    function vim.validate(name, value, validator, optional, message)
        local err_msg
        if validator then
            local ok = (type(value) == validator) or (value == nil and optional == true)
            if not ok then
                local msg = type(optional) == 'string' and optional or message
                err_msg = _validate_is_valid(name, value, validator, msg, false)
            end
        elseif type(name) == 'table' then
            err_msg = _validate_spec(name)
        else
            error('invalid arguments')
        end
        if err_msg then
            error(err_msg, 2)
        end
    end
end

if not vim.in_fast_event then
    function vim.in_fast_event()
        return false
    end
end

if not vim.deep_equal then
    function vim.deep_equal(a, b)
        if a == b then return true end
        if type(a) ~= type(b) then return false end
        if type(a) ~= 'table' then return false end
        for k, v in pairs(a) do
            if not vim.deep_equal(v, b[k]) then return false end
        end
        for k in pairs(b) do
            if a[k] == nil then return false end
        end
        return true
    end
end

if not vim.islist then
    function vim.islist(t)
        if type(t) ~= 'table' then return false end
        local count = 0
        for k in pairs(t) do
            if type(k) ~= 'number' or k <= 0 or k % 1 ~= 0 then return false end
            count = count + 1
        end
        for i = 1, count do
            if t[i] == nil then return false end
        end
        return true
    end
end
vim.isarray = vim.isarray or vim.islist

if not vim.list_contains then
    function vim.list_contains(t, value)
        for _, v in ipairs(t) do
            if v == value then return true end
        end
        return false
    end
end

if not vim.list_slice then
    function vim.list_slice(t, start, finish)
        local s = start or 1
        local f = finish or #t
        local result = {}
        for i = s, f do
            table.insert(result, t[i])
        end
        return result
    end
end

if not vim.empty_dict then
    function vim.empty_dict()
        return {}
    end
end

if not vim.defaulttable then
    function vim.defaulttable(create)
        create = create or function() return {} end
        return setmetatable({}, {
            __index = function(t, k)
                local v = create(k)
                t[k] = v
                return v
            end,
        })
    end
end

if not vim.ringbuf then
    function vim.ringbuf(size)
        local buf = { _items = {}, _size = size, _pos = 0, _count = 0 }
        function buf:push(item)
            self._pos = (self._pos % self._size) + 1
            self._items[self._pos] = item
            if self._count < self._size then
                self._count = self._count + 1
            end
        end
        function buf:pop()
            if self._count == 0 then return nil end
            local item = self._items[self._pos]
            self._items[self._pos] = nil
            self._pos = ((self._pos - 2) % self._size) + 1
            self._count = self._count - 1
            return item
        end
        function buf:peek()
            if self._count == 0 then return nil end
            return self._items[self._pos]
        end
        function buf:clear()
            self._items = {}
            self._pos = 0
            self._count = 0
        end
        return buf
    end
end

if not vim.spairs then
    function vim.spairs(t)
        local keys = {}
        for k in pairs(t) do
            table.insert(keys, k)
        end
        table.sort(keys)
        local i = 0
        return function()
            i = i + 1
            local k = keys[i]
            if k ~= nil then return k, t[k] end
        end
    end
end

if not vim.gsplit then
    function vim.gsplit(s, sep, opts)
        local result = vim.split(s, sep, opts)
        local i = 0
        return function()
            i = i + 1
            return result[i]
        end
    end
end

if not vim.keycode then
    local _keycode_map = {
        ["cr"] = string.char(13),
        ["enter"] = string.char(13),
        ["return"] = string.char(13),
        ["nl"] = string.char(10),
        ["newline"] = string.char(10),
        ["tab"] = string.char(9),
        ["esc"] = string.char(27),
        ["escape"] = string.char(27),
        ["space"] = " ",
        ["bs"] = string.char(8),
        ["backspace"] = string.char(8),
        ["del"] = string.char(127),
        ["delete"] = string.char(127),
        ["lt"] = "<",
        ["bslash"] = "\\\\",
        ["bar"] = "|",
        ["nul"] = string.char(0),
    }
    function vim.keycode(str)
        return (str:gsub("(<[^>]+>)", function(seq)
            local name = seq:sub(2, -2):lower()
            return _keycode_map[name] or seq
        end))
    end
end

if not vim.call then
    function vim.call(fn, ...)
        return vim.fn[fn](...)
    end
end

if not vim.paste then
    function vim.paste(lines, phase)
        return true
    end
end

if not vim.deprecate then
    function vim.deprecate(name, alt, ver, plugin, backtrace)
    end
end

if not vim.diff then
    function vim.diff(a, b, opts)
        return ''
    end
end

if not vim.wait then
    function vim.wait(timeout, cond, interval)
        if cond and cond() then return true, -1 end
        return false, -1
    end
end

if not vim.tbl_flatten then
    function vim.tbl_flatten(t)
        local result = {}
        local function flatten(tbl)
            for _, v in ipairs(tbl) do
                if type(v) == 'table' then
                    flatten(v)
                else
                    table.insert(result, v)
                end
            end
        end
        flatten(t)
        return result
    end
end

vim.tbl_islist = vim.tbl_islist or vim.islist

if not vim.tbl_add_reverse_lookup then
    function vim.tbl_add_reverse_lookup(t)
        for k, v in pairs(t) do
            t[v] = k
        end
        return t
    end
end

if not vim.version or type(vim.version) ~= 'table' then
    vim.version = {}
end

if not vim.version.parse then
    local function build_version(major, minor, patch, prerelease)
        return {
            major = major,
            minor = minor,
            patch = patch,
            prerelease = prerelease,
        }
    end

    local function normalize_version(version)
        if version == nil then return nil end
        if type(version) == 'string' then
            return vim.version.parse(version)
        end
        if type(version) ~= 'table' then return nil end
        local major = tonumber(version.major)
        local minor = tonumber(version.minor)
        local patch = tonumber(version.patch)
        if not major or not minor or not patch then return nil end
        local prerelease = version.prerelease
        if prerelease ~= nil and type(prerelease) ~= 'string' then
            prerelease = tostring(prerelease)
        end
        return build_version(major, minor, patch, prerelease)
    end

    local function compare_identifier(a, b)
        local anum = tonumber(a)
        local bnum = tonumber(b)
        if anum and bnum then
            if anum == bnum then return 0 end
            return anum < bnum and -1 or 1
        end
        if anum and not bnum then return -1 end
        if not anum and bnum then return 1 end
        if a == b then return 0 end
        return a < b and -1 or 1
    end

    local function compare_prerelease(a, b)
        if a == b then return 0 end
        if a == nil then return 1 end
        if b == nil then return -1 end
        local a_parts = vim.split(a, '.', { plain = true })
        local b_parts = vim.split(b, '.', { plain = true })
        local max_len = math.max(#a_parts, #b_parts)
        for i = 1, max_len do
            local ai = a_parts[i]
            local bi = b_parts[i]
            if ai == nil then return -1 end
            if bi == nil then return 1 end
            local cmp = compare_identifier(ai, bi)
            if cmp ~= 0 then return cmp end
        end
        return 0
    end

    function vim.version.parse(str)
        if type(str) ~= 'string' then return nil end
        str = vim.trim(str)
        if str == '' then return nil end
        local without_build = str:match('^([^%+]+)') or str
        local core, prerelease = without_build:match('^([^%-]+)%-(.+)$')
        if not core then core = without_build end
        local major, minor, patch = core:match('^(%d+)%.(%d+)%.(%d+)$')
        if not major then
            major, minor = core:match('^(%d+)%.(%d+)$')
            if major then patch = '0' end
        end
        if not major or not minor or not patch then return nil end
        return build_version(tonumber(major), tonumber(minor), tonumber(patch), prerelease)
    end

    function vim.version.cmp(v1, v2)
        local left = normalize_version(v1)
        local right = normalize_version(v2)
        if not left or not right then return nil end
        if left.major ~= right.major then
            return left.major < right.major and -1 or 1
        end
        if left.minor ~= right.minor then
            return left.minor < right.minor and -1 or 1
        end
        if left.patch ~= right.patch then
            return left.patch < right.patch and -1 or 1
        end
        return compare_prerelease(left.prerelease, right.prerelease)
    end

    function vim.version.eq(v1, v2)
        return vim.version.cmp(v1, v2) == 0
    end

    function vim.version.ge(v1, v2)
        local cmp = vim.version.cmp(v1, v2)
        return cmp ~= nil and cmp >= 0
    end

    function vim.version.gt(v1, v2)
        local cmp = vim.version.cmp(v1, v2)
        return cmp ~= nil and cmp > 0
    end

    function vim.version.le(v1, v2)
        local cmp = vim.version.cmp(v1, v2)
        return cmp ~= nil and cmp <= 0
    end

    function vim.version.lt(v1, v2)
        local cmp = vim.version.cmp(v1, v2)
        return cmp ~= nil and cmp < 0
    end

    local function parse_range(spec)
        if type(spec) ~= 'string' then return nil end
        local trimmed = vim.trim(spec)
        if trimmed == '' then return nil end
        local parts = {}
        for token in trimmed:gmatch('%S+') do
            local op, version_str
            -- Try two-char operators first, then one-char
            op, version_str = token:match('^(>=)(.+)$')
            if not op then op, version_str = token:match('^(<=)(.+)$') end
            if not op then op, version_str = token:match('^(==)(.+)$') end
            if not op then op, version_str = token:match('^(>)(.+)$') end
            if not op then op, version_str = token:match('^(<)(.+)$') end
            if not op then op, version_str = token:match('^(=)(.+)$') end
            if not op then
                op = '='
                version_str = token
            end
            local version = normalize_version(version_str)
            if not version then return nil end
            table.insert(parts, { op = op, version = version })
        end
        return parts
    end

    function vim.version.range(spec)
        if type(spec) == 'table' and type(spec.has) == 'function' then
            return spec
        end
        local parts = parse_range(spec)
        local range = {}
        function range:has(version)
            local current = normalize_version(version)
            if not current then return false end
            for _, entry in ipairs(parts or {}) do
                local cmp = vim.version.cmp(current, entry.version)
                if cmp == nil then return false end
                if entry.op == '>=' and cmp < 0 then return false end
                if entry.op == '>' and cmp <= 0 then return false end
                if entry.op == '<=' and cmp > 0 then return false end
                if entry.op == '<' and cmp >= 0 then return false end
                if (entry.op == '=' or entry.op == '==') and cmp ~= 0 then return false end
            end
            return true
        end
        return range
    end

    function vim.version.last(versions)
        if type(versions) ~= 'table' then return nil end
        local latest = nil
        for _, version in ipairs(versions) do
            local parsed = normalize_version(version)
            if parsed then
                if not latest or vim.version.cmp(parsed, latest) == 1 then
                    latest = parsed
                end
            end
        end
        return latest
    end

    function vim.version.intersect(spec, version)
        local range = vim.version.range(spec)
        if not range or type(range.has) ~= 'function' then return false end
        return range:has(version)
    end

    setmetatable(vim.version, {
        __call = function()
            return build_version(0, 12, 5, nil)
        end,
    })
end

if not vim.str_byteindex then
    function vim.str_byteindex(s, ...)
        return 0
    end
end
if not vim.str_utfindex then
    function vim.str_utfindex(s, ...)
        return 0
    end
end
if not vim.str_utf_start then
    function vim.str_utf_start(s, index)
        return 0
    end
end
if not vim.str_utf_end then
    function vim.str_utf_end(s, index)
        return 0
    end
end
if not vim.str_utf_pos then
    function vim.str_utf_pos(s, encoding)
        return {}
    end
end
if not vim.iconv then
    function vim.iconv(str, from, to)
        return str
    end
end

if not vim.uri_decode then
    function vim.uri_decode(str)
        return str
    end
end
if not vim.uri_encode then
    function vim.uri_encode(str)
        return str
    end
end
if not vim.uri_from_bufnr then
    function vim.uri_from_bufnr(bufnr)
        return ''
    end
end
if not vim.uri_from_fname then
    function vim.uri_from_fname(path)
        return 'file://' .. path
    end
end
if not vim.uri_to_bufnr then
    function vim.uri_to_bufnr(uri)
        return 0
    end
end
if not vim.uri_to_fname then
    function vim.uri_to_fname(uri)
        return uri
    end
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
