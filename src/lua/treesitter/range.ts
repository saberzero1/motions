import { lua } from '../../lib/fengari';
import type { lua_State } from '../../lib/fengari';

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
