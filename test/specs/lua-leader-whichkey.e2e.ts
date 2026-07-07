import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    loadLuaConfig,
    focusEditor,
    sendVimEscape,
    setWhichKeyMode,
    hasWhichKeyOverlay,
    waitForWhichKey,
    getWhichKeyKeys,
    getWhichKeyGroups,
    getLeaderBindings,
    getPluginSetting,
    PAUSE,
} from '../helpers';

describe('Leader binding + which-key integration', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await sendVimEscape();
    });

    it('vim.keymap.set with leader prefix appears in LeaderRegistry', async function () {
        await loadLuaConfig(
            'vim.g.mapleader = ","\n' +
                'vim.keymap.set("n", "<leader>f", ":ob switcher:open<CR>", { desc = "Find" })\n',
        );
        const bindings = await getLeaderBindings();
        const keys = bindings.map((b) => b.key);
        expect(keys).toContain('f');
    });

    it('vim.keymap.set with function callback and desc appears in LeaderRegistry', async function () {
        await loadLuaConfig(
            'vim.g.mapleader = ","\n' +
                'vim.keymap.set("n", "<leader>g", function() vim.cmd("set scrolloff=50") end, { desc = "Test cmd" })\n',
        );
        const bindings = await getLeaderBindings();
        const keys = bindings.map((b) => b.key);
        expect(keys).toContain('g');
    });

    it('vim.keymap.set leader binding appears in which-key overlay', async function () {
        await loadLuaConfig(
            'vim.g.mapleader = ","\n' +
                'vim.opt.whichkey = "leader"\n' +
                'vim.keymap.set("n", "<leader>f", ":ob switcher:open<CR>", { desc = "Find" })\n',
        );
        await focusEditor();
        await browser.keys([',']);
        await waitForWhichKey();
        expect(await hasWhichKeyOverlay()).toBe(true);
        const keys = await getWhichKeyKeys();
        expect(keys).toContain('f');
        await sendVimEscape();
    });

    it('wk.add() group labels display with vim.keymap.set bindings', async function () {
        await loadLuaConfig(
            'vim.g.mapleader = ","\n' +
                'vim.opt.whichkey = "leader"\n' +
                'vim.opt.whichkeygrouping = "grouped"\n' +
                'local wk = vim.obsidian.whichkey\n' +
                'wk.add({\n' +
                '    { "<leader>f", group = "Find" },\n' +
                '})\n' +
                'vim.keymap.set("n", "<leader>ff", ":ob switcher:open<CR>", { desc = "Files" })\n' +
                'vim.keymap.set("n", "<leader>fg", ":ob global-search:open<CR>", { desc = "Grep" })\n',
        );
        await focusEditor();
        await browser.keys([',']);
        await waitForWhichKey();
        const groups = await getWhichKeyGroups();
        expect(groups).toContain('f');
        await sendVimEscape();
    });

    it('buffer-local keymaps excluded from global LeaderRegistry', async function () {
        await loadLuaConfig(
            'vim.g.mapleader = ","\n' +
                'vim.api.nvim_create_autocmd("BufEnter", {\n' +
                '    callback = function()\n' +
                '        vim.keymap.set("n", "<leader>bl", function() vim.cmd("set scrolloff=30") end, { buffer = 0, desc = "Buffer local" })\n' +
                '    end,\n' +
                '})\n',
        );
        const bindings = await getLeaderBindings();
        const keys = bindings.map((b) => b.key);
        expect(keys).not.toContain('bl');
    });

    it('vim.obsidian.leader.add still works (regression)', async function () {
        await loadLuaConfig(
            'vim.g.mapleader = ","\n' +
                'vim.obsidian.leader.add({\n' +
                '    { "z", "app:reload", desc = "Reload" },\n' +
                '})\n',
        );
        const bindings = await getLeaderBindings();
        const keys = bindings.map((b) => b.key);
        expect(keys).toContain('z');
    });

    it('mixed vim.keymap.set and vim.obsidian.leader.add', async function () {
        await loadLuaConfig(
            'vim.g.mapleader = ","\n' +
                'vim.opt.whichkey = "leader"\n' +
                'vim.obsidian.leader.add({\n' +
                '    { "a", "app:reload", desc = "Reload app" },\n' +
                '})\n' +
                'vim.keymap.set("n", "<leader>b", ":ob switcher:open<CR>", { desc = "Browse" })\n',
        );
        await focusEditor();
        await browser.keys([',']);
        await waitForWhichKey();
        const keys = await getWhichKeyKeys();
        expect(keys).toContain('a');
        expect(keys).toContain('b');
        await sendVimEscape();
    });

    it('visual-mode leader bindings excluded from which-key', async function () {
        await loadLuaConfig(
            'vim.g.mapleader = ","\n' +
                'vim.keymap.set("v", "<leader>y", \'"+y\', { desc = "Yank clipboard" })\n',
        );
        const bindings = await getLeaderBindings();
        const keys = bindings.map((b) => b.key);
        expect(keys).not.toContain('y');
    });

    it('vim.keymap.set without desc still appears in LeaderRegistry', async function () {
        await loadLuaConfig(
            'vim.g.mapleader = ","\n' +
                'vim.keymap.set("n", "<leader>n", function() vim.cmd("set scrolloff=71") end)\n',
        );
        const bindings = await getLeaderBindings();
        const keys = bindings.map((b) => b.key);
        expect(keys).toContain('n');
    });
});
