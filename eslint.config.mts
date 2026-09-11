import obsidianmd from 'eslint-plugin-obsidianmd';
import vitest from '@vitest/eslint-plugin';
import wdio from 'eslint-plugin-wdio';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import { globalIgnores, defineConfig } from 'eslint/config';
import type { Linter } from 'eslint';

export default defineConfig(
    globalIgnores([
        'node_modules',
        'dist',
        '.obsidian-cache',
        '.sisyphus',
        'esbuild.config.mjs',
        'version-bump.mjs',
        'scripts/report-latency.mjs',
        'versions.json',
        'main.js',
        'package.json',
        'package-lock.json',
        'tsconfig.json',
        'wdio.conf.mts',
        'vitest.config.ts',
        'test-vault',
    ]),
    {
        languageOptions: {
            globals: {
                ...globals.browser,
                __DEV__: 'readonly',
            },
            parserOptions: {
                projectService: {
                    allowDefaultProject: [
                        'eslint.config.mts',
                        'manifest.json',
                        'vitest.config.ts',
                    ],
                },
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- import.meta.dirname typed as string | undefined by obsidian-typings globals
                tsconfigRootDir: import.meta.dirname,
                extraFileExtensions: ['.json'],
            },
        },
    },
    ...obsidianmd.configs.recommended,

    {
        linterOptions: {
            reportUnusedDisableDirectives: 'off',
        },
        rules: {
            // The preset sets `args: 'none'`, which is how a parameter that was
            // accepted and then ignored while the behaviour it should have
            // driven was hardcoded survived review (#177). `after-used` keeps
            // leading placeholder parameters legal for fixed-arity foreign
            // callbacks, while flagging a trailing parameter nothing consumes.
            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    args: 'after-used',
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    caughtErrors: 'all',
                    caughtErrorsIgnorePattern: '^_',
                    ignoreRestSiblings: true,
                },
            ],
            'import/no-nodejs-modules': [
                'error',
                {
                    allow: [
                        '@codemirror/autocomplete',
                        '@codemirror/collab',
                        '@codemirror/commands',
                        '@codemirror/language',
                        '@codemirror/lint',
                        '@codemirror/search',
                        '@codemirror/state',
                        '@codemirror/view',
                        '@lezer/common',
                        '@lezer/highlight',
                        '@lezer/lr',
                    ],
                },
            ],
            'import/no-extraneous-dependencies': [
                'error',
                {
                    peerDependencies: true,
                    optionalDependencies: false,
                    bundledDependencies: false,
                },
            ],
            'obsidianmd/ui/sentence-case': [
                'error',
                {
                    acronyms: ['API', 'ID', 'IM', 'JS', 'JSON'],
                    brands: [
                        'EasyMotion',
                        'Dataview',
                        'GNU/BSD',
                        'Linux',
                        'Live Preview',
                        'Markdown',
                        'Neovim',
                        'Obsidian',
                        'Obsidian Tasks',
                        'Omnisearch',
                        'Powerline',
                        'Vim',
                        'Vim Motions',
                        'C:\\im-select\\im-select.exe',
                        '~/.config/obsidian/',
                        'fcitx5-remote',
                        'f/F/t/T',
                        'im-select',
                        'macism',
                        'o/O',
                        'uFuzzy',
                        '--json',
                    ],
                },
            ],
        },
        settings: {
            'import/core-modules': [
                '@codemirror/autocomplete',
                '@codemirror/collab',
                '@codemirror/commands',
                '@codemirror/language',
                '@codemirror/lint',
                '@codemirror/search',
                '@codemirror/state',
                '@codemirror/view',
                '@lezer/common',
                '@lezer/highlight',
                '@lezer/lr',
            ],
        },
    },

    {
        // Vendored upstream code. Its unused parameters come from the Lua C API
        // signatures it mirrors and are not ours to rename.
        files: ['src/lib/fengari/**/*.ts'],
        rules: {
            '@typescript-eslint/no-unused-vars': 'off',
        },
    },

    {
        // `test` was in globalIgnores, so none of these files were linted at
        // all. They are also outside `tsconfig.json`'s `src/**/*.ts` include,
        // so type-aware rules cannot resolve them; `disableTypeChecked` is what
        // makes linting them possible without adding them to the TS project.
        // The src-only rules below are switched off deliberately: test files
        // are expected to import devDependencies and Node builtins, and the
        // Obsidian UI-copy rules describe plugin strings, not fixtures.
        files: ['test/**/*.ts', 'test/**/*.mts'],
        extends: [tseslint.configs.disableTypeChecked],
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.browser,
                ...globals.mocha,
                // `vitest.config.ts` sets `globals: true`, and the WDIO specs
                // take `expect`/`browser`/`$` from `@wdio/globals` the same way.
                ...vitest.environments.env.globals,
                browser: 'readonly',
                driver: 'readonly',
                $: 'readonly',
                $$: 'readonly',
            },
        },
        rules: {
            'import/no-nodejs-modules': 'off',
            'import/no-extraneous-dependencies': 'off',
            // This directory was unlinted, so it carries a general backlog
            // (unused locals, `any`, bare disable directives) that is real but
            // unrelated to test quality. Bundling ~200 unrelated fixes into the
            // change that introduces the assertion gates would bury the signal
            // those gates exist to produce. Separately owned; not suppressed
            // for `src`.
            '@typescript-eslint/no-unused-vars': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-require-imports': 'off',
            '@typescript-eslint/no-unused-expressions': 'off',
            '@typescript-eslint/no-unsafe-function-type': 'off',
            '@typescript-eslint/no-empty-object-type': 'off',
            'eslint-comments/no-restricted-disable': 'off',
            'eslint-comments/require-description': 'off',
            // `disableTypeChecked` only covers `@typescript-eslint/*`. Several
            // obsidianmd rules also require type information and would throw on
            // these files, and none of them describe test code anyway.
            ...Object.fromEntries(
                Object.keys(obsidianmd.rules ?? {}).map((rule) => [
                    `obsidianmd/${rule}`,
                    'off',
                ]),
            ),
        },
    },

    {
        files: ['test/unit/**/*.test.ts'],
        plugins: { vitest },
        rules: {
            // `expect-expect` is syntactic: it only checks that a recognised
            // assertion name is called. A wrapper listed here is trusted
            // wholesale, so this rule proves a test asserts *something*, never
            // that it asserts the right thing. That gap is what the
            // negative-control obligation in `.agents/skills/negative-control`
            // covers.
            'vitest/expect-expect': [
                'error',
                {
                    assertFunctionNames: [
                        'expect',
                        'assert',
                        'assert*',
                        'check*',
                        // Throws on a non-LUA_OK status, so a failure
                        // propagates as a thrown Lua error. Verified.
                        'luaExpectOk',
                    ],
                    additionalTestBlockFunctions: [
                        'testWithNeovim',
                        'testMappingWorks',
                    ],
                },
            ],
            // Vitest supports `expect(actual, message)`; the rule's default of
            // one argument rejects it.
            'vitest/valid-expect': ['error', { alwaysAwait: true, maxArgs: 2 }],
            'vitest/no-standalone-expect': 'error',
            'vitest/no-conditional-expect': 'error',
            'vitest/no-identical-title': 'error',
            'vitest/no-focused-tests': 'error',
            'vitest/no-commented-out-tests': 'error',
        },
    },

    {
        // These suites drive Lua through a local `run()` that both asserts
        // `luaL_dostring` returned LUA_OK and executes Lua containing its own
        // `assert(...)` calls, so a violation surfaces as a non-OK status.
        // Verified by reading both definitions and a call site.
        //
        // Scoped rather than global deliberately: `run` is a generic enough
        // name that trusting it suite-wide would let any future function so
        // named satisfy `expect-expect` without asserting. Note the residual
        // gap even here — `run('x = 1')`, with no `assert` in the Lua, would
        // still satisfy the rule. That is what the negative control is for.
        files: ['test/unit/lua/**/*.test.ts', 'test/unit/fengari/**/*.test.ts'],
        plugins: { vitest },
        rules: {
            'vitest/expect-expect': [
                'error',
                {
                    assertFunctionNames: [
                        'expect',
                        'assert',
                        'assert*',
                        'check*',
                        'luaExpectOk',
                        'run',
                        'runExpectingError',
                    ],
                },
            ],
        },
    },

    {
        // The e2e suite is Mocha, not Vitest, and eslint-plugin-mocha has no
        // `expect-expect` equivalent — Mocha delegates assertions to any
        // library that throws. What is worth gating here is the WDIO-specific
        // failure that silently passes: an async browser assertion that is
        // built but never awaited.
        files: ['test/specs/**/*.e2e.ts'],
        ...wdio.configs['flat/recommended'],
        rules: {
            ...(wdio.configs['flat/recommended'].rules as Linter.RulesRecord),
            // Ships 'off' in the plugin's own recommended set. An async browser
            // assertion that is constructed but never awaited resolves to a
            // pending Promise, which is truthy and never throws — the test
            // passes no matter what the browser did.
            'wdio/await-expect': 'error',
            // 2902 occurrences of an established `browser.pause()` idiom. A
            // fixed-sleep is a flakiness concern, not a vacuity one, and
            // rewriting them all belongs to whoever takes on wait strategy.
            'wdio/no-pause': 'off',
        },
    },
);
