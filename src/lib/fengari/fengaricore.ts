import * as defs from './defs.js';

/* Fengari specific functions
 *
 * This file includes fengari-specific data or and functionality for users to
 * manipulate fengari's string type.
 * The fields are exposed to the user on the 'fengari' entry point; however to
 * avoid a dependency on defs.js from lauxlib.js they are defined in this file.
 */

const FENGARI_VERSION_MAJOR = '0';
const FENGARI_VERSION_MINOR = '1';
const FENGARI_VERSION_NUM = 1;
const FENGARI_VERSION_RELEASE = '5';
const FENGARI_VERSION =
    'Fengari ' + FENGARI_VERSION_MAJOR + '.' + FENGARI_VERSION_MINOR;
const FENGARI_RELEASE = FENGARI_VERSION + '.' + FENGARI_VERSION_RELEASE;
const FENGARI_AUTHORS = 'B. Giannangeli, Daurnimator';
const FENGARI_COPYRIGHT =
    FENGARI_RELEASE +
    '  Copyright (C) 2017-2019 ' +
    FENGARI_AUTHORS +
    '\nBased on: ' +
    defs.LUA_COPYRIGHT;

const is_luastring = defs.is_luastring;
const luastring_eq = defs.luastring_eq;
const luastring_from = defs.luastring_from;
const luastring_indexOf = defs.luastring_indexOf;
const luastring_of = defs.luastring_of;
const to_jsstring = defs.to_jsstring;
const to_luastring = defs.to_luastring;
const to_uristring = defs.to_uristring;
const from_userstring = defs.from_userstring;

export {
    FENGARI_AUTHORS,
    FENGARI_COPYRIGHT,
    FENGARI_RELEASE,
    FENGARI_VERSION,
    FENGARI_VERSION_MAJOR,
    FENGARI_VERSION_MINOR,
    FENGARI_VERSION_NUM,
    FENGARI_VERSION_RELEASE,
    is_luastring,
    luastring_eq,
    luastring_from,
    luastring_indexOf,
    luastring_of,
    to_jsstring,
    to_luastring,
    to_uristring,
    from_userstring,
};
