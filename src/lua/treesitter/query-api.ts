import { lua, lauxlib, to_luastring, to_jsstring } from 'fengari';
import type { lua_State } from 'fengari';
import { QueryWrapper } from '../../treesitter/query';
import {
    registerPredicate,
    listPredicates,
    clearCustomPredicates,
    type PredicateHandler,
} from '../../treesitter/predicates';
import {
    registerDirective,
    listDirectives,
    clearCustomDirectives,
    type DirectiveHandler,
} from '../../treesitter/directives';
import { pushTSNode, extractNode } from './node';
import { pushLuaAny } from '../api';

type RuntimeModule = typeof import('../../treesitter/runtime');

let _runtime: RuntimeModule | null = null;

function luaToUserdata(L: lua_State, index: number): QueryWrapper | null {
    return lua.lua_touserdata(L, index) as QueryWrapper | null;
}

function luaPushLightUserdata(L: lua_State, data: QueryWrapper): void {
    lua.lua_pushlightuserdata(L, data);
}

export function setQueryRuntime(rt: RuntimeModule): void {
    _runtime = rt;
}

function rt(): RuntimeModule {
    if (!_runtime)
        throw new Error('Treesitter runtime not set for query module');
    return _runtime;
}

const namedQueryCache = new Map<string, QueryWrapper>();

function readLuaString(L: lua_State, index: number): string | null {
    if (!lua.lua_isstring(L, index)) return null;
    const raw = lua.lua_tolstring(L, index);
    return raw ? to_jsstring(raw) : null;
}

function pushMetadata(
    L: lua_State,
    metadata: Record<string, string | number | null>,
): void {
    lua.lua_newtable(L);
    for (const [key, value] of Object.entries(metadata)) {
        if (value === null) {
            lua.lua_pushnil(L);
        } else if (typeof value === 'number') {
            lua.lua_pushnumber(L, value);
        } else {
            lua.lua_pushstring(L, to_luastring(value));
        }
        lua.lua_setfield(L, -2, to_luastring(key));
    }
}

const queryMethods: Record<string, (state: lua_State) => number> = {
    iter_captures: (state) => {
        lua.lua_getfield(state, 1, to_luastring('_query'));
        const queryObj = luaToUserdata(state, -1);
        lua.lua_pop(state, 1);
        if (!queryObj)
            return lauxlib.luaL_error(state, to_luastring('invalid query'));

        if (!lua.lua_istable(state, 2)) {
            return lauxlib.luaL_error(
                state,
                to_luastring('iter_captures: expected node'),
            );
        }
        const node = extractNode(state, 2);
        lua.lua_getfield(state, 1, to_luastring('_source'));
        const source = readLuaString(state, -1) ?? '';
        lua.lua_pop(state, 1);

        let startRow: number | undefined;
        let endRow: number | undefined;
        if (lua.lua_isnumber(state, 3)) startRow = lua.lua_tonumber(state, 3);
        if (lua.lua_isnumber(state, 4)) endRow = lua.lua_tonumber(state, 4);

        const captures = queryObj.iterCaptures(node, source, {
            startRow,
            endRow,
        });
        let idx = 0;

        lua.lua_pushjsfunction(state, (iterState: lua_State) => {
            if (idx >= captures.length) return 0;
            const cap = captures[idx]!;
            idx++;
            lua.lua_pushinteger(iterState, cap.captureId + 1);
            pushTSNode(iterState, cap.node, source);
            pushMetadata(iterState, cap.metadata);
            return 3;
        });
        return 1;
    },

    iter_matches: (state) => {
        lua.lua_getfield(state, 1, to_luastring('_query'));
        const queryObj = luaToUserdata(state, -1);
        lua.lua_pop(state, 1);
        if (!queryObj)
            return lauxlib.luaL_error(state, to_luastring('invalid query'));

        if (!lua.lua_istable(state, 2)) {
            return lauxlib.luaL_error(
                state,
                to_luastring('iter_matches: expected node'),
            );
        }
        const node = extractNode(state, 2);
        lua.lua_getfield(state, 1, to_luastring('_source'));
        const source = readLuaString(state, -1) ?? '';
        lua.lua_pop(state, 1);

        let startRow: number | undefined;
        let endRow: number | undefined;
        if (lua.lua_isnumber(state, 3)) startRow = lua.lua_tonumber(state, 3);
        if (lua.lua_isnumber(state, 4)) endRow = lua.lua_tonumber(state, 4);

        const matches = queryObj.iterMatches(node, source, {
            startRow,
            endRow,
        });
        let idx = 0;

        lua.lua_pushjsfunction(state, (iterState: lua_State) => {
            if (idx >= matches.length) return 0;
            const match = matches[idx]!;
            idx++;

            lua.lua_pushinteger(iterState, match.patternIndex + 1);
            lua.lua_newtable(iterState);
            for (const [captureId, nodes] of match.captures) {
                lua.lua_newtable(iterState);
                for (let i = 0; i < nodes.length; i++) {
                    const n = nodes[i];
                    if (n) {
                        pushTSNode(iterState, n, source);
                        lua.lua_rawseti(iterState, -2, i + 1);
                    }
                }
                lua.lua_rawseti(iterState, -2, captureId + 1);
            }
            pushMetadata(iterState, match.metadata);

            return 3;
        });
        return 1;
    },

    disable_capture: (state) => {
        lua.lua_getfield(state, 1, to_luastring('_query'));
        const queryObj = luaToUserdata(state, -1);
        lua.lua_pop(state, 1);
        const name = readLuaString(state, 2);
        if (queryObj && name) queryObj.disableCapture(name);
        return 0;
    },

    disable_pattern: (state) => {
        lua.lua_getfield(state, 1, to_luastring('_query'));
        const queryObj = luaToUserdata(state, -1);
        lua.lua_pop(state, 1);
        if (queryObj && lua.lua_isnumber(state, 2)) {
            queryObj.disablePattern(lua.lua_tonumber(state, 2));
        }
        return 0;
    },
};

function pushQueryObject(
    L: lua_State,
    wrapper: QueryWrapper,
    sourceText: string,
): void {
    lua.lua_newtable(L);
    const qIndex = lua.lua_gettop(L);

    luaPushLightUserdata(L, wrapper);
    lua.lua_setfield(L, qIndex, to_luastring('_query'));
    lua.lua_pushstring(L, to_luastring(sourceText));
    lua.lua_setfield(L, qIndex, to_luastring('_source'));

    lua.lua_newtable(L);
    for (let i = 0; i < wrapper.captureNames.length; i++) {
        const name = wrapper.captureNames[i];
        if (name) {
            lua.lua_pushstring(L, to_luastring(name));
            lua.lua_rawseti(L, -2, i + 1);
        }
    }
    lua.lua_setfield(L, qIndex, to_luastring('captures'));

    lua.lua_newtable(L);
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const key = readLuaString(state, 2);
        if (!key) {
            lua.lua_pushnil(state);
            return 1;
        }
        const method = queryMethods[key];
        if (method) {
            lua.lua_pushjsfunction(state, method);
            return 1;
        }
        lua.lua_pushnil(state);
        return 1;
    });
    lua.lua_setfield(L, -2, to_luastring('__index'));
    lua.lua_setmetatable(L, qIndex);
}

export function injectQueryApi(L: lua_State, tsTableIndex: number): void {
    lua.lua_newtable(L);
    const queryIndex = lua.lua_gettop(L);

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const lang = readLuaString(state, 1);
        const queryStr = readLuaString(state, 2);
        if (!lang)
            return lauxlib.luaL_error(
                state,
                to_luastring('query.parse: expected lang'),
            );
        if (!queryStr)
            return lauxlib.luaL_error(
                state,
                to_luastring('query.parse: expected query string'),
            );

        const language = rt().getLanguage(lang);
        if (!language) {
            return lauxlib.luaL_error(
                state,
                to_luastring(`Language "${lang}" not loaded`),
            );
        }

        try {
            const wrapper = new QueryWrapper(language, queryStr);
            pushQueryObject(state, wrapper, '');
            return 1;
        } catch (e) {
            return lauxlib.luaL_error(
                state,
                to_luastring(
                    `Query parse error: ${e instanceof Error ? e.message : String(e)}`,
                ),
            );
        }
    });
    lua.lua_setfield(L, queryIndex, to_luastring('parse'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const lang = readLuaString(state, 1);
        const queryName = readLuaString(state, 2);
        if (!lang || !queryName) {
            lua.lua_pushnil(state);
            return 1;
        }
        const key = `${lang}/${queryName}`;
        const cached = namedQueryCache.get(key);
        if (cached) {
            pushQueryObject(state, cached, '');
            return 1;
        }
        lua.lua_pushnil(state);
        return 1;
    });
    lua.lua_setfield(L, queryIndex, to_luastring('get'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const lang = readLuaString(state, 1);
        const queryName = readLuaString(state, 2);
        const queryText = readLuaString(state, 3);
        if (!lang || !queryName || !queryText) return 0;

        const language = rt().getLanguage(lang);
        if (!language) return 0;

        try {
            const wrapper = new QueryWrapper(language, queryText);
            const key = `${lang}/${queryName}`;
            const existing = namedQueryCache.get(key);
            if (existing) existing.delete();
            namedQueryCache.set(key, wrapper);
        } catch {
            /* query parse failed */
        }
        return 0;
    });
    lua.lua_setfield(L, queryIndex, to_luastring('set'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        lua.lua_newtable(state);
        return 1;
    });
    lua.lua_setfield(L, queryIndex, to_luastring('get_files'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        pushLuaAny(state, listPredicates());
        return 1;
    });
    lua.lua_setfield(L, queryIndex, to_luastring('list_predicates'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        pushLuaAny(state, listDirectives());
        return 1;
    });
    lua.lua_setfield(L, queryIndex, to_luastring('list_directives'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const name = readLuaString(state, 1);
        if (!name)
            return lauxlib.luaL_error(
                state,
                to_luastring('add_predicate: expected name'),
            );
        if (!lua.lua_isfunction(state, 2)) {
            return lauxlib.luaL_error(
                state,
                to_luastring('add_predicate: expected handler function'),
            );
        }
        lua.lua_pushvalue(state, 2);
        const ref = lauxlib.luaL_ref(state, lua.LUA_REGISTRYINDEX);

        const handler: PredicateHandler = (operands, captures, source) => {
            lua.lua_rawgeti(state, lua.LUA_REGISTRYINDEX, ref);
            pushLuaAny(state, operands);
            const captureObj: Record<string, string[]> = {};
            for (const [capName, nodes] of captures) {
                captureObj[capName] = nodes.map((n) =>
                    source.slice(n.startIndex, n.endIndex),
                );
            }
            pushLuaAny(state, captureObj);
            lua.lua_pushstring(state, to_luastring(source));
            const status = lua.lua_pcall(state, 3, 1, 0);
            if (status !== lua.LUA_OK) {
                lua.lua_pop(state, 1);
                return false;
            }
            const result = lua.lua_toboolean(state, -1);
            lua.lua_pop(state, 1);
            return result;
        };

        registerPredicate(name, handler);
        return 0;
    });
    lua.lua_setfield(L, queryIndex, to_luastring('add_predicate'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const name = readLuaString(state, 1);
        if (!name)
            return lauxlib.luaL_error(
                state,
                to_luastring('add_directive: expected name'),
            );
        if (!lua.lua_isfunction(state, 2)) {
            return lauxlib.luaL_error(
                state,
                to_luastring('add_directive: expected handler function'),
            );
        }
        lua.lua_pushvalue(state, 2);
        const ref = lauxlib.luaL_ref(state, lua.LUA_REGISTRYINDEX);

        const handler: DirectiveHandler = () => {
            void ref;
        };

        registerDirective(name, handler);
        return 0;
    });
    lua.lua_setfield(L, queryIndex, to_luastring('add_directive'));

    lua.lua_pushjsfunction(L, (_state: lua_State) => 0);
    lua.lua_setfield(L, queryIndex, to_luastring('edit'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        lua.lua_newtable(state);
        return 1;
    });
    lua.lua_setfield(L, queryIndex, to_luastring('lint'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        lua.lua_pushinteger(state, 0);
        return 1;
    });
    lua.lua_setfield(L, queryIndex, to_luastring('omnifunc'));

    lua.lua_setfield(L, tsTableIndex, to_luastring('query'));
}

export function clearQueryState(): void {
    clearCustomPredicates();
    clearCustomDirectives();
}
