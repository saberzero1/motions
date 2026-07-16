import type { MotionFn, VimPos } from '../types/vim-api';
import { adjustRangeForVisualMode } from './delimiter';
import { findUnescapedPipes } from '../vim/table-utils';

const TABLE_RE = /^\s*\|/;

const createPos = (line: number, ch: number): VimPos => ({ line, ch });

export const tableRowTextObject: MotionFn = (cm, head, motionArgs, vim) => {
    const lineText = cm.getLine(head.line);
    if (!TABLE_RE.test(lineText)) return null;

    const pipes = findUnescapedPipes(lineText);
    if (pipes.length < 2) return null;

    const firstPipe = pipes[0]!;
    const lastPipe = pipes[pipes.length - 1]!;

    const inner = motionArgs.textObjectInner === true;

    if (inner) {
        const from = firstPipe + 1;
        const to = lastPipe;
        if (from >= to) return null;
        return adjustRangeForVisualMode(
            [createPos(head.line, from), createPos(head.line, to)],
            vim,
        );
    }

    return adjustRangeForVisualMode(
        [createPos(head.line, 0), createPos(head.line, lineText.length)],
        vim,
    );
};
