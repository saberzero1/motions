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
        'test',
        'test-vault',
    ]),
    {
        languageOptions: {
            globals: {
                ...globals.browser,
            },
            parserOptions: {
                projectService: {
                    allowDefaultProject: [
                        'eslint.config.mts',
                        'manifest.json',
                        'vitest.config.ts',
                    ],
                },
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
                        'f/F/t/T',
                        'Live Preview',
                        'Markdown',
                        'o/O',
                        'Obsidian',
                        'Obsidian Tasks',
                        'Omnisearch',
                        'Powerline',
                        'Vim',
                        'Vim Motions',
                        'C:\\im-select\\im-select.exe',
                        'fcitx5-remote',
                        'im-select',
                        'macism',
                        'uFuzzy',
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
);
