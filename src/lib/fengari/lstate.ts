import {
    LUA_MINSTACK,
    LUA_RIDX_GLOBALS,
    LUA_RIDX_MAINTHREAD,
    constant_types,
    thread_status,
} from './defs.js';
import * as lobject from './lobject.js';
import * as ldo from './ldo.js';
import * as lapi from './lapi.js';
import * as ltable from './ltable.js';
import * as ltm from './ltm.js';
import type { lua_Debug } from './defs.js';
import type { TString } from './lstring.js';
import type { Table } from './ltable.js';

const { LUA_NUMTAGS, LUA_TNIL, LUA_TTABLE, LUA_TTHREAD } = constant_types;
const { LUA_OK } = thread_status;

const EXTRA_STACK = 5;

const BASIC_STACK_SIZE = 2 * LUA_MINSTACK;

class CallInfo {
    func: lobject.TValue | null;
    funcOff: number;
    top: number;
    previous: CallInfo | null;
    next: CallInfo | null;
    l_base: number;
    l_code: number[] | null;
    l_savedpc: number;
    c_k: ((L: lua_State, status: number, ctx: number) => number) | null;
    c_old_errfunc: number | null;
    c_ctx: number | null;
    nresults: number;
    callstatus: number;

    constructor() {
        this.func = null;
        this.funcOff = NaN;
        this.top = NaN;
        this.previous = null;
        this.next = null;

        /* only for Lua functions */
        this.l_base = NaN; /* base for this function */
        this.l_code = null; /* reference to this.func.p.code */
        this.l_savedpc = NaN; /* offset into l_code */
        /* only for JS functions */
        this.c_k = null; /* continuation in case of yields */
        this.c_old_errfunc = null;
        this.c_ctx = null; /* context info. in case of yields */

        this.nresults = NaN;
        this.callstatus = NaN;
    }
}

class lua_State {
    id: number;
    base_ci: CallInfo;
    top: number;
    stack_last: number;
    oldpc: number;
    l_G: global_State;
    stack: lobject.TValue[] | null;
    ci: CallInfo | null;
    errorJmp: { status: number } | null;
    nCcalls: number;
    hook: ((L: lua_State, ar: lua_Debug) => void) | null;
    hookmask: number;
    basehookcount: number;
    allowhook: number;
    hookcount: number;
    nny: number;
    status: number;
    errfunc: number;

    constructor(g: global_State) {
        this.id = g.id_counter++;

        this.base_ci =
            new CallInfo(); /* CallInfo for first level (C calling Lua) */
        this.top = NaN; /* first free slot in the stack */
        this.stack_last = NaN; /* last free slot in the stack */
        this.oldpc = NaN; /* last pc traced */

        /* preinit_thread */
        this.l_G = g;
        this.stack = null;
        this.ci = null;
        this.errorJmp = null;
        this.nCcalls = 0;
        this.hook = null;
        this.hookmask = 0;
        this.basehookcount = 0;
        this.allowhook = 1;
        this.hookcount = this.basehookcount;
        this.nny = 1;
        this.status = LUA_OK;
        this.errfunc = 0;
    }
}

class global_State {
    id_counter: number;
    ids: WeakMap<object, number>;
    mainthread: lua_State | null;
    l_registry: lobject.TValue;
    panic: ((L: lua_State) => number) | null;
    atnativeerror: ((L: lua_State) => number) | null;
    version: number | null;
    tmname: TString[];
    mt: (Table | null)[];
    finalizerQueue: { gcFunc: lobject.TValue }[];
    finalizerTokens: Set<object>;
    vmAlive: boolean;
    draining: boolean;
    finalizerRegistry: FinalizationRegistry<{ gcFunc: lobject.TValue }> | null;

    constructor() {
        this.id_counter = 1; /* used to give objects unique ids */
        this.ids = new WeakMap();

        this.mainthread = null;
        this.l_registry = new lobject.TValue(LUA_TNIL, null);
        this.panic = null;
        this.atnativeerror = null;
        this.version = null;
        this.tmname = new Array<TString>(ltm.TMS.TM_N);
        this.mt = new Array<Table | null>(LUA_NUMTAGS);

        this.finalizerQueue = [];
        this.finalizerTokens = new Set();
        this.vmAlive = true;
        this.draining = false;
        this.finalizerRegistry =
            typeof FinalizationRegistry !== 'undefined'
                ? new FinalizationRegistry((held) => {
                      if (!this.vmAlive) return;
                      this.finalizerQueue.push(held);
                  })
                : null;
    }
}

const luaE_extendCI = function (L: lua_State): CallInfo {
    let ci = new CallInfo();
    L.ci!.next = ci;
    ci.previous = L.ci;
    ci.next = null;
    L.ci = ci;
    return ci;
};

const luaE_freeCI = function (L: lua_State): void {
    let ci = L.ci;
    ci!.next = null;
};

const stack_init = function (L1: lua_State, L: lua_State): void {
    L1.stack = new Array(BASIC_STACK_SIZE);
    L1.top = 0;
    L1.stack_last = BASIC_STACK_SIZE - EXTRA_STACK;
    /* initialize first ci */
    let ci = L1.base_ci;
    ci.next = ci.previous = null;
    ci.callstatus = 0;
    ci.funcOff = L1.top;
    ci.func = L1.stack[L1.top]!;
    L1.stack[L1.top++] = new lobject.TValue(LUA_TNIL, null);
    ci.top = L1.top + LUA_MINSTACK;
    L1.ci = ci;
};

const freestack = function (L: lua_State): void {
    L.ci = L.base_ci;
    luaE_freeCI(L);
    L.stack = null;
};

/*
 ** Create registry table and its predefined values
 */
const init_registry = function (L: lua_State, g: global_State): void {
    let registry = ltable.luaH_new(L);
    g.l_registry.sethvalue(registry);
    ltable.luaH_setint(
        registry,
        LUA_RIDX_MAINTHREAD,
        new lobject.TValue(LUA_TTHREAD, L),
    );
    ltable.luaH_setint(
        registry,
        LUA_RIDX_GLOBALS,
        new lobject.TValue(LUA_TTABLE, ltable.luaH_new(L)),
    );
};

/*
 ** open parts of the state that may cause memory-allocation errors.
 ** ('g->version' !== NULL flags that the state was completely build)
 */
const f_luaopen = function (L: lua_State): void {
    let g = L.l_G;
    stack_init(L, L);
    init_registry(L, g);
    ltm.luaT_init(L);
    g.version = lapi.lua_version(null);
};

const lua_newthread = function (L: lua_State): lua_State {
    let g = L.l_G;
    let L1 = new lua_State(g);
    L.stack![L.top] = new lobject.TValue(LUA_TTHREAD, L1);
    lapi.api_incr_top(L);
    L1.hookmask = L.hookmask;
    L1.basehookcount = L.basehookcount;
    L1.hook = L.hook;
    L1.hookcount = L1.basehookcount;
    stack_init(L1, L);
    return L1;
};

const luaE_freethread = function (L: lua_State, L1: lua_State): void {
    freestack(L1);
};

const lua_newstate = function (): lua_State | null {
    let g = new global_State();
    let L = new lua_State(g);
    g.mainthread = L;

    if (ldo.luaD_rawrunprotected(L, f_luaopen, null) !== LUA_OK) {
        return null;
    }

    return L;
};

const CIST_FIN = 1 << 8;

const drainFinalizers = function (L: lua_State): void {
    let g = L.l_G;
    if (!g.vmAlive || g.draining || g.finalizerQueue.length === 0) return;
    g.draining = true;
    try {
        while (g.finalizerQueue.length > 0) {
            let held = g.finalizerQueue.shift()!;
            try {
                let thread = lua_newthread(L);
                thread.stack![thread.top] = held.gcFunc;
                thread.top++;
                thread.stack![thread.top] = new lobject.TValue(LUA_TNIL, null);
                thread.top++;
                let funcOff = thread.top - 2;
                ldo.luaD_pcall(
                    thread,
                    function (T: lua_State) {
                        T.ci!.callstatus |= CIST_FIN;
                        ldo.luaD_callnoyield(T, funcOff, 0);
                    },
                    null,
                    funcOff,
                    0,
                );
                luaE_freethread(L, thread);
                L.top--;
                // eslint-disable-next-line @typescript-eslint/no-unused-vars -- catch binding intentionally unused
            } catch (_e) {
                /* swallow — PUC-Rio semantics */
            }
        }
    } finally {
        g.draining = false;
    }
};

const close_state = function (L: lua_State): void {
    freestack(L);
};

const lua_close = function (L: lua_State): void {
    L = L.l_G.mainthread!;
    drainFinalizers(L);
    L.l_G.vmAlive = false;
    if (L.l_G.finalizerRegistry) {
        for (let token of L.l_G.finalizerTokens) {
            L.l_G.finalizerRegistry.unregister(token);
        }
        L.l_G.finalizerTokens.clear();
    }
    close_state(L);
};

const CIST_OAH = 1 << 0;
const CIST_LUA = 1 << 1;
const CIST_HOOKED = 1 << 2;
const CIST_FRESH = 1 << 3;
const CIST_YPCALL = 1 << 4;
const CIST_TAIL = 1 << 5;
const CIST_HOOKYIELD = 1 << 6;
const CIST_LEQ = 1 << 7;

export {
    lua_State,
    global_State,
    CallInfo,
    CIST_OAH,
    CIST_LUA,
    CIST_HOOKED,
    CIST_FRESH,
    CIST_YPCALL,
    CIST_TAIL,
    CIST_HOOKYIELD,
    CIST_LEQ,
    CIST_FIN,
    EXTRA_STACK,
    lua_close,
    lua_newstate,
    lua_newthread,
    luaE_extendCI,
    luaE_freeCI,
    luaE_freethread,
    drainFinalizers,
};
