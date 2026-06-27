import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { MotionFn } from '../types/vim-api';

const SEPARATOR_RE = /^\s*\|[\s:]*-+[\s:|-]*\|\s*$/;
const TABLE_RE = /^\s*\|/;

let tableEditedFlag = false;

export function createTableCursorFixExtension(): Extension {
    return EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;

        const head = update.state.selection.main.head;
        const line = update.state.doc.lineAt(head);
        const onTable = TABLE_RE.test(line.text);

        const prevLines = update.startState.doc.lines;
        const newLines = update.state.doc.lines;
        if (Math.abs(newLines - prevLines) >= 2) {
            tableEditedFlag = false;
            return;
        }

        if (onTable) {
            tableEditedFlag = true;
        }
    });
}

export function installTableCursorFix(): () => void {
    return () => {
        tableEditedFlag = false;
    };
}

export const tableAwareMoveUp: MotionFn = (
    cm,
    head,
    motionArgs,
    _vim,
    inputState,
) => {
    const hasOperator = !!(inputState as { operator?: string } | null)
        ?.operator;
    const shouldSkipSep = tableEditedFlag && !hasOperator;
    const repeat = motionArgs.repeat || 1;
    let line = head.line;

    for (let i = 0; i < repeat; i++) {
        if (line <= cm.firstLine()) break;
        if (
            shouldSkipSep &&
            line - 1 > cm.firstLine() &&
            SEPARATOR_RE.test(cm.getLine(line - 1))
        ) {
            line -= 2;
        } else {
            line--;
        }
    }

    if (line === head.line) return null;

    const targetText = cm.getLine(line);
    const ch = Math.min(head.ch, Math.max(0, targetText.length - 1));
    return { line, ch };
};
