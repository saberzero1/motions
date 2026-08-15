import { StateEffect, StateField, type EditorState } from '@codemirror/state';

export interface TableNavState {
    mode: 'inactive' | 'nav' | 'edit';
    row: number;
    col: number;
    tableFrom: number;
    tableTo: number;
    dirty: boolean;
}

interface EnterTableNavPayload {
    row: number;
    col: number;
    tableFrom: number;
    tableTo: number;
}

interface CellPositionPayload {
    row: number;
    col: number;
}

const defaultState: TableNavState = {
    mode: 'inactive',
    row: 0,
    col: 0,
    tableFrom: 0,
    tableTo: 0,
    dirty: false,
};

export const enterTableNav = StateEffect.define<EnterTableNavPayload>();
export const exitTableNav = StateEffect.define<null>();
export const enterCellEdit = StateEffect.define<CellPositionPayload>();
export const exitCellEdit = StateEffect.define<CellPositionPayload>();
export const navigateCell = StateEffect.define<CellPositionPayload>();
export const markDirty = StateEffect.define<null>();

export const tableNavStateField = StateField.define<TableNavState>({
    create: () => defaultState,
    update: (value, tr) => {
        let next = value;

        if (tr.docChanged && value.mode !== 'inactive') {
            const mappedFrom = tr.changes.mapPos(value.tableFrom, -1);
            const mappedTo = tr.changes.mapPos(value.tableTo, 1);
            if (mappedFrom !== value.tableFrom || mappedTo !== value.tableTo) {
                next = {
                    ...next,
                    tableFrom: mappedFrom,
                    tableTo: mappedTo,
                };
            }
        }

        for (const effect of tr.effects) {
            if (effect.is(enterTableNav)) {
                const payload = effect.value;
                next = {
                    mode: 'nav',
                    row: payload.row,
                    col: payload.col,
                    tableFrom: payload.tableFrom,
                    tableTo: payload.tableTo,
                    dirty: false,
                };
                continue;
            }
            if (effect.is(exitTableNav)) {
                next = defaultState;
                continue;
            }
            if (effect.is(enterCellEdit)) {
                const payload = effect.value;
                next = {
                    ...next,
                    mode: 'edit',
                    row: payload.row,
                    col: payload.col,
                };
                continue;
            }
            if (effect.is(exitCellEdit)) {
                const payload = effect.value;
                next = {
                    ...next,
                    mode: 'nav',
                    row: payload.row,
                    col: payload.col,
                };
                continue;
            }
            if (effect.is(navigateCell)) {
                const payload = effect.value;
                next = { ...next, row: payload.row, col: payload.col };
                continue;
            }
            if (effect.is(markDirty)) {
                next = { ...next, dirty: true };
            }
        }

        return next;
    },
});

export function isTableNavActive(state: EditorState): boolean {
    return state.field(tableNavStateField).mode === 'nav';
}

export function getTableNavState(state: EditorState): TableNavState {
    return state.field(tableNavStateField);
}
