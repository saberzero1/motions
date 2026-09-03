import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
    lua,
    lauxlib,
    to_jsstring,
    to_luastring,
} from '../../../../src/lib/fengari';
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

type LuaState = ReturnType<typeof createSandboxedState>;

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

let markdownLang: Language;
let parserInstance: Parser;

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
            for (const p of parsers.values()) p.delete();
            parsers.clear();
            languages.clear();
        },
        parseString: (name: string, text: string) => {
            const p = parsers.get(name);
            if (!p) throw new Error(`Parser for ${name} not created`);
            return p.parse(text);
        },
        Parser,
        Language,
    };
});

const TEST_DOC =
    '# Heading\n\nParagraph text here.\n\n## Second\n\nMore text.\n';

function doLua(L: LuaState, code: string): void {
    const status = lauxlib.luaL_dostring(L, to_luastring(code));
    if (status !== lua.LUA_OK) {
        const msg = lua.lua_tolstring(L, -1);
        const err = msg ? to_jsstring(msg) : 'unknown error';
        lua.lua_pop(L, 1);
        throw new Error(`Lua error: ${err}`);
    }
}

function luaEval(L: LuaState, expr: string): unknown {
    doLua(L, `__test_result = nil`);
    doLua(L, `__test_result = ${expr}`);
    lua.lua_getglobal(L, to_luastring('__test_result'));
    let value: unknown;
    if (lua.lua_isnil(L, -1)) {
        value = null;
    } else if (lua.lua_isboolean(L, -1)) {
        value = lua.lua_toboolean(L, -1);
    } else if (lua.lua_isnumber(L, -1)) {
        value = lua.lua_tonumber(L, -1);
    } else if (lua.lua_isstring(L, -1)) {
        const raw = lua.lua_tolstring(L, -1);
        value = raw ? to_jsstring(raw) : '';
    } else {
        value = '<table>';
    }
    lua.lua_pop(L, 1);
    return value;
}

describe('vim.treesitter Lua API', () => {
    let L: LuaState;

    beforeAll(async () => {
        await Parser.init({
            wasmBinary: runtimeWasm.buffer,
            locateFile: () => '',
        } as Record<string, unknown>);

        markdownLang = await Language.load(markdownWasm);
        parserInstance = new Parser();
        parserInstance.setLanguage(markdownLang);

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

    describe('language', () => {
        it('get_lang returns registered language', () => {
            expect(
                luaEval(L, 'vim.treesitter.language.get_lang("markdown")'),
            ).toBe('markdown');
        });

        it('register maps new filetype', () => {
            doLua(L, 'vim.treesitter.language.register("markdown", "md")');
            expect(luaEval(L, 'vim.treesitter.language.get_lang("md")')).toBe(
                'markdown',
            );
        });

        it('get_filetypes returns array', () => {
            const result = luaEval(
                L,
                'type(vim.treesitter.language.get_filetypes("markdown"))',
            );
            expect(result).toBe('table');
        });

        it('inspect returns grammar info', () => {
            doLua(
                L,
                'local info = vim.treesitter.language.inspect("markdown")',
            );
            expect(
                luaEval(
                    L,
                    'vim.treesitter.language.inspect("markdown").abi_version',
                ),
            ).toBeGreaterThan(0);
            expect(
                luaEval(L, 'vim.treesitter.language.inspect("markdown")._wasm'),
            ).toBe(true);
        });
    });

    describe('get_string_parser', () => {
        it('returns a tree with root node', () => {
            doLua(
                L,
                `
                local tree = vim.treesitter.get_string_parser("# Hello\\n", "markdown")
                __root_type = tree:root():type()
            `,
            );
            expect(luaEval(L, '__root_type')).toBe('document');
        });

        it('root node has children', () => {
            doLua(
                L,
                `
                local tree = vim.treesitter.get_string_parser("# Hello\\n\\nWorld\\n", "markdown")
                __child_count = tree:root():child_count()
            `,
            );
            const count = luaEval(L, '__child_count') as number;
            expect(count).toBeGreaterThan(0);
        });
    });

    describe('TSNode methods', () => {
        beforeAll(() => {
            doLua(
                L,
                `
                __tree = vim.treesitter.get_string_parser("# Heading\\n\\nParagraph\\n", "markdown")
                __root = __tree:root()
                __first = __root:child(0)
            `,
            );
        });

        it('type() returns string', () => {
            expect(luaEval(L, '__root:type()')).toBe('document');
        });

        it('child_count() returns integer', () => {
            const count = luaEval(L, '__root:child_count()') as number;
            expect(count).toBeGreaterThan(0);
            expect(Number.isInteger(count)).toBe(true);
        });

        it('named_child_count() returns integer', () => {
            const count = luaEval(L, '__root:named_child_count()') as number;
            expect(count).toBeGreaterThanOrEqual(0);
        });

        it('start() returns 3 values (row, col, byte)', () => {
            doLua(L, '__sr, __sc, __sb = __root:start()');
            expect(luaEval(L, '__sr')).toBe(0);
            expect(luaEval(L, '__sc')).toBe(0);
            expect(luaEval(L, '__sb')).toBe(0);
        });

        it('end_() returns 3 values', () => {
            doLua(L, '__er, __ec, __eb = __root:end_()');
            const er = luaEval(L, '__er') as number;
            const eb = luaEval(L, '__eb') as number;
            expect(er).toBeGreaterThan(0);
            expect(eb).toBeGreaterThan(0);
        });

        it('range() returns 4 values', () => {
            doLua(L, '__r1, __r2, __r3, __r4 = __root:range()');
            expect(luaEval(L, '__r1')).toBe(0);
            expect(luaEval(L, '__r2')).toBe(0);
            expect(typeof luaEval(L, '__r3')).toBe('number');
            expect(typeof luaEval(L, '__r4')).toBe('number');
        });

        it('range(true) returns 6 values', () => {
            doLua(L, '__r1, __r2, __r3, __r4, __r5, __r6 = __root:range(true)');
            expect(luaEval(L, '__r3')).toBe(0);
            expect(typeof luaEval(L, '__r6')).toBe('number');
        });

        it('parent() returns nil for root', () => {
            expect(luaEval(L, '__root:parent()')).toBeNull();
        });

        it('parent() returns parent node for child', () => {
            doLua(L, '__parent_type = __first:parent():type()');
            expect(luaEval(L, '__parent_type')).toBe('document');
        });

        it('child(0) returns first child', () => {
            expect(luaEval(L, '__first:type()')).toBe('section');
        });

        it('named() returns boolean', () => {
            const named = luaEval(L, '__root:named()');
            expect(typeof named).toBe('boolean');
            expect(named).toBe(true);
        });

        it('has_error() returns boolean', () => {
            expect(typeof luaEval(L, '__root:has_error()')).toBe('boolean');
        });

        it('sexpr() returns S-expression string', () => {
            const sexpr = luaEval(L, '__root:sexpr()') as string;
            expect(sexpr).toContain('document');
        });

        it('byte_length() returns positive integer', () => {
            const len = luaEval(L, '__root:byte_length()') as number;
            expect(len).toBeGreaterThan(0);
        });

        it('equal() compares nodes correctly', () => {
            doLua(
                L,
                `
                local tree2 = vim.treesitter.get_string_parser("# Heading\\n\\nParagraph\\n", "markdown")
                local root2 = tree2:root()
                __eq_same = __root:equal(__root)
            `,
            );
            expect(luaEval(L, '__eq_same')).toBe(true);
        });

        it('id() returns a value', () => {
            const id = luaEval(L, '__root:id()');
            expect(id).toBeDefined();
            expect(id).not.toBeNull();
        });

        it('symbol() returns integer', () => {
            const sym = luaEval(L, '__root:symbol()') as number;
            expect(Number.isInteger(sym)).toBe(true);
        });

        it('named_children() returns array', () => {
            doLua(L, '__nc = __root:named_children()');
            const count = luaEval(L, '#__nc') as number;
            expect(count).toBeGreaterThan(0);
        });
    });

    describe('utility functions', () => {
        beforeAll(() => {
            doLua(
                L,
                `
                __utree = vim.treesitter.get_string_parser("# Title\\n\\nBody text\\n", "markdown")
                __uroot = __utree:root()
                __uchild = __uroot:child(0)
            `,
            );
        });

        it('get_node_text returns node text', () => {
            doLua(L, '__text = vim.treesitter.get_node_text(__uroot, 0)');
            const text = luaEval(L, '__text') as string;
            expect(text).toContain('Title');
        });

        it('get_range returns 6 values', () => {
            doLua(
                L,
                '__gr1, __gr2, __gr3, __gr4, __gr5, __gr6 = vim.treesitter.get_range(__uroot)',
            );
            expect(luaEval(L, '__gr1')).toBe(0);
            expect(typeof luaEval(L, '__gr6')).toBe('number');
        });

        it('is_in_node_range returns true for position inside node', () => {
            expect(
                luaEval(L, 'vim.treesitter.is_in_node_range(__uroot, 0, 0)'),
            ).toBe(true);
        });

        it('is_in_node_range returns false for position outside node', () => {
            expect(
                luaEval(L, 'vim.treesitter.is_in_node_range(__uroot, 999, 0)'),
            ).toBe(false);
        });

        it('is_ancestor returns true for parent-child relationship', () => {
            expect(
                luaEval(L, 'vim.treesitter.is_ancestor(__uroot, __uchild)'),
            ).toBe(true);
        });

        it('is_ancestor returns false for non-ancestor', () => {
            expect(
                luaEval(L, 'vim.treesitter.is_ancestor(__uchild, __uroot)'),
            ).toBe(false);
        });

        it('node_contains returns boolean', () => {
            const result = luaEval(
                L,
                'vim.treesitter.node_contains(__uroot, {0, 0, 1, 0})',
            );
            expect(typeof result).toBe('boolean');
        });

        it('get_node_range returns 4 values', () => {
            doLua(
                L,
                '__gnr1, __gnr2, __gnr3, __gnr4 = vim.treesitter.get_node_range(__uroot)',
            );
            expect(luaEval(L, '__gnr1')).toBe(0);
            expect(typeof luaEval(L, '__gnr4')).toBe('number');
        });
    });

    describe('get_parser with document text', () => {
        it('parses the active document', () => {
            doLua(
                L,
                `
                local tree = vim.treesitter.get_parser(0, "markdown")
                __doc_root_type = tree:root():type()
            `,
            );
            expect(luaEval(L, '__doc_root_type')).toBe('document');
        });
    });

    describe('error handling', () => {
        it('get_parser errors on unloaded language', () => {
            const result = evalLua(L, 'vim.treesitter.get_parser(0, "rust")');
            expect(result.ok).toBe(false);
            expect(result.error).toContain('not loaded');
        });

        it('get_string_parser errors on nil input', () => {
            const result = evalLua(
                L,
                'vim.treesitter.get_string_parser(nil, "markdown")',
            );
            expect(result.ok).toBe(false);
        });

        it('language.inspect errors on unloaded language', () => {
            const result = evalLua(
                L,
                'vim.treesitter.language.inspect("rust")',
            );
            expect(result.ok).toBe(false);
            expect(result.error).toContain('not loaded');
        });
    });
});
