import {
    LUA_MULTRET,
    LUA_OPBNOT,
    LUA_OPEQ,
    LUA_OPLE,
    LUA_OPLT,
    LUA_OPUNM,
    LUA_REGISTRYINDEX,
    LUA_RIDX_GLOBALS,
    LUA_VERSION_NUM,
    from_userstring,
    to_luastring,
    constant_types,
    thread_status,
} from './defs.js';
import { api_check } from './llimits.js';
import * as ldebug from './ldebug.js';
import * as ldo from './ldo.js';
import { luaU_dump } from './ldump.js';
import * as lfunc from './lfunc.js';
import * as lobject from './lobject.js';
import * as lstate from './lstate.js';
import { luaS_bless, luaS_new, luaS_newliteral } from './lstring.js';
import * as ltm from './ltm.js';
import { LUAI_MAXSTACK } from './luaconf.js';
import * as lvm from './lvm.js';
import * as ltable from './ltable.js';
import { ZIO } from './lzio.js';
import type { lua_State, global_State } from './lstate.js';

type LuaCFunction = (L: lua_State) => number;
type LuaKFunction = (L: lua_State, status: number, ctx: number) => number;
type LuaReader = (L: lua_State, data: unknown) => Uint8Array | null;
type LuaWriter = (
    L: lua_State,
    p: Uint8Array,
    sz: number,
    data: unknown,
) => number;
type LuaProxy = (L: lua_State) => void;

const {
    LUA_NUMTAGS,
    LUA_TBOOLEAN,
    LUA_TCCL,
    LUA_TFUNCTION,
    LUA_TLCF,
    LUA_TLCL,
    LUA_TLIGHTUSERDATA,
    LUA_TLNGSTR,
    LUA_TNIL,
    LUA_TNONE,
    LUA_TNUMFLT,
    LUA_TNUMINT,
    LUA_TSHRSTR,
    LUA_TTABLE,
    LUA_TTHREAD,
    LUA_TUSERDATA,
} = constant_types;
const { LUA_OK } = thread_status;

const TValue = lobject.TValue;
const CClosure = lobject.CClosure;

const api_incr_top = function (L: lua_State): void {
    L.top++;
    api_check(L, L.top <= L.ci!.top, 'stack overflow');
};

const api_checknelems = function (L: lua_State, n: number): void {
    api_check(L, n < L.top - L.ci!.funcOff, 'not enough elements in the stack');
};

const fengari_argcheck = function (c: boolean): void {
    if (!c) throw TypeError('invalid argument');
};

const fengari_argcheckinteger = function (n: number): void {
    fengari_argcheck(typeof n === 'number' && Number.isSafeInteger(n));
};

const isvalid = function (o: lobject.TValue): boolean {
    return o !== lobject.luaO_nilobject;
};

const lua_version = function (L: lua_State | null): number {
    if (L === null) return LUA_VERSION_NUM;
    else return L.l_G.version!;
};

const lua_atpanic = function (
    L: lua_State,
    panicf: LuaCFunction | null,
): LuaCFunction | null {
    let old = L.l_G.panic;
    L.l_G.panic = panicf;
    return old;
};

const lua_atnativeerror = function (
    L: lua_State,
    errorf: LuaCFunction | null,
): LuaCFunction | null {
    let old = L.l_G.atnativeerror;
    L.l_G.atnativeerror = errorf;
    return old;
};

// Return value for idx on stack
const index2addr = function (L: lua_State, idx: number): lobject.TValue {
    let ci = L.ci!;
    if (idx > 0) {
        let o = ci.funcOff + idx;
        api_check(L, idx <= ci.top - (ci.funcOff + 1), 'unacceptable index');
        if (o >= L.top) return lobject.luaO_nilobject;
        else return L.stack![o]!;
    } else if (idx > LUA_REGISTRYINDEX) {
        api_check(L, idx !== 0 && -idx <= L.top, 'invalid index');
        return L.stack![L.top + idx]!;
    } else if (idx === LUA_REGISTRYINDEX) {
        return L.l_G.l_registry;
    } else {
        /* upvalues */
        idx = LUA_REGISTRYINDEX - idx;
        api_check(L, idx <= lfunc.MAXUPVAL + 1, 'upvalue index too large');
        if (ci.func!.ttislcf())
            /* light C function? */
            return lobject.luaO_nilobject; /* it has no upvalues */
        else {
            const closure = ci.func!.clCvalue();
            return idx <= closure.nupvalues
                ? closure.upvalue[idx - 1]!
                : lobject.luaO_nilobject;
        }
    }
};

// Like index2addr but returns the index on stack; doesn't allow pseudo indices
const index2addr_ = function (L: lua_State, idx: number): number | null {
    let ci = L.ci!;
    if (idx > 0) {
        let o = ci.funcOff + idx;
        api_check(L, idx <= ci.top - (ci.funcOff + 1), 'unacceptable index');
        if (o >= L.top) return null;
        else return o;
    } else if (idx > LUA_REGISTRYINDEX) {
        api_check(L, idx !== 0 && -idx <= L.top, 'invalid index');
        return L.top + idx;
    } else {
        /* registry or upvalue */
        throw Error('attempt to use pseudo-index');
    }
};

const lua_checkstack = function (L: lua_State, n: number): boolean {
    let res;
    let ci = L.ci!;
    api_check(L, n >= 0, "negative 'n'");
    if (L.stack_last - L.top > n) /* stack large enough? */ res = true;
    else {
        /* no; need to grow stack */
        let inuse = L.top + lstate.EXTRA_STACK;
        if (inuse > LUAI_MAXSTACK - n)
            /* can grow without overflow? */
            res = false; /* no */
        else {
            /* try to grow stack */
            ldo.luaD_growstack(L, n);
            res = true;
        }
    }

    if (res && ci.top < L.top + n) ci.top = L.top + n; /* adjust frame top */

    return res;
};

const lua_xmove = function (from: lua_State, to: lua_State, n: number): void {
    if (from === to) return;
    api_checknelems(from, n);
    api_check(from, from.l_G === to.l_G, 'moving among independent states');
    api_check(from, to.ci!.top - to.top >= n, 'stack overflow');
    from.top -= n;
    for (let i = 0; i < n; i++) {
        to.stack![to.top] = new lobject.TValue(LUA_TNIL, null);
        lobject.setobj2s(to, to.top, from.stack![from.top + i]!);
        delete from.stack![from.top + i];
        to.top++;
    }
};

/*
 ** basic stack manipulation
 */

/*
 ** convert an acceptable stack index into an absolute index
 */
const lua_absindex = function (L: lua_State, idx: number): number {
    return idx > 0 || idx <= LUA_REGISTRYINDEX
        ? idx
        : L.top - L.ci!.funcOff + idx;
};

const lua_gettop = function (L: lua_State): number {
    return L.top - (L.ci!.funcOff + 1);
};

const lua_pushvalue = function (L: lua_State, idx: number): void {
    lobject.pushobj2s(L, index2addr(L, idx));
    api_check(L, L.top <= L.ci!.top, 'stack overflow');
};

const lua_settop = function (L: lua_State, idx: number): void {
    let func = L.ci!.funcOff;
    let newtop;
    if (idx >= 0) {
        api_check(L, idx <= L.stack_last - (func + 1), 'new top too large');
        newtop = func + 1 + idx;
    } else {
        api_check(L, -(idx + 1) <= L.top - (func + 1), 'invalid new top');
        newtop = L.top + idx + 1; /* 'subtract' index (index is negative) */
    }
    ldo.adjust_top(L, newtop);
};

const lua_pop = function (L: lua_State, n: number): void {
    lua_settop(L, -n - 1);
};

const reverse = function (L: lua_State, from: number, to: number): void {
    for (; from < to; from++, to--) {
        let fromtv = L.stack![from]!;
        let temp = new TValue(fromtv.type, fromtv.value);
        lobject.setobjs2s(L, from, to);
        lobject.setobj2s(L, to, temp);
    }
};

/*
 ** Let x = AB, where A is a prefix of length 'n'. Then,
 ** rotate x n === BA. But BA === (A^r . B^r)^r.
 */
const lua_rotate = function (L: lua_State, idx: number, n: number): void {
    let t = L.top - 1;
    let pIdx = index2addr_(L, idx)!;
    let p = L.stack![pIdx]!;
    api_check(
        L,
        isvalid(p) && idx > LUA_REGISTRYINDEX,
        'index not in the stack',
    );
    api_check(L, (n >= 0 ? n : -n) <= t - pIdx + 1, "invalid 'n'");
    let m = n >= 0 ? t - n : pIdx - n - 1; /* end of prefix */
    reverse(L, pIdx, m);
    reverse(L, m + 1, L.top - 1);
    reverse(L, pIdx, L.top - 1);
};

const lua_copy = function (L: lua_State, fromidx: number, toidx: number): void {
    let from = index2addr(L, fromidx);
    index2addr(L, toidx).setfrom(from);
};

const lua_remove = function (L: lua_State, idx: number): void {
    lua_rotate(L, idx, -1);
    lua_pop(L, 1);
};

const lua_insert = function (L: lua_State, idx: number): void {
    lua_rotate(L, idx, 1);
};

const lua_replace = function (L: lua_State, idx: number): void {
    lua_copy(L, -1, idx);
    lua_pop(L, 1);
};

/*
 ** push functions (JS -> stack)
 */

const lua_pushnil = function (L: lua_State): void {
    L.stack![L.top] = new TValue(LUA_TNIL, null);
    api_incr_top(L);
};

const lua_pushnumber = function (L: lua_State, n: number): void {
    fengari_argcheck(typeof n === 'number');
    L.stack![L.top] = new TValue(LUA_TNUMFLT, n);
    api_incr_top(L);
};

const lua_pushinteger = function (L: lua_State, n: number): void {
    fengari_argcheckinteger(n);
    L.stack![L.top] = new TValue(LUA_TNUMINT, n);
    api_incr_top(L);
};

const lua_pushlstring = function (
    L: lua_State,
    s: Uint8Array | string,
    len: number,
): Uint8Array {
    fengari_argcheckinteger(len);
    let ts;
    if (len === 0) {
        s = to_luastring('', true);
        ts = luaS_bless(L, s);
    } else {
        s = from_userstring(s);
        api_check(L, s.length >= len, 'invalid length to lua_pushlstring');
        ts = luaS_new(L, s.subarray(0, len));
    }
    lobject.pushsvalue2s(L, ts);
    api_check(L, L.top <= L.ci!.top, 'stack overflow');
    return ts.getstr();
};

const lua_pushstring = function (
    L: lua_State,
    s: Uint8Array | string | null | undefined,
): Uint8Array | null {
    let result: Uint8Array | null = null;
    if (s === undefined || s === null) {
        L.stack![L.top] = new TValue(LUA_TNIL, null);
        L.top++;
    } else {
        let ts = luaS_new(L, from_userstring(s));
        lobject.pushsvalue2s(L, ts);
        result = ts.getstr(); /* internal copy */
    }
    api_check(L, L.top <= L.ci!.top, 'stack overflow');
    return result;
};

const lua_pushvfstring = function (
    L: lua_State,
    fmt: Uint8Array | string,
    argp: unknown[],
): Uint8Array {
    fmt = from_userstring(fmt);
    return lobject.luaO_pushvfstring(L, fmt, argp);
};

const lua_pushfstring = function (
    L: lua_State,
    fmt: Uint8Array | string,
    ...argp: unknown[]
): Uint8Array {
    fmt = from_userstring(fmt);
    return lobject.luaO_pushvfstring(L, fmt, argp);
};

/* Similar to lua_pushstring, but takes a JS string */
const lua_pushliteral = function (
    L: lua_State,
    s: string | null | undefined,
): Uint8Array | null {
    let result: Uint8Array | null = null;
    if (s === undefined || s === null) {
        L.stack![L.top] = new TValue(LUA_TNIL, null);
        L.top++;
    } else {
        fengari_argcheck(typeof s === 'string');
        let ts = luaS_newliteral(L, s);
        lobject.pushsvalue2s(L, ts);
        result = ts.getstr(); /* internal copy */
    }
    api_check(L, L.top <= L.ci!.top, 'stack overflow');

    return result;
};

const lua_pushcclosure = function (
    L: lua_State,
    fn: LuaCFunction,
    n: number,
): void {
    fengari_argcheck(typeof fn === 'function');
    fengari_argcheckinteger(n);
    if (n === 0) L.stack![L.top] = new TValue(LUA_TLCF, fn);
    else {
        api_checknelems(L, n);
        api_check(L, n <= lfunc.MAXUPVAL, 'upvalue index too large');
        const closureFn = fn as (...args: unknown[]) => number;
        let cl = new CClosure(L, closureFn, n);
        for (let i = 0; i < n; i++)
            cl.upvalue[i]!.setfrom(L.stack![L.top - n + i]!);
        for (let i = 1; i < n; i++) delete L.stack![--L.top];
        if (n > 0) --L.top;
        L.stack![L.top]!.setclCvalue(cl);
    }
    api_incr_top(L);
};

const lua_pushjsclosure = lua_pushcclosure;

const lua_pushcfunction = function (L: lua_State, fn: LuaCFunction): void {
    lua_pushcclosure(L, fn, 0);
};

const lua_pushjsfunction = lua_pushcfunction;

const lua_pushboolean = function (L: lua_State, b: boolean): void {
    L.stack![L.top] = new TValue(LUA_TBOOLEAN, !!b);
    api_incr_top(L);
};

const lua_pushlightuserdata = function (L: lua_State, p: unknown): void {
    L.stack![L.top] = new TValue(LUA_TLIGHTUSERDATA, p);
    api_incr_top(L);
};

const lua_pushthread = function (L: lua_State): boolean {
    L.stack![L.top] = new TValue(LUA_TTHREAD, L);
    api_incr_top(L);
    return L.l_G.mainthread === L;
};

const lua_pushglobaltable = function (L: lua_State): void {
    lua_rawgeti(L, LUA_REGISTRYINDEX, LUA_RIDX_GLOBALS);
};

/*
 ** set functions (stack -> Lua)
 */

/*
 ** t[k] = value at the top of the stack (where 'k' is a string)
 */
const auxsetstr = function (
    L: lua_State,
    t: lobject.TValue,
    k: Uint8Array | string,
): void {
    let str = luaS_new(L, from_userstring(k));
    api_checknelems(L, 1);
    lobject.pushsvalue2s(L, str); /* push 'str' (to make it a TValue) */
    api_check(L, L.top <= L.ci!.top, 'stack overflow');
    lvm.settable(L, t, L.stack![L.top - 1]!, L.stack![L.top - 2]!);
    /* pop value and key */
    delete L.stack![--L.top];
    delete L.stack![--L.top];
};

const lua_setglobal = function (L: lua_State, name: Uint8Array | string): void {
    auxsetstr(
        L,
        ltable.luaH_getint(L.l_G.l_registry.hvalue(), LUA_RIDX_GLOBALS),
        name,
    );
};

const lua_setmetatable = function (L: lua_State, objindex: number): boolean {
    api_checknelems(L, 1);
    let mt;
    let obj = index2addr(L, objindex);
    if (L.stack![L.top - 1]!.ttisnil()) mt = null;
    else {
        api_check(L, L.stack![L.top - 1]!.ttistable(), 'table expected');
        mt = L.stack![L.top - 1]!.hvalue();
    }

    switch (obj.ttnov()) {
        case LUA_TUSERDATA: {
            let udata = obj.uvalue();
            let g = L.l_G;
            if (g.finalizerRegistry && g.finalizerTokens.has(udata)) {
                g.finalizerRegistry.unregister(udata);
                g.finalizerTokens.delete(udata);
            }
            udata.metatable = mt;
            if (mt !== null && g.finalizerRegistry) {
                let gcKey = g.tmname[ltm.TMS.TM_GC]!;
                let gcFunc = ltable.luaH_getstr(mt, gcKey);
                if (!gcFunc.ttisnil()) {
                    g.finalizerRegistry.register(
                        udata,
                        { gcFunc: gcFunc },
                        udata,
                    );
                    g.finalizerTokens.add(udata);
                }
            }
            break;
        }
        case LUA_TTABLE: {
            obj.hvalue().metatable = mt;
            break;
        }
        default: {
            L.l_G.mt[obj.ttnov()] = mt;
            break;
        }
    }

    delete L.stack![--L.top];
    return true;
};

const lua_settable = function (L: lua_State, idx: number): void {
    api_checknelems(L, 2);
    let t = index2addr(L, idx);
    lvm.settable(L, t, L.stack![L.top - 2]!, L.stack![L.top - 1]!);
    delete L.stack![--L.top];
    delete L.stack![--L.top];
};

const lua_setfield = function (
    L: lua_State,
    idx: number,
    k: Uint8Array | string,
): void {
    auxsetstr(L, index2addr(L, idx), k);
};

const lua_seti = function (L: lua_State, idx: number, n: number): void {
    fengari_argcheckinteger(n);
    api_checknelems(L, 1);
    let t = index2addr(L, idx);
    L.stack![L.top] = new TValue(LUA_TNUMINT, n);
    api_incr_top(L);
    lvm.settable(L, t, L.stack![L.top - 1]!, L.stack![L.top - 2]!);
    /* pop value and key */
    delete L.stack![--L.top];
    delete L.stack![--L.top];
};

const lua_rawset = function (L: lua_State, idx: number): void {
    api_checknelems(L, 2);
    let o = index2addr(L, idx);
    api_check(L, o.ttistable(), 'table expected');
    let k = L.stack![L.top - 2]!;
    let v = L.stack![L.top - 1]!;
    ltable.luaH_setfrom(L, o.hvalue(), k, v);
    ltable.invalidateTMcache(o.hvalue());
    delete L.stack![--L.top];
    delete L.stack![--L.top];
};

const lua_rawseti = function (L: lua_State, idx: number, n: number): void {
    fengari_argcheckinteger(n);
    api_checknelems(L, 1);
    let o = index2addr(L, idx);
    api_check(L, o.ttistable(), 'table expected');
    ltable.luaH_setint(o.hvalue(), n, L.stack![L.top - 1]!);
    delete L.stack![--L.top];
};

const lua_rawsetp = function (L: lua_State, idx: number, p: unknown): void {
    api_checknelems(L, 1);
    let o = index2addr(L, idx);
    api_check(L, o.ttistable(), 'table expected');
    let k = new TValue(LUA_TLIGHTUSERDATA, p);
    let v = L.stack![L.top - 1]!;
    ltable.luaH_setfrom(L, o.hvalue(), k, v);
    delete L.stack![--L.top];
};

/*
 ** get functions (Lua -> stack)
 */

const auxgetstr = function (
    L: lua_State,
    t: lobject.TValue,
    k: Uint8Array | string,
): number {
    let str = luaS_new(L, from_userstring(k));
    lobject.pushsvalue2s(L, str);
    api_check(L, L.top <= L.ci!.top, 'stack overflow');
    lvm.luaV_gettable(L, t, L.stack![L.top - 1]!, L.top - 1);
    return L.stack![L.top - 1]!.ttnov();
};

const lua_rawgeti = function (L: lua_State, idx: number, n: number): number {
    let t = index2addr(L, idx);
    fengari_argcheckinteger(n);
    api_check(L, t.ttistable(), 'table expected');
    lobject.pushobj2s(L, ltable.luaH_getint(t.hvalue(), n));
    api_check(L, L.top <= L.ci!.top, 'stack overflow');
    return L.stack![L.top - 1]!.ttnov();
};

const lua_rawgetp = function (L: lua_State, idx: number, p: unknown): number {
    let t = index2addr(L, idx);
    api_check(L, t.ttistable(), 'table expected');
    let k = new TValue(LUA_TLIGHTUSERDATA, p);
    lobject.pushobj2s(L, ltable.luaH_get(L, t.hvalue(), k));
    api_check(L, L.top <= L.ci!.top, 'stack overflow');
    return L.stack![L.top - 1]!.ttnov();
};

const lua_rawget = function (L: lua_State, idx: number): number {
    let t = index2addr(L, idx);
    api_check(L, t.ttistable(), 'table expected');
    lobject.setobj2s(
        L,
        L.top - 1,
        ltable.luaH_get(L, t.hvalue(), L.stack![L.top - 1]!),
    );
    return L.stack![L.top - 1]!.ttnov();
};

// narray and nrec are mostly useless for this implementation
const lua_createtable = function (
    L: lua_State,
    _narray?: number,
    _nrec?: number,
): void {
    let t = new lobject.TValue(LUA_TTABLE, ltable.luaH_new(L));
    L.stack![L.top] = t;
    api_incr_top(L);
};

const luaS_newudata = function (L: lua_State, size: number): lobject.Udata {
    return new lobject.Udata(L, size);
};

const lua_newuserdata = function (
    L: lua_State,
    size: number,
): Record<string, unknown> {
    let u = luaS_newudata(L, size);
    L.stack![L.top] = new lobject.TValue(LUA_TUSERDATA, u);
    api_incr_top(L);
    return u.data;
};

const aux_upvalue = function (
    L: lua_State,
    fi: lobject.TValue,
    n: number,
): { name: Uint8Array; val: lobject.TValue } | null {
    fengari_argcheckinteger(n);
    switch (fi.ttype()) {
        case LUA_TCCL: {
            /* C closure */
            let f = fi.clCvalue();
            if (!(1 <= n && n <= f.nupvalues)) return null;
            return {
                name: to_luastring('', true),
                val: f.upvalue[n - 1]!,
            };
        }
        case LUA_TLCL: {
            /* Lua closure */
            let f = fi.clLvalue();
            let p = f.p!;
            if (!(1 <= n && n <= p.upvalues.length)) return null;
            let name = p.upvalues[n - 1]!.name;
            return {
                name: name ? name.getstr() : to_luastring('(*no name)', true),
                val: f.upvals[n - 1]!,
            };
        }
        default:
            return null; /* not a closure */
    }
};

const lua_getupvalue = function (
    L: lua_State,
    funcindex: number,
    n: number,
): Uint8Array | null {
    let up = aux_upvalue(L, index2addr(L, funcindex), n);
    if (up) {
        let name = up.name;
        let val = up.val;
        lobject.pushobj2s(L, val);
        api_check(L, L.top <= L.ci!.top, 'stack overflow');
        return name;
    }
    return null;
};

const lua_setupvalue = function (
    L: lua_State,
    funcindex: number,
    n: number,
): Uint8Array | null {
    let fi = index2addr(L, funcindex);
    api_checknelems(L, 1);
    let aux = aux_upvalue(L, fi, n);
    if (aux) {
        let name = aux.name;
        let val = aux.val;
        val.setfrom(L.stack![L.top - 1]!);
        delete L.stack![--L.top];
        return name;
    }
    return null;
};

const lua_newtable = function (L: lua_State): void {
    lua_createtable(L, 0, 0);
};

const lua_register = function (
    L: lua_State,
    n: Uint8Array | string,
    f: LuaCFunction,
): void {
    lua_pushcfunction(L, f);
    lua_setglobal(L, n);
};

const lua_getmetatable = function (L: lua_State, objindex: number): boolean {
    let obj = index2addr(L, objindex);
    let mt;
    let res = false;
    switch (obj.ttnov()) {
        case LUA_TTABLE:
            mt = obj.hvalue().metatable;
            break;
        case LUA_TUSERDATA:
            mt = obj.uvalue().metatable;
            break;
        default:
            mt = L.l_G.mt[obj.ttnov()];
            break;
    }

    if (mt !== null && mt !== undefined) {
        L.stack![L.top] = new TValue(LUA_TTABLE, mt);
        api_incr_top(L);
        res = true;
    }

    return res;
};

const lua_getuservalue = function (L: lua_State, idx: number): number {
    let o = index2addr(L, idx);
    api_check(L, o.ttisfulluserdata(), 'full userdata expected');
    let uv = o.uvalue().uservalue;
    L.stack![L.top] = new TValue(uv.type, uv.value);
    api_incr_top(L);
    return L.stack![L.top - 1]!.ttnov();
};

const lua_gettable = function (L: lua_State, idx: number): number {
    let t = index2addr(L, idx);
    lvm.luaV_gettable(L, t, L.stack![L.top - 1]!, L.top - 1);
    return L.stack![L.top - 1]!.ttnov();
};

const lua_getfield = function (
    L: lua_State,
    idx: number,
    k: Uint8Array | string,
): number {
    return auxgetstr(L, index2addr(L, idx), k);
};

const lua_geti = function (L: lua_State, idx: number, n: number): number {
    let t = index2addr(L, idx);
    fengari_argcheckinteger(n);
    L.stack![L.top] = new TValue(LUA_TNUMINT, n);
    api_incr_top(L);
    lvm.luaV_gettable(L, t, L.stack![L.top - 1]!, L.top - 1);
    return L.stack![L.top - 1]!.ttnov();
};

const lua_getglobal = function (
    L: lua_State,
    name: Uint8Array | string,
): number {
    return auxgetstr(
        L,
        ltable.luaH_getint(L.l_G.l_registry.hvalue(), LUA_RIDX_GLOBALS),
        name,
    );
};

/*
 ** access functions (stack -> JS)
 */

const lua_toboolean = function (L: lua_State, idx: number): boolean {
    let o = index2addr(L, idx);
    return !o.l_isfalse();
};

const lua_tolstring = function (L: lua_State, idx: number): Uint8Array | null {
    let o = index2addr(L, idx);

    if (!o.ttisstring()) {
        if (!lvm.cvt2str(o)) {
            /* not convertible? */
            return null;
        }
        lobject.luaO_tostring(L, o);
    }
    return o.svalue();
};

const lua_tostring = lua_tolstring;

const lua_tojsstring = function (L: lua_State, idx: number): string | null {
    let o = index2addr(L, idx);

    if (!o.ttisstring()) {
        if (!lvm.cvt2str(o)) {
            /* not convertible? */
            return null;
        }
        lobject.luaO_tostring(L, o);
    }
    return o.jsstring();
};

const lua_todataview = function (L: lua_State, idx: number): DataView {
    let u8 = lua_tolstring(L, idx)!;
    return new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
};

const lua_rawlen = function (L: lua_State, idx: number): number {
    let o = index2addr(L, idx);
    switch (o.ttype()) {
        case LUA_TSHRSTR:
        case LUA_TLNGSTR:
            return o.vslen();
        case LUA_TUSERDATA:
            return o.uvalue().len;
        case LUA_TTABLE:
            return ltable.luaH_getn(o.hvalue());
        default:
            return 0;
    }
};

const lua_tocfunction = function (
    L: lua_State,
    idx: number,
): LuaCFunction | null {
    let o = index2addr(L, idx);
    if (o.ttislcf()) return o.fvalue();
    if (o.ttisCclosure()) return o.clCvalue() as unknown as LuaCFunction;
    else return null; /* not a C function */
};

const lua_tointeger = function (L: lua_State, idx: number): number {
    let n = lua_tointegerx(L, idx);
    return n === false ? 0 : n;
};

const lua_tointegerx = function (L: lua_State, idx: number): number | false {
    return lvm.tointeger(index2addr(L, idx));
};

const lua_tonumber = function (L: lua_State, idx: number): number {
    let n = lua_tonumberx(L, idx);
    return n === false ? 0 : n;
};

const lua_tonumberx = function (L: lua_State, idx: number): number | false {
    return lvm.tonumber(index2addr(L, idx));
};

const lua_touserdata = function (L: lua_State, idx: number): unknown | null {
    let o = index2addr(L, idx);
    switch (o.ttnov()) {
        case LUA_TUSERDATA:
            return o.uvalue().data;
        case LUA_TLIGHTUSERDATA:
            return o.value;
        default:
            return null;
    }
};

const lua_tothread = function (L: lua_State, idx: number): lua_State | null {
    let o = index2addr(L, idx);
    return o.ttisthread() ? o.value : null;
};

const lua_topointer = function (L: lua_State, idx: number): unknown | null {
    let o = index2addr(L, idx);
    switch (o.ttype()) {
        case LUA_TTABLE:
        case LUA_TLCL:
        case LUA_TCCL:
        case LUA_TLCF:
        case LUA_TTHREAD:
        case LUA_TUSERDATA: /* note: this differs in behaviour to reference lua implementation */
        case LUA_TLIGHTUSERDATA:
            return o.value;
        default:
            return null;
    }
};

/* A proxy is a function that the same lua value to the given lua state. */

/* Having a weakmap of created proxies was only way I could think of to provide an 'isproxy' function */
const seen = new WeakMap<object, global_State>();

/* is the passed object a proxy? is it from the given state? (if passed) */
const lua_isproxy = function (p: unknown, L: lua_State | null): boolean {
    let G = seen.get(p as object);
    if (!G) return false;
    return L === null || L.l_G === G;
};

/* Use 'create_proxy' helper function so that 'L' is not in scope */
const create_proxy = function (
    G: lua_State['l_G'],
    type: number,
    value: unknown,
): LuaProxy {
    let proxy = function (L: lua_State): void {
        api_check(
            L,
            L instanceof lstate.lua_State && G === L.l_G,
            'must be from same global state',
        );
        L.stack![L.top] = new TValue(type, value);
        api_incr_top(L);
    };
    seen.set(proxy, G);
    return proxy;
};

const lua_toproxy = function (L: lua_State, idx: number): LuaProxy {
    let tv = index2addr(L, idx);
    /* pass broken down tv incase it is an upvalue index */
    return create_proxy(L.l_G, tv.type, tv.value);
};

const lua_compare = function (
    L: lua_State,
    index1: number,
    index2: number,
    op: number,
): number {
    let o1 = index2addr(L, index1);
    let o2 = index2addr(L, index2);

    let i = 0;

    if (isvalid(o1) && isvalid(o2)) {
        switch (op) {
            case LUA_OPEQ:
                i = lvm.luaV_equalobj(L, o1, o2);
                break;
            case LUA_OPLT:
                i = lvm.luaV_lessthan(L, o1, o2);
                break;
            case LUA_OPLE:
                i = lvm.luaV_lessequal(L, o1, o2);
                break;
            default:
                api_check(L, false, 'invalid option');
        }
    }

    return i;
};

const lua_stringtonumber = function (L: lua_State, s: Uint8Array): number {
    let tv = new TValue(LUA_TNIL, null);
    let sz = lobject.luaO_str2num(s, tv);
    if (sz !== 0) {
        L.stack![L.top] = tv;
        api_incr_top(L);
    }
    return sz;
};

const f_call = function (
    L: lua_State,
    ud: { funcOff: number; nresults: number },
): void {
    ldo.luaD_callnoyield(L, ud.funcOff, ud.nresults);
};

const lua_type = function (L: lua_State, idx: number): number {
    let o = index2addr(L, idx);
    return isvalid(o) ? o.ttnov() : LUA_TNONE;
};

const lua_typename = function (L: lua_State, t: number): Uint8Array {
    api_check(L, LUA_TNONE <= t && t < LUA_NUMTAGS, 'invalid tag');
    return ltm.ttypename(t);
};

const lua_iscfunction = function (L: lua_State, idx: number): boolean {
    let o = index2addr(L, idx);
    return o.ttislcf() || o.ttisCclosure();
};

const lua_isnil = function (L: lua_State, n: number): boolean {
    return lua_type(L, n) === LUA_TNIL;
};

const lua_isboolean = function (L: lua_State, n: number): boolean {
    return lua_type(L, n) === LUA_TBOOLEAN;
};

const lua_isnone = function (L: lua_State, n: number): boolean {
    return lua_type(L, n) === LUA_TNONE;
};

const lua_isnoneornil = function (L: lua_State, n: number): boolean {
    return lua_type(L, n) <= 0;
};

const lua_istable = function (L: lua_State, idx: number): boolean {
    return index2addr(L, idx).ttistable();
};

const lua_isinteger = function (L: lua_State, idx: number): boolean {
    return index2addr(L, idx).ttisinteger();
};

const lua_isnumber = function (L: lua_State, idx: number): boolean {
    return lvm.tonumber(index2addr(L, idx)) !== false;
};

const lua_isstring = function (L: lua_State, idx: number): boolean {
    let o = index2addr(L, idx);
    return o.ttisstring() || lvm.cvt2str(o);
};

const lua_isuserdata = function (L: lua_State, idx: number): boolean {
    let o = index2addr(L, idx);
    return o.ttisfulluserdata() || o.ttislightuserdata();
};

const lua_isthread = function (L: lua_State, idx: number): boolean {
    return lua_type(L, idx) === LUA_TTHREAD;
};

const lua_isfunction = function (L: lua_State, idx: number): boolean {
    return lua_type(L, idx) === LUA_TFUNCTION;
};

const lua_islightuserdata = function (L: lua_State, idx: number): boolean {
    return lua_type(L, idx) === LUA_TLIGHTUSERDATA;
};

const lua_rawequal = function (
    L: lua_State,
    index1: number,
    index2: number,
): number {
    let o1 = index2addr(L, index1);
    let o2 = index2addr(L, index2);
    return isvalid(o1) && isvalid(o2) ? lvm.luaV_equalobj(null, o1, o2) : 0;
};

const lua_arith = function (L: lua_State, op: number): void {
    if (op !== LUA_OPUNM && op !== LUA_OPBNOT)
        api_checknelems(L, 2); /* all other operations expect two operands */
    else {
        /* for unary operations, add fake 2nd operand */
        api_checknelems(L, 1);
        lobject.pushobj2s(L, L.stack![L.top - 1]!);
        api_check(L, L.top <= L.ci!.top, 'stack overflow');
    }
    /* first operand at top - 2, second at top - 1; result go to top - 2 */
    lobject.luaO_arith(
        L,
        op,
        L.stack![L.top - 2]!,
        L.stack![L.top - 1]!,
        L.stack![L.top - 2]!,
    );
    delete L.stack![--L.top]; /* remove second operand */
};

/*
 ** 'load' and 'call' functions (run Lua code)
 */

const default_chunkname = to_luastring('?');
const lua_load = function (
    L: lua_State,
    reader: LuaReader,
    data: unknown,
    chunkname: Uint8Array | string | null,
    mode: Uint8Array | string | null,
): number {
    if (!chunkname) chunkname = default_chunkname;
    else chunkname = from_userstring(chunkname);
    if (mode !== null) mode = from_userstring(mode);
    let z = new ZIO(L, reader, data);
    let status = ldo.luaD_protectedparser(L, z, chunkname, mode);
    if (status === LUA_OK) {
        /* no errors? */
        let f =
            L.stack![L.top - 1]!.clLvalue(); /* get newly created function */
        if (f.nupvalues >= 1) {
            /* does it have an upvalue? */
            /* get global table from registry */
            let gt = ltable.luaH_getint(
                L.l_G.l_registry.hvalue(),
                LUA_RIDX_GLOBALS,
            );
            /* set global table as 1st upvalue of 'f' (may be LUA_ENV) */
            f.upvals[0]!.setfrom(gt);
        }
    }
    return status;
};

const lua_dump = function (
    L: lua_State,
    writer: LuaWriter,
    data: unknown,
    strip: number,
): number {
    api_checknelems(L, 1);
    let o = L.stack![L.top - 1]!;
    if (o.ttisLclosure()) return luaU_dump(L, o.value.p!, writer, data, strip);
    return 1;
};

const lua_status = function (L: lua_State): number {
    return L.status;
};

const lua_setuservalue = function (L: lua_State, idx: number): void {
    api_checknelems(L, 1);
    let o = index2addr(L, idx);
    api_check(L, o.ttisfulluserdata(), 'full userdata expected');
    o.uvalue().uservalue.setfrom(L.stack![L.top - 1]!);
    delete L.stack![--L.top];
};

const checkresults = function (L: lua_State, na: number, nr: number): void {
    api_check(
        L,
        nr === LUA_MULTRET || L.ci!.top - L.top >= nr - na,
        'results from function overflow current stack size',
    );
};

const lua_callk = function (
    L: lua_State,
    nargs: number,
    nresults: number,
    ctx: number,
    k: LuaKFunction | null,
): void {
    api_check(
        L,
        k === null || !(L.ci!.callstatus & lstate.CIST_LUA),
        'cannot use continuations inside hooks',
    );
    api_checknelems(L, nargs + 1);
    api_check(L, L.status === LUA_OK, 'cannot do calls on non-normal thread');
    checkresults(L, nargs, nresults);
    let func = L.top - (nargs + 1);
    if (k !== null && L.nny === 0) {
        /* need to prepare continuation? */
        L.ci!.c_k = k;
        L.ci!.c_ctx = ctx;
        ldo.luaD_call(L, func, nresults);
    } else {
        /* no continuation or no yieldable */
        ldo.luaD_callnoyield(L, func, nresults);
    }

    if (nresults === LUA_MULTRET && L.ci!.top < L.top) L.ci!.top = L.top;
};

const lua_call = function (L: lua_State, n: number, r: number): void {
    lua_callk(L, n, r, 0, null);
};

const lua_pcallk = function (
    L: lua_State,
    nargs: number,
    nresults: number,
    errfunc: number,
    ctx: number,
    k: LuaKFunction | null,
): number {
    api_check(
        L,
        k === null || !(L.ci!.callstatus & lstate.CIST_LUA),
        'cannot use continuations inside hooks',
    );
    api_checknelems(L, nargs + 1);
    api_check(L, L.status === LUA_OK, 'cannot do calls on non-normal thread');
    checkresults(L, nargs, nresults);
    let status;
    let func;
    if (errfunc === 0) func = 0;
    else {
        func = index2addr_(L, errfunc)!;
    }
    let funcOff = L.top - (nargs + 1); /* function to be called */
    if (k === null || L.nny > 0) {
        /* no continuation or no yieldable? */
        let c = {
            funcOff: funcOff,
            nresults: nresults /* do a 'conventional' protected call */,
        };
        status = ldo.luaD_pcall(L, f_call, c, funcOff, func);
    } else {
        /* prepare continuation (call is already protected by 'resume') */
        let ci = L.ci!;
        ci.c_k =
            k; /* prepare continuation (call is already protected by 'resume') */
        ci.c_ctx =
            ctx; /* prepare continuation (call is already protected by 'resume') */
        /* save information for error recovery */
        (ci as lstate.CallInfo & { extra: number }).extra = funcOff;
        ci.c_old_errfunc = L.errfunc;
        L.errfunc = func;
        ci.callstatus &= ~lstate.CIST_OAH | L.allowhook;
        ci.callstatus |=
            lstate.CIST_YPCALL; /* function can do error recovery */
        ldo.luaD_call(L, funcOff, nresults); /* do the call */
        ci.callstatus &= ~lstate.CIST_YPCALL;
        L.errfunc = ci.c_old_errfunc;
        status = LUA_OK;
    }

    if (nresults === LUA_MULTRET && L.ci!.top < L.top) L.ci!.top = L.top;

    return status;
};

const lua_pcall = function (
    L: lua_State,
    n: number,
    r: number,
    f: number,
): number {
    return lua_pcallk(L, n, r, f, 0, null);
};

/*
 ** miscellaneous functions
 */

const lua_error = function (L: lua_State): void {
    api_checknelems(L, 1);
    ldebug.luaG_errormsg(L);
};

const lua_next = function (L: lua_State, idx: number): number {
    let t = index2addr(L, idx);
    api_check(L, t.ttistable(), 'table expected');
    L.stack![L.top] = new TValue(LUA_TNIL, null);
    let more = ltable.luaH_next(L, t.hvalue(), L.top - 1);
    if (more) {
        api_incr_top(L);
        return 1;
    } else {
        delete L.stack![L.top];
        delete L.stack![--L.top];
        return 0;
    }
};

const lua_concat = function (L: lua_State, n: number): void {
    api_checknelems(L, n);
    if (n >= 2) lvm.luaV_concat(L, n);
    else if (n === 0) {
        lobject.pushsvalue2s(L, luaS_bless(L, to_luastring('', true)));
        api_check(L, L.top <= L.ci!.top, 'stack overflow');
    }
};

const lua_len = function (L: lua_State, idx: number): void {
    let t = index2addr(L, idx);
    let tv = new TValue(LUA_TNIL, null);
    lvm.luaV_objlen(L, tv, t);
    L.stack![L.top] = tv;
    api_incr_top(L);
};

const getupvalref = function (
    L: lua_State,
    fidx: number,
    n: number,
): { f: lobject.LClosure; i: number } {
    let fi = index2addr(L, fidx);
    api_check(L, fi.ttisLclosure(), 'Lua function expected');
    let f = fi.clLvalue();
    fengari_argcheckinteger(n);
    api_check(L, 1 <= n && n <= f.p!.upvalues.length, 'invalid upvalue index');
    return {
        f: f,
        i: n - 1,
    };
};

const lua_upvalueid = function (
    L: lua_State,
    fidx: number,
    n: number,
): lobject.TValue | null {
    let fi = index2addr(L, fidx);
    switch (fi.ttype()) {
        case LUA_TLCL: {
            /* lua closure */
            let ref = getupvalref(L, fidx, n);
            return ref.f.upvals[ref.i]!;
        }
        case LUA_TCCL: {
            /* C closure */
            let f = fi.clCvalue();
            api_check(
                L,
                Number.isSafeInteger(n) && n > 0 && n <= f.nupvalues,
                'invalid upvalue index',
            );
            return f.upvalue[n - 1]!;
        }
        default: {
            api_check(L, false, 'closure expected');
            return null;
        }
    }
};

const lua_upvaluejoin = function (
    L: lua_State,
    fidx1: number,
    n1: number,
    fidx2: number,
    n2: number,
): void {
    let ref1 = getupvalref(L, fidx1, n1);
    let ref2 = getupvalref(L, fidx2, n2);
    let up2 = ref2.f.upvals[ref2.i]!;
    ref1.f.upvals[ref1.i] = up2;
};

// This functions are only there for compatibility purposes
const lua_gc = function (): void {};

const lua_getallocf = function (): number {
    console.warn('lua_getallocf is not available');
    return 0;
};

const lua_setallocf = function (): number {
    console.warn('lua_setallocf is not available');
    return 0;
};

const lua_getextraspace = function (): number {
    console.warn('lua_getextraspace is not available');
    return 0;
};

export {
    api_incr_top,
    api_checknelems,
    lua_absindex,
    lua_arith,
    lua_atpanic,
    lua_atnativeerror,
    lua_call,
    lua_callk,
    lua_checkstack,
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
    lua_geti,
    lua_getmetatable,
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
    lua_len,
    lua_load,
    lua_newtable,
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
    lua_rotate,
    lua_setallocf,
    lua_setfield,
    lua_setglobal,
    lua_seti,
    lua_setmetatable,
    lua_settable,
    lua_settop,
    lua_setupvalue,
    lua_setuservalue,
    lua_status,
    lua_stringtonumber,
    lua_toboolean,
    lua_tocfunction,
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
};
