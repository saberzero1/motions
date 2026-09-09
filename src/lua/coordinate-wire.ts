import { lua, lauxlib, to_jsstring, to_luastring } from '../lib/fengari';
import type { lua_State } from '../lib/fengari';
import type { CoordinateResult } from './coordinates';

/** Text APIs require Lua numbers, not lua_tonumber's nil/string coercion. */
export function readTextCoordinates(
    L: lua_State,
): [number, number, number, number] {
    function coordinate(index: number, name: string): number {
        if (lua.lua_type(L, index) !== lua.LUA_TNUMBER)
            return lauxlib.luaL_error(
                L,
                to_luastring(`Invalid '${name}': Expected Lua number`),
            );
        return lua.lua_tonumber(L, index);
    }
    return [
        coordinate(2, 'start_row'),
        coordinate(3, 'start_col'),
        coordinate(4, 'end_row'),
        coordinate(5, 'end_col'),
    ];
}

/** Bounded position-table marshaling, preserving Lua types (including strings). */
export function readCoordinateArgument(L: lua_State, index: number): unknown {
    if (lua.lua_istable(L, index)) {
        const length = Math.min(lua.lua_rawlen(L, index), 3);
        const result: unknown[] = [];
        for (let i = 1; i <= length; i++) {
            lua.lua_rawgeti(L, index, i);
            result.push(readScalar(L, -1));
            lua.lua_pop(L, 1);
        }
        return result;
    }
    return readScalar(L, index);
}

function readScalar(L: lua_State, index: number): unknown {
    switch (lua.lua_type(L, index)) {
        case lua.LUA_TNUMBER:
            return lua.lua_tonumber(L, index);
        case lua.LUA_TSTRING:
            return to_jsstring(lauxlib.luaL_checkstring(L, index));
        case lua.LUA_TBOOLEAN:
            return !!lua.lua_toboolean(L, index);
        default:
            return null;
    }
}

export function pushCoordinateResult(
    L: lua_State,
    result: CoordinateResult<number | number[] | Uint8Array[] | null>,
): number {
    if (result.kind === 'error')
        return lauxlib.luaL_error(L, to_luastring(result.message));
    if (result.value === null) return 0;
    if (typeof result.value === 'number') lua.lua_pushinteger(L, result.value);
    else {
        lua.lua_createtable(L, result.value.length, 0);
        result.value.forEach((entry, index) => {
            if (typeof entry === 'number') lua.lua_pushinteger(L, entry);
            else lua.lua_pushlstring(L, entry, entry.length);
            lua.lua_rawseti(L, -2, index + 1);
        });
    }
    return 1;
}

export function pushCoordinateTuple(L: lua_State, tuple: number[]): void {
    lua.lua_createtable(L, tuple.length, 0);
    tuple.forEach((entry, index) => {
        lua.lua_pushinteger(L, entry);
        lua.lua_rawseti(L, -2, index + 1);
    });
}
