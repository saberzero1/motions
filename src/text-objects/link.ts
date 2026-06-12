import type { MotionFn, VimPos } from '../types/vim-api';

const createPos = (line: number, ch: number): VimPos => ({ line, ch });

interface LinkMatch {
    fullStart: number;
    fullEnd: number;
    textStart: number;
    textEnd: number;
}

function findWikilinks(lineText: string): LinkMatch[] {
    const results: LinkMatch[] = [];
    let idx = 0;
    while (idx < lineText.length) {
        const open = lineText.indexOf('[[', idx);
        if (open === -1) break;
        const close = lineText.indexOf(']]', open + 2);
        if (close === -1) break;
        results.push({
            fullStart: open,
            fullEnd: close + 2,
            textStart: open + 2,
            textEnd: close,
        });
        idx = close + 2;
    }
    return results;
}

function findMarkdownLinks(lineText: string): LinkMatch[] {
    const results: LinkMatch[] = [];
    let idx = 0;
    while (idx < lineText.length) {
        const bracket = lineText.indexOf('[', idx);
        if (bracket === -1) break;
        if (bracket > 0 && lineText[bracket - 1] === '[') {
            idx = bracket + 1;
            continue;
        }
        const closeBracket = lineText.indexOf('](', bracket + 1);
        if (closeBracket === -1) {
            idx = bracket + 1;
            continue;
        }
        const closeParen = lineText.indexOf(')', closeBracket + 2);
        if (closeParen === -1) {
            idx = closeBracket + 1;
            continue;
        }
        results.push({
            fullStart: bracket,
            fullEnd: closeParen + 1,
            textStart: bracket + 1,
            textEnd: closeBracket,
        });
        idx = closeParen + 1;
    }
    return results;
}

function findContainingLink(
    links: LinkMatch[],
    cursor: number,
): LinkMatch | null {
    let best: LinkMatch | null = null;
    for (const link of links) {
        if (cursor >= link.fullStart && cursor < link.fullEnd) {
            if (
                !best ||
                link.fullEnd - link.fullStart < best.fullEnd - best.fullStart
            ) {
                best = link;
            }
        }
    }
    return best;
}

export const linkInnerTextObject: MotionFn = (cm, head, _motionArgs) => {
    const lineText = cm.getLine(head.line);
    const cursor = head.ch;

    const allLinks = [
        ...findWikilinks(lineText),
        ...findMarkdownLinks(lineText),
    ];
    const link = findContainingLink(allLinks, cursor);
    if (!link) return null;

    if (link.textStart >= link.textEnd) return null;
    return [
        createPos(head.line, link.textStart),
        createPos(head.line, link.textEnd),
    ];
};

export const linkAroundTextObject: MotionFn = (cm, head, _motionArgs) => {
    const lineText = cm.getLine(head.line);
    const cursor = head.ch;

    const allLinks = [
        ...findWikilinks(lineText),
        ...findMarkdownLinks(lineText),
    ];
    const link = findContainingLink(allLinks, cursor);
    if (!link) return null;

    return [
        createPos(head.line, link.fullStart),
        createPos(head.line, link.fullEnd),
    ];
};
