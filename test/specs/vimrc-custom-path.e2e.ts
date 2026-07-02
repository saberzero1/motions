import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { setupEditor, vimKeys, getCursorPos, sendVimEscape } from '../helpers';

async function setVimrcPath(path: string): Promise<void> {
    await browser.executeObsidian(({ app }, vimrcPath: string) => {
        const plugin = (
            app as unknown as {
                plugins: {
                    plugins: Record<
                        string,
                        {
                            settings: Record<string, unknown>;
                            saveSettings: () => Promise<void>;
                        }
                    >;
                };
            }
        ).plugins.plugins['vim-motions'];
        if (!plugin) return;
        plugin.settings.vimrcPath = vimrcPath;
        plugin.saveSettings();
    }, path);
}

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
        { timeout: 5000, interval: 100 },
    );
}

async function assertPluginLoaded(): Promise<void> {
    const result = await browser.executeObsidian(({ app }) => {
        const plugins = (
            app as unknown as {
                plugins: { plugins: Record<string, unknown> };
            }
        ).plugins.plugins;
        return { pluginLoaded: 'vim-motions' in plugins };
    });
    expect(result).toHaveProperty('pluginLoaded', true);
}

describe('Custom vimrc path (issue #34)', function () {
    after(async function () {
        await setVimrcPath('');
        await obsidianPage.resetVault();
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(50);
    });

    describe('loading vimrc from a custom path', function () {
        before(async function () {
            await obsidianPage.write(
                'config/my.vimrc',
                'nmap j gj\nnmap k gk\n',
            );
            await setVimrcPath('config/my.vimrc');
            await browser.reloadObsidian({ vault: 'test-vault' });
            await obsidianPage.openFile('Welcome.md');
            await waitForVimrcLoaded();
        });

        it('plugin should load with custom vimrc path', async function () {
            await assertPluginLoaded();
        });

        it('j mapping from custom vimrc should move cursor down', async function () {
            await setupEditor('line one\nline two\nline three', {
                line: 0,
                ch: 0,
            });
            await vimKeys('j');
            const pos = await getCursorPos();
            expect(pos.line).toBe(1);
        });

        it('k mapping from custom vimrc should move cursor up', async function () {
            await setupEditor('line one\nline two\nline three', {
                line: 2,
                ch: 0,
            });
            await vimKeys('k');
            const pos = await getCursorPos();
            expect(pos.line).toBe(1);
        });
    });

    describe('empty vimrcPath uses default .obsidian.vimrc', function () {
        before(async function () {
            await obsidianPage.write('.obsidian.vimrc', 'nmap H ^\n');
            await setVimrcPath('');
            await browser.reloadObsidian({ vault: 'test-vault' });
            await obsidianPage.openFile('Welcome.md');
            await waitForVimrcLoaded();
        });

        it('H mapping from default vimrc should work', async function () {
            await setupEditor('   hello world', { line: 0, ch: 8 });
            await vimKeys('H');
            const pos = await getCursorPos();
            expect(pos.ch).toBe(3);
        });
    });

    describe('non-existent custom path does not crash', function () {
        before(async function () {
            await setVimrcPath('does/not/exist.vimrc');
            await browser.reloadObsidian({ vault: 'test-vault' });
            await obsidianPage.openFile('Welcome.md');
            await waitForVimrcLoaded();
        });

        it('plugin should still be loaded', async function () {
            await assertPluginLoaded();
        });
    });

    describe('non-dotfile vimrc path for Obsidian Sync compatibility', function () {
        before(async function () {
            await obsidianPage.write(
                'vimrc.md',
                'nmap j gj\nnmap k gk\nnmap H ^\n',
            );
            await setVimrcPath('vimrc.md');
            await browser.reloadObsidian({ vault: 'test-vault' });
            await obsidianPage.openFile('Welcome.md');
            await waitForVimrcLoaded();
        });

        it('j mapping from non-dotfile vimrc should work', async function () {
            await setupEditor('line one\nline two\nline three', {
                line: 0,
                ch: 0,
            });
            await vimKeys('j');
            const pos = await getCursorPos();
            expect(pos.line).toBe(1);
        });

        it('H mapping from non-dotfile vimrc should work', async function () {
            await setupEditor('   hello world', { line: 0, ch: 8 });
            await vimKeys('H');
            const pos = await getCursorPos();
            expect(pos.ch).toBe(3);
        });
    });
});
