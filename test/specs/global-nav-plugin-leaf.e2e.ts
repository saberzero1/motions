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

async function setWorkspaceNavViewTypes(value: string): Promise<void> {
    await browser.executeObsidian(({ app }, val: string) => {
        const plugin = (
            app as unknown as {
                plugins: {
                    plugins: Record<
                        string,
                        {
                            settings: Record<string, unknown>;
                            reloadFeatures: () => void;
                        }
                    >;
                };
            }
        ).plugins.plugins['vim-motions'];
        if (!plugin) return;
        plugin.settings.workspaceNavViewTypes = val;
        plugin.reloadFeatures();
    }, value);
    await browser.pause(PAUSE.OBSIDIAN_LOAD);
}

async function getChordDisplay(): Promise<string> {
    return (await browser.executeObsidian(() => {
        const el = document.querySelector('.vim-motions-chord');
        return (el as HTMLElement)?.textContent ?? '';
    })) as string;
}

async function loadSplitWithGraph(): Promise<void> {
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
                                state: { file: 'Welcome.md', mode: 'source' },
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
}

async function loadTwoTabsGraphActive(): Promise<void> {
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

describe('Plugin leaf key passthrough (#47)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
    });

    describe('Graph excluded from whitelist', function () {
        before(async function () {
            await setWorkspaceNavViewTypes('markdown,canvas,empty,image,pdf');
        });

        after(async function () {
            await setWorkspaceNavViewTypes('');
        });

        it('<C-w>h from graph should still work (structural)', async function () {
            await loadSplitWithGraph();
            const before = await getActiveViewType();
            expect(before).toBe('graph');

            await browser.keys([Key.Ctrl, 'w']);
            await browser.pause(PAUSE.KEY_GAP);
            await browser.keys(['h']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const after = await getActiveViewType();
            expect(after).toBe('markdown');
        });

        it('gt from graph should still switch tabs (structural)', async function () {
            await loadTwoTabsGraphActive();
            const before = await getActiveViewType();
            expect(before).toBe('graph');

            await browser.keys(['g']);
            await browser.pause(PAUSE.KEY_GAP);
            await browser.keys(['t']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const after = await getActiveViewType();
            expect(after).toBe('markdown');
        });

        it('digit keys should not be intercepted when graph is a plugin leaf', async function () {
            await loadSplitWithGraph();
            const before = await getActiveViewType();
            expect(before).toBe('graph');

            await browser.keys(['Escape']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            await browser.keys(['1']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const chord = await getChordDisplay();
            expect(chord).toBe('');

            const after = await getActiveViewType();
            expect(after).toBe('graph');
        });

        it('standard keys should pass through on plugin leaf', async function () {
            await loadTwoTabsGraphActive();
            const before = await getActiveViewType();
            expect(before).toBe('graph');

            await browser.keys(['H']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const after = await getActiveViewType();
            expect(after).toBe('graph');
        });
    });

    describe('Graph in whitelist (default)', function () {
        it('digit keys should be intercepted as count prefix', async function () {
            await loadSplitWithGraph();
            const before = await getActiveViewType();
            expect(before).toBe('graph');

            await browser.keys(['Escape']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            await browser.keys(['2']);
            await browser.pause(PAUSE.MODE_SWITCH);

            const chord = await getChordDisplay();
            expect(chord).toContain('2');

            await browser.pause(1100);
        });
    });
});
