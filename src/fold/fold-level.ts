import { StateEffect, StateField, type Extension } from '@codemirror/state';
import {
    foldable,
    foldEffect,
    unfoldEffect,
    foldedRanges,
} from '@codemirror/language';
import type { EditorView } from '@codemirror/view';
import type { ActionFn, CmAdapter } from '../types/vim-api';
import type { VimRegistration } from '../vim/registration';
import { exCommandFromAction } from '../keybindings/action-registry';

const HEADING_RE = /^(#{1,6})\s/;

const setFoldLevel = StateEffect.define<number>();

const foldLevelField = StateField.define<number>({
    create() {
        return 0;
    },
    update(level, tr) {
        for (const effect of tr.effects) {
            if (effect.is(setFoldLevel)) return effect.value;
        }
        return level;
    },
});

function foldHeadingsAtLevel(view: EditorView, level: number): void {
    const { state } = view;
    const effects: StateEffect<{ from: number; to: number }>[] = [];
    const folded = foldedRanges(state);

    for (let i = 1; i <= state.doc.lines; i++) {
        const line = state.doc.line(i);
        const match = HEADING_RE.exec(line.text);
        if (!match?.[1] || match[1].length !== level) continue;

        const range = foldable(state, line.from, line.to);
        if (!range) continue;

        let alreadyFolded = false;
        const iter = folded.iter(range.from);
        while (iter.value) {
            if (iter.from === range.from && iter.to === range.to) {
                alreadyFolded = true;
                break;
            }
            if (iter.from > range.to) break;
            iter.next();
        }

        if (!alreadyFolded) {
            effects.push(foldEffect.of(range));
        }
    }

    if (effects.length > 0) {
        view.dispatch({ effects });
    }
}

function unfoldHeadingsAtLevel(view: EditorView, level: number): void {
    const { state } = view;
    const effects: StateEffect<{ from: number; to: number }>[] = [];
    const folded = foldedRanges(state);

    for (let i = 1; i <= state.doc.lines; i++) {
        const line = state.doc.line(i);
        const match = HEADING_RE.exec(line.text);
        if (!match?.[1] || match[1].length !== level) continue;

        const range = foldable(state, line.from, line.to);
        if (!range) continue;

        const iter = folded.iter(range.from);
        while (iter.value) {
            if (iter.from === range.from && iter.to === range.to) {
                effects.push(unfoldEffect.of(range));
                break;
            }
            if (iter.from > range.to) break;
            iter.next();
        }
    }

    if (effects.length > 0) {
        view.dispatch({ effects });
    }
}

const foldMoreAction: ActionFn = (cm: CmAdapter) => {
    const view = cm.cm6;
    if (!view) return;
    const currentLevel = view.state.field(foldLevelField, false) ?? 0;
    if (currentLevel >= 6) return;
    const nextLevel = currentLevel + 1;
    foldHeadingsAtLevel(view, nextLevel);
    view.dispatch({ effects: setFoldLevel.of(nextLevel) });
};

const foldLessAction: ActionFn = (cm: CmAdapter) => {
    const view = cm.cm6;
    if (!view) return;
    const currentLevel = view.state.field(foldLevelField, false) ?? 0;
    if (currentLevel <= 0) return;
    unfoldHeadingsAtLevel(view, currentLevel);
    view.dispatch({ effects: setFoldLevel.of(currentLevel - 1) });
};

export function foldLevelExtension(): Extension {
    return foldLevelField;
}

export function registerFoldLevelCommands(reg: VimRegistration): void {
    reg.defineAction('foldMore', foldMoreAction);
    reg.mapCommand('zm', 'action', 'foldMore', {});
    exCommandFromAction(reg, 'foldmore', 'foldm', foldMoreAction);

    reg.defineAction('foldLess', foldLessAction);
    reg.mapCommand('zr', 'action', 'foldLess', {});
    exCommandFromAction(reg, 'foldless', 'foldl', foldLessAction);
}
