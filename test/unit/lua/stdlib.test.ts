import { describe, it, expect } from 'vitest';
import {
    lua,
    lauxlib,
    to_jsstring,
    to_luastring,
} from '../../../src/lib/fengari';
import { createSandboxedState, destroyState } from '../../../src/lua/engine';
import { injectVimApi } from '../../../src/lua/api';
import { AutocmdManager } from '../../../src/lua/autocmd';
import { injectStdlib } from '../../../src/lua/stdlib';

type LuaState = ReturnType<typeof createSandboxedState>;

function runLua(L: LuaState, code: string): number {
    lua.lua_settop(L, 0);
    return lauxlib.luaL_dostring(L, to_luastring(code));
}

function assertLuaOk(L: LuaState, status: number): void {
    if (status === lua.LUA_OK) return;
    const value = lua.lua_tolstring(L, -1);
    const error = value ? to_jsstring(value) : 'Lua error';
    lua.lua_pop(L, 1);
    throw new Error(error);
}

function runLuaString(L: LuaState, code: string): string {
    const status = runLua(L, code);
    assertLuaOk(L, status);
    const value = lua.lua_tolstring(L, -1);
    const text = value ? to_jsstring(value) : '';
    lua.lua_pop(L, 1);
    return text;
}

function runLuaNumber(L: LuaState, code: string): number {
    const status = runLua(L, code);
    assertLuaOk(L, status);
    const value = lua.lua_tonumber(L, -1);
    lua.lua_pop(L, 1);
    return value;
}

function runLuaNumbers(L: LuaState, code: string): number[] {
    const status = runLua(L, code);
    assertLuaOk(L, status);
    const count = lua.lua_gettop(L);
    const values: number[] = [];
    for (let i = 1; i <= count; i++) {
        values.push(lua.lua_tonumber(L, i));
    }
    lua.lua_settop(L, 0);
    return values;
}

function runLuaBoolean(L: LuaState, code: string): boolean {
    const status = runLua(L, code);
    assertLuaOk(L, status);
    const value = lua.lua_toboolean(L, -1);
    lua.lua_pop(L, 1);
    return value;
}

function runLuaIsNil(L: LuaState, code: string): boolean {
    const status = runLua(L, code);
    assertLuaOk(L, status);
    const isNil = lua.lua_isnil(L, -1);
    lua.lua_pop(L, 1);
    return isNil;
}

function runLuaError(L: LuaState, code: string): string {
    const status = runLua(L, code);
    expect(status).not.toBe(lua.LUA_OK);
    const value = lua.lua_tolstring(L, -1);
    const error = value ? to_jsstring(value) : '';
    lua.lua_pop(L, 1);
    return error;
}

function setupState(): LuaState {
    const L = createSandboxedState();
    const autocmdManager = new AutocmdManager(L);
    injectVimApi(L, {
        onSettingOverride: () => {},
        handleExCommand: () => {},
        getVaultName: () => 'vault',
        onKeymap: () => {},
        onKeymapDel: () => {},
        autocmdManager,
    });
    injectStdlib(L);
    return L;
}

describe('vim stdlib', () => {
    it('should implement tbl_deep_extend force', () => {
        const L = setupState();
        const [a, c, d] = runLuaNumbers(
            L,
            "local t=vim.tbl_deep_extend('force',{a=1,b={c=2}},{a=3,b={d=4}}); return t.a, t.b.c, t.b.d",
        );
        expect(a).toBe(3);
        expect(c).toBe(2);
        expect(d).toBe(4);
        destroyState(L);
    });

    it('should implement tbl_deep_extend keep', () => {
        const L = setupState();
        const [a, b] = runLuaNumbers(
            L,
            "local t=vim.tbl_deep_extend('keep',{a=1},{a=2,b=3}); return t.a, t.b",
        );
        expect(a).toBe(1);
        expect(b).toBe(3);
        destroyState(L);
    });

    it('should implement tbl_deep_extend error', () => {
        const L = setupState();
        const error = runLuaError(
            L,
            "return vim.tbl_deep_extend('error',{a=1},{a=2})",
        );
        expect(error.length).toBeGreaterThan(0);
        destroyState(L);
    });

    it('should implement tbl_extend', () => {
        const L = setupState();
        const [a, b] = runLuaNumbers(
            L,
            "local t=vim.tbl_extend('force',{a=1},{b=2}); return t.a, t.b",
        );
        expect(a).toBe(1);
        expect(b).toBe(2);
        destroyState(L);
    });

    it('should implement tbl_contains', () => {
        const L = setupState();
        expect(runLuaBoolean(L, 'return vim.tbl_contains({1,2,3}, 2)')).toBe(
            true,
        );
        expect(runLuaBoolean(L, 'return vim.tbl_contains({1,2,3}, 4)')).toBe(
            false,
        );
        expect(
            runLuaBoolean(
                L,
                "return vim.tbl_contains({'a','b'}, function(v) return v == 'b' end, {predicate=true})",
            ),
        ).toBe(true);
        destroyState(L);
    });

    it('should implement tbl_keys and tbl_values', () => {
        const L = setupState();
        expect(
            runLuaString(
                L,
                "local k=vim.tbl_keys({a=1,b=2}); table.sort(k); return table.concat(k, ',')",
            ),
        ).toBe('a,b');
        expect(
            runLuaString(
                L,
                "local v=vim.tbl_values({a=1,b=2}); table.sort(v); return table.concat(v, ',')",
            ),
        ).toBe('1,2');
        destroyState(L);
    });

    it('should implement tbl_map and tbl_filter', () => {
        const L = setupState();
        expect(
            runLuaString(
                L,
                'local t=vim.tbl_map(function(v) return v*2 end,{1,2,3}); return table.concat(t, ",")',
            ),
        ).toBe('2,4,6');
        expect(
            runLuaString(
                L,
                'local t=vim.tbl_filter(function(v) return v>1 end,{1,2,3}); return table.concat(t, ",")',
            ),
        ).toBe('2,3');
        destroyState(L);
    });

    it('should implement tbl_count and tbl_isempty', () => {
        const L = setupState();
        expect(runLuaNumber(L, 'return vim.tbl_count({a=1,b=2,c=3})')).toBe(3);
        expect(runLuaBoolean(L, 'return vim.tbl_isempty({})')).toBe(true);
        expect(runLuaBoolean(L, 'return vim.tbl_isempty({a=1})')).toBe(false);
        destroyState(L);
    });

    it('should implement tbl_get', () => {
        const L = setupState();
        expect(
            runLuaNumber(
                L,
                "return vim.tbl_get({a={b={c=42}}}, 'a', 'b', 'c')",
            ),
        ).toBe(42);
        expect(runLuaIsNil(L, "return vim.tbl_get({a=1}, 'x', 'y')")).toBe(
            true,
        );
        destroyState(L);
    });

    it('should implement split', () => {
        const L = setupState();
        expect(
            runLuaString(
                L,
                "return table.concat(vim.split('a,b,c', ','), ',')",
            ),
        ).toBe('a,b,c');
        expect(
            runLuaString(
                L,
                "return table.concat(vim.split('a,,b', ',', {trimempty=true}), ',')",
            ),
        ).toBe('a,b');
        expect(
            runLuaString(
                L,
                "return table.concat(vim.split('a.b', '.', {plain=true}), ',')",
            ),
        ).toBe('a,b');
        destroyState(L);
    });

    it('should implement trim and string helpers', () => {
        const L = setupState();
        expect(runLuaString(L, "return vim.trim('  hi  ')")).toBe('hi');
        expect(runLuaBoolean(L, "return vim.startswith('hello', 'hel')")).toBe(
            true,
        );
        expect(
            runLuaBoolean(L, "return vim.startswith('hello', 'world')"),
        ).toBe(false);
        expect(runLuaBoolean(L, "return vim.endswith('hello', 'lo')")).toBe(
            true,
        );
        expect(runLuaBoolean(L, "return vim.endswith('hello', 'xx')")).toBe(
            false,
        );
        destroyState(L);
    });

    it('should implement inspect', () => {
        const L = setupState();
        const listInspect = runLuaString(L, 'return vim.inspect({1,2,3})');
        expect(listInspect).toContain('1');
        expect(listInspect).toContain('3');
        const nestedInspect = runLuaString(
            L,
            "return vim.inspect({nested={key='val'}})",
        );
        expect(nestedInspect).toContain('nested');
        expect(nestedInspect).toContain('val');
        destroyState(L);
    });

    it('should implement json encode/decode', () => {
        const L = setupState();
        const json = runLuaString(L, "return vim.json.encode({a=1, b='two'})");
        expect(JSON.parse(json)).toEqual({ a: 1, b: 'two' });
        expect(runLuaNumber(L, `return vim.json.decode('{"x":42}').x`)).toBe(
            42,
        );
        expect(
            runLuaNumber(
                L,
                'local t=vim.json.decode(vim.json.encode({a=1})); return t.a',
            ),
        ).toBe(1);
        expect(runLuaString(L, 'return vim.json.encode({1,2,3})')).toBe(
            '[1,2,3]',
        );
        destroyState(L);
    });

    it('should implement pesc and deepcopy', () => {
        const L = setupState();
        expect(runLuaString(L, "return vim.pesc('hello.world')")).toBe(
            'hello%.world',
        );
        const [orig, copy] = runLuaNumbers(
            L,
            'local t={a={b=1}} local c=vim.deepcopy(t); c.a.b=2; return t.a.b, c.a.b',
        );
        expect(orig).toBe(1);
        expect(copy).toBe(2);
        destroyState(L);
    });

    it('should expose vim.log.levels', () => {
        const L = setupState();
        const [info, error] = runLuaNumbers(
            L,
            'return vim.log.levels.INFO, vim.log.levels.ERROR',
        );
        expect(info).toBe(2);
        expect(error).toBe(4);
        destroyState(L);
    });

    it('should implement stricmp', () => {
        const L = setupState();
        expect(runLuaNumber(L, 'return vim.stricmp("ABC", "abc")')).toBe(0);
        expect(runLuaNumber(L, 'return vim.stricmp("a", "b")')).toBe(-1);
        expect(runLuaNumber(L, 'return vim.stricmp("b", "a")')).toBe(1);
        expect(runLuaNumber(L, 'return vim.stricmp("", "")')).toBe(0);
        expect(runLuaNumber(L, 'return vim.stricmp("Hello", "HELLO")')).toBe(0);
        destroyState(L);
    });

    it('should implement vim.validate with new positional form', () => {
        const L = setupState();
        // Valid: no error
        const ok = runLua(L, "vim.validate('arg1', 'hello', 'string')");
        expect(ok).toBe(lua.LUA_OK);
        // Invalid: should error
        const err = runLuaError(L, "vim.validate('arg1', 5, 'string')");
        expect(err).toContain('arg1');
        expect(err).toContain('expected string');
        expect(err).toContain('got number');
        destroyState(L);
    });

    it('should implement vim.validate with old table form', () => {
        const L = setupState();
        const ok = runLua(L, "vim.validate{name={'hello', 'string'}}");
        expect(ok).toBe(lua.LUA_OK);
        const err = runLuaError(L, "vim.validate{name={5, 'string'}}");
        expect(err).toContain('expected string');
        destroyState(L);
    });

    it('should implement vim.validate optional parameter', () => {
        const L = setupState();
        // nil + optional = ok
        const ok = runLua(L, "vim.validate('arg1', nil, 'string', true)");
        expect(ok).toBe(lua.LUA_OK);
        // nil + not optional = error
        const err = runLuaError(L, "vim.validate('arg1', nil, 'string')");
        expect(err).toContain('expected string');
        expect(err).toContain('got nil');
        destroyState(L);
    });

    it('should implement vim.validate with function validator', () => {
        const L = setupState();
        const ok = runLua(
            L,
            "vim.validate('arg1', 4, function(v) return v % 2 == 0 end, 'even number')",
        );
        expect(ok).toBe(lua.LUA_OK);
        const err = runLuaError(
            L,
            "vim.validate('arg1', 3, function(v) return v % 2 == 0 end, 'even number')",
        );
        expect(err).toContain('expected even number');
        expect(err).toContain('got 3');
        destroyState(L);
    });

    it('should implement vim.validate with table of types', () => {
        const L = setupState();
        const ok = runLua(
            L,
            "vim.validate('arg1', 'hi', {'string', 'number'})",
        );
        expect(ok).toBe(lua.LUA_OK);
        const err = runLuaError(
            L,
            "vim.validate('arg1', true, {'string', 'number'})",
        );
        expect(err).toContain('expected string|number');
        expect(err).toContain('got boolean');
        destroyState(L);
    });

    it('should implement vim.keycode', () => {
        const L = setupState();
        expect(runLuaNumber(L, "return string.byte(vim.keycode('<CR>'))")).toBe(
            13,
        );
        expect(
            runLuaNumber(L, "return string.byte(vim.keycode('<Esc>'))"),
        ).toBe(27);
        expect(
            runLuaNumber(L, "return string.byte(vim.keycode('<Tab>'))"),
        ).toBe(9);
        expect(runLuaNumber(L, "return string.byte(vim.keycode('<BS>'))")).toBe(
            8,
        );
        expect(runLuaString(L, "return vim.keycode('<Space>')")).toBe(' ');
        expect(runLuaString(L, "return vim.keycode('<lt>')")).toBe('<');
        expect(runLuaString(L, "return vim.keycode('<Bar>')")).toBe('|');
        // Case insensitive
        expect(runLuaNumber(L, "return string.byte(vim.keycode('<cr>'))")).toBe(
            13,
        );
        // Unknown sequences pass through
        expect(runLuaString(L, "return vim.keycode('<Unknown>')")).toBe(
            '<Unknown>',
        );
        // Non-bracket text passes through
        expect(runLuaString(L, "return vim.keycode('hello')")).toBe('hello');
        destroyState(L);
    });

    it('should implement vim.notify_once dedup', () => {
        const L = setupState();
        expect(runLua(L, "vim.notify_once('test message', 2)")).toBe(
            lua.LUA_OK,
        );
        expect(runLua(L, "vim.notify_once('test message', 2)")).toBe(
            lua.LUA_OK,
        );
        expect(runLua(L, "vim.notify_once('other message', 2)")).toBe(
            lua.LUA_OK,
        );
        destroyState(L);
    });

    it('should implement vim.version()', () => {
        const L = setupState();
        const [major, minor, patch] = runLuaNumbers(
            L,
            'local v = vim.version(); return v.major, v.minor, v.patch',
        );
        expect(major).toBe(0);
        expect(minor).toBe(12);
        expect(patch).toBe(5);
        destroyState(L);
    });

    it('should implement vim.version.parse', () => {
        const L = setupState();
        const [major, minor, patch] = runLuaNumbers(
            L,
            "local v = vim.version.parse('1.2.3'); return v.major, v.minor, v.patch",
        );
        expect(major).toBe(1);
        expect(minor).toBe(2);
        expect(patch).toBe(3);
        // Two-part version
        const [m2, n2, p2] = runLuaNumbers(
            L,
            "local v = vim.version.parse('0.10'); return v.major, v.minor, v.patch",
        );
        expect(m2).toBe(0);
        expect(n2).toBe(10);
        expect(p2).toBe(0);
        // Invalid returns nil
        expect(
            runLuaIsNil(L, "return vim.version.parse('not-a-version')"),
        ).toBe(true);
        destroyState(L);
    });

    it('should implement vim.version.cmp', () => {
        const L = setupState();
        expect(
            runLuaNumber(L, "return vim.version.cmp('1.0.0', '1.0.0')"),
        ).toBe(0);
        expect(
            runLuaNumber(L, "return vim.version.cmp('1.0.0', '2.0.0')"),
        ).toBe(-1);
        expect(
            runLuaNumber(L, "return vim.version.cmp('2.0.0', '1.0.0')"),
        ).toBe(1);
        expect(
            runLuaNumber(L, "return vim.version.cmp('1.2.3', '1.2.4')"),
        ).toBe(-1);
        destroyState(L);
    });

    it('should implement vim.version comparison functions', () => {
        const L = setupState();
        expect(
            runLuaBoolean(L, "return vim.version.eq('1.0.0', '1.0.0')"),
        ).toBe(true);
        expect(
            runLuaBoolean(L, "return vim.version.eq('1.0.0', '2.0.0')"),
        ).toBe(false);
        expect(
            runLuaBoolean(L, "return vim.version.gt('2.0.0', '1.0.0')"),
        ).toBe(true);
        expect(
            runLuaBoolean(L, "return vim.version.gt('1.0.0', '2.0.0')"),
        ).toBe(false);
        expect(
            runLuaBoolean(L, "return vim.version.ge('1.0.0', '1.0.0')"),
        ).toBe(true);
        expect(
            runLuaBoolean(L, "return vim.version.lt('1.0.0', '2.0.0')"),
        ).toBe(true);
        expect(
            runLuaBoolean(L, "return vim.version.le('1.0.0', '1.0.0')"),
        ).toBe(true);
        destroyState(L);
    });

    it('should implement vim.version.range', () => {
        const L = setupState();
        expect(
            runLuaBoolean(
                L,
                "return vim.version.range('>=1.0.0'):has('1.2.3')",
            ),
        ).toBe(true);
        expect(
            runLuaBoolean(
                L,
                "return vim.version.range('>=1.0.0'):has('0.9.0')",
            ),
        ).toBe(false);
        expect(
            runLuaBoolean(
                L,
                "return vim.version.range('>=1.0.0 <2.0.0'):has('1.5.0')",
            ),
        ).toBe(true);
        expect(
            runLuaBoolean(
                L,
                "return vim.version.range('>=1.0.0 <2.0.0'):has('2.0.0')",
            ),
        ).toBe(false);
        destroyState(L);
    });

    it('should implement vim.version.last', () => {
        const L = setupState();
        const [major, minor] = runLuaNumbers(
            L,
            "local v = vim.version.last({'0.9.0', '1.2.3', '0.10.0'}); return v.major, v.minor",
        );
        expect(major).toBe(1);
        expect(minor).toBe(2);
        destroyState(L);
    });

    it('should implement vim.deep_equal', () => {
        const L = setupState();
        expect(
            runLuaBoolean(L, 'return vim.deep_equal({a=1,b=2}, {a=1,b=2})'),
        ).toBe(true);
        expect(runLuaBoolean(L, 'return vim.deep_equal({a=1}, {a=2})')).toBe(
            false,
        );
        expect(runLuaBoolean(L, 'return vim.deep_equal(1, 1)')).toBe(true);
        expect(runLuaBoolean(L, "return vim.deep_equal('a', 'a')")).toBe(true);
        expect(
            runLuaBoolean(L, 'return vim.deep_equal({a={b=1}}, {a={b=1}})'),
        ).toBe(true);
        expect(
            runLuaBoolean(L, 'return vim.deep_equal({a={b=1}}, {a={b=2}})'),
        ).toBe(false);
        destroyState(L);
    });

    it('should implement vim.islist and vim.isarray', () => {
        const L = setupState();
        expect(runLuaBoolean(L, 'return vim.islist({1, 2, 3})')).toBe(true);
        expect(runLuaBoolean(L, 'return vim.islist({a=1})')).toBe(false);
        expect(runLuaBoolean(L, 'return vim.islist({})')).toBe(true);
        expect(runLuaBoolean(L, "return vim.islist('string')")).toBe(false);
        // isarray is an alias
        expect(runLuaBoolean(L, 'return vim.isarray({1, 2})')).toBe(true);
        destroyState(L);
    });

    it('should implement vim.list_contains', () => {
        const L = setupState();
        expect(
            runLuaBoolean(L, "return vim.list_contains({'a','b','c'}, 'b')"),
        ).toBe(true);
        expect(
            runLuaBoolean(L, "return vim.list_contains({'a','b','c'}, 'd')"),
        ).toBe(false);
        destroyState(L);
    });

    it('should implement vim.list_slice', () => {
        const L = setupState();
        expect(
            runLuaString(
                L,
                "return table.concat(vim.list_slice({1,2,3,4,5}, 2, 4), ',')",
            ),
        ).toBe('2,3,4');
        expect(
            runLuaString(
                L,
                "return table.concat(vim.list_slice({1,2,3}, 2), ',')",
            ),
        ).toBe('2,3');
        destroyState(L);
    });

    it('should implement vim.empty_dict', () => {
        const L = setupState();
        expect(
            runLuaNumber(
                L,
                'local t = vim.empty_dict(); local c = 0; for _ in pairs(t) do c = c + 1 end; return c',
            ),
        ).toBe(0);
        destroyState(L);
    });

    it('should implement vim.defaulttable', () => {
        const L = setupState();
        expect(
            runLuaNumber(
                L,
                'local t = vim.defaulttable(); t.a.b = 42; return t.a.b',
            ),
        ).toBe(42);
        destroyState(L);
    });

    it('should implement vim.ringbuf', () => {
        const L = setupState();
        const [a, b] = runLuaNumbers(
            L,
            [
                'local r = vim.ringbuf(2)',
                'r:push(1)',
                'r:push(2)',
                'r:push(3)',
                'local top = r:peek()',
                'local popped = r:pop()',
                'return top, popped',
            ].join('\n'),
        );
        expect(a).toBe(3);
        expect(b).toBe(3);
        destroyState(L);
    });

    it('should implement vim.spairs', () => {
        const L = setupState();
        expect(
            runLuaString(
                L,
                [
                    'local result = {}',
                    'for k, v in vim.spairs({c=3, a=1, b=2}) do',
                    "    table.insert(result, k .. '=' .. v)",
                    'end',
                    "return table.concat(result, ',')",
                ].join('\n'),
            ),
        ).toBe('a=1,b=2,c=3');
        destroyState(L);
    });

    it('should implement vim.gsplit', () => {
        const L = setupState();
        expect(
            runLuaString(
                L,
                [
                    'local result = {}',
                    "for part in vim.gsplit('a,b,c', ',') do",
                    '    table.insert(result, part)',
                    'end',
                    "return table.concat(result, '-')",
                ].join('\n'),
            ),
        ).toBe('a-b-c');
        destroyState(L);
    });

    it('should implement vim.tbl_flatten', () => {
        const L = setupState();
        expect(
            runLuaString(
                L,
                "return table.concat(vim.tbl_flatten({1,{2,{3}},4}), ',')",
            ),
        ).toBe('1,2,3,4');
        destroyState(L);
    });

    it('should implement vim.schedule_wrap', () => {
        const L = setupState();
        expect(
            runLuaBoolean(
                L,
                "return type(vim.schedule_wrap(function() end)) == 'function'",
            ),
        ).toBe(true);
        destroyState(L);
    });

    it('should implement vim.print', () => {
        const L = setupState();
        // vim.print returns its arguments
        expect(runLuaNumber(L, 'return vim.print(42)')).toBe(42);
        destroyState(L);
    });

    it('should implement vim.F.if_nil', () => {
        const L = setupState();
        expect(runLuaNumber(L, 'return vim.F.if_nil(nil, 42)')).toBe(42);
        expect(runLuaNumber(L, 'return vim.F.if_nil(7, 42)')).toBe(7);
        destroyState(L);
    });

    it('should implement vim.F.ok_or_nil', () => {
        const L = setupState();
        expect(runLuaNumber(L, 'return vim.F.ok_or_nil(true, 42)')).toBe(42);
        expect(runLuaIsNil(L, 'return vim.F.ok_or_nil(false, 42)')).toBe(true);
        destroyState(L);
    });
});
