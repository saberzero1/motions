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

describe('Snippet d() dynamic nodes', function () {
    before(async function () {
        await loadLuaConfig(`
local s = vim.snippet.s
local t = vim.snippet.t
local i = vim.snippet.i
local d = vim.snippet.d
local sn = vim.snippet.sn
vim.snippet.add("dtest", s("DynamicTest", {
    i(1, "2"),
    d(2, function(args)
        local n = tonumber(args[1]) or 1
        local nodes = {}
        for j = 1, n do
            table.insert(nodes, t("\n- "))
            table.insert(nodes, i(j, "item " .. j))
        end
        return sn(nil, nodes)
    end, { 1 }),
}))
`);
    });

    it('should generate sub-fields from d() node', async function () {
        await setupEditor('', { line: 0, ch: 0 });
        await typePrefixAndTab('dtest');
        await browser.pause(200);
        const value = await getEditorValue();
        expect(value).toContain('- item 1');
        expect(value).toContain('- item 2');
    });

    it('should regenerate d() when dependency changes', async function () {
        await setupEditor('', { line: 0, ch: 0 });
        await typePrefixAndTab('dtest');
        await browser.keys(['3']);
        await browser.pause(200);
        const value = await getEditorValue();
        expect(value).toContain('- item 3');
    });
});
