import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { setupEditor, vimKeys, getCursorPos, sendVimEscape } from '../helpers';

async function setVimrcPath(path: string): Promise<void> {
    await browser.executeObsidian(async ({ app }, vimrcPath: string) => {
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
        await plugin.saveSettings();
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

// Each scenario writes a vimrc and reboots Obsidian on the same vault copy.
// `reloadObsidian({ vault })` would open a fresh copy instead, without the
// file just written or the path just saved, and every scenario here used to
// do that: no vimrc was ever read, and the old mappings (`j` to `gj`, `H` to
// `^`) moved the cursor where the unmapped keys already did. The mappings now
// land somewhere the unmapped keys cannot: `2j` and `2k` move two lines, and
// `^` from the second line stays on it where `H` goes to the first.
async function loadVimrc(file: string | null, content: string, path: string) {
    if (file) await obsidianPage.write(file, content);
    await setVimrcPath(path);
    await browser.reloadObsidian();
    await obsidianPage.openFile('Welcome.md');
    await waitForVimrcLoaded();
}

const FOUR = 'line one\nline two\nline three\nline four';

async function pressFrom(line: number, ch: number, key: string, doc = FOUR) {
    await setupEditor(doc, { line, ch });
    await vimKeys(key);
    return getCursorPos();
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
            await loadVimrc(
                'config/my.vimrc',
                'nnoremap j 2j\nnnoremap k 2k\n',
                'config/my.vimrc',
            );
        });
        after(async function () {
            await obsidianPage.delete('config/my.vimrc');
        });

        it('j mapping from custom vimrc moves two lines', async function () {
            expect((await pressFrom(0, 0, 'j')).line).toBe(2);
        });

        it('k mapping from custom vimrc moves two lines', async function () {
            expect((await pressFrom(3, 0, 'k')).line).toBe(1);
        });
    });

    describe('empty vimrcPath uses default .obsidian.vimrc', function () {
        before(async function () {
            await loadVimrc('.obsidian.vimrc', 'nmap H ^\n', '');
        });
        after(async function () {
            await obsidianPage.delete('.obsidian.vimrc');
        });

        it('H mapping from default vimrc should work', async function () {
            expect(
                await pressFrom(1, 8, 'H', 'top line\n   hello world'),
            ).toEqual({ line: 1, ch: 3 });
        });
    });

    describe('non-existent custom path does not crash', function () {
        before(async function () {
            await loadVimrc(null, '', 'does/not/exist.vimrc');
        });

        it('plugin should still be loaded', async function () {
            await assertPluginLoaded();
            // "does not crash" means the editor still works. A loaded plugin
            // holds equally with vim wedged.
            expect((await pressFrom(0, 0, 'j')).line).toBe(1);
        });
    });

    describe('non-dotfile vimrc path for Obsidian Sync compatibility', function () {
        before(async function () {
            await loadVimrc(
                'vimrc.md',
                'nnoremap j 2j\nnnoremap k 2k\nnmap H ^\n',
                'vimrc.md',
            );
        });
        after(async function () {
            await obsidianPage.delete('vimrc.md');
        });

        it('j mapping from non-dotfile vimrc should work', async function () {
            expect((await pressFrom(0, 0, 'j')).line).toBe(2);
        });

        it('H mapping from non-dotfile vimrc should work', async function () {
            expect(
                await pressFrom(1, 8, 'H', 'top line\n   hello world'),
            ).toEqual({ line: 1, ch: 3 });
        });
    });
});
