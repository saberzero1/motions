import type { MotionFn, VimPos } from '../types/vim-api';
import { adjustRangeForVisualMode } from './delimiter';
import { findUnescapedPipes } from '../vim/table-utils';

const TABLE_RE = /^\s*\|/;

const createPos = (line: number, ch: number): VimPos => ({ line, ch });

function findSurroundingPipes(
    line: string,
    ch: number,
): { left: number; right: number } | null {
    const pipes = findUnescapedPipes(line);
    if (pipes.length < 2) return null;

    let leftIdx = -1;
    for (let i = pipes.length - 1; i >= 0; i--) {
        const p = pipes[i];
        if (p !== undefined && p <= ch) {
            leftIdx = i;
            break;
        }
    }

    if (leftIdx === -1) return null;

    const left = pipes[leftIdx];
    const right = pipes[leftIdx + 1];
    if (left === undefined || right === undefined) return null;

    return { left, right };
}

/**
 * Table cell text object (`i|` / `a|`).
 *
 * `i|`: content between surrounding pipes (like `i(`).
 * `a|`: content plus the trailing pipe.
 */
export const tableCellTextObject: MotionFn = (cm, head, motionArgs, vim) => {
    const lineText = cm.getLine(head.line);
    if (!TABLE_RE.test(lineText)) return null;

    const bounds = findSurroundingPipes(lineText, head.ch);
    if (!bounds) return null;

    const inner = motionArgs.textObjectInner === true;

    if (inner) {
        const from = bounds.left + 1;
        const to = bounds.right;
        if (from >= to) return null;
        return adjustRangeForVisualMode(
            [createPos(head.line, from), createPos(head.line, to)],
            vim,
        );
    }

    const from = bounds.left + 1;
    const to = bounds.right + 1;
    return adjustRangeForVisualMode(
        [createPos(head.line, from), createPos(head.line, to)],
        vim,
    );
};
