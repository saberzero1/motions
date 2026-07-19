import { VimRegistration } from '../vim/registration';
import { tryDial } from './dial';

export function registerDial(reg: VimRegistration): void {
    reg.defineActionOverride('incrementNumberToken', (original) => {
        return (cm, actionArgs, vim) => {
            const direction =
                (actionArgs as { increase?: boolean }).increase === false
                    ? -1
                    : 1;
            const count = actionArgs.repeat ?? 1;
            const cursor = cm.getCursor();
            const line = cm.getLine(cursor.line);

            const result = tryDial(line, cursor.ch, direction, count);
            if (result) {
                cm.replaceRange(
                    result.newText,
                    { line: cursor.line, ch: result.start },
                    { line: cursor.line, ch: result.end },
                );
                cm.setCursor(cursor.line, result.cursorPos);
                return;
            }

            original(cm, actionArgs, vim);
        };
    });
}
