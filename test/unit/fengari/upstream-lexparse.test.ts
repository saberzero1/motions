import { expect, test } from 'vitest';
import * as lua from '../../../src/lib/fengari/lua.js';
import * as lauxlib from '../../../src/lib/fengari/lauxlib.js';
import * as lualib from '../../../src/lib/fengari/lualib.js';
import * as lstring from '../../../src/lib/fengari/lstring.js';
import { to_luastring } from '../../../src/lib/fengari/fengaricore.js';

// Roughly the same tests as test/lvm.js to cover all opcodes
test('LOADK, RETURN', () => {
    let L = lauxlib.luaL_newstate();
    if (!L) throw Error('failed to create lua state');

    let luaCode: string | null = `
        local a = "hello world"
        return a
    `;
    {
        lualib.luaL_openlibs(L);
        let reader = function () {
            let code = luaCode ? luaCode.trim() : null;
            luaCode = null;
            return code ? to_luastring(code) : null;
        };
        lua.lua_load(
            L,
            reader,
            luaCode,
            to_luastring('test'),
            to_luastring('text'),
        );

        lua.lua_call(L, 0, -1);
    }

    expect(lua.lua_tojsstring(L, -1)).toBe('hello world');
});

test('MOVE', () => {
    let L = lauxlib.luaL_newstate();
    if (!L) throw Error('failed to create lua state');

    let luaCode: string | null = `
        local a = "hello world"
        local b = a
        return b
    `;
    {
        lualib.luaL_openlibs(L);
        let reader = function () {
            let code = luaCode ? luaCode.trim() : null;
            luaCode = null;
            return code ? to_luastring(code) : null;
        };
        lua.lua_load(
            L,
            reader,
            luaCode,
            to_luastring('test'),
            to_luastring('text'),
        );

        lua.lua_call(L, 0, -1);
    }

    expect(lua.lua_tojsstring(L, -1)).toBe('hello world');
});

test('Binary op', () => {
    // TODO(known deviation): bitwise ops differ under 53-bit integer widening.
    let L = lauxlib.luaL_newstate();
    if (!L) throw Error('failed to create lua state');

    let luaCode: string | null = `
        local a = 5
        local b = 10
        return a + b, a - b, a * b, a / b, a % b, a^b, a // b, a & b, a | b, a ~ b, a << b, a >> b
    `;
    {
        lualib.luaL_openlibs(L);
        let reader = function () {
            let code = luaCode ? luaCode.trim() : null;
            luaCode = null;
            return code ? to_luastring(code) : null;
        };
        lua.lua_load(
            L,
            reader,
            luaCode,
            to_luastring('test'),
            to_luastring('text'),
        );

        lua.lua_call(L, 0, -1);
    }

    expect(
        (L.stack ?? []).slice(L.top - 12, L.top).map((e) => e.value),
    ).toEqual([15, -5, 50, 0.5, 5, 9765625.0, 0, 0, 15, 15, 5120, 0]);
});

test('Unary op, LOADBOOL', () => {
    // TODO(known deviation): bitwise ops differ under 53-bit integer widening.
    let L = lauxlib.luaL_newstate();
    if (!L) throw Error('failed to create lua state');

    let luaCode: string | null = `
        local a = 5
        local b = false
        return -a, not b, ~a
    `;
    {
        lualib.luaL_openlibs(L);
        let reader = function () {
            let code = luaCode ? luaCode.trim() : null;
            luaCode = null;
            return code ? to_luastring(code) : null;
        };
        lua.lua_load(
            L,
            reader,
            luaCode,
            to_luastring('test'),
            to_luastring('text'),
        );

        lua.lua_call(L, 0, -1);
    }

    expect((L.stack ?? []).slice(L.top - 3, L.top).map((e) => e.value)).toEqual(
        [-5, true, -6],
    );
});

test('NEWTABLE', () => {
    let L = lauxlib.luaL_newstate();
    if (!L) throw Error('failed to create lua state');

    let luaCode: string | null = `
        local a = {}
        return a
    `;
    {
        lualib.luaL_openlibs(L);
        let reader = function () {
            let code = luaCode ? luaCode.trim() : null;
            luaCode = null;
            return code ? to_luastring(code) : null;
        };
        lua.lua_load(
            L,
            reader,
            luaCode,
            to_luastring('test'),
            to_luastring('text'),
        );

        lua.lua_call(L, 0, -1);
    }

    expect(lua.lua_type(L, -1)).toBe(lua.LUA_TTABLE);
});

test('CALL', () => {
    let L = lauxlib.luaL_newstate();
    if (!L) throw Error('failed to create lua state');

    let luaCode: string | null = `
        local f = function (a, b)
            return a + b
        end
    
        local c = f(1, 2)
    
        return c
    `;
    {
        lualib.luaL_openlibs(L);
        let reader = function () {
            let code = luaCode ? luaCode.trim() : null;
            luaCode = null;
            return code ? to_luastring(code) : null;
        };
        lua.lua_load(
            L,
            reader,
            luaCode,
            to_luastring('test'),
            to_luastring('text'),
        );

        lua.lua_call(L, 0, -1);
    }

    expect(lua.lua_tointeger(L, -1)).toBe(3);
});

test('Multiple return', () => {
    let L = lauxlib.luaL_newstate();
    if (!L) throw Error('failed to create lua state');

    let luaCode: string | null = `
        local f = function (a, b)
            return a + b, a - b, a * b
        end
    
        local c
        local d
        local e
    
        c, d, e = f(1,2)
    
        return c, d, e
    `;
    {
        lualib.luaL_openlibs(L);
        let reader = function () {
            let code = luaCode ? luaCode.trim() : null;
            luaCode = null;
            return code ? to_luastring(code) : null;
        };
        lua.lua_load(
            L,
            reader,
            luaCode,
            to_luastring('test'),
            to_luastring('text'),
        );

        lua.lua_call(L, 0, -1);
    }

    expect((L.stack ?? []).slice(L.top - 3, L.top).map((e) => e.value)).toEqual(
        [3, -1, 2],
    );
});

test('TAILCALL', () => {
    let L = lauxlib.luaL_newstate();
    if (!L) throw Error('failed to create lua state');

    let luaCode: string | null = `
        local f = function (a, b)
            return a + b
        end
    
        return f(1,2)
    `;
    {
        lualib.luaL_openlibs(L);
        let reader = function () {
            let code = luaCode ? luaCode.trim() : null;
            luaCode = null;
            return code ? to_luastring(code) : null;
        };
        lua.lua_load(
            L,
            reader,
            luaCode,
            to_luastring('test'),
            to_luastring('text'),
        );

        lua.lua_call(L, 0, -1);
    }

    expect(lua.lua_tointeger(L, -1)).toBe(3);
});

test('VARARG', () => {
    let L = lauxlib.luaL_newstate();
    if (!L) throw Error('failed to create lua state');

    let luaCode: string | null = `
        local f = function (...)
            return ...
        end
    
        return f(1,2,3)
    `;
    {
        lualib.luaL_openlibs(L);
        let reader = function () {
            let code = luaCode ? luaCode.trim() : null;
            luaCode = null;
            return code ? to_luastring(code) : null;
        };
        lua.lua_load(
            L,
            reader,
            luaCode,
            to_luastring('test'),
            to_luastring('text'),
        );

        lua.lua_call(L, 0, -1);
    }

    expect((L.stack ?? []).slice(L.top - 3, L.top).map((e) => e.value)).toEqual(
        [1, 2, 3],
    );
});

test('LE, JMP', () => {
    let L = lauxlib.luaL_newstate();
    if (!L) throw Error('failed to create lua state');

    let luaCode: string | null = `
        local a, b = 1, 1
    
        return a >= b
    `;
    {
        lualib.luaL_openlibs(L);
        let reader = function () {
            let code = luaCode ? luaCode.trim() : null;
            luaCode = null;
            return code ? to_luastring(code) : null;
        };
        lua.lua_load(
            L,
            reader,
            luaCode,
            to_luastring('test'),
            to_luastring('text'),
        );

        lua.lua_call(L, 0, -1);
    }

    expect(lua.lua_toboolean(L, -1)).toBe(true);
});

test('LT', () => {
    let L = lauxlib.luaL_newstate();
    if (!L) throw Error('failed to create lua state');

    let luaCode: string | null = `
        local a, b = 1, 1
    
        return a > b
    `;
    {
        lualib.luaL_openlibs(L);
        let reader = function () {
            let code = luaCode ? luaCode.trim() : null;
            luaCode = null;
            return code ? to_luastring(code) : null;
        };
        lua.lua_load(
            L,
            reader,
            luaCode,
            to_luastring('test'),
            to_luastring('text'),
        );

        lua.lua_call(L, 0, -1);
    }

    expect(lua.lua_toboolean(L, -1)).toBe(false);
});

test('EQ', () => {
    let L = lauxlib.luaL_newstate();
    if (!L) throw Error('failed to create lua state');

    let luaCode: string | null = `
        local a, b = 1, 1
    
        return a == b
    `;
    {
        lualib.luaL_openlibs(L);
        let reader = function () {
            let code = luaCode ? luaCode.trim() : null;
            luaCode = null;
            return code ? to_luastring(code) : null;
        };
        lua.lua_load(
            L,
            reader,
            luaCode,
            to_luastring('test'),
            to_luastring('text'),
        );

        lua.lua_call(L, 0, -1);
    }

    expect(lua.lua_toboolean(L, -1)).toBe(true);
});

test('TESTSET (and)', () => {
    let L = lauxlib.luaL_newstate();
    if (!L) throw Error('failed to create lua state');

    let luaCode: string | null = `
        local a = true
        local b = "hello"
    
        return a and b
    `;
    {
        lualib.luaL_openlibs(L);
        let reader = function () {
            let code = luaCode ? luaCode.trim() : null;
            luaCode = null;
            return code ? to_luastring(code) : null;
        };
        lua.lua_load(
            L,
            reader,
            luaCode,
            to_luastring('test'),
            to_luastring('text'),
        );

        lua.lua_call(L, 0, -1);
    }

    expect(lua.lua_tojsstring(L, -1)).toBe('hello');
});

test('TESTSET (or)', () => {
    let L = lauxlib.luaL_newstate();
    if (!L) throw Error('failed to create lua state');

    let luaCode: string | null = `
        local a = false
        local b = "hello"
    
        return a or b
    `;
    {
        lualib.luaL_openlibs(L);
        let reader = function () {
            let code = luaCode ? luaCode.trim() : null;
            luaCode = null;
            return code ? to_luastring(code) : null;
        };
        lua.lua_load(
            L,
            reader,
            luaCode,
            to_luastring('test'),
            to_luastring('text'),
        );

        lua.lua_call(L, 0, -1);
    }

    expect(lua.lua_tojsstring(L, -1)).toBe('hello');
});

test('TEST (false)', () => {
    let L = lauxlib.luaL_newstate();
    if (!L) throw Error('failed to create lua state');

    let luaCode: string | null = `
        local a = false
        local b = "hello"
    
        if a then
            return b
        end
    
        return "goodbye"
    `;
    {
        lualib.luaL_openlibs(L);
        let reader = function () {
            let code = luaCode ? luaCode.trim() : null;
            luaCode = null;
            return code ? to_luastring(code) : null;
        };
        lua.lua_load(
            L,
            reader,
            luaCode,
            to_luastring('test'),
            to_luastring('text'),
        );

        lua.lua_call(L, 0, -1);
    }

    expect(lua.lua_tojsstring(L, -1)).toBe('goodbye');
});

test('FORPREP, FORLOOP (int)', () => {
    let L = lauxlib.luaL_newstate();
    if (!L) throw Error('failed to create lua state');

    let luaCode: string | null = `
        local total = 0
    
        for i = 0, 10 do
            total = total + i
        end
    
        return total
    `;
    {
        lualib.luaL_openlibs(L);
        let reader = function () {
            let code = luaCode ? luaCode.trim() : null;
            luaCode = null;
            return code ? to_luastring(code) : null;
        };
        lua.lua_load(
            L,
            reader,
            luaCode,
            to_luastring('test'),
            to_luastring('text'),
        );

        lua.lua_call(L, 0, -1);
    }

    expect(lua.lua_tointeger(L, -1)).toBe(55);
});

test('FORPREP, FORLOOP (float)', () => {
    let L = lauxlib.luaL_newstate();
    if (!L) throw Error('failed to create lua state');

    let luaCode: string | null = `
        local total = 0
    
        for i = 0.5, 10.5 do
            total = total + i
        end
    
        return total
    `;
    {
        lualib.luaL_openlibs(L);
        let reader = function () {
            let code = luaCode ? luaCode.trim() : null;
            luaCode = null;
            return code ? to_luastring(code) : null;
        };
        lua.lua_load(
            L,
            reader,
            luaCode,
            to_luastring('test'),
            to_luastring('text'),
        );

        lua.lua_call(L, 0, -1);
    }

    expect(lua.lua_tonumber(L, -1)).toBe(60.5);
});

test('SETTABLE, GETTABLE', () => {
    let L = lauxlib.luaL_newstate();
    if (!L) throw Error('failed to create lua state');

    let luaCode: string | null = `
        local t = {}
    
        t[1] = "hello"
        t["two"] = "world"
    
        return t
    `;
    {
        lualib.luaL_openlibs(L);
        let reader = function () {
            let code = luaCode ? luaCode.trim() : null;
            luaCode = null;
            return code ? to_luastring(code) : null;
        };
        lua.lua_load(
            L,
            reader,
            luaCode,
            to_luastring('test'),
            to_luastring('text'),
        );

        lua.lua_call(L, 0, -1);
    }

    const table = lua.lua_topointer(L, -1) as {
        strong: Map<unknown, { value: { jsstring: () => string } }>;
    };
    expect(table.strong.get(1)?.value.jsstring()).toBe('hello');
    expect(
        table.strong
            .get(lstring.luaS_hash(to_luastring('two')))
            ?.value.jsstring(),
    ).toBe('world');
});

test('SETUPVAL, GETUPVAL', () => {
    let L = lauxlib.luaL_newstate();
    if (!L) throw Error('failed to create lua state');

    let luaCode: string | null = `
        local up = "hello"
    
        local f = function ()
            upup = "yo"
            up = "world"
            return up;
        end
    
        return f()
    `;
    {
        lualib.luaL_openlibs(L);
        let reader = function () {
            let code = luaCode ? luaCode.trim() : null;
            luaCode = null;
            return code ? to_luastring(code) : null;
        };
        lua.lua_load(
            L,
            reader,
            luaCode,
            to_luastring('test'),
            to_luastring('text'),
        );

        lua.lua_call(L, 0, -1);
    }

    expect(lua.lua_tojsstring(L, -1)).toBe('world');
});

test('SETTABUP, GETTABUP', () => {
    let L = lauxlib.luaL_newstate();
    if (!L) throw Error('failed to create lua state');

    let luaCode: string | null = `
        t = {}
    
        t[1] = "hello"
        t["two"] = "world"
    
        return t
    `;
    {
        lualib.luaL_openlibs(L);
        let reader = function () {
            let code = luaCode ? luaCode.trim() : null;
            luaCode = null;
            return code ? to_luastring(code) : null;
        };
        lua.lua_load(
            L,
            reader,
            luaCode,
            to_luastring('test'),
            to_luastring('text'),
        );

        lua.lua_call(L, 0, -1);
    }

    const table = lua.lua_topointer(L, -1) as {
        strong: Map<unknown, { value: { jsstring: () => string } }>;
    };
    expect(table.strong.get(1)?.value.jsstring()).toBe('hello');
    expect(
        table.strong
            .get(lstring.luaS_hash(to_luastring('two')))
            ?.value.jsstring(),
    ).toBe('world');
});

test('SELF', () => {
    let L = lauxlib.luaL_newstate();
    if (!L) throw Error('failed to create lua state');

    let luaCode: string | null = `
        local t = {}
    
        t.value = "hello"
        t.get = function (self)
            return self.value
        end
    
        return t:get()
    `;
    {
        lualib.luaL_openlibs(L);
        let reader = function () {
            let code = luaCode ? luaCode.trim() : null;
            luaCode = null;
            return code ? to_luastring(code) : null;
        };
        lua.lua_load(
            L,
            reader,
            luaCode,
            to_luastring('test'),
            to_luastring('text'),
        );

        lua.lua_call(L, 0, -1);
    }

    expect(lua.lua_tojsstring(L, -1)).toBe('hello');
});

test('SETLIST', () => {
    let L = lauxlib.luaL_newstate();
    if (!L) throw Error('failed to create lua state');

    let luaCode: string | null = `
        local t = {1, 2, 3, 4, 5, 6, 7, 8, 9}
    
        return t
    `;
    {
        lualib.luaL_openlibs(L);
        let reader = function () {
            let code = luaCode ? luaCode.trim() : null;
            luaCode = null;
            return code ? to_luastring(code) : null;
        };
        lua.lua_load(
            L,
            reader,
            luaCode,
            to_luastring('test'),
            to_luastring('text'),
        );

        lua.lua_call(L, 0, -1);
    }

    const table = lua.lua_topointer(L, -1) as {
        strong: Map<unknown, { value: { value: number } }>;
    };
    const entries = [...table.strong.entries()];
    expect(entries.map((e) => e[1].value.value).sort()).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
});

test('Variable SETLIST', () => {
    let L = lauxlib.luaL_newstate();
    if (!L) throw Error('failed to create lua state');

    let luaCode: string | null = `
        local a = function ()
            return 6, 7, 8, 9
        end
    
        local t = {1, 2, 3, 4, 5, a()}
    
        return t
    `;
    {
        lualib.luaL_openlibs(L);
        let reader = function () {
            let code = luaCode ? luaCode.trim() : null;
            luaCode = null;
            return code ? to_luastring(code) : null;
        };
        lua.lua_load(
            L,
            reader,
            luaCode,
            to_luastring('test'),
            to_luastring('text'),
        );

        lua.lua_call(L, 0, -1);
    }

    const table = lua.lua_topointer(L, -1) as {
        strong: Map<unknown, { value: { value: number } }>;
    };
    const entries = [...table.strong.entries()];
    expect(entries.map((e) => e[1].value.value).sort()).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
});

test('Long SETLIST', () => {
    let L = lauxlib.luaL_newstate();
    if (!L) throw Error('failed to create lua state');

    let luaCode: string | null = `
        local t = {1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1, 2, 3, 4, 5}
    
        return t
    `;
    {
        lualib.luaL_openlibs(L);
        let reader = function () {
            let code = luaCode ? luaCode.trim() : null;
            luaCode = null;
            return code ? to_luastring(code) : null;
        };
        lua.lua_load(
            L,
            reader,
            luaCode,
            to_luastring('test'),
            to_luastring('text'),
        );

        lua.lua_call(L, 0, -1);
    }

    const table = lua.lua_topointer(L, -1) as {
        strong: Map<unknown, { value: { value: number } }>;
    };
    const entries = [...table.strong.entries()];
    expect(entries.map((e) => e[1].value.value).reverse()).toEqual([
        1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1, 2, 3, 4,
        5, 1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1, 2, 3,
        4, 5, 1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1, 2,
        3, 4, 5,
    ]);
});

test('TFORCALL, TFORLOOP', () => {
    let L = lauxlib.luaL_newstate();
    if (!L) throw Error('failed to create lua state');

    let luaCode: string | null = `
        local iterator = function (t, i)
            i = i + 1
            local v = t[i]
            if v then
                return i, v
            end
        end
    
        local iprs = function(t)
            return iterator, t, 0
        end
    
        local t = {1, 2, 3}
        local r = 0
        for k,v in iprs(t) do
            r = r + v
        end
    
        return r
    `;
    {
        lualib.luaL_openlibs(L);
        let reader = function () {
            let code = luaCode ? luaCode.trim() : null;
            luaCode = null;
            return code ? to_luastring(code) : null;
        };
        lua.lua_load(
            L,
            reader,
            luaCode,
            to_luastring('test'),
            to_luastring('text'),
        );

        lua.lua_call(L, 0, -1);
    }

    expect(lua.lua_tonumber(L, -1)).toBe(6);
});

test('LEN', () => {
    let L = lauxlib.luaL_newstate();
    if (!L) throw Error('failed to create lua state');

    let luaCode: string | null = `
        local t = {[10000] = "foo"}
        local t2 = {1, 2, 3}
        local s = "hello"
    
        return #t, #t2, #s
    `;
    {
        lualib.luaL_openlibs(L);
        let reader = function () {
            let code = luaCode ? luaCode.trim() : null;
            luaCode = null;
            return code ? to_luastring(code) : null;
        };
        lua.lua_load(
            L,
            reader,
            luaCode,
            to_luastring('test'),
            to_luastring('text'),
        );

        lua.lua_call(L, 0, -1);
    }

    expect(lua.lua_tonumber(L, -1)).toBe(5);
    expect(lua.lua_tonumber(L, -2)).toBe(3);
    expect(lua.lua_tonumber(L, -3)).toBe(0);
});

test('CONCAT', () => {
    let L = lauxlib.luaL_newstate();
    if (!L) throw Error('failed to create lua state');

    let luaCode: string | null = `
        return "hello " .. 2 .. " you"
    `;
    {
        lualib.luaL_openlibs(L);
        let reader = function () {
            let code = luaCode ? luaCode.trim() : null;
            luaCode = null;
            return code ? to_luastring(code) : null;
        };
        lua.lua_load(
            L,
            reader,
            luaCode,
            to_luastring('test'),
            to_luastring('text'),
        );

        lua.lua_call(L, 0, -1);
    }

    expect(lua.lua_tojsstring(L, -1)).toBe('hello 2 you');
});
