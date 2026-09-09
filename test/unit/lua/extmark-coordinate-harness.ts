import { EditorState, type TransactionSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { destroyState } from '../../../src/lua/engine';
import { dispatchSetExtmark, extmarkField } from '../../../src/lua/extmarks';
import { COORD_LINE } from '../../fixtures/neovim-coordinate-contract';
import type { ExtmarkCoordinateCase } from '../../fixtures/neovim-extmark-coordinate-contract';
import {
    createCoordinateState,
    runLuaError,
    runLuaNumber,
    runLuaString,
} from './coordinate-harness';

// Real CM6 state/effects/storage; only the DOM-less view dispatch is supplied.
function createExtmarkCoordinateState(lines: readonly string[]) {
    const state = createCoordinateState(lines);
    const view = {
        state: EditorState.create({
            doc: state.host.lines.join('\n'),
            extensions: [extmarkField],
        }),
        dispatch(spec: TransactionSpec) {
            this.state = this.state.update(spec).state;
            state.host.lines = this.state.doc.toString().split('\n');
        },
    };
    state.host.editorView = view as unknown as EditorView;
    return { ...state, view };
}

export function observeExtmarkCoordinate(
    api: string,
    row: ExtmarkCoordinateCase,
): string {
    const state = createExtmarkCoordinateState(row.lines ?? [COORD_LINE]);
    const { view } = state;
    try {
        if (row.hostMark) {
            const [line, col, endLine, endCol] = row.hostMark;
            dispatchSetExtmark(view as unknown as EditorView, 1, line, col, {
                endLine,
                endCol,
            });
        }
        const read = (name: string) =>
            runLuaString(
                state.L,
                name.endsWith('nvim_buf_get_extmarks')
                    ? `local m=${name}(0,1,0,-1,{details=true})[1]; if m[4]==nil then return 'details=nil' end; return string.format('%d:%d:%d:%d',m[2],m[3],m[4].end_row,m[4].end_col)`
                    : `local m=${name}(0,1,1,{details=true}); if m[3]==nil then return 'details=nil' end; return string.format('%d:%d:%d:%d',m[1],m[2],m[3].end_row,m[3].end_col)`,
            );
        if (api.endsWith('nvim_buf_set_extmark')) {
            if (row.error)
                return runLuaError(state.L, `return ${api}(${row.args})`);
            const id = runLuaNumber(state.L, `return ${api}(${row.args})`);
            const mark = view.state
                .field(extmarkField)
                .registry.byNs.get(1)
                ?.get(id);
            return `${id};${mark?.from}:${mark?.to};${read('vim.api.nvim_buf_get_extmark_by_id')};${read('vim.api.nvim_buf_get_extmarks')}`;
        }
        return read(api);
    } finally {
        destroyState(state.L);
    }
}

export function observeExtmarkVirtText(api: string): string[] {
    const state = createExtmarkCoordinateState([COORD_LINE]);
    try {
        const details = api.endsWith('nvim_buf_get_extmarks')
            ? `${api}(0,1,0,-1,{details=true})[1][4]`
            : `${api}(0,1,id,{details=true})[3]`;
        return runLuaString(
            state.L,
            `
            local id=vim.api.nvim_buf_set_extmark(0,1,0,5,{
                end_col=9, virt_text={{'A','ErrorMsg'},{'B','WarningMsg'}}
            })
            local v=${details}.virt_text
            local first,second=v[1] or {},v[2] or {}
            return table.concat({type(v),#v,type(v[1]),#first,
                tostring(first[1]),tostring(first[2]),tostring(first.text),
                type(v[2]),#second,tostring(second[1]),tostring(second[2]),tostring(second.text)}, ':')
        `,
        ).split(':');
    } finally {
        destroyState(state.L);
    }
}
