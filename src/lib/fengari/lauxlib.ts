import { LUAL_BUFFERSIZE } from './luaconf.js';
import {
    LUA_ERRERR,
    LUA_MULTRET,
    LUA_REGISTRYINDEX,
    LUA_TBOOLEAN,
    LUA_TLIGHTUSERDATA,
    LUA_TNIL,
    LUA_TNONE,
    LUA_TNUMBER,
    LUA_TSTRING,
    LUA_TTABLE,
    LUA_VERSION_NUM,
    lua_Debug,
    lua_absindex,
    lua_atpanic,
    lua_call,
    lua_checkstack,
    lua_concat,
    lua_copy,
    lua_createtable,
    lua_error,
    lua_getfield,
    lua_getinfo,
    lua_getmetatable,
    lua_getstack,
    lua_gettop,
    lua_insert,
    lua_isinteger,
    lua_isnil,
    lua_isnumber,
    lua_isstring,
    lua_istable,
    lua_len,
    lua_load,
    lua_newstate,
    lua_newtable,
    lua_next,
    lua_pcall,
    lua_pop,
    lua_pushboolean,
    lua_pushcclosure,
    lua_pushcfunction,
    lua_pushfstring,
    lua_pushinteger,
    lua_pushliteral,
    lua_pushlstring,
    lua_pushnil,
    lua_pushstring,
    lua_pushvalue,
    lua_pushvfstring,
    lua_rawequal,
    lua_rawget,
    lua_rawgeti,
    lua_rawlen,
    lua_rawseti,
    lua_remove,
    lua_setfield,
    lua_setglobal,
    lua_setmetatable,
    lua_settop,
    lua_toboolean,
    lua_tointeger,
    lua_tointegerx,
    lua_tojsstring,
    lua_tolstring,
    lua_tonumber,
    lua_tonumberx,
    lua_topointer,
    lua_tostring,
    lua_touserdata,
    lua_type,
    lua_typename,
    lua_version,
} from './lua.js';
import {
    from_userstring,
    luastring_eq,
    to_jsstring,
    to_luastring,
} from './fengaricore.js';
import { requireModule } from './platform.js';
import type { lua_State } from './lstate.js';

type LuaCFunction = (L: lua_State) => number;
type LuaDebug = InstanceType<typeof lua_Debug>;
type FsReadModule = { readFileSync: (path: string) => Uint8Array };

/* extra error code for 'luaL_loadfilex' */
const LUA_ERRFILE = LUA_ERRERR + 1;

/* key, in the registry, for table of loaded modules */
const LUA_LOADED_TABLE = to_luastring('_LOADED');

/* key, in the registry, for table of preloaded loaders */
const LUA_PRELOAD_TABLE = to_luastring('_PRELOAD');

const LUA_FILEHANDLE = to_luastring('FILE*');

const LUAL_NUMSIZES = 4 * 16 + 8;

const __name = to_luastring('__name');
const __tostring = to_luastring('__tostring');

const empty = new Uint8Array(0);

class luaL_Buffer {
    L: lua_State | null;
    b: Uint8Array;
    n: number;

    constructor() {
        this.L = null;
        this.b = empty;
        this.n = 0;
    }
}

const LEVELS1 = 10; /* size of the first part of the stack */
const LEVELS2 = 11; /* size of the second part of the stack */

/*
 ** search for 'objidx' in table at index -1.
 ** return 1 + string at top if find a good name.
 */
const findfield = function (
    L: lua_State,
    objidx: number,
    level: number,
): number {
    if (level === 0 || !lua_istable(L, -1)) return 0; /* not found */

    lua_pushnil(L); /* start 'next' loop */

    while (lua_next(L, -2)) {
        /* for each pair in table */
        if (lua_type(L, -2) === LUA_TSTRING) {
            /* ignore non-string keys */
            if (lua_rawequal(L, objidx, -1)) {
                /* found object? */
                lua_pop(L, 1); /* remove value (but keep name) */
                return 1;
            } else if (findfield(L, objidx, level - 1)) {
                /* try recursively */
                lua_remove(L, -2); /* remove table (but keep name) */
                lua_pushliteral(L, '.');
                lua_insert(L, -2); /* place '.' between the two names */
                lua_concat(L, 3);
                return 1;
            }
        }
        lua_pop(L, 1); /* remove value */
    }

    return 0; /* not found */
};

/*
 ** Search for a name for a function in all loaded modules
 */
const pushglobalfuncname = function (L: lua_State, ar: LuaDebug): number {
    let top = lua_gettop(L);
    lua_getinfo(L, to_luastring('f'), ar); /* push function */
    lua_getfield(L, LUA_REGISTRYINDEX, LUA_LOADED_TABLE);
    if (findfield(L, top + 1, 2)) {
        let name = lua_tostring(L, -1)!;
        if (
            name[0] === 95 /* '_'.charCodeAt(0) */ &&
            name[1] === 71 /* 'G'.charCodeAt(0) */ &&
            name[2] === 46 /* '.'.charCodeAt(0) */
        ) {
            /* name start with '_G.'? */
            lua_pushstring(L, name.subarray(3)); /* push name without prefix */
            lua_remove(L, -2); /* remove original name */
        }
        lua_copy(L, -1, top + 1); /* move name to proper place */
        lua_pop(L, 2); /* remove pushed values */
        return 1;
    } else {
        lua_settop(L, top); /* remove function and global table */
        return 0;
    }
};

const pushfuncname = function (L: lua_State, ar: LuaDebug): void {
    if (pushglobalfuncname(L, ar)) {
        /* try first a global name */
        lua_pushfstring(L, to_luastring("function '%s'"), lua_tostring(L, -1)!);
        lua_remove(L, -2); /* remove name */
    } else if (ar.namewhat && ar.namewhat.length !== 0)
        /* is there a name from code? */
        lua_pushfstring(
            L,
            to_luastring("%s '%s'"),
            ar.namewhat,
            ar.name,
        ); /* use it */
    else if (ar.what && ar.what[0] === 109 /* 'm' */)
        /* main? */
        lua_pushliteral(L, 'main chunk');
    else if (ar.what && ar.what[0] === 76 /* 'L' */)
        /* for Lua functions, use <file:line> */
        lua_pushfstring(
            L,
            to_luastring('function <%s:%d>'),
            ar.short_src,
            ar.linedefined,
        );
    else /* nothing left... */ lua_pushliteral(L, '?');
};

const lastlevel = function (L: lua_State): number {
    let ar = new lua_Debug();
    let li = 1;
    let le = 1;
    /* find an upper bound */
    while (lua_getstack(L, le, ar)) {
        li = le;
        le *= 2;
    }
    /* do a binary search */
    while (li < le) {
        let m = Math.floor((li + le) / 2);
        if (lua_getstack(L, m, ar)) li = m + 1;
        else le = m;
    }
    return le - 1;
};

const luaL_traceback = function (
    L: lua_State,
    L1: lua_State,
    msg: Uint8Array | null,
    level: number,
): void {
    let ar = new lua_Debug();
    let top = lua_gettop(L);
    let last = lastlevel(L1);
    let n1 = last - level > LEVELS1 + LEVELS2 ? LEVELS1 : -1;
    if (msg) lua_pushfstring(L, to_luastring('%s\n'), msg);
    luaL_checkstack(L, 10, null);
    lua_pushliteral(L, 'stack traceback:');
    while (lua_getstack(L1, level++, ar)) {
        if (n1-- === 0) {
            /* too many levels? */
            lua_pushliteral(L, '\n\t...'); /* add a '...' */
            level = last - LEVELS2 + 1; /* and skip to last ones */
        } else {
            lua_getinfo(L1, to_luastring('Slnt', true), ar);
            lua_pushfstring(L, to_luastring('\n\t%s:'), ar.short_src);
            if (ar.currentline > 0) lua_pushliteral(L, `${ar.currentline}:`);
            lua_pushliteral(L, ' in ');
            pushfuncname(L, ar);
            if (ar.istailcall) lua_pushliteral(L, '\n\t(...tail calls..)');
            lua_concat(L, lua_gettop(L) - top);
        }
    }
    lua_concat(L, lua_gettop(L) - top);
};

const panic = function (L: lua_State): never {
    let msg =
        'PANIC: unprotected error in call to Lua API (' +
        lua_tojsstring(L, -1) +
        ')';
    throw new Error(msg);
};

const luaL_argerror = function (
    L: lua_State,
    arg: number,
    extramsg: Uint8Array,
): number {
    let ar = new lua_Debug();

    if (!lua_getstack(L, 0, ar))
        /* no stack frame? */
        return luaL_error(
            L,
            to_luastring('bad argument #%d (%s)'),
            arg,
            extramsg,
        );

    lua_getinfo(L, to_luastring('n'), ar);

    if (
        ar.namewhat !== null &&
        luastring_eq(ar.namewhat, to_luastring('method', true))
    ) {
        arg--; /* do not count 'self' */
        if (arg === 0)
            /* error is in the self argument itself? */
            return luaL_error(
                L,
                to_luastring("calling '%s' on bad self (%s)"),
                ar.name,
                extramsg,
            );
    }

    if (ar.name === null)
        ar.name = pushglobalfuncname(L, ar)
            ? lua_tostring(L, -1)!
            : to_luastring('?', true);

    return luaL_error(
        L,
        to_luastring("bad argument #%d to '%s' (%s)"),
        arg,
        ar.name,
        extramsg,
    );
};

const typeerror = function (
    L: lua_State,
    arg: number,
    tname: Uint8Array,
): number {
    let typearg;
    if (luaL_getmetafield(L, arg, __name) === LUA_TSTRING)
        typearg = lua_tostring(L, -1)!;
    else if (lua_type(L, arg) === LUA_TLIGHTUSERDATA)
        typearg = to_luastring('light userdata', true);
    else typearg = luaL_typename(L, arg);

    let msg = lua_pushfstring(
        L,
        to_luastring('%s expected, got %s'),
        tname,
        typearg,
    );
    return luaL_argerror(L, arg, msg);
};

const luaL_where = function (L: lua_State, level: number): void {
    let ar = new lua_Debug();
    if (lua_getstack(L, level, ar)) {
        lua_getinfo(L, to_luastring('Sl', true), ar);
        if (ar.currentline > 0) {
            lua_pushfstring(
                L,
                to_luastring('%s:%d: '),
                ar.short_src,
                ar.currentline,
            );
            return;
        }
    }
    lua_pushstring(L, to_luastring(''));
};

const luaL_error = function (
    L: lua_State,
    fmt: Uint8Array,
    ...argp: unknown[]
): number {
    luaL_where(L, 1);
    lua_pushvfstring(L, fmt, argp);
    lua_concat(L, 2);
    lua_error(L);
    return 0;
};

/* Unlike normal lua, we pass in an error object */
const luaL_fileresult = function (
    L: lua_State,
    stat: boolean | number,
    fname: Uint8Array | null,
    e?: { message?: string; errno?: number } | null,
): number {
    if (stat) {
        lua_pushboolean(L, true);
        return 1;
    } else {
        lua_pushnil(L);
        const message = e?.message ?? 'Success';
        const errnoValue = e?.errno ?? 0;
        const errno = e ? -errnoValue : 0;
        if (fname)
            lua_pushfstring(
                L,
                to_luastring('%s: %s'),
                fname,
                to_luastring(message),
            );
        else lua_pushstring(L, to_luastring(message));
        lua_pushinteger(L, errno);
        return 3;
    }
};

/* Unlike normal lua, we pass in an error object */
const luaL_execresult = function (
    L: lua_State,
    e: {
        status?: number;
        signal?: number;
        message?: string;
        errno?: number;
    } | null,
): number {
    let what: string;
    let stat: number;
    if (e === null) {
        lua_pushboolean(L, true);
        lua_pushliteral(L, 'exit');
        lua_pushinteger(L, 0);
        return 3;
    } else if (e.status) {
        what = 'exit';
        stat = e.status;
    } else if (e.signal) {
        what = 'signal';
        stat = e.signal;
    } else {
        /* XXX: node seems to have e.errno as a string instead of a number */
        return luaL_fileresult(L, 0, null, e);
    }
    lua_pushnil(L);
    lua_pushliteral(L, what);
    lua_pushinteger(L, stat);
    return 3;
};

const luaL_getmetatable = function (L: lua_State, n: Uint8Array): number {
    return lua_getfield(L, LUA_REGISTRYINDEX, n);
};

const luaL_newmetatable = function (L: lua_State, tname: Uint8Array): number {
    if (luaL_getmetatable(L, tname) !== LUA_TNIL)
        /* name already in use? */
        return 0; /* leave previous value on top, but return 0 */
    lua_pop(L, 1);
    lua_createtable(L, 0, 2); /* create metatable */
    lua_pushstring(L, tname);
    lua_setfield(L, -2, __name); /* metatable.__name = tname */
    lua_pushvalue(L, -1);
    lua_setfield(L, LUA_REGISTRYINDEX, tname); /* registry.name = metatable */
    return 1;
};

const luaL_setmetatable = function (L: lua_State, tname: Uint8Array): void {
    luaL_getmetatable(L, tname);
    lua_setmetatable(L, -2);
};

const luaL_testudata = function (
    L: lua_State,
    ud: number,
    tname: Uint8Array,
): unknown | null {
    let p = lua_touserdata(L, ud);
    if (p !== null) {
        /* value is a userdata? */
        if (lua_getmetatable(L, ud)) {
            /* does it have a metatable? */
            luaL_getmetatable(L, tname); /* get correct metatable */
            if (!lua_rawequal(L, -1, -2))
                /* not the same? */
                p = null; /* value is a userdata with wrong metatable */
            lua_pop(L, 2); /* remove both metatables */
            return p;
        }
    }
    return null; /* value is not a userdata with a metatable */
};

const luaL_checkudata = function (
    L: lua_State,
    ud: number,
    tname: Uint8Array,
): unknown {
    let p = luaL_testudata(L, ud, tname);
    if (p === null) typeerror(L, ud, tname);
    return p;
};

const luaL_checkoption = function (
    L: lua_State,
    arg: number,
    def: string | Uint8Array | null,
    lst: Uint8Array[],
): number {
    let name =
        def !== null ? luaL_optstring(L, arg, def) : luaL_checkstring(L, arg);
    name = name ?? to_luastring('');
    for (let i = 0; i < lst.length; i++) {
        const option = lst[i]!;
        if (luastring_eq(option, name)) return i;
    }
    return luaL_argerror(
        L,
        arg,
        lua_pushfstring(L, to_luastring("invalid option '%s'"), name),
    );
};

const tag_error = function (L: lua_State, arg: number, tag: number): void {
    typeerror(L, arg, lua_typename(L, tag));
};

const luaL_newstate = function (): lua_State | null {
    let L = lua_newstate();
    if (L) lua_atpanic(L, panic);
    return L;
};

const luaL_typename = function (L: lua_State, i: number): Uint8Array {
    return lua_typename(L, lua_type(L, i));
};

const luaL_argcheck = function (
    L: lua_State,
    cond: boolean,
    arg: number,
    extramsg: Uint8Array | string,
): void {
    if (!cond)
        luaL_argerror(
            L,
            arg,
            typeof extramsg === 'string' ? to_luastring(extramsg) : extramsg,
        );
};

const luaL_checkany = function (L: lua_State, arg: number): void {
    if (lua_type(L, arg) === LUA_TNONE)
        luaL_argerror(L, arg, to_luastring('value expected', true));
};

const luaL_checktype = function (L: lua_State, arg: number, t: number): void {
    if (lua_type(L, arg) !== t) tag_error(L, arg, t);
};

const luaL_checklstring = function (L: lua_State, arg: number): Uint8Array {
    let s = lua_tolstring(L, arg);
    if (s === null || s === undefined) tag_error(L, arg, LUA_TSTRING);
    return s!;
};

const luaL_checkstring = luaL_checklstring;

const luaL_optlstring = function (
    L: lua_State,
    arg: number,
    def: Uint8Array | string | null,
): Uint8Array | null {
    if (lua_type(L, arg) <= 0) {
        return def === null ? null : from_userstring(def);
    } else return luaL_checklstring(L, arg);
};

const luaL_optstring = luaL_optlstring;

const interror = function (L: lua_State, arg: number): void {
    if (lua_isnumber(L, arg))
        luaL_argerror(
            L,
            arg,
            to_luastring('number has no integer representation', true),
        );
    else tag_error(L, arg, LUA_TNUMBER);
};

const luaL_checknumber = function (L: lua_State, arg: number): number {
    let d = lua_tonumberx(L, arg);
    if (d === false) tag_error(L, arg, LUA_TNUMBER);
    return d as number;
};

const luaL_optnumber = function (
    L: lua_State,
    arg: number,
    def: number,
): number {
    return luaL_opt(L, luaL_checknumber, arg, def);
};

const luaL_checkinteger = function (L: lua_State, arg: number): number {
    let d = lua_tointegerx(L, arg);
    if (d === false) interror(L, arg);
    return d as number;
};

const luaL_optinteger = function (
    L: lua_State,
    arg: number,
    def: number,
): number {
    return luaL_opt(L, luaL_checkinteger, arg, def);
};

const luaL_prepbuffsize = function (B: luaL_Buffer, sz: number): Uint8Array {
    let newend = B.n + sz;
    if (B.b.length < newend) {
        let newsize = Math.max(B.b.length * 2, newend); /* double buffer size */
        let newbuff = new Uint8Array(newsize); /* create larger buffer */
        newbuff.set(B.b); /* copy original content */
        B.b = newbuff;
    }
    return B.b.subarray(B.n, newend);
};

const luaL_buffinit = function (L: lua_State, B: luaL_Buffer): void {
    B.L = L;
    B.b = empty;
};

const luaL_buffinitsize = function (
    L: lua_State,
    B: luaL_Buffer,
    sz: number,
): Uint8Array {
    luaL_buffinit(L, B);
    return luaL_prepbuffsize(B, sz);
};

const luaL_prepbuffer = function (B: luaL_Buffer): Uint8Array {
    return luaL_prepbuffsize(B, LUAL_BUFFERSIZE);
};

const luaL_addlstring = function (
    B: luaL_Buffer,
    s: Uint8Array,
    l: number,
): void {
    if (l > 0) {
        s = from_userstring(s);
        let b = luaL_prepbuffsize(B, l);
        b.set(s.subarray(0, l));
        luaL_addsize(B, l);
    }
};

const luaL_addstring = function (B: luaL_Buffer, s: Uint8Array | string): void {
    s = from_userstring(s);
    luaL_addlstring(B, s, s.length);
};

const luaL_pushresult = function (B: luaL_Buffer): void {
    const L = B.L!;
    lua_pushlstring(L, B.b, B.n);
    /* delete old buffer */
    B.n = 0;
    B.b = empty;
};

const luaL_addchar = function (B: luaL_Buffer, c: number): void {
    luaL_prepbuffsize(B, 1);
    B.b[B.n++] = c;
};

const luaL_addsize = function (B: luaL_Buffer, s: number): void {
    B.n += s;
};

const luaL_pushresultsize = function (B: luaL_Buffer, sz: number): void {
    luaL_addsize(B, sz);
    luaL_pushresult(B);
};

const luaL_addvalue = function (B: luaL_Buffer): void {
    let L = B.L!;
    let s = lua_tostring(L, -1)!;
    luaL_addlstring(B, s, s.length);
    lua_pop(L, 1); /* remove value */
};

const luaL_opt = function <T>(
    L: lua_State,
    f: (L: lua_State, n: number) => T,
    n: number,
    d: T,
): T {
    return lua_type(L, n) <= 0 ? d : f(L, n);
};

const getS = function (_L: lua_State, ud: unknown): Uint8Array | null {
    const data = ud as { string: Uint8Array | null };
    let s = data.string;
    data.string = null;
    return s;
};

const luaL_loadbufferx = function (
    L: lua_State,
    buff: Uint8Array,
    size: number,
    name: Uint8Array | string,
    mode: Uint8Array | string | null,
): number {
    const chunkname = typeof name === 'string' ? to_luastring(name) : name;
    const loadMode = typeof mode === 'string' ? to_luastring(mode) : mode;
    return lua_load(L, getS, { string: buff }, chunkname, loadMode);
};

const luaL_loadbuffer = function (
    L: lua_State,
    s: Uint8Array,
    sz: number,
    n: Uint8Array | string,
): number {
    return luaL_loadbufferx(L, s, sz, n, null);
};

const luaL_loadstring = function (L: lua_State, s: Uint8Array): number {
    return luaL_loadbuffer(L, s, s.length, s);
};

const luaL_dostring = function (L: lua_State, s: Uint8Array): number {
    return luaL_loadstring(L, s) || lua_pcall(L, 0, LUA_MULTRET, 0);
};

const luaL_getmetafield = function (
    L: lua_State,
    obj: number,
    event: Uint8Array,
): number {
    if (!lua_getmetatable(L, obj)) /* no metatable? */ return LUA_TNIL;
    else {
        lua_pushstring(L, event);
        let tt = lua_rawget(L, -2);
        if (tt === LUA_TNIL)
            /* is metafield nil? */
            lua_pop(L, 2); /* remove metatable and metafield */
        else lua_remove(L, -2); /* remove only metatable */
        return tt; /* return metafield type */
    }
};

const luaL_callmeta = function (
    L: lua_State,
    obj: number,
    event: Uint8Array,
): boolean {
    obj = lua_absindex(L, obj);
    if (luaL_getmetafield(L, obj, event) === LUA_TNIL) return false;

    lua_pushvalue(L, obj);
    lua_call(L, 1, 1);

    return true;
};

const luaL_len = function (L: lua_State, idx: number): number {
    lua_len(L, idx);
    let l = lua_tointegerx(L, -1);
    if (l === false)
        luaL_error(L, to_luastring('object length is not an integer', true));
    lua_pop(L, 1); /* remove object */
    return l as number;
};

const p_I = to_luastring('%I');
const p_f = to_luastring('%f');
const luaL_tolstring = function (L: lua_State, idx: number): Uint8Array {
    if (luaL_callmeta(L, idx, __tostring)) {
        if (!lua_isstring(L, -1))
            luaL_error(L, to_luastring("'__tostring' must return a string"));
    } else {
        let t = lua_type(L, idx);
        switch (t) {
            case LUA_TNUMBER: {
                if (lua_isinteger(L, idx))
                    lua_pushfstring(L, p_I, lua_tointeger(L, idx));
                else lua_pushfstring(L, p_f, lua_tonumber(L, idx));
                break;
            }
            case LUA_TSTRING:
                lua_pushvalue(L, idx);
                break;
            case LUA_TBOOLEAN:
                lua_pushliteral(L, lua_toboolean(L, idx) ? 'true' : 'false');
                break;
            case LUA_TNIL:
                lua_pushliteral(L, 'nil');
                break;
            default: {
                let tt = luaL_getmetafield(L, idx, __name);
                let kind =
                    tt === LUA_TSTRING
                        ? lua_tostring(L, -1)!
                        : luaL_typename(L, idx);
                lua_pushfstring(
                    L,
                    to_luastring('%s: %p'),
                    kind,
                    lua_topointer(L, idx),
                );
                if (tt !== LUA_TNIL) lua_remove(L, -2);
                break;
            }
        }
    }

    return lua_tolstring(L, -1)!;
};

/*
 ** Stripped-down 'require': After checking "loaded" table, calls 'openf'
 ** to open a module, registers the result in 'package.loaded' table and,
 ** if 'glb' is true, also registers the result in the global table.
 ** Leaves resulting module on the top.
 */
const luaL_requiref = function (
    L: lua_State,
    modname: Uint8Array,
    openf: LuaCFunction,
    glb: number,
): void {
    luaL_getsubtable(L, LUA_REGISTRYINDEX, LUA_LOADED_TABLE);
    lua_getfield(L, -1, modname); /* LOADED[modname] */
    if (!lua_toboolean(L, -1)) {
        /* package not already loaded? */
        lua_pop(L, 1); /* remove field */
        lua_pushcfunction(L, openf);
        lua_pushstring(L, modname); /* argument to open function */
        lua_call(L, 1, 1); /* call 'openf' to open module */
        lua_pushvalue(L, -1); /* make copy of module (call result) */
        lua_setfield(L, -3, modname); /* LOADED[modname] = module */
    }
    lua_remove(L, -2); /* remove LOADED table */
    if (glb) {
        lua_pushvalue(L, -1); /* copy of module */
        lua_setglobal(L, modname); /* _G[modname] = module */
    }
};

const find_subarray = function (
    arr: Uint8Array,
    subarr: Uint8Array,
    from_index?: number,
): number {
    let i = (from_index ?? 0) >>> 0,
        sl = subarr.length,
        l = arr.length + 1 - sl;

    loop: for (; i < l; i++) {
        for (let j = 0; j < sl; j++)
            if (arr[i + j] !== subarr[j]) continue loop;
        return i;
    }
    return -1;
};

const luaL_gsub = function (
    L: lua_State,
    s: Uint8Array,
    p: Uint8Array,
    r: Uint8Array,
): Uint8Array {
    let wild;
    let b = new luaL_Buffer();
    luaL_buffinit(L, b);
    while ((wild = find_subarray(s, p)) >= 0) {
        luaL_addlstring(b, s, wild); /* push prefix */
        luaL_addstring(b, r); /* push replacement in place of pattern */
        s = s.subarray(wild + p.length); /* continue after 'p' */
    }
    luaL_addstring(b, s); /* push last suffix */
    luaL_pushresult(b);
    return lua_tostring(L, -1)!;
};

/*
 ** ensure that stack[idx][fname] has a table and push that table
 ** into the stack
 */
const luaL_getsubtable = function (
    L: lua_State,
    idx: number,
    fname: Uint8Array,
): boolean {
    if (lua_getfield(L, idx, fname) === LUA_TTABLE)
        return true; /* table already there */
    else {
        lua_pop(L, 1); /* remove previous result */
        idx = lua_absindex(L, idx);
        lua_newtable(L);
        lua_pushvalue(L, -1); /* copy to be left at top */
        lua_setfield(L, idx, fname); /* assign new table to field */
        return false; /* false, because did not find table there */
    }
};

/*
 ** set functions from list 'l' into table at top - 'nup'; each
 ** function gets the 'nup' elements at the top as upvalues.
 ** Returns with only the table at the stack.
 */
const luaL_setfuncs = function (
    L: lua_State,
    l: Record<string, LuaCFunction>,
    nup: number,
): void {
    luaL_checkstack(L, nup, to_luastring('too many upvalues', true));
    for (let lib in l) {
        /* fill the table with given functions */
        for (let i = 0; i < nup; i++)
            /* copy upvalues to the top */
            lua_pushvalue(L, -nup);
        const fn = l[lib]!;
        lua_pushcclosure(L, fn, nup); /* closure with those upvalues */
        lua_setfield(L, -(nup + 2), to_luastring(lib));
    }
    lua_pop(L, nup); /* remove upvalues */
};

/*
 ** Ensures the stack has at least 'space' extra slots, raising an error
 ** if it cannot fulfill the request. (The error handling needs a few
 ** extra slots to format the error message. In case of an error without
 ** this extra space, Lua will generate the same 'stack overflow' error,
 ** but without 'msg'.)
 */
const luaL_checkstack = function (
    L: lua_State,
    space: number,
    msg: Uint8Array | string | null,
): void {
    if (!lua_checkstack(L, space)) {
        if (msg) luaL_error(L, to_luastring('stack overflow (%s)'), msg);
        else luaL_error(L, to_luastring('stack overflow', true));
    }
};

const luaL_newlibtable = function (L: lua_State): void {
    lua_createtable(L);
};

const luaL_newlib = function (
    L: lua_State,
    l: Record<string, LuaCFunction>,
): void {
    lua_createtable(L);
    luaL_setfuncs(L, l, 0);
};

/* predefined references */
const LUA_NOREF = -2;
const LUA_REFNIL = -1;

const luaL_ref = function (L: lua_State, t: number): number {
    let ref;
    if (lua_isnil(L, -1)) {
        lua_pop(L, 1); /* remove from stack */
        return LUA_REFNIL; /* 'nil' has a unique fixed reference */
    }
    t = lua_absindex(L, t);
    lua_rawgeti(L, t, 0); /* get first free element */
    ref = lua_tointeger(L, -1); /* ref = t[freelist] */
    lua_pop(L, 1); /* remove it from stack */
    if (ref !== 0) {
        /* any free element? */
        lua_rawgeti(L, t, ref); /* remove it from list */
        lua_rawseti(L, t, 0); /* (t[freelist] = t[ref]) */
    } else
        /* no free elements */
        ref = lua_rawlen(L, t) + 1; /* get a new reference */
    lua_rawseti(L, t, ref);
    return ref;
};

const luaL_unref = function (L: lua_State, t: number, ref: number): void {
    if (ref >= 0) {
        t = lua_absindex(L, t);
        lua_rawgeti(L, t, 0);
        lua_rawseti(L, t, ref); /* t[ref] = t[freelist] */
        lua_pushinteger(L, ref);
        lua_rawseti(L, t, 0); /* t[freelist] = ref */
    }
};

const errfile = function (
    L: lua_State,
    what: string,
    fnameindex: number,
    error: { message?: string },
): number {
    let serr = error.message ?? 'unknown error';
    let filename = lua_tostring(L, fnameindex)!.subarray(1);
    lua_pushfstring(
        L,
        to_luastring('cannot %s %s: %s'),
        to_luastring(what),
        filename,
        to_luastring(serr),
    );
    lua_remove(L, fnameindex);
    return LUA_ERRFILE;
};

let getc!: (lf: { n: number; buff: Uint8Array }) => number | null;

const utf8_bom = [0xef, 0xbb, 0xbf]; /* UTF-8 BOM mark */
const skipBOM = function (lf: { n: number; buff: Uint8Array }): number | null {
    lf.n = 0;
    let c;
    let p = 0;
    do {
        c = getc(lf);
        if (c === null || c !== utf8_bom[p]) return c;
        p++;
        lf.buff[lf.n++] = c; /* to be read by the parser */
    } while (p < utf8_bom.length);
    lf.n = 0; /* prefix matched; discard it */
    return getc(lf); /* return next character */
};

/*
 ** reads the first character of file 'f' and skips an optional BOM mark
 ** in its beginning plus its first line if it starts with '#'. Returns
 ** true if it skipped the first line.  In any case, '*cp' has the
 ** first "valid" character of the file (after the optional BOM and
 ** a first-line comment).
 */
const _skipcomment = function (lf: { n: number; buff: Uint8Array }): {
    skipped: boolean;
    c: number | null;
} {
    let c = skipBOM(lf);
    if (c === 35 /* '#'.charCodeAt(0) */) {
        /* first line is a comment (Unix exec. file)? */
        do {
            /* skip first line */
            c = getc(lf);
        } while (c && c !== 10 /* '\n'.charCodeAt(0) */);

        return {
            skipped: true,
            c: getc(lf) /* skip end-of-line, if present */,
        };
    } else {
        return {
            skipped: false,
            c: c,
        };
    }
};

const luaL_loadfilex = function (
    L: lua_State,
    filename: Uint8Array | null,
    mode: Uint8Array | null,
): number {
    let fnameindex = lua_gettop(L) + 1;
    if (filename === null) {
        lua_pushliteral(L, '=stdin');
        return errfile(L, 'open', fnameindex, {
            message: 'stdin reading not supported',
        });
    }
    lua_pushfstring(L, to_luastring('@%s'), filename);
    const path = to_jsstring(filename);
    const fs = requireModule('fs') as FsReadModule | null;
    if (!fs) {
        return errfile(L, 'open', fnameindex, {
            message: 'file loading not available on this platform',
        });
    }
    let buff;
    try {
        const raw = fs.readFileSync(path);
        buff = new Uint8Array(
            raw.buffer || raw,
            raw.byteOffset || 0,
            raw.length,
        );
    } catch (e) {
        const error = e as { message?: string };
        return errfile(L, 'open', fnameindex, error);
    }
    lua_remove(L, fnameindex);
    const chunkname = to_luastring('@' + path);
    return luaL_loadbufferx(L, buff, buff.length, chunkname, mode);
};

const luaL_loadfile = function (
    L: lua_State,
    filename: Uint8Array | null,
): number {
    return luaL_loadfilex(L, filename, null);
};

const luaL_dofile = function (
    L: lua_State,
    filename: Uint8Array | null,
): number {
    return luaL_loadfile(L, filename) || lua_pcall(L, 0, LUA_MULTRET, 0);
};

const lua_writestringerror = function (...args: string[]): void {
    for (let i = 0; i < args.length; i++) {
        let a = args[i]!;
        do {
            let r = /([^\n]*)\n?([\d\D]*)/.exec(a);
            if (!r) break;
            console.error(r[1] ?? '');
            a = r[2] ?? '';
        } while (a !== '');
    }
};

const luaL_checkversion_ = function (
    L: lua_State,
    ver: number,
    sz: number,
): void {
    let v = lua_version(L);
    if (sz != LUAL_NUMSIZES)
        /* check numeric types */
        luaL_error(
            L,
            to_luastring('core and library have incompatible numeric types'),
        );
    if (v != lua_version(null))
        luaL_error(L, to_luastring('multiple Lua VMs detected'));
    else if (v !== ver)
        luaL_error(
            L,
            to_luastring(
                'version mismatch: app. needs %f, Lua core provides %f',
            ),
            ver,
            v,
        );
};

/* There is no point in providing this function... */
const luaL_checkversion = function (L: lua_State): void {
    luaL_checkversion_(L, LUA_VERSION_NUM, LUAL_NUMSIZES);
};

export {
    LUA_ERRFILE,
    LUA_FILEHANDLE,
    LUA_LOADED_TABLE,
    LUA_NOREF,
    LUA_PRELOAD_TABLE,
    LUA_REFNIL,
    luaL_Buffer,
    luaL_addchar,
    luaL_addlstring,
    luaL_addsize,
    luaL_addstring,
    luaL_addvalue,
    luaL_argcheck,
    luaL_argerror,
    luaL_buffinit,
    luaL_buffinitsize,
    luaL_callmeta,
    luaL_checkany,
    luaL_checkinteger,
    luaL_checklstring,
    luaL_checknumber,
    luaL_checkoption,
    luaL_checkstack,
    luaL_checkstring,
    luaL_checktype,
    luaL_checkudata,
    luaL_checkversion,
    luaL_checkversion_,
    luaL_dofile,
    luaL_dostring,
    luaL_error,
    luaL_execresult,
    luaL_fileresult,
    luaL_getmetafield,
    luaL_getmetatable,
    luaL_getsubtable,
    luaL_gsub,
    luaL_len,
    luaL_loadbuffer,
    luaL_loadbufferx,
    luaL_loadfile,
    luaL_loadfilex,
    luaL_loadstring,
    luaL_newlib,
    luaL_newlibtable,
    luaL_newmetatable,
    luaL_newstate,
    luaL_opt,
    luaL_optinteger,
    luaL_optlstring,
    luaL_optnumber,
    luaL_optstring,
    luaL_prepbuffer,
    luaL_prepbuffsize,
    luaL_pushresult,
    luaL_pushresultsize,
    luaL_ref,
    luaL_requiref,
    luaL_setfuncs,
    luaL_setmetatable,
    luaL_testudata,
    luaL_tolstring,
    luaL_traceback,
    luaL_typename,
    luaL_unref,
    luaL_where,
    lua_writestringerror,
};
