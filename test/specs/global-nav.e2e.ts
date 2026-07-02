import { browser, expect } from '@wdio/globals';
import { Key } from 'webdriverio';
import { obsidianPage } from 'wdio-obsidian-service';

import { PAUSE, sendVimEscape } from '../helpers';

async function countAllLeaves(): Promise<number> {
    return (await browser.executeObsidian(({ app }) => {
        let n = 0;
        app.workspace.iterateAllLeaves(() => n++);
        return n;
    })) as number;
}

async function getActiveViewType(): Promise<string> {
    return (await browser.executeObsidian(({ app }) => {
        const leaf = app.workspace.getMostRecentLeaf();
        return leaf?.view.getViewType() ?? 'unknown';
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
                            state: {
                                type: 'graph',
                                state: {},
                            },
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

describe('Global workspace navigation', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
    });

    describe('No regression — editor commands still work', function () {
        it('gt in editor should not double-dispatch', async function () {
            await obsidianPage.loadWorkspaceLayout({
                main: {
                    id: 'single-root',
                    type: 'split',
                    children: [
                        {
                            id: 'single-tabs',
                            type: 'tabs',
                            children: [
                                {
                                    id: 'single-leaf',
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
                    ],
                    direction: 'vertical',
                },
                active: 'single-leaf',
                lastOpenFiles: [],
            });
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

            await browser.keys(['g', 't']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const viewType = await getActiveViewType();
            expect(viewType).toBe('markdown');
        });
    });

    describe('Tab switching from non-editor view', function () {
        beforeEach(async function () {
            await loadTwoTabs();
        });

        it('gt from graph view should switch tab', async function () {
            const before = await getActiveViewType();
            expect(before).toBe('graph');

            await browser.keys(['g']);
            await browser.pause(PAUSE.KEY_GAP);
            await browser.keys(['t']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const after = await getActiveViewType();
            expect(after).toBe('markdown');
        });

        it('gT from graph view should switch tab', async function () {
            const before = await getActiveViewType();
            expect(before).toBe('graph');

            await browser.keys(['g']);
            await browser.pause(PAUSE.KEY_GAP);
            await browser.keys(['T']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const after = await getActiveViewType();
            expect(after).toBe('markdown');
        });

        it('H from graph view should switch to previous tab', async function () {
            const before = await getActiveViewType();
            expect(before).toBe('graph');

            await browser.keys(['H']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const after = await getActiveViewType();
            expect(after).toBe('markdown');
        });

        it('L from graph view should switch to next tab', async function () {
            const before = await getActiveViewType();
            expect(before).toBe('graph');

            await browser.keys(['L']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const after = await getActiveViewType();
            expect(after).toBe('markdown');
        });
    });

    describe('Pane focus from non-editor view', function () {
        beforeEach(async function () {
            await loadSplitWithGraph();
        });

        it('<C-w>h from graph should focus left pane', async function () {
            const before = await getActiveViewType();
            expect(before).toBe('graph');

            await browser.keys([Key.Ctrl, 'w']);
            await browser.pause(PAUSE.KEY_GAP);
            await browser.keys(['h']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const after = await getActiveViewType();
            expect(after).toBe('markdown');
        });

        it('<C-w>l from markdown should focus right pane (graph)', async function () {
            await browser.executeObsidian(({ app }) => {
                const leaves = app.workspace.getLeavesOfType('markdown');
                if (leaves[0]) {
                    app.workspace.setActiveLeaf(leaves[0], { focus: true });
                }
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);

            await browser.keys([Key.Ctrl, 'w']);
            await browser.pause(PAUSE.KEY_GAP);
            await browser.keys(['l']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const after = await getActiveViewType();
            expect(after).toBe('graph');
        });
    });

    describe('Close and split from non-editor view', function () {
        it('<C-w>q from graph should close graph tab', async function () {
            await loadTwoTabs();
            const before = await getActiveViewType();
            expect(before).toBe('graph');

            await browser.keys([Key.Ctrl, 'w']);
            await browser.pause(PAUSE.KEY_GAP);
            await browser.keys(['q']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const viewType = await getActiveViewType();
            expect(viewType).toBe('markdown');
        });

        it('<C-w>s from graph should not error', async function () {
            await loadTwoTabs();
            const before = await getActiveViewType();
            expect(before).toBe('graph');

            await browser.keys([Key.Ctrl, 'w']);
            await browser.pause(PAUSE.KEY_GAP);
            await browser.keys(['s']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const hasLeaf = (await browser.executeObsidian(({ app }) => {
                return !!app.workspace.getMostRecentLeaf();
            })) as boolean;
            expect(hasLeaf).toBe(true);
        });
    });

    describe('Sequence timeout', function () {
        it('g followed by timeout should not trigger gt', async function () {
            await loadTwoTabs();
            const before = await getActiveViewType();
            expect(before).toBe('graph');

            await browser.keys(['g']);
            await browser.pause(1500);
            await browser.keys(['t']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const after = await getActiveViewType();
            expect(after).toBe('graph');
        });
    });

    describe('Scroll in non-editor view', function () {
        beforeEach(async function () {
            await obsidianPage.loadWorkspaceLayout({
                main: {
                    id: 'scroll-root',
                    type: 'split',
                    children: [
                        {
                            id: 'scroll-tabs',
                            type: 'tabs',
                            children: [
                                {
                                    id: 'scroll-leaf',
                                    type: 'leaf',
                                    state: {
                                        type: 'markdown',
                                        state: {
                                            file: 'Welcome.md',
                                            mode: 'preview',
                                        },
                                    },
                                },
                            ],
                        },
                    ],
                    direction: 'vertical',
                },
                active: 'scroll-leaf',
                lastOpenFiles: [],
            });
            await browser.pause(PAUSE.OBSIDIAN_LOAD);
        });

        it.skip('Ctrl-d scrolls half page (requires unbinding Obsidian default Ctrl-d hotkey)', async function () {
            const before = (await browser.executeObsidian(() => {
                const el = document.querySelector('.markdown-preview-view');
                return el?.scrollTop ?? -1;
            })) as number;

            await browser.keys([Key.Ctrl, 'd']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const after = (await browser.executeObsidian(() => {
                const el = document.querySelector('.markdown-preview-view');
                return el?.scrollTop ?? -1;
            })) as number;

            expect(after).toBeGreaterThan(before);
        });

        it('j should scroll down in reading mode', async function () {
            const before = (await browser.executeObsidian(({ app }) => {
                const el = document.querySelector('.markdown-preview-view');
                return el?.scrollTop ?? -1;
            })) as number;

            await browser.keys(['j']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const after = (await browser.executeObsidian(({ app }) => {
                const el = document.querySelector('.markdown-preview-view');
                return el?.scrollTop ?? -1;
            })) as number;

            expect(after).toBeGreaterThanOrEqual(before);
        });

        it('gg should scroll to top', async function () {
            await browser.keys(['j', 'j', 'j', 'j', 'j']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            await browser.keys(['g']);
            await browser.pause(PAUSE.KEY_GAP);
            await browser.keys(['g']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const scrollTop = (await browser.executeObsidian(({ app }) => {
                const el = document.querySelector('.markdown-preview-view');
                return el?.scrollTop ?? -1;
            })) as number;

            expect(scrollTop).toBe(0);
        });
    });

    describe('Global ex command line', function () {
        beforeEach(async function () {
            await loadTwoTabs();
        });

        it(': from graph view should open ex command modal', async function () {
            const before = await getActiveViewType();
            expect(before).toBe('graph');

            await browser.keys([':']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const modalOpen = (await browser.executeObsidian(() => {
                return !!document.querySelector('.prompt');
            })) as boolean;
            expect(modalOpen).toBe(true);

            await browser.keys(['Escape']);
            await browser.pause(PAUSE.EDITOR_SETTLE);
        });

        it(':q from graph view should close the tab', async function () {
            const before = await getActiveViewType();
            expect(before).toBe('graph');

            await browser.keys([':']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const promptInput = await browser.$('.prompt-input');
            await promptInput.setValue('q');
            await browser.pause(PAUSE.KEY_GAP);
            await browser.keys(['Enter']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const after = await getActiveViewType();
            expect(after).toBe('markdown');
        });
    });

    describe('Input suppression', function () {
        it('keys should not be intercepted in settings text fields', async function () {
            await obsidianPage.openFile('Welcome.md');
            await browser.pause(PAUSE.EDITOR_SETTLE);

            await browser.executeObsidian(({ app }) => {
                (
                    app as unknown as {
                        commands: { executeCommandById: (id: string) => void };
                    }
                ).commands.executeCommandById('app:open-settings');
            });
            await browser.pause(PAUSE.OBSIDIAN_LOAD);

            const settingsOpen = await browser.executeObsidian(() => {
                return !!document.querySelector('.modal-container');
            });
            expect(settingsOpen).toBe(true);

            await browser.keys(['Escape']);
            await browser.pause(PAUSE.EDITOR_SETTLE);
        });
    });
});
