import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    loadLuaConfig,
    focusEditor,
    setupEditor,
    sendVimEscape,
    vimKeys,
    getCursorPos,
    hasWhichKeyOverlay,
    waitForWhichKey,
    getWhichKeyKeys,
    getWhichKeyDescriptions,
    getWhichKeyGroups,
    getPluginSetting,
    PAUSE,
} from '../helpers';

describe('Space as leader key', function () {
    afterEach(async function () {
        await sendVimEscape();
    });

    it('space does not move cursor when set as leader', async function () {
        await loadLuaConfig(
            [
                'vim.g.mapleader = " "',
                'vim.keymap.set("n", "<leader>z", function() vim.cmd("set scrolloff=99") end, { desc = "Noop" })',
            ].join('\n'),
        );
        await setupEditor('hello world', { line: 0, ch: 0 });
        await browser.keys([' ']);
        await browser.pause(50);
        const pos = await getCursorPos();
        expect(pos.ch).toBe(0);
        await sendVimEscape();
    });

    it('which-key shows after space press', async function () {
        await loadLuaConfig(
            [
                'vim.g.mapleader = " "',
                'vim.opt.whichkey = "all"',
                'vim.obsidian.leader.add({',
                '  { "f", "switcher:open", desc = "Find" },',
                '})',
            ].join('\n'),
        );
        await focusEditor();
        await browser.keys([' ']);
        await waitForWhichKey();
        const visible = await hasWhichKeyOverlay();
        expect(visible).toBe(true);
        await sendVimEscape();
    });

    it('space + key executes mapped command', async function () {
        await loadLuaConfig(
            [
                'vim.g.mapleader = " "',
                'vim.keymap.set("n", "<leader>w", function() vim.cmd("set scrolloff=55") end, { desc = "Save" })',
            ].join('\n'),
        );
        await focusEditor();
        await browser.keys([' ']);
        await browser.pause(PAUSE.KEY_GAP);
        await browser.keys(['w']);
        await browser.pause(PAUSE.EDITOR_SETTLE);
        const scrolloff = await getPluginSetting('scrolloffLines');
        expect(scrolloff).toBe(55);
    });

    it('space leader with grouped which-key', async function () {
        await loadLuaConfig(
            [
                'vim.g.mapleader = " "',
                'vim.opt.whichkey = "all"',
                'vim.opt.whichkeygrouping = "grouped"',
                'local wk = vim.obsidian.whichkey',
                'wk.add({',
                '  { "<leader>f", group = "Find" },',
                '  { "<leader>g", group = "Git" },',
                '})',
                'vim.obsidian.leader.add({',
                '  { "ff", "switcher:open", desc = "Find files" },',
                '  { "fw", "global-search:open", desc = "Find word" },',
                '})',
            ].join('\n'),
        );
        await focusEditor();
        await browser.keys([' ']);
        await waitForWhichKey();
        const groups = await getWhichKeyGroups();
        expect(groups).toContain('f');
        await sendVimEscape();
    });

    it('comma as leader still works (regression)', async function () {
        await loadLuaConfig(
            [
                'vim.g.mapleader = ","',
                'vim.keymap.set("n", "<leader>x", function() vim.cmd("set scrolloff=56") end)',
            ].join('\n'),
        );
        await focusEditor();
        await browser.keys([',']);
        await browser.pause(PAUSE.KEY_GAP);
        await browser.keys(['x']);
        await browser.pause(PAUSE.EDITOR_SETTLE);
        const scrolloff = await getPluginSetting('scrolloffLines');
        expect(scrolloff).toBe(56);
    });

    it('default backslash leader still works (regression)', async function () {
        await loadLuaConfig(
            [
                'vim.keymap.set("n", "<leader>x", function() vim.cmd("set scrolloff=57") end)',
            ].join('\n'),
        );
        await focusEditor();
        await browser.keys(['\\']);
        await browser.pause(PAUSE.KEY_GAP);
        await browser.keys(['x']);
        await browser.pause(PAUSE.EDITOR_SETTLE);
        const scrolloff = await getPluginSetting('scrolloffLines');
        expect(scrolloff).toBe(57);
    });

    it('space in insert mode does NOT trigger which-key', async function () {
        await loadLuaConfig(
            [
                'vim.g.mapleader = " "',
                'vim.opt.whichkey = "leader"',
                'vim.obsidian.leader.add({',
                '  { "f", "switcher:open", desc = "Find" },',
                '})',
            ].join('\n'),
        );
        await focusEditor();
        await browser.keys(['i']);
        await browser.pause(PAUSE.MODE_SWITCH);
        await browser.keys([' ']);
        await browser.pause(600);
        const visible = await hasWhichKeyOverlay();
        expect(visible).toBe(false);
        await sendVimEscape();
    });

    it('which-key shows desc for string command (not raw rhs)', async function () {
        await loadLuaConfig(
            [
                'vim.g.mapleader = " "',
                'vim.opt.whichkey = "leader"',
                'vim.keymap.set("n", "<leader>e", ":ob file-explorer:reveal-active-file<CR>", { desc = "Reveal in explorer" })',
            ].join('\n'),
        );
        await focusEditor();
        await browser.keys([' ']);
        await waitForWhichKey();
        const descriptions = await getWhichKeyDescriptions();
        expect(descriptions).toContain('Reveal in explorer');
        await sendVimEscape();
    });

    it('which-key shows desc for function callback (not lua-action-N)', async function () {
        await loadLuaConfig(
            [
                'vim.g.mapleader = " "',
                'vim.opt.whichkey = "leader"',
                'vim.keymap.set("n", "<leader>z", function() vim.cmd("ob switcher:open") end, { desc = "Open Recent Files" })',
            ].join('\n'),
        );
        await focusEditor();
        await browser.keys([' ']);
        await waitForWhichKey();
        const descriptions = await getWhichKeyDescriptions();
        expect(descriptions).toContain('Open Recent Files');
        await sendVimEscape();
    });

    it('which-key shows desc in all mode with space leader', async function () {
        await loadLuaConfig(
            [
                'vim.g.mapleader = " "',
                'vim.opt.whichkey = "all"',
                'vim.keymap.set("n", "<leader>w", function() vim.cmd("set scrolloff=42") end, { desc = "Save" })',
                'vim.keymap.set("n", "<leader>q", ":ob app:quit<CR>", { desc = "Quit" })',
            ].join('\n'),
        );
        await focusEditor();
        await browser.keys([' ']);
        await waitForWhichKey();
        const descriptions = await getWhichKeyDescriptions();
        expect(descriptions).toContain('Save');
        expect(descriptions).toContain('Quit');
        await sendVimEscape();
    });

    it('which-key shows desc with vim.obsidian.leader.set', async function () {
        await loadLuaConfig(
            [
                'vim.g.mapleader = " "',
                'vim.opt.whichkey = "leader"',
                'vim.obsidian.leader.set("e", "file-explorer:reveal-active-file", { desc = "Explorer" })',
            ].join('\n'),
        );
        await focusEditor();
        await browser.keys([' ']);
        await waitForWhichKey();
        const descriptions = await getWhichKeyDescriptions();
        expect(descriptions).toContain('Explorer');
        await sendVimEscape();
    });
});
