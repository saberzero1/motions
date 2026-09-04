import * as lua from '../../../src/lib/fengari/lua.js';
import * as lauxlib from '../../../src/lib/fengari/lauxlib.js';
import { to_luastring } from '../../../src/lib/fengari/fengaricore.js';
import type { lua_State } from '../../../src/lib/fengari/lstate.js';

export const toByteCode = function (luaCode: string): Uint8Array {
    let L = lauxlib.luaL_newstate();
    if (!L) throw Error('failed to create lua state');

    if (lauxlib.luaL_loadstring(L, to_luastring(luaCode)) !== lua.LUA_OK)
        throw Error(lua.lua_tojsstring(L, -1) ?? 'unknown error');

    let b: number[] = [];
    if (
        lua.lua_dump(
            L,
            function (
                _L: lua_State,
                buf: Uint8Array,
                size: number,
                data: unknown,
            ) {
                const B = data as number[];
                B.push(...Array.from(buf.slice(0, size)));
                return 0;
            },
            b,
            0,
        ) !== 0
    )
        throw Error('unable to dump given function');
    return Uint8Array.from(b);
};
