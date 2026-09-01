import type { MotionFn, VimPos } from '../types/vim-api';
import { adjustRangeForVisualMode } from './delimiter';
import {
    isTreeAvailable,
    findContainingNodeOfType,
} from '../treesitter/js-api';

const createPos = (line: number, ch: number): VimPos => ({ line, ch });
const CALLOUT_RE = /^(\s*>)\s*\[!.+\]/;

function treesitterBlockquoteRange(
    cm: Parameters<MotionFn>[0],
    cursorLine: number,
    cursorCh: number,
): {
    startLine: number;
    startCol: number;
    endLine: number;
    endCol: number;
} | null {
    const view = (
        cm as unknown as { cm6?: import('@codemirror/view').EditorView }
    ).cm6;
    if (!view || !isTreeAvailable(view)) return null;

    const node = findContainingNodeOfType(
        view,
        cursorLine,
        cursorCh,
        'block_quote',
    );
    if (!node) return null;

    const endRow =
        node.endPosition.column === 0
            ? node.endPosition.row - 1
            : node.endPosition.row;

    return {
        startLine: node.startPosition.row,
        startCol: node.startPosition.column,
        endLine: endRow,
        endCol:
            node.endPosition.column === 0
                ? cm.getLine(endRow).length
                : node.endPosition.column,
    };
}

function isQuoteLine(lineText: string): boolean {
    return /^\s*>/.test(lineText);
}

function isCalloutStart(lineText: string): boolean {
    return CALLOUT_RE.test(lineText);
}

// Counts `>` in the leading prefix. Handles both `>>` and `> >` formats.
function quoteDepth(lineText: string): number {
    const match = /^([\s>]*)/.exec(lineText);
    if (!match || !match[1]) return 0;
    return (match[1].match(/>/g) ?? []).length;
}

// Returns character length of the blockquote prefix up to `depth` levels.
// Walks `>` markers and interleaved spaces (handles `>> ` and `> > `).
function quotePrefixLength(lineText: string, depth: number): number {
    let count = 0;
    let i = 0;
    while (i < lineText.length && lineText[i] === ' ') i++;
    while (i < lineText.length && count < depth) {
        if (lineText[i] === '>') {
            count++;
            i++;
        } else if (lineText[i] === ' ') {
            i++;
        } else {
            break;
        }
    }
    if (i < lineText.length && lineText[i] === ' ') i++;
    return i;
}

function findBlockRange(
    cm: { getLine: (n: number) => string; lastLine: () => number },
    cursorLine: number,
    matchFn: (line: string) => boolean,
): { startLine: number; endLine: number } | null {
    if (!matchFn(cm.getLine(cursorLine))) return null;

    let startLine = cursorLine;
    while (startLine > 0 && matchFn(cm.getLine(startLine - 1))) {
        startLine--;
    }

    let endLine = cursorLine;
    const last = cm.lastLine();
    while (endLine < last && matchFn(cm.getLine(endLine + 1))) {
        endLine++;
    }

    return { startLine, endLine };
}

function findCalloutRange(
    cm: { getLine: (n: number) => string; lastLine: () => number },
    cursorLine: number,
): { startLine: number; endLine: number } | null {
    let calloutStart = cursorLine;
    while (calloutStart >= 0) {
        if (isCalloutStart(cm.getLine(calloutStart))) break;
        if (!isQuoteLine(cm.getLine(calloutStart))) return null;
        calloutStart--;
    }
    if (calloutStart < 0 || !isCalloutStart(cm.getLine(calloutStart)))
        return null;

    let endLine = calloutStart;
    const last = cm.lastLine();
    while (endLine < last && isQuoteLine(cm.getLine(endLine + 1))) {
        endLine++;
    }

    if (cursorLine < calloutStart || cursorLine > endLine) return null;
    return { startLine: calloutStart, endLine };
}

function stripQuotePrefix(lineText: string): string {
    const depth = quoteDepth(lineText);
    if (depth === 0) return lineText;
    return lineText.substring(quotePrefixLength(lineText, depth));
}

export const blockquoteInnerTextObject: MotionFn = (cm, head, _ma, vim) => {
    const tsRange = treesitterBlockquoteRange(cm, head.line, head.ch);
    if (tsRange) {
        const firstContentLine = tsRange.startLine;
        const markerLine = cm.getLine(firstContentLine);
        const markerMatch = /^(\s*>\s*)/.exec(markerLine);
        const prefixLen = markerMatch
            ? markerMatch[1]!.length
            : tsRange.startCol + 2;

        const lastLine = cm.getLine(tsRange.endLine);
        const lastMarkerMatch = /^(\s*>\s*)/.exec(lastLine);
        const lastPrefixLen = lastMarkerMatch ? lastMarkerMatch[1]!.length : 0;

        return adjustRangeForVisualMode(
            [
                createPos(firstContentLine, prefixLen),
                createPos(
                    tsRange.endLine,
                    lastPrefixLen + lastLine.substring(lastPrefixLen).length,
                ),
            ],
            vim,
        );
    }

    const cursorDepth = quoteDepth(cm.getLine(head.line));
    if (cursorDepth === 0) return null;
    const range = findBlockRange(
        cm,
        head.line,
        (line) => quoteDepth(line) >= cursorDepth,
    );
    if (!range) return null;

    const prefixLen = quotePrefixLength(
        cm.getLine(range.startLine),
        cursorDepth,
    );
    const lastLineText = cm.getLine(range.endLine);
    const lastPrefixLen = quotePrefixLength(lastLineText, cursorDepth);
    const lastLineContent = lastLineText.substring(lastPrefixLen);

    return adjustRangeForVisualMode(
        [
            createPos(range.startLine, prefixLen),
            createPos(range.endLine, lastPrefixLen + lastLineContent.length),
        ],
        vim,
    );
};

export const blockquoteAroundTextObject: MotionFn = (cm, head, _ma, vim) => {
    const tsRange = treesitterBlockquoteRange(cm, head.line, head.ch);
    if (tsRange) {
        const lastLineText = cm.getLine(tsRange.endLine);
        return adjustRangeForVisualMode(
            [
                createPos(tsRange.startLine, tsRange.startCol),
                createPos(tsRange.endLine, lastLineText.length),
            ],
            vim,
        );
    }

    const cursorDepth = quoteDepth(cm.getLine(head.line));
    if (cursorDepth === 0) return null;
    const range = findBlockRange(
        cm,
        head.line,
        (line) => quoteDepth(line) >= cursorDepth,
    );
    if (!range) return null;

    const last = cm.lastLine();
    const hasQuoteAfter =
        range.endLine < last && quoteDepth(cm.getLine(range.endLine + 1)) > 0;
    const hasQuoteBefore =
        range.startLine > 0 && quoteDepth(cm.getLine(range.startLine - 1)) > 0;

    if (hasQuoteAfter) {
        return adjustRangeForVisualMode(
            [createPos(range.startLine, 0), createPos(range.endLine + 1, 0)],
            vim,
        );
    } else if (hasQuoteBefore) {
        const prevLineText = cm.getLine(range.startLine - 1);
        return adjustRangeForVisualMode(
            [
                createPos(range.startLine - 1, prevLineText.length),
                createPos(range.endLine, cm.getLine(range.endLine).length),
            ],
            vim,
        );
    }

    const lastLineText = cm.getLine(range.endLine);
    return adjustRangeForVisualMode(
        [
            createPos(range.startLine, 0),
            createPos(range.endLine, lastLineText.length),
        ],
        vim,
    );
};

export const calloutInnerTextObject: MotionFn = (cm, head, _ma, vim) => {
    const range = findCalloutRange(cm, head.line);
    if (!range) return null;

    if (range.startLine === range.endLine) return null;

    const innerStart = range.startLine + 1;
    const prefixLen = quotePrefixLength(cm.getLine(innerStart), 1);
    const lastLineContent = stripQuotePrefix(cm.getLine(range.endLine));

    return adjustRangeForVisualMode(
        [
            createPos(innerStart, prefixLen),
            createPos(range.endLine, prefixLen + lastLineContent.length),
        ],
        vim,
    );
};

export const calloutAroundTextObject: MotionFn = (cm, head, _ma, vim) => {
    const range = findCalloutRange(cm, head.line);
    if (!range) return null;

    const lastLineText = cm.getLine(range.endLine);
    return adjustRangeForVisualMode(
        [
            createPos(range.startLine, 0),
            createPos(range.endLine, lastLineText.length),
        ],
        vim,
    );
};
