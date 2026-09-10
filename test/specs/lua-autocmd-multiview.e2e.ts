/**
 * Autocmd events in multi-view (split) scenarios.
 *
 * Investigates whether BufEnter/LeafEnter/InsertEnter autocmd events fire
 * correctly when multiple editor views (splits) are open.
 *
 * Issue: User reports that autocmd callbacks (e.g., auto-insert on BufEnter)
 * only work in the "main" editor, not in secondary split panes.
 *
 * Hypothesis: The AutocmdManager binds to a single `currentAdapter` and
 * events like LeafEnter fire globally but Lua API functions (vim.obsidian.mode,
 * vim.cmd) only operate on the active view. When a new leaf becomes active,
 * the adapter binding and Lua context may not have fully settled.
 */

import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

import {
    loadLuaConfig,
    PAUSE,
    sendVimEscape,
    getPluginSetting,
    setPluginSetting,
} from '../helpers';

async function loadSplitWorkspace(): Promise<void> {
    await obsidianPage.loadWorkspaceLayout({
        main: {
            id: 'split-root',
            type: 'split',
            direction: 'vertical',
            children: [
                {
                    id: 'left-tabs',
                    type: 'tabs',
                    children: [
                        {
                            id: 'left-leaf',
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
                            id: 'right-leaf',
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
        },
        active: 'left-leaf',
        lastOpenFiles: [],
    });
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

async function focusLeaf(leafId: string): Promise<boolean> {
    return (await browser.executeObsidian(({ app }, id: string) => {
        let targetLeaf: unknown = null;
        app.workspace.iterateAllLeaves((leaf: unknown) => {
            const l = leaf as { id?: string };
            if (l.id === id) targetLeaf = leaf;
        });
        if (!targetLeaf) return false;
        app.workspace.setActiveLeaf(
            targetLeaf as Parameters<typeof app.workspace.setActiveLeaf>[0],
            { focus: true },
        );
        return true;
    }, leafId)) as boolean;
}

describe('Autocmd events in multi-view scenarios', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);
    });

    describe('LeafEnter event across views', function () {
        it('should fire LeafEnter when switching to the initially active leaf', async function () {
            await loadLuaConfig(
                'vim.api.nvim_create_autocmd("LeafEnter", {\n' +
                    '    callback = function(ev)\n' +
                    '        -- Set scrolloff to 42 when LeafEnter fires\n' +
                    '        vim.cmd("set scrolloff=42")\n' +
                    '    end\n' +
                    '})\n',
            );
            await setPluginSetting('scrolloffLines', 0);

            await loadSplitWorkspace();
            await focusLeaf('left-leaf');
            await browser.pause(PAUSE.EDITOR_SETTLE);

            await focusLeaf('right-leaf');
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const scrolloff = await getPluginSetting('scrolloffLines');
            expect(scrolloff).toBe(42);
        });
    });

    describe('Auto-insert pattern (user reported issue)', function () {
        it('should auto-enter insert mode when switching to the left leaf', async function () {
            await loadLuaConfig(
                'local group = vim.api.nvim_create_augroup("test-auto-insert", {\n' +
                    '    clear = true,\n' +
                    '})\n' +
                    '\n' +
                    'local function auto_insert(ev)\n' +
                    '    if ev.data and ev.data.type and ev.data.type ~= "markdown" then\n' +
                    '        return\n' +
                    '    end\n' +
                    '    vim.schedule(function()\n' +
                    '        if vim.obsidian.mode() == "i" then\n' +
                    '            return\n' +
                    '        end\n' +
                    '        vim.cmd("startinsert")\n' +
                    '    end)\n' +
                    'end\n' +
                    '\n' +
                    'vim.api.nvim_create_autocmd("LeafEnter", {\n' +
                    '    group = group,\n' +
                    '    callback = auto_insert,\n' +
                    '})\n',
            );

            await loadSplitWorkspace();
            await focusLeaf('left-leaf');
            await browser.pause(PAUSE.EDITOR_SETTLE);
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);

            await focusLeaf('right-leaf');
            await browser.pause(PAUSE.EDITOR_SETTLE * 2);

            const mode = await browser.executeObsidian(({ app }) => {
                let targetLeaf: unknown = null;
                app.workspace.iterateAllLeaves((leaf: unknown) => {
                    const l = leaf as { id?: string };
                    if (l.id === 'right-leaf') targetLeaf = leaf;
                });
                if (!targetLeaf) return 'not-found';
                const view = (targetLeaf as { view?: unknown }).view;
                if (!view) return 'no-view';
                const editor = (view as { editor?: unknown }).editor;
                if (!editor) return 'no-editor';
                const editorView = (editor as { cm?: unknown }).cm as
                    Record<string, unknown> | undefined;
                if (!editorView) return 'no-cm';
                const adapter = editorView.cm as
                    Record<string, unknown> | undefined;
                if (!adapter) return 'no-adapter';
                const vim = (
                    adapter.state as Record<string, unknown> | undefined
                )?.vim as Record<string, unknown> | undefined;
                if (!vim) return 'no-vim-state';
                if (vim.insertMode) return 'insert';
                if (vim.visualMode) return 'visual';
                return 'normal';
            });

            console.log(`Right leaf mode after LeafEnter auto-insert: ${mode}`);
            expect(mode).toBe('insert');
        });
    });

    describe('BufEnter with different files in splits', function () {
        it('should fire BufEnter when switching to a split with a different file', async function () {
            await loadLuaConfig(
                'vim.api.nvim_create_autocmd("BufEnter", {\n' +
                    '    pattern = "*.md",\n' +
                    '    callback = function(ev)\n' +
                    '        vim.cmd("set scrolloff=88")\n' +
                    '    end\n' +
                    '})\n',
            );

            await obsidianPage.loadWorkspaceLayout({
                main: {
                    id: 'split-root',
                    type: 'split',
                    direction: 'vertical',
                    children: [
                        {
                            id: 'left-tabs',
                            type: 'tabs',
                            children: [
                                {
                                    id: 'left-leaf',
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
                                    id: 'right-leaf',
                                    type: 'leaf',
                                    state: {
                                        type: 'markdown',
                                        state: {
                                            file: 'Target.md',
                                            mode: 'source',
                                        },
                                    },
                                },
                            ],
                        },
                    ],
                },
                active: 'left-leaf',
                lastOpenFiles: [],
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);
            await setPluginSetting('scrolloffLines', 0);

            await focusLeaf('right-leaf');
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const scrolloff = await getPluginSetting('scrolloffLines');
            console.log(
                `BufEnter on different-file split switch: scrolloff=${scrolloff}`,
            );
            expect(scrolloff).toBe(88);
        });
    });

    describe('Auto-insert on BufEnter (user original pattern)', function () {
        it('should auto-insert when BufEnter fires on split with different file', async function () {
            await loadLuaConfig(
                'local group = vim.api.nvim_create_augroup("test-auto-insert-buf", {\n' +
                    '    clear = true,\n' +
                    '})\n' +
                    '\n' +
                    'vim.api.nvim_create_autocmd("BufEnter", {\n' +
                    '    group = group,\n' +
                    '    pattern = "*.md",\n' +
                    '    callback = function(ev)\n' +
                    '        vim.schedule(function()\n' +
                    '            if vim.obsidian.mode() == "i" then\n' +
                    '                return\n' +
                    '            end\n' +
                    '            vim.cmd("startinsert")\n' +
                    '        end)\n' +
                    '    end,\n' +
                    '})\n',
            );

            await obsidianPage.loadWorkspaceLayout({
                main: {
                    id: 'split-root',
                    type: 'split',
                    direction: 'vertical',
                    children: [
                        {
                            id: 'left-tabs',
                            type: 'tabs',
                            children: [
                                {
                                    id: 'left-leaf',
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
                                    id: 'right-leaf',
                                    type: 'leaf',
                                    state: {
                                        type: 'markdown',
                                        state: {
                                            file: 'Target.md',
                                            mode: 'source',
                                        },
                                    },
                                },
                            ],
                        },
                    ],
                },
                active: 'left-leaf',
                lastOpenFiles: [],
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);

            await focusLeaf('right-leaf');
            await browser.pause(PAUSE.EDITOR_SETTLE * 2);

            const mode = await browser.executeObsidian(({ app }) => {
                let targetLeaf: unknown = null;
                app.workspace.iterateAllLeaves((leaf: unknown) => {
                    const l = leaf as { id?: string };
                    if (l.id === 'right-leaf') targetLeaf = leaf;
                });
                if (!targetLeaf) return 'not-found';
                const view = (targetLeaf as { view?: unknown }).view;
                if (!view) return 'no-view';
                const editor = (view as { editor?: unknown }).editor;
                if (!editor) return 'no-editor';
                const editorView = (editor as { cm?: unknown }).cm as
                    Record<string, unknown> | undefined;
                if (!editorView) return 'no-cm';
                const adapter = editorView.cm as
                    Record<string, unknown> | undefined;
                if (!adapter) return 'no-adapter';
                const vim = (
                    adapter.state as Record<string, unknown> | undefined
                )?.vim as Record<string, unknown> | undefined;
                if (!vim) return 'no-vim-state';
                if (vim.insertMode) return 'insert';
                if (vim.visualMode) return 'visual';
                return 'normal';
            });

            console.log(
                `Right leaf mode after BufEnter auto-insert (different file): ${mode}`,
            );
            expect(mode).toBe('insert');
        });
    });
});
