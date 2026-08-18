import { StateEffect, StateField, type Extension } from '@codemirror/state';
import { unfoldAll } from '@codemirror/language';
import type { ActionFn, CmAdapter } from '../types/vim-api';
import type { VimRegistration } from '../vim/registration';

const setFoldEnable = StateEffect.define<boolean>();

export const foldEnableField = StateField.define<boolean>({
    create() {
        return true;
    },
    update(enabled, tr) {
        for (const effect of tr.effects) {
            if (effect.is(setFoldEnable)) return effect.value;
        }
        return enabled;
    },
});

export function isFoldingEnabled(cm: CmAdapter): boolean {
    const view = cm.cm6;
    if (!view) return true;
    return view.state.field(foldEnableField, false) ?? true;
}

const foldNoneAction: ActionFn = (cm: CmAdapter) => {
    const view = cm.cm6;
    if (!view) return;
    unfoldAll(view);
    view.dispatch({ effects: setFoldEnable.of(false) });
};

const foldNormalAction: ActionFn = (cm: CmAdapter) => {
    const view = cm.cm6;
    if (!view) return;
    view.dispatch({ effects: setFoldEnable.of(true) });
    // Note: does NOT reapply foldlevel — that's zX's job.
    // zN just re-enables the ability to fold.
};

const foldToggleEnableAction: ActionFn = (cm: CmAdapter) => {
    const view = cm.cm6;
    if (!view) return;
    const enabled = view.state.field(foldEnableField, false) ?? true;
    if (enabled) {
        unfoldAll(view);
        view.dispatch({ effects: setFoldEnable.of(false) });
    } else {
        view.dispatch({ effects: setFoldEnable.of(true) });
    }
};

export function foldEnableExtension(): Extension {
    return foldEnableField;
}

export function registerFoldEnableCommands(reg: VimRegistration): void {
    reg.defineAction('foldNone', foldNoneAction);
    reg.mapCommand('zn', 'action', 'foldNone', {});

    reg.defineAction('foldNormal', foldNormalAction);
    reg.mapCommand('zN', 'action', 'foldNormal', {});

    reg.defineAction('foldToggleEnable', foldToggleEnableAction);
    reg.mapCommand('zi', 'action', 'foldToggleEnable', {});
}
