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

async function handleKeyOnLeaf(leafId: string, key: string): Promise<boolean> {
    return (await browser.executeObsidian(
        ({ app }, id: string, k: string) => {
            let targetLeaf: unknown = null;
            app.workspace.iterateAllLeaves((leaf: unknown) => {
                const l = leaf as { id?: string };
                if (l.id === id) targetLeaf = leaf;
            });
            if (!targetLeaf) return false;

            const view = (targetLeaf as { view?: unknown }).view;
            if (!view) return false;
            const editor = (view as { editor?: unknown }).editor;
            if (!editor) return false;
            const editorView = (editor as { cm?: unknown }).cm as
                | Record<string, unknown>
                | undefined;
            if (!editorView) return false;

            const VimApi = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            handleKey: (cm: unknown, key: string) => boolean;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!VimApi) return false;

            return VimApi.handleKey(editorView.cm, k);
        },
        leafId,
        key,
    )) as boolean;
}

describe('Per-view autocmd mode events', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);
    });

    it('should fire InsertEnter exactly once in active leaf', async function () {
        await loadLuaConfig(
            'vim.g.__insert_count = 0\n' +
                'vim.api.nvim_create_autocmd("InsertEnter", {\n' +
                '    callback = function()\n' +
                '        vim.g.__insert_count = vim.g.__insert_count + 1\n' +
                '        vim.cmd("set scrolloff=" .. tostring(vim.g.__insert_count))\n' +
                '    end\n' +
                '})\n',
        );
        await setPluginSetting('scrolloffLines', 0);
        await loadSplitWorkspace();
        await focusLeaf('left-leaf');
        await browser.pause(PAUSE.EDITOR_SETTLE);
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);

        await browser.keys(['i']);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const scrolloff = await getPluginSetting('scrolloffLines');
        expect(scrolloff).toBe(1);
    });

    it('should fire InsertEnter when entering insert mode in a non-active split', async function () {
        await loadLuaConfig(
            'vim.g.__insert_count = 0\n' +
                'vim.api.nvim_create_autocmd("InsertEnter", {\n' +
                '    callback = function()\n' +
                '        vim.g.__insert_count = vim.g.__insert_count + 1\n' +
                '        vim.cmd("set scrolloff=" .. tostring(vim.g.__insert_count))\n' +
                '    end\n' +
                '})\n',
        );
        await setPluginSetting('scrolloffLines', 0);
        await loadSplitWorkspace();
        await focusLeaf('left-leaf');
        await browser.pause(PAUSE.EDITOR_SETTLE);
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);

        await handleKeyOnLeaf('right-leaf', 'i');
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const scrolloff = await getPluginSetting('scrolloffLines');
        expect(scrolloff).toBe(1);
    });

    it('should fire ModeChanged in non-active split with correct data', async function () {
        await loadLuaConfig(
            'vim.api.nvim_create_autocmd("ModeChanged", {\n' +
                '    pattern = "n:i",\n' +
                '    callback = function()\n' +
                '        vim.cmd("set scrolloff=66")\n' +
                '    end\n' +
                '})\n',
        );
        await setPluginSetting('scrolloffLines', 0);
        await loadSplitWorkspace();
        await focusLeaf('left-leaf');
        await browser.pause(PAUSE.EDITOR_SETTLE);
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);

        await handleKeyOnLeaf('right-leaf', 'i');
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const scrolloff = await getPluginSetting('scrolloffLines');
        expect(scrolloff).toBe(66);
    });

    it('should fire InsertLeave when leaving insert mode in non-active split', async function () {
        await loadLuaConfig(
            'vim.api.nvim_create_autocmd("InsertLeave", {\n' +
                '    callback = function()\n' +
                '        vim.cmd("set scrolloff=55")\n' +
                '    end\n' +
                '})\n',
        );
        await setPluginSetting('scrolloffLines', 0);
        await loadSplitWorkspace();
        await focusLeaf('left-leaf');
        await browser.pause(PAUSE.EDITOR_SETTLE);
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);

        await handleKeyOnLeaf('right-leaf', 'i');
        await browser.pause(PAUSE.MODE_SWITCH);
        await handleKeyOnLeaf('right-leaf', '<Esc>');
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const scrolloff = await getPluginSetting('scrolloffLines');
        expect(scrolloff).toBe(55);
    });
});
