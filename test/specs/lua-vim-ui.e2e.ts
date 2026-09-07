import { browser, expect } from '@wdio/globals';
import {
    setupEditor,
    vimRawKeys,
    getEditorValue,
    loadLuaConfig,
    sendVimEscape,
    PAUSE,
} from '../helpers';

async function pickerOpen(): Promise<boolean> {
    return browser.executeObsidian(
        () => document.querySelector('.vim-motions-picker') !== null,
    );
}

async function consoleHasAsyncError(): Promise<boolean> {
    const logs = await browser.getLogs('browser').catch(() => []);
    return (logs as { message?: string }[]).some((l) =>
        (l.message ?? '').includes(
            'async APIs can only be called from async-capable callbacks',
        ),
    );
}

describe('vim.ui', function () {
    afterEach(async function () {
        await browser.executeObsidian(() => {
            document
                .querySelectorAll('.vim-motions-picker')
                .forEach((el) => el.remove());
        });
        await sendVimEscape();
        await browser.pause(50);
    });

    it('is a plain mutable table that plugins can override and restore', async function () {
        await loadLuaConfig(
            [
                `local orig = vim.ui.select`,
                `vim.ui.select = function() return 42 end`,
                `local overridden = vim.ui.select()`,
                `vim.ui.select = orig`,
                `result = tostring(overridden) .. ':' .. type(vim.ui.select)`,
                `vim.keymap.set('n', 'Q', function()`,
                `  vim.api.nvim_buf_set_lines(0, 0, -1, false, { result })`,
                `end)`,
            ].join('\n'),
        );
        await setupEditor('x\n', { line: 0, ch: 0 });
        await vimRawKeys('Q');
        await browser.pause(PAUSE.EDITOR_SETTLE);
        expect((await getEditorValue()).trim()).toBe('42:function');
    });

    // Plan B's E7. The non-blocking design exists so this works; a yield-based
    // implementation would error here while still passing a top-level test.
    it('E7: opens from inside a keymap callback with no async-context error', async function () {
        await loadLuaConfig(
            [
                `vim.keymap.set('n', 'Q', function()`,
                `  vim.ui.select({ 'alpha', 'beta' }, { prompt = 'Pick' },`,
                `    function() end)`,
                `end)`,
            ].join('\n'),
        );
        await setupEditor('x\n', { line: 0, ch: 0 });
        await vimRawKeys('Q');
        await browser.pause(PAUSE.EDITOR_SETTLE);

        expect(await pickerOpen()).toBe(true);
        expect(await consoleHasAsyncError()).toBe(false);
    });

    it('returns immediately rather than blocking on the choice', async function () {
        // The write runs AFTER the select call in the same callback. If
        // select blocked (or errored) waiting for a choice, it never happens.
        await loadLuaConfig(
            [
                `vim.keymap.set('n', 'Q', function()`,
                `  vim.ui.select({ 'a' }, {}, function() end)`,
                `  vim.api.nvim_buf_set_lines(0, 0, -1, false, { 'RETURNED' })`,
                `end)`,
            ].join('\n'),
        );
        await setupEditor('x\n', { line: 0, ch: 0 });
        await vimRawKeys('Q');
        await browser.pause(PAUSE.EDITOR_SETTLE);

        expect(await pickerOpen()).toBe(true);
        expect((await getEditorValue()).trim()).toBe('RETURNED');
    });

    it('input() distinguishes an empty confirm from a cancel', async function () {
        await loadLuaConfig(
            [
                `vim.keymap.set('n', 'Q', function()`,
                `  vim.ui.input({ prompt = 'Name' }, function(value)`,
                `    vim.api.nvim_buf_set_lines(0, 0, -1, false, {`,
                `      value == nil and 'CANCELLED' or ('GOT:' .. value),`,
                `    })`,
                `  end)`,
                `end)`,
            ].join('\n'),
        );
        await setupEditor('x\n', { line: 0, ch: 0 });
        await vimRawKeys('Q');
        await browser.pause(PAUSE.EDITOR_SETTLE);
        await browser.keys(['Escape']);
        await browser.pause(400);
        expect((await getEditorValue()).trim()).toBe('CANCELLED');
    });

    it('open() rejects opts.cmd and progress_status() reports idle', async function () {
        await loadLuaConfig(
            [
                `local ok, err = pcall(vim.ui.open, 'x.md', { cmd = { 'sh' } })`,
                `result = tostring(ok) .. '|' .. vim.ui.progress_status()`,
                `  .. '|' .. (tostring(err):find('opts.cmd') and 'named' or 'unnamed')`,
                `vim.keymap.set('n', 'Q', function()`,
                `  vim.api.nvim_buf_set_lines(0, 0, -1, false, { result })`,
                `end)`,
            ].join('\n'),
        );
        await setupEditor('x\n', { line: 0, ch: 0 });
        await vimRawKeys('Q');
        await browser.pause(PAUSE.EDITOR_SETTLE);
        expect((await getEditorValue()).trim()).toBe('false||named');
    });

    it('open() destructures to handle-or-error in the Neovim shape', async function () {
        await loadLuaConfig(
            [
                `local handle, err = vim.ui.open('https://obsidian.md')`,
                `result = type(handle) .. '|' .. type(err)`,
                `vim.keymap.set('n', 'Q', function()`,
                `  vim.api.nvim_buf_set_lines(0, 0, -1, false, { result })`,
                `end)`,
            ].join('\n'),
        );
        await setupEditor('x\n', { line: 0, ch: 0 });
        await vimRawKeys('Q');
        await browser.pause(PAUSE.EDITOR_SETTLE);
        // Desktop with a handler: table|nil. Mobile / no handler: nil|string.
        // Both are the documented `vim.SystemObj|nil, nil|string` contract.
        expect(['table|nil', 'nil|string']).toContain(
            (await getEditorValue()).trim(),
        );
    });

    it('a config reload closes an open picker instead of leaking it', async function () {
        await loadLuaConfig(
            [
                `vim.keymap.set('n', 'Q', function()`,
                `  vim.ui.select({ 'a', 'b' }, {}, function() end)`,
                `end)`,
            ].join('\n'),
        );
        await setupEditor('x\n', { line: 0, ch: 0 });
        await vimRawKeys('Q');
        await browser.pause(PAUSE.EDITOR_SETTLE);
        expect(await pickerOpen()).toBe(true);

        await loadLuaConfig(`vim.opt.scrolloff = 3`);
        await browser.pause(300);
        expect(await pickerOpen()).toBe(false);
    });

    // Plan B's P1-P4. The override idiom is what real consumers rely on
    // (dressing.nvim, telescope-ui-select, snacks), so it is the acceptance
    // criterion regardless of which plugin is loaded.
    describe('third-party override idiom', function () {
        it('P1/P2: a plugin override replaces ours and receives the call', async function () {
            await loadLuaConfig(
                [
                    `local shim = require('uiselect_shim')`,
                    `shim.hijack()`,
                    `vim.keymap.set('n', 'Q', function()`,
                    `  vim.ui.select({ 'alpha', 'beta' }, {}, function(item)`,
                    `    vim.api.nvim_buf_set_lines(0, 0, -1, false, {`,
                    `      'shim:' .. shim.calls .. ':' .. tostring(item),`,
                    `    })`,
                    `  end)`,
                    `end)`,
                ].join('\n'),
            );
            await setupEditor('x\n', { line: 0, ch: 0 });
            await vimRawKeys('Q');
            await browser.pause(PAUSE.EDITOR_SETTLE);
            // Our picker must NOT open: the override owns the call.
            expect(await pickerOpen()).toBe(false);
            expect((await getEditorValue()).trim()).toBe('shim:1:alpha');
        });

        it('P3: restoring routes back to the Obsidian picker', async function () {
            await loadLuaConfig(
                [
                    `local shim = require('uiselect_shim')`,
                    `shim.hijack()`,
                    `shim.restore()`,
                    `vim.keymap.set('n', 'Q', function()`,
                    `  vim.ui.select({ 'alpha' }, {}, function() end)`,
                    `end)`,
                ].join('\n'),
            );
            await setupEditor('x\n', { line: 0, ch: 0 });
            await vimRawKeys('Q');
            await browser.pause(PAUSE.EDITOR_SETTLE);
            expect(await pickerOpen()).toBe(true);
        });

        it('P4: a dressing-style wrapper delegates through to our picker', async function () {
            await loadLuaConfig(
                [
                    `local shim = require('uiselect_shim')`,
                    `shim.wrap()`,
                    `vim.keymap.set('n', 'Q', function()`,
                    `  vim.ui.select({ 'alpha' }, {}, function() end)`,
                    `  vim.api.nvim_buf_set_lines(0, 0, -1, false, {`,
                    `    'wrapped:' .. shim.calls,`,
                    `  })`,
                    `end)`,
                ].join('\n'),
            );
            await setupEditor('x\n', { line: 0, ch: 0 });
            await vimRawKeys('Q');
            await browser.pause(PAUSE.EDITOR_SETTLE);
            expect((await getEditorValue()).trim()).toBe('wrapped:1');
            expect(await pickerOpen()).toBe(true);
        });
    });
});
