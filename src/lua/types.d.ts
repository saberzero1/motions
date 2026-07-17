declare module 'fengari' {
    export type lua_State = object;

    export const lua: {
        lua_newstate: (f?: unknown) => lua_State;
        lua_close: (L: lua_State) => void;
        lua_pushjsfunction: (
            L: lua_State,
            fn: (L: lua_State) => number,
        ) => void;
        lua_setglobal: (L: lua_State, name: Uint8Array) => void;
        lua_getglobal: (L: lua_State, name: Uint8Array) => void;
        lua_getfield: (L: lua_State, index: number, key: Uint8Array) => void;
        lua_setfield: (L: lua_State, index: number, key: Uint8Array) => void;
        lua_newtable: (L: lua_State) => void;
        lua_setmetatable: (L: lua_State, index: number) => void;
        lua_pushstring: (L: lua_State, value: Uint8Array) => void;
        lua_pushboolean: (L: lua_State, value: boolean) => void;
        lua_pushnumber: (L: lua_State, value: number) => void;
        lua_pushnil: (L: lua_State) => void;
        lua_pushvalue: (L: lua_State, index: number) => void;
        lua_tolstring: (L: lua_State, index: number) => Uint8Array | null;
        lua_tonumber: (L: lua_State, index: number) => number;
        lua_toboolean: (L: lua_State, index: number) => boolean;
        lua_isstring: (L: lua_State, index: number) => boolean;
        lua_isnumber: (L: lua_State, index: number) => boolean;
        lua_isboolean: (L: lua_State, index: number) => boolean;
        lua_istable: (L: lua_State, index: number) => boolean;
        lua_isfunction: (L: lua_State, index: number) => boolean;
        lua_isnil: (L: lua_State, index: number) => boolean;
        lua_type: (L: lua_State, index: number) => number;
        lua_absindex: (L: lua_State, index: number) => number;
        lua_next: (L: lua_State, index: number) => number;
        lua_gettop: (L: lua_State) => number;
        lua_pop: (L: lua_State, count: number) => void;
        lua_pcall: (
            L: lua_State,
            nargs: number,
            nresults: number,
            errfunc: number,
        ) => number;
        lua_sethook: (
            L: lua_State,
            hook: ((L: lua_State) => number) | null,
            mask: number,
            count: number,
        ) => void;
        lua_rawgeti: (L: lua_State, index: number, n: number) => void;
        lua_rawseti: (L: lua_State, index: number, n: number) => void;
        lua_newthread: (L: lua_State) => lua_State;
        lua_resume: (
            L: lua_State,
            from: lua_State | null,
            nargs: number,
        ) => number;
        lua_yieldk: (
            L: lua_State,
            nresults: number,
            ctx: number,
            k: ((L: lua_State, status: number, ctx: number) => number) | null,
        ) => number;
        lua_status: (L: lua_State) => number;
        lua_xmove: (from: lua_State, to: lua_State, n: number) => void;
        lua_isyieldable: (L: lua_State) => boolean;
        LUA_OK: number;
        LUA_YIELD: number;
        LUA_ERRRUN: number;
        LUA_ERRSYNTAX: number;
        LUA_MASKCOUNT: number;
        LUA_TNUMBER: number;
        LUA_TSTRING: number;
        LUA_REGISTRYINDEX: number;
    };

    export const lauxlib: {
        luaL_newstate: () => lua_State;
        luaL_dostring: (L: lua_State, chunk: Uint8Array) => number;
        luaL_loadstring: (L: lua_State, chunk: Uint8Array) => number;
        luaL_checkstring: (L: lua_State, index: number) => Uint8Array;
        luaL_checknumber: (L: lua_State, index: number) => number;
        luaL_optstring: (
            L: lua_State,
            index: number,
            def: Uint8Array,
        ) => Uint8Array;
        luaL_requiref: (
            L: lua_State,
            modname: Uint8Array,
            openf: (L: lua_State) => number,
            glb: number,
        ) => void;
        luaL_ref: (L: lua_State, t: number) => number;
        luaL_unref: (L: lua_State, t: number, ref: number) => void;
        luaL_error: (L: lua_State, message: Uint8Array) => number;
        luaL_len: (L: lua_State, index: number) => number;
    };

    export const lualib: {
        luaopen_base: (L: lua_State) => number;
        luaopen_string: (L: lua_State) => number;
        luaopen_table: (L: lua_State) => number;
        luaopen_math: (L: lua_State) => number;
        luaopen_coroutine: (L: lua_State) => number;
        luaopen_utf8: (L: lua_State) => number;
    };

    export const to_luastring: (value: string) => Uint8Array;
    export const to_jsstring: (value: Uint8Array) => string;
}
