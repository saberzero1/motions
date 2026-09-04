import { to_luastring, constant_types } from './defs.js';
import { lua_assert } from './llimits.js';
import * as lobject from './lobject.js';
import * as ldo from './ldo.js';
import * as lstate from './lstate.js';
import { luaS_bless, luaS_new } from './lstring.js';
import * as ltable from './ltable.js';
import * as ldebug from './ldebug.js';
import * as lvm from './lvm.js';
import type { TString } from './lstring.js';
import type { TValue } from './lobject.js';
import type { lua_State } from './lstate.js';
import type { Table } from './ltable.js';

const { LUA_TNIL, LUA_TTABLE, LUA_TUSERDATA } = constant_types;

const luaT_typenames_ = [
    'no value',
    'nil',
    'boolean',
    'userdata',
    'number',
    'string',
    'table',
    'function',
    'userdata',
    'thread',
    'proto' /* this last case is used for tests only */,
].map((e) => to_luastring(e));

const ttypename = function (t: number): Uint8Array {
    return luaT_typenames_[t + 1]!;
};

/*
 * WARNING: if you change the order of this enumeration,
 * grep "ORDER TM" and "ORDER OP"
 */
const TMS = {
    TM_INDEX: 0,
    TM_NEWINDEX: 1,
    TM_GC: 2,
    TM_MODE: 3,
    TM_LEN: 4,
    TM_EQ: 5 /* last tag method with fast access */,
    TM_ADD: 6,
    TM_SUB: 7,
    TM_MUL: 8,
    TM_MOD: 9,
    TM_POW: 10,
    TM_DIV: 11,
    TM_IDIV: 12,
    TM_BAND: 13,
    TM_BOR: 14,
    TM_BXOR: 15,
    TM_SHL: 16,
    TM_SHR: 17,
    TM_UNM: 18,
    TM_BNOT: 19,
    TM_LT: 20,
    TM_LE: 21,
    TM_CONCAT: 22,
    TM_CALL: 23,
    TM_N: 24 /* number of elements in the enum */,
} as const;

const luaT_init = function (L: lua_State): void {
    L.l_G.tmname[TMS.TM_INDEX] = luaS_new(L, to_luastring('__index', true));
    L.l_G.tmname[TMS.TM_NEWINDEX] = luaS_new(
        L,
        to_luastring('__newindex', true),
    );
    L.l_G.tmname[TMS.TM_GC] = luaS_new(L, to_luastring('__gc', true));
    L.l_G.tmname[TMS.TM_MODE] = luaS_new(L, to_luastring('__mode', true));
    L.l_G.tmname[TMS.TM_LEN] = luaS_new(L, to_luastring('__len', true));
    L.l_G.tmname[TMS.TM_EQ] = luaS_new(L, to_luastring('__eq', true));
    L.l_G.tmname[TMS.TM_ADD] = luaS_new(L, to_luastring('__add', true));
    L.l_G.tmname[TMS.TM_SUB] = luaS_new(L, to_luastring('__sub', true));
    L.l_G.tmname[TMS.TM_MUL] = luaS_new(L, to_luastring('__mul', true));
    L.l_G.tmname[TMS.TM_MOD] = luaS_new(L, to_luastring('__mod', true));
    L.l_G.tmname[TMS.TM_POW] = luaS_new(L, to_luastring('__pow', true));
    L.l_G.tmname[TMS.TM_DIV] = luaS_new(L, to_luastring('__div', true));
    L.l_G.tmname[TMS.TM_IDIV] = luaS_new(L, to_luastring('__idiv', true));
    L.l_G.tmname[TMS.TM_BAND] = luaS_new(L, to_luastring('__band', true));
    L.l_G.tmname[TMS.TM_BOR] = luaS_new(L, to_luastring('__bor', true));
    L.l_G.tmname[TMS.TM_BXOR] = luaS_new(L, to_luastring('__bxor', true));
    L.l_G.tmname[TMS.TM_SHL] = luaS_new(L, to_luastring('__shl', true));
    L.l_G.tmname[TMS.TM_SHR] = luaS_new(L, to_luastring('__shr', true));
    L.l_G.tmname[TMS.TM_UNM] = luaS_new(L, to_luastring('__unm', true));
    L.l_G.tmname[TMS.TM_BNOT] = luaS_new(L, to_luastring('__bnot', true));
    L.l_G.tmname[TMS.TM_LT] = luaS_new(L, to_luastring('__lt', true));
    L.l_G.tmname[TMS.TM_LE] = luaS_new(L, to_luastring('__le', true));
    L.l_G.tmname[TMS.TM_CONCAT] = luaS_new(L, to_luastring('__concat', true));
    L.l_G.tmname[TMS.TM_CALL] = luaS_new(L, to_luastring('__call', true));
};

/*
 ** Return the name of the type of an object. For tables and userdata
 ** with metatable, use their '__name' metafield, if present.
 */
const __name = to_luastring('__name', true);
const luaT_objtypename = function (L: lua_State, o: TValue): Uint8Array {
    let mt: Table | null;
    if (
        (o.ttistable() && (mt = o.value.metatable) !== null) ||
        (o.ttisfulluserdata() && (mt = o.value.metatable) !== null)
    ) {
        let name = ltable.luaH_getstr(mt, luaS_bless(L, __name));
        if (name.ttisstring()) return name.svalue();
    }
    return ttypename(o.ttnov());
};

const luaT_callTM = function (
    L: lua_State,
    f: TValue,
    p1: TValue,
    p2: TValue,
    p3: TValue,
    hasres: number,
): void {
    let func = L.top;

    lobject.pushobj2s(L, f); /* push function (assume EXTRA_STACK) */
    lobject.pushobj2s(L, p1); /* 1st argument */
    lobject.pushobj2s(L, p2); /* 2nd argument */

    if (!hasres)
        /* no result? 'p3' is third argument */
        lobject.pushobj2s(L, p3); /* 3rd argument */

    if (L.ci!.callstatus & lstate.CIST_LUA) ldo.luaD_call(L, func, hasres);
    else ldo.luaD_callnoyield(L, func, hasres);

    if (hasres) {
        /* if has result, move it to its place */
        let tv = L.stack![L.top - 1]!;
        delete L.stack![--L.top];
        p3.setfrom(tv);
    }
};

const luaT_callbinTM = function (
    L: lua_State,
    p1: TValue,
    p2: TValue,
    res: TValue,
    event: number,
): boolean {
    let tm = luaT_gettmbyobj(L, p1, event);
    if (tm.ttisnil()) tm = luaT_gettmbyobj(L, p2, event);
    if (tm.ttisnil()) return false;
    luaT_callTM(L, tm, p1, p2, res, 1);
    return true;
};

const luaT_trybinTM = function (
    L: lua_State | null,
    p1: TValue,
    p2: TValue,
    res: TValue | number,
    event: number,
): void {
    const target = typeof res === 'number' ? L!.stack![res]! : res;
    if (!luaT_callbinTM(L!, p1, p2, target, event)) {
        switch (event) {
            case TMS.TM_CONCAT:
                return ldebug.luaG_concaterror(L!, p1, p2);
            case TMS.TM_BAND:
            case TMS.TM_BOR:
            case TMS.TM_BXOR:
            case TMS.TM_SHL:
            case TMS.TM_SHR:
            case TMS.TM_BNOT: {
                let n1 = lvm.tonumber(p1);
                let n2 = lvm.tonumber(p2);
                if (n1 !== false && n2 !== false)
                    return ldebug.luaG_tointerror(L!, p1, p2);
                else
                    return ldebug.luaG_opinterror(
                        L!,
                        p1,
                        p2,
                        to_luastring('perform bitwise operation on', true),
                    );
            }
            default:
                return ldebug.luaG_opinterror(
                    L!,
                    p1,
                    p2,
                    to_luastring('perform arithmetic on', true),
                );
        }
    }
};

const luaT_callorderTM = function (
    L: lua_State,
    p1: TValue,
    p2: TValue,
    event: number,
): boolean | null {
    let res = new lobject.TValue(LUA_TNIL, null);
    if (!luaT_callbinTM(L, p1, p2, res, event)) return null;
    else return !res.l_isfalse();
};

const fasttm = function (
    l: lua_State,
    et: Table | null,
    e: number,
): TValue | null {
    return et === null
        ? null
        : et.flags & (1 << e)
          ? null
          : luaT_gettm(et, e, l.l_G.tmname[e]!);
};

const luaT_gettm = function (
    events: Table,
    event: number,
    ename: TString,
): TValue | null {
    const tm = ltable.luaH_getstr(events, ename);
    lua_assert(event <= TMS.TM_EQ);
    if (tm.ttisnil()) {
        /* no tag method? */
        events.flags |= 1 << event; /* cache this fact */
        return null;
    } else return tm;
};

const luaT_gettmbyobj = function (
    L: lua_State,
    o: TValue,
    event: number,
): TValue {
    let mt: Table | null;
    switch (o.ttnov()) {
        case LUA_TTABLE:
            mt = o.hvalue().metatable;
            break;
        case LUA_TUSERDATA:
            mt = o.uvalue().metatable;
            break;
        default:
            mt = L.l_G.mt[o.ttnov()] ?? null;
    }

    return mt
        ? ltable.luaH_getstr(mt, L.l_G.tmname[event]!)
        : lobject.luaO_nilobject;
};

export {
    fasttm,
    TMS,
    luaT_callTM,
    luaT_callbinTM,
    luaT_trybinTM,
    luaT_callorderTM,
    luaT_gettm,
    luaT_gettmbyobj,
    luaT_init,
    luaT_objtypename,
    ttypename,
};
