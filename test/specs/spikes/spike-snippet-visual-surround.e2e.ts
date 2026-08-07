/**
 * Spike: Snippet expansion with $TM_SELECTED_TEXT / $VISUAL in visual mode
 *
 * Verifies that snippets can wrap selected text with tabstops, covering both
 * JSON-registered snippets and Lua DSL snippets. Tests use actual vim visual
 * mode keystrokes so exitVisualMode() fires before the :snippet handler —
 * the real user flow (see Discussion #108).
 */
import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    getEditorValue,
    getVimMode,
    PAUSE,
    sendVimEscape,
    setupEditor,
    vimKeys,
} from '../../helpers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function handleEx(
    command: string,
): Promise<{ success?: true; error?: string }> {
    return (await browser.executeObsidian(({ app, obsidian }, cmd: string) => {
        try {
            const Vim = (
                window as unknown as Record<string, unknown> & {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            handleEx: (cm: unknown, input: string) => void;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return { error: 'No Vim' };
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'No view' };
            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            const adapter = cm?.cm;
            if (!adapter) return { error: 'No adapter' };
            Vim.handleEx(adapter, cmd);
            return { success: true };
        } catch (e) {
            return { error: String(e) };
        }
    }, command)) as { success?: true; error?: string };
}

async function waitForSnippets(): Promise<void> {
    await browser.waitUntil(
        async () =>
            (await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins: {
                            plugins: Record<
                                string,
                                {
                                    snippetRegistry?: {
                                        getAll: () => unknown[];
                                    };
                                }
                            >;
                        };
                    }
                ).plugins.plugins['vim-motions'];
                const all = plugin?.snippetRegistry?.getAll();
                return Array.isArray(all) && all.length > 0;
            })) as boolean,
        { timeout: 10000, interval: 200 },
    );
}

async function registerSurroundSnippets(): Promise<void> {
    await browser.executeObsidian(({ app }) => {
        const plugin = (
            app as unknown as {
                plugins: {
                    plugins: Record<
                        string,
                        {
                            snippetRegistry?: {
                                loadFile: (
                                    file: Record<
                                        string,
                                        {
                                            prefix: string;
                                            body: string | string[];
                                            description?: string;
                                        }
                                    >,
                                    source: string,
                                ) => void;
                            };
                        }
                    >;
                };
            }
        ).plugins.plugins['vim-motions'];
        if (!plugin?.snippetRegistry) return;
        plugin.snippetRegistry.loadFile(
            {
                'Wrap in link': {
                    prefix: '_wraplink',
                    body: '[${1:$TM_SELECTED_TEXT}](${2:url})$0',
                    description: 'Surround with markdown link, tabstop on URL',
                },
                'Wrap in callout': {
                    prefix: '_wrapcallout',
                    body: [
                        '> [!${1:info}] ${2:Title}',
                        '> $TM_SELECTED_TEXT',
                        '$0',
                    ],
                    description:
                        'Wrap selection in a callout with configurable type',
                },
                'Wrap bold VISUAL': {
                    prefix: '_wrapboldvis',
                    body: '**${1:$VISUAL}**$0',
                    description: 'Wrap selection in bold using $VISUAL alias',
                },
                'Wrap simple': {
                    prefix: '_wrapsimple',
                    body: '<<$TM_SELECTED_TEXT>>',
                    description: 'Wrap selection without tabstops',
                },
            },
            'user',
        );
    });
}

async function expandSnippetViaEx(name: string): Promise<void> {
    const result = await handleEx(`snippet ${name}`);
    expect(result).toHaveProperty('success', true);
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

async function visualSelectAndExpand(
    content: string,
    selectKeys: string,
    snippetName: string,
): Promise<void> {
    await setupEditor(content, { line: 0, ch: 0 });
    await sendVimEscape();
    await browser.pause(PAUSE.MODE_SWITCH);
    for (const key of selectKeys) {
        await browser.keys([key]);
        await browser.pause(PAUSE.KEY_GAP);
    }
    await browser.pause(PAUSE.MODE_SWITCH);
    await expandSnippetViaEx(snippetName);
}

// ---------------------------------------------------------------------------
// Lua config loader (from snippet-dynamic-node.e2e.ts pattern)
// ---------------------------------------------------------------------------

async function loadLuaConfig(content: string): Promise<void> {
    await browser.reloadObsidian({ vault: 'test-vault' });
    await obsidianPage.openFile('Welcome.md');
    await browser.waitUntil(
        async () =>
            (await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins: {
                            plugins: Record<string, { vimrcLoaded?: boolean }>;
                        };
                    }
                ).plugins.plugins['vim-motions'];
                return plugin?.vimrcLoaded === true;
            })) as boolean,
        { timeout: 10000, interval: 200 },
    );
    await browser.executeObsidian(async ({ app }, luaContent: string) => {
        const configPath = `${app.vault.configDir}.init.lua`;
        await app.vault.adapter.write(configPath, luaContent);
    }, content);
    await browser.executeObsidian(async ({ app }) => {
        const plugin = (
            app as unknown as {
                plugins: {
                    plugins: Record<
                        string,
                        { loadLuaConfigForTest?: () => Promise<void> }
                    >;
                };
            }
        ).plugins.plugins['vim-motions'];
        await plugin?.loadLuaConfigForTest?.();
    });
    await browser.waitUntil(
        async () =>
            (await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins: {
                            plugins: Record<string, { luaLoaded?: boolean }>;
                        };
                    }
                ).plugins.plugins['vim-motions'];
                return plugin?.luaLoaded === true;
            })) as boolean,
        { timeout: 10000, interval: 200 },
    );
}

async function waitForSnippet(trigger: string): Promise<void> {
    await browser.waitUntil(
        async () =>
            (await browser.executeObsidian(({ app }, t: string) => {
                const plugin = (
                    app as unknown as {
                        plugins: {
                            plugins: Record<
                                string,
                                {
                                    snippetRegistry?: {
                                        lookupByPrefix: (
                                            p: string,
                                        ) => unknown[];
                                    };
                                }
                            >;
                        };
                    }
                ).plugins.plugins['vim-motions'];
                const matches = plugin?.snippetRegistry?.lookupByPrefix(t);
                return Array.isArray(matches) && matches.length > 0;
            }, trigger)) as boolean,
        { timeout: 10000, interval: 200 },
    );
}

// ===========================================================================
// Tests: JSON-registered snippets with $TM_SELECTED_TEXT / $VISUAL
// ===========================================================================

describe('Spike: Snippet-based surround with $TM_SELECTED_TEXT / $VISUAL', function () {
    describe('JSON-registered snippets', function () {
        before(async function () {
            await browser.reloadObsidian({ vault: 'test-vault' });
            await obsidianPage.openFile('Welcome.md');
            await waitForSnippets();
            await registerSurroundSnippets();
        });

        afterEach(async function () {
            await sendVimEscape();
            await browser.pause(PAUSE.KEY_GAP);
        });

        it('$TM_SELECTED_TEXT wraps word selection in simple delimiters via viw', async function () {
            await visualSelectAndExpand('hello world', 'viw', 'Wrap simple');
            const value = await getEditorValue();
            expect(value).toContain('<<hello>>');
        });

        it('$TM_SELECTED_TEXT fills tabstop default in link snippet', async function () {
            await visualSelectAndExpand(
                'click here for details',
                'viw',
                'Wrap in link',
            );
            const value = await getEditorValue();
            expect(value).toContain('[click]');
            expect(value).toContain('](url)');
        });

        it('$VISUAL alias works the same as $TM_SELECTED_TEXT', async function () {
            await visualSelectAndExpand(
                'important text here',
                'viw',
                'Wrap bold VISUAL',
            );
            const value = await getEditorValue();
            expect(value).toContain('**important**');
        });

        it('multiline callout snippet wraps selection', async function () {
            await visualSelectAndExpand(
                'A note about something.',
                'v$',
                'Wrap in callout',
            );
            const value = await getEditorValue();
            expect(value).toContain('> [!info]');
            expect(value).toContain('> A note about something.');
        });

        it('empty selection produces empty $TM_SELECTED_TEXT', async function () {
            await setupEditor('no selection', { line: 0, ch: 3 });
            await sendVimEscape();
            await browser.pause(PAUSE.EDITOR_SETTLE);
            await expandSnippetViaEx('Wrap simple');
            const value = await getEditorValue();
            expect(value).toContain('<<>>');
        });

        it('link snippet produces correct structure after visual expand', async function () {
            await visualSelectAndExpand('word', 'viw', 'Wrap in link');
            const value = await getEditorValue();
            expect(value).toContain('[word](url)');
        });
    });

    // =======================================================================
    // Tests: Lua DSL snippets with $VISUAL
    // =======================================================================

    describe('Lua DSL snippets', function () {
        before(async function () {
            await loadLuaConfig(`
local s = vim.snippet.s
local t = vim.snippet.t
local i = vim.snippet.i
local fmt = vim.snippet.fmt

vim.snippet.add("_luawraplink", s("Lua Wrap Link", fmt(
    "[{}]({}){}", { i(1, "$VISUAL"), i(2, "url"), i(0) }
)))

vim.snippet.add("_luawrapbold", s("Lua Wrap Bold", {
    t("**"),
    i(1, "$VISUAL"),
    t("**"),
    i(0),
}))
`);
            await waitForSnippet('_luawraplink');
            await waitForSnippet('_luawrapbold');
        });

        afterEach(async function () {
            await sendVimEscape();
            await browser.pause(PAUSE.KEY_GAP);
        });

        it('Lua snippet with fmt wraps selection in link', async function () {
            await visualSelectAndExpand('documentation', 'viw', '_luawraplink');
            const value = await getEditorValue();
            expect(value).toContain('[documentation]');
            expect(value).toContain('](url)');
        });

        it('Lua snippet with t()/i() nodes wraps selection in bold', async function () {
            await visualSelectAndExpand('emphasis', 'viw', '_luawrapbold');
            const value = await getEditorValue();
            expect(value).toContain('**emphasis**');
        });

        it('Lua link snippet produces correct structure after visual expand', async function () {
            await visualSelectAndExpand('anchor', 'viw', '_luawraplink');
            const value = await getEditorValue();
            expect(value).toContain('[anchor](url)');
        });

        it('Lua snippet with empty selection uses placeholder', async function () {
            await setupEditor('', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.EDITOR_SETTLE);
            await expandSnippetViaEx('_luawrapbold');
            const value = await getEditorValue();
            expect(value).toContain('****');
        });
    });
});
