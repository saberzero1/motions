import type { CmAdapter, VimPos, MotionFn } from '../types/vim-api';
import { adjustRangeForVisualMode } from './delimiter';

interface TagMatch {
    tag: string;
    from: VimPos;
    to: VimPos;
}

interface TagPair {
    open: TagMatch;
    close: TagMatch;
}

function findOpenTag(cm: CmAdapter, pos: VimPos): TagMatch | null {
    let line = pos.line;
    let ch = pos.ch;

    while (line >= 0) {
        const text = cm.getLine(line);
        const searchEnd = line === pos.line ? ch + 1 : text.length;

        for (let i = searchEnd - 1; i >= 0; i--) {
            if (text[i] === '<' && text[i + 1] !== '/' && text[i + 1] !== '!') {
                const closeAngle = text.indexOf('>', i);
                if (closeAngle === -1) continue;

                const tagContent = text.substring(i + 1, closeAngle);
                const tagName = tagContent.split(/[\s/>]/)[0];
                if (!tagName) continue;

                return {
                    tag: tagName,
                    from: { line, ch: i },
                    to: { line, ch: closeAngle + 1 },
                };
            }
        }
        line--;
        if (line >= 0) ch = cm.getLine(line).length;
    }
    return null;
}

function findCloseTag(
    cm: CmAdapter,
    tagName: string,
    startPos: VimPos,
): TagMatch | null {
    const totalLines = cm.lineCount();
    let depth = 1;
    let line = startPos.line;
    let ch = startPos.ch;

    while (line < totalLines) {
        const text = cm.getLine(line);
        const searchStart = line === startPos.line ? ch : 0;

        for (let i = searchStart; i < text.length; i++) {
            if (text[i] !== '<') continue;

            if (text.substring(i).startsWith(`</${tagName}`)) {
                const closeAngle = text.indexOf('>', i);
                if (closeAngle === -1) continue;
                depth--;
                if (depth === 0) {
                    return {
                        tag: tagName,
                        from: { line, ch: i },
                        to: { line, ch: closeAngle + 1 },
                    };
                }
            } else if (text[i + 1] !== '/' && text[i + 1] !== '!') {
                const closeAngle = text.indexOf('>', i);
                if (closeAngle === -1) continue;
                const tagContent = text.substring(i + 1, closeAngle);
                const openTagName = tagContent.split(/[\s/>]/)[0];
                if (openTagName === tagName && !tagContent.endsWith('/')) {
                    depth++;
                }
                i = closeAngle;
            }
        }
        line++;
    }
    return null;
}

function findEnclosingTagPair(cm: CmAdapter, pos: VimPos): TagPair | null {
    let searchPos = { ...pos };

    for (let attempts = 0; attempts < 50; attempts++) {
        const open = findOpenTag(cm, searchPos);
        if (!open) return null;

        const close = findCloseTag(cm, open.tag, open.to);
        if (!close) {
            searchPos = { line: open.from.line, ch: open.from.ch - 1 };
            if (searchPos.ch < 0) {
                searchPos.line--;
                if (searchPos.line < 0) return null;
                searchPos.ch = cm.getLine(searchPos.line).length;
            }
            continue;
        }

        const posIndex = cm.indexFromPos(pos);

        if (
            posIndex >= cm.indexFromPos(open.from) &&
            posIndex < cm.indexFromPos(close.to)
        ) {
            return { open, close };
        }

        searchPos = { line: open.from.line, ch: open.from.ch - 1 };
        if (searchPos.ch < 0) {
            searchPos.line--;
            if (searchPos.line < 0) return null;
            searchPos.ch = cm.getLine(searchPos.line).length;
        }
    }
    return null;
}

export function createInnerTagMotion(): MotionFn {
    return (cm, head, _ma, vim) => {
        const pair = findEnclosingTagPair(cm, head);
        if (!pair) return null;
        return adjustRangeForVisualMode(
            [
                pair.open.to,
                { line: pair.close.from.line, ch: pair.close.from.ch },
            ],
            vim,
        );
    };
}

export function createAroundTagMotion(): MotionFn {
    return (cm, head, _ma, vim) => {
        const pair = findEnclosingTagPair(cm, head);
        if (!pair) return null;
        return adjustRangeForVisualMode([pair.open.from, pair.close.to], vim);
    };
}
