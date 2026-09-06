import { lua, lauxlib, to_jsstring, to_luastring } from '../lib/fengari';
import type { lua_State } from '../lib/fengari';

// Lua keeps callbacks, multiple returns, and iterator state inside the sandbox.
// Contract: https://neovim.io/doc/user/lua.html#vim.iter()
// List transformations are eager; function/map-table pipelines are lazy.
const LUA_ITER = `
local Iter = {}
Iter.__index = Iter
Iter.__call = function(self) return self:next() end

local function values(item)
    if item then return table.unpack(item, 1, item.n) end
end

local function item(...)
    if select(1, ...) ~= nil then return table.pack(...) end
end

local function stored(v)
    if v.n == 1 then return v[1] end
    return v
end

local function list_keys(t)
    local keys = {}
    for k in pairs(t) do
        if type(k) ~= 'number' or k <= 0 or math.floor(k) ~= k then return end
        keys[#keys + 1] = k
    end
    -- Fengari's pairs() follows insertion order, unlike LuaJIT's array part.
    table.sort(keys)
    return keys
end

local function direction(self)
    return self._head < self._tail and 1 or -1
end

local function require_list(self, method)
    if not self._items then
        error(method .. '() requires an array-like table')
    end
end

local function predicate(f)
    if type(f) == 'function' then return f end
    return function(v) return v == f end
end

function Iter:next()
    if self._items then
        if self._head == self._tail then return end
        local v = self._items[self._head]
        self._head = self._head + direction(self)
        return values(v)
    end
    if self._peeked then
        local v = self._peeked
        self._peeked = nil
        return values(v)
    end
    return self._next()
end

function Iter:peek()
    if self._items then
        if self._head ~= self._tail then
            return stored(self._items[self._head])
        end
    else
        if not self._peeked then self._peeked = item(self._next()) end
        return values(self._peeked)
    end
end

function Iter:map(f)
    if self._items then
        local step, dest = direction(self), self._head
        for i = self._head, self._tail - step, step do
            local v = item(f(values(self._items[i])))
            if v then
                self._items[dest] = v
                dest = dest + step
            end
        end
        self._tail = dest
    else
        local upstream, peeked = self._next, self._peeked
        self._peeked = nil
        self._next = function()
            while true do
                local v = peeked or item(upstream())
                peeked = nil
                if not v then return end
                local mapped = item(f(values(v)))
                if mapped then return values(mapped) end
            end
        end
    end
    return self
end

function Iter:filter(f)
    return self:map(function(...)
        if f(...) then return ... end
    end)
end

function Iter:flatten(depth)
    require_list(self, 'flatten')
    depth = depth or 1
    local target = {}
    local function append(v, level)
        if level < depth and type(v) == 'table' then
            local keys = list_keys(v)
            if not keys then error('flatten() requires an array-like table') end
            for _, k in ipairs(keys) do
                append(v[k], level + 1)
            end
        elseif v ~= nil then
            target[#target + 1] = item(v)
        end
    end
    local step = direction(self)
    for i = self._head, self._tail - step, step do
        local v = self._items[i]
        if v.n == 1 then
            append(v[1], 0)
        else
            local tuple = { values(v) }
            append(tuple, 0)
        end
    end
    self._items, self._head, self._tail = target, 1, #target + 1
    return self
end

local function collect(v)
    if v.n == 1 then return v[1] end
    return { values(v) }
end

function Iter:totable()
    local result = {}
    -- Neovim's forward list fast path collects without draining the iterator.
    if self._items and self._head < self._tail then
        local target = {}
        for i = self._head, self._tail - 1 do
            local v = collect(self._items[i])
            result[#result + 1] = v
            target[#target + 1] = item(v)
        end
        self._items, self._head, self._tail = target, 1, #target + 1
    else
        while true do
            local v = item(self:next())
            if not v then break end
            result[#result + 1] = collect(v)
        end
    end
    return result
end

function Iter:join(delim)
    return table.concat(self:totable(), delim)
end

function Iter:rev()
    require_list(self, 'rev')
    local step = direction(self)
    self._head, self._tail = self._tail - step, self._head - step
    return self
end

function Iter:pop()
    require_list(self, 'pop')
    if self._head ~= self._tail then
        self._tail = self._tail - direction(self)
        return stored(self._items[self._tail])
    end
end

function Iter:rpeek()
    require_list(self, 'rpeek')
    if self._head ~= self._tail then
        return stored(self._items[self._tail - direction(self)])
    end
end

-- Compatibility extension: Neovim calls the tail-removal operation pop().
Iter.rpop = Iter.pop

function Iter:skip(n)
    if self._items then
        if type(n) == 'function' then
            while self._head ~= self._tail and n(values(self._items[self._head])) do
                self:next()
            end
        else
            self._head = self._head + direction(self) * math.min(n, self:size())
        end
    elseif type(n) == 'function' then
        local upstream, peeked = self._next, self._peeked
        local skipping = true
        self._peeked = nil
        self._next = function()
            while true do
                local v = peeked or item(upstream())
                peeked = nil
                if not v then return end
                if not skipping or not n(values(v)) then
                    skipping = false
                    return values(v)
                end
            end
        end
    else
        for _ = 1, n do self:next() end
    end
    return self
end

function Iter:rskip(n)
    require_list(self, 'rskip')
    self._tail = self._tail - direction(self) * math.min(n, self:size())
    return self
end

function Iter:slice(first, last)
    require_list(self, 'slice')
    local length = self:size()
    return self:skip(math.max(0, first - 1)):rskip(math.max(0, length - last))
end

function Iter:nth(n)
    if n > 0 then return self:skip(n - 1):next() end
    if n < 0 then return self:rskip(-n - 1):pop() end
end

function Iter:last()
    if self._items then
        if self._head >= self._tail then return end
        local v = self._items[self._tail - direction(self)]
        self._head = self._tail
        return stored(v)
    end
    local last = self:next()
    local current = self:next()
    while current do
        last = current
        current = self:next()
    end
    return last
end

function Iter:enumerate()
    if self._items then
        local step = direction(self)
        for i = self._head, self._tail - step, step do
            self._items[i] = item(i, collect(self._items[i]))
        end
        return self
    end
    local i = 0
    return self:map(function(...)
        i = i + 1
        return i, ...
    end)
end

function Iter:any(pred)
    while true do
        local v = item(self:next())
        if not v then return false end
        if pred(values(v)) then return true end
    end
end

function Iter:all(pred)
    while true do
        local v = item(self:next())
        if not v then return true end
        if not pred(values(v)) then return false end
    end
end

function Iter:fold(acc, f)
    if self._items then
        -- Like Neovim, the list fast path does not consume its input.
        local step = direction(self)
        for i = self._head, self._tail - step, step do
            acc = f(acc, values(self._items[i]))
        end
        return acc
    end
    while true do
        local v = item(self:next())
        if not v then return acc end
        acc = f(acc, values(v))
    end
end

function Iter:each(f)
    while true do
        local v = item(self:next())
        if not v then return end
        f(values(v))
    end
end

function Iter:take(n)
    if self._items then
        if type(n) == 'function' then
            local step = direction(self)
            for i = self._head, self._tail - step, step do
                if not n(values(self._items[i])) then
                    self._tail = i
                    break
                end
            end
        else
            self._tail = self._head + direction(self) * math.min(n, self:size())
        end
    else
        local upstream, peeked = self._next, self._peeked
        local count, stopped = 0, false
        self._peeked = nil
        self._next = function()
            if stopped then return end
            if type(n) ~= 'function' and count >= n then
                stopped = true
                return
            end
            local v = peeked or item(upstream())
            peeked = nil
            if not v or (type(n) == 'function' and not n(values(v))) then
                stopped = true
                return
            end
            count = count + 1
            return values(v)
        end
    end
    return self
end

function Iter:find(f)
    f = predicate(f)
    while true do
        local v = item(self:next())
        if not v then return end
        if f(values(v)) then return values(v) end
    end
end

function Iter:rfind(f)
    require_list(self, 'rfind')
    f = predicate(f)
    while self._head ~= self._tail do
        self._tail = self._tail - direction(self)
        local v = self._items[self._tail]
        if f(values(v)) then return values(v) end
    end
end

function Iter:count()
    local n = 0
    while item(self:next()) do n = n + 1 end
    return n
end

-- Unlike count(), size() is non-consuming and requires a finite list source.
function Iter:size()
    require_list(self, 'size')
    return math.abs(self._tail - self._head)
end

local function new(src, state, control)
    if type(src) == 'table' then
        local mt = getmetatable(src)
        if type(mt) == 'table' and type(mt.__call) == 'function' then
            return new(function() return src() end)
        end
        local keys = list_keys(src)
        if not keys then return new(pairs(src)) end
        local entries = {}
        for _, k in ipairs(keys) do
            entries[#entries + 1] = item(src[k])
        end
        return setmetatable({
            _items = entries, _head = 1, _tail = #entries + 1,
        }, Iter)
    end
    if type(src) ~= 'function' then error('src must be a table or function') end
    return setmetatable({ _next = function()
        local v = item(src(state, control))
        if v then
            control = v[1]
            return values(v)
        end
    end }, Iter)
end

vim.iter = setmetatable({}, { __call = function(_, ...) return new(...) end })
`;

export function injectIterApi(L: lua_State): void {
    const status = lauxlib.luaL_dostring(L, to_luastring(LUA_ITER));
    if (status !== lua.LUA_OK) {
        const raw = lua.lua_tolstring(L, -1);
        const message = raw ? to_jsstring(raw) : 'unknown error';
        lua.lua_pop(L, 1);
        throw new Error(
            `Vim Motions: failed to initialize vim.iter: ${message}`,
        );
    }
}
