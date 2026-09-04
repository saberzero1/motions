// LUAI_MAXSTACK is defined in luaconf.ts as 1000000 by default.
// We inline the value here to break the defs↔luaconf circular dependency —
// luaconf uses defs.to_luastring at module-evaluation time.
const LUAI_MAXSTACK: number = 1000000;

/*
 * Fengari specific string conversion functions
 */

type LuaString = Uint8Array;

let luastring_from: (arrayLike: ArrayLike<number>) => LuaString;
if (typeof Uint8Array.from === 'function') {
    luastring_from = Uint8Array.from.bind(Uint8Array);
} else {
    luastring_from = function (a: ArrayLike<number>): LuaString {
        let i = 0;
        let len = a.length;
        let r = new Uint8Array(len);
        while (len > i) {
            r[i] = a[i] ?? 0;
            i++;
        }
        return r;
    };
}

let luastring_indexOf: (s: LuaString, v: number, i?: number) => number;
if (typeof new Uint8Array().indexOf === 'function') {
    luastring_indexOf = function (s: LuaString, v: number, i?: number): number {
        return s.indexOf(v, i);
    };
} else {
    /* Browsers that don't support Uint8Array.indexOf seem to allow using Array.indexOf on Uint8Array objects e.g. IE11 */
    let array_indexOf = [].indexOf as (
        this: ArrayLike<number>,
        searchElement: number,
        fromIndex?: number,
    ) => number;
    if (array_indexOf.call(new Uint8Array(1), 0) !== 0)
        throw Error('missing .indexOf');
    luastring_indexOf = function (s: LuaString, v: number, i?: number): number {
        return array_indexOf.call(s, v, i);
    };
}

let luastring_of: (...items: number[]) => LuaString;
if (typeof Uint8Array.of === 'function') {
    luastring_of = Uint8Array.of.bind(Uint8Array);
} else {
    luastring_of = function (...items: number[]): LuaString {
        return luastring_from(items);
    };
}

const is_luastring = function (s: unknown): s is LuaString {
    return s instanceof Uint8Array;
};

/* test two lua strings for equality */
const luastring_eq = function (a: LuaString, b: LuaString): boolean {
    if (a !== b) {
        let len = a.length;
        if (len !== b.length) return false;
        /* XXX: Should this be a constant time algorithm? */
        for (let i = 0; i < len; i++) if (a[i] !== b[i]) return false;
    }
    return true;
};

const unicode_error_message: string =
    'cannot convert invalid utf8 to javascript string';
const to_jsstring = function (
    value: LuaString,
    from?: number,
    to?: number,
    replacement_char?: boolean,
): string {
    if (!is_luastring(value))
        throw new TypeError('to_jsstring expects a Uint8Array');

    if (to === void 0) {
        to = value.length;
    } else {
        to = Math.min(value.length, to);
    }

    let str = '';
    for (let i = from !== void 0 ? from : 0; i < to;) {
        let u0 = value[i++]!;
        if (u0 < 0x80) {
            /* single byte sequence */
            str += String.fromCharCode(u0);
        } else if (u0 < 0xc2 || u0 > 0xf4) {
            if (!replacement_char) throw RangeError(unicode_error_message);
            str += '�';
        } else if (u0 <= 0xdf) {
            /* two byte sequence */
            if (i >= to) {
                if (!replacement_char) throw RangeError(unicode_error_message);
                str += '�';
                continue;
            }
            let u1 = value[i++]!;
            if ((u1 & 0xc0) !== 0x80) {
                if (!replacement_char) throw RangeError(unicode_error_message);
                str += '�';
                continue;
            }
            str += String.fromCharCode(((u0 & 0x1f) << 6) + (u1 & 0x3f));
        } else if (u0 <= 0xef) {
            /* three byte sequence */
            if (i + 1 >= to) {
                if (!replacement_char) throw RangeError(unicode_error_message);
                str += '�';
                continue;
            }
            let u1 = value[i++]!;
            if ((u1 & 0xc0) !== 0x80) {
                if (!replacement_char) throw RangeError(unicode_error_message);
                str += '�';
                continue;
            }
            let u2 = value[i++]!;
            if ((u2 & 0xc0) !== 0x80) {
                if (!replacement_char) throw RangeError(unicode_error_message);
                str += '�';
                continue;
            }
            let u = ((u0 & 0x0f) << 12) + ((u1 & 0x3f) << 6) + (u2 & 0x3f);
            if (u <= 0xffff) {
                /* BMP codepoint */
                str += String.fromCharCode(u);
            } else {
                /* Astral codepoint */
                u -= 0x10000;
                let s1 = (u >> 10) + 0xd800;
                let s2 = (u % 0x400) + 0xdc00;
                str += String.fromCharCode(s1, s2);
            }
        } else {
            /* four byte sequence */
            if (i + 2 >= to) {
                if (!replacement_char) throw RangeError(unicode_error_message);
                str += '�';
                continue;
            }
            let u1 = value[i++]!;
            if ((u1 & 0xc0) !== 0x80) {
                if (!replacement_char) throw RangeError(unicode_error_message);
                str += '�';
                continue;
            }
            let u2 = value[i++]!;
            if ((u2 & 0xc0) !== 0x80) {
                if (!replacement_char) throw RangeError(unicode_error_message);
                str += '�';
                continue;
            }
            let u3 = value[i++]!;
            if ((u3 & 0xc0) !== 0x80) {
                if (!replacement_char) throw RangeError(unicode_error_message);
                str += '�';
                continue;
            }
            /* Has to be astral codepoint */
            let u =
                ((u0 & 0x07) << 18) +
                ((u1 & 0x3f) << 12) +
                ((u2 & 0x3f) << 6) +
                (u3 & 0x3f);
            u -= 0x10000;
            let s1 = (u >> 10) + 0xd800;
            let s2 = (u % 0x400) + 0xdc00;
            str += String.fromCharCode(s1, s2);
        }
    }
    return str;
};

/* bytes allowed unescaped in a uri */
const uri_allowed: Record<number, boolean> =
    ";,/?:@&=+$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789,-_.!~*'()#"
        .split('')
        .reduce(
            function (uri_allowed, c) {
                uri_allowed[c.charCodeAt(0)] = true;
                return uri_allowed;
            },
            {} as Record<number, boolean>,
        );

/* utility function to convert a lua string to a js string with uri escaping */
const to_uristring = function (a: LuaString): string {
    if (!is_luastring(a))
        throw new TypeError('to_uristring expects a Uint8Array');
    let s = '';
    for (let i = 0; i < a.length; i++) {
        let v = a[i] ?? 0;
        if (uri_allowed[v]) {
            s += String.fromCharCode(v);
        } else {
            s += '%' + (v < 0x10 ? '0' : '') + v.toString(16);
        }
    }
    return s;
};

const to_luastring_cache: Record<string, LuaString> = {};

const to_luastring = function (str: string, cache?: boolean): LuaString {
    if (typeof str !== 'string')
        throw new TypeError('to_luastring expects a javascript string');

    if (cache) {
        let cached = to_luastring_cache[str];
        if (is_luastring(cached)) return cached;
    }

    let len = str.length;
    let outU8Array: number[] | LuaString =
        Array(len); /* array is at *least* going to be length of string */
    let outIdx = 0;
    for (let i = 0; i < len; ++i) {
        let u = str.charCodeAt(i);
        if (u <= 0x7f) {
            outU8Array[outIdx++] = u;
        } else if (u <= 0x7ff) {
            outU8Array[outIdx++] = 0xc0 | (u >> 6);
            outU8Array[outIdx++] = 0x80 | (u & 63);
        } else {
            /* This part is to work around possible lack of String.codePointAt */
            if (u >= 0xd800 && u <= 0xdbff && i + 1 < len) {
                /* is first half of surrogate pair */
                let v = str.charCodeAt(i + 1);
                if (v >= 0xdc00 && v <= 0xdfff) {
                    /* is valid low surrogate */
                    i++;
                    u = (u - 0xd800) * 0x400 + v + 0x2400;
                }
            }
            if (u <= 0xffff) {
                outU8Array[outIdx++] = 0xe0 | (u >> 12);
                outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
                outU8Array[outIdx++] = 0x80 | (u & 63);
            } else {
                outU8Array[outIdx++] = 0xf0 | (u >> 18);
                outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
                outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
                outU8Array[outIdx++] = 0x80 | (u & 63);
            }
        }
    }
    outU8Array = luastring_from(outU8Array);

    const result = outU8Array;

    if (cache) to_luastring_cache[str] = result;

    return result;
};

const from_userstring = function (str: LuaString | string): LuaString {
    if (!is_luastring(str)) {
        if (typeof str === 'string') {
            str = to_luastring(str);
        } else {
            throw new TypeError(
                'expects an array of bytes or javascript string',
            );
        }
    }
    return str;
};

/* mark for precompiled code ('<esc>Lua') */
const LUA_SIGNATURE: LuaString = to_luastring('\x1bLua');

const LUA_VERSION_MAJOR: string = '5';
const LUA_VERSION_MINOR: string = '3';
const LUA_VERSION_NUM: number = 503;
const LUA_VERSION_RELEASE: string = '4';

const LUA_VERSION: string =
    'Lua ' + LUA_VERSION_MAJOR + '.' + LUA_VERSION_MINOR;
const LUA_RELEASE: string = LUA_VERSION + '.' + LUA_VERSION_RELEASE;
const LUA_COPYRIGHT: string =
    LUA_RELEASE + '  Copyright (C) 1994-2017 Lua.org, PUC-Rio';
const LUA_AUTHORS: string = 'R. Ierusalimschy, L. H. de Figueiredo, W. Celes';

const thread_status = {
    LUA_OK: 0,
    LUA_YIELD: 1,
    LUA_ERRRUN: 2,
    LUA_ERRSYNTAX: 3,
    LUA_ERRMEM: 4,
    LUA_ERRGCMM: 5,
    LUA_ERRERR: 6,
} as const satisfies Record<string, number>;

const constant_types = {
    LUA_TNONE: -1,
    LUA_TNIL: 0,
    LUA_TBOOLEAN: 1,
    LUA_TLIGHTUSERDATA: 2,
    LUA_TNUMBER: 3,
    LUA_TSTRING: 4,
    LUA_TTABLE: 5,
    LUA_TFUNCTION: 6,
    LUA_TUSERDATA: 7,
    LUA_TTHREAD: 8,
    LUA_NUMTAGS: 9,
    LUA_TSHRSTR: 4 | (0 << 4) /* short strings */,
    LUA_TLNGSTR: 4 | (1 << 4) /* long strings */,
    LUA_TNUMFLT: 3 | (0 << 4) /* float numbers */,
    LUA_TNUMINT: 3 | (1 << 4) /* integer numbers */,
    LUA_TLCL: 6 | (0 << 4) /* Lua closure */,
    LUA_TLCF: 6 | (1 << 4) /* light C function */,
    LUA_TCCL: 6 | (2 << 4) /* C closure */,
} as const satisfies Record<string, number>;

/*
 ** Comparison and arithmetic functions
 */

const LUA_OPADD: number = 0; /* ORDER TM, ORDER OP */
const LUA_OPSUB: number = 1;
const LUA_OPMUL: number = 2;
const LUA_OPMOD: number = 3;
const LUA_OPPOW: number = 4;
const LUA_OPDIV: number = 5;
const LUA_OPIDIV: number = 6;
const LUA_OPBAND: number = 7;
const LUA_OPBOR: number = 8;
const LUA_OPBXOR: number = 9;
const LUA_OPSHL: number = 10;
const LUA_OPSHR: number = 11;
const LUA_OPUNM: number = 12;
const LUA_OPBNOT: number = 13;

const LUA_OPEQ: number = 0;
const LUA_OPLT: number = 1;
const LUA_OPLE: number = 2;

const LUA_MINSTACK: number = 20;

const LUA_REGISTRYINDEX: number = -LUAI_MAXSTACK - 1000;

const lua_upvalueindex = function (i: number): number {
    return LUA_REGISTRYINDEX - i;
};

/* predefined values in the registry */
const LUA_RIDX_MAINTHREAD: number = 1;
const LUA_RIDX_GLOBALS: number = 2;
const LUA_RIDX_LAST: number = LUA_RIDX_GLOBALS;

class lua_Debug {
    event: number;
    name: Uint8Array | null;
    namewhat: Uint8Array | null;
    what: Uint8Array | null;
    source: Uint8Array | null;
    currentline: number;
    linedefined: number;
    lastlinedefined: number;
    nups: number;
    nparams: number;
    isvararg: number;
    istailcall: number;
    short_src: Uint8Array | null;
    i_ci: object | null;

    constructor() {
        this.event = NaN;
        this.name = null; /* (n) */
        this.namewhat = null; /* (n) 'global', 'local', 'field', 'method' */
        this.what = null; /* (S) 'Lua', 'C', 'main', 'tail' */
        this.source = null; /* (S) */
        this.currentline = NaN; /* (l) */
        this.linedefined = NaN; /* (S) */
        this.lastlinedefined = NaN; /* (S) */
        this.nups = NaN; /* (u) number of upvalues */
        this.nparams = NaN; /* (u) number of parameters */
        this.isvararg = NaN; /* (u) */
        this.istailcall = NaN; /* (t) */
        this.short_src = null; /* (S) */
        /* private part */
        this.i_ci = null; /* active function */
    }
}

/*
 ** Event codes
 */
const LUA_HOOKCALL: number = 0;
const LUA_HOOKRET: number = 1;
const LUA_HOOKLINE: number = 2;
const LUA_HOOKCOUNT: number = 3;
const LUA_HOOKTAILCALL: number = 4;

/*
 ** Event masks
 */
const LUA_MASKCALL: number = 1 << LUA_HOOKCALL;
const LUA_MASKRET: number = 1 << LUA_HOOKRET;
const LUA_MASKLINE: number = 1 << LUA_HOOKLINE;
const LUA_MASKCOUNT: number = 1 << LUA_HOOKCOUNT;

const LUA_MULTRET: number = -1;

export {
    luastring_from,
    luastring_indexOf,
    luastring_of,
    is_luastring,
    luastring_eq,
    to_jsstring,
    to_uristring,
    to_luastring,
    from_userstring,
    LUA_SIGNATURE,
    LUA_VERSION_MAJOR,
    LUA_VERSION_MINOR,
    LUA_VERSION_NUM,
    LUA_VERSION_RELEASE,
    LUA_VERSION,
    LUA_RELEASE,
    LUA_COPYRIGHT,
    LUA_AUTHORS,
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
    LUA_RIDX_GLOBALS,
    LUA_RIDX_LAST,
    LUA_RIDX_MAINTHREAD,
    constant_types,
    lua_Debug,
    lua_upvalueindex,
    thread_status,
};
