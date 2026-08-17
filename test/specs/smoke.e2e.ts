import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

describe('Vim Motions plugin', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
    });

    it('should load the plugin', async function () {
        const pluginIds = await browser.executeObsidian(({ app }) => {
            return Object.keys(
                (
                    app as Record<string, unknown> & {
                        plugins: { plugins: Record<string, unknown> };
                    }
                ).plugins.plugins,
            );
        });
        expect(pluginIds).toContain('vim-motions');
    });

    it('should have Vim API available (built-in or bundled)', async function () {
        const vimApiCheck = (await browser.executeObsidian(() => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: { Vim?: Record<string, unknown> };
                }
            ).CodeMirrorAdapter?.Vim;
            return {
                exists: !!Vim,
                hasHandleKey: typeof Vim?.handleKey === 'function',
            };
        })) as { exists: boolean; hasHandleKey: boolean };
        expect(vimApiCheck.exists).toBe(true);
        expect(vimApiCheck.hasHandleKey).toBe(true);
    });

    it('should open a file in the vault', async function () {
        await obsidianPage.openFile('Welcome.md');

        const activeFile = await browser.executeObsidian(({ app }) => {
            return app.workspace.getActiveFile()?.path;
        });
        expect(activeFile).toBe('Welcome.md');
    });
});
