import type { MotionFn, VimPos } from '../types/vim-api';

const createPos = (line: number, ch: number): VimPos => ({ line, ch });

function findFenceLines(cm: {
    getLine: (n: number) => string;
    lastLine: () => number;
}): { openLine: number; closeLine: number }[] {
    const pairs: { openLine: number; closeLine: number }[] = [];
    const last = cm.lastLine();
    let i = 0;
    while (i <= last) {
        const text = cm.getLine(i);
        if (/^```/.test(text)) {
            const openLine = i;
            i += 1;
            while (i <= last) {
                const closeText = cm.getLine(i);
                if (/^```\s*$/.test(closeText)) {
                    pairs.push({ openLine, closeLine: i });
                    break;
                }
                i += 1;
            }
        }
        i += 1;
    }
    return pairs;
}

function findContainingBlock(
    pairs: { openLine: number; closeLine: number }[],
    cursorLine: number,
): { openLine: number; closeLine: number } | null {
    for (const pair of pairs) {
        if (cursorLine >= pair.openLine && cursorLine <= pair.closeLine) {
            return pair;
        }
    }
    return null;
}

export const codeBlockInnerTextObject: MotionFn = (cm, head) => {
    const pairs = findFenceLines(cm);
    const block = findContainingBlock(pairs, head.line);
    if (!block) return null;

    const innerStart = block.openLine + 1;
    const innerEnd = block.closeLine - 1;
    if (innerStart > innerEnd) return null;

    const lastLineText = cm.getLine(innerEnd);
    return [createPos(innerStart, 0), createPos(innerEnd, lastLineText.length)];
};

export const codeBlockAroundTextObject: MotionFn = (cm, head) => {
    const pairs = findFenceLines(cm);
    const block = findContainingBlock(pairs, head.line);
    if (!block) return null;

    const lastLineText = cm.getLine(block.closeLine);
    return [
        createPos(block.openLine, 0),
        createPos(block.closeLine, lastLineText.length),
    ];
};
