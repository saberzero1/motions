import { lua_pop } from './lua.js';
import { luaL_requiref } from './lauxlib.js';
import { to_luastring } from './fengaricore.js';
import { luaopen_base } from './lbaselib.js';
import { luaopen_coroutine } from './lcorolib.js';
import { luaopen_debug } from './ldblib.js';
import { luaopen_math } from './lmathlib.js';
import { luaopen_os } from './loslib.js';
import { luaopen_string } from './lstrlib.js';
import { luaopen_table } from './ltablib.js';
import { luaopen_utf8 } from './lutf8lib.js';
import { luaopen_fengari } from './fengarilib.js';
import type { lua_State } from './lstate.js';

type LuaCFunction = (L: lua_State) => number;

// Library name strings inlined to break linit↔lualib circular dependency.
const loadedlibs: Record<string, LuaCFunction> = {
    _G: luaopen_base,
    coroutine: luaopen_coroutine,
    table: luaopen_table,
    os: luaopen_os,
    string: luaopen_string,
    math: luaopen_math,
    utf8: luaopen_utf8,
    debug: luaopen_debug,
    fengari: luaopen_fengari,
};

const luaL_openlibs = function (L: lua_State): void {
    for (const lib in loadedlibs) {
        const openLib = loadedlibs[lib]!;
        luaL_requiref(L, to_luastring(lib), openLib, 1);
        lua_pop(L, 1);
    }
};

export { luaL_openlibs };
