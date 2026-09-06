import { afterEach, describe, expect, it, vi } from 'vitest';
import { lua, lauxlib, to_luastring } from '../../../src/lib/fengari';
import {
    createSandboxedState,
    destroyState,
    evalLua,
} from '../../../src/lua/engine';
import { injectVimApi } from '../../../src/lua/api';
import { AutocmdManager } from '../../../src/lua/autocmd';
import type { CmAdapter, VimApi } from '../../../src/types/vim-api';

const states: ReturnType<typeof createSandboxedState>[] = [];
afterEach(() => {
    for (const L of states) destroyState(L);
    states.length = 0;
});

function setup() {
    const L = createSandboxedState();
    states.push(L);
    const feedKeys = vi.fn();
    const onKeymap = vi.fn();
    const adapter = {} as CmAdapter;
    injectVimApi(L, {
        onSettingOverride: () => {},
        handleExCommand: () => {},
        getVaultName: () => 'vault',
        onKeymap,
        onKeymapDel: () => {},
        autocmdManager: new AutocmdManager(L),
        getVimApi: () => ({ feedKeys }) as unknown as VimApi,
        getCmAdapter: () => adapter,
    });
    return { L, feedKeys, onKeymap, adapter };
}

describe('nvim_replace_termcodes', () => {
    // Raw bytes verified against Neovim keycodes.h/special_to_buf(), not UTF-8.
    const cases: Array<[string, number[]]> = [
        ['<CR>', [13]],
        ['<Enter>', [13]],
        ['<Return>', [13]],
        ['<cr>', [13]],
        ['<Esc>', [27]],
        ['<Tab>', [9]],
        ['<BS>', [128, 107, 98]],
        ['<Del>', [128, 107, 68]],
        ['<Space>', [32]],
        ['<NL>', [10]],
        ['<LF>', [10]],
        ['<S-x>', [88]],
        ['<A-x>', [128, 252, 8, 120]],
        ['<M-x>', [128, 252, 8, 120]],
        ['<a-X>', [128, 252, 8, 88]],
        ['<lt>', [60]],
        ['<Bslash>', [92]],
        ['<Nul>', [128, 255, 88]],
        ['<C-@>', [128, 255, 88]],
        ['<C-S-x>', [128, 252, 2, 24]],
        ['<Up>', [128, 107, 117]],
        ['<Down>', [128, 107, 100]],
        ['<Left>', [128, 107, 108]],
        ['<Right>', [128, 107, 114]],
        ['<Home>', [128, 107, 104]],
        ['<End>', [128, 64, 55]],
        ['<PageUp>', [128, 107, 80]],
        ['<PageDown>', [128, 107, 78]],
        ['<Insert>', [128, 107, 73]],
        ['<S-Tab>', [128, 107, 66]],
        ['<C-Up>', [128, 252, 4, 128, 107, 117]],
        ...Array.from({ length: 26 }, (_, i): [string, number[]] => [
            `<C-${String.fromCharCode(97 + i)}>`,
            [i + 1],
        ]),
        ...Array.from({ length: 12 }, (_, i): [string, number[]] => [
            `<F${i + 1}>`,
            [
                128,
                i < 10 ? 107 : 70,
                i < 9 ? 49 + i : i === 9 ? 59 : 49 + i - 10,
            ],
        ]),
    ];
    it.each(cases)('translates %s to exact Neovim bytes', (input, expected) => {
        const { L } = setup();
        const status = lauxlib.luaL_dostring(
            L,
            to_luastring(
                `return vim.api.nvim_replace_termcodes(${JSON.stringify(input)}, true, true, true)`,
            ),
        );
        expect(status).toBe(lua.LUA_OK);
        expect(Array.from(lua.lua_tolstring(L, -1)!)).toEqual(expected);
    });

    it('preserves unknown notation and honors special/do_lt independently', () => {
        const { L } = setup();
        expect(
            evalLua(
                L,
                `
            local t = vim.api.nvim_replace_termcodes
            assert(t('<unknown>', true, true, true) == '<unknown>')
            assert(t('<constructor><__proto__>', true, true, true) == '<constructor><__proto__>')
            assert(t('<CR><C-a><lt>', true, true, false) == '<CR><C-a><')
            assert(t('<CR><lt>', true, false, false) == '<CR><lt>')
            assert(t('<CR><lt>', true, false, true) == string.char(13) .. '<lt>')
            assert(t('', true, true, true) == '')
            assert(t('<CR>', false, true, true) == string.char(13))
            assert(t(string.char(128), true, false, false) == string.char(128, 254, 88))
        `,
            ),
        ).toEqual({ ok: true });
    });

    it('feeds converted control/special/modifier keys to the notation-based fork', () => {
        const { L, feedKeys, adapter } = setup();
        expect(
            evalLua(
                L,
                `vim.api.nvim_feedkeys(vim.api.nvim_replace_termcodes('i<CR><Esc><C-a><A-x><BS><Del><Up><F12><Nul>', true, true, true), 'n', false)`,
            ),
        ).toEqual({ ok: true });
        expect(feedKeys).toHaveBeenCalledWith(
            adapter,
            'i<CR><Esc><C-a><A-x><BS><Del><Up><F12><C-@>',
            { noremap: true },
        );
    });

    it('preserves literal angle brackets and UTF-8 containing escaped K_SPECIAL bytes through feedkeys', () => {
        const { L, feedKeys, adapter } = setup();
        expect(
            evalLua(
                L,
                `vim.api.nvim_feedkeys(vim.api.nvim_replace_termcodes('i<lt>CR>Ā😀', true, true, true), 'm', false)`,
            ),
        ).toEqual({ ok: true });
        expect(feedKeys).toHaveBeenCalledWith(adapter, 'i<lt>CR>Ā😀', {
            noremap: false,
        });
    });

    it('accepts binary termcodes in mappings and expression callback results', () => {
        const { L, feedKeys, onKeymap, adapter } = setup();
        expect(
            evalLua(
                L,
                `
            local t = function(s) return vim.api.nvim_replace_termcodes(s, true, true, true) end
            vim.keymap.set('i', t('<BS>'), t('<CR><BS>'))
            vim.keymap.set('i', 'x', function() return t('<A-x><BS>') end, {expr = true})
        `,
            ),
        ).toEqual({ ok: true });
        expect(onKeymap).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ lhs: '<BS>', rhs: '<CR><BS>' }),
        );
        const mapping: unknown = onKeymap.mock.calls[1]?.[0];
        if (
            !mapping ||
            typeof mapping !== 'object' ||
            !('callback' in mapping) ||
            typeof mapping.callback !== 'function'
        ) {
            throw new Error('Expected an expression mapping callback');
        }
        mapping.callback();
        expect(feedKeys).toHaveBeenCalledWith(adapter, '<A-x><BS>', {
            noremap: true,
        });
    });
});
