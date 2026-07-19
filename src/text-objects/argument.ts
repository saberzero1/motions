import type { MotionFn, VimPos } from '../types/vim-api';
import { adjustRangeForVisualMode } from './delimiter';

const createPos = (line: number, ch: number): VimPos => ({ line, ch });

type BoundaryType = 'comma' | 'open' | 'close';

interface Boundary {
    index: number;
    type: BoundaryType;
}

const isOpenBracket = (char: string | undefined): boolean =>
    char === '(' || char === '[' || char === '{';
const isCloseBracket = (char: string | undefined): boolean =>
    char === ')' || char === ']' || char === '}';

function findLeftBoundary(lineText: string, cursor: number): Boundary | null {
    let depth = 0;
    for (let i = Math.min(cursor - 1, lineText.length - 1); i >= 0; i--) {
        const char = lineText[i];
        if (!char) continue;
        if (isCloseBracket(char)) {
            depth += 1;
            continue;
        }
        if (isOpenBracket(char)) {
            if (depth === 0) return { index: i, type: 'open' };
            depth -= 1;
            continue;
        }
        if (char === ',' && depth === 0) return { index: i, type: 'comma' };
    }
    return null;
}

function findRightBoundary(lineText: string, cursor: number): Boundary | null {
    let depth = 0;
    for (let i = Math.max(0, cursor); i < lineText.length; i++) {
        const char = lineText[i];
        if (!char) continue;
        if (isOpenBracket(char)) {
            depth += 1;
            continue;
        }
        if (isCloseBracket(char)) {
            if (depth === 0) return { index: i, type: 'close' };
            depth -= 1;
            continue;
        }
        if (char === ',' && depth === 0) return { index: i, type: 'comma' };
    }
    return null;
}

function trimWhitespace(
    lineText: string,
    start: number,
    end: number,
): { start: number; end: number } {
    let trimmedStart = start;
    let trimmedEnd = end;
    while (
        trimmedStart < trimmedEnd &&
        /\s/.test(lineText[trimmedStart] ?? '')
    ) {
        trimmedStart += 1;
    }
    while (
        trimmedEnd > trimmedStart &&
        /\s/.test(lineText[trimmedEnd - 1] ?? '')
    ) {
        trimmedEnd -= 1;
    }
    return { start: trimmedStart, end: trimmedEnd };
}

export const argumentInnerTextObject: MotionFn = (cm, head, _ma, vim) => {
    const lineText = cm.getLine(head.line);
    const cursor = Math.max(0, Math.min(head.ch, lineText.length));

    const left = findLeftBoundary(lineText, cursor);
    const right = findRightBoundary(lineText, cursor);

    const rawStart = left ? left.index + 1 : 0;
    const rawEnd = right ? right.index : lineText.length;
    const { start, end } = trimWhitespace(lineText, rawStart, rawEnd);
    if (start >= end) return null;

    return adjustRangeForVisualMode(
        [createPos(head.line, start), createPos(head.line, end)],
        vim,
    );
};

export const argumentAroundTextObject: MotionFn = (cm, head, _ma, vim) => {
    const lineText = cm.getLine(head.line);
    const cursor = Math.max(0, Math.min(head.ch, lineText.length));

    const left = findLeftBoundary(lineText, cursor);
    const right = findRightBoundary(lineText, cursor);

    const rawStart = left ? left.index + 1 : 0;
    const rawEnd = right ? right.index : lineText.length;
    const trimmed = trimWhitespace(lineText, rawStart, rawEnd);
    if (trimmed.start >= trimmed.end) return null;

    let start = trimmed.start;
    let end = trimmed.end;

    if (right?.type === 'comma') {
        end = right.index + 1;
        while (end < lineText.length && /\s/.test(lineText[end] ?? '')) {
            end += 1;
        }
    } else if (left?.type === 'comma') {
        start = left.index;
        while (start > 0 && /\s/.test(lineText[start - 1] ?? '')) {
            start -= 1;
        }
    }

    return adjustRangeForVisualMode(
        [createPos(head.line, start), createPos(head.line, end)],
        vim,
    );
};
