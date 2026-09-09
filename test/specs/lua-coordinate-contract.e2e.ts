import { browser, expect } from '@wdio/globals';
import {
    COORD_LINE,
    COORD_LINES,
} from '../fixtures/neovim-coordinate-contract';
import {
    loadLuaConfig,
    setupEditor,
    getCursorPos,
    getEditorValue,
    getRegisterContent,
    ensureSourceMode,
    isSourceMode,
    vimRawKeys,
} from '../helpers';

const config = `
vim.bo.tabstop = 8
vim.wo.list = false
vim.wo.showbreak = ''
vim.keymap.set('n', 'gZ', function()
    local p = vim.api.nvim_win_get_cursor(0)
    local result = {p[1], p[2], vim.fn.col('.'), vim.fn.charcol('.'), vim.fn.virtcol('.')}
    vim.api.nvim_win_set_cursor(0, {3,13})
    vim.fn.setreg('q', table.concat(result, ':'))
end)
vim.keymap.set('n', 'gX', function()
    local p = vim.api.nvim_buf_get_mark(0, 'a')
    vim.fn.setreg('r', table.concat(p, ':'))
end)
vim.keymap.set('n', 'gE', function()
    local p = vim.api.nvim_buf_get_mark(0, '>')
    vim.fn.setreg('s', table.concat(p, ':'))
end)
vim.keymap.set('n', 'gD', function()
    vim.fn.setreg('d', tostring(vim.fn.deletebufline(0, 3)))
end)
vim.keymap.set('n', 'gA', function()
    vim.fn.setreg('d', tostring(vim.fn.deletebufline(0, 1, '$')))
end)
`;

describe('Lua coordinate contract', function () {
    beforeEach(async () => {
        await loadLuaConfig(config);
        await setupEditor(COORD_LINES.join('\n'), { line: 2, ch: 6 });
        await ensureSourceMode();
        // Switching source mode may rebuild the editor; establish the cursor last.
        await setupEditor(COORD_LINES.join('\n'), { line: 2, ch: 6 });
    });
    for (const [name, keys, text, count] of [
        [
            'coordinate contract deletebufline mutates host buffer',
            'gD',
            COORD_LINE + '\n',
            2,
        ],
        [
            'coordinate contract deletebufline all leaves one host line',
            'gA',
            '',
            1,
        ],
    ] as const) {
        it(name, async () => {
            const initial = await getEditorValue();
            const source = await isSourceMode();
            await vimRawKeys(keys);
            const lineCount = await browser.executeObsidian(
                ({ app, obsidian }) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view)
                        throw new Error('deletebufline: no MarkdownView');
                    return view.editor.lineCount();
                },
            );
            await expect({
                initial,
                source,
                result: Number((await getRegisterContent('d'))?.text),
                text: await getEditorValue(),
                count: lineCount,
            }).toEqual({
                initial: COORD_LINES.join('\n'),
                source: true,
                result: 0,
                text,
                count,
            });
        });
    }
    it('coordinate contract public byte cursor roundtrip', async () => {
        await expect([
            await getEditorValue(),
            await getCursorPos(),
            await isSourceMode(),
        ]).toEqual([COORD_LINES.join('\n'), { line: 2, ch: 6 }, true]);
        await vimRawKeys('gZ');
        await expect([
            (await getRegisterContent('q'))?.text,
            await getCursorPos(),
            await getEditorValue(),
        ]).toEqual(['3:13:14:6:9', { line: 2, ch: 6 }, COORD_LINES.join('\n')]);
    });
    it('coordinate contract public mark after astral character', async () => {
        await expect([
            await getEditorValue(),
            await getCursorPos(),
            await isSourceMode(),
        ]).toEqual([COORD_LINES.join('\n'), { line: 2, ch: 6 }, true]);
        await vimRawKeys('magX');
        await expect([
            (await getRegisterContent('r'))?.text,
            await getEditorValue(),
        ]).toEqual(['3:13', COORD_LINES.join('\n')]);
        await vimRawKeys('V\x1b');
        await vimRawKeys('gE');
        await expect([
            (await getRegisterContent('s'))?.text,
            await getEditorValue(),
        ]).toEqual(['3:2147483647', COORD_LINES.join('\n')]);
    });
});
