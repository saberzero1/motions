import type { MotionFn, VimPos } from '../types/vim-api';

const createPos = (line: number, ch: number): VimPos => ({ line, ch });
const QUOTE_RE = /^(\s*>+)\s?/;
const CALLOUT_RE = /^(\s*>)\s*\[!.+\]/;

function isQuoteLine(lineText: string): boolean {
    return QUOTE_RE.test(lineText);
}

function isCalloutStart(lineText: string): boolean {
    return CALLOUT_RE.test(lineText);
}

function quoteDepth(lineText: string): number {
    const match = QUOTE_RE.exec(lineText);
    if (!match || !match[1]) return 0;
    return (match[1].match(/>/g) ?? []).length;
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
    const match = QUOTE_RE.exec(lineText);
    if (!match) return lineText;
    return lineText.substring(match[0].length);
}

export const blockquoteInnerTextObject: MotionFn = (cm, head) => {
    const cursorDepth = quoteDepth(cm.getLine(head.line));
    if (cursorDepth === 0) return null;
    const range = findBlockRange(
        cm,
        head.line,
        (line) => quoteDepth(line) >= cursorDepth,
    );
    if (!range) return null;

    // Strip prefix at exactly cursorDepth level, not the full prefix.
    // For a range with mixed depths (e.g., cursor at depth 2, range
    // includes a `>>>` line at depth 3), the regex strips exactly
    // cursorDepth `>` characters. For `>>> text` at cursorDepth=2,
    // this strips `>> ` leaving `> text` — correct, because the inner
    // content at depth 2 includes the remaining `>` nesting.
    const depthPrefix = '>'.repeat(cursorDepth);
    const prefixRe = new RegExp(`^\\s*${depthPrefix}\\s?`);
    const firstMatch = prefixRe.exec(cm.getLine(range.startLine));
    const prefixLen = firstMatch ? firstMatch[0].length : cursorDepth + 1;

    const lastLineText = cm.getLine(range.endLine);
    const lastMatch = prefixRe.exec(lastLineText);
    const lastPrefixLen = lastMatch ? lastMatch[0].length : prefixLen;
    const lastLineContent = lastLineText.substring(lastPrefixLen);

    return [
        createPos(range.startLine, prefixLen),
        createPos(range.endLine, lastPrefixLen + lastLineContent.length),
    ];
};

export const blockquoteAroundTextObject: MotionFn = (cm, head) => {
    const cursorDepth = quoteDepth(cm.getLine(head.line));
    if (cursorDepth === 0) return null;
    const range = findBlockRange(
        cm,
        head.line,
        (line) => quoteDepth(line) >= cursorDepth,
    );
    if (!range) return null;

    const lastLineText = cm.getLine(range.endLine);
    return [
        createPos(range.startLine, 0),
        createPos(range.endLine, lastLineText.length),
    ];
};

export const calloutInnerTextObject: MotionFn = (cm, head) => {
    const range = findCalloutRange(cm, head.line);
    if (!range) return null;

    if (range.startLine === range.endLine) return null;

    const innerStart = range.startLine + 1;
    const firstPrefix = QUOTE_RE.exec(cm.getLine(innerStart));
    const prefixLen = firstPrefix ? firstPrefix[0].length : 2;
    const lastLineContent = stripQuotePrefix(cm.getLine(range.endLine));

    return [
        createPos(innerStart, prefixLen),
        createPos(range.endLine, prefixLen + lastLineContent.length),
    ];
};

export const calloutAroundTextObject: MotionFn = (cm, head) => {
    const range = findCalloutRange(cm, head.line);
    if (!range) return null;

    const lastLineText = cm.getLine(range.endLine);
    return [
        createPos(range.startLine, 0),
        createPos(range.endLine, lastLineText.length),
    ];
};
