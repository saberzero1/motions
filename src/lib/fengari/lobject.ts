import {
    LUA_OPADD,
    LUA_OPBAND,
    LUA_OPBNOT,
    LUA_OPBOR,
    LUA_OPBXOR,
    LUA_OPDIV,
    LUA_OPIDIV,
    LUA_OPMOD,
    LUA_OPMUL,
    LUA_OPPOW,
    LUA_OPSHL,
    LUA_OPSHR,
    LUA_OPSUB,
    LUA_OPUNM,
    from_userstring,
    luastring_indexOf,
    luastring_of,
    to_jsstring,
    to_luastring,
    constant_types,
} from './defs.js';
import { lisdigit, lisprint, lisspace, lisxdigit } from './ljstype.js';
import * as ldebug from './ldebug.js';
import * as ldo from './ldo.js';
import * as lstate from './lstate.js';
import { luaS_bless, luaS_new } from './lstring.js';
import * as ltable from './ltable.js';
import type { Proto } from './lfunc.js';
import type { lua_State } from './lstate.js';
import type { Table } from './ltable.js';
import type { TString } from './lstring.js';
import {
    LUA_COMPAT_FLOATSTRING,
    ldexp,
    lua_integer2str,
    lua_number2str,
} from './luaconf.js';
import * as lvm from './lvm.js';
import { MAX_INT, luai_nummod, lua_assert } from './llimits.js';
import * as ltm from './ltm.js';

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
    LUA_TNUMBER,
    LUA_TNUMFLT,
    LUA_TNUMINT,
    LUA_TSHRSTR,
    LUA_TSTRING,
    LUA_TTABLE,
    LUA_TTHREAD,
    LUA_TUSERDATA,
} = constant_types;

const LUA_TPROTO = LUA_NUMTAGS;
const LUA_TDEADKEY = LUA_NUMTAGS + 1;

class TValue {
    type: number;
    value: unknown;

    constructor(type: number, value: unknown) {
        this.type = type;
        this.value = value;
    }

    /* type tag of a TValue (bits 0-3 for tags + variant bits 4-5) */
    ttype(): number {
        return this.type & 0x3f;
    }

    /* type tag of a TValue with no variants (bits 0-3) */
    ttnov(): number {
        return this.type & 0x0f;
    }

    checktag(t: number): boolean {
        return this.type === t;
    }

    checktype(t: number): boolean {
        return this.ttnov() === t;
    }

    ttisnumber(): this is TValue & { value: number } {
        return this.checktype(LUA_TNUMBER);
    }

    ttisfloat(): this is TValue & { value: number } {
        return this.checktag(LUA_TNUMFLT);
    }

    ttisinteger(): this is TValue & { value: number } {
        return this.checktag(LUA_TNUMINT);
    }

    ttisnil(): this is TValue & { value: null } {
        return this.checktag(LUA_TNIL);
    }

    ttisboolean(): this is TValue & { value: boolean } {
        return this.checktag(LUA_TBOOLEAN);
    }

    ttislightuserdata(): this is TValue & { value: object } {
        return this.checktag(LUA_TLIGHTUSERDATA);
    }

    ttisstring(): this is TValue & { value: TString } {
        return this.checktype(LUA_TSTRING);
    }

    ttisshrstring(): this is TValue & { value: TString } {
        return this.checktag(LUA_TSHRSTR);
    }

    ttislngstring(): this is TValue & { value: TString } {
        return this.checktag(LUA_TLNGSTR);
    }

    ttistable(): this is TValue & { value: Table } {
        return this.checktag(LUA_TTABLE);
    }

    ttisfunction(): boolean {
        return this.checktype(LUA_TFUNCTION);
    }

    ttisclosure(): boolean {
        return (this.type & 0x1f) === LUA_TFUNCTION;
    }

    ttisCclosure(): this is TValue & { value: CClosure } {
        return this.checktag(LUA_TCCL);
    }

    ttisLclosure(): this is TValue & { value: LClosure } {
        return this.checktag(LUA_TLCL);
    }

    ttislcf(): this is TValue & { value: (L: lua_State) => number } {
        return this.checktag(LUA_TLCF);
    }

    ttisfulluserdata(): this is TValue & { value: Udata } {
        return this.checktag(LUA_TUSERDATA);
    }

    ttisthread(): this is TValue & { value: lua_State } {
        return this.checktag(LUA_TTHREAD);
    }

    ttisdeadkey(): this is TValue & { value: null } {
        return this.checktag(LUA_TDEADKEY);
    }

    l_isfalse(): boolean {
        return this.ttisnil() || (this.ttisboolean() && this.value === false);
    }

    setfltvalue(x: number): void {
        this.type = LUA_TNUMFLT;
        this.value = x;
    }

    chgfltvalue(x: number): void {
        lua_assert(this.type == LUA_TNUMFLT);
        this.value = x;
    }

    setivalue(x: number): void {
        this.type = LUA_TNUMINT;
        this.value = x;
    }

    chgivalue(x: number): void {
        lua_assert(this.type == LUA_TNUMINT);
        this.value = x;
    }

    setnilvalue(): void {
        this.type = LUA_TNIL;
        this.value = null;
    }

    setfvalue(x: (...args: unknown[]) => number): void {
        this.type = LUA_TLCF;
        this.value = x;
    }

    setpvalue(x: object): void {
        this.type = LUA_TLIGHTUSERDATA;
        this.value = x;
    }

    setbvalue(x: boolean): void {
        this.type = LUA_TBOOLEAN;
        this.value = x;
    }

    setsvalue(x: TString): void {
        this.type = LUA_TLNGSTR; /* LUA_TSHRSTR? */
        this.value = x;
    }

    setuvalue(x: Udata): void {
        this.type = LUA_TUSERDATA;
        this.value = x;
    }

    setthvalue(x: lua_State): void {
        this.type = LUA_TTHREAD;
        this.value = x;
    }

    setclLvalue(x: LClosure): void {
        this.type = LUA_TLCL;
        this.value = x;
    }

    setclCvalue(x: CClosure): void {
        this.type = LUA_TCCL;
        this.value = x;
    }

    sethvalue(x: Table): void {
        this.type = LUA_TTABLE;
        this.value = x;
    }

    setdeadvalue(): void {
        this.type = LUA_TDEADKEY;
        this.value = null;
    }

    setfrom(tv: TValue): void {
        /* in lua C source setobj2t is often used for this */
        this.type = tv.type;
        this.value = tv.value;
    }

    tsvalue(): TString {
        lua_assert(this.ttisstring());
        return this.value as TString;
    }

    svalue(): Uint8Array {
        return this.tsvalue().getstr();
    }

    vslen(): number {
        return this.tsvalue().tsslen();
    }

    jsstring(from?: number, to?: number): string {
        return to_jsstring(this.svalue(), from, to, true);
    }

    // Typed value accessors — assert type and return typed value
    nvalue(): number {
        lua_assert(this.ttisnumber());
        return this.value as number;
    }

    ivalue(): number {
        lua_assert(this.ttisinteger());
        return this.value as number;
    }

    fltvalue(): number {
        lua_assert(this.ttisfloat());
        return this.value as number;
    }

    bvalue(): boolean {
        lua_assert(this.ttisboolean());
        return this.value as boolean;
    }

    hvalue(): Table {
        lua_assert(this.ttistable());
        return this.value as Table;
    }

    clLvalue(): LClosure {
        lua_assert(this.ttisLclosure());
        return this.value as LClosure;
    }

    clCvalue(): CClosure {
        lua_assert(this.ttisCclosure());
        return this.value as CClosure;
    }

    fvalue(): (L: lua_State) => number {
        lua_assert(this.ttislcf());
        return this.value as (L: lua_State) => number;
    }

    thvalue(): lua_State {
        lua_assert(this.ttisthread());
        return this.value as lua_State;
    }

    uvalue(): Udata {
        lua_assert(this.ttisfulluserdata());
        return this.value as Udata;
    }

    pvalue(): object {
        lua_assert(this.ttislightuserdata());
        return this.value as object;
    }
}

const pushobj2s = function (L: lua_State, tv: TValue): void {
    L.stack![L.top++] = new TValue(tv.type, tv.value);
};
const pushsvalue2s = function (L: lua_State, ts: TString): void {
    L.stack![L.top++] = new TValue(LUA_TLNGSTR, ts);
};
/* from stack to (same) stack */
const setobjs2s = function (
    L: lua_State,
    newidx: number,
    oldidx: number,
): void {
    L.stack![newidx]!.setfrom(L.stack![oldidx]!);
};
/* to stack (not from same stack) */
const setobj2s = function (L: lua_State, newidx: number, oldtv: TValue): void {
    L.stack![newidx]!.setfrom(oldtv);
};
const setsvalue2s = function (L: lua_State, newidx: number, ts: TString): void {
    L.stack![newidx]!.setsvalue(ts);
};

const luaO_nilobject = new TValue(LUA_TNIL, null);
Object.freeze(luaO_nilobject);

class LClosure {
    id: number;
    p: Proto | null;
    nupvalues: number;
    upvals: TValue[];

    constructor(L: lua_State, n: number) {
        this.id = L.l_G.id_counter++;

        this.p = null;
        this.nupvalues = n;
        this.upvals = new Array<TValue>(n);
    }
}

class CClosure {
    id: number;
    f: (...args: unknown[]) => number;
    nupvalues: number;
    upvalue: TValue[];

    constructor(L: lua_State, f: (...args: unknown[]) => number, n: number) {
        this.id = L.l_G.id_counter++;

        this.f = f;
        this.nupvalues = n;
        this.upvalue = new Array<TValue>(n);
        while (n--) {
            this.upvalue[n] = new TValue(LUA_TNIL, null);
        }
    }
}

class Udata {
    id: number;
    metatable: Table | null;
    uservalue: TValue;
    len: number;
    data: Record<string, unknown>;

    constructor(L: lua_State, size: number) {
        this.id = L.l_G.id_counter++;

        this.metatable = null;
        this.uservalue = new TValue(LUA_TNIL, null);
        this.len = size;
        this.data = Object.create(null) as Record<string, unknown>;
    }
}

/*
 ** Description of a local variable for function prototypes
 ** (used for debug information)
 */
class LocVar {
    varname: TString | null;
    startpc: number;
    endpc: number;

    constructor() {
        this.varname = null;
        this.startpc = NaN; /* first point where variable is active */
        this.endpc = NaN; /* first point where variable is dead */
    }
}

const RETS = to_luastring('...');
const PRE = to_luastring('[string "');
const POS = to_luastring('"]');

const luaO_chunkid = function (
    source: Uint8Array,
    bufflen: number,
): Uint8Array {
    let l = source.length;
    let out;
    if (source[0] === 61 /* ('=').charCodeAt(0) */) {
        /* 'literal' source */
        if (l < bufflen) {
            /* small enough? */
            out = new Uint8Array(l - 1);
            out.set(source.subarray(1));
        } else {
            /* truncate it */
            out = new Uint8Array(bufflen);
            out.set(source.subarray(1, bufflen + 1));
        }
    } else if (source[0] === 64 /* ('@').charCodeAt(0) */) {
        /* file name */
        if (l <= bufflen) {
            /* small enough? */
            out = new Uint8Array(l - 1);
            out.set(source.subarray(1));
        } else {
            /* add '...' before rest of name */
            out = new Uint8Array(bufflen);
            out.set(RETS);
            bufflen -= RETS.length;
            out.set(source.subarray(l - bufflen), RETS.length);
        }
    } else {
        /* string; format as [string "source"] */
        out = new Uint8Array(bufflen);
        let nli = luastring_indexOf(
            source,
            10 /* ('\n').charCodeAt(0) */,
        ); /* find first new line (if any) */
        out.set(PRE); /* add prefix */
        let out_i = PRE.length;
        bufflen -=
            PRE.length +
            RETS.length +
            POS.length; /* save space for prefix+suffix */
        if (l < bufflen && nli === -1) {
            /* small one-line source? */
            out.set(source, out_i); /* keep it */
            out_i += source.length;
        } else {
            if (nli !== -1) l = nli; /* stop at first newline */
            if (l > bufflen) l = bufflen;
            out.set(source.subarray(0, l), out_i);
            out_i += l;
            out.set(RETS, out_i);
            out_i += RETS.length;
        }
        out.set(POS, out_i);
        out_i += POS.length;
        out = out.subarray(0, out_i);
    }
    return out;
};

const luaO_hexavalue = function (c: number): number {
    if (lisdigit(c)) return c - 48;
    else return (c & 0xdf) - 55;
};

const UTF8BUFFSZ = 8;

const luaO_utf8esc = function (buff: Uint8Array, x: number): number {
    let n = 1; /* number of bytes put in buffer (backwards) */
    lua_assert(x <= 0x10ffff);
    if (x < 0x80) /* ascii? */ buff[UTF8BUFFSZ - 1] = x;
    else {
        /* need continuation bytes */
        let mfb = 0x3f; /* maximum that fits in first byte */
        do {
            buff[UTF8BUFFSZ - n++] = 0x80 | (x & 0x3f);
            x >>= 6; /* remove added bits */
            mfb >>= 1; /* now there is one less bit available in first byte */
        } while (x > mfb); /* still needs continuation byte? */
        buff[UTF8BUFFSZ - n] = (~mfb << 1) | x; /* add first byte */
    }
    return n;
};

/* maximum number of significant digits to read (to avoid overflows
   even with single floats) */
const MAXSIGDIG = 30;

/*
 ** convert an hexadecimal numeric string to a number, following
 ** C99 specification for 'strtod'
 */
const lua_strx2number = function (
    s: Uint8Array,
): { n: number; i: number } | null {
    let i = 0;
    let r = 0.0; /* result (accumulator) */
    let sigdig = 0; /* number of significant digits */
    let nosigdig = 0; /* number of non-significant digits */
    let e = 0; /* exponent correction */
    let neg; /* 1 if number is negative */
    let hasdot = false; /* true after seen a dot */
    while (lisspace(s[i]!)) i++; /* skip initial spaces */
    if ((neg = s[i]! === 45) /* ('-').charCodeAt(0) */) i++; /* check signal */
    else if (s[i]! === 43 /* ('+').charCodeAt(0) */) i++;
    if (!(
        s[i]! === 48 /* ('0').charCodeAt(0) */ &&
        (s[i + 1]! === 120 /* ('x').charCodeAt(0) */ ||
            s[i + 1]! === 88) /* ('X').charCodeAt(0) */
    ))
        /* check '0x' */
        return null; /* invalid format (no '0x') */
    for (i += 2; ; i++) {
        /* skip '0x' and read numeral */
        if (
            s[i]! ===
            46 /* ('.').charCodeAt(0) i.e. dot/lua_getlocaledecpoint(); */
        ) {
            if (hasdot) break; /* second dot? stop loop */
            else hasdot = true;
        } else if (lisxdigit(s[i]!)) {
            if (sigdig === 0 && s[i]! === 48 /* ('0').charCodeAt(0) */)
                /* non-significant digit (zero)? */
                nosigdig++;
            else if (++sigdig <= MAXSIGDIG)
                /* can read it without overflow? */
                r = r * 16 + luaO_hexavalue(s[i]!);
            else
                e++; /* too many digits; ignore, but still count for exponent */
            if (hasdot) e--; /* decimal digit? correct exponent */
        } else break; /* neither a dot nor a digit */
    }

    if (nosigdig + sigdig === 0)
        /* no digits? */
        return null; /* invalid format */
    e *= 4; /* each digit multiplies/divides value by 2^4 */
    if (
        s[i]! === 112 /* ('p').charCodeAt(0) */ ||
        s[i]! === 80 /* ('P').charCodeAt(0) */
    ) {
        /* exponent part? */
        let exp1 = 0; /* exponent value */
        let neg1; /* exponent signal */
        i++; /* skip 'p' */
        if ((neg1 = s[i]! === 45) /* ('-').charCodeAt(0) */) i++; /* signal */
        else if (s[i]! === 43 /* ('+').charCodeAt(0) */) i++;
        if (!lisdigit(s[i]!))
            return null; /* invalid; must have at least one digit */
        while (lisdigit(s[i]!))
            /* read exponent */
            exp1 = exp1 * 10 + s[i++]! - 48; /* ('0').charCodeAt(0) */
        if (neg1) exp1 = -exp1;
        e += exp1;
    }
    if (neg) r = -r;
    return {
        n: ldexp(r, e),
        i: i,
    };
};

const lua_str2number = function (
    s: Uint8Array,
): { n: number; i: number } | null {
    let s2: string;
    try {
        s2 = to_jsstring(s);
    } catch (_e) {
        return null;
    }
    /* use a regex to validate number and also to get length
       parseFloat ignores trailing junk */
    let r =
        /^[\t\v\f \n\r]*[+-]?(?:[0-9]+\.?[0-9]*|\.[0-9]*)(?:[eE][+-]?[0-9]+)?/.exec(
            s2,
        );
    if (!r) return null;
    let flt = parseFloat(r[0]);
    return !isNaN(flt) ? { n: flt, i: r[0].length } : null;
};

const l_str2dloc = function (
    s: Uint8Array,
    mode: '.' | 'x' | 'n' | undefined,
): { n: number; i: number } | null {
    let result =
        mode === 'x'
            ? lua_strx2number(s)
            : lua_str2number(s); /* try to convert */
    if (result === null) return null;
    while (lisspace(s[result.i]!)) result.i++; /* skip trailing spaces */
    return result.i === s.length || s[result.i]! === 0
        ? result
        : null; /* OK if no trailing characters */
};

const SIGILS: number[] = [
    46 /* (".").charCodeAt(0) */, 120 /* ("x").charCodeAt(0) */,
    88 /* ("X").charCodeAt(0) */, 110 /* ("n").charCodeAt(0) */,
    78 /* ("N").charCodeAt(0) */,
];
const modes: Partial<Record<number, '.' | 'x' | 'n'>> = {
    [46]: '.',
    [120]: 'x',
    [88]: 'x',
    [110]: 'n',
    [78]: 'n',
};
const l_str2d = function (s: Uint8Array): { n: number; i: number } | null {
    let l = s.length;
    let pmode = 0;
    for (let i = 0; i < l; i++) {
        let v = s[i]!;
        if (SIGILS.indexOf(v) !== -1) {
            pmode = v;
            break;
        }
    }
    let mode = modes[pmode];
    if (mode === 'n') /* reject 'inf' and 'nan' */ return null;
    let end = l_str2dloc(s, mode); /* try to convert */
    // if (end === null) {   /* failed? may be a different locale */
    //     throw new Error("Locale not available to handle number"); // TODO
    // }
    return end;
};

const MAXBY10 = Math.floor(MAX_INT / 10);
const MAXLASTD = MAX_INT % 10;

const l_str2int = function (s: Uint8Array): { n: number; i: number } | null {
    let i = 0;
    let a = 0;
    let empty = true;
    let neg;

    while (lisspace(s[i]!)) i++; /* skip initial spaces */
    if ((neg = s[i]! === 45) /* ('-').charCodeAt(0) */) i++;
    else if (s[i]! === 43 /* ('+').charCodeAt(0) */) i++;
    if (
        s[i]! === 48 /* ('0').charCodeAt(0) */ &&
        (s[i + 1]! === 120 /* ('x').charCodeAt(0) */ ||
            s[i + 1]! === 88) /* ('X').charCodeAt(0) */
    ) {
        /* hex? */
        i += 2; /* skip '0x' */
        for (; i < s.length && lisxdigit(s[i]!); i++) {
            a = a * 16 + luaO_hexavalue(s[i]!);
            empty = false;
        }
    } else {
        /* decimal */
        for (; i < s.length && lisdigit(s[i]!); i++) {
            let d = s[i]! - 48; /* ('0').charCodeAt(0) */
            if (a >= MAXBY10 && (a > MAXBY10 || d > MAXLASTD + (neg ? 1 : 0)))
                /* overflow? */
                return null; /* do not accept it (as integer) */
            a = a * 10 + d;
            empty = false;
        }
    }
    while (i < s.length && lisspace(s[i]!)) i++; /* skip trailing spaces */
    if (empty || (i !== s.length && s[i]! !== 0))
        return null; /* something wrong in the numeral */
    else {
        return {
            n: neg ? -a : a,
            i: i,
        };
    }
};

const luaO_str2num = function (s: Uint8Array, o: TValue): number {
    let s2i = l_str2int(s);
    if (s2i !== null) {
        /* try as an integer */
        o.setivalue(s2i.n);
        return s2i.i + 1;
    } else {
        /* else try as a float */
        s2i = l_str2d(s);
        if (s2i !== null) {
            o.setfltvalue(s2i.n);
            return s2i.i + 1;
        } else return 0; /* conversion failed */
    }
};

const luaO_tostring = function (L: lua_State, obj: TValue): void {
    let buff;
    if (obj.ttisinteger()) buff = to_luastring(lua_integer2str(obj.value));
    else {
        let str = lua_number2str(obj.fltvalue());
        if (!LUA_COMPAT_FLOATSTRING && /^[-0123456789]+$/.test(str)) {
            /* looks like an int? */
            str +=
                '.0'; /* adds '.0' to result: lua_getlocaledecpoint removed as optimisation */
        }
        buff = to_luastring(str);
    }
    obj.setsvalue(luaS_bless(L, buff));
};

const pushstr = function (L: lua_State, str: Uint8Array): void {
    ldo.luaD_inctop(L);
    setsvalue2s(L, L.top - 1, luaS_new(L, str));
};

const luaO_pushvfstring = function (
    L: lua_State,
    fmt: Uint8Array,
    argp: unknown[],
): Uint8Array {
    let n = 0;
    let i = 0;
    let a = 0;
    let e;
    for (;;) {
        e = luastring_indexOf(fmt, 37 /* ('%').charCodeAt(0) */, i);
        if (e == -1) break;
        pushstr(L, fmt.subarray(i, e));
        switch (fmt[e + 1]) {
            case 115 /* ('s').charCodeAt(0) */: {
                let s = argp[a++] as Uint8Array | string | null;
                if (s === null) s = to_luastring('(null)', true);
                else {
                    s = from_userstring(s);
                    /* respect null terminator */
                    let i = luastring_indexOf(s, 0);
                    if (i !== -1) s = s.subarray(0, i);
                }
                pushstr(L, s);
                break;
            }
            case 99 /* ('c').charCodeAt(0) */: {
                let buff = argp[a++] as number;
                if (lisprint(buff)) pushstr(L, luastring_of(buff));
                else luaO_pushfstring(L, to_luastring('<\\%d>', true), buff);
                break;
            }
            case 100 /* ('d').charCodeAt(0) */:
            case 73 /* ('I').charCodeAt(0) */:
                ldo.luaD_inctop(L);
                L.stack![L.top - 1]!.setivalue(argp[a++] as number);
                luaO_tostring(L, L.stack![L.top - 1]!);
                break;
            case 102 /* ('f').charCodeAt(0) */:
                ldo.luaD_inctop(L);
                L.stack![L.top - 1]!.setfltvalue(argp[a++] as number);
                luaO_tostring(L, L.stack![L.top - 1]!);
                break;
            case 112 /* ('p').charCodeAt(0) */: {
                let v = argp[a++];
                if (
                    (typeof v === 'object' || typeof v === 'function') &&
                    (v instanceof lstate.lua_State ||
                        v instanceof ltable.Table ||
                        v instanceof Udata ||
                        v instanceof LClosure ||
                        v instanceof CClosure)
                ) {
                    pushstr(L, to_luastring('0x' + v.id.toString(16)));
                } else {
                    switch (typeof v) {
                        case 'undefined':
                            pushstr(L, to_luastring('undefined'));
                            break;
                        case 'number' /* before check object as null is an object */:
                            pushstr(L, to_luastring('Number(' + v + ')'));
                            break;
                        case 'string' /* before check object as null is an object */:
                            pushstr(
                                L,
                                to_luastring(
                                    'String(' + JSON.stringify(v) + ')',
                                ),
                            );
                            break;
                        case 'boolean' /* before check object as null is an object */:
                            pushstr(
                                L,
                                to_luastring(
                                    v ? 'Boolean(true)' : 'Boolean(false)',
                                ),
                            );
                            break;
                        case 'object':
                            if (v === null) {
                                /* null is special */
                                pushstr(L, to_luastring('null'));
                                break;
                            }
                            {
                                let id = L.l_G.ids.get(v);
                                if (!id) {
                                    id = L.l_G.id_counter++;
                                    L.l_G.ids.set(v, id);
                                }
                                pushstr(
                                    L,
                                    to_luastring('0x' + id.toString(16)),
                                );
                                break;
                            }
                        case 'function': {
                            let id = L.l_G.ids.get(v);
                            if (!id) {
                                id = L.l_G.id_counter++;
                                L.l_G.ids.set(v, id);
                            }
                            pushstr(L, to_luastring('0x' + id.toString(16)));
                            break;
                        }
                        default:
                            /* user provided object. no id available */
                            pushstr(L, to_luastring('<id NYI>'));
                    }
                }
                break;
            }
            case 85 /* ('U').charCodeAt(0) */: {
                let buff = new Uint8Array(UTF8BUFFSZ);
                let l = luaO_utf8esc(buff, argp[a++] as number);
                pushstr(L, buff.subarray(UTF8BUFFSZ - l));
                break;
            }
            case 37 /* ('%').charCodeAt(0) */:
                pushstr(L, to_luastring('%', true));
                break;
            default:
                ldebug.luaG_runerror(
                    L,
                    to_luastring("invalid option '%%%c' to 'lua_pushfstring'"),
                    fmt[e + 1],
                );
        }
        n += 2;
        i = e + 2;
    }
    ldo.luaD_checkstack(L, 1);
    pushstr(L, fmt.subarray(i));
    if (n > 0) lvm.luaV_concat(L, n + 1);
    return L.stack![L.top - 1]!.svalue();
};

const luaO_pushfstring = function (
    L: lua_State,
    fmt: Uint8Array,
    ...argp: unknown[]
): Uint8Array {
    return luaO_pushvfstring(L, fmt, argp);
};

/*
 ** converts an integer to a "floating point byte", represented as
 ** (eeeeexxx), where the real value is (1xxx) * 2^(eeeee - 1) if
 ** eeeee !== 0 and (xxx) otherwise.
 */
const luaO_int2fb = function (x: number): number {
    let e = 0; /* exponent */
    if (x < 8) return x;
    while (x >= 8 << 4) {
        /* coarse steps */
        x = (x + 0xf) >> 4; /* x = ceil(x / 16) */
        e += 4;
    }
    while (x >= 8 << 1) {
        /* fine steps */
        x = (x + 1) >> 1; /* x = ceil(x / 2) */
        e++;
    }
    return ((e + 1) << 3) | (x - 8);
};

const intarith = function (
    L: lua_State | null,
    op: number,
    v1: number,
    v2: number,
): number {
    switch (op) {
        case LUA_OPADD:
            return v1 + v2;
        case LUA_OPSUB:
            return v1 - v2;
        case LUA_OPMUL:
            return lvm.luaV_imul(v1, v2);
        case LUA_OPMOD:
            return lvm.luaV_mod(L, v1, v2);
        case LUA_OPIDIV:
            return lvm.luaV_div(L, v1, v2);
        case LUA_OPBAND:
            return v1 & v2;
        case LUA_OPBOR:
            return v1 | v2;
        case LUA_OPBXOR:
            return v1 ^ v2;
        case LUA_OPSHL:
            return lvm.luaV_shiftl(v1, v2);
        case LUA_OPSHR:
            return lvm.luaV_shiftl(v1, -v2);
        case LUA_OPUNM:
            return 0 - v1;
        case LUA_OPBNOT:
            return ~0 ^ v1;
        default:
            lua_assert(false);
            return 0;
    }
};

const numarith = function (
    L: lua_State | null,
    op: number,
    v1: number,
    v2: number,
): number {
    switch (op) {
        case LUA_OPADD:
            return v1 + v2;
        case LUA_OPSUB:
            return v1 - v2;
        case LUA_OPMUL:
            return v1 * v2;
        case LUA_OPDIV:
            return v1 / v2;
        case LUA_OPPOW:
            return Math.pow(v1, v2);
        case LUA_OPIDIV:
            return Math.floor(v1 / v2);
        case LUA_OPUNM:
            return -v1;
        case LUA_OPMOD:
            return luai_nummod(L, v1, v2);
        default:
            lua_assert(false);
            return 0;
    }
};

const luaO_arith = function (
    L: lua_State | null,
    op: number,
    p1: TValue,
    p2: TValue,
    p3: number | TValue,
): void {
    let res: TValue;
    if (typeof p3 === 'number') {
        lua_assert(L !== null);
        res = (L as lua_State).stack![p3]!;
    } else {
        res = p3;
    }

    switch (op) {
        case LUA_OPBAND:
        case LUA_OPBOR:
        case LUA_OPBXOR:
        case LUA_OPSHL:
        case LUA_OPSHR:
        case LUA_OPBNOT: {
            /* operate only on integers */
            let i1, i2;
            if (
                (i1 = lvm.tointeger(p1)) !== false &&
                (i2 = lvm.tointeger(p2)) !== false
            ) {
                res.setivalue(intarith(L, op, i1, i2));
                return;
            } else break; /* go to the end */
        }
        case LUA_OPDIV:
        case LUA_OPPOW: {
            /* operate only on floats */
            let n1, n2;
            if (
                (n1 = lvm.tonumber(p1)) !== false &&
                (n2 = lvm.tonumber(p2)) !== false
            ) {
                res.setfltvalue(numarith(L, op, n1, n2));
                return;
            } else break; /* go to the end */
        }
        default: {
            /* other operations */
            let n1, n2;
            if (p1.ttisinteger() && p2.ttisinteger()) {
                res.setivalue(intarith(L, op, p1.ivalue(), p2.ivalue()));
                return;
            } else if (
                (n1 = lvm.tonumber(p1)) !== false &&
                (n2 = lvm.tonumber(p2)) !== false
            ) {
                res.setfltvalue(numarith(L, op, n1, n2));
                return;
            } else break; /* go to the end */
        }
    }
    /* could not perform raw operation; try metamethod */
    lua_assert(L !== null); /* should not fail when folding (compile time) */
    ltm.luaT_trybinTM(L, p1, p2, p3, op - LUA_OPADD + ltm.TMS.TM_ADD);
};

export {
    luaO_nilobject,
    CClosure,
    LClosure,
    LUA_TDEADKEY,
    LUA_TPROTO,
    LocVar,
    TValue,
    Udata,
    UTF8BUFFSZ,
    luaO_arith,
    luaO_chunkid,
    luaO_hexavalue,
    luaO_int2fb,
    luaO_pushfstring,
    luaO_pushvfstring,
    luaO_str2num,
    luaO_tostring,
    luaO_utf8esc,
    numarith,
    pushobj2s,
    pushsvalue2s,
    setobjs2s,
    setobj2s,
    setsvalue2s,
};
