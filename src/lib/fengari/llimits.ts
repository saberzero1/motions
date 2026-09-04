const lua_assert = function (c: boolean, msg?: string): void {
    if (!c) throw Error(msg ?? 'assertion failed');
};

const api_check = function (l: unknown, e: boolean, msg: string): void {
    void l;
    if (!e) throw Error(msg);
};

const LUAI_MAXCCALLS: number = 200;

/* minimum size for string buffer */
const LUA_MINBUFFER: number = 32;

const luai_nummod = function (L: unknown, a: number, b: number): number {
    void L;
    let m = a % b;
    if (m * b < 0) m += b;
    return m;
};

// If later integers are more than 32bit, LUA_MAXINTEGER will then be != MAX_INT
const MAX_INT: number = 9007199254740991;
const MIN_INT: number = -9007199254740991;

export {
    lua_assert,
    api_check,
    LUAI_MAXCCALLS,
    LUA_MINBUFFER,
    luai_nummod,
    MAX_INT,
    MIN_INT,
};
