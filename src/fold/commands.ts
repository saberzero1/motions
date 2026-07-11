import {
    foldEffect,
    unfoldEffect,
    unfoldAll,
    foldedRanges,
} from '@codemirror/language';
import type {
    ActionFn,
    CmAdapter,
    OperatorFn,
    OperatorRange,
    VimPos,
} from '../types/vim-api';
import type { VimRegistration } from '../vim/registration';
import { exCommandFromAction } from '../keybindings/action-registry';

function rangesToDocOffsets(
    view: { state: { doc: { line: (n: number) => { from: number; to: number } } } },
    ranges: OperatorRange[],
): { from: number; to: number } | null {
    const first = ranges[0];
    if (!first) return null;
    const startLine = Math.min(first.anchor.line, first.head.line) + 1;
    const endLine = Math.max(first.anchor.line, first.head.line) + 1;
    return {
        from: view.state.doc.line(startLine).from,
        to: view.state.doc.line(endLine).to,
    };
}

const foldCreateOperator: OperatorFn = (
    cm: CmAdapter,
    _operatorArgs,
    ranges: OperatorRange[],
): VimPos | void => {
    const view = cm.cm6;
    if (!view) return;
    const range = rangesToDocOffsets(view, ranges);
    if (!range) return;
    view.dispatch({ effects: foldEffect.of(range) });
};

const foldDeleteAction: ActionFn = (cm: CmAdapter) => {
    const view = cm.cm6;
    if (!view) return;
    const pos = view.state.selection.main.head;
    const line = view.state.doc.lineAt(pos);
    const folded = foldedRanges(view.state);
    const iter = folded.iter();
    while (iter.value) {
        if (iter.from <= line.to && iter.to >= line.from) {
            view.dispatch({
                effects: unfoldEffect.of({ from: iter.from, to: iter.to }),
            });
            return;
        }
        iter.next();
    }
};

const foldEliminateAllAction: ActionFn = (cm: CmAdapter) => {
    const view = cm.cm6;
    if (view) unfoldAll(view);
};

export function registerFoldCommands(reg: VimRegistration): void {
    reg.defineOperator('foldCreate', foldCreateOperator);
    reg.mapCommand('zf', 'operator', 'foldCreate', {});

    reg.defineAction('foldDelete', foldDeleteAction);
    reg.mapCommand('zd', 'action', 'foldDelete', {});
    reg.mapCommand('zD', 'action', 'foldDelete', {});
    exCommandFromAction(reg, 'folddelete', 'foldd', foldDeleteAction);

    reg.defineAction('foldEliminateAll', foldEliminateAllAction);
    reg.mapCommand('zE', 'action', 'foldEliminateAll', {});
    exCommandFromAction(
        reg,
        'foldeliminate',
        'folde',
        foldEliminateAllAction,
    );
}
