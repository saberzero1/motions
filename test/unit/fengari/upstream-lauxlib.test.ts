import { expect, test } from 'vitest';
import * as lua from '../../../src/lib/fengari/lua.js';
import * as lauxlib from '../../../src/lib/fengari/lauxlib.js';
import { to_luastring } from '../../../src/lib/fengari/fengaricore.js';

test('luaL_ref, lua_rawgeti, luaL_unref, LUA_REGISTRYINDEX', () => {
    let L = lauxlib.luaL_newstate();
    if (!L) throw Error('failed to create lua state');

    {
        lua.lua_pushstring(L, to_luastring('hello references!'));

        let r = lauxlib.luaL_ref(L, lua.LUA_REGISTRYINDEX); // pops a value, stores it and returns a reference
        lua.lua_rawgeti(L, lua.LUA_REGISTRYINDEX, r); // pushes a value associated with the reference
        lauxlib.luaL_unref(L, lua.LUA_REGISTRYINDEX, r); // releases the reference
    }

    expect(lua.lua_tojsstring(L, -1)).toBe('hello references!');
});
