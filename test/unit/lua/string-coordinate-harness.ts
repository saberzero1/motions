import { vi } from 'vitest';
import { destroyState } from '../../../src/lua/engine';
import { COORD_LINE } from '../../fixtures/neovim-coordinate-contract';
import type { StringCoordinateCase } from '../../fixtures/neovim-string-coordinate-contract';
import {
    createCoordinateState,
    runLuaError,
    runLuaNumber,
    runLuaString,
} from './coordinate-harness';

/** Mutations live only in disposable Lua states; the normal path invokes the
 * real stdlib registration. Return observations, never assertions. */
export function observeStringCoordinate(
    name: string,
    row: StringCoordinateCase,
) {
    const state = createCoordinateState();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
        const control = process.env.COORD_STR_CONTROL;
        let mutation = '';
        if (control === 'results')
            mutation = `vim.${name}=function() return ${row.tuple ? '{999}' : '999'} end;`;
        if (control === 'placeholder' && name === 'str_utfindex')
            mutation = 'vim.str_utfindex=function() return 0 end;';
        if (control === 'single' && name === 'str_utfindex')
            mutation =
                'local original=vim.str_utfindex; vim.str_utfindex=function(...) local first=original(...); return first end;';
        if (control === 'conflated' && name === 'str_byteindex')
            mutation =
                "local original=vim.str_byteindex; vim.str_byteindex=function(s,encoding,index,strict) if encoding=='utf-16' then encoding='utf-32' end; return original(s,encoding,index,strict) end;";
        if (control === 'warnings') console.warn('negative control warning');
        const prefix = `local S=${JSON.stringify(COORD_LINE)}; ${mutation}`;
        const call = `vim.${name}(${row.args})`;
        const actual = row.error
            ? runLuaError(state.L, `${prefix} return ${call}`)
            : row.tuple || row.multiple
              ? runLuaString(
                    state.L,
                    `${prefix} return table.concat(${row.multiple ? `{${call}}` : call}, ':')`,
                )
              : runLuaNumber(state.L, `${prefix} return ${call}`);
        return { actual, warnings: warn.mock.calls.length };
    } finally {
        warn.mockRestore();
        destroyState(state.L);
    }
}
