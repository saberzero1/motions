import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { lua, lauxlib, to_jsstring, to_luastring } from 'fengari';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Parser, Language } from 'web-tree-sitter';
import {
    createSandboxedState,
    destroyState,
    evalLua,
} from '../../../src/lua/engine';
import { injectVimApi } from '../../../src/lua/api';
import { AutocmdManager } from '../../../src/lua/autocmd';

let markdownLang: Language;

vi.mock('../../../src/treesitter/runtime', () => {
    const languages = new Map<string, Language>();
    const parsers = new Map<string, Parser>();
    return {
        loadLanguage: async (name: string) => {
            if (!languages.has(name)) languages.set(name, markdownLang);
            return markdownLang;
        },
        getOrCreateParser: (name: string) => {
            let p = parsers.get(name);
            if (!p) {
                p = new Parser();
                p.setLanguage(languages.get(name) ?? markdownLang);
                parsers.set(name, p);
            }
            return p;
        },
        getLanguage: (name: string) => languages.get(name),
        isLanguageLoaded: (name: string) => languages.has(name),
        isBundledGrammar: (name: string) =>
            name === 'markdown' || name === 'html',
        getBundledGrammarNames: () => ['markdown', 'html'],
        destroyAll: () => {
            parsers.clear();
            languages.clear();
        },
        Parser,
        Language,
    };
});

const runtimeWasm = readFileSync(
    resolve(
        __dirname,
        '../../../node_modules/web-tree-sitter/web-tree-sitter.wasm',
    ),
);
const markdownWasm = readFileSync(
    resolve(
        __dirname,
        '../../../src/treesitter/grammars/tree-sitter-markdown.wasm',
    ),
);

type LuaState = ReturnType<typeof createSandboxedState>;

function doLua(L: LuaState, code: string): void {
    const status = lauxlib.luaL_dostring(L, to_luastring(code));
    if (status !== lua.LUA_OK) {
        const msg = lua.lua_tolstring(L, -1);
        lua.lua_pop(L, 1);
        throw new Error(`Lua: ${msg ? to_jsstring(msg) : 'unknown'}`);
    }
}

function luaEval(L: LuaState, expr: string): unknown {
    doLua(L, '__test_result = nil');
    doLua(L, `__test_result = ${expr}`);
    lua.lua_getglobal(L, to_luastring('__test_result'));
    let value: unknown;
    if (lua.lua_isnil(L, -1)) value = null;
    else if (lua.lua_isboolean(L, -1)) value = lua.lua_toboolean(L, -1);
    else if (lua.lua_isnumber(L, -1)) value = lua.lua_tonumber(L, -1);
    else if (lua.lua_isstring(L, -1)) {
        const raw = lua.lua_tolstring(L, -1);
        value = raw ? to_jsstring(raw) : '';
    } else value = '<table>';
    lua.lua_pop(L, 1);
    return value;
}

const TEST_DOC = '# Title\n\nBody paragraph.\n\n## Section Two\n\nMore text.\n';

describe('LanguageTree Lua API', () => {
    let L: LuaState;

    beforeAll(async () => {
        await Parser.init({
            wasmBinary: runtimeWasm.buffer,
            locateFile: () => '',
        } as Record<string, unknown>);
        markdownLang = await Language.load(markdownWasm);

        const runtime = await import('../../../src/treesitter/runtime');
        await runtime.loadLanguage('markdown');

        const { injectTreesitterApi, initTreesitterRuntime } =
            await import('../../../src/lua/treesitter/api');
        await initTreesitterRuntime();

        L = createSandboxedState();
        injectVimApi(L, {
            onSettingOverride: () => {},
            handleExCommand: () => {},
            getVaultName: () => 'vault',
            onKeymap: () => {},
            onKeymapDel: () => {},
            autocmdManager: new AutocmdManager(L),
        });
        injectTreesitterApi(L, undefined, () => TEST_DOC);
    });

    afterAll(() => {
        destroyState(L);
    });

    it('get_parser returns a LanguageTree with parse method', () => {
        doLua(L, '__lt = vim.treesitter.get_parser(0, "markdown")');
        expect(luaEval(L, 'type(__lt.parse)')).not.toBe('nil');
    });

    it('LanguageTree:parse() returns trees', () => {
        doLua(L, '__trees = __lt:parse()');
        const count = luaEval(L, '#__trees') as number;
        expect(count).toBeGreaterThan(0);
    });

    it('LanguageTree:lang() returns language name', () => {
        expect(luaEval(L, '__lt:lang()')).toBe('markdown');
    });

    it('LanguageTree:is_valid() returns boolean', () => {
        expect(typeof luaEval(L, '__lt:is_valid()')).toBe('boolean');
    });

    it('LanguageTree:root() returns root node', () => {
        doLua(L, '__lt_root = __lt:root()');
        expect(luaEval(L, '__lt_root:type()')).toBe('document');
    });

    it('LanguageTree:children() returns table', () => {
        expect(luaEval(L, 'type(__lt:children())')).toBe('table');
    });

    it('LanguageTree:parent() returns nil for root tree', () => {
        expect(luaEval(L, '__lt:parent()')).toBeNull();
    });

    it('LanguageTree:contains() checks range containment', () => {
        expect(luaEval(L, '__lt:contains({0, 0, 1, 0})')).toBe(true);
    });

    it('LanguageTree:tree_for_range() returns tree', () => {
        doLua(L, '__tfr = __lt:tree_for_range({0, 0, 0, 5})');
        expect(luaEval(L, 'type(__tfr)')).not.toBe('nil');
    });

    it('LanguageTree:node_for_range() returns node', () => {
        doLua(L, '__nfr = __lt:node_for_range({0, 0, 0, 5})');
        expect(luaEval(L, 'type(__nfr)')).not.toBe('nil');
    });

    it('LanguageTree:named_node_for_range() returns named node', () => {
        doLua(L, '__nnfr = __lt:named_node_for_range({0, 0, 0, 5})');
        expect(luaEval(L, 'type(__nnfr)')).not.toBe('nil');
    });

    it('LanguageTree:language_for_range() returns LanguageTree', () => {
        doLua(L, '__lfr = __lt:language_for_range({0, 0, 0, 5})');
        expect(luaEval(L, '__lfr:lang()')).toBe('markdown');
    });

    it('LanguageTree:for_each_tree() iterates all trees', () => {
        doLua(
            L,
            `
            __tree_count = 0
            __lt:for_each_tree(function(tree, ltree)
                __tree_count = __tree_count + 1
            end)
        `,
        );
        const count = luaEval(L, '__tree_count') as number;
        expect(count).toBeGreaterThanOrEqual(1);
    });

    it('LanguageTree:invalidate() marks tree as invalid', () => {
        doLua(L, '__lt:invalidate()');
        expect(luaEval(L, '__lt:is_valid()')).toBe(false);
        doLua(L, '__lt:parse()');
        expect(luaEval(L, '__lt:is_valid()')).toBe(true);
    });

    it('LanguageTree:included_regions() returns table', () => {
        expect(luaEval(L, 'type(__lt:included_regions())')).toBe('table');
    });

    it('LanguageTree:trees() returns table of trees', () => {
        doLua(L, '__ts = __lt:trees()');
        const count = luaEval(L, '#__ts') as number;
        expect(count).toBeGreaterThanOrEqual(1);
    });
});
