import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    loadLuaConfig,
    setupEditor,
    vimKeys,
    getEditorValue,
    getCursorPos,
    sendVimEscape,
    PAUSE,
} from '../helpers';

describe('Lua expr mappings', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(50);
    });

    it('expr mapping returns keys that are executed', async function () {
        await loadLuaConfig(
            'vim.keymap.set("n", "K", function() return "dd" end, { expr = true })\n',
        );
        await setupEditor('line one\nline two\nline three', {
            line: 0,
            ch: 0,
        });
        await vimKeys('K');
        const content = await getEditorValue();
        expect(content).toBe('line two\nline three');
    });

    it('expr mapping with count uses vim.v.count', async function () {
        await loadLuaConfig(
            'vim.keymap.set("n", "K", function()\n' +
                '    if vim.v.count == 0 then return "gj"\n' +
                '    else return vim.v.count1 .. "j" end\n' +
                'end, { expr = true })\n',
        );
        await setupEditor(
            'line one\nline two\nline three\nline four\nline five',
            { line: 0, ch: 0 },
        );
        await vimKeys('K');
        const pos1 = await getCursorPos();
        expect(pos1.line).toBe(1);
        await browser.keys(['2']);
        await browser.pause(PAUSE.KEY_GAP);
        await browser.keys(['K']);
        await browser.pause(PAUSE.EDITOR_SETTLE);
        const pos2 = await getCursorPos();
        expect(pos2.line).toBe(3);
    });

    it('expr mapping returning nil does nothing', async function () {
        await loadLuaConfig(
            'vim.keymap.set("n", "K", function() return nil end, { expr = true })\n',
        );
        await setupEditor('hello world', { line: 0, ch: 0 });
        await vimKeys('K');
        expect(await getEditorValue()).toBe('hello world');
        const pos = await getCursorPos();
        expect(pos.line).toBe(0);
    });

    it('expr mapping returning empty string does nothing', async function () {
        await loadLuaConfig(
            'vim.keymap.set("n", "K", function() return "" end, { expr = true })\n',
        );
        await setupEditor('hello world', { line: 0, ch: 0 });
        await vimKeys('K');
        expect(await getEditorValue()).toBe('hello world');
    });

    it('expr mapping error does not crash', async function () {
        await loadLuaConfig(
            'vim.keymap.set("n", "K", function() error("boom") end, { expr = true })\n',
        );
        await setupEditor('hello world', { line: 0, ch: 0 });
        await vimKeys('K');
        expect(await getEditorValue()).toBe('hello world');
        await vimKeys('d', 'd');
        expect(await getEditorValue()).toBe('');
    });

    it('string expr mapping raises error', async function () {
        await loadLuaConfig(
            'vim.keymap.set("n", "K", "v:count == 0 ? \'gk\' : \'k\'", { expr = true })\n',
        );
        await setupEditor('hello world', { line: 0, ch: 0 });
        await vimKeys('d', 'd');
        expect(await getEditorValue()).toBe('');
    });

    it('expr mapping with special keys works', async function () {
        await loadLuaConfig(
            'vim.keymap.set("n", "K", function() return "ihi" end, { expr = true })\n',
        );
        await setupEditor('', { line: 0, ch: 0 });
        await vimKeys('K');
        await browser.pause(PAUSE.EDITOR_SETTLE);
        await sendVimEscape();
        const content = await getEditorValue();
        expect(content).toBe('hi');
    });
});
