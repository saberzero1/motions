import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores, defineConfig } from 'eslint/config';

export default defineConfig(
    globalIgnores([
        'node_modules',
        'dist',
        '.obsidian-cache',
        'esbuild.config.mjs',
        'version-bump.mjs',
        'versions.json',
        'main.js',
        'package.json',
        'package-lock.json',
        'tsconfig.json',
        'wdio.conf.mts',
        'vitest.config.ts',
        'test',
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
);
