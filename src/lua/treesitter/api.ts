import { lua, lauxlib, to_luastring, to_jsstring } from 'fengari';
import type { lua_State } from 'fengari';
import type { Tree } from 'web-tree-sitter';
import { pushTSNode, extractNode } from './node';
import { pushTSTree } from './tree';
import { pushLanguageTree } from './language-tree-api';
import { injectLanguageApi, setLanguageRuntime } from './language';
import { injectQueryApi, setQueryRuntime } from './query-api';
import type { CoroutineRunner } from '../coroutine-runner';
type LanguageTreeModule = typeof import('../../treesitter/language-tree');
let _ltreeModule: LanguageTreeModule | null = null;

let _runtime: typeof import('../../treesitter/runtime') | null = null;

function runtime(): typeof import('../../treesitter/runtime') {
    if (!_runtime) {
        throw new Error(
            'Treesitter runtime not initialized. Call initTreesitterRuntime() first.',
        );
    }
    return _runtime;
}

export async function initTreesitterRuntime(): Promise<void> {
    if (_runtime) return;
    _runtime = await import('../../treesitter/runtime');
    _ltreeModule = await import('../../treesitter/language-tree');
    setLanguageRuntime(_runtime);
    setQueryRuntime(_runtime);
}

const parserCache = new Map<string, { tree: Tree; sourceText: string }>();
const ltreeCache = new Map<
    string,
    import('../../treesitter/language-tree').LanguageTree
>();

function readLuaString(L: lua_State, index: number): string | null {
    if (!lua.lua_isstring(L, index)) return null;
    const raw = lua.lua_tolstring(L, index);
    return raw ? to_jsstring(raw) : null;
}

function getParserLang(L: lua_State): string {
    const langArg = readLuaString(L, 2);
    if (langArg) return langArg;
    return 'markdown';
}

export function injectTreesitterApi(
    L: lua_State,
    runner: CoroutineRunner | undefined,
    getDocumentText: () => string | null,
): void {
    lua.lua_getglobal(L, to_luastring('vim'));
    const vimIndex = lua.lua_gettop(L);

    lua.lua_newtable(L);
    const tsIndex = lua.lua_gettop(L);

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const lang = getParserLang(state);

        if (!runtime().isLanguageLoaded(lang)) {
            return lauxlib.luaL_error(
                state,
                to_luastring(
                    `Language "${lang}" not loaded. Call vim.treesitter.language.add("${lang}") first.`,
                ),
            );
        }

        const docText = getDocumentText();
        if (!docText) {
            return lauxlib.luaL_error(
                state,
                to_luastring('No active document for treesitter parsing'),
            );
        }

        if (_ltreeModule) {
            let ltree = ltreeCache.get(lang);
            if (!ltree) {
                ltree = new _ltreeModule.LanguageTree(docText, lang);
                ltreeCache.set(lang, ltree);
            } else {
                ltree.setSource(docText);
                ltree.invalidate();
            }
            ltree.parse();
            pushLanguageTree(state, ltree);
            return 1;
        }

        const cached = parserCache.get(lang);
        if (cached && cached.sourceText === docText) {
            pushTSTree(state, cached.tree, cached.sourceText);
            return 1;
        }

        const parser = runtime().getOrCreateParser(lang);
        const oldTree = cached?.tree;
        const tree = parser.parse(docText, oldTree ?? undefined);
        if (!tree) {
            return lauxlib.luaL_error(
                state,
                to_luastring(`Failed to parse with language "${lang}"`),
            );
        }

        if (oldTree) oldTree.delete();
        parserCache.set(lang, { tree, sourceText: docText });

        pushTSTree(state, tree, docText);
        return 1;
    });
    lua.lua_setfield(L, tsIndex, to_luastring('get_parser'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const str = readLuaString(state, 1);
        if (str === null) {
            return lauxlib.luaL_error(
                state,
                to_luastring(
                    'vim.treesitter.get_string_parser: expected string',
                ),
            );
        }
        const lang = readLuaString(state, 2) ?? 'markdown';

        if (!runtime().isLanguageLoaded(lang)) {
            return lauxlib.luaL_error(
                state,
                to_luastring(
                    `Language "${lang}" not loaded. Call vim.treesitter.language.add("${lang}") first.`,
                ),
            );
        }

        const parser = runtime().getOrCreateParser(lang);
        const tree = parser.parse(str);
        if (!tree) {
            return lauxlib.luaL_error(
                state,
                to_luastring(`Failed to parse string with language "${lang}"`),
            );
        }

        pushTSTree(state, tree, str);
        return 1;
    });
    lua.lua_setfield(L, tsIndex, to_luastring('get_string_parser'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        let row = 0;
        let col = 0;
        let lang: string | null = null;

        if (lua.lua_istable(state, 1)) {
            lua.lua_getfield(state, 1, to_luastring('pos'));
            if (lua.lua_istable(state, -1)) {
                lua.lua_rawgeti(state, -1, 1);
                if (lua.lua_isnumber(state, -1))
                    row = lua.lua_tonumber(state, -1);
                lua.lua_pop(state, 1);
                lua.lua_rawgeti(state, -1, 2);
                if (lua.lua_isnumber(state, -1))
                    col = lua.lua_tonumber(state, -1);
                lua.lua_pop(state, 1);
            }
            lua.lua_pop(state, 1);

            lua.lua_getfield(state, 1, to_luastring('lang'));
            lang = readLuaString(state, -1);
            lua.lua_pop(state, 1);
        }

        const effectiveLang = lang ?? 'markdown';
        if (!runtime().isLanguageLoaded(effectiveLang)) {
            lua.lua_pushnil(state);
            return 1;
        }

        const docText = getDocumentText();
        if (!docText) {
            lua.lua_pushnil(state);
            return 1;
        }

        const cached = parserCache.get(effectiveLang);
        let tree: Tree;
        if (cached && cached.sourceText === docText) {
            tree = cached.tree;
        } else {
            const parser = runtime().getOrCreateParser(effectiveLang);
            const parsed = parser.parse(docText, cached?.tree ?? undefined);
            if (!parsed) {
                lua.lua_pushnil(state);
                return 1;
            }
            if (cached?.tree) cached.tree.delete();
            parserCache.set(effectiveLang, {
                tree: parsed,
                sourceText: docText,
            });
            tree = parsed;
        }

        const node = tree.rootNode.namedDescendantForPosition({
            row,
            column: col,
        });
        if (!node) {
            lua.lua_pushnil(state);
            return 1;
        }

        pushTSNode(state, node, docText);
        return 1;
    });
    lua.lua_setfield(L, tsIndex, to_luastring('get_node'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        if (!lua.lua_istable(state, 1)) {
            return lauxlib.luaL_error(
                state,
                to_luastring('vim.treesitter.get_node_text: expected node'),
            );
        }
        const node = extractNode(state, 1);
        lua.lua_pushstring(state, to_luastring(node.text));
        return 1;
    });
    lua.lua_setfield(L, tsIndex, to_luastring('get_node_text'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        if (!lua.lua_istable(state, 1)) {
            return lauxlib.luaL_error(
                state,
                to_luastring('vim.treesitter.get_range: expected node'),
            );
        }
        const node = extractNode(state, 1);
        const sp = node.startPosition;
        const ep = node.endPosition;
        lua.lua_pushinteger(state, sp.row);
        lua.lua_pushinteger(state, sp.column);
        lua.lua_pushinteger(state, node.startIndex);
        lua.lua_pushinteger(state, ep.row);
        lua.lua_pushinteger(state, ep.column);
        lua.lua_pushinteger(state, node.endIndex);
        return 6;
    });
    lua.lua_setfield(L, tsIndex, to_luastring('get_range'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        if (!lua.lua_istable(state, 1)) {
            lua.lua_pushboolean(state, false);
            return 1;
        }
        const node = extractNode(state, 1);
        if (!lua.lua_isnumber(state, 2) || !lua.lua_isnumber(state, 3)) {
            lua.lua_pushboolean(state, false);
            return 1;
        }
        const line = lua.lua_tonumber(state, 2);
        const col = lua.lua_tonumber(state, 3);
        const sp = node.startPosition;
        const ep = node.endPosition;
        const after_start =
            line > sp.row || (line === sp.row && col >= sp.column);
        const before_end =
            line < ep.row || (line === ep.row && col < ep.column);
        lua.lua_pushboolean(state, after_start && before_end);
        return 1;
    });
    lua.lua_setfield(L, tsIndex, to_luastring('is_in_node_range'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        if (!lua.lua_istable(state, 1) || !lua.lua_istable(state, 2)) {
            lua.lua_pushboolean(state, false);
            return 1;
        }
        const dest = extractNode(state, 1);
        const source = extractNode(state, 2);
        let current = source.parent;
        while (current) {
            if (current.equals(dest)) {
                lua.lua_pushboolean(state, true);
                return 1;
            }
            current = current.parent;
        }
        lua.lua_pushboolean(state, false);
        return 1;
    });
    lua.lua_setfield(L, tsIndex, to_luastring('is_ancestor'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        if (!lua.lua_istable(state, 1)) {
            lua.lua_pushboolean(state, false);
            return 1;
        }
        const node = extractNode(state, 1);
        if (!lua.lua_istable(state, 2)) {
            lua.lua_pushboolean(state, false);
            return 1;
        }
        const rangeLen = lauxlib.luaL_len(state, 2);
        if (rangeLen < 4) {
            lua.lua_pushboolean(state, false);
            return 1;
        }
        lua.lua_rawgeti(state, 2, 1);
        const r0 = lua.lua_tonumber(state, -1);
        lua.lua_pop(state, 1);
        lua.lua_rawgeti(state, 2, 2);
        const r1 = lua.lua_tonumber(state, -1);
        lua.lua_pop(state, 1);
        lua.lua_rawgeti(state, 2, 3);
        const r2 = lua.lua_tonumber(state, -1);
        lua.lua_pop(state, 1);
        lua.lua_rawgeti(state, 2, 4);
        const r3 = lua.lua_tonumber(state, -1);
        lua.lua_pop(state, 1);

        const sp = node.startPosition;
        const ep = node.endPosition;
        const nodeContains =
            (sp.row < r0 || (sp.row === r0 && sp.column <= r1)) &&
            (ep.row > r2 || (ep.row === r2 && ep.column >= r3));
        lua.lua_pushboolean(state, nodeContains);
        return 1;
    });
    lua.lua_setfield(L, tsIndex, to_luastring('node_contains'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        if (lua.lua_istable(state, 1)) {
            const node = extractNode(state, 1);
            const sp = node.startPosition;
            const ep = node.endPosition;
            lua.lua_pushinteger(state, sp.row);
            lua.lua_pushinteger(state, sp.column);
            lua.lua_pushinteger(state, ep.row);
            lua.lua_pushinteger(state, ep.column);
            return 4;
        }
        return 0;
    });
    lua.lua_setfield(L, tsIndex, to_luastring('get_node_range'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        lua.lua_newtable(state);
        return 1;
    });
    lua.lua_setfield(L, tsIndex, to_luastring('get_captures_at_pos'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        lua.lua_newtable(state);
        return 1;
    });
    lua.lua_setfield(L, tsIndex, to_luastring('get_captures_at_cursor'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        lua.lua_pushnil(state);
        return 1;
    });
    lua.lua_setfield(L, tsIndex, to_luastring('start'));

    lua.lua_pushjsfunction(L, (_state: lua_State) => {
        return 0;
    });
    lua.lua_setfield(L, tsIndex, to_luastring('stop'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        lua.lua_pushstring(state, to_luastring('0'));
        return 1;
    });
    lua.lua_setfield(L, tsIndex, to_luastring('foldexpr'));

    lua.lua_pushjsfunction(L, (_state: lua_State) => {
        return 0;
    });
    lua.lua_setfield(L, tsIndex, to_luastring('select'));

    lua.lua_pushjsfunction(L, (_state: lua_State) => {
        return 0;
    });
    lua.lua_setfield(L, tsIndex, to_luastring('inspect_tree'));

    injectLanguageApi(L, tsIndex, runner);
    injectQueryApi(L, tsIndex);

    lua.lua_setfield(L, vimIndex, to_luastring('treesitter'));
    lua.lua_pop(L, 1);
}

export function clearTreesitterCache(): void {
    for (const entry of parserCache.values()) {
        entry.tree.delete();
    }
    parserCache.clear();
}
