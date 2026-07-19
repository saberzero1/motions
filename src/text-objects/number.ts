import type { MotionFn, VimPos } from '../types/vim-api';
import { adjustRangeForVisualMode } from './delimiter';

const createPos = (line: number, ch: number): VimPos => ({ line, ch });

const NUMBER_RE = /-?\d+(\.\d+)?/g;

function findNumberMatch(
    lineText: string,
    cursor: number,
): { start: number; end: number } | null {
    const matches: { start: number; end: number }[] = [];
    let match: RegExpExecArray | null;
    const re = new RegExp(NUMBER_RE.source, 'g');
    while ((match = re.exec(lineText)) !== null) {
        matches.push({
            start: match.index,
            end: match.index + match[0].length,
        });
    }

    let fallback: { start: number; end: number } | null = null;
    for (const entry of matches) {
        if (cursor >= entry.start && cursor < entry.end) return entry;
        if (!fallback && entry.start > cursor) fallback = entry;
    }
    return fallback;
}

export const numberInnerTextObject: MotionFn = (cm, head, _ma, vim) => {
    const lineText = cm.getLine(head.line);
    const cursor = Math.max(0, Math.min(head.ch, lineText.length));
    const match = findNumberMatch(lineText, cursor);
    if (!match) return null;

    return adjustRangeForVisualMode(
        [createPos(head.line, match.start), createPos(head.line, match.end)],
        vim,
    );
};

export const numberAroundTextObject: MotionFn = (cm, head, _ma, vim) => {
    const lineText = cm.getLine(head.line);
    const cursor = Math.max(0, Math.min(head.ch, lineText.length));
    const match = findNumberMatch(lineText, cursor);
    if (!match) return null;

    let start = match.start;
    let end = match.end;

    if (end < lineText.length && /\s/.test(lineText[end] ?? '')) {
        end += 1;
    } else if (start > 0 && /\s/.test(lineText[start - 1] ?? '')) {
        start -= 1;
    }

    return adjustRangeForVisualMode(
        [createPos(head.line, start), createPos(head.line, end)],
        vim,
    );
};
