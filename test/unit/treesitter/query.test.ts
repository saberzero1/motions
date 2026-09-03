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
import { QueryWrapper } from '../../../src/treesitter/query';
import { evaluatePredicate } from '../../../src/treesitter/predicates';
import type { PredicateStep } from '../../../src/treesitter/query';

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
const markdownWasmBytes = readFileSync(
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

describe('treesitter query engine', () => {
    let parser: Parser;

    beforeAll(async () => {
        await Parser.init({
            wasmBinary: runtimeWasm.buffer,
            locateFile: () => '',
        } as Record<string, unknown>);
        markdownLang = await Language.load(markdownWasmBytes);
        parser = new Parser();
        parser.setLanguage(markdownLang);
    });

    afterAll(() => {
        parser?.delete();
    });

    describe('QueryWrapper', () => {
        it('compiles a valid query', () => {
            const q = new QueryWrapper(markdownLang, '(atx_heading) @heading');
            expect(q.captureNames).toContain('heading');
            q.delete();
        });

        it('throws on invalid query syntax', () => {
            expect(
                () => new QueryWrapper(markdownLang, '(nonexistent_node) @x'),
            ).toThrow();
        });

        it('iterCaptures returns captures for matching nodes', () => {
            const tree = parser.parse('# Hello\n\n## World\n');
            const q = new QueryWrapper(markdownLang, '(atx_heading) @heading');
            const captures = q.iterCaptures(
                tree!.rootNode,
                '# Hello\n\n## World\n',
            );
            expect(captures.length).toBeGreaterThanOrEqual(2);
            expect(captures[0]!.captureName).toBe('heading');
            q.delete();
            tree!.delete();
        });

        it('iterMatches returns matches', () => {
            const tree = parser.parse('# Hello\n\nText\n');
            const q = new QueryWrapper(markdownLang, '(atx_heading) @heading');
            const matches = q.iterMatches(tree!.rootNode, '# Hello\n\nText\n');
            expect(matches.length).toBeGreaterThanOrEqual(1);
            expect(matches[0]!.patternIndex).toBe(0);
            q.delete();
            tree!.delete();
        });

        it('iterCaptures with row range filters results', () => {
            const source = '# One\n\n## Two\n\nText\n';
            const tree = parser.parse(source);
            const q = new QueryWrapper(markdownLang, '(atx_heading) @heading');
            const all = q.iterCaptures(tree!.rootNode, source);
            const filtered = q.iterCaptures(tree!.rootNode, source, {
                startRow: 0,
                endRow: 1,
            });
            expect(filtered.length).toBeLessThanOrEqual(all.length);
            q.delete();
            tree!.delete();
        });
    });

    describe('predicates', () => {
        it('eq? matches text equality', () => {
            const captures = new Map<
                string,
                import('web-tree-sitter').Node[]
            >();
            const tree = parser.parse('hello');
            const root = tree!.rootNode;
            captures.set('x', [root]);

            const operands: PredicateStep[] = [
                { type: 'capture', name: 'x', value: '' },
                { type: 'string', name: '', value: 'hello' },
            ];
            const result = evaluatePredicate(
                'eq?',
                operands,
                captures,
                'hello',
            );
            expect(result).toBe(true);
            tree!.delete();
        });

        it('not-eq? inverts the result', () => {
            const captures = new Map<
                string,
                import('web-tree-sitter').Node[]
            >();
            const tree = parser.parse('hello');
            captures.set('x', [tree!.rootNode]);

            const operands: PredicateStep[] = [
                { type: 'capture', name: 'x', value: '' },
                { type: 'string', name: '', value: 'hello' },
            ];
            const result = evaluatePredicate(
                'not-eq?',
                operands,
                captures,
                'hello',
            );
            expect(result).toBe(false);
            tree!.delete();
        });

        it('match? tests regex', () => {
            const tree = parser.parse('foo123');
            const captures = new Map([['x', [tree!.rootNode]]]);
            const operands: PredicateStep[] = [
                { type: 'capture', name: 'x', value: '' },
                { type: 'string', name: '', value: '^foo\\d+' },
            ];
            expect(
                evaluatePredicate('match?', operands, captures, 'foo123'),
            ).toBe(true);
            tree!.delete();
        });

        it('any-of? matches against list', () => {
            const tree = parser.parse('if');
            const captures = new Map([['x', [tree!.rootNode]]]);
            const operands: PredicateStep[] = [
                { type: 'capture', name: 'x', value: '' },
                { type: 'string', name: '', value: 'if' },
                { type: 'string', name: '', value: 'else' },
                { type: 'string', name: '', value: 'while' },
            ];
            expect(evaluatePredicate('any-of?', operands, captures, 'if')).toBe(
                true,
            );
            tree!.delete();
        });

        it('contains? checks substring', () => {
            const tree = parser.parse('hello world');
            const captures = new Map([['x', [tree!.rootNode]]]);
            const operands: PredicateStep[] = [
                { type: 'capture', name: 'x', value: '' },
                { type: 'string', name: '', value: 'world' },
            ];
            expect(
                evaluatePredicate(
                    'contains?',
                    operands,
                    captures,
                    'hello world',
                ),
            ).toBe(true);
            tree!.delete();
        });

        it('unknown predicate returns true (permissive)', () => {
            const captures = new Map<
                string,
                import('web-tree-sitter').Node[]
            >();
            const operands: PredicateStep[] = [];
            expect(evaluatePredicate('unknown?', operands, captures, '')).toBe(
                true,
            );
        });
    });

    describe('Lua query API', () => {
        let L: LuaState;

        beforeAll(async () => {
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
            injectTreesitterApi(L, undefined, () => '# Title\n\nBody\n');
        });

        afterAll(() => {
            destroyState(L);
        });

        it('query.parse compiles a query', () => {
            doLua(
                L,
                '__q = vim.treesitter.query.parse("markdown", "(atx_heading) @heading")',
            );
            expect(luaEval(L, 'type(__q)')).toBe('table');
        });

        it('query.captures contains capture names', () => {
            doLua(L, '__caps = __q.captures');
            const count = luaEval(L, '#__caps') as number;
            expect(count).toBeGreaterThan(0);
        });

        it('iter_captures yields captures', () => {
            doLua(
                L,
                `
                local tree = vim.treesitter.get_string_parser("# Hello\\n\\n## World\\n", "markdown")
                local root = tree:root()
                local q = vim.treesitter.query.parse("markdown", "(atx_heading) @heading")
                __capture_count = 0
                for id, node, metadata in q:iter_captures(root, 0) do
                    __capture_count = __capture_count + 1
                    __last_cap_id = id
                    __last_cap_type = node:type()
                end
            `,
            );
            const count = luaEval(L, '__capture_count') as number;
            expect(count).toBeGreaterThanOrEqual(2);
            expect(luaEval(L, '__last_cap_type')).toBe('atx_heading');
        });

        it('iter_matches yields matches', () => {
            doLua(
                L,
                `
                local tree = vim.treesitter.get_string_parser("# One\\n\\nPara\\n", "markdown")
                local root = tree:root()
                local q = vim.treesitter.query.parse("markdown", "(atx_heading) @heading")
                __match_count = 0
                for pattern, match, metadata in q:iter_matches(root, 0) do
                    __match_count = __match_count + 1
                    __last_pattern = pattern
                end
            `,
            );
            const count = luaEval(L, '__match_count') as number;
            expect(count).toBeGreaterThanOrEqual(1);
            expect(typeof luaEval(L, '__last_pattern')).toBe('number');
        });

        it('query.parse errors on invalid syntax', () => {
            const result = evalLua(
                L,
                'vim.treesitter.query.parse("markdown", "(bad_node) @x")',
            );
            expect(result.ok).toBe(false);
        });

        it('list_predicates returns array', () => {
            const result = luaEval(
                L,
                'type(vim.treesitter.query.list_predicates())',
            );
            expect(result).toBe('table');
        });

        it('list_directives returns array', () => {
            const result = luaEval(
                L,
                'type(vim.treesitter.query.list_directives())',
            );
            expect(result).toBe('table');
        });

        it('paragraph query captures paragraph nodes', () => {
            doLua(
                L,
                `
                local tree = vim.treesitter.get_string_parser("# Hi\\n\\nSome text.\\n", "markdown")
                local root = tree:root()
                local q = vim.treesitter.query.parse("markdown", "(paragraph) @para")
                __para_count = 0
                for id, node, metadata in q:iter_captures(root, 0) do
                    __para_count = __para_count + 1
                end
            `,
            );
            const count = luaEval(L, '__para_count') as number;
            expect(count).toBeGreaterThanOrEqual(1);
        });
    });
});
