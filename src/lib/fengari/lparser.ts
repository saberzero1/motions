import { LUA_MULTRET, to_luastring } from './defs.js';
import {
    NO_JUMP,
    getinstruction,
    luaK_checkstack,
    luaK_codeABC,
    luaK_codeABx,
    luaK_codeAsBx,
    luaK_codek,
    luaK_concat,
    luaK_dischargevars,
    luaK_exp2RK,
    luaK_exp2anyreg,
    luaK_exp2anyregup,
    luaK_exp2nextreg,
    luaK_exp2val,
    luaK_fixline,
    luaK_getlabel,
    luaK_goiffalse,
    luaK_goiftrue,
    luaK_indexed,
    luaK_infix,
    luaK_intK,
    luaK_jump,
    luaK_jumpto,
    luaK_nil,
    luaK_patchclose,
    luaK_patchlist,
    luaK_patchtohere,
    luaK_posfix,
    luaK_prefix,
    luaK_reserveregs,
    luaK_ret,
    luaK_self,
    luaK_setlist,
    luaK_setmultret,
    luaK_setoneret,
    luaK_setreturns,
    luaK_storevar,
    luaK_stringK,
    BinOpr,
    UnOpr,
} from './lcode.js';
import * as ldo from './ldo.js';
import * as lfunc from './lfunc.js';
import * as llex from './llex.js';
import { LUAI_MAXCCALLS, MAX_INT, lua_assert } from './llimits.js';
import * as lobject from './lobject.js';
import {
    LFIELDS_PER_FLUSH,
    SETARG_B,
    SETARG_C,
    SET_OPCODE,
    OpCodesI,
} from './lopcodes.js';
import { luaS_eqlngstr, luaS_new, luaS_newliteral } from './lstring.js';
import * as ltable from './ltable.js';
import type { lua_State } from './lstate.js';
import type { LexState } from './llex.js';
import type { TString } from './lstring.js';
import type { LocVar, LClosure } from './lobject.js';
import type { ZIO, MBuffer } from './lzio.js';

const {
    OPR_ADD,
    OPR_AND,
    OPR_BAND,
    OPR_BOR,
    OPR_BXOR,
    OPR_CONCAT,
    OPR_DIV,
    OPR_EQ,
    OPR_GE,
    OPR_GT,
    OPR_IDIV,
    OPR_LE,
    OPR_LT,
    OPR_MOD,
    OPR_MUL,
    OPR_NE,
    OPR_NOBINOPR,
    OPR_OR,
    OPR_POW,
    OPR_SHL,
    OPR_SHR,
    OPR_SUB,
} = BinOpr;
const { OPR_BNOT, OPR_LEN, OPR_MINUS, OPR_NOT, OPR_NOUNOPR } = UnOpr;
const {
    OP_CALL,
    OP_CLOSURE,
    OP_FORLOOP,
    OP_FORPREP,
    OP_GETUPVAL,
    OP_MOVE,
    OP_NEWTABLE,
    OP_SETTABLE,
    OP_TAILCALL,
    OP_TFORCALL,
    OP_TFORLOOP,
    OP_VARARG,
} = OpCodesI;

const Proto = lfunc.Proto;
const R = llex.RESERVED;
type Instruction = {
    code: number;
    opcode: number;
    A: number;
    B: number;
    C: number;
    Bx: number;
    Ax: number;
    sBx: number;
};

const MAXVARS = 200;

const hasmultret = function (k: number): boolean {
    return k === expkind.VCALL || k === expkind.VVARARG;
};

const eqstr = function (a: TString, b: TString): boolean {
    /* TODO: use plain equality as strings are cached */
    return luaS_eqlngstr(a, b);
};

class BlockCnt {
    previous: BlockCnt | null;
    firstlabel: number;
    firstgoto: number;
    nactvar: number;
    upval: boolean;
    isloop: boolean;

    constructor() {
        this.previous = null; /* chain */
        this.firstlabel = NaN; /* index of first label in this block */
        this.firstgoto = NaN; /* index of first pending goto in this block */
        this.nactvar = NaN; /* # active locals outside the block */
        this.upval = false; /* true if some variable in the block is an upvalue */
        this.isloop = false; /* true if 'block' is a loop */
    }
}

const expkind = {
    VVOID: 0 /* when 'expdesc' describes the last expression a list,
                        this kind means an empty list (so, no expression) */,
    VNIL: 1 /* constant nil */,
    VTRUE: 2 /* constant true */,
    VFALSE: 3 /* constant false */,
    VK: 4 /* constant in 'k'; info = index of constant in 'k' */,
    VKFLT: 5 /* floating constant; nval = numerical float value */,
    VKINT: 6 /* integer constant; nval = numerical integer value */,
    VNONRELOC: 7 /* expression has its value in a fixed register;
                        info = result register */,
    VLOCAL: 8 /* local variable; info = local register */,
    VUPVAL: 9 /* upvalue variable; info = index of upvalue in 'upvalues' */,
    VINDEXED: 10 /* indexed variable;
                        ind.vt = whether 't' is register or upvalue;
                        ind.t = table register or upvalue;
                        ind.idx = key's R/K index */,
    VJMP: 11 /* expression is a test/comparison;
                        info = pc of corresponding jump instruction */,
    VRELOCABLE: 12 /* expression can put result in any register;
                        info = instruction pc */,
    VCALL: 13 /* expression is a function call; info = instruction pc */,
    VVARARG: 14 /* vararg expression; info = instruction pc */,
};

const vkisvar = function (k: number): boolean {
    return expkind.VLOCAL <= k && k <= expkind.VINDEXED;
};

const vkisinreg = function (k: number): boolean {
    return k === expkind.VNONRELOC || k === expkind.VLOCAL;
};

class expdesc {
    k: number;
    u: {
        ival: number;
        nval: number;
        info: number;
        ind: {
            idx: number;
            t: number;
            vt: number;
        };
    };
    t: number;
    f: number;

    constructor() {
        this.k = NaN;
        this.u = {
            ival: NaN /* for VKINT */,
            nval: NaN /* for VKFLT */,
            info: NaN /* for generic use */,
            ind: {
                /* for indexed variables (VINDEXED) */
                idx: NaN /* index (R/K) */,
                t: NaN /* table (register or upvalue) */,
                vt: NaN /* whether 't' is register (VLOCAL) or upvalue (VUPVAL) */,
            },
        };
        this.t = NaN; /* patch list of 'exit when true' */
        this.f = NaN; /* patch list of 'exit when false' */
    }

    to(e: expdesc): void {
        // Copy e content to this, cf. luaK_posfix
        this.k = e.k;
        this.u = e.u;
        this.t = e.t;
        this.f = e.f;
    }
}

class FuncState {
    f: lfunc.Proto;
    prev: FuncState | null;
    ls: LexState;
    L: lua_State;
    bl: BlockCnt | null;
    pc: number;
    lasttarget: number;
    jpc: number;
    nk: number;
    np: number;
    firstlocal: number;
    nlocvars: number;
    nactvar: number;
    nups: number;
    freereg: number;

    constructor() {
        this.f = null as unknown as lfunc.Proto; /* current function header */
        this.prev = null; /* enclosing function */
        this.ls = null as unknown as LexState; /* lexical state */
        this.L = null as unknown as lua_State;
        this.bl = null; /* chain of current blocks */
        this.pc = NaN; /* next position to code (equivalent to 'ncode') */
        this.lasttarget = NaN; /* 'label' of last 'jump label' */
        this.jpc = NaN; /* list of pending jumps to 'pc' */
        this.nk = NaN; /* number of elements in 'k' */
        this.np = NaN; /* number of elements in 'p' */
        this.firstlocal = NaN; /* index of first local var (in Dyndata array) */
        this.nlocvars = NaN; /* number of elements in 'f->locvars' */
        this.nactvar = NaN; /* number of active local variables */
        this.nups = NaN; /* number of upvalues */
        this.freereg = NaN; /* first free register */
    }
}

/* description of active local variable */
class Vardesc {
    idx: number;

    constructor() {
        this.idx = NaN; /* variable index in stack */
    }
}

/* description of pending goto statements and label statements */
class Labeldesc {
    name: TString | null;
    pc: number;
    line: number;
    nactvar: number;

    constructor() {
        this.name = null; /* label identifier */
        this.pc = NaN; /* position in code */
        this.line = NaN; /* line where it appeared */
        this.nactvar = NaN; /* local level where it appears in current block */
    }
}

/* list of labels or gotos */
class Labellist {
    arr: Labeldesc[];
    n: number;
    size: number;

    constructor() {
        this.arr = []; /* array */
        this.n = NaN; /* number of entries in use */
        this.size = NaN; /* array size */
    }
}

/* dynamic structures used by the parser */
class Dyndata {
    actvar: {
        arr: Vardesc[];
        n: number;
        size: number;
    };
    gt: Labellist;
    label: Labellist;

    constructor() {
        this.actvar = {
            /* list of active local variables */
            arr: [],
            n: NaN,
            size: NaN,
        };
        this.gt = new Labellist();
        this.label = new Labellist();
    }
}

const get_fs = function (ls: LexState): FuncState {
    return ls.fs as FuncState;
};

const semerror = function (ls: LexState, msg: Uint8Array): void {
    ls.t.token = 0; /* remove "near <token>" from final message */
    llex.luaX_syntaxerror(ls, msg);
};

const error_expected = function (ls: LexState, token: number): void {
    llex.luaX_syntaxerror(
        ls,
        lobject.luaO_pushfstring(
            ls.L!,
            to_luastring('%s expected', true),
            llex.luaX_token2str(ls, token),
        ),
    );
};

const errorlimit = function (
    fs: FuncState,
    limit: number,
    what: Uint8Array,
): void {
    let L = fs.ls.L;
    let line = fs.f.linedefined;
    let where =
        line === 0
            ? to_luastring('main function', true)
            : lobject.luaO_pushfstring(
                  L!,
                  to_luastring('function at line %d', true),
                  line,
              );
    let msg = lobject.luaO_pushfstring(
        L!,
        to_luastring('too many %s (limit is %d) in %s', true),
        what,
        limit,
        where,
    );
    llex.luaX_syntaxerror(fs.ls, msg);
};

const checklimit = function (
    fs: FuncState,
    v: number,
    l: number,
    what: Uint8Array,
): void {
    if (v > l) errorlimit(fs, l, what);
};

const testnext = function (ls: LexState, c: number): boolean {
    if (ls.t.token === c) {
        llex.luaX_next(ls);
        return true;
    }

    return false;
};

const check = function (ls: LexState, c: number): void {
    if (ls.t.token !== c) error_expected(ls, c);
};

const checknext = function (ls: LexState, c: number): void {
    check(ls, c);
    llex.luaX_next(ls);
};

const check_condition = function (
    ls: LexState,
    c: boolean,
    msg: Uint8Array,
): void {
    if (!c) llex.luaX_syntaxerror(ls, msg);
};

const check_match = function (
    ls: LexState,
    what: number,
    who: number,
    where: number,
): void {
    if (!testnext(ls, what)) {
        if (where === ls.linenumber) error_expected(ls, what);
        else
            llex.luaX_syntaxerror(
                ls,
                lobject.luaO_pushfstring(
                    ls.L!,
                    to_luastring('%s expected (to close %s at line %d)'),
                    llex.luaX_token2str(ls, what),
                    llex.luaX_token2str(ls, who),
                    where,
                ),
            );
    }
};

const str_checkname = function (ls: LexState): TString {
    check(ls, R.TK_NAME);
    let ts = ls.t.seminfo.ts!;
    llex.luaX_next(ls);
    return ts;
};

const init_exp = function (e: expdesc, k: number, i: number): void {
    e.f = e.t = NO_JUMP;
    e.k = k;
    e.u.info = i;
};

const codestring = function (ls: LexState, e: expdesc, s: TString): void {
    init_exp(e, expkind.VK, luaK_stringK(get_fs(ls), s));
};

const checkname = function (ls: LexState, e: expdesc): void {
    codestring(ls, e, str_checkname(ls));
};

const registerlocalvar = function (ls: LexState, varname: TString): number {
    let fs = get_fs(ls);
    let f = fs.f;
    f.locvars[fs.nlocvars] = new lobject.LocVar();
    f.locvars[fs.nlocvars]!.varname = varname;
    return fs.nlocvars++;
};

const new_localvar = function (ls: LexState, name: TString): void {
    let fs = get_fs(ls);
    let dyd = ls.dyd;
    let reg = registerlocalvar(ls, name);
    checklimit(
        fs,
        dyd!.actvar.n + 1 - fs.firstlocal,
        MAXVARS,
        to_luastring('local variables', true),
    );
    dyd!.actvar.arr[dyd!.actvar.n] = new Vardesc();
    dyd!.actvar.arr[dyd!.actvar.n]!.idx = reg;
    dyd!.actvar.n++;
};

const new_localvarliteral = function (ls: LexState, name: string): void {
    new_localvar(ls, llex.luaX_newstring(ls, to_luastring(name, true)));
};

const getlocvar = function (fs: FuncState, i: number): LocVar {
    let idx = fs.ls.dyd!.actvar.arr[fs.firstlocal + i]!.idx;
    lua_assert(idx < fs.nlocvars);
    return fs.f.locvars[idx]!;
};

const adjustlocalvars = function (ls: LexState, nvars: number): void {
    let fs = get_fs(ls);
    fs.nactvar = fs.nactvar + nvars;
    for (; nvars; nvars--) getlocvar(fs, fs.nactvar - nvars).startpc = fs.pc;
};

const removevars = function (fs: FuncState, tolevel: number): void {
    fs.ls.dyd!.actvar.n -= fs.nactvar - tolevel;
    while (fs.nactvar > tolevel) getlocvar(fs, --fs.nactvar).endpc = fs.pc;
};

const searchupvalue = function (fs: FuncState, name: TString): number {
    let up = fs.f.upvalues;
    for (let i = 0; i < fs.nups; i++) {
        if (eqstr(up[i]!.name!, name)) return i;
    }
    return -1; /* not found */
};

const newupvalue = function (fs: FuncState, name: TString, v: expdesc): number {
    let f = fs.f;
    checklimit(fs, fs.nups + 1, lfunc.MAXUPVAL, to_luastring('upvalues', true));
    f.upvalues[fs.nups] = {
        instack: v.k === expkind.VLOCAL ? 1 : 0,
        idx: v.u.info,
        name: name,
    };
    return fs.nups++;
};

const searchvar = function (fs: FuncState, n: TString): number {
    for (let i = fs.nactvar - 1; i >= 0; i--) {
        if (eqstr(n, getlocvar(fs, i).varname!)) return i;
    }

    return -1;
};

/*
 ** Mark block where variable at given level was defined
 ** (to emit close instructions later).
 */
const markupval = function (fs: FuncState, level: number): void {
    let bl = fs.bl!;
    while (bl.nactvar > level) bl = bl.previous!;
    bl.upval = true;
};

/*
 ** Find variable with given name 'n'. If it is an upvalue, add this
 ** upvalue into all intermediate functions.
 */
const singlevaraux = function (
    fs: FuncState | null,
    n: TString,
    vr: expdesc,
    base: number,
): void {
    if (fs === null)
        /* no more levels? */
        init_exp(vr, expkind.VVOID, 0); /* default is global */
    else {
        let v = searchvar(fs, n); /* look up locals at current level */
        if (v >= 0) {
            /* found? */
            init_exp(vr, expkind.VLOCAL, v); /* variable is local */
            if (!base) markupval(fs, v); /* local will be used as an upval */
        } else {
            /* not found as local at current level; try upvalues */
            let idx = searchupvalue(fs, n); /* try existing upvalues */
            if (idx < 0) {
                /* not found? */
                singlevaraux(fs.prev, n, vr, 0); /* try upper levels */
                if (vr.k === expkind.VVOID)
                    /* not found? */
                    return; /* it is a global */
                /* else was LOCAL or UPVAL */
                idx = newupvalue(fs, n, vr); /* will be a new upvalue */
            }
            init_exp(vr, expkind.VUPVAL, idx); /* new or old upvalue */
        }
    }
};

const singlevar = function (ls: LexState, vr: expdesc): void {
    let varname = str_checkname(ls);
    let fs = get_fs(ls);
    singlevaraux(fs, varname, vr, 1);
    if (vr.k === expkind.VVOID) {
        /* is global name? */
        let key = new expdesc();
        singlevaraux(fs, ls.envn!, vr, 1); /* get environment variable */
        lua_assert(vr.k !== expkind.VVOID); /* this one must exist */
        codestring(ls, key, varname); /* key is variable name */
        luaK_indexed(fs, vr, key); /* env[varname] */
    }
};

const adjust_assign = function (
    ls: LexState,
    nvars: number,
    nexps: number,
    e: expdesc,
): void {
    let extra = nvars - nexps;
    if (hasmultret(e.k)) {
        extra++; /* includes call itself */
        if (extra < 0) extra = 0;
        luaK_setreturns(
            get_fs(ls),
            e,
            extra,
        ); /* last exp. provides the difference */
        if (extra > 1) luaK_reserveregs(get_fs(ls), extra - 1);
    } else {
        if (e.k !== expkind.VVOID)
            luaK_exp2nextreg(get_fs(ls), e); /* close last expression */
        if (extra > 0) {
            let reg = get_fs(ls).freereg;
            luaK_reserveregs(get_fs(ls), extra);
            luaK_nil(get_fs(ls), reg, extra);
        }
    }
    if (nexps > nvars)
        get_fs(ls).freereg -= nexps - nvars; /* remove extra values */
};

const enterlevel = function (ls: LexState): void {
    let L = ls.L;
    ++L!.nCcalls;
    checklimit(
        get_fs(ls),
        L!.nCcalls,
        LUAI_MAXCCALLS,
        to_luastring('JS levels', true),
    );
};

const leavelevel = function (ls: LexState): number {
    return ls.L!.nCcalls--;
};

const closegoto = function (ls: LexState, g: number, label: Labeldesc): void {
    let fs = get_fs(ls);
    let gl = ls.dyd!.gt;
    let gt = gl.arr[g]!;
    lua_assert(eqstr(gt.name!, label.name!));
    if (gt.nactvar < label.nactvar) {
        let vname = getlocvar(fs, gt.nactvar).varname!;
        let msg = lobject.luaO_pushfstring(
            ls.L!,
            to_luastring(
                "<goto %s> at line %d jumps into the scope of local '%s'",
            ),
            gt.name!.getstr(),
            gt.line,
            vname.getstr(),
        );
        semerror(ls, msg);
    }
    luaK_patchlist(fs, gt.pc, label.pc);
    /* remove goto from pending list */
    for (let i = g; i < gl.n - 1; i++) gl.arr[i] = gl.arr[i + 1]!;
    gl.n--;
};

/*
 ** try to close a goto with existing labels; this solves backward jumps
 */
const findlabel = function (ls: LexState, g: number): boolean {
    let bl = get_fs(ls).bl!;
    let dyd = ls.dyd!;
    let gt = dyd.gt.arr[g]!;
    /* check labels in current block for a match */
    for (let i = bl.firstlabel; i < dyd.label.n; i++) {
        let lb = dyd.label.arr[i]!;
        if (eqstr(lb.name!, gt.name!)) {
            /* correct label? */
            if (
                gt.nactvar > lb.nactvar &&
                (bl.upval || dyd.label.n > bl.firstlabel)
            )
                luaK_patchclose(get_fs(ls), gt.pc, lb.nactvar);
            closegoto(ls, g, lb); /* close it */
            return true;
        }
    }
    return false; /* label not found; cannot close goto */
};

const newlabelentry = function (
    ls: LexState,
    l: Labellist,
    name: TString,
    line: number,
    pc: number,
): number {
    let n = l.n;
    l.arr[n] = new Labeldesc();
    l.arr[n].name = name;
    l.arr[n].line = line;
    l.arr[n].nactvar = get_fs(ls).nactvar;
    l.arr[n].pc = pc;
    l.n = n + 1;
    return n;
};

/*
 ** check whether new label 'lb' matches any pending gotos in current
 ** block; solves forward jumps
 */
const findgotos = function (ls: LexState, lb: Labeldesc): void {
    let gl = ls.dyd!.gt;
    let i = get_fs(ls).bl!.firstgoto;
    while (i < gl.n) {
        if (eqstr(gl.arr[i]!.name!, lb.name!)) closegoto(ls, i, lb);
        else i++;
    }
};

/*
 ** export pending gotos to outer level, to check them against
 ** outer labels; if the block being exited has upvalues, and
 ** the goto exits the scope of any variable (which can be the
 ** upvalue), close those variables being exited.
 */
const movegotosout = function (fs: FuncState, bl: BlockCnt): void {
    let i = bl.firstgoto;
    let gl = fs.ls.dyd!.gt;
    /* correct pending gotos to current block and try to close it
       with visible labels */
    while (i < gl.n) {
        let gt = gl.arr[i]!;
        if (gt.nactvar > bl.nactvar) {
            if (bl.upval) luaK_patchclose(fs, gt.pc, bl.nactvar);
            gt.nactvar = bl.nactvar;
        }
        if (!findlabel(fs.ls, i)) i++; /* move to next one */
    }
};

const enterblock = function (
    fs: FuncState,
    bl: BlockCnt,
    isloop: boolean,
): void {
    bl.isloop = isloop;
    bl.nactvar = fs.nactvar;
    bl.firstlabel = fs.ls.dyd!.label.n;
    bl.firstgoto = fs.ls.dyd!.gt.n;
    bl.upval = false;
    bl.previous = fs.bl;
    fs.bl = bl;
    lua_assert(fs.freereg === fs.nactvar);
};

/*
 ** create a label named 'break' to resolve break statements
 */
const breaklabel = function (ls: LexState): void {
    let n = luaS_newliteral(ls.L!, 'break');
    let l = newlabelentry(ls, ls.dyd!.label, n, 0, get_fs(ls).pc);
    findgotos(ls, ls.dyd!.label.arr[l]!);
};

/*
 ** generates an error for an undefined 'goto'; choose appropriate
 ** message when label name is a reserved word (which can only be 'break')
 */
const undefgoto = function (ls: LexState, gt: Labeldesc): void {
    let msg = llex.isreserved(gt.name!)
        ? '<%s> at line %d not inside a loop'
        : "no visible label '%s' for <goto> at line %d";
    let errmsg = lobject.luaO_pushfstring(
        ls.L!,
        to_luastring(msg),
        gt.name!.getstr(),
        gt.line,
    );
    semerror(ls, errmsg);
};

/*
 ** adds a new prototype into list of prototypes
 */
const addprototype = function (ls: LexState): lfunc.Proto {
    let L = ls.L!;
    let clp = new Proto(L);
    let fs = get_fs(ls);
    let f = fs.f; /* prototype of current function */
    f.p[fs.np++] = clp;
    return clp;
};

/*
 ** codes instruction to create new closure in parent function.
 */
const codeclosure = function (ls: LexState, v: expdesc): void {
    let fs = get_fs(ls).prev!;
    init_exp(v, expkind.VRELOCABLE, luaK_codeABx(fs, OP_CLOSURE, 0, fs.np - 1));
    luaK_exp2nextreg(fs, v); /* fix it at the last register */
};

const open_func = function (ls: LexState, fs: FuncState, bl: BlockCnt): void {
    fs.prev = ls.fs;
    fs.ls = ls;
    fs.L = ls.L!;
    ls.fs = fs;
    fs.pc = 0;
    fs.lasttarget = 0;
    fs.jpc = NO_JUMP;
    fs.freereg = 0;
    fs.nk = 0;
    fs.np = 0;
    fs.nups = 0;
    fs.nlocvars = 0;
    fs.nactvar = 0;
    fs.firstlocal = ls.dyd!.actvar.n;
    fs.bl = null;
    let f = fs.f;
    f.source = ls.source;
    f.maxstacksize = 2; /* registers 0/1 are always valid */
    enterblock(fs, bl, false);
};

const leaveblock = function (fs: FuncState): void {
    let bl = fs.bl!;
    let ls = fs.ls;
    if (bl.previous && bl.upval) {
        /* create a 'jump to here' to close upvalues */
        let j = luaK_jump(fs);
        luaK_patchclose(fs, j, bl.nactvar);
        luaK_patchtohere(fs, j);
    }

    if (bl.isloop) breaklabel(ls); /* close pending breaks */

    fs.bl = bl.previous;
    removevars(fs, bl.nactvar);
    lua_assert(bl.nactvar === fs.nactvar);
    fs.freereg = fs.nactvar; /* free registers */
    ls.dyd!.label.n = bl.firstlabel; /* remove local labels */
    if (bl.previous)
        /* inner block? */
        movegotosout(fs, bl); /* update pending gotos to outer block */
    else if (bl.firstgoto < ls.dyd!.gt.n)
        /* pending gotos in outer block? */
        undefgoto(ls, ls.dyd!.gt.arr[bl.firstgoto]!); /* error */
};

const close_func = function (ls: LexState): void {
    let fs = get_fs(ls);
    luaK_ret(fs, 0, 0); /* final return */
    leaveblock(fs);
    lua_assert(fs.bl === null);
    ls.fs = fs.prev;
};

/*============================================================*/
/* GRAMMAR RULES */
/*============================================================*/

const block_follow = function (ls: LexState, withuntil: boolean): boolean {
    switch (ls.t.token) {
        case R.TK_ELSE:
        case R.TK_ELSEIF:
        case R.TK_END:
        case R.TK_EOS:
            return true;
        case R.TK_UNTIL:
            return withuntil;
        default:
            return false;
    }
};

const statlist = function (ls: LexState): void {
    /* statlist -> { stat [';'] } */
    while (!block_follow(ls, true)) {
        if (ls.t.token === R.TK_RETURN) {
            statement(ls);
            return; /* 'return' must be last statement */
        }
        statement(ls);
    }
};

const fieldsel = function (ls: LexState, v: expdesc): void {
    /* fieldsel -> ['.' | ':'] NAME */
    let fs = get_fs(ls);
    let key = new expdesc();
    luaK_exp2anyregup(fs, v);
    llex.luaX_next(ls); /* skip the dot or colon */
    checkname(ls, key);
    luaK_indexed(fs, v, key);
};

const yindex = function (ls: LexState, v: expdesc): void {
    /* index -> '[' expr ']' */
    llex.luaX_next(ls); /* skip the '[' */
    expr(ls, v);
    luaK_exp2val(get_fs(ls), v);
    checknext(ls, 93 /* (']').charCodeAt(0) */);
};

/*
 ** {======================================================================
 ** Rules for Constructors
 ** =======================================================================
 */

class ConsControl {
    v: expdesc;
    t: expdesc;
    nh: number;
    na: number;
    tostore: number;

    constructor() {
        this.v = new expdesc(); /* last list item read */
        this.t = new expdesc(); /* table descriptor */
        this.nh = NaN; /* total number of 'record' elements */
        this.na = NaN; /* total number of array elements */
        this.tostore = NaN; /* number of array elements pending to be stored */
    }
}

const recfield = function (ls: LexState, cc: ConsControl): void {
    /* recfield -> (NAME | '['exp1']') = exp1 */
    let fs = get_fs(ls);
    let reg = fs.freereg;
    let key = new expdesc();
    let val = new expdesc();

    if (ls.t.token === R.TK_NAME) {
        checklimit(
            fs,
            cc.nh,
            MAX_INT,
            to_luastring('items in a constructor', true),
        );
        checkname(ls, key);
    } else /* ls->t.token === '[' */ yindex(ls, key);
    cc.nh++;
    checknext(ls, 61 /* ('=').charCodeAt(0) */);
    let rkkey = luaK_exp2RK(fs, key);
    expr(ls, val);
    luaK_codeABC(fs, OP_SETTABLE, cc.t.u.info, rkkey, luaK_exp2RK(fs, val));
    fs.freereg = reg; /* free registers */
};

const closelistfield = function (fs: FuncState, cc: ConsControl): void {
    if (cc.v.k === expkind.VVOID) return; /* there is no list item */
    luaK_exp2nextreg(fs, cc.v);
    cc.v.k = expkind.VVOID;
    if (cc.tostore === LFIELDS_PER_FLUSH) {
        luaK_setlist(fs, cc.t.u.info, cc.na, cc.tostore); /* flush */
        cc.tostore = 0; /* no more items pending */
    }
};

const lastlistfield = function (fs: FuncState, cc: ConsControl): void {
    if (cc.tostore === 0) return;
    if (hasmultret(cc.v.k)) {
        luaK_setmultret(fs, cc.v);
        luaK_setlist(fs, cc.t.u.info, cc.na, LUA_MULTRET);
        cc.na--; /* do not count last expression (unknown number of elements) */
    } else {
        if (cc.v.k !== expkind.VVOID) luaK_exp2nextreg(fs, cc.v);
        luaK_setlist(fs, cc.t.u.info, cc.na, cc.tostore);
    }
};

const listfield = function (ls: LexState, cc: ConsControl): void {
    /* listfield -> exp */
    expr(ls, cc.v);
    checklimit(
        get_fs(ls),
        cc.na,
        MAX_INT,
        to_luastring('items in a constructor', true),
    );
    cc.na++;
    cc.tostore++;
};

const field = function (ls: LexState, cc: ConsControl): void {
    /* field -> listfield | recfield */
    switch (ls.t.token) {
        case R.TK_NAME: {
            /* may be 'listfield' or 'recfield' */
            if (llex.luaX_lookahead(ls) !== 61 /* ('=').charCodeAt(0) */)
                /* expression? */
                listfield(ls, cc);
            else recfield(ls, cc);
            break;
        }
        case 91 /* ('[').charCodeAt(0) */: {
            recfield(ls, cc);
            break;
        }
        default: {
            listfield(ls, cc);
            break;
        }
    }
};

const constructor = function (ls: LexState, t: expdesc): void {
    /* constructor -> '{' [ field { sep field } [sep] ] '}'
       sep -> ',' | ';' */
    let fs = get_fs(ls);
    let line = ls.linenumber;
    let pc = luaK_codeABC(fs, OP_NEWTABLE, 0, 0, 0);
    let cc = new ConsControl();
    cc.na = cc.nh = cc.tostore = 0;
    cc.t = t;
    init_exp(t, expkind.VRELOCABLE, pc);
    init_exp(cc.v, expkind.VVOID, 0); /* no value (yet) */
    luaK_exp2nextreg(get_fs(ls), t); /* fix it at stack top */
    checknext(ls, 123 /* ('{').charCodeAt(0) */);
    do {
        lua_assert(cc.v.k === expkind.VVOID || cc.tostore > 0);
        if (ls.t.token === 125 /* ('}').charCodeAt(0) */) break;
        closelistfield(fs, cc);
        field(ls, cc);
    } while (
        testnext(ls, 44 /* (',').charCodeAt(0) */) ||
        testnext(ls, 59 /* (';').charCodeAt(0) */)
    );
    check_match(
        ls,
        125 /* ('}').charCodeAt(0) */,
        123 /* ('{').charCodeAt(0) */,
        line,
    );
    lastlistfield(fs, cc);
    SETARG_B(
        (fs.f.code as unknown as Instruction[])[pc]!,
        lobject.luaO_int2fb(cc.na),
    ); /* set initial array size */
    SETARG_C(
        (fs.f.code as unknown as Instruction[])[pc]!,
        lobject.luaO_int2fb(cc.nh),
    ); /* set initial table size */
};

/* }====================================================================== */

const parlist = function (ls: LexState): void {
    /* parlist -> [ param { ',' param } ] */
    let fs = get_fs(ls);
    let f = fs.f;
    let nparams = 0;
    f.is_vararg = false;
    if (ls.t.token !== 41 /* (')').charCodeAt(0) */) {
        /* is 'parlist' not empty? */
        do {
            switch (ls.t.token) {
                case R.TK_NAME: {
                    /* param -> NAME */
                    new_localvar(ls, str_checkname(ls));
                    nparams++;
                    break;
                }
                case R.TK_DOTS: {
                    /* param -> '...' */
                    llex.luaX_next(ls);
                    f.is_vararg = true; /* declared vararg */
                    break;
                }
                default:
                    llex.luaX_syntaxerror(
                        ls,
                        to_luastring("<name> or '...' expected", true),
                    );
            }
        } while (!f.is_vararg && testnext(ls, 44 /* (',').charCodeAt(0) */));
    }
    adjustlocalvars(ls, nparams);
    f.numparams = fs.nactvar;
    luaK_reserveregs(fs, fs.nactvar); /* reserve register for parameters */
};

const body = function (
    ls: LexState,
    e: expdesc,
    ismethod: boolean,
    line: number,
): void {
    /* body ->  '(' parlist ')' block END */
    let new_fs = new FuncState();
    let bl = new BlockCnt();
    new_fs.f = addprototype(ls);
    new_fs.f.linedefined = line;
    open_func(ls, new_fs, bl);
    checknext(ls, 40 /* ('(').charCodeAt(0) */);
    if (ismethod) {
        new_localvarliteral(ls, 'self'); /* create 'self' parameter */
        adjustlocalvars(ls, 1);
    }
    parlist(ls);
    checknext(ls, 41 /* (')').charCodeAt(0) */);
    statlist(ls);
    new_fs.f.lastlinedefined = ls.linenumber;
    check_match(ls, R.TK_END, R.TK_FUNCTION, line);
    codeclosure(ls, e);
    close_func(ls);
};

const explist = function (ls: LexState, v: expdesc): number {
    /* explist -> expr { ',' expr } */
    let n = 1; /* at least one expression */
    expr(ls, v);
    while (testnext(ls, 44 /* (',').charCodeAt(0) */)) {
        luaK_exp2nextreg(get_fs(ls), v);
        expr(ls, v);
        n++;
    }
    return n;
};

const funcargs = function (ls: LexState, f: expdesc, line: number): void {
    let fs = get_fs(ls);
    let args = new expdesc();
    switch (ls.t.token) {
        case 40 /* ('(').charCodeAt(0) */: {
            /* funcargs -> '(' [ explist ] ')' */
            llex.luaX_next(ls);
            const currentToken = ls.t.token as number;
            if (currentToken === 41 /* (')').charCodeAt(0) */)
                /* arg list is empty? */
                args.k = expkind.VVOID;
            else {
                explist(ls, args);
                luaK_setmultret(fs, args);
            }
            check_match(
                ls,
                41 /* (')').charCodeAt(0) */,
                40 /* ('(').charCodeAt(0) */,
                line,
            );
            break;
        }
        case 123 /* ('{').charCodeAt(0) */: {
            /* funcargs -> constructor */
            constructor(ls, args);
            break;
        }
        case R.TK_STRING: {
            /* funcargs -> STRING */
            codestring(ls, args, ls.t.seminfo.ts!);
            llex.luaX_next(ls); /* must use 'seminfo' before 'next' */
            break;
        }
        default: {
            llex.luaX_syntaxerror(
                ls,
                to_luastring('function arguments expected', true),
            );
        }
    }
    lua_assert(f.k === expkind.VNONRELOC);
    let nparams;
    let base = f.u.info; /* base register for call */
    if (hasmultret(args.k)) nparams = LUA_MULTRET; /* open call */
    else {
        if (args.k !== expkind.VVOID)
            luaK_exp2nextreg(fs, args); /* close last argument */
        nparams = fs.freereg - (base + 1);
    }
    init_exp(f, expkind.VCALL, luaK_codeABC(fs, OP_CALL, base, nparams + 1, 2));
    luaK_fixline(fs, line);
    fs.freereg =
        base +
        1; /* call remove function and arguments and leaves (unless changed) one result */
};

/*
 ** {======================================================================
 ** Expression parsing
 ** =======================================================================
 */

const primaryexp = function (ls: LexState, v: expdesc): void {
    /* primaryexp -> NAME | '(' expr ')' */
    switch (ls.t.token) {
        case 40 /* ('(').charCodeAt(0) */: {
            let line = ls.linenumber;
            llex.luaX_next(ls);
            expr(ls, v);
            check_match(
                ls,
                41 /* (')').charCodeAt(0) */,
                40 /* ('(').charCodeAt(0) */,
                line,
            );
            luaK_dischargevars(get_fs(ls), v);
            return;
        }
        case R.TK_NAME: {
            singlevar(ls, v);
            return;
        }
        default: {
            llex.luaX_syntaxerror(ls, to_luastring('unexpected symbol', true));
        }
    }
};

const suffixedexp = function (ls: LexState, v: expdesc): void {
    /* suffixedexp ->
       primaryexp { '.' NAME | '[' exp ']' | ':' NAME funcargs | funcargs } */
    let fs = get_fs(ls);
    let line = ls.linenumber;
    primaryexp(ls, v);
    for (;;) {
        switch (ls.t.token) {
            case 46 /* ('.').charCodeAt(0) */: {
                /* fieldsel */
                fieldsel(ls, v);
                break;
            }
            case 91 /* ('[').charCodeAt(0) */: {
                /* '[' exp1 ']' */
                let key = new expdesc();
                luaK_exp2anyregup(fs, v);
                yindex(ls, key);
                luaK_indexed(fs, v, key);
                break;
            }
            case 58 /* (':').charCodeAt(0) */: {
                /* ':' NAME funcargs */
                let key = new expdesc();
                llex.luaX_next(ls);
                checkname(ls, key);
                luaK_self(fs, v, key);
                funcargs(ls, v, line);
                break;
            }
            case 40 /* ('(').charCodeAt(0) */:
            case R.TK_STRING:
            case 123 /* ('{').charCodeAt(0) */: {
                /* funcargs */
                luaK_exp2nextreg(fs, v);
                funcargs(ls, v, line);
                break;
            }
            default:
                return;
        }
    }
};

const simpleexp = function (ls: LexState, v: expdesc): void {
    /* simpleexp -> FLT | INT | STRING | NIL | TRUE | FALSE | ... |
       constructor | FUNCTION body | suffixedexp */
    switch (ls.t.token) {
        case R.TK_FLT: {
            init_exp(v, expkind.VKFLT, 0);
            v.u.nval = ls.t.seminfo.r;
            break;
        }
        case R.TK_INT: {
            init_exp(v, expkind.VKINT, 0);
            v.u.ival = ls.t.seminfo.i;
            break;
        }
        case R.TK_STRING: {
            codestring(ls, v, ls.t.seminfo.ts!);
            break;
        }
        case R.TK_NIL: {
            init_exp(v, expkind.VNIL, 0);
            break;
        }
        case R.TK_TRUE: {
            init_exp(v, expkind.VTRUE, 0);
            break;
        }
        case R.TK_FALSE: {
            init_exp(v, expkind.VFALSE, 0);
            break;
        }
        case R.TK_DOTS: {
            /* vararg */
            let fs = get_fs(ls);
            check_condition(
                ls,
                fs.f.is_vararg,
                to_luastring(
                    "cannot use '...' outside a vararg function",
                    true,
                ),
            );
            init_exp(v, expkind.VVARARG, luaK_codeABC(fs, OP_VARARG, 0, 1, 0));
            break;
        }
        case 123 /* ('{').charCodeAt(0) */: {
            /* constructor */
            constructor(ls, v);
            return;
        }
        case R.TK_FUNCTION: {
            llex.luaX_next(ls);
            body(ls, v, false, ls.linenumber);
            return;
        }
        default: {
            suffixedexp(ls, v);
            return;
        }
    }
    llex.luaX_next(ls);
};

const getunopr = function (op: number): number {
    switch (op) {
        case R.TK_NOT:
            return OPR_NOT;
        case 45 /* ('-').charCodeAt(0) */:
            return OPR_MINUS;
        case 126 /* ('~').charCodeAt(0) */:
            return OPR_BNOT;
        case 35 /* ('#').charCodeAt(0) */:
            return OPR_LEN;
        default:
            return OPR_NOUNOPR;
    }
};

const getbinopr = function (op: number): number {
    switch (op) {
        case 43 /* ('+').charCodeAt(0) */:
            return OPR_ADD;
        case 45 /* ('-').charCodeAt(0) */:
            return OPR_SUB;
        case 42 /* ('*').charCodeAt(0) */:
            return OPR_MUL;
        case 37 /* ('%').charCodeAt(0) */:
            return OPR_MOD;
        case 94 /* ('^').charCodeAt(0) */:
            return OPR_POW;
        case 47 /* ('/').charCodeAt(0) */:
            return OPR_DIV;
        case R.TK_IDIV:
            return OPR_IDIV;
        case 38 /* ('&').charCodeAt(0) */:
            return OPR_BAND;
        case 124 /* ('|').charCodeAt(0) */:
            return OPR_BOR;
        case 126 /* ('~').charCodeAt(0) */:
            return OPR_BXOR;
        case R.TK_SHL:
            return OPR_SHL;
        case R.TK_SHR:
            return OPR_SHR;
        case R.TK_CONCAT:
            return OPR_CONCAT;
        case R.TK_NE:
            return OPR_NE;
        case R.TK_EQ:
            return OPR_EQ;
        case 60 /* ('<').charCodeAt(0) */:
            return OPR_LT;
        case R.TK_LE:
            return OPR_LE;
        case 62 /* ('>').charCodeAt(0) */:
            return OPR_GT;
        case R.TK_GE:
            return OPR_GE;
        case R.TK_AND:
            return OPR_AND;
        case R.TK_OR:
            return OPR_OR;
        default:
            return OPR_NOBINOPR;
    }
};

const priority = [
    /* ORDER OPR */ { left: 10, right: 10 },
    { left: 10, right: 10 } /* '+' '-' */,
    { left: 11, right: 11 },
    { left: 11, right: 11 } /* '*' '%' */,
    { left: 14, right: 13 } /* '^' (right associative) */,
    { left: 11, right: 11 },
    { left: 11, right: 11 } /* '/' '//' */,
    { left: 6, right: 6 },
    { left: 4, right: 4 },
    { left: 5, right: 5 } /* '&' '|' '~' */,
    { left: 7, right: 7 },
    { left: 7, right: 7 } /* '<<' '>>' */,
    { left: 9, right: 8 } /* '..' (right associative) */,
    { left: 3, right: 3 },
    { left: 3, right: 3 },
    { left: 3, right: 3 } /* ==, <, <= */,
    { left: 3, right: 3 },
    { left: 3, right: 3 },
    { left: 3, right: 3 } /* ~=, >, >= */,
    { left: 2, right: 2 },
    { left: 1, right: 1 } /* and, or */,
];

const UNARY_PRIORITY = 12;

/*
 ** subexpr -> (simpleexp | unop subexpr) { binop subexpr }
 ** where 'binop' is any binary operator with a priority higher than 'limit'
 */
const subexpr = function (ls: LexState, v: expdesc, limit: number): number {
    enterlevel(ls);
    let uop = getunopr(ls.t.token);
    if (uop !== OPR_NOUNOPR) {
        let line = ls.linenumber;
        llex.luaX_next(ls);
        subexpr(ls, v, UNARY_PRIORITY);
        luaK_prefix(get_fs(ls), uop, v, line);
    } else simpleexp(ls, v);
    /* expand while operators have priorities higher than 'limit' */
    let op = getbinopr(ls.t.token);
    while (op !== OPR_NOBINOPR && priority[op]!.left > limit) {
        let v2 = new expdesc();
        let line = ls.linenumber;
        llex.luaX_next(ls);
        luaK_infix(get_fs(ls), op, v);
        /* read sub-expression with higher priority */
        let nextop = subexpr(ls, v2, priority[op]!.right);
        luaK_posfix(get_fs(ls), op, v, v2, line);
        op = nextop;
    }
    leavelevel(ls);
    return op; /* return first untreated operator */
};

const expr = function (ls: LexState, v: expdesc): void {
    subexpr(ls, v, 0);
};

/* }==================================================================== */

/*
 ** {======================================================================
 ** Rules for Statements
 ** =======================================================================
 */

const block = function (ls: LexState): void {
    /* block -> statlist */
    let fs = get_fs(ls);
    let bl = new BlockCnt();
    enterblock(fs, bl, false);
    statlist(ls);
    leaveblock(fs);
};

/*
 ** structure to chain all variables in the left-hand side of an
 ** assignment
 */
class LHS_assign {
    prev: LHS_assign | null;
    v: expdesc;

    constructor() {
        this.prev = null;
        this.v =
            new expdesc(); /* variable (global, local, upvalue, or indexed) */
    }
}

/*
 ** check whether, in an assignment to an upvalue/local variable, the
 ** upvalue/local variable is begin used in a previous assignment to a
 ** table. If so, save original upvalue/local value in a safe place and
 ** use this safe copy in the previous assignment.
 */
const check_conflict = function (
    ls: LexState,
    lh: LHS_assign | null,
    v: expdesc,
): void {
    let fs = get_fs(ls);
    let extra = fs.freereg; /* eventual position to save local variable */
    let conflict = false;
    for (; lh; lh = lh.prev) {
        /* check all previous assignments */
        if (lh.v.k === expkind.VINDEXED) {
            /* assigning to a table? */
            /* table is the upvalue/local being assigned now? */
            if (lh.v.u.ind.vt === v.k && lh.v.u.ind.t === v.u.info) {
                conflict = true;
                lh.v.u.ind.vt = expkind.VLOCAL;
                lh.v.u.ind.t =
                    extra; /* previous assignment will use safe copy */
            }
            /* index is the local being assigned? (index cannot be upvalue) */
            if (v.k === expkind.VLOCAL && lh.v.u.ind.idx === v.u.info) {
                conflict = true;
                lh.v.u.ind.idx =
                    extra; /* previous assignment will use safe copy */
            }
        }
    }
    if (conflict) {
        /* copy upvalue/local value to a temporary (in position 'extra') */
        let op = v.k === expkind.VLOCAL ? OP_MOVE : OP_GETUPVAL;
        luaK_codeABC(fs, op, extra, v.u.info, 0);
        luaK_reserveregs(fs, 1);
    }
};

const assignment = function (
    ls: LexState,
    lh: LHS_assign,
    nvars: number,
): void {
    let e = new expdesc();
    check_condition(ls, vkisvar(lh.v.k), to_luastring('syntax error', true));
    if (testnext(ls, 44 /* (',').charCodeAt(0) */)) {
        /* assignment -> ',' suffixedexp assignment */
        let nv = new LHS_assign();
        nv.prev = lh;
        suffixedexp(ls, nv.v);
        if (nv.v.k !== expkind.VINDEXED) check_conflict(ls, lh, nv.v);
        checklimit(
            get_fs(ls),
            nvars + ls.L!.nCcalls,
            LUAI_MAXCCALLS,
            to_luastring('JS levels', true),
        );
        assignment(ls, nv, nvars + 1);
    } else {
        /* assignment -> '=' explist */
        checknext(ls, 61 /* ('=').charCodeAt(0) */);
        let nexps = explist(ls, e);
        if (nexps !== nvars) adjust_assign(ls, nvars, nexps, e);
        else {
            luaK_setoneret(get_fs(ls), e); /* close last expression */
            luaK_storevar(get_fs(ls), lh.v, e);
            return; /* avoid default */
        }
    }
    init_exp(
        e,
        expkind.VNONRELOC,
        get_fs(ls).freereg - 1,
    ); /* default assignment */
    luaK_storevar(get_fs(ls), lh.v, e);
};

const cond = function (ls: LexState): number {
    /* cond -> exp */
    let v = new expdesc();
    expr(ls, v); /* read condition */
    if (v.k === expkind.VNIL)
        v.k = expkind.VFALSE; /* 'falses' are all equal here */
    luaK_goiftrue(get_fs(ls), v);
    return v.f;
};

const gotostat = function (ls: LexState, pc: number): void {
    let line = ls.linenumber;
    let label;
    if (testnext(ls, R.TK_GOTO)) label = str_checkname(ls);
    else {
        llex.luaX_next(ls); /* skip break */
        label = luaS_newliteral(ls.L!, 'break');
    }
    let g = newlabelentry(ls, ls.dyd!.gt, label, line, pc);
    findlabel(ls, g); /* close it if label already defined */
};

/* check for repeated labels on the same block */
const checkrepeated = function (
    fs: FuncState,
    ll: Labellist,
    label: TString,
): void {
    for (let i = fs.bl!.firstlabel; i < ll.n; i++) {
        if (eqstr(label, ll.arr[i]!.name!)) {
            let msg = lobject.luaO_pushfstring(
                fs.ls.L!,
                to_luastring("label '%s' already defined on line %d", true),
                label.getstr(),
                ll.arr[i]!.line,
            );
            semerror(fs.ls, msg);
        }
    }
};

/* skip no-op statements */
const skipnoopstat = function (ls: LexState): void {
    while (
        ls.t.token === 59 /* (';').charCodeAt(0) */ ||
        ls.t.token === R.TK_DBCOLON
    )
        statement(ls);
};

const labelstat = function (ls: LexState, label: TString, line: number): void {
    /* label -> '::' NAME '::' */
    let fs = get_fs(ls);
    let ll = ls.dyd!.label;
    let l; /* index of new label being created */
    checkrepeated(fs, ll, label); /* check for repeated labels */
    checknext(ls, R.TK_DBCOLON); /* skip double colon */
    /* create new entry for this label */
    l = newlabelentry(ls, ll, label, line, luaK_getlabel(fs));
    skipnoopstat(ls); /* skip other no-op statements */
    if (block_follow(ls, false)) {
        /* label is last no-op statement in the block? */
        /* assume that locals are already out of scope */
        ll.arr[l]!.nactvar = fs.bl!.nactvar;
    }
    findgotos(ls, ll.arr[l]!);
};

const whilestat = function (ls: LexState, line: number): void {
    /* whilestat -> WHILE cond DO block END */
    let fs = get_fs(ls);
    let bl = new BlockCnt();
    llex.luaX_next(ls); /* skip WHILE */
    let whileinit = luaK_getlabel(fs);
    let condexit = cond(ls);
    enterblock(fs, bl, true);
    checknext(ls, R.TK_DO);
    block(ls);
    luaK_jumpto(fs, whileinit);
    check_match(ls, R.TK_END, R.TK_WHILE, line);
    leaveblock(fs);
    luaK_patchtohere(fs, condexit); /* false conditions finish the loop */
};

const repeatstat = function (ls: LexState, line: number): void {
    /* repeatstat -> REPEAT block UNTIL cond */
    let fs = get_fs(ls);
    let repeat_init = luaK_getlabel(fs);
    let bl1 = new BlockCnt();
    let bl2 = new BlockCnt();
    enterblock(fs, bl1, true); /* loop block */
    enterblock(fs, bl2, false); /* scope block */
    llex.luaX_next(ls); /* skip REPEAT */
    statlist(ls);
    check_match(ls, R.TK_UNTIL, R.TK_REPEAT, line);
    let condexit = cond(ls); /* read condition (inside scope block) */
    if (bl2.upval) /* upvalues? */ luaK_patchclose(fs, condexit, bl2.nactvar);
    leaveblock(fs); /* finish scope */
    luaK_patchlist(fs, condexit, repeat_init); /* close the loop */
    leaveblock(fs); /* finish loop */
};

const exp1 = function (ls: LexState): number {
    let e = new expdesc();
    expr(ls, e);
    luaK_exp2nextreg(get_fs(ls), e);
    lua_assert(e.k === expkind.VNONRELOC);
    let reg = e.u.info;
    return reg;
};

const forbody = function (
    ls: LexState,
    base: number,
    line: number,
    nvars: number,
    isnum: boolean,
): void {
    /* forbody -> DO block */
    let bl = new BlockCnt();
    let fs = get_fs(ls);
    let endfor;
    adjustlocalvars(ls, 3); /* control variables */
    checknext(ls, R.TK_DO);
    let prep = isnum
        ? luaK_codeAsBx(fs, OP_FORPREP, base, NO_JUMP)
        : luaK_jump(fs);
    enterblock(fs, bl, false); /* scope for declared variables */
    adjustlocalvars(ls, nvars);
    luaK_reserveregs(fs, nvars);
    block(ls);
    leaveblock(fs); /* end of scope for declared variables */
    luaK_patchtohere(fs, prep);
    if (isnum)
        /* end of scope for declared variables */
        endfor = luaK_codeAsBx(fs, OP_FORLOOP, base, NO_JUMP);
    else {
        /* generic for */
        luaK_codeABC(fs, OP_TFORCALL, base, 0, nvars);
        luaK_fixline(fs, line);
        endfor = luaK_codeAsBx(fs, OP_TFORLOOP, base + 2, NO_JUMP);
    }
    luaK_patchlist(fs, endfor, prep + 1);
    luaK_fixline(fs, line);
};

const fornum = function (ls: LexState, varname: TString, line: number): void {
    /* fornum -> NAME = exp1,exp1[,exp1] forbody */
    let fs = get_fs(ls);
    let base = fs.freereg;
    new_localvarliteral(ls, '(for index)');
    new_localvarliteral(ls, '(for limit)');
    new_localvarliteral(ls, '(for step)');
    new_localvar(ls, varname);
    checknext(ls, 61 /* ('=').charCodeAt(0) */);
    exp1(ls); /* initial value */
    checknext(ls, 44 /* (',').charCodeAt(0) */);
    exp1(ls); /* limit */
    if (testnext(ls, 44 /* (',').charCodeAt(0) */))
        exp1(ls); /* optional step */
    else {
        /* default step = 1 */
        luaK_codek(fs, fs.freereg, luaK_intK(fs, 1));
        luaK_reserveregs(fs, 1);
    }
    forbody(ls, base, line, 1, true);
};

const forlist = function (ls: LexState, indexname: TString): void {
    /* forlist -> NAME {,NAME} IN explist forbody */
    let fs = get_fs(ls);
    let e = new expdesc();
    let nvars = 4; /* gen, state, control, plus at least one declared var */
    let base = fs.freereg;
    /* create control variables */
    new_localvarliteral(ls, '(for generator)');
    new_localvarliteral(ls, '(for state)');
    new_localvarliteral(ls, '(for control)');
    /* create declared variables */
    new_localvar(ls, indexname);
    while (testnext(ls, 44 /* (',').charCodeAt(0) */)) {
        new_localvar(ls, str_checkname(ls));
        nvars++;
    }
    checknext(ls, R.TK_IN);
    let line = ls.linenumber;
    adjust_assign(ls, 3, explist(ls, e), e);
    luaK_checkstack(fs, 3); /* extra space to call generator */
    forbody(ls, base, line, nvars - 3, false);
};

const forstat = function (ls: LexState, line: number): void {
    /* forstat -> FOR (fornum | forlist) END */
    let fs = get_fs(ls);
    let bl = new BlockCnt();
    enterblock(fs, bl, true); /* scope for loop and control variables */
    llex.luaX_next(ls); /* skip 'for' */
    let varname = str_checkname(ls); /* first variable name */
    switch (ls.t.token) {
        case 61 /* ('=').charCodeAt(0) */:
            fornum(ls, varname, line);
            break;
        case 44 /* (',').charCodeAt(0) */:
        case R.TK_IN:
            forlist(ls, varname);
            break;
        default:
            llex.luaX_syntaxerror(
                ls,
                to_luastring("'=' or 'in' expected", true),
            );
    }
    check_match(ls, R.TK_END, R.TK_FOR, line);
    leaveblock(fs); /* loop scope ('break' jumps to this point) */
};

const test_then_block = function (ls: LexState, escapelist: number): number {
    /* test_then_block -> [IF | ELSEIF] cond THEN block */
    let bl = new BlockCnt();
    let fs = get_fs(ls);
    let v = new expdesc();
    let jf; /* instruction to skip 'then' code (if condition is false) */

    llex.luaX_next(ls); /* skip IF or ELSEIF */
    expr(ls, v); /* read condition */
    checknext(ls, R.TK_THEN);

    if (ls.t.token === R.TK_GOTO || ls.t.token === R.TK_BREAK) {
        luaK_goiffalse(
            get_fs(ls),
            v,
        ); /* will jump to label if condition is true */
        enterblock(fs, bl, false); /* must enter block before 'goto' */
        gotostat(ls, v.t); /* handle goto/break */
        while (testnext(ls, 59 /* (';').charCodeAt(0) */)); /* skip colons */
        if (block_follow(ls, false)) {
            /* 'goto' is the entire block? */
            leaveblock(fs);
            return escapelist; /* and that is it */
        } else
            /* must skip over 'then' part if condition is false */
            jf = luaK_jump(fs);
    } else {
        /* regular case (not goto/break) */
        luaK_goiftrue(
            get_fs(ls),
            v,
        ); /* skip over block if condition is false */
        enterblock(fs, bl, false);
        jf = v.f;
    }

    statlist(ls); /* 'then' part */
    leaveblock(fs);
    if (ls.t.token === R.TK_ELSE || ls.t.token === R.TK_ELSEIF)
        /* followed by 'else'/'elseif'? */
        escapelist = luaK_concat(
            fs,
            escapelist,
            luaK_jump(fs),
        ); /* must jump over it */
    luaK_patchtohere(fs, jf);

    return escapelist;
};

const ifstat = function (ls: LexState, line: number): void {
    /* ifstat -> IF cond THEN block {ELSEIF cond THEN block} [ELSE block] END */
    let fs = get_fs(ls);
    let escapelist = NO_JUMP; /* exit list for finished parts */
    escapelist = test_then_block(ls, escapelist); /* IF cond THEN block */
    while (ls.t.token === R.TK_ELSEIF)
        escapelist = test_then_block(
            ls,
            escapelist,
        ); /* ELSEIF cond THEN block */
    if (testnext(ls, R.TK_ELSE)) block(ls); /* 'else' part */
    check_match(ls, R.TK_END, R.TK_IF, line);
    luaK_patchtohere(fs, escapelist); /* patch escape list to 'if' end */
};

const localfunc = function (ls: LexState): void {
    let b = new expdesc();
    let fs = get_fs(ls);
    new_localvar(ls, str_checkname(ls)); /* new local variable */
    adjustlocalvars(ls, 1); /* enter its scope */
    body(ls, b, false, ls.linenumber); /* function created in next register */
    /* debug information will only see the variable after this point! */
    getlocvar(fs, b.u.info).startpc = fs.pc;
};

const localstat = function (ls: LexState): void {
    /* stat -> LOCAL NAME {',' NAME} ['=' explist] */
    let nvars = 0;
    let nexps;
    let e = new expdesc();
    do {
        new_localvar(ls, str_checkname(ls));
        nvars++;
    } while (testnext(ls, 44 /* (',').charCodeAt(0) */));
    if (testnext(ls, 61 /* ('=').charCodeAt(0) */)) nexps = explist(ls, e);
    else {
        e.k = expkind.VVOID;
        nexps = 0;
    }
    adjust_assign(ls, nvars, nexps, e);
    adjustlocalvars(ls, nvars);
};

const funcname = function (ls: LexState, v: expdesc): boolean {
    /* funcname -> NAME {fieldsel} [':' NAME] */
    let ismethod = false;
    singlevar(ls, v);
    while (ls.t.token === 46 /* ('.').charCodeAt(0) */) fieldsel(ls, v);
    if (ls.t.token === 58 /* (':').charCodeAt(0) */) {
        ismethod = true;
        fieldsel(ls, v);
    }
    return ismethod;
};

const funcstat = function (ls: LexState, line: number): void {
    /* funcstat -> FUNCTION funcname body */
    let v = new expdesc();
    let b = new expdesc();
    llex.luaX_next(ls); /* skip FUNCTION */
    let ismethod = funcname(ls, v);
    body(ls, b, ismethod, line);
    luaK_storevar(get_fs(ls), v, b);
    luaK_fixline(get_fs(ls), line); /* definition "happens" in the first line */
};

const exprstat = function (ls: LexState): void {
    /* stat -> func | assignment */
    let fs = get_fs(ls);
    let v = new LHS_assign();
    suffixedexp(ls, v.v);
    if (
        ls.t.token === 61 /* ('=').charCodeAt(0) */ ||
        ls.t.token === 44 /* (',').charCodeAt(0) */
    ) {
        /* stat . assignment ? */
        v.prev = null;
        assignment(ls, v, 1);
    } else {
        /* stat -> func */
        check_condition(
            ls,
            v.v.k === expkind.VCALL,
            to_luastring('syntax error', true),
        );
        SETARG_C(
            getinstruction(fs, v.v),
            1,
        ); /* call statement uses no results */
    }
};

const retstat = function (ls: LexState): void {
    /* stat -> RETURN [explist] [';'] */
    let fs = get_fs(ls);
    let e = new expdesc();
    let first, nret; /* registers with returned values */
    if (block_follow(ls, true) || ls.t.token === 59 /* (';').charCodeAt(0) */)
        first = nret = 0; /* return no values */
    else {
        nret = explist(ls, e); /* optional return values */
        if (hasmultret(e.k)) {
            luaK_setmultret(fs, e);
            if (e.k === expkind.VCALL && nret === 1) {
                /* tail call? */
                SET_OPCODE(getinstruction(fs, e), OP_TAILCALL);
                lua_assert(getinstruction(fs, e).A === fs.nactvar);
            }
            first = fs.nactvar;
            nret = LUA_MULTRET; /* return all values */
        } else {
            if (nret === 1)
                /* only one single value? */
                first = luaK_exp2anyreg(fs, e);
            else {
                luaK_exp2nextreg(fs, e); /* values must go to the stack */
                first = fs.nactvar; /* return all active values */
                lua_assert(nret === fs.freereg - first);
            }
        }
    }
    luaK_ret(fs, first, nret);
    testnext(ls, 59 /* (';').charCodeAt(0) */); /* skip optional semicolon */
};

const statement = function (ls: LexState): void {
    let line = ls.linenumber; /* may be needed for error messages */
    enterlevel(ls);
    switch (ls.t.token) {
        case 59 /* (';').charCodeAt(0) */: {
            /* stat -> ';' (empty statement) */
            llex.luaX_next(ls); /* skip ';' */
            break;
        }
        case R.TK_IF: {
            /* stat -> ifstat */
            ifstat(ls, line);
            break;
        }
        case R.TK_WHILE: {
            /* stat -> whilestat */
            whilestat(ls, line);
            break;
        }
        case R.TK_DO: {
            /* stat -> DO block END */
            llex.luaX_next(ls); /* skip DO */
            block(ls);
            check_match(ls, R.TK_END, R.TK_DO, line);
            break;
        }
        case R.TK_FOR: {
            /* stat -> forstat */
            forstat(ls, line);
            break;
        }
        case R.TK_REPEAT: {
            /* stat -> repeatstat */
            repeatstat(ls, line);
            break;
        }
        case R.TK_FUNCTION: {
            /* stat -> funcstat */
            funcstat(ls, line);
            break;
        }
        case R.TK_LOCAL: {
            /* stat -> localstat */
            llex.luaX_next(ls); /* skip LOCAL */
            if (testnext(ls, R.TK_FUNCTION))
                /* local function? */
                localfunc(ls);
            else localstat(ls);
            break;
        }
        case R.TK_DBCOLON: {
            /* stat -> label */
            llex.luaX_next(ls); /* skip double colon */
            labelstat(ls, str_checkname(ls), line);
            break;
        }
        case R.TK_RETURN: {
            /* skip double colon */
            llex.luaX_next(ls); /* skip RETURN */
            retstat(ls);
            break;
        }
        case R.TK_BREAK: /* stat -> breakstat */
        case R.TK_GOTO: {
            /* stat -> 'goto' NAME */
            gotostat(ls, luaK_jump(get_fs(ls)));
            break;
        }
        default: {
            /* stat -> func | assignment */
            exprstat(ls);
            break;
        }
    }
    lua_assert(
        get_fs(ls).f.maxstacksize >= get_fs(ls).freereg &&
            get_fs(ls).freereg >= get_fs(ls).nactvar,
    );
    get_fs(ls).freereg = get_fs(ls).nactvar; /* free registers */
    leavelevel(ls);
};

/*
 ** compiles the main function, which is a regular vararg function with an
 ** upvalue named LUA_ENV
 */
const mainfunc = function (ls: LexState, fs: FuncState): void {
    let bl = new BlockCnt();
    let v = new expdesc();
    open_func(ls, fs, bl);
    fs.f.is_vararg = true; /* main function is always declared vararg */
    init_exp(v, expkind.VLOCAL, 0); /* create and... */
    newupvalue(fs, ls.envn!, v); /* ...set environment upvalue */
    llex.luaX_next(ls); /* read first token */
    statlist(ls); /* parse main body */
    check(ls, R.TK_EOS);
    close_func(ls);
};

const luaY_parser = function (
    L: lua_State,
    z: ZIO,
    buff: MBuffer,
    dyd: Dyndata,
    name: Uint8Array,
    firstchar: number,
): LClosure {
    let lexstate = new llex.LexState();
    let funcstate = new FuncState();
    let cl = lfunc.luaF_newLclosure(L, 1); /* create main closure */
    ldo.luaD_inctop(L);
    L.stack![L.top - 1]!.setclLvalue(cl);
    lexstate.h = ltable.luaH_new(L); /* create table for scanner */
    ldo.luaD_inctop(L);
    L.stack![L.top - 1]!.sethvalue(lexstate.h);
    funcstate.f = cl.p = new Proto(L);
    funcstate.f.source = luaS_new(L, name);
    lexstate.buff = buff;
    lexstate.dyd = dyd;
    dyd.actvar.n = dyd.gt.n = dyd.label.n = 0;
    llex.luaX_setinput(L, lexstate, z, funcstate.f.source, firstchar);
    mainfunc(lexstate, funcstate);
    lua_assert(!funcstate.prev && funcstate.nups === 1 && !lexstate.fs);
    /* all scopes should be correctly finished */
    lua_assert(dyd.actvar.n === 0 && dyd.gt.n === 0 && dyd.label.n === 0);
    // eslint-disable-next-line @typescript-eslint/no-array-delete -- Lua VM stack slot reclamation
    delete L.stack![--L.top]; /* remove scanner's table */
    return cl; /* closure is on the stack, too */
};

export { Dyndata, expkind, expdesc, FuncState, luaY_parser, vkisinreg };
