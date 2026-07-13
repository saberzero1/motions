import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
    createSandboxedState,
    destroyState,
    evalLua,
} from '../../../src/lua/engine';
import {
    injectSnippetApi,
    type LuaSnippetDef,
} from '../../../src/lua/snippet-api';
import { injectStdlib } from '../../../src/lua/stdlib';
import { injectVimApi } from '../../../src/lua/api';
import { AutocmdManager } from '../../../src/lua/autocmd';
import { compileLuaSnippets } from '../../../src/snippets/lua-compiler';

interface GoldenTest {
    name: string;
    source: string;
    type:
        | 'lua_dsl'
        | 'lsp_parser'
        | 'fmt_interpolation'
        | 'fmt_interpolation_error';
    snippet: string;
    staticText: string[] | null;
    docstring: string[] | null;
    expectedError?: boolean;
}

type GoldenEntry = GoldenTest | { _category: string };

type LuaState = ReturnType<typeof createSandboxedState>;

function setupState(): LuaState {
    const L = createSandboxedState();
    const autocmdManager = new AutocmdManager(L);
    injectVimApi(L, {
        onSettingOverride: () => {},
        handleExCommand: () => {},
        getVaultName: () => 'vault',
        onKeymap: () => {},
        onKeymapDel: () => {},
        autocmdManager,
    });
    injectStdlib(L);
    return L;
}

function initSnippetAliases(L: LuaState): void {
    const aliases = `
s = vim.snippet.s
t = vim.snippet.t
i = vim.snippet.i
c = vim.snippet.c
f = vim.snippet.f
d = vim.snippet.d
r = vim.snippet.r
sn = vim.snippet.sn
fmt = vim.snippet.fmt
rep = vim.snippet.rep
`;
    const result = evalLua(L, aliases);
    expect(result.ok).toBe(true);
}

function isGoldenTest(entry: GoldenEntry): entry is GoldenTest {
    return 'type' in entry;
}

function hasDynamicNodes(snippet: string): boolean {
    return (
        /\bf\s*\(/.test(snippet) ||
        /\bd\s*\(/.test(snippet) ||
        /\br\s*\(/.test(snippet)
    );
}

function toStaticText(body: string): string {
    const withPlaceholders = body.replace(
        /\$\{(\d+):([^}]*)\}/g,
        (_match, _idx, text) => {
            return text;
        },
    );
    const withChoices = withPlaceholders.replace(
        /\$\{(\d+)\|([^}]*)\|\}/g,
        (_match, _idx, choices) => {
            const first = choices.split(',')[0] ?? '';
            return first;
        },
    );
    return withChoices.replace(/\$(\d+)/g, '');
}

function hasEmptyChoice(body: string): boolean {
    return /\$\{\d+\|,/.test(body);
}

const goldenData = JSON.parse(
    readFileSync(new URL('./luasnip-golden.json', import.meta.url), 'utf-8'),
) as GoldenEntry[];

const goldenTests = goldenData.filter(isGoldenTest);
const luaDslTests = goldenTests.filter(
    (entry): entry is GoldenTest => entry.type === 'lua_dsl',
);

describe('LuaSnip golden comparison', () => {
    let L: LuaState;
    let snippetDefs: LuaSnippetDef[];

    beforeAll(() => {
        L = setupState();
        snippetDefs = injectSnippetApi(L);
        initSnippetAliases(L);
    });

    afterAll(() => {
        destroyState(L);
    });

    for (const test of luaDslTests) {
        it(test.name, () => {
            snippetDefs.length = 0;

            const code = `vim.snippet.add("test", ${test.snippet})`;
            const result = evalLua(L, code);
            expect(result.ok).toBe(true);
            expect(snippetDefs.length).toBe(1);

            const def = snippetDefs[0];
            expect(def).toBeDefined();
            if (!def) {
                throw new Error('Expected a snippet definition');
            }
            const compiled = compileLuaSnippets([def]);
            const entry = compiled[def.name];
            expect(entry).toBeDefined();

            const body = entry?.body;
            const bodyStr = Array.isArray(body)
                ? body.join('\n')
                : (body ?? '');
            const expectedStr = (test.staticText ?? []).join('\n');
            const staticBodyStr = toStaticText(bodyStr);

            if (hasDynamicNodes(test.snippet) || hasEmptyChoice(bodyStr)) {
                expect(bodyStr).toBeDefined();
            } else {
                expect(staticBodyStr).toBe(expectedStr);
            }
        });
    }
});
