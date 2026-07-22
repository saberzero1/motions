import { describe, it, expect, vi, afterEach } from 'vitest';
import { lua, lauxlib, to_jsstring, to_luastring } from 'fengari';
import { createSandboxedState, destroyState } from '../../../src/lua/engine';
import {
    injectVimApi,
    setVimVContext,
    clearVimVContext,
} from '../../../src/lua/api';
import { AutocmdManager } from '../../../src/lua/autocmd';

type LuaState = ReturnType<typeof createSandboxedState>;

const minCallbacks = {
    onSettingOverride: () => {},
    handleExCommand: () => {},
    getVaultName: () => 'vault',
    onKeymap: () => {},
    onKeymapDel: () => {},
};

function setup(extra?: Record<string, unknown>): LuaState {
    const L = createSandboxedState();
    injectVimApi(L, {
        ...minCallbacks,
        autocmdManager: new AutocmdManager(L),
        ...extra,
    } as Parameters<typeof injectVimApi>[1]);
    return L;
}

function runLuaNumber(L: LuaState, code: string): number {
    const status = lauxlib.luaL_dostring(L, to_luastring(`return ${code}`));
    expect(status).toBe(lua.LUA_OK);
    const value = lua.lua_tonumber(L, -1);
    lua.lua_pop(L, 1);
    return value;
}

function runLuaString(L: LuaState, code: string): string {
    const status = lauxlib.luaL_dostring(L, to_luastring(`return ${code}`));
    expect(status).toBe(lua.LUA_OK);
    const bytes = lua.lua_tolstring(L, -1);
    const text = bytes ? to_jsstring(bytes) : '';
    lua.lua_pop(L, 1);
    return text;
}

function runLuaBool(L: LuaState, code: string): boolean {
    const status = lauxlib.luaL_dostring(L, to_luastring(`return ${code}`));
    expect(status).toBe(lua.LUA_OK);
    const value = lua.lua_toboolean(L, -1);
    lua.lua_pop(L, 1);
    return value;
}

function runLuaIsNil(L: LuaState, code: string): boolean {
    const status = lauxlib.luaL_dostring(L, to_luastring(`return ${code}`));
    expect(status).toBe(lua.LUA_OK);
    const isNil = lua.lua_isnil(L, -1);
    lua.lua_pop(L, 1);
    return isNil;
}

function runLuaError(L: LuaState, code: string): string {
    const status = lauxlib.luaL_dostring(L, to_luastring(code));
    expect(status).not.toBe(lua.LUA_OK);
    const bytes = lua.lua_tolstring(L, -1);
    const error = bytes ? to_jsstring(bytes) : '';
    lua.lua_pop(L, 1);
    return error;
}

describe('vim.v defaults', () => {
    it('vim.v.count returns 0 by default', () => {
        const L = setup();
        expect(runLuaNumber(L, 'vim.v.count')).toBe(0);
        destroyState(L);
    });

    it('vim.v.count1 returns 1 by default', () => {
        const L = setup();
        expect(runLuaNumber(L, 'vim.v.count1')).toBe(1);
        destroyState(L);
    });

    it("vim.v.register returns '\"'  by default", () => {
        const L = setup();
        expect(runLuaString(L, 'vim.v.register')).toBe('"');
        destroyState(L);
    });

    it('vim.v.operator returns empty string by default', () => {
        const L = setup();
        expect(runLuaString(L, 'vim.v.operator')).toBe('');
        destroyState(L);
    });
});

describe('vim.v with context', () => {
    afterEach(() => {
        clearVimVContext();
    });

    it('setVimVContext({ count: 5, count1: 5 }) makes vim.v.count return 5', () => {
        const L = setup();
        setVimVContext({ count: 5, count1: 5 });
        expect(runLuaNumber(L, 'vim.v.count')).toBe(5);
        expect(runLuaNumber(L, 'vim.v.count1')).toBe(5);
        destroyState(L);
    });

    it('setVimVContext({ register: "a" }) makes vim.v.register return "a"', () => {
        const L = setup();
        setVimVContext({ register: 'a' });
        expect(runLuaString(L, 'vim.v.register')).toBe('a');
        destroyState(L);
    });

    it('setVimVContext({ operator: "d" }) makes vim.v.operator return "d"', () => {
        const L = setup();
        setVimVContext({ operator: 'd' });
        expect(runLuaString(L, 'vim.v.operator')).toBe('d');
        destroyState(L);
    });

    it('clearVimVContext resets all to defaults', () => {
        const L = setup();
        setVimVContext({ count: 3, count1: 3, register: 'b', operator: 'y' });
        clearVimVContext();
        expect(runLuaNumber(L, 'vim.v.count')).toBe(0);
        expect(runLuaNumber(L, 'vim.v.count1')).toBe(1);
        expect(runLuaString(L, 'vim.v.register')).toBe('"');
        expect(runLuaString(L, 'vim.v.operator')).toBe('');
        destroyState(L);
    });

    it('partial setVimVContext only changes specified fields', () => {
        const L = setup();
        setVimVContext({ count: 7 });
        expect(runLuaNumber(L, 'vim.v.count')).toBe(7);
        expect(runLuaNumber(L, 'vim.v.count1')).toBe(1);
        expect(runLuaString(L, 'vim.v.register')).toBe('"');
        expect(runLuaString(L, 'vim.v.operator')).toBe('');
        destroyState(L);
    });
});

describe('vim.v read-only', () => {
    it('assigning vim.v.count errors with "read-only"', () => {
        const L = setup();
        const err = runLuaError(L, 'vim.v.count = 5');
        expect(err).toContain('read-only');
        destroyState(L);
    });

    it('assigning vim.v.count1 errors with "read-only"', () => {
        const L = setup();
        const err = runLuaError(L, 'vim.v.count1 = 5');
        expect(err).toContain('read-only');
        destroyState(L);
    });

    it('assigning vim.v.register errors with "read-only"', () => {
        const L = setup();
        const err = runLuaError(L, 'vim.v.register = "a"');
        expect(err).toContain('read-only');
        destroyState(L);
    });

    it('assigning vim.v.operator errors with "read-only"', () => {
        const L = setup();
        const err = runLuaError(L, 'vim.v.operator = "d"');
        expect(err).toContain('read-only');
        destroyState(L);
    });
});

describe('vim.v constants', () => {
    it('vim.v.numbermax returns 9007199254740991', () => {
        const L = setup();
        expect(runLuaNumber(L, 'vim.v.numbermax')).toBe(9007199254740991);
        destroyState(L);
    });

    it('vim.v.numbermin returns -9007199254740991', () => {
        const L = setup();
        expect(runLuaNumber(L, 'vim.v.numbermin')).toBe(-9007199254740991);
        destroyState(L);
    });

    it('vim.v.numbersize returns 53', () => {
        const L = setup();
        expect(runLuaNumber(L, 'vim.v.numbersize')).toBe(53);
        destroyState(L);
    });

    it('vim.v.true returns true', () => {
        const L = setup();
        expect(runLuaBool(L, 'vim.v["true"]')).toBe(true);
        destroyState(L);
    });

    it('vim.v.false returns false', () => {
        const L = setup();
        expect(runLuaBool(L, 'vim.v["false"]')).toBe(false);
        destroyState(L);
    });

    it('vim.v.null returns nil', () => {
        const L = setup();
        expect(runLuaIsNil(L, 'vim.v["null"]')).toBe(true);
        destroyState(L);
    });
});

describe('vim.v.searchforward', () => {
    afterEach(() => {
        clearVimVContext();
    });

    it('defaults to 1', () => {
        const L = setup();
        expect(runLuaNumber(L, 'vim.v.searchforward')).toBe(1);
        destroyState(L);
    });

    it('uses getSearchForward callback when provided', () => {
        const getSearchForward = vi.fn(() => 0);
        const L = setup({ getSearchForward });
        expect(runLuaNumber(L, 'vim.v.searchforward')).toBe(0);
        expect(getSearchForward).toHaveBeenCalled();
        destroyState(L);
    });

    it('is writable without error', () => {
        const L = setup();
        const status = lauxlib.luaL_dostring(
            L,
            to_luastring('vim.v.searchforward = 0'),
        );
        expect(status).toBe(lua.LUA_OK);
        destroyState(L);
    });

    it('calls setSearchForward callback when written', () => {
        const setSearchForward = vi.fn();
        const L = setup({ setSearchForward });
        const status = lauxlib.luaL_dostring(
            L,
            to_luastring('vim.v.searchforward = 0'),
        );
        expect(status).toBe(lua.LUA_OK);
        expect(setSearchForward).toHaveBeenCalledWith(0);
        destroyState(L);
    });
});

describe('vim.v.insertmode', () => {
    afterEach(() => {
        clearVimVContext();
    });

    it('defaults to empty string', () => {
        const L = setup();
        expect(runLuaString(L, 'vim.v.insertmode')).toBe('');
        destroyState(L);
    });

    it('reads from context when set', () => {
        const L = setup();
        setVimVContext({ insertmode: 'i' });
        expect(runLuaString(L, 'vim.v.insertmode')).toBe('i');
        destroyState(L);
    });
});

describe('vim.v fold variables', () => {
    afterEach(() => {
        clearVimVContext();
    });

    it('vim.v.foldstart defaults to 0', () => {
        const L = setup();
        expect(runLuaNumber(L, 'vim.v.foldstart')).toBe(0);
        destroyState(L);
    });

    it('vim.v.foldend defaults to 0', () => {
        const L = setup();
        expect(runLuaNumber(L, 'vim.v.foldend')).toBe(0);
        destroyState(L);
    });

    it('vim.v.foldlevel defaults to 0', () => {
        const L = setup();
        expect(runLuaNumber(L, 'vim.v.foldlevel')).toBe(0);
        destroyState(L);
    });

    it('vim.v.folddashes defaults to empty string', () => {
        const L = setup();
        expect(runLuaString(L, 'vim.v.folddashes')).toBe('');
        destroyState(L);
    });

    it('reads foldstart from context when set', () => {
        const L = setup();
        setVimVContext({ foldstart: 10 });
        expect(runLuaNumber(L, 'vim.v.foldstart')).toBe(10);
        destroyState(L);
    });

    it('reads foldend from context when set', () => {
        const L = setup();
        setVimVContext({ foldend: 20 });
        expect(runLuaNumber(L, 'vim.v.foldend')).toBe(20);
        destroyState(L);
    });

    it('reads foldlevel from context when set', () => {
        const L = setup();
        setVimVContext({ foldlevel: 3 });
        expect(runLuaNumber(L, 'vim.v.foldlevel')).toBe(3);
        destroyState(L);
    });

    it('reads folddashes from context when set', () => {
        const L = setup();
        setVimVContext({ folddashes: '---' });
        expect(runLuaString(L, 'vim.v.folddashes')).toBe('---');
        destroyState(L);
    });
});

describe('vim.v statuscolumn variables', () => {
    afterEach(() => {
        clearVimVContext();
    });

    it('vim.v.lnum defaults to 0', () => {
        const L = setup();
        expect(runLuaNumber(L, 'vim.v.lnum')).toBe(0);
        destroyState(L);
    });

    it('vim.v.relnum defaults to 0', () => {
        const L = setup();
        expect(runLuaNumber(L, 'vim.v.relnum')).toBe(0);
        destroyState(L);
    });

    it('vim.v.virtnum defaults to 0', () => {
        const L = setup();
        expect(runLuaNumber(L, 'vim.v.virtnum')).toBe(0);
        destroyState(L);
    });

    it('reads lnum from context when set', () => {
        const L = setup();
        setVimVContext({ lnum: 42 });
        expect(runLuaNumber(L, 'vim.v.lnum')).toBe(42);
        destroyState(L);
    });

    it('reads relnum from context when set', () => {
        const L = setup();
        setVimVContext({ relnum: 5 });
        expect(runLuaNumber(L, 'vim.v.relnum')).toBe(5);
        destroyState(L);
    });

    it('reads virtnum from context when set', () => {
        const L = setup();
        setVimVContext({ virtnum: 1 });
        expect(runLuaNumber(L, 'vim.v.virtnum')).toBe(1);
        destroyState(L);
    });
});

describe('vim.v.event and vim.v.char', () => {
    afterEach(() => {
        clearVimVContext();
    });

    it('vim.v.event defaults to nil', () => {
        const L = setup();
        expect(runLuaIsNil(L, 'vim.v.event')).toBe(true);
        destroyState(L);
    });

    it('vim.v.char defaults to empty string', () => {
        const L = setup();
        expect(runLuaString(L, 'vim.v.char')).toBe('');
        destroyState(L);
    });

    it('vim.v.char is writable', () => {
        const L = setup();
        const status = lauxlib.luaL_dostring(
            L,
            to_luastring('vim.v.char = "x"'),
        );
        expect(status).toBe(lua.LUA_OK);
        expect(runLuaString(L, 'vim.v.char')).toBe('x');
        destroyState(L);
    });

    it('vim.v.event reads from context when set', () => {
        const L = setup();
        setVimVContext({ event: { buf: 0 } });
        const status = lauxlib.luaL_dostring(
            L,
            to_luastring('return vim.v.event.buf'),
        );
        expect(status).toBe(lua.LUA_OK);
        expect(lua.lua_tonumber(L, -1)).toBe(0);
        lua.lua_pop(L, 1);
        destroyState(L);
    });
});

describe('vim.keymap.set with expr', () => {
    it('function expr mapping registers with expr=true', () => {
        const onKeymap = vi.fn();
        const L = setup({ onKeymap });
        const status = lauxlib.luaL_dostring(
            L,
            to_luastring(
                "vim.keymap.set('n', 'j', function() return 'gj' end, { expr = true })",
            ),
        );
        expect(status).toBe(lua.LUA_OK);
        expect(onKeymap).toHaveBeenCalledWith(
            expect.objectContaining({
                mode: 'normal',
                lhs: 'j',
                expr: true,
            }),
        );
        destroyState(L);
    });

    it('function expr mapping has isFn=true and a callback', () => {
        const onKeymap = vi.fn();
        const L = setup({ onKeymap });
        const status = lauxlib.luaL_dostring(
            L,
            to_luastring(
                "vim.keymap.set('n', 'k', function() return 'gk' end, { expr = true })",
            ),
        );
        expect(status).toBe(lua.LUA_OK);
        expect(onKeymap).toHaveBeenCalledWith(
            expect.objectContaining({
                isFn: true,
                callback: expect.any(Function),
            }),
        );
        destroyState(L);
    });

    it('string expr mapping errors with helpful message', () => {
        const L = setup();
        const err = runLuaError(
            L,
            "vim.keymap.set('n', 'j', 'gj', { expr = true })",
        );
        expect(err).toContain('string expr mappings are not supported');
        expect(err).toContain('Use a Lua function instead');
        destroyState(L);
    });

    it('non-expr mapping has expr=false', () => {
        const onKeymap = vi.fn();
        const L = setup({ onKeymap });
        const status = lauxlib.luaL_dostring(
            L,
            to_luastring("vim.keymap.set('n', 'x', 'y')"),
        );
        expect(status).toBe(lua.LUA_OK);
        expect(onKeymap).toHaveBeenCalledWith(
            expect.objectContaining({
                expr: false,
            }),
        );
        destroyState(L);
    });
});

describe('vim.v.hlsearch callback', () => {
    it('reads from getHlSearch callback when provided', () => {
        const getHlSearch = vi.fn().mockReturnValue(1);
        const L = setup({ getHlSearch });
        expect(runLuaNumber(L, 'vim.v.hlsearch')).toBe(1);
        expect(getHlSearch).toHaveBeenCalled();
        destroyState(L);
    });

    it('returns 0 when getHlSearch returns 0', () => {
        const getHlSearch = vi.fn().mockReturnValue(0);
        const L = setup({ getHlSearch });
        expect(runLuaNumber(L, 'vim.v.hlsearch')).toBe(0);
        destroyState(L);
    });

    it('falls back to context when callback not provided', () => {
        const L = setup();
        expect(runLuaNumber(L, 'vim.v.hlsearch')).toBe(0);
        setVimVContext({ hlsearch: 1 });
        expect(runLuaNumber(L, 'vim.v.hlsearch')).toBe(1);
        clearVimVContext();
        destroyState(L);
    });
});

describe('vim.v.event in autocmd context', () => {
    afterEach(() => {
        clearVimVContext();
    });

    it('vim.v.event is nil by default', () => {
        const L = setup();
        expect(runLuaIsNil(L, 'vim.v.event')).toBe(true);
        destroyState(L);
    });

    it('vim.v.event reflects context with multiple fields', () => {
        const L = setup();
        setVimVContext({
            event: { event: 'BufEnter', file: 'test.md', buf: 0 },
        });
        expect(runLuaString(L, 'vim.v.event.event')).toBe('BufEnter');
        expect(runLuaString(L, 'vim.v.event.file')).toBe('test.md');
        expect(runLuaNumber(L, 'vim.v.event.buf')).toBe(0);
        clearVimVContext();
        expect(runLuaIsNil(L, 'vim.v.event')).toBe(true);
        destroyState(L);
    });

    it('vim.v.event.data contains custom payload', () => {
        const L = setup();
        setVimVContext({
            event: { data: { old_mode: 'n', new_mode: 'i' } },
        });
        expect(runLuaString(L, 'vim.v.event.data.old_mode')).toBe('n');
        expect(runLuaString(L, 'vim.v.event.data.new_mode')).toBe('i');
        destroyState(L);
    });
});

describe('vim.v unknown keys', () => {
    it('vim.v.nonexistent returns nil', () => {
        const L = setup();
        expect(runLuaIsNil(L, 'vim.v.nonexistent')).toBe(true);
        destroyState(L);
    });

    it('vim.v.foobar returns nil', () => {
        const L = setup();
        expect(runLuaIsNil(L, 'vim.v.foobar')).toBe(true);
        destroyState(L);
    });
});
