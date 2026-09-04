/**
@license MIT

Copyright © 2017-2019 Benoit Giannangeli
Copyright © 2017-2019 Daurnimator
Copyright © 1994–2017 Lua.org, PUC-Rio.
*/

import * as core from './fengaricore.js';
import * as luaconf from './luaconf.js';
import * as lua from './lua.js';
import * as lauxlib from './lauxlib.js';
import * as lualib from './lualib.js';
import * as platform from './platform.js';

const FENGARI_AUTHORS = core.FENGARI_AUTHORS;
const FENGARI_COPYRIGHT = core.FENGARI_COPYRIGHT;
const FENGARI_RELEASE = core.FENGARI_RELEASE;
const FENGARI_VERSION = core.FENGARI_VERSION;
const FENGARI_VERSION_MAJOR = core.FENGARI_VERSION_MAJOR;
const FENGARI_VERSION_MINOR = core.FENGARI_VERSION_MINOR;
const FENGARI_VERSION_NUM = core.FENGARI_VERSION_NUM;
const FENGARI_VERSION_RELEASE = core.FENGARI_VERSION_RELEASE;

const luastring_eq = core.luastring_eq;
const luastring_indexOf = core.luastring_indexOf;
const luastring_of = core.luastring_of;
const to_jsstring = core.to_jsstring;
const to_luastring = core.to_luastring;
const to_uristring = core.to_uristring;

const setPlatformProvider = platform.setPlatformProvider;

export {
    FENGARI_AUTHORS,
    FENGARI_COPYRIGHT,
    FENGARI_RELEASE,
    FENGARI_VERSION,
    FENGARI_VERSION_MAJOR,
    FENGARI_VERSION_MINOR,
    FENGARI_VERSION_NUM,
    FENGARI_VERSION_RELEASE,
    luastring_eq,
    luastring_indexOf,
    luastring_of,
    to_jsstring,
    to_luastring,
    to_uristring,
    luaconf,
    lua,
    lauxlib,
    lualib,
    setPlatformProvider,
};
