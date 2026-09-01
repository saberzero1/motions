import type { MotionFn, VimPos } from '../types/vim-api';
import { adjustRangeForVisualMode } from './delimiter';
import {
    isTreeAvailable,
    findContainingNodeOfType,
} from '../treesitter/js-api';

const createPos = (line: number, ch: number): VimPos => ({ line, ch });

const FENCE_OPEN = /^((?:>\s*)*)```/;
const FENCE_CLOSE = /^((?:>\s*)*)```\s*$/;

function treesitterCodeBlock(
    cm: Parameters<MotionFn>[0],
    cursorLine: number,
): { openLine: number; closeLine: number } | null {
    const view = (
        cm as unknown as { cm6?: import('@codemirror/view').EditorView }
    ).cm6;
    if (!view || !isTreeAvailable(view)) return null;

    const node = findContainingNodeOfType(
        view,
        cursorLine,
        0,
        'fenced_code_block',
    );
    if (!node) return null;

    return {
        openLine: node.startPosition.row,
        closeLine:
            node.endPosition.column === 0
                ? node.endPosition.row - 1
                : node.endPosition.row,
    };
}

function blockquoteDepth(prefix: string): number {
    return (prefix.match(/>/g) ?? []).length;
}

export function findFenceLines(cm: {
    getLine: (n: number) => string;
    lastLine: () => number;
}): { openLine: number; closeLine: number }[] {
    const pairs: { openLine: number; closeLine: number }[] = [];
    const last = cm.lastLine();
    let i = 0;
    while (i <= last) {
        const text = cm.getLine(i);
        const openMatch = FENCE_OPEN.exec(text);
        if (openMatch) {
            const openDepth = blockquoteDepth(openMatch[1] ?? '');
            const openLine = i;
            i += 1;
            while (i <= last) {
                const closeText = cm.getLine(i);
                const closeMatch = FENCE_CLOSE.exec(closeText);
                if (
                    closeMatch &&
                    blockquoteDepth(closeMatch[1] ?? '') === openDepth
                ) {
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

export function findContainingBlock(
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

export const codeBlockInnerTextObject: MotionFn = (cm, head, _ma, vim) => {
    const block =
        treesitterCodeBlock(cm, head.line) ??
        findContainingBlock(findFenceLines(cm), head.line);
    if (!block) return null;

    const innerStart = block.openLine + 1;
    const innerEnd = block.closeLine - 1;
    if (innerStart > innerEnd) return null;

    const lastLineText = cm.getLine(innerEnd);
    return adjustRangeForVisualMode(
        [createPos(innerStart, 0), createPos(innerEnd, lastLineText.length)],
        vim,
    );
};

export const codeBlockAroundTextObject: MotionFn = (cm, head, _ma, vim) => {
    const block =
        treesitterCodeBlock(cm, head.line) ??
        findContainingBlock(findFenceLines(cm), head.line);
    if (!block) return null;

    const lastLineText = cm.getLine(block.closeLine);
    return adjustRangeForVisualMode(
        [
            createPos(block.openLine, 0),
            createPos(block.closeLine, lastLineText.length),
        ],
        vim,
    );
};
