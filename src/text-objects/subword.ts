import type { MotionFn, VimPos } from '../types/vim-api';
import { findSubwordBoundaries, findSubwordEnds } from '../util/subword';
import { adjustRangeForVisualMode } from './delimiter';

const createPos = (line: number, ch: number): VimPos => ({ line, ch });

const isSeparator = (char: string | undefined): boolean =>
    char === '_' || char === '-';

function findSubwordSegment(
    lineText: string,
    cursor: number,
): { start: number; end: number } | null {
    const boundaries = findSubwordBoundaries(lineText);
    const ends = findSubwordEnds(lineText);
    const total = Math.min(boundaries.length, ends.length);
    for (let i = 0; i < total; i++) {
        const start = boundaries[i];
        const end = ends[i];
        if (start === undefined || end === undefined) continue;
        if (cursor >= start && cursor < end) {
            return { start, end };
        }
    }
    return null;
}

export const subwordInnerTextObject: MotionFn = (cm, head, _ma, vim) => {
    const lineText = cm.getLine(head.line);
    const cursor = Math.max(0, Math.min(head.ch, lineText.length));
    const segment = findSubwordSegment(lineText, cursor);
    if (!segment) return null;
    return adjustRangeForVisualMode(
        [
            createPos(head.line, segment.start),
            createPos(head.line, segment.end),
        ],
        vim,
    );
};

export const subwordAroundTextObject: MotionFn = (cm, head, _ma, vim) => {
    const lineText = cm.getLine(head.line);
    const cursor = Math.max(0, Math.min(head.ch, lineText.length));
    const segment = findSubwordSegment(lineText, cursor);
    if (!segment) return null;

    let start = segment.start;
    let end = segment.end;

    if (isSeparator(lineText[end])) {
        end += 1;
    } else if (start > 0 && isSeparator(lineText[start - 1])) {
        start -= 1;
    }

    return adjustRangeForVisualMode(
        [createPos(head.line, start), createPos(head.line, end)],
        vim,
    );
};
