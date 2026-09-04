import {
    LUA_SIGNATURE,
    is_luastring,
    luastring_eq,
    to_luastring,
    constant_types,
    thread_status,
} from './defs.js';
import * as ldo from './ldo.js';
import * as lfunc from './lfunc.js';
import * as lobject from './lobject.js';
import {
    MAXARG_sBx,
    POS_A,
    POS_Ax,
    POS_B,
    POS_Bx,
    POS_C,
    POS_OP,
    SIZE_A,
    SIZE_Ax,
    SIZE_B,
    SIZE_Bx,
    SIZE_C,
    SIZE_OP,
} from './lopcodes.js';
import { lua_assert } from './llimits.js';
import { luaS_bless } from './lstring.js';
import { luaZ_read, ZIO } from './lzio.js';
import type { lua_State } from './lstate.js';
import type { Proto } from './lfunc.js';
import type { TString } from './lstring.js';

const {
    LUA_TBOOLEAN,
    LUA_TLNGSTR,
    LUA_TNIL,
    LUA_TNUMFLT,
    LUA_TNUMINT,
    LUA_TSHRSTR,
} = constant_types;
const { LUA_ERRSYNTAX } = thread_status;

let LUAC_DATA = new Uint8Array([0x19, 0x93, 13, 10, 0x1a, 10]);

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

class BytecodeParser {
    intSize: number;
    size_tSize: number;
    instructionSize: number;
    integerSize: number;
    numberSize: number;
    name: Uint8Array;
    L: lua_State;
    Z: ZIO;
    arraybuffer: ArrayBuffer;
    dv: DataView;
    u8: Uint8Array;

    constructor(L: lua_State, Z: ZIO, name: Uint8Array) {
        this.intSize = 4;
        this.size_tSize = 4;
        this.instructionSize = 4;
        this.integerSize = 4;
        this.numberSize = 8;

        lua_assert(Z instanceof ZIO, 'BytecodeParser only operates on a ZIO');
        lua_assert(is_luastring(name));

        if (
            name[0] === 64 /* ('@').charCodeAt(0) */ ||
            name[0] === 61 /* ('=').charCodeAt(0) */
        )
            this.name = name.subarray(1);
        else if (name[0] == LUA_SIGNATURE[0])
            this.name = to_luastring('binary string', true);
        else this.name = name;

        this.L = L;
        this.Z = Z;

        // Used to do buffer to number conversions
        this.arraybuffer = new ArrayBuffer(
            Math.max(
                this.intSize,
                this.size_tSize,
                this.instructionSize,
                this.integerSize,
                this.numberSize,
            ),
        );
        this.dv = new DataView(this.arraybuffer);
        this.u8 = new Uint8Array(this.arraybuffer);
    }

    read(size: number): Uint8Array {
        let u8 = new Uint8Array(size);
        if (luaZ_read(this.Z, u8, 0, size) !== 0) this.error('truncated');
        return u8;
    }

    LoadByte(): number {
        if (luaZ_read(this.Z, this.u8, 0, 1) !== 0) this.error('truncated');
        return this.u8[0]!;
    }

    LoadInt(): number {
        if (luaZ_read(this.Z, this.u8, 0, this.intSize) !== 0)
            this.error('truncated');
        return this.dv.getInt32(0, true);
    }

    LoadNumber(): number {
        if (luaZ_read(this.Z, this.u8, 0, this.numberSize) !== 0)
            this.error('truncated');
        return this.dv.getFloat64(0, true);
    }

    LoadInteger(): number {
        if (luaZ_read(this.Z, this.u8, 0, this.integerSize) !== 0)
            this.error('truncated');
        if (this.integerSize === 4) return this.dv.getInt32(0, true);
        if (this.integerSize === 8) {
            let low =
                (this.u8[0]! |
                    (this.u8[1]! << 8) |
                    (this.u8[2]! << 16) |
                    (this.u8[3]! << 24)) >>>
                0;
            let high =
                this.u8[4]! |
                (this.u8[5]! << 8) |
                (this.u8[6]! << 16) |
                (this.u8[7]! << 24) |
                0;
            return high * 2 ** 32 + low;
        }
        let res = 0;
        for (let i = this.integerSize - 1; i >= 0; i--) {
            res = res * 256 + this.u8[i]!;
        }
        let mask = 2 ** (this.integerSize * 8 - 1);
        if (res >= mask) res -= mask * 2;
        return res;
    }

    LoadSize_t(): number {
        return this.LoadInteger();
    }

    LoadString(): TString | null {
        let size = this.LoadByte();
        if (size === 0xff) size = this.LoadSize_t();
        if (size === 0) return null;
        return luaS_bless(this.L, this.read(size - 1));
    }

    /* creates a mask with 'n' 1 bits at position 'p' */
    static MASK1(n: number, p: number): number {
        return ~(~0 << n) << p;
    }

    LoadCode(f: Proto): void {
        let n = this.LoadInt();
        let p = BytecodeParser;
        let code = f.code as unknown as Instruction[];

        for (let i = 0; i < n; i++) {
            if (luaZ_read(this.Z, this.u8, 0, this.instructionSize) !== 0)
                this.error('truncated');
            let ins = this.dv.getUint32(0, true);
            code[i] = {
                code: ins,
                opcode: (ins >> POS_OP) & p.MASK1(SIZE_OP, 0),
                A: (ins >> POS_A) & p.MASK1(SIZE_A, 0),
                B: (ins >> POS_B) & p.MASK1(SIZE_B, 0),
                C: (ins >> POS_C) & p.MASK1(SIZE_C, 0),
                Bx: (ins >> POS_Bx) & p.MASK1(SIZE_Bx, 0),
                Ax: (ins >> POS_Ax) & p.MASK1(SIZE_Ax, 0),
                sBx: ((ins >> POS_Bx) & p.MASK1(SIZE_Bx, 0)) - MAXARG_sBx,
            };
        }
    }

    LoadConstants(f: Proto): void {
        let n = this.LoadInt();

        for (let i = 0; i < n; i++) {
            let t = this.LoadByte();

            switch (t) {
                case LUA_TNIL:
                    f.k.push(new lobject.TValue(LUA_TNIL, null));
                    break;
                case LUA_TBOOLEAN:
                    f.k.push(
                        new lobject.TValue(LUA_TBOOLEAN, this.LoadByte() !== 0),
                    );
                    break;
                case LUA_TNUMFLT:
                    f.k.push(
                        new lobject.TValue(LUA_TNUMFLT, this.LoadNumber()),
                    );
                    break;
                case LUA_TNUMINT:
                    f.k.push(
                        new lobject.TValue(LUA_TNUMINT, this.LoadInteger()),
                    );
                    break;
                case LUA_TSHRSTR:
                case LUA_TLNGSTR:
                    f.k.push(
                        new lobject.TValue(LUA_TLNGSTR, this.LoadString()),
                    );
                    break;
                default:
                    this.error(`unrecognized constant '${t}'`);
            }
        }
    }

    LoadProtos(f: Proto): void {
        let n = this.LoadInt();

        for (let i = 0; i < n; i++) {
            f.p[i] = new lfunc.Proto(this.L);
            this.LoadFunction(f.p[i]!, f.source);
        }
    }

    LoadUpvalues(f: Proto): void {
        let n = this.LoadInt();

        for (let i = 0; i < n; i++) {
            f.upvalues[i] = {
                name: null,
                instack: this.LoadByte(),
                idx: this.LoadByte(),
            };
        }
    }

    LoadDebug(f: Proto): void {
        let n = this.LoadInt();
        for (let i = 0; i < n; i++) f.lineinfo[i] = this.LoadInt();

        n = this.LoadInt();
        for (let i = 0; i < n; i++) {
            f.locvars[i] = {
                varname: this.LoadString(),
                startpc: this.LoadInt(),
                endpc: this.LoadInt(),
            };
        }

        n = this.LoadInt();
        for (let i = 0; i < n; i++) {
            f.upvalues[i]!.name = this.LoadString();
        }
    }

    LoadFunction(f: Proto, psource: TString | null): void {
        f.source = this.LoadString();
        if (f.source === null)
            /* no source in dump? */
            f.source = psource; /* reuse parent's source */
        f.linedefined = this.LoadInt();
        f.lastlinedefined = this.LoadInt();
        f.numparams = this.LoadByte();
        f.is_vararg = this.LoadByte() !== 0;
        f.maxstacksize = this.LoadByte();
        this.LoadCode(f);
        this.LoadConstants(f);
        this.LoadUpvalues(f);
        this.LoadProtos(f);
        this.LoadDebug(f);
    }

    checkliteral(s: Uint8Array, msg: string): void {
        let buff = this.read(s.length);
        if (!luastring_eq(buff, s)) this.error(msg);
    }

    checkHeader(): void {
        this.checkliteral(
            LUA_SIGNATURE.subarray(1),
            'not a',
        ); /* 1st char already checked */

        if (this.LoadByte() !== 0x53) this.error('version mismatch in');

        if (this.LoadByte() !== 0) this.error('format mismatch in');

        this.checkliteral(LUAC_DATA, 'corrupted');

        this.intSize = this.LoadByte();
        this.size_tSize = this.LoadByte();
        this.instructionSize = this.LoadByte();
        this.integerSize = this.LoadByte();
        this.numberSize = this.LoadByte();

        this.checksize(this.intSize, 4, 'int');
        this.checksize(this.size_tSize, 8, 'size_t');
        this.checksize(this.instructionSize, 4, 'instruction');
        this.checksize(this.integerSize, 8, 'integer');
        this.checksize(this.numberSize, 8, 'number');

        if (this.LoadInteger() !== 0x5678) this.error('endianness mismatch in');

        if (this.LoadNumber() !== 370.5) this.error('float format mismatch in');
    }

    error(why: string): never {
        lobject.luaO_pushfstring(
            this.L,
            to_luastring('%s: %s precompiled chunk'),
            this.name,
            to_luastring(why),
        );
        ldo.luaD_throw(this.L, LUA_ERRSYNTAX);
        throw new Error(why);
    }

    checksize(byte: number, size: number, tname: string): void {
        if (byte !== size) this.error(`${tname} size mismatch in`);
    }
}

const luaU_undump = function (
    L: lua_State,
    Z: ZIO,
    name: Uint8Array,
): lobject.LClosure {
    let S = new BytecodeParser(L, Z, name);
    S.checkHeader();
    let cl = lfunc.luaF_newLclosure(L, S.LoadByte());
    ldo.luaD_inctop(L);
    L.stack![L.top - 1]!.setclLvalue(cl);
    cl.p = new lfunc.Proto(L);
    S.LoadFunction(cl.p, null);
    lua_assert(cl.nupvalues === cl.p.upvalues.length);
    /* luai_verifycode */
    return cl;
};

export { luaU_undump };
