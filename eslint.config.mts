import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores, defineConfig } from 'eslint/config';

export default defineConfig(
    globalIgnores([
        'node_modules',
        'dist',
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
                    allowDefaultProject: ['eslint.config.mts', 'manifest.json'],
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
            'obsidianmd/prefer-active-doc': 'off',
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
                    brands: [
                        'EasyMotion',
                        'Markdown',
                        'o/O',
                        'Obsidian',
                        'Powerline',
                        'Vim',
                        'Vim Motions',
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
