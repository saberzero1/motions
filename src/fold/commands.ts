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
    ExCommandArgs,
    ExCommandFn,
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
    foldableRegionsWithin,
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

function getExLineRange(
    cm: CmAdapter,
    params: ExCommandArgs,
): { from: number; to: number } {
    const doc = cm.cm6.state.doc;
    const cursorLine = cm.getCursor().line;
    const startLine = Math.max(
        0,
        Math.min(params.line ?? cursorLine, doc.lines - 1),
    );
    const endLine = Math.max(
        startLine,
        Math.min(params.lineEnd ?? startLine, doc.lines - 1),
    );
    return {
        from: doc.line(startLine + 1).from,
        to: doc.line(endLine + 1).to,
    };
}

const foldRangeEx: ExCommandFn = (cm, params) => {
    if (!isFoldingEnabled(cm)) return;
    const view = cm.cm6;
    if (!view) return;
    const range = getExLineRange(cm, params);
    view.dispatch({ effects: foldEffect.of(range) });
};

const foldOpenRangeEx: ExCommandFn = (cm, params) => {
    const view = cm.cm6;
    if (!view) return;
    const range = getExLineRange(cm, params);
    const recursive = params.argString?.trim() === '!';
    const folded = foldedRanges(view.state);
    const effects: StateEffect<{ from: number; to: number }>[] = [];
    const iter = folded.iter();
    while (iter.value) {
        if (iter.from < range.to && iter.to > range.from) {
            effects.push(unfoldEffect.of({ from: iter.from, to: iter.to }));
            if (!recursive) break;
        }
        iter.next();
    }
    if (effects.length > 0) view.dispatch({ effects });
};

const foldCloseRangeEx: ExCommandFn = (cm, params) => {
    if (!isFoldingEnabled(cm)) return;
    const view = cm.cm6;
    if (!view) return;
    const range = getExLineRange(cm, params);
    const recursive = params.argString?.trim() === '!';
    const regions = foldableRegionsWithin(view.state, range.from, range.to);
    if (regions.length === 0) return;
    const folded = foldedRanges(view.state);
    const effects: StateEffect<{ from: number; to: number }>[] = [];
    for (const r of regions) {
        let alreadyFolded = false;
        folded.between(r.from, r.to, (fFrom, fTo) => {
            if (fFrom === r.from && fTo === r.to) alreadyFolded = true;
        });
        if (!alreadyFolded) {
            effects.push(foldEffect.of(r));
            if (!recursive) break;
        }
    }
    if (effects.length > 0) view.dispatch({ effects });
};

const foldDoOpenEx: ExCommandFn = (cm, params) => {
    const view = cm.cm6;
    if (!view) return;
    const cmd = params.argString?.trim();
    if (!cmd) return;
    const range = getExLineRange(cm, params);
    const folded = foldedRanges(view.state);
    const doc = view.state.doc;
    const lines: number[] = [];
    for (let pos = range.from; pos <= range.to;) {
        const line = doc.lineAt(pos);
        let inFold = false;
        folded.between(line.from, line.from, () => {
            inFold = true;
        });
        if (!inFold) lines.push(line.number - 1);
        pos = line.to + 1;
    }
    const vim = (
        window as unknown as {
            CodeMirrorAdapter?: {
                Vim?: { handleEx: (cm: unknown, input: string) => void };
            };
        }
    ).CodeMirrorAdapter?.Vim;
    if (!vim) return;
    for (const ln of lines) {
        cm.setCursor(ln, 0);
        vim.handleEx(cm, cmd);
    }
};

const foldDoClosedEx: ExCommandFn = (cm, params) => {
    const view = cm.cm6;
    if (!view) return;
    const cmd = params.argString?.trim();
    if (!cmd) return;
    const range = getExLineRange(cm, params);
    const folded = foldedRanges(view.state);
    const doc = view.state.doc;
    const lines: number[] = [];
    for (let pos = range.from; pos <= range.to;) {
        const line = doc.lineAt(pos);
        let inFold = false;
        folded.between(line.from, line.from, () => {
            inFold = true;
        });
        if (inFold) lines.push(line.number - 1);
        pos = line.to + 1;
    }
    const vim = (
        window as unknown as {
            CodeMirrorAdapter?: {
                Vim?: { handleEx: (cm: unknown, input: string) => void };
            };
        }
    ).CodeMirrorAdapter?.Vim;
    if (!vim) return;
    for (const ln of lines) {
        cm.setCursor(ln, 0);
        vim.handleEx(cm, cmd);
    }
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

    reg.defineEx('fold', 'fo', foldRangeEx);
    reg.defineEx('foldopen', 'foldo', foldOpenRangeEx);
    reg.defineEx('foldclose', 'foldc', foldCloseRangeEx);
    reg.defineEx('folddoopen', 'folddoo', foldDoOpenEx);
    reg.defineEx('folddoclosed', 'folddoc', foldDoClosedEx);
}
