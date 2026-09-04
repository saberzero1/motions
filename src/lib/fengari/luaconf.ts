import { LUA_VERSION_MAJOR, LUA_VERSION_MINOR, to_luastring } from './defs.js';

type LuaConfigOverrides = {
    LUA_COMPAT_FLOATSTRING?: boolean;
    LUAI_MAXSTACK?: number;
    LUA_IDSIZE?: number;
    LUAL_BUFFERSIZE?: number;
};

const conf: LuaConfigOverrides = {};

/*
 ** LUA_PATH_SEP is the character that separates templates in a path.
 ** LUA_PATH_MARK is the string that marks the substitution points in a
 ** template.
 ** LUA_EXEC_DIR in a Windows path is replaced by the executable's
 ** directory.
 */
const LUA_PATH_SEP: string = ';';

const LUA_PATH_MARK: string = '?';

const LUA_EXEC_DIR: string = '!';

/*
@@ LUA_PATH_DEFAULT is the default path that Lua uses to look for
** Lua libraries.
@@ LUA_JSPATH_DEFAULT is the default path that Lua uses to look for
** JS libraries.
** CHANGE them if your machine has a non-conventional directory
** hierarchy or if you want to install your libraries in
** non-conventional directories.
*/
const LUA_VDIR: string = LUA_VERSION_MAJOR + '.' + LUA_VERSION_MINOR;

const LUA_DIRSEP: string = '/';

const LUA_LDIR: string = './lua/' + LUA_VDIR + '/';

const LUA_JSDIR: string = LUA_LDIR;

const LUA_PATH_DEFAULT: Uint8Array = to_luastring(
    LUA_LDIR +
        '?.lua;' +
        LUA_LDIR +
        '?/init.lua;' +
        /* LUA_JSDIR excluded as it is equal to LUA_LDIR */
        './?.lua;./?/init.lua',
);

const LUA_JSPATH_DEFAULT: Uint8Array = to_luastring(
    LUA_JSDIR + '?.js;' + LUA_JSDIR + 'loadall.js;./?.js',
);

/*
@@ LUA_COMPAT_FLOATSTRING makes Lua format integral floats without a
@@ a float mark ('.0').
** This macro is not on by default even in compatibility mode,
** because this is not really an incompatibility.
*/
const LUA_COMPAT_FLOATSTRING: boolean = conf.LUA_COMPAT_FLOATSTRING || false;

const LUA_MAXINTEGER: number = 9007199254740991;
const LUA_MININTEGER: number = -9007199254740991;

/*
@@ LUAI_MAXSTACK limits the size of the Lua stack.
** CHANGE it if you need a different limit. This limit is arbitrary;
** its only purpose is to stop Lua from consuming unlimited stack
** space (and to reserve some numbers for pseudo-indices).
*/
const LUAI_MAXSTACK: number = conf.LUAI_MAXSTACK || 1000000;

/*
@@ LUA_IDSIZE gives the maximum size for the description of the source
@@ of a function in debug information.
** CHANGE it if you want a different size.
*/
const LUA_IDSIZE: number =
    conf.LUA_IDSIZE ||
    60 - 1; /* fengari uses 1 less than lua as we don't embed the null byte */

const lua_integer2str = function (n: number): string {
    return String(n); /* should match behaviour of LUA_INTEGER_FMT */
};

const lua_number2str = function (n: number): string {
    return String(
        Number(n.toPrecision(14)),
    ); /* should match behaviour of LUA_NUMBER_FMT */
};

const lua_numbertointeger = function (n: number): number | false {
    return n >= LUA_MININTEGER && n <= LUA_MAXINTEGER ? n : false;
};

const LUA_INTEGER_FRMLEN: string = '';
const LUA_NUMBER_FRMLEN: string = '';

const LUA_INTEGER_FMT: string = `%${LUA_INTEGER_FRMLEN}d`;
const LUA_NUMBER_FMT: string = '%.14g';

const lua_getlocaledecpoint = function (): number {
    /* we hard-code the decimal point to '.' as a user cannot change the
       locale in most JS environments, and in that you can, a multi-byte
       locale is common.
    */
    return 46; /* '.'.charCodeAt(0) */
};

/*
@@ LUAL_BUFFERSIZE is the buffer size used by the lauxlib buffer system.
*/
const LUAL_BUFFERSIZE: number = conf.LUAL_BUFFERSIZE || 8192;

// See: http://croquetweak.blogspot.fr/2014/08/deconstructing-floats-frexp-and-ldexp.html
const frexp = function (value: number): [number, number] {
    if (value === 0) return [value, 0];
    let data = new DataView(new ArrayBuffer(8));
    data.setFloat64(0, value);
    let bits = (data.getUint32(0) >>> 20) & 0x7ff;
    if (bits === 0) {
        // denormal
        data.setFloat64(0, value * Math.pow(2, 64)); // exp + 64
        bits = ((data.getUint32(0) >>> 20) & 0x7ff) - 64;
    }
    let exponent = bits - 1022;
    let mantissa = ldexp(value, -exponent);
    return [mantissa, exponent];
};

const ldexp = function (mantissa: number, exponent: number): number {
    let steps = Math.min(3, Math.ceil(Math.abs(exponent) / 1023));
    let result = mantissa;
    for (let i = 0; i < steps; i++)
        result *= Math.pow(2, Math.floor((exponent + i) / steps));
    return result;
};

export {
    LUA_PATH_SEP,
    LUA_PATH_MARK,
    LUA_EXEC_DIR,
    LUA_VDIR,
    LUA_DIRSEP,
    LUA_LDIR,
    LUA_JSDIR,
    LUA_PATH_DEFAULT,
    LUA_JSPATH_DEFAULT,
    LUAI_MAXSTACK,
    LUA_COMPAT_FLOATSTRING,
    LUA_IDSIZE,
    LUA_INTEGER_FMT,
    LUA_INTEGER_FRMLEN,
    LUA_MAXINTEGER,
    LUA_MININTEGER,
    LUA_NUMBER_FMT,
    LUA_NUMBER_FRMLEN,
    LUAL_BUFFERSIZE,
    frexp,
    ldexp,
    lua_getlocaledecpoint,
    lua_integer2str,
    lua_number2str,
    lua_numbertointeger,
};
