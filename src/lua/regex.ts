import { lua, lauxlib, to_jsstring, to_luastring } from 'fengari';
import type { lua_State } from 'fengari';

const luaPushInteger = (
    lua as unknown as { lua_pushinteger: (L: lua_State, n: number) => void }
).lua_pushinteger;
const luaToInteger = (
    lua as unknown as { lua_tointeger: (L: lua_State, index: number) => number }
).lua_tointeger;

export function injectRegex(L: lua_State, vimTableIndex: number): void {
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const patternRaw = lua.lua_tolstring(state, 1);
        if (!patternRaw) {
            return lauxlib.luaL_error(
                state,
                to_luastring('vim.regex: pattern required'),
            );
        }
        let pattern: string;
        try {
            pattern = to_jsstring(patternRaw);
        } catch {
            return lauxlib.luaL_error(
                state,
                to_luastring('vim.regex: invalid UTF-8 in pattern'),
            );
        }

        let flags = '';
        const flagsRaw = lua.lua_tolstring(state, 2);
        if (flagsRaw) {
            try {
                flags = to_jsstring(flagsRaw);
            } catch {
                return lauxlib.luaL_error(
                    state,
                    to_luastring('vim.regex: invalid UTF-8 in flags'),
                );
            }
        }

        let regex: RegExp;
        try {
            regex = new RegExp(pattern, flags);
        } catch (e) {
            return lauxlib.luaL_error(
                state,
                to_luastring(
                    `invalid regular expression: ${
                        e instanceof Error ? e.message : String(e)
                    }`,
                ),
            );
        }

        lua.lua_newtable(state);

        lua.lua_pushjsfunction(state, (s: lua_State) => {
            const strRaw = lua.lua_tolstring(s, 2);
            if (!strRaw) {
                lua.lua_pushnil(s);
                return 1;
            }
            let str: string;
            try {
                str = to_jsstring(strRaw);
            } catch {
                lua.lua_pushnil(s);
                lua.lua_pushstring(s, to_luastring('invalid UTF-8'));
                return 2;
            }
            regex.lastIndex = 0;
            const m = regex.exec(str);
            if (!m) {
                lua.lua_pushnil(s);
                return 1;
            }
            luaPushInteger(s, m.index);
            luaPushInteger(s, m.index + m[0].length);
            return 2;
        });
        lua.lua_setfield(state, -2, to_luastring('match_str'));

        lua.lua_getfield(state, -1, to_luastring('match_str'));
        lua.lua_setfield(state, -2, to_luastring('match_line'));

        lua.lua_pushjsfunction(state, (s: lua_State) => {
            const strRaw = lua.lua_tolstring(s, 2);
            if (!strRaw) {
                lua.lua_pushnil(s);
                return 1;
            }
            let str: string;
            try {
                str = to_jsstring(strRaw);
            } catch {
                lua.lua_pushnil(s);
                lua.lua_pushstring(s, to_luastring('invalid UTF-8'));
                return 2;
            }
            const start = luaToInteger(s, 3) || 0;
            const localRe = new RegExp(
                regex.source,
                regex.flags.includes('g') ? regex.flags : `${regex.flags}g`,
            );
            localRe.lastIndex = start;
            const m = localRe.exec(str);
            if (!m) {
                lua.lua_pushnil(s);
                return 1;
            }
            luaPushInteger(s, m.index);
            luaPushInteger(s, m.index + m[0].length);
            return 2;
        });
        lua.lua_setfield(state, -2, to_luastring('match_pos'));

        lua.lua_pushjsfunction(state, (s: lua_State) => {
            const strRaw = lua.lua_tolstring(s, 2);
            if (!strRaw) {
                lua.lua_pushnil(s);
                return 1;
            }
            const replRaw = lua.lua_tolstring(s, 3);
            if (!replRaw) {
                lua.lua_pushnil(s);
                return 1;
            }
            let str: string;
            let repl: string;
            try {
                str = to_jsstring(strRaw);
            } catch {
                return lauxlib.luaL_error(
                    s,
                    to_luastring('vim.regex.replace: invalid UTF-8 in string'),
                );
            }
            try {
                repl = to_jsstring(replRaw);
            } catch {
                return lauxlib.luaL_error(
                    s,
                    to_luastring(
                        'vim.regex.replace: invalid UTF-8 in replacement',
                    ),
                );
            }
            regex.lastIndex = 0;
            const result = str.replace(regex, repl);
            lua.lua_pushstring(s, to_luastring(result));
            return 1;
        });
        lua.lua_setfield(state, -2, to_luastring('replace'));

        lua.lua_pushjsfunction(state, (s: lua_State) => {
            const strRaw = lua.lua_tolstring(s, 2);
            if (!strRaw) {
                lua.lua_pushboolean(s, false);
                return 1;
            }
            let str: string;
            try {
                str = to_jsstring(strRaw);
            } catch {
                lua.lua_pushboolean(s, false);
                return 1;
            }
            regex.lastIndex = 0;
            lua.lua_pushboolean(s, regex.test(str));
            return 1;
        });
        lua.lua_setfield(state, -2, to_luastring('test'));

        return 1;
    });
    lua.lua_setfield(L, vimTableIndex, to_luastring('regex'));
}
