import type { MotionFn, VimPos } from '../types/vim-api';
import { adjustRangeForVisualMode } from './delimiter';

const createPos = (line: number, ch: number): VimPos => ({ line, ch });

const findDelimiterOccurrences = (
    line: string,
    delimiter: string,
): number[] => {
    const positions: number[] = [];
    if (!delimiter) return positions;
    let index = 0;
    while (index <= line.length - delimiter.length) {
        const found = line.indexOf(delimiter, index);
        if (found === -1) break;
        positions.push(found);
        index = found + delimiter.length;
    }
    return positions;
};

const isMatchAt = (line: string, index: number, token: string): boolean =>
    line.startsWith(token, index);

const findSymmetricPair = (
    lineText: string,
    delimiter: string,
    cursor: number,
): { start: number; end: number } | null => {
    const positions = findDelimiterOccurrences(lineText, delimiter);
    if (positions.length < 2) return null;
    for (let i = 0; i < positions.length - 1; i += 2) {
        const start = positions[i];
        const end = positions[i + 1];
        if (start === undefined || end === undefined) continue;
        const endInclusive = end + delimiter.length - 1;
        if (cursor >= start && cursor <= endInclusive) {
            return { start, end };
        }
    }
    return null;
};

const findOpeningDelimiterBackward = (
    cm: { getLine(n: number): string; firstLine(): number },
    open: string,
    close: string,
    startLine: number,
    startCh: number,
    scanLimit: number,
    multiline: boolean,
): VimPos | null => {
    const firstLine = cm.firstLine();
    const minLine = multiline
        ? Math.max(firstLine, startLine - scanLimit)
        : startLine;
    let depth = 0;

    for (let line = startLine; line >= minLine; line--) {
        const text = cm.getLine(line);
        const maxIndex = Math.min(
            line === startLine ? startCh : text.length - 1,
            text.length - 1,
        );
        for (let i = maxIndex; i >= 0; i--) {
            if (i + close.length <= text.length && isMatchAt(text, i, close)) {
                depth += 1;
                continue;
            }
            if (i + open.length <= text.length && isMatchAt(text, i, open)) {
                if (depth === 0) return createPos(line, i);
                depth -= 1;
            }
        }
    }
    return null;
};

const findClosingDelimiterForward = (
    cm: { getLine(n: number): string; lastLine(): number },
    open: string,
    close: string,
    startLine: number,
    startCh: number,
    scanLimit: number,
    multiline: boolean,
): VimPos | null => {
    const lastLine = cm.lastLine();
    const maxLine = multiline
        ? Math.min(lastLine, startLine + scanLimit)
        : startLine;
    let depth = 1;

    for (let line = startLine; line <= maxLine; line++) {
        const text = cm.getLine(line);
        const minIndex = Math.max(0, line === startLine ? startCh : 0);
        for (let i = minIndex; i < text.length; i++) {
            if (i + open.length <= text.length && isMatchAt(text, i, open)) {
                depth += 1;
                continue;
            }
            if (i + close.length <= text.length && isMatchAt(text, i, close)) {
                depth -= 1;
                if (depth === 0) return createPos(line, i);
            }
        }
    }
    return null;
};

/**
 * Creates a MotionFn that selects content between asymmetric delimiter pairs.
 * Handles nesting correctly.
 */
export function createAsymmetricPairTextObject(
    open: string,
    close: string,
    multiline: boolean,
    inner: boolean,
    scanLimit: number,
): MotionFn {
    return (cm, head, _motionArgs, vim) => {
        const lineText = cm.getLine(head.line);
        const cursor = Math.max(0, Math.min(head.ch, lineText.length));

        if (open === close) {
            const pair = findSymmetricPair(lineText, open, cursor);
            if (!pair) return null;
            const innerStart = pair.start + open.length;
            const innerEnd = pair.end;
            if (inner && innerStart >= innerEnd) return null;
            const range: [VimPos, VimPos] = inner
                ? [
                      createPos(head.line, innerStart),
                      createPos(head.line, innerEnd),
                  ]
                : [
                      createPos(head.line, pair.start),
                      createPos(head.line, pair.end + open.length),
                  ];
            return adjustRangeForVisualMode(range, vim);
        }

        const openPos = findOpeningDelimiterBackward(
            cm,
            open,
            close,
            head.line,
            cursor,
            scanLimit,
            multiline,
        );
        if (!openPos) return null;

        const closePos = findClosingDelimiterForward(
            cm,
            open,
            close,
            head.line,
            cursor,
            scanLimit,
            multiline,
        );
        if (!closePos) return null;

        if (inner) {
            const innerStart = openPos.ch + open.length;
            const innerEnd = closePos.ch;
            if (openPos.line === closePos.line && innerStart >= innerEnd) {
                return null;
            }
            return adjustRangeForVisualMode(
                [
                    createPos(openPos.line, innerStart),
                    createPos(closePos.line, innerEnd),
                ],
                vim,
            );
        }

        return adjustRangeForVisualMode(
            [
                createPos(openPos.line, openPos.ch),
                createPos(closePos.line, closePos.ch + close.length),
            ],
            vim,
        );
    };
}
