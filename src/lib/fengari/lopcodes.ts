const OpCodes: string[] = [
    'MOVE',
    'LOADK',
    'LOADKX',
    'LOADBOOL',
    'LOADNIL',
    'GETUPVAL',
    'GETTABUP',
    'GETTABLE',
    'SETTABUP',
    'SETUPVAL',
    'SETTABLE',
    'NEWTABLE',
    'SELF',
    'ADD',
    'SUB',
    'MUL',
    'MOD',
    'POW',
    'DIV',
    'IDIV',
    'BAND',
    'BOR',
    'BXOR',
    'SHL',
    'SHR',
    'UNM',
    'BNOT',
    'NOT',
    'LEN',
    'CONCAT',
    'JMP',
    'EQ',
    'LT',
    'LE',
    'TEST',
    'TESTSET',
    'CALL',
    'TAILCALL',
    'RETURN',
    'FORLOOP',
    'FORPREP',
    'TFORCALL',
    'TFORLOOP',
    'SETLIST',
    'CLOSURE',
    'VARARG',
    'EXTRAARG',
];

const OpCodesI = {
    OP_MOVE: 0,
    OP_LOADK: 1,
    OP_LOADKX: 2,
    OP_LOADBOOL: 3,
    OP_LOADNIL: 4,
    OP_GETUPVAL: 5,
    OP_GETTABUP: 6,
    OP_GETTABLE: 7,
    OP_SETTABUP: 8,
    OP_SETUPVAL: 9,
    OP_SETTABLE: 10,
    OP_NEWTABLE: 11,
    OP_SELF: 12,
    OP_ADD: 13,
    OP_SUB: 14,
    OP_MUL: 15,
    OP_MOD: 16,
    OP_POW: 17,
    OP_DIV: 18,
    OP_IDIV: 19,
    OP_BAND: 20,
    OP_BOR: 21,
    OP_BXOR: 22,
    OP_SHL: 23,
    OP_SHR: 24,
    OP_UNM: 25,
    OP_BNOT: 26,
    OP_NOT: 27,
    OP_LEN: 28,
    OP_CONCAT: 29,
    OP_JMP: 30,
    OP_EQ: 31,
    OP_LT: 32,
    OP_LE: 33,
    OP_TEST: 34,
    OP_TESTSET: 35,
    OP_CALL: 36,
    OP_TAILCALL: 37,
    OP_RETURN: 38,
    OP_FORLOOP: 39,
    OP_FORPREP: 40,
    OP_TFORCALL: 41,
    OP_TFORLOOP: 42,
    OP_SETLIST: 43,
    OP_CLOSURE: 44,
    OP_VARARG: 45,
    OP_EXTRAARG: 46,
} as const satisfies Record<string, number>;

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

/*
 ** masks for instruction properties. The format is:
 ** bits 0-1: op mode
 ** bits 2-3: C arg mode
 ** bits 4-5: B arg mode
 ** bit 6: instruction set register A
 ** bit 7: operator is a test (next instruction must be a jump)
 */
const OpArgN: number = 0; /* argument is not used */
const OpArgU: number = 1; /* argument is used */
const OpArgR: number = 2; /* argument is a register or a jump offset */
const OpArgK: number = 3; /* argument is a constant or register/constant */

/* basic instruction format */
const iABC: number = 0;
const iABx: number = 1;
const iAsBx: number = 2;
const iAx: number = 3;

const luaP_opmodes: number[] = [
    (0 << 7) | (1 << 6) | (OpArgR << 4) | (OpArgN << 2) | iABC /* OP_MOVE */,
    (0 << 7) | (1 << 6) | (OpArgK << 4) | (OpArgN << 2) | iABx /* OP_LOADK */,
    (0 << 7) | (1 << 6) | (OpArgN << 4) | (OpArgN << 2) | iABx /* OP_LOADKX */,
    (0 << 7) |
        (1 << 6) |
        (OpArgU << 4) |
        (OpArgU << 2) |
        iABC /* OP_LOADBOOL */,
    (0 << 7) | (1 << 6) | (OpArgU << 4) | (OpArgN << 2) | iABC /* OP_LOADNIL */,
    (0 << 7) |
        (1 << 6) |
        (OpArgU << 4) |
        (OpArgN << 2) |
        iABC /* OP_GETUPVAL */,
    (0 << 7) |
        (1 << 6) |
        (OpArgU << 4) |
        (OpArgK << 2) |
        iABC /* OP_GETTABUP */,
    (0 << 7) |
        (1 << 6) |
        (OpArgR << 4) |
        (OpArgK << 2) |
        iABC /* OP_GETTABLE */,
    (0 << 7) |
        (0 << 6) |
        (OpArgK << 4) |
        (OpArgK << 2) |
        iABC /* OP_SETTABUP */,
    (0 << 7) |
        (0 << 6) |
        (OpArgU << 4) |
        (OpArgN << 2) |
        iABC /* OP_SETUPVAL */,
    (0 << 7) |
        (0 << 6) |
        (OpArgK << 4) |
        (OpArgK << 2) |
        iABC /* OP_SETTABLE */,
    (0 << 7) |
        (1 << 6) |
        (OpArgU << 4) |
        (OpArgU << 2) |
        iABC /* OP_NEWTABLE */,
    (0 << 7) | (1 << 6) | (OpArgR << 4) | (OpArgK << 2) | iABC /* OP_SELF */,
    (0 << 7) | (1 << 6) | (OpArgK << 4) | (OpArgK << 2) | iABC /* OP_ADD */,
    (0 << 7) | (1 << 6) | (OpArgK << 4) | (OpArgK << 2) | iABC /* OP_SUB */,
    (0 << 7) | (1 << 6) | (OpArgK << 4) | (OpArgK << 2) | iABC /* OP_MUL */,
    (0 << 7) | (1 << 6) | (OpArgK << 4) | (OpArgK << 2) | iABC /* OP_MOD */,
    (0 << 7) | (1 << 6) | (OpArgK << 4) | (OpArgK << 2) | iABC /* OP_POW */,
    (0 << 7) | (1 << 6) | (OpArgK << 4) | (OpArgK << 2) | iABC /* OP_DIV */,
    (0 << 7) | (1 << 6) | (OpArgK << 4) | (OpArgK << 2) | iABC /* OP_IDIV */,
    (0 << 7) | (1 << 6) | (OpArgK << 4) | (OpArgK << 2) | iABC /* OP_BAND */,
    (0 << 7) | (1 << 6) | (OpArgK << 4) | (OpArgK << 2) | iABC /* OP_BOR */,
    (0 << 7) | (1 << 6) | (OpArgK << 4) | (OpArgK << 2) | iABC /* OP_BXOR */,
    (0 << 7) | (1 << 6) | (OpArgK << 4) | (OpArgK << 2) | iABC /* OP_SHL */,
    (0 << 7) | (1 << 6) | (OpArgK << 4) | (OpArgK << 2) | iABC /* OP_SHR */,
    (0 << 7) | (1 << 6) | (OpArgR << 4) | (OpArgN << 2) | iABC /* OP_UNM */,
    (0 << 7) | (1 << 6) | (OpArgR << 4) | (OpArgN << 2) | iABC /* OP_BNOT */,
    (0 << 7) | (1 << 6) | (OpArgR << 4) | (OpArgN << 2) | iABC /* OP_NOT */,
    (0 << 7) | (1 << 6) | (OpArgR << 4) | (OpArgN << 2) | iABC /* OP_LEN */,
    (0 << 7) | (1 << 6) | (OpArgR << 4) | (OpArgR << 2) | iABC /* OP_CONCAT */,
    (0 << 7) | (0 << 6) | (OpArgR << 4) | (OpArgN << 2) | iAsBx /* OP_JMP */,
    (1 << 7) | (0 << 6) | (OpArgK << 4) | (OpArgK << 2) | iABC /* OP_EQ */,
    (1 << 7) | (0 << 6) | (OpArgK << 4) | (OpArgK << 2) | iABC /* OP_LT */,
    (1 << 7) | (0 << 6) | (OpArgK << 4) | (OpArgK << 2) | iABC /* OP_LE */,
    (1 << 7) | (0 << 6) | (OpArgN << 4) | (OpArgU << 2) | iABC /* OP_TEST */,
    (1 << 7) | (1 << 6) | (OpArgR << 4) | (OpArgU << 2) | iABC /* OP_TESTSET */,
    (0 << 7) | (1 << 6) | (OpArgU << 4) | (OpArgU << 2) | iABC /* OP_CALL */,
    (0 << 7) |
        (1 << 6) |
        (OpArgU << 4) |
        (OpArgU << 2) |
        iABC /* OP_TAILCALL */,
    (0 << 7) | (0 << 6) | (OpArgU << 4) | (OpArgN << 2) | iABC /* OP_RETURN */,
    (0 << 7) |
        (1 << 6) |
        (OpArgR << 4) |
        (OpArgN << 2) |
        iAsBx /* OP_FORLOOP */,
    (0 << 7) |
        (1 << 6) |
        (OpArgR << 4) |
        (OpArgN << 2) |
        iAsBx /* OP_FORPREP */,
    (0 << 7) |
        (0 << 6) |
        (OpArgN << 4) |
        (OpArgU << 2) |
        iABC /* OP_TFORCALL */,
    (0 << 7) |
        (1 << 6) |
        (OpArgR << 4) |
        (OpArgN << 2) |
        iAsBx /* OP_TFORLOOP */,
    (0 << 7) | (0 << 6) | (OpArgU << 4) | (OpArgU << 2) | iABC /* OP_SETLIST */,
    (0 << 7) | (1 << 6) | (OpArgU << 4) | (OpArgN << 2) | iABx /* OP_CLOSURE */,
    (0 << 7) | (1 << 6) | (OpArgU << 4) | (OpArgN << 2) | iABC /* OP_VARARG */,
    (0 << 7) | (0 << 6) | (OpArgU << 4) | (OpArgU << 2) | iAx /* OP_EXTRAARG */,
];

const getOpMode = function (m: number): number {
    const mode = luaP_opmodes[m] ?? 0;
    return mode & 3;
};

const getBMode = function (m: number): number {
    const mode = luaP_opmodes[m] ?? 0;
    return (mode >> 4) & 3;
};

const getCMode = function (m: number): number {
    const mode = luaP_opmodes[m] ?? 0;
    return (mode >> 2) & 3;
};

const testAMode = function (m: number): number {
    const mode = luaP_opmodes[m] ?? 0;
    return mode & (1 << 6);
};

const testTMode = function (m: number): number {
    const mode = luaP_opmodes[m] ?? 0;
    return mode & (1 << 7);
};

const SIZE_C: number = 9;
const SIZE_B: number = 9;
const SIZE_Bx: number = SIZE_C + SIZE_B;
const SIZE_A: number = 8;
const SIZE_Ax: number = SIZE_C + SIZE_B + SIZE_A;
const SIZE_OP: number = 6;
const POS_OP: number = 0;
const POS_A: number = POS_OP + SIZE_OP;
const POS_C: number = POS_A + SIZE_A;
const POS_B: number = POS_C + SIZE_C;
const POS_Bx: number = POS_C;
const POS_Ax: number = POS_A;
const MAXARG_Bx: number = (1 << SIZE_Bx) - 1;
const MAXARG_sBx: number = MAXARG_Bx >> 1; /* 'sBx' is signed */
const MAXARG_Ax: number = (1 << SIZE_Ax) - 1;
const MAXARG_A: number = (1 << SIZE_A) - 1;
const MAXARG_B: number = (1 << SIZE_B) - 1;
const MAXARG_C: number = (1 << SIZE_C) - 1;

/* this bit 1 means constant (0 means register) */
const BITRK: number = 1 << (SIZE_B - 1);

const MAXINDEXRK: number = BITRK - 1;

/*
 ** invalid register that fits in 8 bits
 */
const NO_REG: number = MAXARG_A;

/* test whether value is a constant */
const ISK = function (x: number): number {
    return x & BITRK;
};

/* gets the index of the constant */
const INDEXK = function (r: number): number {
    return r & ~BITRK;
};

/* code a constant index as a RK value */
const RKASK = function (x: number): number {
    return x | BITRK;
};

/* creates a mask with 'n' 1 bits at position 'p' */
const MASK1 = function (n: number, p: number): number {
    return ~(~0 << n) << p;
};

/* creates a mask with 'n' 0 bits at position 'p' */
const MASK0 = function (n: number, p: number): number {
    return ~MASK1(n, p);
};

const GET_OPCODE = function (i: Instruction): number {
    return i.opcode;
};

const SET_OPCODE = function (i: Instruction, o: number): Instruction {
    i.code =
        (i.code & MASK0(SIZE_OP, POS_OP)) |
        ((o << POS_OP) & MASK1(SIZE_OP, POS_OP));
    return fullins(i);
};

const setarg = function (
    i: Instruction,
    v: number,
    pos: number,
    size: number,
): Instruction {
    i.code = (i.code & MASK0(size, pos)) | ((v << pos) & MASK1(size, pos));
    return fullins(i);
};

const GETARG_A = function (i: Instruction): number {
    return i.A;
};

const SETARG_A = function (i: Instruction, v: number): Instruction {
    return setarg(i, v, POS_A, SIZE_A);
};

const GETARG_B = function (i: Instruction): number {
    return i.B;
};

const SETARG_B = function (i: Instruction, v: number): Instruction {
    return setarg(i, v, POS_B, SIZE_B);
};

const GETARG_C = function (i: Instruction): number {
    return i.C;
};

const SETARG_C = function (i: Instruction, v: number): Instruction {
    return setarg(i, v, POS_C, SIZE_C);
};

const GETARG_Bx = function (i: Instruction): number {
    return i.Bx;
};

const SETARG_Bx = function (i: Instruction, v: number): Instruction {
    return setarg(i, v, POS_Bx, SIZE_Bx);
};

const GETARG_Ax = function (i: Instruction): number {
    return i.Ax;
};

const SETARG_Ax = function (i: Instruction, v: number): Instruction {
    return setarg(i, v, POS_Ax, SIZE_Ax);
};

const GETARG_sBx = function (i: Instruction): number {
    return i.sBx;
};

const SETARG_sBx = function (i: Instruction, b: number): Instruction {
    return SETARG_Bx(i, b + MAXARG_sBx);
};

/*
 ** Pre-calculate all possible part of the instruction
 */
const fullins = function (ins: Instruction | number): Instruction {
    if (typeof ins === 'number') {
        return {
            code: ins,
            opcode: (ins >> POS_OP) & MASK1(SIZE_OP, 0),
            A: (ins >> POS_A) & MASK1(SIZE_A, 0),
            B: (ins >> POS_B) & MASK1(SIZE_B, 0),
            C: (ins >> POS_C) & MASK1(SIZE_C, 0),
            Bx: (ins >> POS_Bx) & MASK1(SIZE_Bx, 0),
            Ax: (ins >> POS_Ax) & MASK1(SIZE_Ax, 0),
            sBx: ((ins >> POS_Bx) & MASK1(SIZE_Bx, 0)) - MAXARG_sBx,
        };
    } else {
        let i = ins.code;
        ins.opcode = (i >> POS_OP) & MASK1(SIZE_OP, 0);
        ins.A = (i >> POS_A) & MASK1(SIZE_A, 0);
        ins.B = (i >> POS_B) & MASK1(SIZE_B, 0);
        ins.C = (i >> POS_C) & MASK1(SIZE_C, 0);
        ins.Bx = (i >> POS_Bx) & MASK1(SIZE_Bx, 0);
        ins.Ax = (i >> POS_Ax) & MASK1(SIZE_Ax, 0);
        ins.sBx = ((i >> POS_Bx) & MASK1(SIZE_Bx, 0)) - MAXARG_sBx;
        return ins;
    }
};

const CREATE_ABC = function (
    o: number,
    a: number,
    b: number,
    c: number,
): Instruction {
    return fullins((o << POS_OP) | (a << POS_A) | (b << POS_B) | (c << POS_C));
};

const CREATE_ABx = function (o: number, a: number, bc: number): Instruction {
    return fullins((o << POS_OP) | (a << POS_A) | (bc << POS_Bx));
};

const CREATE_Ax = function (o: number, a: number): Instruction {
    return fullins((o << POS_OP) | (a << POS_Ax));
};

/* number of list items to accumulate before a SETLIST instruction */
const LFIELDS_PER_FLUSH: number = 50;

export {
    BITRK,
    CREATE_ABC,
    CREATE_ABx,
    CREATE_Ax,
    GET_OPCODE,
    GETARG_A,
    GETARG_B,
    GETARG_C,
    GETARG_Bx,
    GETARG_Ax,
    GETARG_sBx,
    INDEXK,
    ISK,
    LFIELDS_PER_FLUSH,
    MAXARG_A,
    MAXARG_Ax,
    MAXARG_B,
    MAXARG_Bx,
    MAXARG_C,
    MAXARG_sBx,
    MAXINDEXRK,
    NO_REG,
    OpArgK,
    OpArgN,
    OpArgR,
    OpArgU,
    OpCodes,
    OpCodesI,
    POS_A,
    POS_Ax,
    POS_B,
    POS_Bx,
    POS_C,
    POS_OP,
    RKASK,
    SETARG_A,
    SETARG_Ax,
    SETARG_B,
    SETARG_Bx,
    SETARG_C,
    SETARG_sBx,
    SET_OPCODE,
    SIZE_A,
    SIZE_Ax,
    SIZE_B,
    SIZE_Bx,
    SIZE_C,
    SIZE_OP,
    fullins,
    getBMode,
    getCMode,
    getOpMode,
    iABC,
    iABx,
    iAsBx,
    iAx,
    testAMode,
    testTMode,
};
