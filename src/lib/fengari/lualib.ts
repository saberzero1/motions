import { LUA_VERSION_MAJOR, LUA_VERSION_MINOR } from './lua.js';
import { luaopen_base } from './lbaselib.js';
import { luaopen_coroutine } from './lcorolib.js';
import { luaopen_table } from './ltablib.js';
import { luaopen_os } from './loslib.js';
import { luaopen_string } from './lstrlib.js';
import { luaopen_utf8 } from './lutf8lib.js';
import { luaopen_math } from './lmathlib.js';
import { luaopen_debug } from './ldblib.js';
import { luaopen_fengari } from './fengarilib.js';
import * as linit from './linit.js';

const LUA_VERSUFFIX = '_' + LUA_VERSION_MAJOR + '_' + LUA_VERSION_MINOR;

const lua_assert = function (_c: unknown): void {};

const LUA_COLIBNAME = 'coroutine';

const LUA_TABLIBNAME = 'table';

const LUA_OSLIBNAME = 'os';

const LUA_STRLIBNAME = 'string';

const LUA_UTF8LIBNAME = 'utf8';

const LUA_BITLIBNAME = 'bit32';
// module.exports.luaopen_bit32 = require("./lbitlib.js").luaopen_bit32;

const LUA_MATHLIBNAME = 'math';

const LUA_DBLIBNAME = 'debug';

const LUA_FENGARILIBNAME = 'fengari';

const luaL_openlibs = linit.luaL_openlibs;

export {
    LUA_VERSUFFIX,
    lua_assert,
    luaopen_base,
    LUA_COLIBNAME,
    luaopen_coroutine,
    LUA_TABLIBNAME,
    luaopen_table,
    LUA_OSLIBNAME,
    luaopen_os,
    LUA_STRLIBNAME,
    luaopen_string,
    LUA_UTF8LIBNAME,
    luaopen_utf8,
    LUA_BITLIBNAME,
    LUA_MATHLIBNAME,
    luaopen_math,
    LUA_DBLIBNAME,
    luaopen_debug,
    LUA_FENGARILIBNAME,
    luaopen_fengari,
    luaL_openlibs,
};
