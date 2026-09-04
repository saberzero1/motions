import {
    LUA_MULTRET,
    LUA_OPADD,
    LUA_OPBAND,
    LUA_OPBNOT,
    LUA_OPBOR,
    LUA_OPBXOR,
    LUA_OPDIV,
    LUA_OPIDIV,
    LUA_OPMOD,
    LUA_OPSHL,
    LUA_OPSHR,
    LUA_OPUNM,
    to_luastring,
    constant_types,
} from './defs.js';
import { lua_assert } from './llimits.js';
import * as llex from './llex.js';
import * as lobject from './lobject.js';
import * as lopcodes from './lopcodes.js';
import * as lparser from './lparser.js';
import * as ltable from './ltable.js';
import * as lvm from './lvm.js';
import type { lua_State } from './lstate.js';
import type { Proto } from './lfunc.js';
import type { TString } from './lstring.js';
import type { LexState } from './llex.js';

const {
    LUA_TBOOLEAN,
    LUA_TLIGHTUSERDATA,
    LUA_TLNGSTR,
    LUA_TNIL,
    LUA_TNUMFLT,
    LUA_TNUMINT,
    LUA_TTABLE,
} = constant_types;

const OpCodesI = lopcodes.OpCodesI;
const TValue = lobject.TValue;
type TValueType = lobject.TValue;
type ExpDesc = {
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
    to: (other: ExpDesc) => void;
};

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

type FuncState = {
    f: Proto;
    pc: number;
    lasttarget: number;
    jpc: number;
    nk: number;
    np: number;
    nlocvars: number;
    nactvar: number;
    nups: number;
    freereg: number;
    ls: LexState;
    L: lua_State;
};

/* Maximum number of registers in a Lua function (must fit in 8 bits) */
const MAXREGS = 255;

/*
 ** Marks the end of a patch list. It is an invalid value both as an absolute
 ** address, and as a list link (would link an element to itself).
 */
const NO_JUMP = -1;

const BinOpr = {
    OPR_ADD: 0,
    OPR_SUB: 1,
    OPR_MUL: 2,
    OPR_MOD: 3,
    OPR_POW: 4,
    OPR_DIV: 5,
    OPR_IDIV: 6,
    OPR_BAND: 7,
    OPR_BOR: 8,
    OPR_BXOR: 9,
    OPR_SHL: 10,
    OPR_SHR: 11,
    OPR_CONCAT: 12,
    OPR_EQ: 13,
    OPR_LT: 14,
    OPR_LE: 15,
    OPR_NE: 16,
    OPR_GT: 17,
    OPR_GE: 18,
    OPR_AND: 19,
    OPR_OR: 20,
    OPR_NOBINOPR: 21,
};

const UnOpr = {
    OPR_MINUS: 0,
    OPR_BNOT: 1,
    OPR_NOT: 2,
    OPR_LEN: 3,
    OPR_NOUNOPR: 4,
};

const hasjumps = function (e: ExpDesc): boolean {
    return e.t !== e.f;
};

/*
 ** If expression is a numeric constant returns either true or a new TValue
 ** (depending on 'make_tvalue'). Otherwise, returns false.
 */
const tonumeral = function (
    e: ExpDesc,
    make_tvalue: boolean,
): boolean | TValueType {
    let ek = lparser.expkind;
    if (hasjumps(e)) return false; /* not a numeral */
    switch (e.k) {
        case ek.VKINT:
            if (make_tvalue) {
                return new TValue(LUA_TNUMINT, e.u.ival);
            }
            return true;
        case ek.VKFLT:
            if (make_tvalue) {
                return new TValue(LUA_TNUMFLT, e.u.nval);
            }
            return true;
        default:
            return false;
    }
};

/*
 ** Create a OP_LOADNIL instruction, but try to optimize: if the previous
 ** instruction is also OP_LOADNIL and ranges are compatible, adjust
 ** range of previous instruction instead of emitting a new one. (For
 ** instance, 'local a; local b' will generate a single opcode.)
 */
const luaK_nil = function (fs: FuncState, from: number, n: number): void {
    let previous: Instruction | undefined;
    let l = from + n - 1; /* last register to set nil */
    if (fs.pc > fs.lasttarget) {
        /* no jumps to current position? */
        previous = (fs.f.code as unknown as Instruction[])[fs.pc - 1];
        if (previous && previous.opcode === OpCodesI.OP_LOADNIL) {
            /* previous is LOADNIL? */
            let pfrom = previous.A; /* get previous range */
            let pl = pfrom + previous.B;
            if (
                (pfrom <= from && from <= pl + 1) ||
                (from <= pfrom && pfrom <= l + 1)
            ) {
                /* can connect both? */
                if (pfrom < from) from = pfrom; /* from = min(from, pfrom) */
                if (pl > l) l = pl; /* l = max(l, pl) */
                lopcodes.SETARG_A(previous, from);
                lopcodes.SETARG_B(previous, l - from);
                return;
            }
        } /* else go through */
    }
    luaK_codeABC(
        fs,
        OpCodesI.OP_LOADNIL,
        from,
        n - 1,
        0,
    ); /* else no optimization */
};

const getinstruction = function (fs: FuncState, e: ExpDesc): Instruction {
    return (fs.f.code as unknown as Instruction[])[e.u.info]!;
};

/*
 ** Gets the destination address of a jump instruction. Used to traverse
 ** a list of jumps.
 */
const getjump = function (fs: FuncState, pc: number): number {
    let offset = (fs.f.code as unknown as Instruction[])[pc]!.sBx;
    if (offset === NO_JUMP)
        /* point to itself represents end of list */
        return NO_JUMP; /* end of list */
    else return pc + 1 + offset; /* turn offset into absolute position */
};

/*
 ** Fix jump instruction at position 'pc' to jump to 'dest'.
 ** (Jump addresses are relative in Lua)
 */
const fixjump = function (fs: FuncState, pc: number, dest: number): void {
    let jmp = (fs.f.code as unknown as Instruction[])[pc]!;
    let offset = dest - (pc + 1);
    lua_assert(dest !== NO_JUMP);
    if (Math.abs(offset) > lopcodes.MAXARG_sBx)
        llex.luaX_syntaxerror(
            fs.ls,
            to_luastring('control structure too long', true),
        );
    lopcodes.SETARG_sBx(jmp, offset);
};

/*
 ** Concatenate jump-list 'l2' into jump-list 'l1'
 */
const luaK_concat = function (fs: FuncState, l1: number, l2: number): number {
    if (l2 === NO_JUMP) return l1; /* nothing to concatenate? */
    else if (l1 === NO_JUMP) /* no original list? */ l1 = l2;
    else {
        let list = l1;
        let next = getjump(fs, list);
        while (next !== NO_JUMP) {
            /* find last element */
            list = next;
            next = getjump(fs, list);
        }
        fixjump(fs, list, l2);
    }

    return l1;
};

/*
 ** Create a jump instruction and return its position, so its destination
 ** can be fixed later (with 'fixjump'). If there are jumps to
 ** this position (kept in 'jpc'), link them all together so that
 ** 'patchlistaux' will fix all them directly to the final destination.
 */
const luaK_jump = function (fs: FuncState): number {
    let jpc = fs.jpc; /* save list of jumps to here */
    fs.jpc = NO_JUMP; /* no more jumps to here */
    let j = luaK_codeAsBx(fs, OpCodesI.OP_JMP, 0, NO_JUMP);
    j = luaK_concat(fs, j, jpc); /* keep them on hold */
    return j;
};

const luaK_jumpto = function (fs: FuncState, t: number): void {
    luaK_patchlist(fs, luaK_jump(fs), t);
};

/*
 ** Code a 'return' instruction
 */
const luaK_ret = function (fs: FuncState, first: number, nret: number): void {
    luaK_codeABC(fs, OpCodesI.OP_RETURN, first, nret + 1, 0);
};

/*
 ** Code a "conditional jump", that is, a test or comparison opcode
 ** followed by a jump. Return jump position.
 */
const condjump = function (
    fs: FuncState,
    op: number,
    A: number,
    B: number,
    C: number,
): number {
    luaK_codeABC(fs, op, A, B, C);
    return luaK_jump(fs);
};

/*
 ** returns current 'pc' and marks it as a jump target (to avoid wrong
 ** optimizations with consecutive instructions not in the same basic block).
 */
const luaK_getlabel = function (fs: FuncState): number {
    fs.lasttarget = fs.pc;
    return fs.pc;
};

/*
 ** Returns the position of the instruction "controlling" a given
 ** jump (that is, its condition), or the jump itself if it is
 ** unconditional.
 */
const getjumpcontroloffset = function (fs: FuncState, pc: number): number {
    if (
        pc >= 1 &&
        lopcodes.testTMode(
            (fs.f.code as unknown as Instruction[])[pc - 1]!.opcode,
        )
    )
        return pc - 1;
    else return pc;
};
const getjumpcontrol = function (fs: FuncState, pc: number): Instruction {
    return (fs.f.code as unknown as Instruction[])[
        getjumpcontroloffset(fs, pc)
    ]!;
};

/*
 ** Patch destination register for a TESTSET instruction.
 ** If instruction in position 'node' is not a TESTSET, return 0 ("fails").
 ** Otherwise, if 'reg' is not 'NO_REG', set it as the destination
 ** register. Otherwise, change instruction to a simple 'TEST' (produces
 ** no register value)
 */
const patchtestreg = function (
    fs: FuncState,
    node: number,
    reg: number,
): boolean {
    let pc = getjumpcontroloffset(fs, node);
    let i = (fs.f.code as unknown as Instruction[])[pc]!;
    if (i.opcode !== OpCodesI.OP_TESTSET)
        return false; /* cannot patch other instructions */
    if (reg !== lopcodes.NO_REG && reg !== i.B) lopcodes.SETARG_A(i, reg);
    else {
        /* no register to put value or register already has the value;
           change instruction to simple test */
        (fs.f.code as unknown as Instruction[])[pc] = lopcodes.CREATE_ABC(
            OpCodesI.OP_TEST,
            i.B,
            0,
            i.C,
        );
    }
    return true;
};

/*
 ** Traverse a list of tests ensuring no one produces a value
 */
const removevalues = function (fs: FuncState, list: number): void {
    for (; list !== NO_JUMP; list = getjump(fs, list))
        patchtestreg(fs, list, lopcodes.NO_REG);
};

/*
 ** Traverse a list of tests, patching their destination address and
 ** registers: tests producing values jump to 'vtarget' (and put their
 ** values in 'reg'), other tests jump to 'dtarget'.
 */
const patchlistaux = function (
    fs: FuncState,
    list: number,
    vtarget: number,
    reg: number,
    dtarget: number,
): void {
    while (list !== NO_JUMP) {
        let next = getjump(fs, list);
        if (patchtestreg(fs, list, reg)) fixjump(fs, list, vtarget);
        else fixjump(fs, list, dtarget); /* jump to default target */
        list = next;
    }
};

/*
 ** Ensure all pending jumps to current position are fixed (jumping
 ** to current position with no values) and reset list of pending
 ** jumps
 */
const dischargejpc = function (fs: FuncState): void {
    patchlistaux(fs, fs.jpc, fs.pc, lopcodes.NO_REG, fs.pc);
    fs.jpc = NO_JUMP;
};

/*
 ** Add elements in 'list' to list of pending jumps to "here"
 ** (current position)
 */
const luaK_patchtohere = function (fs: FuncState, list: number): void {
    luaK_getlabel(fs); /* mark "here" as a jump target */
    fs.jpc = luaK_concat(fs, fs.jpc, list);
};

/*
 ** Path all jumps in 'list' to jump to 'target'.
 ** (The assert means that we cannot fix a jump to a forward address
 ** because we only know addresses once code is generated.)
 */
const luaK_patchlist = function (
    fs: FuncState,
    list: number,
    target: number,
): void {
    if (target === fs.pc)
        /* 'target' is current position? */
        luaK_patchtohere(fs, list); /* add list to pending jumps */
    else {
        lua_assert(target < fs.pc);
        patchlistaux(fs, list, target, lopcodes.NO_REG, target);
    }
};

/*
 ** Path all jumps in 'list' to close upvalues up to given 'level'
 ** (The assertion checks that jumps either were closing nothing
 ** or were closing higher levels, from inner blocks.)
 */
const luaK_patchclose = function (
    fs: FuncState,
    list: number,
    level: number,
): void {
    level++; /* argument is +1 to reserve 0 as non-op */
    for (; list !== NO_JUMP; list = getjump(fs, list)) {
        let ins = (fs.f.code as unknown as Instruction[])[list]!;
        lua_assert(
            ins.opcode === OpCodesI.OP_JMP && (ins.A === 0 || ins.A >= level),
        );
        lopcodes.SETARG_A(ins, level);
    }
};

/*
 ** Emit instruction 'i', checking for array sizes and saving also its
 ** line information. Return 'i' position.
 */
const luaK_code = function (fs: FuncState, i: Instruction): number {
    let f = fs.f;
    dischargejpc(fs); /* 'pc' will change */
    /* put new instruction in code array */
    (f.code as unknown as Instruction[])[fs.pc] = i;
    f.lineinfo[fs.pc] = fs.ls.lastline;
    return fs.pc++;
};

/*
 ** Format and emit an 'iABC' instruction. (Assertions check consistency
 ** of parameters versus opcode.)
 */
const luaK_codeABC = function (
    fs: FuncState,
    o: number,
    a: number,
    b: number,
    c: number,
): number {
    lua_assert(lopcodes.getOpMode(o) === lopcodes.iABC);
    lua_assert(lopcodes.getBMode(o) !== lopcodes.OpArgN || b === 0);
    lua_assert(lopcodes.getCMode(o) !== lopcodes.OpArgN || c === 0);
    lua_assert(
        a <= lopcodes.MAXARG_A &&
            b <= lopcodes.MAXARG_B &&
            c <= lopcodes.MAXARG_C,
    );
    return luaK_code(fs, lopcodes.CREATE_ABC(o, a, b, c));
};

/*
 ** Format and emit an 'iABx' instruction.
 */
const luaK_codeABx = function (
    fs: FuncState,
    o: number,
    a: number,
    bc: number,
): number {
    lua_assert(
        lopcodes.getOpMode(o) === lopcodes.iABx ||
            lopcodes.getOpMode(o) === lopcodes.iAsBx,
    );
    lua_assert(lopcodes.getCMode(o) === lopcodes.OpArgN);
    lua_assert(a <= lopcodes.MAXARG_A && bc <= lopcodes.MAXARG_Bx);
    return luaK_code(fs, lopcodes.CREATE_ABx(o, a, bc));
};

const luaK_codeAsBx = function (
    fs: FuncState,
    o: number,
    A: number,
    sBx: number,
): number {
    return luaK_codeABx(fs, o, A, sBx + lopcodes.MAXARG_sBx);
};

/*
 ** Emit an "extra argument" instruction (format 'iAx')
 */
const codeextraarg = function (fs: FuncState, a: number): number {
    lua_assert(a <= lopcodes.MAXARG_Ax);
    return luaK_code(fs, lopcodes.CREATE_Ax(OpCodesI.OP_EXTRAARG, a));
};

/*
 ** Emit a "load constant" instruction, using either 'OP_LOADK'
 ** (if constant index 'k' fits in 18 bits) or an 'OP_LOADKX'
 ** instruction with "extra argument".
 */
const luaK_codek = function (fs: FuncState, reg: number, k: number): number {
    if (k <= lopcodes.MAXARG_Bx)
        return luaK_codeABx(fs, OpCodesI.OP_LOADK, reg, k);
    else {
        let p = luaK_codeABx(fs, OpCodesI.OP_LOADKX, reg, 0);
        codeextraarg(fs, k);
        return p;
    }
};

/*
 ** Check register-stack level, keeping track of its maximum size
 ** in field 'maxstacksize'
 */
const luaK_checkstack = function (fs: FuncState, n: number): void {
    let newstack = fs.freereg + n;
    if (newstack > fs.f.maxstacksize) {
        if (newstack >= MAXREGS)
            llex.luaX_syntaxerror(
                fs.ls,
                to_luastring(
                    'function or expression needs too many registers',
                    true,
                ),
            );
        fs.f.maxstacksize = newstack;
    }
};

/*
 ** Reserve 'n' registers in register stack
 */
const luaK_reserveregs = function (fs: FuncState, n: number): void {
    luaK_checkstack(fs, n);
    fs.freereg += n;
};

/*
 ** Free register 'reg', if it is neither a constant index nor
 ** a local variable.
 */
const freereg = function (fs: FuncState, reg: number): void {
    if (!lopcodes.ISK(reg) && reg >= fs.nactvar) {
        fs.freereg--;
        lua_assert(reg === fs.freereg);
    }
};

/*
 ** Free register used by expression 'e' (if any)
 */
const freeexp = function (fs: FuncState, e: ExpDesc): void {
    if (e.k === lparser.expkind.VNONRELOC) freereg(fs, e.u.info);
};

/*
 ** Free registers used by expressions 'e1' and 'e2' (if any) in proper
 ** order.
 */
const freeexps = function (fs: FuncState, e1: ExpDesc, e2: ExpDesc): void {
    let r1 = e1.k === lparser.expkind.VNONRELOC ? e1.u.info : -1;
    let r2 = e2.k === lparser.expkind.VNONRELOC ? e2.u.info : -1;
    if (r1 > r2) {
        freereg(fs, r1);
        freereg(fs, r2);
    } else {
        freereg(fs, r2);
        freereg(fs, r1);
    }
};

/*
 ** Add constant 'v' to prototype's list of constants (field 'k').
 ** Use scanner's table to cache position of constants in constant list
 ** and try to reuse constants. Because some values should not be used
 ** as keys (nil cannot be a key, integer keys can collapse with float
 ** keys), the caller must provide a useful 'key' for indexing the cache.
 */
const addk = function (fs: FuncState, key: TValueType, v: TValueType): number {
    let f = fs.f;
    let idx = ltable.luaH_get(fs.L, fs.ls.h!, key); /* index scanner table */
    if (idx.ttisinteger()) {
        /* is there an index there? */
        let k = idx.value;
        /* correct value? (warning: must distinguish floats from integers!) */
        if (
            k < fs.nk &&
            f.k[k]!.ttype() === v.ttype() &&
            f.k[k]!.value === v.value
        )
            return k; /* reuse index */
    }
    /* constant not found; create a new entry */
    let k = fs.nk;
    ltable.luaH_setfrom(
        fs.L,
        fs.ls.h!,
        key,
        new lobject.TValue(LUA_TNUMINT, k),
    );
    f.k[k] = v;
    fs.nk++;
    return k;
};

/*
 ** Add a string to list of constants and return its index.
 */
const luaK_stringK = function (fs: FuncState, s: TString): number {
    let o = new TValue(LUA_TLNGSTR, s);
    return addk(fs, o, o); /* use string itself as key */
};

/*
 ** Add an integer to list of constants and return its index.
 ** Integers use userdata as keys to avoid collision with floats with
 ** same value.
 */
const luaK_intK = function (fs: FuncState, n: number): number {
    let k = new TValue(LUA_TLIGHTUSERDATA, n);
    let o = new TValue(LUA_TNUMINT, n);
    return addk(fs, k, o);
};

/*
 ** Add a float to list of constants and return its index.
 */
const luaK_numberK = function (fs: FuncState, r: number): number {
    let o = new TValue(LUA_TNUMFLT, r);
    return addk(fs, o, o); /* use number itself as key */
};

/*
 ** Add a boolean to list of constants and return its index.
 */
const boolK = function (fs: FuncState, b: boolean): number {
    let o = new TValue(LUA_TBOOLEAN, b);
    return addk(fs, o, o); /* use boolean itself as key */
};

/*
 ** Add nil to list of constants and return its index.
 */
const nilK = function (fs: FuncState): number {
    let v = new TValue(LUA_TNIL, null);
    let k = new TValue(LUA_TTABLE, fs.ls.h!);
    /* cannot use nil as key; instead use table itself to represent nil */
    return addk(fs, k, v);
};

/*
 ** Fix an expression to return the number of results 'nresults'.
 ** Either 'e' is a multi-ret expression (function call or vararg)
 ** or 'nresults' is LUA_MULTRET (as any expression can satisfy that).
 */
const luaK_setreturns = function (
    fs: FuncState,
    e: ExpDesc,
    nresults: number,
): void {
    let ek = lparser.expkind;
    if (e.k === ek.VCALL) {
        /* expression is an open function call? */
        lopcodes.SETARG_C(getinstruction(fs, e), nresults + 1);
    } else if (e.k === ek.VVARARG) {
        let pc = getinstruction(fs, e);
        lopcodes.SETARG_B(pc, nresults + 1);
        lopcodes.SETARG_A(pc, fs.freereg);
        luaK_reserveregs(fs, 1);
    } else lua_assert(nresults === LUA_MULTRET);
};

const luaK_setmultret = function (fs: FuncState, e: ExpDesc): void {
    luaK_setreturns(fs, e, LUA_MULTRET);
};

/*
 ** Fix an expression to return one result.
 ** If expression is not a multi-ret expression (function call or
 ** vararg), it already returns one result, so nothing needs to be done.
 ** Function calls become VNONRELOC expressions (as its result comes
 ** fixed in the base register of the call), while vararg expressions
 ** become VRELOCABLE (as OP_VARARG puts its results where it wants).
 ** (Calls are created returning one result, so that does not need
 ** to be fixed.)
 */
const luaK_setoneret = function (fs: FuncState, e: ExpDesc): void {
    let ek = lparser.expkind;
    if (e.k === ek.VCALL) {
        /* expression is an open function call? */
        /* already returns 1 value */
        lua_assert(getinstruction(fs, e).C === 2);
        e.k = ek.VNONRELOC; /* result has fixed position */
        e.u.info = getinstruction(fs, e).A;
    } else if (e.k === ek.VVARARG) {
        lopcodes.SETARG_B(getinstruction(fs, e), 2);
        e.k = ek.VRELOCABLE; /* can relocate its simple result */
    }
};

/*
 ** Ensure that expression 'e' is not a variable.
 */
const luaK_dischargevars = function (fs: FuncState, e: ExpDesc): void {
    let ek = lparser.expkind;

    switch (e.k) {
        case ek.VLOCAL: {
            /* already in a register */
            e.k = ek.VNONRELOC; /* becomes a non-relocatable value */
            break;
        }
        case ek.VUPVAL: {
            /* move value to some (pending) register */
            e.u.info = luaK_codeABC(fs, OpCodesI.OP_GETUPVAL, 0, e.u.info, 0);
            e.k = ek.VRELOCABLE;
            break;
        }
        case ek.VINDEXED: {
            let op;
            freereg(fs, e.u.ind.idx);
            if (e.u.ind.vt === ek.VLOCAL) {
                /* is 't' in a register? */
                freereg(fs, e.u.ind.t);
                op = OpCodesI.OP_GETTABLE;
            } else {
                lua_assert(e.u.ind.vt === ek.VUPVAL);
                op = OpCodesI.OP_GETTABUP; /* 't' is in an upvalue */
            }
            e.u.info = luaK_codeABC(fs, op, 0, e.u.ind.t, e.u.ind.idx);
            e.k = ek.VRELOCABLE;
            break;
        }
        case ek.VVARARG:
        case ek.VCALL: {
            luaK_setoneret(fs, e);
            break;
        }
        default:
            break; /* there is one value available (somewhere) */
    }
};

const code_loadbool = function (
    fs: FuncState,
    A: number,
    b: number,
    jump: number,
): number {
    luaK_getlabel(fs); /* those instructions may be jump targets */
    return luaK_codeABC(fs, OpCodesI.OP_LOADBOOL, A, b, jump);
};

/*
 ** Ensures expression value is in register 'reg' (and therefore
 ** 'e' will become a non-relocatable expression).
 */
const discharge2reg = function (fs: FuncState, e: ExpDesc, reg: number): void {
    let ek = lparser.expkind;
    luaK_dischargevars(fs, e);
    switch (e.k) {
        case ek.VNIL: {
            luaK_nil(fs, reg, 1);
            break;
        }
        case ek.VFALSE:
        case ek.VTRUE: {
            luaK_codeABC(
                fs,
                OpCodesI.OP_LOADBOOL,
                reg,
                e.k === ek.VTRUE ? 1 : 0,
                0,
            );
            break;
        }
        case ek.VK: {
            luaK_codek(fs, reg, e.u.info);
            break;
        }
        case ek.VKFLT: {
            luaK_codek(fs, reg, luaK_numberK(fs, e.u.nval));
            break;
        }
        case ek.VKINT: {
            luaK_codek(fs, reg, luaK_intK(fs, e.u.ival));
            break;
        }
        case ek.VRELOCABLE: {
            let pc = getinstruction(fs, e);
            lopcodes.SETARG_A(
                pc,
                reg,
            ); /* instruction will put result in 'reg' */
            break;
        }
        case ek.VNONRELOC: {
            if (reg !== e.u.info)
                luaK_codeABC(fs, OpCodesI.OP_MOVE, reg, e.u.info, 0);
            break;
        }
        default: {
            lua_assert(e.k === ek.VJMP);
            return; /* nothing to do... */
        }
    }
    e.u.info = reg;
    e.k = ek.VNONRELOC;
};

/*
 ** Ensures expression value is in any register.
 */
const discharge2anyreg = function (fs: FuncState, e: ExpDesc): void {
    if (e.k !== lparser.expkind.VNONRELOC) {
        /* no fixed register yet? */
        luaK_reserveregs(fs, 1); /* get a register */
        discharge2reg(fs, e, fs.freereg - 1); /* put value there */
    }
};

/*
 ** check whether list has any jump that do not produce a value
 ** or produce an inverted value
 */
const need_value = function (fs: FuncState, list: number): boolean {
    for (; list !== NO_JUMP; list = getjump(fs, list)) {
        let i = getjumpcontrol(fs, list);
        if (i.opcode !== OpCodesI.OP_TESTSET) return true;
    }
    return false; /* not found */
};

/*
 ** Ensures final expression result (including results from its jump
 ** lists) is in register 'reg'.
 ** If expression has jumps, need to patch these jumps either to
 ** its final position or to "load" instructions (for those tests
 ** that do not produce values).
 */
const exp2reg = function (fs: FuncState, e: ExpDesc, reg: number): void {
    let ek = lparser.expkind;
    discharge2reg(fs, e, reg);
    if (e.k === ek.VJMP)
        /* expression itself is a test? */
        e.t = luaK_concat(fs, e.t, e.u.info); /* put this jump in 't' list */
    if (hasjumps(e)) {
        let final; /* position after whole expression */
        let p_f = NO_JUMP; /* position of an eventual LOAD false */
        let p_t = NO_JUMP; /* position of an eventual LOAD true */
        if (need_value(fs, e.t) || need_value(fs, e.f)) {
            let fj = e.k === ek.VJMP ? NO_JUMP : luaK_jump(fs);
            p_f = code_loadbool(fs, reg, 0, 1);
            p_t = code_loadbool(fs, reg, 1, 0);
            luaK_patchtohere(fs, fj);
        }
        final = luaK_getlabel(fs);
        patchlistaux(fs, e.f, final, reg, p_f);
        patchlistaux(fs, e.t, final, reg, p_t);
    }
    e.f = e.t = NO_JUMP;
    e.u.info = reg;
    e.k = ek.VNONRELOC;
};

/*
 ** Ensures final expression result (including results from its jump
 ** lists) is in next available register.
 */
const luaK_exp2nextreg = function (fs: FuncState, e: ExpDesc): void {
    luaK_dischargevars(fs, e);
    freeexp(fs, e);
    luaK_reserveregs(fs, 1);
    exp2reg(fs, e, fs.freereg - 1);
};

/*
 ** Ensures final expression result (including results from its jump
 ** lists) is in some (any) register and return that register.
 */
const luaK_exp2anyreg = function (fs: FuncState, e: ExpDesc): number {
    luaK_dischargevars(fs, e);
    if (e.k === lparser.expkind.VNONRELOC) {
        /* expression already has a register? */
        if (!hasjumps(e))
            /* no jumps? */
            return e.u.info; /* result is already in a register */
        if (e.u.info >= fs.nactvar) {
            /* reg. is not a local? */
            exp2reg(fs, e, e.u.info); /* put final result in it */
            return e.u.info;
        }
    }
    luaK_exp2nextreg(fs, e); /* otherwise, use next available register */
    return e.u.info;
};

/*
 ** Ensures final expression result is either in a register or in an
 ** upvalue.
 */
const luaK_exp2anyregup = function (fs: FuncState, e: ExpDesc): void {
    if (e.k !== lparser.expkind.VUPVAL || hasjumps(e)) luaK_exp2anyreg(fs, e);
};

/*
 ** Ensures final expression result is either in a register or it is
 ** a constant.
 */
const luaK_exp2val = function (fs: FuncState, e: ExpDesc): void {
    if (hasjumps(e)) luaK_exp2anyreg(fs, e);
    else luaK_dischargevars(fs, e);
};

/*
 ** Ensures final expression result is in a valid R/K index
 ** (that is, it is either in a register or in 'k' with an index
 ** in the range of R/K indices).
 ** Returns R/K index.
 */
const luaK_exp2RK = function (fs: FuncState, e: ExpDesc): number {
    let ek = lparser.expkind;
    let vk = false;
    luaK_exp2val(fs, e);
    switch (e.k /* move constants to 'k' */) {
        case ek.VTRUE:
            e.u.info = boolK(fs, true);
            vk = true;
            break;
        case ek.VFALSE:
            e.u.info = boolK(fs, false);
            vk = true;
            break;
        case ek.VNIL:
            e.u.info = nilK(fs);
            vk = true;
            break;
        case ek.VKINT:
            e.u.info = luaK_intK(fs, e.u.ival);
            vk = true;
            break;
        case ek.VKFLT:
            e.u.info = luaK_numberK(fs, e.u.nval);
            vk = true;
            break;
        case ek.VK:
            vk = true;
            break;
        default:
            break;
    }

    if (vk) {
        e.k = ek.VK;
        if (e.u.info <= lopcodes.MAXINDEXRK)
            /* constant fits in 'argC'? */
            return lopcodes.RKASK(e.u.info);
    }

    /* not a constant in the right range: put it in a register */
    return luaK_exp2anyreg(fs, e);
};

/*
 ** Generate code to store result of expression 'ex' into variable 'var'.
 */
const luaK_storevar = function (fs: FuncState, vr: ExpDesc, ex: ExpDesc): void {
    let ek = lparser.expkind;
    switch (vr.k) {
        case ek.VLOCAL: {
            freeexp(fs, ex);
            exp2reg(fs, ex, vr.u.info); /* compute 'ex' into proper place */
            return;
        }
        case ek.VUPVAL: {
            let e = luaK_exp2anyreg(fs, ex);
            luaK_codeABC(fs, OpCodesI.OP_SETUPVAL, e, vr.u.info, 0);
            break;
        }
        case ek.VINDEXED: {
            let op =
                vr.u.ind.vt === ek.VLOCAL
                    ? OpCodesI.OP_SETTABLE
                    : OpCodesI.OP_SETTABUP;
            let e = luaK_exp2RK(fs, ex);
            luaK_codeABC(fs, op, vr.u.ind.t, vr.u.ind.idx, e);
            break;
        }
    }
    freeexp(fs, ex);
};

/*
 ** Emit SELF instruction (convert expression 'e' into 'e:key(e,').
 */
const luaK_self = function (fs: FuncState, e: ExpDesc, key: ExpDesc): void {
    luaK_exp2anyreg(fs, e);
    let ereg = e.u.info; /* register where 'e' was placed */
    freeexp(fs, e);
    e.u.info = fs.freereg; /* base register for op_self */
    e.k = lparser.expkind.VNONRELOC; /* self expression has a fixed register */
    luaK_reserveregs(fs, 2); /* function and 'self' produced by op_self */
    luaK_codeABC(fs, OpCodesI.OP_SELF, e.u.info, ereg, luaK_exp2RK(fs, key));
    freeexp(fs, key);
};

/*
 ** Negate condition 'e' (where 'e' is a comparison).
 */
const negatecondition = function (fs: FuncState, e: ExpDesc): void {
    let pc = getjumpcontrol(fs, e.u.info);
    lua_assert(
        Boolean(lopcodes.testTMode(pc.opcode)) &&
            pc.opcode !== OpCodesI.OP_TESTSET &&
            pc.opcode !== OpCodesI.OP_TEST,
    );
    lopcodes.SETARG_A(pc, pc.A === 0 ? 1 : 0);
};

/*
 ** Emit instruction to jump if 'e' is 'cond' (that is, if 'cond'
 ** is true, code will jump if 'e' is true.) Return jump position.
 ** Optimize when 'e' is 'not' something, inverting the condition
 ** and removing the 'not'.
 */
const jumponcond = function (fs: FuncState, e: ExpDesc, cond: number): number {
    if (e.k === lparser.expkind.VRELOCABLE) {
        let ie = getinstruction(fs, e);
        if (ie.opcode === OpCodesI.OP_NOT) {
            fs.pc--; /* remove previous OP_NOT */
            return condjump(fs, OpCodesI.OP_TEST, ie.B, 0, cond === 0 ? 1 : 0);
        }
        /* else go through */
    }
    discharge2anyreg(fs, e);
    freeexp(fs, e);
    return condjump(fs, OpCodesI.OP_TESTSET, lopcodes.NO_REG, e.u.info, cond);
};

/*
 ** Emit code to go through if 'e' is true, jump otherwise.
 */
const luaK_goiftrue = function (fs: FuncState, e: ExpDesc): void {
    let ek = lparser.expkind;
    let pc; /* pc of new jump */
    luaK_dischargevars(fs, e);
    switch (e.k) {
        case ek.VJMP: {
            /* condition? */
            negatecondition(fs, e); /* jump when it is false */
            pc = e.u.info; /* save jump position */
            break;
        }
        case ek.VK:
        case ek.VKFLT:
        case ek.VKINT:
        case ek.VTRUE: {
            pc = NO_JUMP; /* always true; do nothing */
            break;
        }
        default: {
            pc = jumponcond(fs, e, 0); /* jump when false */
            break;
        }
    }
    e.f = luaK_concat(fs, e.f, pc); /* insert new jump in false list */
    luaK_patchtohere(fs, e.t); /* true list jumps to here (to go through) */
    e.t = NO_JUMP;
};

/*
 ** Emit code to go through if 'e' is false, jump otherwise.
 */
const luaK_goiffalse = function (fs: FuncState, e: ExpDesc): void {
    let ek = lparser.expkind;
    let pc; /* pc of new jump */
    luaK_dischargevars(fs, e);
    switch (e.k) {
        case ek.VJMP: {
            pc = e.u.info; /* already jump if true */
            break;
        }
        case ek.VNIL:
        case ek.VFALSE: {
            pc = NO_JUMP; /* always false; do nothing */
            break;
        }
        default: {
            pc = jumponcond(fs, e, 1); /* jump if true */
            break;
        }
    }
    e.t = luaK_concat(fs, e.t, pc); /* insert new jump in 't' list */
    luaK_patchtohere(fs, e.f); /* false list jumps to here (to go through) */
    e.f = NO_JUMP;
};

/*
 ** Code 'not e', doing constant folding.
 */
const codenot = function (fs: FuncState, e: ExpDesc): void {
    let ek = lparser.expkind;
    luaK_dischargevars(fs, e);
    switch (e.k) {
        case ek.VNIL:
        case ek.VFALSE: {
            e.k = ek.VTRUE; /* true === not nil === not false */
            break;
        }
        case ek.VK:
        case ek.VKFLT:
        case ek.VKINT:
        case ek.VTRUE: {
            e.k =
                ek.VFALSE; /* false === not "x" === not 0.5 === not 1 === not true */
            break;
        }
        case ek.VJMP: {
            negatecondition(fs, e);
            break;
        }
        case ek.VRELOCABLE:
        case ek.VNONRELOC: {
            discharge2anyreg(fs, e);
            freeexp(fs, e);
            e.u.info = luaK_codeABC(fs, OpCodesI.OP_NOT, 0, e.u.info, 0);
            e.k = ek.VRELOCABLE;
            break;
        }
    }
    /* interchange true and false lists */
    {
        let temp = e.f;
        e.f = e.t;
        e.t = temp;
    }
    removevalues(fs, e.f); /* values are useless when negated */
    removevalues(fs, e.t);
};

/*
 ** Create expression 't[k]'. 't' must have its final result already in a
 ** register or upvalue.
 */
const luaK_indexed = function (fs: FuncState, t: ExpDesc, k: ExpDesc): void {
    let ek = lparser.expkind;
    lua_assert(!hasjumps(t) && (lparser.vkisinreg(t.k) || t.k === ek.VUPVAL));
    t.u.ind.t = t.u.info; /* register or upvalue index */
    t.u.ind.idx = luaK_exp2RK(fs, k); /* R/K index for key */
    t.u.ind.vt = t.k === ek.VUPVAL ? ek.VUPVAL : ek.VLOCAL;
    t.k = ek.VINDEXED;
};

/*
 ** Return false if folding can raise an error.
 ** Bitwise operations need operands convertible to integers; division
 ** operations cannot have 0 as divisor.
 */
const validop = function (op: number, v1: TValueType, v2: TValueType): boolean {
    switch (op) {
        case LUA_OPBAND:
        case LUA_OPBOR:
        case LUA_OPBXOR:
        case LUA_OPSHL:
        case LUA_OPSHR:
        case LUA_OPBNOT: {
            /* conversion errors */
            return lvm.tointeger(v1) !== false && lvm.tointeger(v2) !== false;
        }
        case LUA_OPDIV:
        case LUA_OPIDIV:
        case LUA_OPMOD /* division by 0 */:
            return v2.nvalue() !== 0;
        default:
            return true; /* everything else is valid */
    }
};

/*
 ** Try to "constant-fold" an operation; return 1 iff successful.
 ** (In this case, 'e1' has the final result.)
 */
const constfolding = function (op: number, e1: ExpDesc, e2: ExpDesc): boolean {
    let ek = lparser.expkind;
    const v1 = tonumeral(e1, true);
    if (v1 === false) return false;
    const v2 = tonumeral(e2, true);
    if (v2 === false) return false;
    const v1num = v1 as TValueType;
    const v2num = v2 as TValueType;
    if (!validop(op, v1num, v2num))
        return false; /* non-numeric operands or not safe to fold */
    let res = new TValue(LUA_TNIL, null); /* FIXME */
    lobject.luaO_arith(null, op, v1num, v2num, res); /* does operation */
    if (res.ttisinteger()) {
        e1.k = ek.VKINT;
        e1.u.ival = res.value;
    } else {
        /* folds neither NaN nor 0.0 (to avoid problems with -0.0) */
        let n = res.fltvalue();
        if (isNaN(n) || n === 0) return false;
        e1.k = ek.VKFLT;
        e1.u.nval = n;
    }
    return true;
};

/*
 ** Emit code for unary expressions that "produce values"
 ** (everything but 'not').
 ** Expression to produce final result will be encoded in 'e'.
 */
const codeunexpval = function (
    fs: FuncState,
    op: number,
    e: ExpDesc,
    line: number,
): void {
    let r = luaK_exp2anyreg(fs, e); /* opcodes operate only on registers */
    freeexp(fs, e);
    e.u.info = luaK_codeABC(fs, op, 0, r, 0); /* generate opcode */
    e.k = lparser.expkind.VRELOCABLE; /* all those operations are relocatable */
    luaK_fixline(fs, line);
};

/*
 ** Emit code for binary expressions that "produce values"
 ** (everything but logical operators 'and'/'or' and comparison
 ** operators).
 ** Expression to produce final result will be encoded in 'e1'.
 ** Because 'luaK_exp2RK' can free registers, its calls must be
 ** in "stack order" (that is, first on 'e2', which may have more
 ** recent registers to be released).
 */
const codebinexpval = function (
    fs: FuncState,
    op: number,
    e1: ExpDesc,
    e2: ExpDesc,
    line: number,
): void {
    let rk2 = luaK_exp2RK(fs, e2); /* both operands are "RK" */
    let rk1 = luaK_exp2RK(fs, e1);
    freeexps(fs, e1, e2);
    e1.u.info = luaK_codeABC(fs, op, 0, rk1, rk2); /* generate opcode */
    e1.k =
        lparser.expkind.VRELOCABLE; /* all those operations are relocatable */
    luaK_fixline(fs, line);
};

/*
 ** Emit code for comparisons.
 ** 'e1' was already put in R/K form by 'luaK_infix'.
 */
const codecomp = function (
    fs: FuncState,
    opr: number,
    e1: ExpDesc,
    e2: ExpDesc,
): void {
    let ek = lparser.expkind;

    let rk1;
    if (e1.k === ek.VK) rk1 = lopcodes.RKASK(e1.u.info);
    else {
        lua_assert(e1.k === ek.VNONRELOC);
        rk1 = e1.u.info;
    }

    let rk2 = luaK_exp2RK(fs, e2);
    freeexps(fs, e1, e2);
    switch (opr) {
        case BinOpr.OPR_NE: {
            /* '(a ~= b)' ==> 'not (a === b)' */
            e1.u.info = condjump(fs, OpCodesI.OP_EQ, 0, rk1, rk2);
            break;
        }
        case BinOpr.OPR_GT:
        case BinOpr.OPR_GE: {
            /* '(a > b)' ==> '(b < a)';  '(a >= b)' ==> '(b <= a)' */
            let op = opr - BinOpr.OPR_NE + OpCodesI.OP_EQ;
            e1.u.info = condjump(fs, op, 1, rk2, rk1); /* invert operands */
            break;
        }
        default: {
            /* '==', '<', '<=' use their own opcodes */
            let op = opr - BinOpr.OPR_EQ + OpCodesI.OP_EQ;
            e1.u.info = condjump(fs, op, 1, rk1, rk2);
            break;
        }
    }
    e1.k = ek.VJMP;
};

/*
 ** Apply prefix operation 'op' to expression 'e'.
 */
const luaK_prefix = function (
    fs: FuncState,
    op: number,
    e: ExpDesc,
    line: number,
): void {
    let ef = new lparser.expdesc();
    ef.k = lparser.expkind.VKINT;
    ef.u.ival = ef.u.nval = ef.u.info = 0;
    ef.t = NO_JUMP;
    ef.f = NO_JUMP;
    switch (op) {
        case UnOpr.OPR_MINUS:
        case UnOpr.OPR_BNOT /* use 'ef' as fake 2nd operand */: {
            if (constfolding(op + LUA_OPUNM, e, ef)) break;
            codeunexpval(fs, op + OpCodesI.OP_UNM, e, line);
            break;
        }
        case UnOpr.OPR_LEN:
            codeunexpval(fs, op + OpCodesI.OP_UNM, e, line);
            break;
        case UnOpr.OPR_NOT:
            codenot(fs, e);
            break;
    }
};

/*
 ** Process 1st operand 'v' of binary operation 'op' before reading
 ** 2nd operand.
 */
const luaK_infix = function (fs: FuncState, op: number, v: ExpDesc): void {
    switch (op) {
        case BinOpr.OPR_AND: {
            luaK_goiftrue(fs, v); /* go ahead only if 'v' is true */
            break;
        }
        case BinOpr.OPR_OR: {
            luaK_goiffalse(fs, v); /* go ahead only if 'v' is false */
            break;
        }
        case BinOpr.OPR_CONCAT: {
            luaK_exp2nextreg(fs, v); /* operand must be on the 'stack' */
            break;
        }
        case BinOpr.OPR_ADD:
        case BinOpr.OPR_SUB:
        case BinOpr.OPR_MUL:
        case BinOpr.OPR_DIV:
        case BinOpr.OPR_IDIV:
        case BinOpr.OPR_MOD:
        case BinOpr.OPR_POW:
        case BinOpr.OPR_BAND:
        case BinOpr.OPR_BOR:
        case BinOpr.OPR_BXOR:
        case BinOpr.OPR_SHL:
        case BinOpr.OPR_SHR: {
            if (!tonumeral(v, false)) luaK_exp2RK(fs, v);
            /* else keep numeral, which may be folded with 2nd operand */
            break;
        }
        default: {
            luaK_exp2RK(fs, v);
            break;
        }
    }
};

/*
 ** Finalize code for binary operation, after reading 2nd operand.
 ** For '(a .. b .. c)' (which is '(a .. (b .. c))', because
 ** concatenation is right associative), merge second CONCAT into first
 ** one.
 */
const luaK_posfix = function (
    fs: FuncState,
    op: number,
    e1: ExpDesc,
    e2: ExpDesc,
    line: number,
): ExpDesc {
    let ek = lparser.expkind;
    switch (op) {
        case BinOpr.OPR_AND: {
            lua_assert(e1.t === NO_JUMP); /* list closed by 'luK_infix' */
            luaK_dischargevars(fs, e2);
            e2.f = luaK_concat(fs, e2.f, e1.f);
            e1.to(e2);
            break;
        }
        case BinOpr.OPR_OR: {
            lua_assert(e1.f === NO_JUMP); /* list closed by 'luK_infix' */
            luaK_dischargevars(fs, e2);
            e2.t = luaK_concat(fs, e2.t, e1.t);
            e1.to(e2);
            break;
        }
        case BinOpr.OPR_CONCAT: {
            luaK_exp2val(fs, e2);
            let ins = getinstruction(fs, e2);
            if (e2.k === ek.VRELOCABLE && ins.opcode === OpCodesI.OP_CONCAT) {
                lua_assert(e1.u.info === ins.B - 1);
                freeexp(fs, e1);
                lopcodes.SETARG_B(ins, e1.u.info);
                e1.k = ek.VRELOCABLE;
                e1.u.info = e2.u.info;
            } else {
                luaK_exp2nextreg(fs, e2); /* operand must be on the 'stack' */
                codebinexpval(fs, OpCodesI.OP_CONCAT, e1, e2, line);
            }
            break;
        }
        case BinOpr.OPR_ADD:
        case BinOpr.OPR_SUB:
        case BinOpr.OPR_MUL:
        case BinOpr.OPR_DIV:
        case BinOpr.OPR_IDIV:
        case BinOpr.OPR_MOD:
        case BinOpr.OPR_POW:
        case BinOpr.OPR_BAND:
        case BinOpr.OPR_BOR:
        case BinOpr.OPR_BXOR:
        case BinOpr.OPR_SHL:
        case BinOpr.OPR_SHR: {
            if (!constfolding(op + LUA_OPADD, e1, e2))
                codebinexpval(fs, op + OpCodesI.OP_ADD, e1, e2, line);
            break;
        }
        case BinOpr.OPR_EQ:
        case BinOpr.OPR_LT:
        case BinOpr.OPR_LE:
        case BinOpr.OPR_NE:
        case BinOpr.OPR_GT:
        case BinOpr.OPR_GE: {
            codecomp(fs, op, e1, e2);
            break;
        }
    }

    return e1;
};

/*
 ** Change line information associated with current position.
 */
const luaK_fixline = function (fs: FuncState, line: number): void {
    fs.f.lineinfo[fs.pc - 1] = line;
};

/*
 ** Emit a SETLIST instruction.
 ** 'base' is register that keeps table;
 ** 'nelems' is #table plus those to be stored now;
 ** 'tostore' is number of values (in registers 'base + 1',...) to add to
 ** table (or LUA_MULTRET to add up to stack top).
 */

const luaK_setlist = function (
    fs: FuncState,
    base: number,
    nelems: number,
    tostore: number,
): void {
    let c = (nelems - 1) / lopcodes.LFIELDS_PER_FLUSH + 1;
    let b = tostore === LUA_MULTRET ? 0 : tostore;
    lua_assert(tostore !== 0 && tostore <= lopcodes.LFIELDS_PER_FLUSH);
    if (c <= lopcodes.MAXARG_C)
        luaK_codeABC(fs, OpCodesI.OP_SETLIST, base, b, c);
    else if (c <= lopcodes.MAXARG_Ax) {
        luaK_codeABC(fs, OpCodesI.OP_SETLIST, base, b, 0);
        codeextraarg(fs, c);
    } else
        llex.luaX_syntaxerror(
            fs.ls,
            to_luastring('constructor too long', true),
        );
    fs.freereg = base + 1; /* free registers with list values */
};

export {
    BinOpr,
    NO_JUMP,
    UnOpr,
    getinstruction,
    luaK_checkstack,
    luaK_code,
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
    luaK_numberK,
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
};
