import { lua_pushinteger, lua_pushliteral, lua_setfield } from './lua.js';
import { luaL_newlib } from './lauxlib.js';
import {
    FENGARI_AUTHORS,
    FENGARI_COPYRIGHT,
    FENGARI_RELEASE,
    FENGARI_VERSION,
    FENGARI_VERSION_MAJOR,
    FENGARI_VERSION_MINOR,
    FENGARI_VERSION_NUM,
    FENGARI_VERSION_RELEASE,
    to_luastring,
} from './fengaricore.js';
import type { lua_State } from './lstate.js';

const luaopen_fengari = function (L: lua_State): number {
    luaL_newlib(L, {});
    lua_pushliteral(L, FENGARI_AUTHORS);
    lua_setfield(L, -2, to_luastring('AUTHORS'));
    lua_pushliteral(L, FENGARI_COPYRIGHT);
    lua_setfield(L, -2, to_luastring('COPYRIGHT'));
    lua_pushliteral(L, FENGARI_RELEASE);
    lua_setfield(L, -2, to_luastring('RELEASE'));
    lua_pushliteral(L, FENGARI_VERSION);
    lua_setfield(L, -2, to_luastring('VERSION'));
    lua_pushliteral(L, FENGARI_VERSION_MAJOR);
    lua_setfield(L, -2, to_luastring('VERSION_MAJOR'));
    lua_pushliteral(L, FENGARI_VERSION_MINOR);
    lua_setfield(L, -2, to_luastring('VERSION_MINOR'));
    lua_pushinteger(L, FENGARI_VERSION_NUM);
    lua_setfield(L, -2, to_luastring('VERSION_NUM'));
    lua_pushliteral(L, FENGARI_VERSION_RELEASE);
    lua_setfield(L, -2, to_luastring('VERSION_RELEASE'));
    return 1;
};

export { luaopen_fengari };
