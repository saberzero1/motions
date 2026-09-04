import type { lua_State } from '../../../src/lib/fengari/lstate.js';
import * as lua from '../../../src/lib/fengari/lua.js';
import * as lauxlib from '../../../src/lib/fengari/lauxlib.js';
import * as lualib from '../../../src/lib/fengari/lualib.js';
import {
    to_luastring,
    to_jsstring,
} from '../../../src/lib/fengari/fengaricore.js';

function luaExpectOk(L: lua_State, code: string) {
    const status = lauxlib.luaL_dostring(L, to_luastring(code));
    if (status !== lua.LUA_OK) {
        const msg = lua.lua_tolstring(L, -1);
        throw new Error(msg ? to_jsstring(msg) : 'Lua error');
    }
}

// Helper: create fresh state
function newState(): lua_State {
    const L = lauxlib.luaL_newstate();
    if (!L) throw Error('failed to create lua state');
    lualib.luaL_openlibs(L);
    return L;
}

test('string.format sprintf-js replacement', () => {
    const L = newState();
    luaExpectOk(
        L,
        `
        assert(string.format("%d", 42) == "42")
        assert(string.format("%05d", 42) == "00042")
        assert(string.format("%.2f", 3.14159) == "3.14")
        assert(string.format("%x", 255) == "ff")
        assert(string.format("%X", 255) == "FF")
        assert(string.format("%+d", 42) == "+42")
        assert(string.format("%o", 8) == "10")
        assert(string.format("%c", 65) == "A")
        assert(string.format("%%") == "%")
        assert(string.format("%10d", 42) == "        42")
        assert(string.format("%-10d", 42) == "42        ")
        assert(string.format("% d", 42) == " 42")
        assert(string.format("%#x", 255) == "0xff")

        local se = string.format("%e", 100000)
        assert(se:match("^1%.000000e%+0?5$"))

        local sg = string.format("%g", 100000)
        assert(sg == "100000" or sg == "1e+05" or sg == "1e+005")

        local q = string.format("%q", 'hello "world"')
        assert(q:sub(1, 1) == '"' and q:sub(-1) == '"')
        assert(q:find([[\"]], 1, true))

        local spi = string.format("%.14g", math.pi)
        assert(spi == "3.14159265359" or spi == "3.1415926535898")

        assert(string.format("%a", 0.0) == "0x0p+0")
    `,
    );
});

test('53-bit integer constants', () => {
    const L = newState();
    luaExpectOk(
        L,
        `
        assert(math.maxinteger == 9007199254740991)
        assert(math.mininteger == -9007199254740991)
        assert(math.maxinteger + 1 ~= math.maxinteger)
        assert(math.tointeger(9007199254740991) == 9007199254740991)
        assert(math.tointeger(9007199254740992) == nil)
        assert(math.type(math.maxinteger) == "integer")
    `,
    );
});

test('53-bit integer arithmetic', () => {
    const L = newState();
    luaExpectOk(
        L,
        `
        assert(2^40 + 2^40 == 2^41)
        assert(2^40 * 2 == 2^41)
        assert(2^50 + 1 == 2^50 + 1)
        assert(-2^40 + 2^40 == 0)
        assert(math.abs(-2^40) == 2^40)
        assert((2^40) % 7 == 2)
        assert((2^40) // 3 == 366503875925)
    `,
    );
});

test('wide integer parsing and formatting', () => {
    const L = newState();
    luaExpectOk(
        L,
        `
        assert(tonumber("1099511627776") == 2^40)
        assert(tonumber("0x10000000000") == 2^40)
        assert(tonumber("FFFFFFFFFF", 16) == 1099511627775)
        assert(string.format("%d", 2^40) == "1099511627776")
        assert(string.format("%d", -2^40) == "-1099511627776")
    `,
    );
});

test('table keying with wide integers', () => {
    const L = newState();
    luaExpectOk(
        L,
        `
        local t = {}
        t[2^40] = true
        assert(t[2^40] == true)

        local t2 = {}
        t2[2^40] = "hello"
        assert(t2[2^40] == "hello")
    `,
    );
});

test('string.pack/unpack with SZINT=8', () => {
    const L = newState();
    luaExpectOk(
        L,
        `
        assert(string.packsize("j") == 8)

        local p = string.pack("j", 2^40)
        local v = string.unpack("j", p)
        assert(v == 2^40)

        local pn = string.pack("j", -2^40)
        local vn = string.unpack("j", pn)
        assert(vn == -2^40)

        local p5 = string.pack("i5", -1)
        assert(#p5 == 5)
        for i = 1, 5 do
            assert(string.byte(p5, i) == 255)
        end

        local p5n = string.pack("i5", -2^38)
        local v5n = string.unpack("i5", p5n)
        assert(v5n == -2^38)

        local p5u = string.pack("I5", 2^38)
        local v5u = string.unpack("I5", p5u)
        assert(v5u == 2^38)

        local ok, err = pcall(string.pack, "I5", -1)
        assert(ok == false)
        assert(tostring(err):match("unsigned overflow"))
    `,
    );
});

test('bitwise ops remain 32-bit', () => {
    const L = newState();
    luaExpectOk(
        L,
        `
        assert(0xFF & 0x0F == 0x0F)
        assert(0xFF | 0x100 == 0x1FF)
        assert(~0 == -1)
        assert(1 << 31 == -2147483648)
    `,
    );
});

test('for-loop with wide integers', () => {
    const L = newState();
    luaExpectOk(
        L,
        `
        local sum = 0
        for i = 2^40, 2^40 + 9 do
            sum = sum + 1
        end
        assert(sum == 10)
    `,
    );
});
