import { browser, expect } from '@wdio/globals';
import { Key } from 'webdriverio';
import { obsidianPage } from 'wdio-obsidian-service';

import { PAUSE, sendVimEscape } from '../helpers';

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

async function applyGlobalMapOverride(
    key: string,
    commandId: string,
): Promise<void> {
    await browser.executeObsidian(
        ({ app }, k: string, cmd: string) => {
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<
                            string,
                            {
                                globalRegistry?: {
                                    addMapping: (
                                        keys: string,
                                        action: {
                                            type: string;
                                            commandId: string;
                                        },
                                        opts: { source: string; gate: string },
                                    ) => void;
                                };
                            }
                        >;
                    };
                }
            ).plugins.plugins['vim-motions'];
            plugin?.globalRegistry?.addMapping(
                k,
                { type: 'obcommand', commandId: cmd },
                { source: 'user', gate: 'standard' },
            );
        },
        key,
        commandId,
    );
}

async function removeGlobalMap(key: string): Promise<void> {
    await browser.executeObsidian(({ app }, k: string) => {
        const plugin = (
            app as unknown as {
                plugins: {
                    plugins: Record<
                        string,
                        {
                            globalRegistry?: {
                                removeMapping: (keys: string) => boolean;
                            };
                        }
                    >;
                };
            }
        ).plugins.plugins['vim-motions'];
        plugin?.globalRegistry?.removeMapping(k);
    }, key);
}

describe('gmap / gnoremap / gunmap', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
    });

    describe('Default global bindings (regression)', function () {
        it('gt from graph view should switch tab', async function () {
            await loadTwoTabs();
            expect(await getActiveViewType()).toBe('graph');

            await browser.keys(['g']);
            await browser.pause(PAUSE.KEY_GAP);
            await browser.keys(['t']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            expect(await getActiveViewType()).toBe('markdown');
        });

        it('H from graph view should switch tab', async function () {
            await loadTwoTabs();
            expect(await getActiveViewType()).toBe('graph');

            await browser.keys(['H']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            expect(await getActiveViewType()).toBe('markdown');
        });

        it('<C-w>h from split should focus left pane', async function () {
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

        it(': from graph view should open ex command modal', async function () {
            await loadTwoTabs();
            expect(await getActiveViewType()).toBe('graph');

            await browser.keys([':']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const modalOpen = (await browser.executeObsidian(() => {
                return !!document.querySelector('.prompt');
            })) as boolean;
            expect(modalOpen).toBe(true);

            await browser.keys(['Escape']);
            await browser.pause(PAUSE.EDITOR_SETTLE);
        });

        it('sequence timeout should reset state', async function () {
            await loadTwoTabs();
            expect(await getActiveViewType()).toBe('graph');

            await browser.keys(['g']);
            await browser.pause(1500);
            await browser.keys(['t']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            expect(await getActiveViewType()).toBe('graph');
        });
    });

    describe('Runtime gmap override (via registry API)', function () {
        afterEach(async function () {
            await applyGlobalMapOverride('H', 'workspace:previous-tab');
            await applyGlobalMapOverride('L', 'workspace:next-tab');
        });

        it('overriding H should change its behavior', async function () {
            await loadTwoTabs();
            await applyGlobalMapOverride('H', 'app:go-back');

            expect(await getActiveViewType()).toBe('graph');
            await browser.keys(['H']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            expect(await getActiveViewType()).toBe('graph');
        });

        it('removing H via gunmap should stop interception', async function () {
            await loadTwoTabs();
            await removeGlobalMap('H');

            expect(await getActiveViewType()).toBe('graph');
            await browser.keys(['H']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            expect(await getActiveViewType()).toBe('graph');
        });

        it('adding a new binding X should work', async function () {
            await loadTwoTabs();
            await applyGlobalMapOverride('X', 'workspace:close');

            expect(await getActiveViewType()).toBe('graph');
            await browser.keys(['X']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            expect(await getActiveViewType()).toBe('markdown');
            await removeGlobalMap('X');
        });
    });

    describe('Global which-key overlay', function () {
        it('should show overlay after 500ms on partial match', async function () {
            await loadTwoTabs();

            await browser.keys([Key.Ctrl, 'w']);
            await browser.pause(600);

            const visible = (await browser.executeObsidian(() => {
                return !!document.querySelector('.vim-motions-which-key');
            })) as boolean;
            expect(visible).toBe(true);

            await browser.keys(['h']);
            await browser.pause(PAUSE.EDITOR_SETTLE);
        });

        it('should NOT show overlay if sequence completes within 500ms', async function () {
            await loadTwoTabs();

            await browser.keys([Key.Ctrl, 'w']);
            await browser.pause(PAUSE.KEY_GAP);
            await browser.keys(['q']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const visible = (await browser.executeObsidian(() => {
                return !!document.querySelector('.vim-motions-which-key');
            })) as boolean;
            expect(visible).toBe(false);
        });

        it('should dismiss overlay on sequence completion', async function () {
            await loadTwoTabs();

            await browser.keys([Key.Ctrl, 'w']);
            await browser.pause(600);

            const showed = (await browser.executeObsidian(() => {
                return !!document.querySelector('.vim-motions-which-key');
            })) as boolean;
            expect(showed).toBe(true);

            await browser.keys(['h']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const gone = (await browser.executeObsidian(() => {
                return !document.querySelector('.vim-motions-which-key');
            })) as boolean;
            expect(gone).toBe(true);
        });
    });

    describe(':gmap ex command', function () {
        it(':gmap should open info modal in editor', async function () {
            await obsidianPage.openFile('Welcome.md');
            await browser.pause(PAUSE.EDITOR_SETTLE);

            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (view) view.editor.focus();
            });
            await browser.pause(PAUSE.MODE_SWITCH);
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);

            await browser.keys([':']);
            await browser.pause(PAUSE.KEY_GAP);

            const exInput = await browser.$('.cm-vim-panel input');
            if (await exInput.isExisting()) {
                await exInput.setValue('gmap');
                await browser.keys(['Enter']);
                await browser.pause(PAUSE.EDITOR_SETTLE);

                const modalOpen = (await browser.executeObsidian(() => {
                    return !!document.querySelector('.modal-container');
                })) as boolean;
                expect(modalOpen).toBe(true);

                await browser.keys(['Escape']);
                await browser.pause(PAUSE.EDITOR_SETTLE);
            }
        });
    });
});
