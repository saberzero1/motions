import {
    foldable,
    foldEffect,
    unfoldEffect,
    unfoldAll,
    foldedRanges,
} from '@codemirror/language';
import { StateEffect } from '@codemirror/state';
import type {
    ActionFn,
    CmAdapter,
    OperatorFn,
    OperatorRange,
    VimPos,
} from '../types/vim-api';
import type { VimRegistration } from '../vim/registration';
import {
    exCommandFromAction,
    exCommandFromMotion,
} from '../keybindings/action-registry';
import {
    findEnclosingFoldable,
    foldedRangesWithin,
    foldEnd,
    foldNext,
    foldPrev,
    foldStart,
} from './motions';
import { isFoldingEnabled } from './fold-enable';

function rangesToDocOffsets(
    view: {
        state: { doc: { line: (n: number) => { from: number; to: number } } };
    },
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
    if (!isFoldingEnabled(cm)) return;
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

const foldDeleteRecursiveAction: ActionFn = (cm: CmAdapter) => {
    const view = cm.cm6;
    if (!view) return;
    const pos = view.state.selection.main.head;
    const line = view.state.doc.lineAt(pos);
    const outerRange = foldable(view.state, line.from, line.to);
    const range = outerRange ?? findEnclosingFoldable(view.state, pos);
    if (!range) {
        foldDeleteAction(cm, { repeat: 1 }, cm.state.vim ?? {});
        return;
    }
    const nested = foldedRangesWithin(view.state, range.from, range.to);
    if (nested.length === 0) {
        foldDeleteAction(cm, { repeat: 1 }, cm.state.vim ?? {});
        return;
    }
    const effects = nested.map((r) => unfoldEffect.of(r));
    view.dispatch({ effects });
};

const foldViewCursorAction: ActionFn = (cm: CmAdapter) => {
    const view = cm.cm6;
    if (!view) return;
    const pos = view.state.selection.main.head;
    const folded = foldedRanges(view.state);
    const effects: StateEffect<{ from: number; to: number }>[] = [];
    const iter = folded.iter();
    while (iter.value) {
        if (iter.from <= pos && iter.to >= pos) {
            effects.push(unfoldEffect.of({ from: iter.from, to: iter.to }));
        }
        iter.next();
    }
    if (effects.length > 0) {
        view.dispatch({ effects });
    }
};

const foldCreateLinesAction: ActionFn = (cm: CmAdapter, actionArgs) => {
    if (!isFoldingEnabled(cm)) return;
    const view = cm.cm6;
    if (!view) return;
    const count = actionArgs.repeat ?? 1;
    const cursorLine = view.state.doc.lineAt(view.state.selection.main.head);
    const endLineNum = Math.min(
        cursorLine.number + count - 1,
        view.state.doc.lines,
    );
    const endLine = view.state.doc.line(endLineNum);
    view.dispatch({
        effects: foldEffect.of({ from: cursorLine.from, to: endLine.to }),
    });
};

const foldEliminateAllAction: ActionFn = (cm: CmAdapter) => {
    const view = cm.cm6;
    if (view) unfoldAll(view);
};

export function registerFoldCommands(reg: VimRegistration): void {
    reg.defineMotion('foldNext', foldNext);
    reg.mapCommand('zj', 'motion', 'foldNext', { toJumplist: true });
    exCommandFromMotion(reg, 'foldnext', 'foldn', foldNext);

    reg.defineMotion('foldPrev', foldPrev);
    reg.mapCommand('zk', 'motion', 'foldPrev', { toJumplist: true });
    exCommandFromMotion(reg, 'foldprev', 'foldp', foldPrev);

    reg.defineMotion('foldStart', foldStart);
    reg.mapCommand('[z', 'motion', 'foldStart', { toJumplist: true });
    exCommandFromMotion(reg, 'foldstart', 'folds', foldStart);

    reg.defineMotion('foldEnd', foldEnd);
    reg.mapCommand(']z', 'motion', 'foldEnd', { toJumplist: true });
    exCommandFromMotion(reg, 'foldend', '', foldEnd);

    reg.defineOperator('foldCreate', foldCreateOperator);
    reg.mapCommand('zf', 'operator', 'foldCreate', {});

    reg.defineAction('foldDelete', foldDeleteAction);
    reg.mapCommand('zd', 'action', 'foldDelete', {});
    reg.defineAction('foldDeleteRecursive', foldDeleteRecursiveAction);
    reg.mapCommand('zD', 'action', 'foldDeleteRecursive', {});
    exCommandFromAction(reg, 'folddelete', 'foldd', foldDeleteAction);

    reg.defineAction('foldViewCursor', foldViewCursorAction);
    reg.mapCommand('zv', 'action', 'foldViewCursor', {});

    reg.defineAction('foldCreateLines', foldCreateLinesAction);
    reg.mapCommand('zF', 'action', 'foldCreateLines', {});

    reg.defineAction('foldEliminateAll', foldEliminateAllAction);
    reg.mapCommand('zE', 'action', 'foldEliminateAll', {});
    exCommandFromAction(reg, 'foldeliminate', 'folde', foldEliminateAllAction);
}
