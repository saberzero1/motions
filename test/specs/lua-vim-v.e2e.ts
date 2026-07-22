import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    loadLuaConfig,
    setupEditor,
    focusEditor,
    sendVimEscape,
    getPluginSetting,
    vimKeys,
    PAUSE,
} from '../helpers';

describe('vim.v in keymap callbacks', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(50);
    });

    it('vim.v.count is 0 when no count given', async function () {
        await loadLuaConfig(
            'vim.g.mapleader = "\\\\"\n' +
                'vim.keymap.set("n", "<leader>t", function()\n' +
                '    vim.cmd("set scrolloff=" .. tostring(vim.v.count))\n' +
                'end)\n',
        );
        await focusEditor();
        await browser.keys(['\\']);
        await browser.pause(PAUSE.KEY_GAP);
        await browser.keys(['t']);
        await browser.pause(PAUSE.EDITOR_SETTLE);
        expect(await getPluginSetting('scrolloffLines')).toBe(0);
    });

    it('vim.v.count reflects typed count', async function () {
        await loadLuaConfig(
            'vim.g.mapleader = "\\\\"\n' +
                'vim.keymap.set("n", "<leader>t", function()\n' +
                '    vim.cmd("set scrolloff=" .. tostring(vim.v.count))\n' +
                'end)\n',
        );
        await focusEditor();
        await browser.keys(['5']);
        await browser.pause(PAUSE.KEY_GAP);
        await browser.keys(['\\']);
        await browser.pause(PAUSE.KEY_GAP);
        await browser.keys(['t']);
        await browser.pause(PAUSE.EDITOR_SETTLE);
        expect(await getPluginSetting('scrolloffLines')).toBe(5);
    });

    it('vim.v.count1 defaults to 1 when no count given', async function () {
        await loadLuaConfig(
            'vim.g.mapleader = "\\\\"\n' +
                'vim.keymap.set("n", "<leader>t", function()\n' +
                '    vim.cmd("set scrolloff=" .. tostring(vim.v.count1))\n' +
                'end)\n',
        );
        await focusEditor();
        await browser.keys(['\\']);
        await browser.pause(PAUSE.KEY_GAP);
        await browser.keys(['t']);
        await browser.pause(PAUSE.EDITOR_SETTLE);
        expect(await getPluginSetting('scrolloffLines')).toBe(1);
    });

    it('vim.v.count1 reflects typed count', async function () {
        await loadLuaConfig(
            'vim.g.mapleader = "\\\\"\n' +
                'vim.keymap.set("n", "<leader>t", function()\n' +
                '    vim.cmd("set scrolloff=" .. tostring(vim.v.count1))\n' +
                'end)\n',
        );
        await focusEditor();
        await browser.keys(['3']);
        await browser.pause(PAUSE.KEY_GAP);
        await browser.keys(['\\']);
        await browser.pause(PAUSE.KEY_GAP);
        await browser.keys(['t']);
        await browser.pause(PAUSE.EDITOR_SETTLE);
        expect(await getPluginSetting('scrolloffLines')).toBe(3);
    });
});

describe('vim.v.event in autocmd callbacks', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(50);
    });

    it('vim.v.event is populated during InsertEnter autocmd', async function () {
        await loadLuaConfig(
            'vim.api.nvim_create_autocmd("InsertEnter", {\n' +
                '    callback = function()\n' +
                '        if vim.v.event ~= nil then\n' +
                '            vim.cmd("set scrolloff=77")\n' +
                '        else\n' +
                '            vim.cmd("set scrolloff=88")\n' +
                '        end\n' +
                '    end\n' +
                '})\n',
        );
        await setupEditor('hello world', { line: 0, ch: 0 });
        await vimKeys('i');
        await browser.pause(PAUSE.EDITOR_SETTLE);
        expect(await getPluginSetting('scrolloffLines')).toBe(77);
    });

    it('vim.v.event contains event field matching the autocmd event', async function () {
        await loadLuaConfig(
            'vim.api.nvim_create_autocmd("InsertLeave", {\n' +
                '    callback = function()\n' +
                '        if vim.v.event and vim.v.event.event == "InsertLeave" then\n' +
                '            vim.cmd("set scrolloff=66")\n' +
                '        else\n' +
                '            vim.cmd("set scrolloff=99")\n' +
                '        end\n' +
                '    end\n' +
                '})\n',
        );
        await setupEditor('hello world', { line: 0, ch: 0 });
        await vimKeys('i');
        await browser.pause(PAUSE.MODE_SWITCH);
        await sendVimEscape();
        await browser.pause(PAUSE.EDITOR_SETTLE);
        expect(await getPluginSetting('scrolloffLines')).toBe(66);
    });
});

describe('vim.v.hlsearch', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(50);
    });

    it('vim.v.hlsearch is 1 after a search', async function () {
        await loadLuaConfig(
            'vim.g.mapleader = "\\\\"\n' +
                'vim.keymap.set("n", "<leader>h", function()\n' +
                '    vim.cmd("set scrolloff=" .. tostring(vim.v.hlsearch))\n' +
                'end)\n',
        );
        await setupEditor('hello world hello', { line: 0, ch: 0 });
        await vimKeys('/');
        await browser.keys(['h', 'e', 'l', 'l', 'o']);
        await browser.keys(['Enter']);
        await browser.pause(PAUSE.EDITOR_SETTLE);
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);
        await browser.keys(['\\']);
        await browser.pause(PAUSE.KEY_GAP);
        await browser.keys(['h']);
        await browser.pause(PAUSE.EDITOR_SETTLE);
        expect(await getPluginSetting('scrolloffLines')).toBe(1);
    });

    it('vim.v.hlsearch is 0 after nohlsearch', async function () {
        await loadLuaConfig(
            'vim.g.mapleader = "\\\\"\n' +
                'vim.keymap.set("n", "<leader>h", function()\n' +
                '    vim.cmd("set scrolloff=" .. tostring(vim.v.hlsearch))\n' +
                'end)\n',
        );
        await setupEditor('hello world hello', { line: 0, ch: 0 });
        await vimKeys('/');
        await browser.keys(['h', 'e', 'l', 'l', 'o']);
        await browser.keys(['Enter']);
        await browser.pause(PAUSE.EDITOR_SETTLE);
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);
        await browser.executeObsidian(({ app, obsidian }) => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            handleEx: (cm: unknown, input: string) => void;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return;
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            const adapter = cm?.cm;
            if (!adapter) return;
            Vim.handleEx(adapter, 'nohlsearch');
        });
        await browser.pause(PAUSE.EDITOR_SETTLE);
        await browser.keys(['\\']);
        await browser.pause(PAUSE.KEY_GAP);
        await browser.keys(['h']);
        await browser.pause(PAUSE.EDITOR_SETTLE);
        expect(await getPluginSetting('scrolloffLines')).toBe(0);
    });
});
