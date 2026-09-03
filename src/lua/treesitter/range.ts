import { lua, lauxlib, to_luastring } from '../../lib/fengari';
import type { lua_State } from '../../lib/fengari';

function readRangeValue(L: lua_State, index: number, label: string): number {
    if (!lua.lua_isnumber(L, index)) {
        lauxlib.luaL_error(L, to_luastring(`Expected ${label} to be a number`));
    }
    return lua.lua_tonumber(L, index);
}

export function pushRange4(
    L: lua_State,
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number,
): void {
    lua.lua_newtable(L);
    lua.lua_pushinteger(L, startRow);
    lua.lua_rawseti(L, -2, 1);
    lua.lua_pushinteger(L, startCol);
    lua.lua_rawseti(L, -2, 2);
    lua.lua_pushinteger(L, endRow);
    lua.lua_rawseti(L, -2, 3);
    lua.lua_pushinteger(L, endCol);
    lua.lua_rawseti(L, -2, 4);
}

export function pushRange6(
    L: lua_State,
    startRow: number,
    startCol: number,
    startByte: number,
    endRow: number,
    endCol: number,
    endByte: number,
): void {
    lua.lua_newtable(L);
    lua.lua_pushinteger(L, startRow);
    lua.lua_rawseti(L, -2, 1);
    lua.lua_pushinteger(L, startCol);
    lua.lua_rawseti(L, -2, 2);
    lua.lua_pushinteger(L, startByte);
    lua.lua_rawseti(L, -2, 3);
    lua.lua_pushinteger(L, endRow);
    lua.lua_rawseti(L, -2, 4);
    lua.lua_pushinteger(L, endCol);
    lua.lua_rawseti(L, -2, 5);
    lua.lua_pushinteger(L, endByte);
    lua.lua_rawseti(L, -2, 6);
}

export function readRange4(
    L: lua_State,
    index: number,
): { startRow: number; startCol: number; endRow: number; endCol: number } {
    if (!lua.lua_istable(L, index)) {
        lauxlib.luaL_error(L, to_luastring('Expected range table'));
    }
    lua.lua_rawgeti(L, index, 1);
    const startRow = readRangeValue(L, -1, 'startRow');
    lua.lua_pop(L, 1);
    lua.lua_rawgeti(L, index, 2);
    const startCol = readRangeValue(L, -1, 'startCol');
    lua.lua_pop(L, 1);
    lua.lua_rawgeti(L, index, 3);
    const endRow = readRangeValue(L, -1, 'endRow');
    lua.lua_pop(L, 1);
    lua.lua_rawgeti(L, index, 4);
    const endCol = readRangeValue(L, -1, 'endCol');
    lua.lua_pop(L, 1);
    return { startRow, startCol, endRow, endCol };
}
