import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { getEditorValue, PAUSE, setupEditor, vimKeys } from '../../helpers';

async function typePrefixAndTab(prefix: string): Promise<void> {
    await vimKeys('i');
    await browser.keys(Array.from(prefix));
    await browser.pause(PAUSE.KEY_GAP);
    await browser.keys(['Tab']);
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

describe('Snippet context and settings', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    it('should expand snippets inside code blocks (no context restriction on wl yet)', async function () {
        await setupEditor('```js\n\n```', { line: 1, ch: 0 });
        await typePrefixAndTab('wl');
        const value = await getEditorValue();
        expect(value).toContain('[[');
    });

    it('should have enableSnippets setting defaulting to true', async function () {
        const enabled = await browser.executeObsidian(({ app }) => {
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
            return plugin?.settings?.enableSnippets;
        });
        expect(enabled).toBe(true);
    });

    it('should have snippetBundled setting defaulting to true', async function () {
        const bundled = await browser.executeObsidian(({ app }) => {
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
            return plugin?.settings?.snippetBundled;
        });
        expect(bundled).toBe(true);
    });

    it('should have snippet registry populated with bundled snippets', async function () {
        const count = (await browser.executeObsidian(({ app }) => {
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
            return plugin?.snippetRegistry?.getAll()?.length ?? 0;
        })) as number;
        expect(count).toBeGreaterThan(20);
    });
});
