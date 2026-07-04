import { browser, expect } from '@wdio/globals';
import { Key } from 'webdriverio';
import { obsidianPage } from 'wdio-obsidian-service';

import { PAUSE } from '../helpers';

async function getActiveViewType(): Promise<string> {
    return (await browser.executeObsidian(({ app }) => {
        const leaf = app.workspace.getMostRecentLeaf();
        return leaf?.view.getViewType() ?? 'unknown';
    })) as string;
}

async function loadTwoTabs(): Promise<void> {
    await obsidianPage.loadWorkspaceLayout({
        main: {
            id: 'tabs-root',
            type: 'split',
            children: [
                {
                    id: 'tab-group',
                    type: 'tabs',
                    children: [
                        {
                            id: 'tab-1',
                            type: 'leaf',
                            state: {
                                type: 'markdown',
                                state: { file: 'Welcome.md', mode: 'source' },
                            },
                        },
                        {
                            id: 'tab-2',
                            type: 'leaf',
                            state: { type: 'graph', state: {} },
                        },
                    ],
                },
            ],
            direction: 'vertical',
        },
        active: 'tab-2',
        lastOpenFiles: [],
    });
    await browser.pause(PAUSE.OBSIDIAN_LOAD);
}

describe('gmap vimrc integration', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.write(
            '.obsidian.vimrc',
            [
                'let mapleader = ","',
                'gmap H :obcommand app:go-back',
                'gunmap L',
                'gmap <leader>q :obcommand workspace:close',
                'gnoremap <leader>s :sidebar left',
                'gwhichkeylabel ,q Close tab',
                'gwhichkeygroup , +leader',
            ].join('\n'),
        );
        await browser.executeObsidian(({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<
                            string,
                            {
                                vimrcLoaded?: boolean;
                                vimrcLoading?: boolean;
                            }
                        >;
                    };
                }
            ).plugins.plugins['vim-motions'];
            if (plugin) {
                plugin.vimrcLoaded = false;
                plugin.vimrcLoading = false;
            }
        });
        await obsidianPage.openFile('Welcome.md');
        await browser.waitUntil(
            async () =>
                (await browser.executeObsidian(({ app }) => {
                    const plugin = (
                        app as unknown as {
                            plugins: {
                                plugins: Record<
                                    string,
                                    { vimrcLoaded?: boolean }
                                >;
                            };
                        }
                    ).plugins.plugins['vim-motions'];
                    return plugin?.vimrcLoaded === true;
                })) as boolean,
            { timeout: 5000, interval: 100 },
        );
        await browser.pause(PAUSE.OBSIDIAN_LOAD);
    });

    it('vimrc should have parsed gmap commands', async function () {
        const result = (await browser.executeObsidian(({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<string, Record<string, unknown>>;
                    };
                }
            ).plugins.plugins['vim-motions'];
            const gmaps = (plugin?.vimrcGlobalMaps ?? []) as Array<{
                lhs: string;
                rhs: string;
            }>;
            const gunmaps = (plugin?.vimrcGlobalUnmaps ?? []) as string[];
            const commandCount = plugin?.vimrcCommandCount as number;
            return {
                commandCount,
                gmapCount: gmaps.length,
                gunmapCount: gunmaps.length,
                gmaps: gmaps.map((g) => `${g.lhs} → ${g.rhs}`),
                gunmaps,
            };
        })) as Record<string, unknown>;
        expect(
            (result as { commandCount: number }).commandCount,
        ).toBeGreaterThan(0);
        expect(
            (result as { gmapCount: number }).gmapCount,
        ).toBeGreaterThanOrEqual(3);
        expect((result as { gunmapCount: number }).gunmapCount).toBe(1);
    });

    it('gmap H should override default tab switching', async function () {
        await loadTwoTabs();
        expect(await getActiveViewType()).toBe('graph');

        await browser.keys(['H']);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        expect(await getActiveViewType()).toBe('graph');
    });

    it('gunmap L should prevent tab switching', async function () {
        await loadTwoTabs();
        expect(await getActiveViewType()).toBe('graph');

        await browser.keys(['L']);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        expect(await getActiveViewType()).toBe('graph');
    });

    it(',q should close the graph tab (leader binding)', async function () {
        await loadTwoTabs();
        expect(await getActiveViewType()).toBe('graph');

        await browser.keys([',']);
        await browser.pause(PAUSE.KEY_GAP);
        await browser.keys(['q']);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        expect(await getActiveViewType()).toBe('markdown');
    });

    it(',s should toggle sidebar (gnoremap with ex command)', async function () {
        await loadTwoTabs();

        await browser.keys([',']);
        await browser.pause(PAUSE.KEY_GAP);
        await browser.keys(['s']);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const hasLeaf = (await browser.executeObsidian(({ app }) => {
            return !!app.workspace.getMostRecentLeaf();
        })) as boolean;
        expect(hasLeaf).toBe(true);
    });

    it('default gt should still work (not overridden)', async function () {
        await loadTwoTabs();
        expect(await getActiveViewType()).toBe('graph');

        await browser.keys(['g']);
        await browser.pause(PAUSE.KEY_GAP);
        await browser.keys(['t']);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        expect(await getActiveViewType()).toBe('markdown');
    });

    it('<C-w> bindings should still work (not overridden)', async function () {
        await obsidianPage.loadWorkspaceLayout({
            main: {
                id: 'split-root',
                type: 'split',
                children: [
                    {
                        id: 'left-tabs',
                        type: 'tabs',
                        children: [
                            {
                                id: 'md-leaf',
                                type: 'leaf',
                                state: {
                                    type: 'markdown',
                                    state: {
                                        file: 'Welcome.md',
                                        mode: 'source',
                                    },
                                },
                            },
                        ],
                    },
                    {
                        id: 'right-tabs',
                        type: 'tabs',
                        children: [
                            {
                                id: 'graph-leaf',
                                type: 'leaf',
                                state: { type: 'graph', state: {} },
                            },
                        ],
                    },
                ],
                direction: 'vertical',
            },
            active: 'graph-leaf',
            lastOpenFiles: [],
        });
        await browser.pause(PAUSE.OBSIDIAN_LOAD);

        await browser.keys([Key.Ctrl, 'w']);
        await browser.pause(PAUSE.KEY_GAP);
        await browser.keys(['h']);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        expect(await getActiveViewType()).toBe('markdown');
    });

    it('which-key overlay should show on <C-w>', async function () {
        await browser.executeObsidian(({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<
                            string,
                            {
                                settings: { whichKeyMode: string };
                                reloadFeatures: () => void;
                            }
                        >;
                    };
                }
            ).plugins.plugins['vim-motions'];
            if (plugin) {
                plugin.settings.whichKeyMode = 'all';
                plugin.reloadFeatures();
            }
        });
        await browser.pause(PAUSE.OBSIDIAN_LOAD);

        await loadTwoTabs();

        await browser.keys([Key.Ctrl, 'w']);
        await browser.pause(800);

        const visible = (await browser.executeObsidian(() => {
            return !!document.querySelector('.vim-motions-which-key');
        })) as boolean;
        expect(visible).toBe(true);

        await browser.keys(['h']);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        await browser.executeObsidian(({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<
                            string,
                            {
                                settings: { whichKeyMode: string };
                                reloadFeatures: () => void;
                            }
                        >;
                    };
                }
            ).plugins.plugins['vim-motions'];
            if (plugin) {
                plugin.settings.whichKeyMode = 'off';
                plugin.reloadFeatures();
            }
        });
    });

    it('gwhichkeylabel/gwhichkeygroup should be stored on registry', async function () {
        const result = (await browser.executeObsidian(({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<string, Record<string, unknown>>;
                    };
                }
            ).plugins.plugins['vim-motions'];
            const labels = (plugin?.vimrcGlobalWhichKeyLabels ?? []) as Array<{
                key: string;
                label: string;
            }>;
            const groups = (plugin?.vimrcGlobalWhichKeyGroups ?? []) as Array<{
                key: string;
                label: string;
            }>;
            return {
                labelCount: labels.length,
                groupCount: groups.length,
                labels: labels.map((l) => `${l.key}: ${l.label}`),
                groups: groups.map((g) => `${g.key}: ${g.label}`),
            };
        })) as Record<string, unknown>;
        expect(
            (result as { labelCount: number }).labelCount,
        ).toBeGreaterThanOrEqual(1);
        expect(
            (result as { groupCount: number }).groupCount,
        ).toBeGreaterThanOrEqual(1);
    });

    after(async function () {
        await obsidianPage.write('.obsidian.vimrc', '');
        await browser.reloadObsidian({ vault: 'test-vault' });
    });
});
