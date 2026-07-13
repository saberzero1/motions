import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { getEditorValue, PAUSE, setupEditor, vimKeys } from '../../helpers';

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

async function typePrefixAndTab(prefix: string): Promise<void> {
    await vimKeys('i');
    await browser.keys(Array.from(prefix));
    await browser.pause(PAUSE.KEY_GAP);
    await browser.keys(['Tab']);
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

async function waitForSnippet(trigger: string): Promise<void> {
    await browser.waitUntil(
        async () =>
            (await browser.executeObsidian(
                ({ app }, t: string) => {
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
                    const matches =
                        plugin?.snippetRegistry?.lookupByPrefix(t);
                    return Array.isArray(matches) && matches.length > 0;
                },
                trigger,
            )) as boolean,
        { timeout: 10000, interval: 200 },
    );
}

describe('Snippet f() function nodes', function () {
    before(async function () {
        await loadLuaConfig(`
local s = vim.snippet.s
local t = vim.snippet.t
local i = vim.snippet.i
local f = vim.snippet.f
vim.snippet.add("ftest", s("FunctionTest", {
    i(1, "hello"),
    t(" -> "),
    f(function(args) return string.upper(args[1]) end, { 1 }),
}))
`);
        await browser.pause(8000);
    });

    it('should expand f() snippet via Tab', async function () {
        await setupEditor('', { line: 0, ch: 0 });
        await typePrefixAndTab('ftest');
        await browser.pause(500);
        const value = await getEditorValue();
        expect(value).toContain('hello');
        expect(value).toContain('->');
    });

    it('should update f() node when dependency field changes', async function () {
        await setupEditor('', { line: 0, ch: 0 });
        await typePrefixAndTab('ftest');
        await browser.pause(200);
        await browser.keys(Array.from('world'));
        await browser.pause(500);
        const value = await getEditorValue();
        expect(value).toContain('world');
        expect(value).toContain('->');
    });

    it('should survive Lua errors in f() function', async function () {
        await loadLuaConfig(`
local s = vim.snippet.s
local t = vim.snippet.t
local i = vim.snippet.i
local f = vim.snippet.f
vim.snippet.add("ferr", s("ErrorTest", {
    i(1, "test"),
    t(" -> "),
    f(function(args) error("boom") end, { 1 }),
}))
`);
        await setupEditor('', { line: 0, ch: 0 });
        await typePrefixAndTab('ferr');
        await browser.keys(Array.from('abc'));
        await browser.pause(200);
        const value = await getEditorValue();
        expect(value).toContain('abc');
    });
});
