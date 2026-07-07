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

describe('Lua documentation example validation', function () {
    it('smart go-to-top with vim.fn.line()', async function () {
        this.timeout(30000);
        await loadLuaConfig(
            'vim.g.mapleader = "\\\\"\n' +
                'vim.keymap.set("n", "<leader>h", function()\n' +
                '    if vim.fn.line(".") == 1 then\n' +
                '        vim.notify("Already at top!")\n' +
                '    else\n' +
                '        vim.cmd("normal! gg")\n' +
                '    end\n' +
                'end, { desc = "Smart go-to-top" })',
        );
        await setupEditor('line1\nline2\nline3', { line: 2, ch: 0 });
        await vimKeys('\\', 'h');
        const pos = await getCursorPos();
        expect(pos.line).toBe(0);
    });

    it('conditional keymap per filetype via vim.fn.expand()', async function () {
        this.timeout(30000);
        await loadLuaConfig(
            'vim.g.mapleader = "\\\\"\n' +
                'vim.keymap.set("n", "<leader>p", function()\n' +
                '    if vim.fn.expand("%:e") == "md" then\n' +
                '        vim.cmd("set scrolloff=60")\n' +
                '    end\n' +
                'end, { desc = "Toggle preview" })',
        );
        await focusEditor();
        await vimKeys('\\', 'p');
        await browser.pause(PAUSE.EDITOR_SETTLE);
        const scrolloff = await getPluginSetting('scrolloffLines');
        expect(scrolloff).toBe(60);
    });

    it('reload with vim.notify()', async function () {
        this.timeout(30000);
        await loadLuaConfig(
            'vim.g.mapleader = "\\\\"\n' +
                'vim.keymap.set("n", "<leader>r", function()\n' +
                '    vim.cmd("set scrolloff=61")\n' +
                '    vim.notify("Reloaded!")\n' +
                'end, { desc = "Reload" })',
        );
        await focusEditor();
        await vimKeys('\\', 'r');
        await browser.pause(PAUSE.EDITOR_SETTLE);
        const scrolloff = await getPluginSetting('scrolloffLines');
        expect(scrolloff).toBe(61);
    });

    it('function callback keymap (reveal in explorer pattern)', async function () {
        this.timeout(30000);
        await loadLuaConfig(
            'vim.g.mapleader = "\\\\"\n' +
                'vim.keymap.set("n", "<leader>e", function()\n' +
                '    vim.cmd("set scrolloff=62")\n' +
                'end, { desc = "Reveal in explorer" })',
        );
        await focusEditor();
        await vimKeys('\\', 'e');
        await browser.pause(PAUSE.EDITOR_SETTLE);
        const scrolloff = await getPluginSetting('scrolloffLines');
        expect(scrolloff).toBe(62);
    });

    it('buffer-local keymap via autocmd', async function () {
        this.timeout(30000);
        await loadLuaConfig(
            'vim.api.nvim_create_autocmd("ModeChanged", {\n' +
                '    pattern = "*:i",\n' +
                '    callback = function()\n' +
                '        vim.keymap.set("n", "gd", function()\n' +
                '            vim.cmd("set scrolloff=63")\n' +
                '        end, { buffer = 0, desc = "Follow link" })\n' +
                '    end,\n' +
                '})',
        );
        await focusEditor();
        await browser.keys(['i']);
        await browser.pause(PAUSE.MODE_SWITCH);
        await sendVimEscape();
        await browser.pause(PAUSE.EDITOR_SETTLE);
        await vimKeys('g', 'd');
        await browser.pause(PAUSE.EDITOR_SETTLE);
        const scrolloff = await getPluginSetting('scrolloffLines');
        expect(scrolloff).toBe(63);
    });

    it('user command with function callback', async function () {
        this.timeout(30000);
        await loadLuaConfig(
            'vim.api.nvim_create_user_command("TestToday", function()\n' +
                '    vim.cmd("set scrolloff=64")\n' +
                'end, {})',
        );
        await focusEditor();
        await vimKeys(':');
        await browser.keys(['T', 'e', 's', 't', 'T', 'o', 'd', 'a', 'y']);
        await browser.keys(['Enter']);
        await browser.pause(PAUSE.EDITOR_SETTLE);
        const scrolloff = await getPluginSetting('scrolloffLines');
        expect(scrolloff).toBe(64);
    });

    it('user command with args', async function () {
        this.timeout(30000);
        await loadLuaConfig(
            'vim.api.nvim_create_user_command("TestOpen", function(opts)\n' +
                '    vim.cmd("set scrolloff=65")\n' +
                'end, {})',
        );
        await focusEditor();
        await vimKeys(':');
        await browser.keys([
            'T',
            'e',
            's',
            't',
            'O',
            'p',
            'e',
            'n',
            ' ',
            's',
            'o',
            'm',
            'e',
            'a',
            'r',
            'g',
        ]);
        await browser.keys(['Enter']);
        await browser.pause(PAUSE.EDITOR_SETTLE);
        const scrolloff = await getPluginSetting('scrolloffLines');
        expect(scrolloff).toBe(65);
    });

    it('autocmd callback with vim.cmd() (auto-save pattern)', async function () {
        this.timeout(30000);
        await loadLuaConfig(
            'vim.api.nvim_create_autocmd("ModeChanged", {\n' +
                '    pattern = "*:i",\n' +
                '    callback = function()\n' +
                '        vim.cmd("set scrolloff=66")\n' +
                '    end,\n' +
                '})',
        );
        await focusEditor();
        await browser.keys(['i']);
        await sendVimEscape();
        await browser.waitUntil(
            async () => (await getPluginSetting('scrolloffLines')) === 66,
            { timeout: 5000, interval: 200 },
        );
        const scrolloff = await getPluginSetting('scrolloffLines');
        expect(scrolloff).toBe(66);
    });

    it('debounced timer pattern (autocmd + timer)', async function () {
        this.timeout(30000);
        await loadLuaConfig(
            'local timer = vim.uv.new_timer()\n' +
                'vim.api.nvim_create_autocmd("ModeChanged", {\n' +
                '    pattern = "*:i",\n' +
                '    callback = function()\n' +
                '        timer:stop()\n' +
                '        timer:start(50, 0, function()\n' +
                '            vim.cmd("set scrolloff=67")\n' +
                '        end)\n' +
                '    end,\n' +
                '})',
        );
        await focusEditor();
        await browser.keys(['i']);
        await browser.pause(PAUSE.MODE_SWITCH);
        await sendVimEscape();
        await browser.waitUntil(
            async () => (await getPluginSetting('scrolloffLines')) === 67,
            { timeout: 5000, interval: 200 },
        );
        const scrolloff = await getPluginSetting('scrolloffLines');
        expect(scrolloff).toBe(67);
    });

    it('user command + keymap chain', async function () {
        this.timeout(30000);
        await loadLuaConfig(
            'vim.g.mapleader = "\\\\"\n' +
                'vim.api.nvim_create_user_command("TestDark", function()\n' +
                '    vim.cmd("set scrolloff=68")\n' +
                'end, {})\n' +
                'vim.keymap.set("n", "<leader>d", ":TestDark<CR>", { desc = "Toggle dark mode" })',
        );
        await focusEditor();
        await vimKeys('\\', 'd');
        await browser.pause(PAUSE.EDITOR_SETTLE);
        const scrolloff = await getPluginSetting('scrolloffLines');
        expect(scrolloff).toBe(68);
    });
});
