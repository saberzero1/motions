import { to_luastring, constant_types } from './defs.js';
import { LUA_MAXINTEGER } from './luaconf.js';
import { lua_assert } from './llimits.js';
import * as ldebug from './ldebug.js';
import * as lobject from './lobject.js';
import { luaS_hashlongstr, TString } from './lstring.js';
import * as lstate from './lstate.js';
import type { lua_State } from './lstate.js';
import type { TValue } from './lobject.js';

const {
    LUA_TBOOLEAN,
    LUA_TCCL,
    LUA_TLCF,
    LUA_TLCL,
    LUA_TLIGHTUSERDATA,
    LUA_TLNGSTR,
    LUA_TNIL,
    LUA_TNUMFLT,
    LUA_TNUMINT,
    LUA_TSHRSTR,
    LUA_TTABLE,
    LUA_TTHREAD,
    LUA_TUSERDATA,
} = constant_types;

/* used to prevent conflicts with lightuserdata keys */
let lightuserdata_hashes: WeakMap<object, object> = new WeakMap();
const get_lightuserdata_hash = function (v: object): object {
    let hash = lightuserdata_hashes.get(v);
    if (!hash) {
        /* Hash should be something unique that is a valid WeakMap key
           so that it ends up in dead_weak when removed from a table */
        hash = {};
        lightuserdata_hashes.set(v, hash);
    }
    return hash;
};

const table_hash = function (L: lua_State, key: TValue): unknown {
    switch (key.type) {
        case LUA_TNIL:
            return ldebug.luaG_runerror(
                L,
                to_luastring('table index is nil', true),
            );
        case LUA_TNUMFLT: {
            const keyValue = key.fltvalue();
            if (isNaN(keyValue))
                return ldebug.luaG_runerror(
                    L,
                    to_luastring('table index is NaN', true),
                );
            return keyValue;
        }
        case LUA_TNUMINT: /* takes advantage of floats and integers being same in JS */
        case LUA_TBOOLEAN:
        case LUA_TTABLE:
        case LUA_TLCL:
        case LUA_TLCF:
        case LUA_TCCL:
        case LUA_TUSERDATA:
        case LUA_TTHREAD:
            return key.value;
        case LUA_TSHRSTR:
        case LUA_TLNGSTR:
            return luaS_hashlongstr(key.tsvalue());
        case LUA_TLIGHTUSERDATA: {
            let v = key.value;
            switch (typeof v) {
                case 'string':
                    /* possible conflict with LUA_TSTRING.
                       prefix this string with "*" so they don't clash */
                    return '*' + v;
                case 'number':
                    /* possible conflict with LUA_TNUMBER.
                       turn into string and prefix with "#" to avoid clash with other strings */
                    return '#' + v;
                case 'boolean':
                    /* possible conflict with LUA_TBOOLEAN. use strings ?true and ?false instead */
                    return v ? '?true' : '?false';
                case 'function':
                    /* possible conflict with LUA_TLCF.
                       indirect via a weakmap */
                    return get_lightuserdata_hash(v);
                case 'object':
                    /* v could be a lua_State, CClosure, LClosure, Table or Userdata from this state as returned by lua_topointer */
                    if (
                        (v instanceof lstate.lua_State && v.l_G === L.l_G) ||
                        v instanceof Table ||
                        v instanceof lobject.Udata ||
                        v instanceof lobject.LClosure ||
                        v instanceof lobject.CClosure
                    ) {
                        /* indirect via a weakmap */
                        return get_lightuserdata_hash(v);
                    }
                    return v;
                default:
                    return v;
            }
        }
        default:
            throw new Error('unknown key type: ' + key.type);
    }
};

class Table {
    id: number;
    strong: Map<unknown, TableEntry>;
    dead_strong: Map<unknown, TableEntry>;
    dead_weak: WeakMap<object, TableEntry> | undefined;
    f: TableEntry | undefined;
    l: TableEntry | undefined;
    metatable: Table | null;
    flags: number;

    constructor(L: lua_State) {
        this.id = L.l_G.id_counter++;
        this.strong = new Map();
        this.dead_strong = new Map();
        this.dead_weak = void 0; /* initialised when needed */
        this.f = void 0; /* first entry */
        this.l = void 0; /* last entry */
        this.metatable = null;
        this.flags = ~0;
    }
}

type TableEntry = {
    key: TValue;
    value: TValue;
    p: TableEntry | undefined;
    n: TableEntry | undefined;
};

const invalidateTMcache = function (t: Table): void {
    t.flags = 0;
};

const add = function (
    t: Table,
    hash: unknown,
    key: TValue,
    value: TValue,
): void {
    t.dead_strong.clear();
    t.dead_weak = void 0;
    let prev = t.l;
    let entry: TableEntry = {
        key: key,
        value: value,
        p: prev,
        n: void 0,
    };
    if (!t.f) t.f = entry;
    if (prev) prev.n = entry;
    t.strong.set(hash, entry);
    t.l = entry;
};

const is_valid_weakmap_key = function (k: unknown): k is object {
    return typeof k === 'object' ? k !== null : typeof k === 'function';
};

/* Move out of 'strong' part and into 'dead' part. */
const mark_dead = function (t: Table, hash: unknown): void {
    let e = t.strong.get(hash);
    if (e) {
        e.key.setdeadvalue();
        e.value = void 0 as unknown as TValue;
        let next = e.n;
        let prev = e.p;
        e.p = void 0; /* no need to know previous item any more */
        if (prev) prev.n = next;
        if (next) next.p = prev;
        if (t.f === e) t.f = next;
        if (t.l === e) t.l = prev;
        t.strong.delete(hash);
        if (is_valid_weakmap_key(hash)) {
            if (!t.dead_weak) t.dead_weak = new WeakMap();
            t.dead_weak.set(hash, e);
        } else {
            /* can't be used as key in weakmap */
            t.dead_strong.set(hash, e);
        }
    }
};

const luaH_new = function (L: lua_State): Table {
    return new Table(L);
};

const getgeneric = function (t: Table, hash: unknown): TValue {
    let v = t.strong.get(hash);
    return v ? v.value : lobject.luaO_nilobject;
};

const luaH_getint = function (t: Table, key: number): TValue {
    lua_assert(typeof key == 'number' && Number.isSafeInteger(key));
    return getgeneric(t, key);
};

const luaH_getstr = function (t: Table, key: TString): TValue {
    lua_assert(key instanceof TString);
    return getgeneric(t, luaS_hashlongstr(key));
};

const luaH_get = function (L: lua_State, t: Table, key: TValue): TValue {
    lua_assert(key instanceof lobject.TValue);
    if (key.ttisnil() || (key.ttisfloat() && isNaN(key.value)))
        return lobject.luaO_nilobject;
    return getgeneric(t, table_hash(L, key));
};

const luaH_setint = function (t: Table, key: number, value: TValue): void {
    lua_assert(
        typeof key == 'number' &&
            Number.isSafeInteger(key) &&
            value instanceof lobject.TValue,
    );
    let hash = key; /* table_hash known result */
    if (value.ttisnil()) {
        mark_dead(t, hash);
        return;
    }
    let e = t.strong.get(hash);
    if (e) {
        let tv = e.value;
        tv.setfrom(value);
    } else {
        let k = new lobject.TValue(LUA_TNUMINT, key);
        let v = new lobject.TValue(value.type, value.value);
        add(t, hash, k, v);
    }
};

const luaH_setfrom = function (
    L: lua_State,
    t: Table,
    key: TValue,
    value: TValue,
): void {
    lua_assert(key instanceof lobject.TValue);
    let hash = table_hash(L, key);
    if (value.ttisnil()) {
        /* delete */
        mark_dead(t, hash);
        return;
    }

    let e = t.strong.get(hash);
    if (e) {
        e.value.setfrom(value);
    } else {
        let k;
        let kv = key.value;
        if (key.ttisfloat() && Number.isSafeInteger(kv)) {
            /* does index fit in an integer? */
            /* insert it as an integer */
            k = new lobject.TValue(LUA_TNUMINT, kv);
        } else {
            k = new lobject.TValue(key.type, kv);
        }
        let v = new lobject.TValue(value.type, value.value);
        add(t, hash, k, v);
    }
};

/*
 ** Try to find a boundary in table 't'. A 'boundary' is an integer index
 ** such that t[i] is non-nil and t[i+1] is nil (and 0 if t[1] is nil).
 */
const luaH_getn = function (t: Table): number {
    let i = 0;
    let j = t.strong.size + 1; /* use known size of Map to kick start search */
    /* find 'i' and 'j' such that i is present and j is not */
    while (!luaH_getint(t, j).ttisnil()) {
        i = j;
        if (j > LUA_MAXINTEGER / 2) {
            /* overflow? */
            /* table was built with bad purposes: resort to linear search */
            i = 1;
            while (!luaH_getint(t, i).ttisnil()) i++;
            return i - 1;
        }
        j *= 2;
    }
    /* now do a binary search between them */
    while (j - i > 1) {
        let m = Math.floor((i + j) / 2);
        if (luaH_getint(t, m).ttisnil()) j = m;
        else i = m;
    }
    return i;
};

const luaH_next = function (L: lua_State, table: Table, keyI: number): boolean {
    let keyO = L.stack![keyI]!;

    let entry: TableEntry | undefined;
    if (keyO.type === LUA_TNIL) {
        entry = table.f;
        if (!entry) return false;
    } else {
        /* First find current key */
        let hash = table_hash(L, keyO);
        /* Look in main part of table */
        entry = table.strong.get(hash);
        if (entry) {
            entry = entry.n;
            if (!entry) return false;
        } else {
            /* Try dead keys */
            entry =
                (table.dead_weak && is_valid_weakmap_key(hash)
                    ? table.dead_weak.get(hash)
                    : undefined) || table.dead_strong.get(hash);
            if (!entry)
            /* item not in table */
            {
                ldebug.luaG_runerror(L, to_luastring("invalid key to 'next'"));
                return false;
            }
            /* Iterate until either out of keys, or until finding a non-dead key */
            do {
                entry = entry.n;
                if (!entry) return false;
            } while (entry.key.ttisdeadkey());
        }
    }
    lobject.setobj2s(L, keyI, entry.key);
    lobject.setobj2s(L, keyI + 1, entry.value);
    return true;
};

export {
    invalidateTMcache,
    luaH_get,
    luaH_getint,
    luaH_getn,
    luaH_getstr,
    luaH_setfrom,
    luaH_setint,
    luaH_new,
    luaH_next,
    Table,
};
