import type { CmAdapter, MotionFn, ActionFn } from '../types/vim-api';
import type { VimRegistration } from '../vim/registration';

/**
 * Register an ex command that executes a motion function.
 * MotionFn can return VimPos, [VimPos, VimPos] (text object), or
 * Promise<VimPos|null> (async/EasyMotion — not supported here).
 */
export function exCommandFromMotion(
    reg: VimRegistration,
    exName: string,
    exShort: string,
    motionFn: MotionFn,
): void {
    reg.defineEx(exName, exShort, (cm: CmAdapter) => {
        const cursor = cm.getCursor();
        const result = motionFn(
            cm,
            cursor,
            { repeat: 1 },
            cm.state.vim ?? {},
            null,
        );
        if (result == null) return;
        if (Array.isArray(result)) {
            const head = result[1];
            if (head) cm.setCursor(head.line, head.ch);
        } else if ('line' in result && 'ch' in result) {
            cm.setCursor(result.line, result.ch);
        }
    });
}

/** Register an ex command that executes an action function. */
export function exCommandFromAction(
    reg: VimRegistration,
    exName: string,
    exShort: string,
    actionFn: ActionFn,
): void {
    reg.defineEx(exName, exShort, (cm: CmAdapter) => {
        actionFn(cm, { repeat: 1 }, cm.state.vim ?? {});
    });
}
