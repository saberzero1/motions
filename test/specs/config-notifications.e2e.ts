import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { getVimMotionsNotices, dismissNotices } from '../helpers';

async function waitForVimrcLoaded(): Promise<void> {
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
}

async function waitForLuaLoaded(): Promise<void> {
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

async function applySettings(settings: Record<string, unknown>): Promise<void> {
    await browser.executeObsidian(({ app }, s: Record<string, unknown>) => {
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
        if (plugin) Object.assign(plugin.settings, s);
    }, settings);
}

async function loadLuaViaTestHook(content: string): Promise<void> {
    await browser.executeObsidian(async ({ app }, luaContent: string) => {
        await app.vault.adapter.write('.obsidian.init.lua', luaContent);
    }, content);
    await browser.executeObsidian(async ({ app }) => {
        const plugin = (
            app as unknown as {
                plugins: {
                    plugins: Record<
                        string,
                        {
                            loadLuaConfigForTest?: () => Promise<void>;
                        }
                    >;
                };
            }
        ).plugins.plugins['vim-motions'];
        await plugin?.loadLuaConfigForTest?.();
    });
    await waitForLuaLoaded();
    await browser.pause(500);
}

describe('Config load notifications (showConfigNotifications)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await waitForVimrcLoaded();
        await browser.pause(500);
    });

    afterEach(async function () {
        await dismissNotices();
    });

    after(async function () {
        await obsidianPage.resetVault();
    });

    describe('lua success notification shown when enabled', function () {
        before(async function () {
            await dismissNotices();
            await applySettings({ showConfigNotifications: true });
            await loadLuaViaTestHook('vim.opt.scrolloff = 5\n');
        });

        it('should show loaded notification with path', async function () {
            const notices = await getVimMotionsNotices();
            const luaNotice = notices.find(
                (n) => n.includes('loaded') && n.includes('command'),
            );
            expect(luaNotice).toBeDefined();
            expect(luaNotice).toContain('.obsidian.init.lua');
        });
    });

    describe('lua success notification suppressed when disabled', function () {
        before(async function () {
            await dismissNotices();
            await applySettings({ showConfigNotifications: false });
            await loadLuaViaTestHook('vim.opt.scrolloff = 10\n');
        });

        it('should not show lua loaded notification', async function () {
            const notices = await getVimMotionsNotices();
            const loadNotice = notices.find(
                (n) => n.includes('loaded') && n.includes('command'),
            );
            expect(loadNotice).toBeUndefined();
        });
    });

    describe('lua error notification bypasses suppression', function () {
        before(async function () {
            await dismissNotices();
            await applySettings({ showConfigNotifications: false });
            await loadLuaViaTestHook('this is not valid lua syntax !!!');
        });

        it('should show error notification even when suppressed', async function () {
            const notices = await getVimMotionsNotices();
            const errorNotice = notices.find((n) =>
                n.includes('error loading'),
            );
            expect(errorNotice).toBeDefined();
            expect(errorNotice).toContain('.obsidian.init.lua');
        });
    });

    describe('lua empty file notification suppressed when disabled', function () {
        before(async function () {
            await dismissNotices();
            await applySettings({ showConfigNotifications: false });
            await loadLuaViaTestHook('-- empty config\n');
        });

        it('should not show empty-file notification', async function () {
            const notices = await getVimMotionsNotices();
            const emptyNotice = notices.find((n) =>
                n.includes('contained no commands'),
            );
            expect(emptyNotice).toBeUndefined();
        });
    });

    describe('lua empty file notification shown when enabled', function () {
        before(async function () {
            await dismissNotices();
            await applySettings({ showConfigNotifications: true });
            await loadLuaViaTestHook('-- empty config\n');
        });

        it('should show empty-file notification with path', async function () {
            const notices = await getVimMotionsNotices();
            const emptyNotice = notices.find((n) =>
                n.includes('contained no commands'),
            );
            expect(emptyNotice).toBeDefined();
            expect(emptyNotice).toContain('.obsidian.init.lua');
        });
    });

    describe('lua notification includes path', function () {
        before(async function () {
            await dismissNotices();
            await applySettings({ showConfigNotifications: true });
            await loadLuaViaTestHook('vim.opt.tabstop = 2\n');
        });

        it('should include the config file path in the notification', async function () {
            const notices = await getVimMotionsNotices();
            const loadNotice = notices.find(
                (n) => n.includes('loaded') && n.includes('command'),
            );
            expect(loadNotice).toBeDefined();
            expect(loadNotice).toMatch(/from\s+\S+\.init\.lua/);
        });
    });

    describe('setting default is true', function () {
        it('showConfigNotifications should default to true', async function () {
            const value = await browser.executeObsidian(({ app }) => {
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
                return plugin?.settings?.showConfigNotifications;
            });
            expect(value).toBe(true);
        });
    });
});
