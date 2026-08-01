import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

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
    await browser.pause(500);
}

async function getGutterState(): Promise<{
    hasLineNumbers: boolean;
    hasSignColumn: boolean;
    bodyHasLineNumberClass: boolean;
    settingsNumber: boolean;
    settingsRelativeNumber: boolean;
    settingsSigncolumn: string;
    settingsCursorline: boolean;
    settingsFoldcolumn: boolean;
}> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) {
            return {
                hasLineNumbers: false,
                hasSignColumn: false,
                bodyHasLineNumberClass: false,
                settingsNumber: false,
                settingsRelativeNumber: false,
                settingsSigncolumn: '',
                settingsCursorline: false,
                settingsFoldcolumn: false,
            };
        }

        const editorView = (
            view.editor as unknown as { cm?: { dom: HTMLElement } }
        )?.cm;
        const editorDom = editorView?.dom;

        const hasLineNumbers = editorDom
            ? editorDom.querySelector('.vim-motions-line-numbers') !== null
            : false;
        const hasSignColumn = editorDom
            ? editorDom.querySelector('.vim-motions-sign-column') !== null
            : false;
        const bodyHasLineNumberClass = document.body.classList.contains(
            'vim-motions-line-numbers-active',
        );

        const plugin = (
            app as unknown as {
                plugins: {
                    plugins: Record<
                        string,
                        { settings: Record<string, unknown> }
                    >;
                };
            }
        ).plugins.plugins['vim-motions'];
        const s = plugin?.settings ?? {};

        return {
            hasLineNumbers,
            hasSignColumn,
            bodyHasLineNumberClass,
            settingsNumber: s.number as boolean,
            settingsRelativeNumber: s.relativenumber as boolean,
            settingsSigncolumn: s.signcolumn as string,
            settingsCursorline: s.cursorline as boolean,
            settingsFoldcolumn: s.foldcolumn as boolean,
        };
    })) as {
        hasLineNumbers: boolean;
        hasSignColumn: boolean;
        bodyHasLineNumberClass: boolean;
        settingsNumber: boolean;
        settingsRelativeNumber: boolean;
        settingsSigncolumn: string;
        settingsCursorline: boolean;
        settingsFoldcolumn: boolean;
    };
}

describe('Gutter settings via Lua config (#101)', function () {
    it('should store and apply number=true via Lua', async function () {
        await loadLuaConfig(`
            vim.opt.number = true
            vim.opt.relativenumber = false
        `);

        const state = await getGutterState();
        expect(state.settingsNumber).toBe(true);
        expect(state.settingsRelativeNumber).toBe(false);
        expect(state.bodyHasLineNumberClass).toBe(true);
    });

    it('should store and persist number=false via Lua', async function () {
        await loadLuaConfig(`
            vim.opt.number = false
            vim.opt.relativenumber = false
        `);

        const state = await getGutterState();
        expect(state.settingsNumber).toBe(false);
        expect(state.settingsRelativeNumber).toBe(false);
        expect(state.bodyHasLineNumberClass).toBe(false);
    });

    it('should store and persist signcolumn=no via Lua', async function () {
        await loadLuaConfig(`
            vim.opt.signcolumn = "no"
        `);

        const state = await getGutterState();
        expect(state.settingsSigncolumn).toBe('no');
    });

    it('should store and persist signcolumn=auto via Lua', async function () {
        await loadLuaConfig(`
            vim.opt.signcolumn = "auto"
        `);

        const state = await getGutterState();
        expect(state.settingsSigncolumn).toBe('auto');
    });

    it('should store and persist all gutter settings disabled via Lua', async function () {
        await loadLuaConfig(`
            vim.opt.number = false
            vim.opt.relativenumber = false
            vim.opt.signcolumn = "no"
            vim.opt.foldcolumn = false
            vim.opt.cursorline = false
        `);

        const state = await getGutterState();
        expect(state.settingsNumber).toBe(false);
        expect(state.settingsRelativeNumber).toBe(false);
        expect(state.settingsSigncolumn).toBe('no');
        expect(state.settingsFoldcolumn).toBe(false);
        expect(state.settingsCursorline).toBe(false);
        expect(state.bodyHasLineNumberClass).toBe(false);
    });

    it('should store and apply hybrid line numbers via Lua', async function () {
        await loadLuaConfig(`
            vim.opt.number = true
            vim.opt.relativenumber = true
        `);

        const state = await getGutterState();
        expect(state.settingsNumber).toBe(true);
        expect(state.settingsRelativeNumber).toBe(true);
        expect(state.bodyHasLineNumberClass).toBe(true);
    });

    after(async function () {
        await browser.executeObsidian(async ({ app }) => {
            const configPath = `${app.vault.configDir}.init.lua`;
            try {
                await app.vault.adapter.remove(configPath);
            } catch {
                // file may not exist
            }
        });
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });
});
