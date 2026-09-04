import * as defs from './defs.js';
import * as lapi from './lapi.js';
import * as ldebug from './ldebug.js';
import * as ldo from './ldo.js';
import * as lstate from './lstate.js';

const LUA_AUTHORS = defs.LUA_AUTHORS;
const LUA_COPYRIGHT = defs.LUA_COPYRIGHT;
const LUA_ERRERR = defs.thread_status.LUA_ERRERR;
const LUA_ERRGCMM = defs.thread_status.LUA_ERRGCMM;
const LUA_ERRMEM = defs.thread_status.LUA_ERRMEM;
const LUA_ERRRUN = defs.thread_status.LUA_ERRRUN;
const LUA_ERRSYNTAX = defs.thread_status.LUA_ERRSYNTAX;
const LUA_HOOKCALL = defs.LUA_HOOKCALL;
const LUA_HOOKCOUNT = defs.LUA_HOOKCOUNT;
const LUA_HOOKLINE = defs.LUA_HOOKLINE;
const LUA_HOOKRET = defs.LUA_HOOKRET;
const LUA_HOOKTAILCALL = defs.LUA_HOOKTAILCALL;
const LUA_MASKCALL = defs.LUA_MASKCALL;
const LUA_MASKCOUNT = defs.LUA_MASKCOUNT;
const LUA_MASKLINE = defs.LUA_MASKLINE;
const LUA_MASKRET = defs.LUA_MASKRET;
const LUA_MINSTACK = defs.LUA_MINSTACK;
const LUA_MULTRET = defs.LUA_MULTRET;
const LUA_NUMTAGS = defs.constant_types.LUA_NUMTAGS;
const LUA_OK = defs.thread_status.LUA_OK;
const LUA_OPADD = defs.LUA_OPADD;
const LUA_OPBAND = defs.LUA_OPBAND;
const LUA_OPBNOT = defs.LUA_OPBNOT;
const LUA_OPBOR = defs.LUA_OPBOR;
const LUA_OPBXOR = defs.LUA_OPBXOR;
const LUA_OPDIV = defs.LUA_OPDIV;
const LUA_OPEQ = defs.LUA_OPEQ;
const LUA_OPIDIV = defs.LUA_OPIDIV;
const LUA_OPLE = defs.LUA_OPLE;
const LUA_OPLT = defs.LUA_OPLT;
const LUA_OPMOD = defs.LUA_OPMOD;
const LUA_OPMUL = defs.LUA_OPMUL;
const LUA_OPPOW = defs.LUA_OPPOW;
const LUA_OPSHL = defs.LUA_OPSHL;
const LUA_OPSHR = defs.LUA_OPSHR;
const LUA_OPSUB = defs.LUA_OPSUB;
const LUA_OPUNM = defs.LUA_OPUNM;
const LUA_REGISTRYINDEX = defs.LUA_REGISTRYINDEX;
const LUA_RELEASE = defs.LUA_RELEASE;
const LUA_RIDX_GLOBALS = defs.LUA_RIDX_GLOBALS;
const LUA_RIDX_LAST = defs.LUA_RIDX_LAST;
const LUA_RIDX_MAINTHREAD = defs.LUA_RIDX_MAINTHREAD;
const LUA_SIGNATURE = defs.LUA_SIGNATURE;
const LUA_TNONE = defs.constant_types.LUA_TNONE;
const LUA_TNIL = defs.constant_types.LUA_TNIL;
const LUA_TBOOLEAN = defs.constant_types.LUA_TBOOLEAN;
const LUA_TLIGHTUSERDATA = defs.constant_types.LUA_TLIGHTUSERDATA;
const LUA_TNUMBER = defs.constant_types.LUA_TNUMBER;
const LUA_TSTRING = defs.constant_types.LUA_TSTRING;
const LUA_TTABLE = defs.constant_types.LUA_TTABLE;
const LUA_TFUNCTION = defs.constant_types.LUA_TFUNCTION;
const LUA_TUSERDATA = defs.constant_types.LUA_TUSERDATA;
const LUA_TTHREAD = defs.constant_types.LUA_TTHREAD;
const LUA_VERSION = defs.LUA_VERSION;
const LUA_VERSION_MAJOR = defs.LUA_VERSION_MAJOR;
const LUA_VERSION_MINOR = defs.LUA_VERSION_MINOR;
const LUA_VERSION_NUM = defs.LUA_VERSION_NUM;
const LUA_VERSION_RELEASE = defs.LUA_VERSION_RELEASE;
const LUA_YIELD = defs.thread_status.LUA_YIELD;
const lua_Debug = defs.lua_Debug;
const lua_upvalueindex = defs.lua_upvalueindex;
const lua_absindex = lapi.lua_absindex;
const lua_arith = lapi.lua_arith;
const lua_atpanic = lapi.lua_atpanic;
const lua_atnativeerror = lapi.lua_atnativeerror;
const lua_call = lapi.lua_call;
const lua_callk = lapi.lua_callk;
const lua_checkstack = lapi.lua_checkstack;
const lua_close = lstate.lua_close;
const lua_compare = lapi.lua_compare;
const lua_concat = lapi.lua_concat;
const lua_copy = lapi.lua_copy;
const lua_createtable = lapi.lua_createtable;
const lua_dump = lapi.lua_dump;
const lua_error = lapi.lua_error;
const lua_gc = lapi.lua_gc;
const lua_getallocf = lapi.lua_getallocf;
const lua_getextraspace = lapi.lua_getextraspace;
const lua_getfield = lapi.lua_getfield;
const lua_getglobal = lapi.lua_getglobal;
const lua_gethook = ldebug.lua_gethook;
const lua_gethookcount = ldebug.lua_gethookcount;
const lua_gethookmask = ldebug.lua_gethookmask;
const lua_geti = lapi.lua_geti;
const lua_getinfo = ldebug.lua_getinfo;
const lua_getlocal = ldebug.lua_getlocal;
const lua_getmetatable = lapi.lua_getmetatable;
const lua_getstack = ldebug.lua_getstack;
const lua_gettable = lapi.lua_gettable;
const lua_gettop = lapi.lua_gettop;
const lua_getupvalue = lapi.lua_getupvalue;
const lua_getuservalue = lapi.lua_getuservalue;
const lua_insert = lapi.lua_insert;
const lua_isboolean = lapi.lua_isboolean;
const lua_iscfunction = lapi.lua_iscfunction;
const lua_isfunction = lapi.lua_isfunction;
const lua_isinteger = lapi.lua_isinteger;
const lua_islightuserdata = lapi.lua_islightuserdata;
const lua_isnil = lapi.lua_isnil;
const lua_isnone = lapi.lua_isnone;
const lua_isnoneornil = lapi.lua_isnoneornil;
const lua_isnumber = lapi.lua_isnumber;
const lua_isproxy = lapi.lua_isproxy;
const lua_isstring = lapi.lua_isstring;
const lua_istable = lapi.lua_istable;
const lua_isthread = lapi.lua_isthread;
const lua_isuserdata = lapi.lua_isuserdata;
const lua_isyieldable = ldo.lua_isyieldable;
const lua_len = lapi.lua_len;
const lua_load = lapi.lua_load;
const lua_newstate = lstate.lua_newstate;
const lua_newtable = lapi.lua_newtable;
const lua_newthread = lstate.lua_newthread;
const lua_newuserdata = lapi.lua_newuserdata;
const lua_next = lapi.lua_next;
const lua_pcall = lapi.lua_pcall;
const lua_pcallk = lapi.lua_pcallk;
const lua_pop = lapi.lua_pop;
const lua_pushboolean = lapi.lua_pushboolean;
const lua_pushcclosure = lapi.lua_pushcclosure;
const lua_pushcfunction = lapi.lua_pushcfunction;
const lua_pushfstring = lapi.lua_pushfstring;
const lua_pushglobaltable = lapi.lua_pushglobaltable;
const lua_pushinteger = lapi.lua_pushinteger;
const lua_pushjsclosure = lapi.lua_pushjsclosure;
const lua_pushjsfunction = lapi.lua_pushjsfunction;
const lua_pushlightuserdata = lapi.lua_pushlightuserdata;
const lua_pushliteral = lapi.lua_pushliteral;
const lua_pushlstring = lapi.lua_pushlstring;
const lua_pushnil = lapi.lua_pushnil;
const lua_pushnumber = lapi.lua_pushnumber;
const lua_pushstring = lapi.lua_pushstring;
const lua_pushthread = lapi.lua_pushthread;
const lua_pushvalue = lapi.lua_pushvalue;
const lua_pushvfstring = lapi.lua_pushvfstring;
const lua_rawequal = lapi.lua_rawequal;
const lua_rawget = lapi.lua_rawget;
const lua_rawgeti = lapi.lua_rawgeti;
const lua_rawgetp = lapi.lua_rawgetp;
const lua_rawlen = lapi.lua_rawlen;
const lua_rawset = lapi.lua_rawset;
const lua_rawseti = lapi.lua_rawseti;
const lua_rawsetp = lapi.lua_rawsetp;
const lua_register = lapi.lua_register;
const lua_remove = lapi.lua_remove;
const lua_replace = lapi.lua_replace;
const lua_resume = ldo.lua_resume;
const lua_rotate = lapi.lua_rotate;
const lua_setallocf = lapi.lua_setallocf;
const lua_setfield = lapi.lua_setfield;
const lua_setglobal = lapi.lua_setglobal;
const lua_sethook = ldebug.lua_sethook;
const lua_seti = lapi.lua_seti;
const lua_setlocal = ldebug.lua_setlocal;
const lua_setmetatable = lapi.lua_setmetatable;
const lua_settable = lapi.lua_settable;
const lua_settop = lapi.lua_settop;
const lua_setupvalue = lapi.lua_setupvalue;
const lua_setuservalue = lapi.lua_setuservalue;
const lua_status = lapi.lua_status;
const lua_stringtonumber = lapi.lua_stringtonumber;
const lua_toboolean = lapi.lua_toboolean;
const lua_todataview = lapi.lua_todataview;
const lua_tointeger = lapi.lua_tointeger;
const lua_tointegerx = lapi.lua_tointegerx;
const lua_tojsstring = lapi.lua_tojsstring;
const lua_tolstring = lapi.lua_tolstring;
const lua_tonumber = lapi.lua_tonumber;
const lua_tonumberx = lapi.lua_tonumberx;
const lua_topointer = lapi.lua_topointer;
const lua_toproxy = lapi.lua_toproxy;
const lua_tostring = lapi.lua_tostring;
const lua_tothread = lapi.lua_tothread;
const lua_touserdata = lapi.lua_touserdata;
const lua_type = lapi.lua_type;
const lua_typename = lapi.lua_typename;
const lua_upvalueid = lapi.lua_upvalueid;
const lua_upvaluejoin = lapi.lua_upvaluejoin;
const lua_version = lapi.lua_version;
const lua_xmove = lapi.lua_xmove;
const lua_yield = ldo.lua_yield;
const lua_yieldk = ldo.lua_yieldk;
const lua_tocfunction = lapi.lua_tocfunction;

export {
    LUA_AUTHORS,
    LUA_COPYRIGHT,
    LUA_ERRERR,
    LUA_ERRGCMM,
    LUA_ERRMEM,
    LUA_ERRRUN,
    LUA_ERRSYNTAX,
    LUA_HOOKCALL,
    LUA_HOOKCOUNT,
    LUA_HOOKLINE,
    LUA_HOOKRET,
    LUA_HOOKTAILCALL,
    LUA_MASKCALL,
    LUA_MASKCOUNT,
    LUA_MASKLINE,
    LUA_MASKRET,
    LUA_MINSTACK,
    LUA_MULTRET,
    LUA_NUMTAGS,
    LUA_OK,
    LUA_OPADD,
    LUA_OPBAND,
    LUA_OPBNOT,
    LUA_OPBOR,
    LUA_OPBXOR,
    LUA_OPDIV,
    LUA_OPEQ,
    LUA_OPIDIV,
    LUA_OPLE,
    LUA_OPLT,
    LUA_OPMOD,
    LUA_OPMUL,
    LUA_OPPOW,
    LUA_OPSHL,
    LUA_OPSHR,
    LUA_OPSUB,
    LUA_OPUNM,
    LUA_REGISTRYINDEX,
    LUA_RELEASE,
    LUA_RIDX_GLOBALS,
    LUA_RIDX_LAST,
    LUA_RIDX_MAINTHREAD,
    LUA_SIGNATURE,
    LUA_TNONE,
    LUA_TNIL,
    LUA_TBOOLEAN,
    LUA_TLIGHTUSERDATA,
    LUA_TNUMBER,
    LUA_TSTRING,
    LUA_TTABLE,
    LUA_TFUNCTION,
    LUA_TUSERDATA,
    LUA_TTHREAD,
    LUA_VERSION,
    LUA_VERSION_MAJOR,
    LUA_VERSION_MINOR,
    LUA_VERSION_NUM,
    LUA_VERSION_RELEASE,
    LUA_YIELD,
    lua_Debug,
    lua_upvalueindex,
    lua_absindex,
    lua_arith,
    lua_atpanic,
    lua_atnativeerror,
    lua_call,
    lua_callk,
    lua_checkstack,
    lua_close,
    lua_compare,
    lua_concat,
    lua_copy,
    lua_createtable,
    lua_dump,
    lua_error,
    lua_gc,
    lua_getallocf,
    lua_getextraspace,
    lua_getfield,
    lua_getglobal,
    lua_gethook,
    lua_gethookcount,
    lua_gethookmask,
    lua_geti,
    lua_getinfo,
    lua_getlocal,
    lua_getmetatable,
    lua_getstack,
    lua_gettable,
    lua_gettop,
    lua_getupvalue,
    lua_getuservalue,
    lua_insert,
    lua_isboolean,
    lua_iscfunction,
    lua_isfunction,
    lua_isinteger,
    lua_islightuserdata,
    lua_isnil,
    lua_isnone,
    lua_isnoneornil,
    lua_isnumber,
    lua_isproxy,
    lua_isstring,
    lua_istable,
    lua_isthread,
    lua_isuserdata,
    lua_isyieldable,
    lua_len,
    lua_load,
    lua_newstate,
    lua_newtable,
    lua_newthread,
    lua_newuserdata,
    lua_next,
    lua_pcall,
    lua_pcallk,
    lua_pop,
    lua_pushboolean,
    lua_pushcclosure,
    lua_pushcfunction,
    lua_pushfstring,
    lua_pushglobaltable,
    lua_pushinteger,
    lua_pushjsclosure,
    lua_pushjsfunction,
    lua_pushlightuserdata,
    lua_pushliteral,
    lua_pushlstring,
    lua_pushnil,
    lua_pushnumber,
    lua_pushstring,
    lua_pushthread,
    lua_pushvalue,
    lua_pushvfstring,
    lua_rawequal,
    lua_rawget,
    lua_rawgeti,
    lua_rawgetp,
    lua_rawlen,
    lua_rawset,
    lua_rawseti,
    lua_rawsetp,
    lua_register,
    lua_remove,
    lua_replace,
    lua_resume,
    lua_rotate,
    lua_setallocf,
    lua_setfield,
    lua_setglobal,
    lua_sethook,
    lua_seti,
    lua_setlocal,
    lua_setmetatable,
    lua_settable,
    lua_settop,
    lua_setupvalue,
    lua_setuservalue,
    lua_status,
    lua_stringtonumber,
    lua_toboolean,
    lua_todataview,
    lua_tointeger,
    lua_tointegerx,
    lua_tojsstring,
    lua_tolstring,
    lua_tonumber,
    lua_tonumberx,
    lua_topointer,
    lua_toproxy,
    lua_tostring,
    lua_tothread,
    lua_touserdata,
    lua_type,
    lua_typename,
    lua_upvalueid,
    lua_upvaluejoin,
    lua_version,
    lua_xmove,
    lua_yield,
    lua_yieldk,
    lua_tocfunction,
};
