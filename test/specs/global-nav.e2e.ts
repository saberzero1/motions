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

async function loadThreeTabs(): Promise<void> {
    await obsidianPage.write('Note-A.md', 'Content A');
    await obsidianPage.write('Note-B.md', 'Content B');
    await obsidianPage.loadWorkspaceLayout({
        main: {
            id: 'tabs-root-3',
            type: 'split',
            children: [
                {
                    id: 'tab-group-3',
                    type: 'tabs',
                    children: [
                        {
                            id: 'tab3-1',
                            type: 'leaf',
                            state: {
                                type: 'markdown',
                                state: { file: 'Welcome.md', mode: 'source' },
                            },
                        },
                        {
                            id: 'tab3-2',
                            type: 'leaf',
                            state: {
                                type: 'markdown',
                                state: { file: 'Note-A.md', mode: 'source' },
                            },
                        },
                        {
                            id: 'tab3-3',
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
        active: 'tab3-3',
        lastOpenFiles: [],
    });
    await browser.pause(PAUSE.OBSIDIAN_LOAD);
}

async function getActiveFilePath(): Promise<string> {
    return (await browser.executeObsidian(({ app }) => {
        return app.workspace.getActiveFile()?.path ?? '';
    })) as string;
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

    describe('Tab navigation with count from editor (Ngt)', function () {
        async function loadThreeTabsEditorOnLast(): Promise<void> {
            await obsidianPage.write('Note-A.md', 'Content A');
            await obsidianPage.write('Note-B.md', 'Content B');
            await obsidianPage.loadWorkspaceLayout({
                main: {
                    id: 'editor-ngt-root',
                    type: 'split',
                    children: [
                        {
                            id: 'editor-ngt-tabs',
                            type: 'tabs',
                            children: [
                                {
                                    id: 'editor-ngt-1',
                                    type: 'leaf',
                                    state: {
                                        type: 'markdown',
                                        state: {
                                            file: 'Welcome.md',
                                            mode: 'source',
                                        },
                                    },
                                },
                                {
                                    id: 'editor-ngt-2',
                                    type: 'leaf',
                                    state: {
                                        type: 'markdown',
                                        state: {
                                            file: 'Note-A.md',
                                            mode: 'source',
                                        },
                                    },
                                },
                                {
                                    id: 'editor-ngt-3',
                                    type: 'leaf',
                                    state: {
                                        type: 'markdown',
                                        state: {
                                            file: 'Note-B.md',
                                            mode: 'source',
                                        },
                                    },
                                },
                            ],
                        },
                    ],
                    direction: 'vertical',
                },
                active: 'editor-ngt-3',
                lastOpenFiles: [],
            });
            await browser.pause(PAUSE.OBSIDIAN_LOAD);
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (view) view.editor.focus();
            });
            await browser.pause(PAUSE.MODE_SWITCH);
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
        }

        it('gt without count should go to next tab (not first)', async function () {
            await loadThreeTabsEditorOnLast();

            await browser.executeObsidian(({ app }) => {
                const leaves = app.workspace.getLeavesOfType('markdown');
                const noteA = leaves.find(
                    (l) => l.view.getState()?.file === 'Note-A.md',
                );
                if (noteA) app.workspace.setActiveLeaf(noteA, { focus: true });
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);

            const before = await getActiveFilePath();
            expect(before).toBe('Note-A.md');

            await browser.keys(['g', 't']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const after = await getActiveFilePath();
            expect(after).toBe('Note-B.md');
        });

        it('1gt should go to first tab', async function () {
            await loadThreeTabsEditorOnLast();

            await browser.keys(['1', 'g', 't']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const after = await getActiveFilePath();
            expect(after).toBe('Welcome.md');
        });

        it('2gt should go to second tab', async function () {
            await loadThreeTabsEditorOnLast();
            const before = await getActiveFilePath();
            expect(before).toBe('Note-B.md');

            await browser.keys(['2', 'g', 't']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const after = await getActiveFilePath();
            expect(after).toBe('Note-A.md');
        });

        it('3gt should go to third tab', async function () {
            await loadThreeTabsEditorOnLast();

            await browser.keys(['3', 'g', 't']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const after = await getActiveFilePath();
            expect(after).toBe('Note-B.md');
        });

        it('count exceeding tab count should stay on current tab', async function () {
            await loadThreeTabsEditorOnLast();

            await browser.keys(['9', 'g', 't']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const after = await getActiveFilePath();
            expect(after).toBe('Note-B.md');
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

    describe('Tab navigation with count (Ngt)', function () {
        it('gt without count should go to next tab', async function () {
            await loadThreeTabs();
            const before = await getActiveViewType();
            expect(before).toBe('graph');

            await browser.keys(['g']);
            await browser.pause(PAUSE.KEY_GAP);
            await browser.keys(['t']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const after = await getActiveViewType();
            expect(after).toBe('markdown');
            const filePath = await getActiveFilePath();
            expect(filePath).toBe('Welcome.md');
        });

        it('1gt should go to first tab', async function () {
            await loadThreeTabs();
            const before = await getActiveViewType();
            expect(before).toBe('graph');

            await browser.keys(['1']);
            await browser.pause(PAUSE.KEY_GAP);
            await browser.keys(['g']);
            await browser.pause(PAUSE.KEY_GAP);
            await browser.keys(['t']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const filePath = await getActiveFilePath();
            expect(filePath).toBe('Welcome.md');
        });

        it('2gt should go to second tab', async function () {
            await loadThreeTabs();
            const before = await getActiveViewType();
            expect(before).toBe('graph');

            await browser.keys(['2']);
            await browser.pause(PAUSE.KEY_GAP);
            await browser.keys(['g']);
            await browser.pause(PAUSE.KEY_GAP);
            await browser.keys(['t']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const filePath = await getActiveFilePath();
            expect(filePath).toBe('Note-A.md');
        });

        it('3gt should go to third tab', async function () {
            await loadThreeTabs();

            await browser.keys(['3']);
            await browser.pause(PAUSE.KEY_GAP);
            await browser.keys(['g']);
            await browser.pause(PAUSE.KEY_GAP);
            await browser.keys(['t']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const after = await getActiveViewType();
            expect(after).toBe('graph');
        });

        it('count exceeding tab count should not change tab', async function () {
            await loadThreeTabs();
            const before = await getActiveViewType();
            expect(before).toBe('graph');

            await browser.keys(['9']);
            await browser.pause(PAUSE.KEY_GAP);
            await browser.keys(['g']);
            await browser.pause(PAUSE.KEY_GAP);
            await browser.keys(['t']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const after = await getActiveViewType();
            expect(after).toBe('graph');
        });
    });

    describe('Sequence timeout', function () {
        it('g followed by delay then t should still trigger gt (partial match keeps sequence alive)', async function () {
            await loadTwoTabs();
            const before = await getActiveViewType();
            expect(before).toBe('graph');

            await browser.keys(['g']);
            await browser.pause(1500);
            await browser.keys(['t']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const after = await getActiveViewType();
            expect(after).toBe('markdown');
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

    describe('Scroll in bases view', function () {
        before(async function () {
            await browser.executeObsidian(async ({ app }) => {
                const exists = await app.vault.adapter.exists('TestBase.base');
                if (!exists) {
                    await app.vault.adapter.write('TestBase.base', '{}');
                }
            });
            await browser.pause(PAUSE.OBSIDIAN_LOAD);
        });

        after(async function () {
            await browser.executeObsidian(async ({ app }) => {
                const exists = await app.vault.adapter.exists('TestBase.base');
                if (exists) {
                    await app.vault.adapter.remove('TestBase.base');
                }
            });
        });

        it('H from bases view should switch to previous tab', async function () {
            await obsidianPage.loadWorkspaceLayout({
                main: {
                    id: 'bases-root',
                    type: 'split',
                    children: [
                        {
                            id: 'bases-tab-group',
                            type: 'tabs',
                            children: [
                                {
                                    id: 'bases-md-leaf',
                                    type: 'leaf',
                                    state: {
                                        type: 'markdown',
                                        state: {
                                            file: 'Welcome.md',
                                            mode: 'source',
                                        },
                                    },
                                },
                                {
                                    id: 'bases-leaf',
                                    type: 'leaf',
                                    state: {
                                        type: 'bases',
                                        state: { file: 'TestBase.base' },
                                    },
                                },
                            ],
                        },
                    ],
                    direction: 'vertical',
                },
                active: 'bases-leaf',
                lastOpenFiles: [],
            });
            await browser.pause(PAUSE.OBSIDIAN_LOAD);

            const before = await getActiveViewType();
            expect(before).toBe('bases');

            await browser.keys(['H']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const after = await getActiveViewType();
            expect(after).toBe('markdown');
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
