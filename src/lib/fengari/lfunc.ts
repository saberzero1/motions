import { constant_types } from './defs.js';
import * as lobject from './lobject.js';
import type { TString } from './lstring.js';
import type { lua_State } from './lstate.js';
import type { LClosure, LocVar, TValue } from './lobject.js';

const { LUA_TNIL } = constant_types;

class Proto {
    id: number;
    k: TValue[];
    p: Proto[];
    code: number[];
    cache: LClosure | null;
    lineinfo: number[];
    upvalues: { instack: number; idx: number; name: TString | null }[];
    numparams: number;
    is_vararg: boolean;
    maxstacksize: number;
    locvars: LocVar[];
    linedefined: number;
    lastlinedefined: number;
    source: TString | null;

    constructor(L: lua_State) {
        this.id = L.l_G.id_counter++;
        this.k = []; // constants used by the function
        this.p = []; // functions defined inside the function
        this.code = []; // opcodes
        this.cache = null; // last-created closure with this prototype
        this.lineinfo = []; // map from opcodes to source lines (debug information)
        this.upvalues = []; // upvalue information
        this.numparams = 0; // number of fixed parameters
        this.is_vararg = false;
        this.maxstacksize = 0; // number of registers needed by this function
        this.locvars = []; // information about local variables (debug information)
        this.linedefined = 0; // debug information
        this.lastlinedefined = 0; // debug information
        this.source = null; // used for debug information
    }
}

const luaF_newLclosure = function (L: lua_State, n: number): LClosure {
    return new lobject.LClosure(L, n);
};

const luaF_findupval = function (L: lua_State, level: number): TValue {
    return L.stack![level]!;
};

const luaF_close = function (L: lua_State, level: number): void {
    /* Create new TValues on stack;
     * any closures will keep referencing old TValues */
    for (let i = level; i < L.top; i++) {
        let old = L.stack![i]!;
        L.stack![i] = new lobject.TValue(old.type, old.value);
    }
};

/*
 ** fill a closure with new upvalues
 */
const luaF_initupvals = function (L: lua_State, cl: LClosure): void {
    for (let i = 0; i < cl.nupvalues; i++)
        cl.upvals[i] = new lobject.TValue(LUA_TNIL, null);
};

/*
 ** Look for n-th local variable at line 'line' in function 'func'.
 ** Returns null if not found.
 */
const luaF_getlocalname = function (
    f: Proto,
    local_number: number,
    pc: number,
): Uint8Array | null {
    for (let i = 0; i < f.locvars.length && f.locvars[i]!.startpc <= pc; i++) {
        const loc = f.locvars[i]!;
        if (pc < loc.endpc) {
            /* is variable active? */
            local_number--;
            if (local_number === 0) return loc.varname!.getstr();
        }
    }
    return null; /* not found */
};

const MAXUPVAL = 255;

export {
    MAXUPVAL,
    Proto,
    luaF_findupval,
    luaF_close,
    luaF_getlocalname,
    luaF_initupvals,
    luaF_newLclosure,
};
