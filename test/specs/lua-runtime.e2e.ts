import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    loadLuaConfig,
    focusEditor,
    setupEditor,
    vimKeys,
    sendVimEscape,
    getCursorPos,
    getPluginSetting,
    PAUSE,
} from '../helpers';

describe('Lua runtime vim.cmd() execution', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    it('function callback keymap executes vim.cmd()', async function () {
        await loadLuaConfig(
            'vim.g.mapleader = "\\\\"\n' +
                'vim.keymap.set("n", "<leader>x", function() vim.cmd("set scrolloff=42") end)\n',
        );
        await focusEditor();
        await browser.keys(['\\']);
        await browser.pause(PAUSE.MODE_SWITCH);
        await browser.keys(['x']);
        await browser.pause(PAUSE.EDITOR_SETTLE);
        expect(await getPluginSetting('scrolloffLines')).toBe(42);
    });

    it('autocmd callback executes vim.cmd()', async function () {
        await loadLuaConfig(
            'vim.api.nvim_create_autocmd("ModeChanged", {\n' +
                '    pattern = "*:i",\n' +
                '    callback = function()\n' +
                '        vim.cmd("set scrolloff=43")\n' +
                '    end\n' +
                '})\n',
        );
        await focusEditor();
        await browser.keys(['i']);
        await browser.pause(PAUSE.MODE_SWITCH);
        await sendVimEscape();
        await browser.waitUntil(
            async () => (await getPluginSetting('scrolloffLines')) === 43,
            { timeout: 5000, interval: 200 },
        );
    });

    it('timer callback executes vim.cmd()', async function () {
        await loadLuaConfig(
            'vim.defer_fn(function() vim.cmd("set scrolloff=44") end, 50)\n',
        );
        await browser.waitUntil(
            async () => (await getPluginSetting('scrolloffLines')) === 44,
            { timeout: 2000, interval: 200 },
        );
    });

    it('user command callback executes vim.cmd()', async function () {
        await loadLuaConfig(
            'vim.api.nvim_create_user_command("TestCmd", function() vim.cmd("set scrolloff=45") end, {})\n',
        );
        await focusEditor();
        await vimKeys(':');
        await browser.keys(['T', 'e', 's', 't', 'C', 'm', 'd']);
        await browser.pause(PAUSE.KEY_GAP);
        await browser.keys(['Enter']);
        await browser.pause(PAUSE.EDITOR_SETTLE);
        expect(await getPluginSetting('scrolloffLines')).toBe(45);
    });

    it('nested vim.cmd() (user command calling user command)', async function () {
        await loadLuaConfig(
            'vim.api.nvim_create_user_command("Inner", function() vim.cmd("set scrolloff=46") end, {})\n' +
                'vim.api.nvim_create_user_command("Outer", function() vim.cmd("Inner") end, {})\n',
        );
        await focusEditor();
        await vimKeys(':');
        await browser.keys(['O', 'u', 't', 'e', 'r']);
        await browser.pause(PAUSE.KEY_GAP);
        await browser.keys(['Enter']);
        await browser.pause(PAUSE.EDITOR_SETTLE);
        expect(await getPluginSetting('scrolloffLines')).toBe(46);
    });

    it('vim.schedule() callback executes vim.cmd()', async function () {
        await loadLuaConfig(
            'vim.schedule(function() vim.cmd("set scrolloff=47") end)\n',
        );
        await browser.waitUntil(
            async () => (await getPluginSetting('scrolloffLines')) === 47,
            { timeout: 2000, interval: 200 },
        );
    });

    it('load-time vim.cmd() still works (regression)', async function () {
        await loadLuaConfig('vim.cmd("set scrolloff=48")\n');
        expect(await getPluginSetting('scrolloffLines')).toBe(48);
    });

    // Default leader is backslash; keymap registered before mapleader override binds to default
    it('leader key set after keymap uses default leader (ordering)', async function () {
        await loadLuaConfig(
            'vim.keymap.set("n", "<leader>q", function() vim.cmd("set scrolloff=70") end)\n' +
                'vim.g.mapleader = ","\n',
        );
        await focusEditor();
        await browser.keys(['\\']);
        await browser.pause(PAUSE.MODE_SWITCH);
        await browser.keys(['q']);
        await browser.pause(PAUSE.EDITOR_SETTLE);
        expect(await getPluginSetting('scrolloffLines')).toBe(70);
    });
});
