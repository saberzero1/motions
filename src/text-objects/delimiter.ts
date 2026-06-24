import type { MotionFn, VimPos, VimState } from '../types/vim-api';
import { findFenceLines } from './code-block';

const createPos = (line: number, ch: number): VimPos => ({ line, ch });

const isLineInCodeBlock = (
    line: number,
    fences: { openLine: number; closeLine: number }[],
): boolean =>
    fences.some((pair) => line >= pair.openLine && line <= pair.closeLine);

/**
 * Adjust a text object range for visual mode.
 *
 * CodeMirror-Vim's `makeCmSelection` adds +1 to `sel.head` in visual mode
 * (because visual selections are inclusive).  Built-in text objects
 * compensate via an internal `expandSelection` helper that subtracts 1,
 * but custom `defineMotion` text objects bypass that path.
 *
 * This helper applies the same −1 compensation so the visual highlight
 * covers exactly the intended range.
 */
export function adjustRangeForVisualMode(
    range: [VimPos, VimPos],
    vim: VimState,
): [VimPos, VimPos] {
    if (!vim.visualMode) return range;
    const [from, to] = range;
    const forward =
        to.line > from.line || (to.line === from.line && to.ch >= from.ch);
    if (!forward) return range;
    return [from, createPos(to.line, to.ch - 1)];
}

const findDelimiterOccurrences = (
    line: string,
    delimiter: string,
): number[] => {
    const positions: number[] = [];
    const length = delimiter.length;
    if (length === 0) return positions;
    let index = 0;
    while (index <= line.length - length) {
        const found = line.indexOf(delimiter, index);
        if (found === -1) break;
        positions.push(found);
        index = found + length;
    }
    return positions;
};

const findContainingPair = (
    positions: number[],
    cursor: number,
    delimiterLength: number,
    inner: boolean,
): { start: number; end: number } | null => {
    let best: { start: number; end: number; span: number } | null = null;
    for (let i = 0; i < positions.length - 1; i += 1) {
        const start = positions[i];
        if (start === undefined) continue;
        if (cursor < start) continue;
        for (let j = i + 1; j < positions.length; j += 1) {
            const end = positions[j];
            if (end === undefined) continue;
            const endInclusive = end + delimiterLength - 1;
            if (cursor > endInclusive) continue;
            if (inner) {
                const cursorOnOpen =
                    cursor >= start && cursor < start + delimiterLength;
                const cursorOnClose = cursor >= end && cursor <= endInclusive;
                if (cursorOnOpen || cursorOnClose) continue;
            }
            const span = end - start;
            if (!best || span < best.span) {
                best = { start, end, span };
            }
            break;
        }
    }
    if (!best) return null;
    return { start: best.start, end: best.end };
};

const buildRange = (
    line: number,
    pair: { start: number; end: number },
    delimiterLength: number,
    inner: boolean,
): [VimPos, VimPos] | null => {
    if (inner) {
        const innerStart = pair.start + delimiterLength;
        const innerEnd = pair.end;
        if (innerStart >= innerEnd) return null;
        return [createPos(line, innerStart), createPos(line, innerEnd)];
    }
    const aroundEnd = pair.end + delimiterLength;
    return [createPos(line, pair.start), createPos(line, aroundEnd)];
};

/**
 * Create a smart asterisk text object that disambiguates `**bold**` vs `*italic*`.
 * Tries `**` first; falls back to `*` if no `**` pair contains the cursor.
 */
export function createSmartAsteriskTextObject(scanLimit = 20): MotionFn {
    const doubleStar = createMultiLineDelimiterTextObject('**', scanLimit);
    const singleStar = createMultiLineDelimiterTextObject('*', scanLimit);

    return (cm, head, motionArgs, vim, inputState) => {
        const doubleResult = doubleStar(cm, head, motionArgs, vim, inputState);
        if (doubleResult) return doubleResult;
        return singleStar(cm, head, motionArgs, vim, inputState);
    };
}

/** Create a paired-delimiter text object motion. */
export function createDelimiterTextObject(delimiter: string): MotionFn {
    return (cm, head, motionArgs, vim) => {
        const lineText = cm.getLine(head.line);
        const cursor = Math.max(0, Math.min(head.ch, lineText.length));
        const positions = findDelimiterOccurrences(lineText, delimiter);
        if (positions.length < 2) return null;
        const inner = motionArgs.textObjectInner === true;
        const pair = findContainingPair(
            positions,
            cursor,
            delimiter.length,
            inner,
        );
        if (!pair) return null;
        const range = buildRange(head.line, pair, delimiter.length, inner);
        if (!range) return null;
        return adjustRangeForVisualMode(range, vim);
    };
}

function findOpeningDelimiterBackward(
    cm: { getLine(n: number): string; firstLine(): number },
    delimiter: string,
    startLine: number,
    startCh: number,
    scanLimit: number,
    fences: { openLine: number; closeLine: number }[],
): { line: number; ch: number } | null {
    const firstLine = cm.firstLine();
    const minLine = Math.max(firstLine, startLine - scanLimit);

    if (!isLineInCodeBlock(startLine, fences)) {
        const currentLine = cm.getLine(startLine);
        const beforeCursor = currentLine.substring(0, startCh + 1);
        const idx = beforeCursor.lastIndexOf(delimiter);
        if (idx !== -1) return { line: startLine, ch: idx };
    }

    for (let line = startLine - 1; line >= minLine; line--) {
        if (isLineInCodeBlock(line, fences)) continue;
        const text = cm.getLine(line);
        const found = text.lastIndexOf(delimiter);
        if (found !== -1) return { line, ch: found };
    }
    return null;
}

function findClosingDelimiterForward(
    cm: { getLine(n: number): string; lastLine(): number },
    delimiter: string,
    startLine: number,
    startCh: number,
    scanLimit: number,
    fences: { openLine: number; closeLine: number }[],
): { line: number; ch: number } | null {
    const lastLine = cm.lastLine();
    const maxLine = Math.min(lastLine, startLine + scanLimit);

    if (!isLineInCodeBlock(startLine, fences)) {
        const currentLine = cm.getLine(startLine);
        const afterOpen = startCh + delimiter.length;
        if (afterOpen < currentLine.length) {
            const idx = currentLine.indexOf(delimiter, afterOpen);
            if (idx !== -1) return { line: startLine, ch: idx };
        }
    }

    for (let line = startLine + 1; line <= maxLine; line++) {
        if (isLineInCodeBlock(line, fences)) continue;
        const text = cm.getLine(line);
        const found = text.indexOf(delimiter);
        if (found !== -1) return { line, ch: found };
    }
    return null;
}

export function createMultiLineDelimiterTextObject(
    delimiter: string,
    scanLimit = 20,
): MotionFn {
    const singleLine = createDelimiterTextObject(delimiter);

    return (cm, head, motionArgs, vim, inputState) => {
        const singleResult = singleLine(cm, head, motionArgs, vim, inputState);
        if (singleResult) return singleResult;

        const fences = findFenceLines(cm);

        const open = findOpeningDelimiterBackward(
            cm,
            delimiter,
            head.line,
            head.ch,
            scanLimit,
            fences,
        );
        if (!open) return null;

        const close = findClosingDelimiterForward(
            cm,
            delimiter,
            open.line,
            open.ch,
            scanLimit,
            fences,
        );
        if (!close) return null;

        const inner = motionArgs.textObjectInner === true;
        const cursorAfterOpen = inner
            ? head.line > open.line ||
              (head.line === open.line && head.ch >= open.ch + delimiter.length)
            : head.line > open.line ||
              (head.line === open.line && head.ch >= open.ch);
        const cursorBeforeClose = inner
            ? head.line < close.line ||
              (head.line === close.line && head.ch < close.ch)
            : head.line < close.line ||
              (head.line === close.line &&
                  head.ch <= close.ch + delimiter.length - 1);
        if (!cursorAfterOpen || !cursorBeforeClose) return null;
        if (inner) {
            const innerStartCh = open.ch + delimiter.length;
            const innerStartLine = open.line;
            if (innerStartLine === close.line && innerStartCh >= close.ch)
                return null;
            return adjustRangeForVisualMode(
                [
                    createPos(innerStartLine, innerStartCh),
                    createPos(close.line, close.ch),
                ],
                vim,
            );
        }
        return adjustRangeForVisualMode(
            [
                createPos(open.line, open.ch),
                createPos(close.line, close.ch + delimiter.length),
            ],
            vim,
        );
    };
}
