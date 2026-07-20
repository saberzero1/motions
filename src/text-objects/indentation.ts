import type { MotionFn, VimPos } from '../types/vim-api';
import { adjustRangeForVisualMode } from './delimiter';

const createPos = (line: number, ch: number): VimPos => ({ line, ch });

const isBlankLine = (lineText: string): boolean => /^\s*$/.test(lineText);

const getIndentLevel = (lineText: string, tabSize: number): number => {
    let col = 0;
    for (let i = 0; i < lineText.length; i += 1) {
        const char = lineText[i];
        if (char === ' ') {
            col += 1;
            continue;
        }
        if (char === '\t') {
            col += tabSize - (col % tabSize);
            continue;
        }
        break;
    }
    return col;
};

const getTabSize = (cm: { cm6: { state: { tabSize: number } } }): number =>
    cm.cm6.state.tabSize;

export const indentationInner: MotionFn = (cm, head, _ma, vim) => {
    const lineText = cm.getLine(head.line);
    if (isBlankLine(lineText)) return null;

    const tabSize = getTabSize(cm);
    const indent = getIndentLevel(lineText, tabSize);
    if (indent === 0) return null;

    let startLine = head.line;
    for (let line = head.line - 1; line >= 0; line -= 1) {
        const text = cm.getLine(line);
        if (isBlankLine(text)) break;
        const level = getIndentLevel(text, tabSize);
        if (level < indent) break;
        startLine = line;
    }

    const lastLine = cm.lastLine();
    let endLine = head.line;
    for (let line = head.line + 1; line <= lastLine; line += 1) {
        const text = cm.getLine(line);
        if (isBlankLine(text)) break;
        const level = getIndentLevel(text, tabSize);
        if (level < indent) break;
        endLine = line;
    }

    const endLineLength = cm.getLine(endLine).length;
    return adjustRangeForVisualMode(
        [createPos(startLine, 0), createPos(endLine, endLineLength)],
        vim,
    );
};

export const indentationAround: MotionFn = (cm, head, _ma, vim) => {
    const lineText = cm.getLine(head.line);
    if (isBlankLine(lineText)) return null;

    const tabSize = getTabSize(cm);
    const indent = getIndentLevel(lineText, tabSize);
    if (indent === 0) return null;

    let startLine = head.line;
    for (let line = head.line - 1; line >= 0; line -= 1) {
        const text = cm.getLine(line);
        if (isBlankLine(text)) break;
        const level = getIndentLevel(text, tabSize);
        if (level < indent) break;
        startLine = line;
    }

    const lastLine = cm.lastLine();
    let endLine = head.line;
    for (let line = head.line + 1; line <= lastLine; line += 1) {
        const text = cm.getLine(line);
        if (isBlankLine(text)) break;
        const level = getIndentLevel(text, tabSize);
        if (level < indent) break;
        endLine = line;
    }

    if (startLine > 0) {
        const aboveText = cm.getLine(startLine - 1);
        if (!isBlankLine(aboveText)) {
            const aboveIndent = getIndentLevel(aboveText, tabSize);
            if (aboveIndent < indent) startLine -= 1;
        }
    }

    while (endLine < lastLine && isBlankLine(cm.getLine(endLine + 1))) {
        endLine += 1;
    }

    const endLineLength = cm.getLine(endLine).length;
    return adjustRangeForVisualMode(
        [createPos(startLine, 0), createPos(endLine, endLineLength)],
        vim,
    );
};
