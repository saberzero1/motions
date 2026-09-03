import { lua, lauxlib, to_luastring, to_jsstring } from '../../lib/fengari';
import type { lua_State } from '../../lib/fengari';
import type { CoroutineRunner } from '../coroutine-runner';
import type { FiletypeLangMap, LangFiletypeMap } from '../../treesitter/types';

type RuntimeModule = typeof import('../../treesitter/runtime');

let _runtime: RuntimeModule | null = null;

export function setLanguageRuntime(rt: RuntimeModule): void {
    _runtime = rt;
}

function rt(): RuntimeModule {
    if (!_runtime) {
        throw new Error('Treesitter runtime not set for language module');
    }
    return _runtime;
}

const filetypeToLang: FiletypeLangMap = new Map([
    ['markdown', 'markdown'],
    ['html', 'html'],
]);

const langToFiletypes: LangFiletypeMap = new Map([
    ['markdown', new Set(['markdown'])],
    ['html', new Set(['html'])],
]);

export function getRegisteredLang(filetype: string): string | undefined {
    return filetypeToLang.get(filetype);
}

export function injectLanguageApi(
    L: lua_State,
    tsTableIndex: number,
    runner: CoroutineRunner | undefined,
): void {
    lua.lua_newtable(L);
    const langIndex = lua.lua_gettop(L);

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const lang = lua.lua_tolstring(state, 1);
        const filetype = lua.lua_tolstring(state, 2);
        if (!lang || !filetype) {
            return lauxlib.luaL_error(
                state,
                to_luastring(
                    'vim.treesitter.language.register: expected lang and filetype',
                ),
            );
        }
        const langStr = to_jsstring(lang);
        const ftRaw = to_jsstring(filetype);
        const filetypes = ftRaw.includes(',') ? ftRaw.split(',') : [ftRaw];
        for (const ft of filetypes) {
            const trimmed = ft.trim();
            if (trimmed.length === 0) continue;
            filetypeToLang.set(trimmed, langStr);
            let set = langToFiletypes.get(langStr);
            if (!set) {
                set = new Set();
                langToFiletypes.set(langStr, set);
            }
            set.add(trimmed);
        }
        return 0;
    });
    lua.lua_setfield(L, langIndex, to_luastring('register'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const ft = lua.lua_tolstring(state, 1);
        if (!ft) {
            lua.lua_pushnil(state);
            return 1;
        }
        const lang = filetypeToLang.get(to_jsstring(ft));
        if (lang) {
            lua.lua_pushstring(state, to_luastring(lang));
        } else {
            lua.lua_pushnil(state);
        }
        return 1;
    });
    lua.lua_setfield(L, langIndex, to_luastring('get_lang'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const lang = lua.lua_tolstring(state, 1);
        if (!lang) {
            lua.lua_newtable(state);
            return 1;
        }
        const fts = langToFiletypes.get(to_jsstring(lang));
        lua.lua_newtable(state);
        if (fts) {
            let i = 1;
            for (const ft of fts) {
                lua.lua_pushstring(state, to_luastring(ft));
                lua.lua_rawseti(state, -2, i++);
            }
        }
        return 1;
    });
    lua.lua_setfield(L, langIndex, to_luastring('get_filetypes'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const langRaw = lua.lua_tolstring(state, 1);
        if (!langRaw) {
            return lauxlib.luaL_error(
                state,
                to_luastring('vim.treesitter.language.add: expected lang name'),
            );
        }
        const langName = to_jsstring(langRaw);

        if (rt().isLanguageLoaded(langName)) {
            lua.lua_pushboolean(state, true);
            return 1;
        }

        if (!rt().isBundledGrammar(langName)) {
            lua.lua_pushboolean(state, false);
            lua.lua_pushstring(
                state,
                to_luastring(
                    `Grammar "${langName}" is not bundled. Available: ${rt().getBundledGrammarNames().join(', ')}`,
                ),
            );
            return 2;
        }

        if (runner) {
            const promise = rt()
                .loadLanguage(langName)
                .then(() => true);
            return runner.yieldWithPromise(state, promise);
        }

        lua.lua_pushboolean(state, false);
        lua.lua_pushstring(
            state,
            to_luastring('async language loading requires coroutine runner'),
        );
        return 2;
    });
    lua.lua_setfield(L, langIndex, to_luastring('add'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const langRaw = lua.lua_tolstring(state, 1);
        if (!langRaw) {
            return lauxlib.luaL_error(
                state,
                to_luastring(
                    'vim.treesitter.language.inspect: expected lang name',
                ),
            );
        }
        const langName = to_jsstring(langRaw);
        const language = rt().getLanguage(langName);
        if (!language) {
            return lauxlib.luaL_error(
                state,
                to_luastring(`Language "${langName}" not loaded`),
            );
        }

        lua.lua_newtable(state);

        lua.lua_pushinteger(state, language.abiVersion);
        lua.lua_setfield(state, -2, to_luastring('abi_version'));

        lua.lua_newtable(state);
        for (let i = 0; i < language.fields.length; i++) {
            const field = language.fields[i];
            if (field) {
                lua.lua_pushstring(state, to_luastring(field));
                lua.lua_rawseti(state, -2, i);
            }
        }
        lua.lua_setfield(state, -2, to_luastring('fields'));

        lua.lua_newtable(state);
        for (let i = 0; i < language.types.length; i++) {
            const typeName = language.types[i];
            if (typeName) {
                lua.lua_pushboolean(state, language.nodeTypeIsNamed(i));
                lua.lua_setfield(state, -2, to_luastring(typeName));
            }
        }
        lua.lua_setfield(state, -2, to_luastring('symbols'));

        lua.lua_pushinteger(state, language.nodeTypeCount);
        lua.lua_setfield(state, -2, to_luastring('state_count'));

        const supertypeIds = language.supertypes;
        lua.lua_newtable(state);
        for (const stId of supertypeIds) {
            const stName = language.nodeTypeForId(stId);
            if (!stName) continue;
            const subtypeIds = language.subtypes(stId);
            lua.lua_newtable(state);
            let si = 1;
            for (const subId of subtypeIds) {
                const subName = language.nodeTypeForId(subId);
                if (subName) {
                    lua.lua_pushstring(state, to_luastring(subName));
                    lua.lua_rawseti(state, -2, si++);
                }
            }
            lua.lua_setfield(state, -2, to_luastring(stName));
        }
        lua.lua_setfield(state, -2, to_luastring('supertypes'));

        lua.lua_pushboolean(state, true);
        lua.lua_setfield(state, -2, to_luastring('_wasm'));

        return 1;
    });
    lua.lua_setfield(L, langIndex, to_luastring('inspect'));

    lua.lua_setfield(L, tsTableIndex, to_luastring('language'));
}

export function resetLanguageRegistry(): void {
    filetypeToLang.clear();
    langToFiletypes.clear();
    filetypeToLang.set('markdown', 'markdown');
    filetypeToLang.set('html', 'html');
    langToFiletypes.set('markdown', new Set(['markdown']));
    langToFiletypes.set('html', new Set(['html']));
}
