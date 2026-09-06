import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    lua,
    lauxlib,
    to_jsstring,
    to_luastring,
} from '../../../src/lib/fengari';
import { createSandboxedState, destroyState } from '../../../src/lua/engine';
import { injectVimApi } from '../../../src/lua/api';
import { injectNamespaceStubs } from '../../../src/lua/namespace-stubs';
import { injectIterApi } from '../../../src/lua/iter';

describe('vim.iter', () => {
    let L: ReturnType<typeof createSandboxedState>;
    let stackBeforeInjection: number;
    beforeEach(() => {
        L = createSandboxedState();
        injectVimApi(L, {
            onSettingOverride: () => {},
            handleExCommand: () => {},
            getVaultName: () => 'vault',
            onKeymap: () => {},
            onKeymapDel: () => {},
        });
        injectNamespaceStubs(L);
        stackBeforeInjection = lua.lua_gettop(L);
        injectIterApi(L);
    });
    afterEach(() => {
        destroyState(L);
    });

    function run(code: string): void {
        const status = lauxlib.luaL_dostring(L, to_luastring(code));
        const raw = status === lua.LUA_OK ? null : lua.lua_tolstring(L, -1);
        expect(status, raw ? to_jsstring(raw) : code).toBe(lua.LUA_OK);
    }

    it('overrides the namespace stub without leaking stack entries', () => {
        expect(lua.lua_gettop(L)).toBe(stackBeforeInjection);
        run('assert(vim.iter({1}):next() == 1)');
    });

    it('chains filter, map, and totable without mutating the source', () => {
        run(`
            local src = {1, 2, 3, 4}
            local it = vim.iter(src)
            assert(it:filter(function(v) return v % 2 == 0 end) == it)
            local t = it:map(function(v) return v * 3 end):totable()
            assert(#t == 2 and t[1] == 6 and t[2] == 12)
            assert(#src == 4 and src[1] == 1 and src[4] == 4)
        `);
    });

    it('iterates map tables as key/value pairs and folds them into maps', () => {
        run(`
            local pairs = vim.iter({a=1, b=2}):totable()
            local found = {}
            for _, pair in ipairs(pairs) do found[pair[1]] = pair[2] end
            assert(#pairs == 2 and found.a == 1 and found.b == 2)
            local t = vim.iter({a=1, b=2, c=3}):filter(function(k, v)
                return v % 2 == 1
            end):fold({}, function(acc, k, v) acc[k] = v; return acc end)
            assert(t.a == 1 and t.b == nil and t.c == 3)
        `);
    });

    it('accepts pairs and ipairs iterator triples', () => {
        run(`
            local it = vim.iter(ipairs({'a', 'b'}))
            local i, v = it:next()
            assert(i == 1 and v == 'a')
            i, v = it:next()
            assert(i == 2 and v == 'b' and it:next() == nil)
            local t = vim.iter(pairs({x=7})):totable()
            assert(t[1][1] == 'x' and t[1][2] == 7)
        `);
    });

    it('keeps function pipelines lazy and preserves nil-containing multiple returns', () => {
        run(`
            local calls = 0
            local it = vim.iter(function()
                calls = calls + 1
                if calls <= 3 then return calls, nil, false end
                return nil, 'end'
            end):filter(function(v) return v > 1 end):map(function(v, hole, flag)
                return v * 2, hole, flag
            end)
            assert(calls == 0)
            local a, b, c = it:peek()
            assert(a == 4 and b == nil and c == false and calls == 2)
            assert(it:next() == 4 and calls == 2)
            local t = it:totable()
            assert(#t == 1 and t[1][1] == 6 and t[1][3] == false)
        `);
    });

    it('filters nil mappings but retains false values', () => {
        run(`
            for _, src in ipairs({{1,2,3}, string.gmatch('123', '.')}) do
                local t = vim.iter(src):map(function(v)
                    if tonumber(v) ~= 2 then return false end
                end):totable()
                assert(#t == 2 and t[1] == false and t[2] == false)
            end
        `);
    });

    it('flattens to the specified depth and rejects dictionary flattening', () => {
        run(`
            local t = vim.iter({1, {2}, {{3}}}):flatten():totable()
            assert(t[1] == 1 and t[2] == 2 and t[3][1] == 3)
            assert(vim.iter({1, {2}, {{3}}}):flatten(math.huge):join(',') == '1,2,3')
            assert(not pcall(function() vim.iter({{x=1}}):flatten() end))
        `);
    });

    it('supports reversal, front and back peeking, pop, and rpop', () => {
        run(`
            local it = vim.iter({1,2,3,4}):rev()
            assert(it:peek() == 4 and it:peek() == 4)
            assert(it:rpeek() == 1 and it:pop() == 1)
            assert(it:rpop() == 2 and it:next() == 4 and it:next() == 3)
            assert(it:peek() == nil and it:rpeek() == nil and it:pop() == nil)
        `);
    });

    it('supports skip, rskip, slice, and signed nth', () => {
        run(`
            assert(vim.iter({1,2,3,4,5}):skip(1):rskip(1):join(',') == '2,3,4')
            assert(vim.iter({1,2,3,4,5}):slice(2,4):join(',') == '2,3,4')
            local it = vim.iter({3,6,9,12})
            assert(it:nth(2) == 6 and it:nth(2) == 12 and it:nth(1) == nil)
            it = vim.iter({3,6,9,12})
            assert(it:nth(-2) == 9 and it:nth(-2) == 3)
            assert(vim.iter({1}):skip(20):size() == 0)
            assert(vim.iter({1}):rskip(20):size() == 0)
        `);
    });

    it('enumerates list and function sources and supports generic for', () => {
        run(`
            local t = vim.iter({'a','b'}):enumerate():totable()
            assert(t[1][1] == 1 and t[1][2] == 'a' and t[2][1] == 2)
            local result = ''
            for i, v in vim.iter(string.gmatch('ab', '.')):enumerate() do
                result = result .. i .. v
            end
            assert(result == '1a2b')
        `);
    });

    it('short circuits any and all and handles empty inputs', () => {
        run(`
            local it = vim.iter({1,2,3})
            assert(it:any(function(v) return v == 2 end))
            assert(it:next() == 3)
            it = vim.iter({1,2,3})
            assert(not it:all(function(v) return v < 2 end))
            assert(it:next() == 3)
            assert(not vim.iter({}):any(function() return true end))
            assert(vim.iter({}):all(function() return false end))
        `);
    });

    it('folds lists without consuming and drains each with no return values', () => {
        run(`
            local it = vim.iter({1,2,3})
            assert(it:fold(0, function(acc,v) return acc+v end) == 6)
            assert(it:next() == 1)
            local sum = 0
            assert(select('#', it:each(function(v) sum = sum+v end)) == 0)
            assert(sum == 5 and it:next() == nil)
        `);
    });

    it('takes counts or predicates from lists and lazy functions', () => {
        run(`
            assert(vim.iter({1,2,3}):take(2):join(',') == '1,2')
            assert(vim.iter({1,2,3}):take(function(v) return v < 3 end):join(',') == '1,2')
            local it = vim.iter(string.gmatch('1231', '.')):take(function(v) return v ~= '3' end)
            assert(it:join(',') == '1,2' and it:next() == nil)
            assert(vim.iter(string.gmatch('abc', '.')):take(1):join('') == 'a')
            assert(vim.iter({1}):take(0):next() == nil)
        `);
    });

    it('skips predicate prefixes and respects peek before transformations', () => {
        run(`
            for _, src in ipairs({{'1','2','3','1'}, string.gmatch('1231', '.')}) do
                local it = vim.iter(src)
                assert(it:peek() == '1')
                it:skip(function(v) return v < '3' end)
                assert(it:join(',') == '3,1')
            end
            local it = vim.iter(string.gmatch('abc', '.'))
            assert(it:peek() == 'a')
            assert(it:map(string.upper):take(2):join('') == 'AB')
        `);
    });

    it('finds values and predicates from both ends and drains last', () => {
        run(`
            local it = vim.iter({1,2,3,4,5})
            assert(it:find(2) == 2)
            assert(it:rfind(function(v) return v % 2 == 0 end) == 4)
            assert(it:last() == 3 and it:next() == nil)
            assert(vim.iter({1}):find(2) == nil)
            assert(vim.iter({1}):rfind(2) == nil)
            assert(vim.iter(string.gmatch('abc', '.')):last() == 'c')
            assert(vim.iter({false}):last() == false)
        `);
    });

    it('counts by draining but sizes lists without consuming', () => {
        run(`
            local it = vim.iter({1,2,3}):skip(1)
            assert(it:size() == 2 and it:size() == 2)
            assert(it:count() == 2 and it:size() == 0 and it:next() == nil)
            assert(vim.iter(string.gmatch('abc', '.')):count() == 3)
        `);
    });

    it('matches list tuple access and function last return behavior', () => {
        run(`
            local it = vim.iter({1,2}):map(function(v) return v, v*2 end)
            local first = it:peek()
            assert(first[1] == 1 and first[2] == 2)
            local tail = it:rpeek()
            assert(tail[1] == 2 and tail[2] == 4 and it:pop() == tail)
            local a, b = it:next()
            assert(a == 1 and b == 2)
            local t = vim.iter({1,2}):map(function(v) return v, v*2 end):last()
            assert(t[1] == 2 and t[2] == 4)
            local n = 0
            it = vim.iter(function()
                n = n + 1
                if n == 1 then return 'first', 'extra' end
                if n == 2 then return false end
                if n == 3 then return 'third' end
            end)
            assert(it:last() == 'first' and it:next() == 'third')
        `);
    });

    it('handles sparse list sources, callable tables, and invalid sources', () => {
        run(`
            assert(vim.iter({[1]='a', [3]='c'}):count() == 2)
            local n = 0
            local callable = setmetatable({}, {__call = function()
                n = n+1
                if n <= 2 then return n end
            end})
            assert(vim.iter(callable):join(',') == '1,2')
            assert(not pcall(vim.iter, 42))
        `);
    });

    it.each([
        'rev()',
        'pop()',
        'rpop()',
        'rpeek()',
        'rskip(1)',
        'slice(1,2)',
        'flatten()',
        'rfind(1)',
        'size()',
    ])('rejects %s on function iterators', (method) => {
        run(
            `assert(not pcall(function() vim.iter(ipairs({1,2})):${method} end))`,
        );
    });
});
