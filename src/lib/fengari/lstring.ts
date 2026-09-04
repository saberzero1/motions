import {
    is_luastring,
    luastring_eq,
    luastring_from,
    to_luastring,
} from './defs.js';
import { lua_assert } from './llimits.js';
import type { lua_State } from './lstate.js';

class TString {
    hash: string | null;
    realstring: Uint8Array;

    constructor(L: lua_State, str: Uint8Array) {
        this.hash = null;
        this.realstring = str;
    }

    getstr(): Uint8Array {
        return this.realstring;
    }

    tsslen(): number {
        return this.realstring.length;
    }
}

const luaS_eqlngstr = function (a: TString, b: TString): boolean {
    lua_assert(a instanceof TString);
    lua_assert(b instanceof TString);
    return a == b || luastring_eq(a.realstring, b.realstring);
};

/* converts strings (arrays) to a consistent map key
   make sure this doesn't conflict with any of the anti-collision strategies in ltable */
const luaS_hash = function (str: Uint8Array): string {
    lua_assert(is_luastring(str));
    let len = str.length;
    let s = '|';
    for (let i = 0; i < len; i++) s += (str[i] as number).toString(16);
    return s;
};

const luaS_hashlongstr = function (ts: TString): string {
    lua_assert(ts instanceof TString);
    if (ts.hash === null) {
        ts.hash = luaS_hash(ts.getstr());
    }
    return ts.hash;
};

/* variant that takes ownership of array */
const luaS_bless = function (L: lua_State, str: Uint8Array): TString {
    lua_assert(str instanceof Uint8Array);
    return new TString(L, str);
};

/* makes a copy */
const luaS_new = function (L: lua_State, str: ArrayLike<number>): TString {
    return luaS_bless(L, luastring_from(str));
};

/* takes a js string */
const luaS_newliteral = function (L: lua_State, str: string): TString {
    return luaS_bless(L, to_luastring(str));
};

export {
    luaS_eqlngstr,
    luaS_hash,
    luaS_hashlongstr,
    luaS_bless,
    luaS_new,
    luaS_newliteral,
    TString,
};
