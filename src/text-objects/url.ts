import type { MotionFn, VimPos } from '../types/vim-api';
import { adjustRangeForVisualMode } from './delimiter';

const createPos = (line: number, ch: number): VimPos => ({ line, ch });

const URL_RE = /https?:\/\/[^\s<>"'\])]+/g;

const countChar = (text: string, char: string): number =>
    text.split(char).length - 1;

const trimUrlEnd = (lineText: string, start: number, end: number): number => {
    let trimmed = end;
    while (trimmed > start) {
        const lastChar = lineText[trimmed - 1];
        if (lastChar === '.' || lastChar === ',') {
            trimmed -= 1;
            continue;
        }
        if (lastChar === ')') {
            const segment = lineText.slice(start, trimmed);
            const opens = countChar(segment, '(');
            const closes = countChar(segment, ')');
            if (closes > opens) {
                trimmed -= 1;
                continue;
            }
        }
        if (lastChar === ']') {
            const segment = lineText.slice(start, trimmed);
            const opens = countChar(segment, '[');
            const closes = countChar(segment, ']');
            if (closes > opens) {
                trimmed -= 1;
                continue;
            }
        }
        break;
    }
    return trimmed;
};

const findUrlMatch = (
    lineText: string,
    cursor: number,
): { start: number; end: number } | null => {
    const matches: { start: number; end: number }[] = [];
    let match: RegExpExecArray | null;
    const re = new RegExp(URL_RE.source, 'g');
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
};

export const urlTextObject: MotionFn = (cm, head, _ma, vim) => {
    const lineText = cm.getLine(head.line);
    const cursor = Math.max(0, Math.min(head.ch, lineText.length));
    const match = findUrlMatch(lineText, cursor);
    if (!match) return null;

    const trimmedEnd = trimUrlEnd(lineText, match.start, match.end);
    if (trimmedEnd <= match.start) return null;

    return adjustRangeForVisualMode(
        [createPos(head.line, match.start), createPos(head.line, trimmedEnd)],
        vim,
    );
};
