import type { MotionFn, VimPos } from '../types/vim-api';
import { isTreeAvailable, getAllNodesOfType } from '../treesitter/js-api';

const HEADING_RE = /^(#{1,6})\s/;

const HEADING_MARKER_TYPES = [
    'atx_h1_marker',
    'atx_h2_marker',
    'atx_h3_marker',
    'atx_h4_marker',
    'atx_h5_marker',
    'atx_h6_marker',
];

function getHeadingLevel(lineText: string): number {
    const match = HEADING_RE.exec(lineText);
    if (!match?.[1]) return 0;
    return match[1].length;
}

function headingLevelFromNode(node: import('web-tree-sitter').Node): number {
    for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (!child) continue;
        const idx = HEADING_MARKER_TYPES.indexOf(child.type);
        if (idx !== -1) return idx + 1;
    }
    return 0;
}

function createHeadingMotion(forward: boolean, level?: number): MotionFn {
    return (cm, head, motionArgs) => {
        const view = (
            cm as unknown as { cm6?: import('@codemirror/view').EditorView }
        ).cm6;
        if (view && isTreeAvailable(view)) {
            return treesitterHeadingMotion(
                view,
                head,
                motionArgs.repeat ?? 1,
                forward,
                level,
            );
        }
        return regexHeadingMotion(
            cm,
            head,
            motionArgs.repeat ?? 1,
            forward,
            level,
        );
    };
}

function treesitterHeadingMotion(
    view: import('@codemirror/view').EditorView,
    head: VimPos,
    repeat: number,
    forward: boolean,
    level: number | undefined,
): VimPos {
    const headings = getAllNodesOfType(view, 'atx_heading');
    let count = 0;

    if (forward) {
        for (const h of headings) {
            if (h.startPosition.row <= head.line) continue;
            if (level !== undefined && headingLevelFromNode(h) !== level)
                continue;
            count++;
            if (count >= repeat) return { line: h.startPosition.row, ch: 0 };
        }
    } else {
        for (let i = headings.length - 1; i >= 0; i--) {
            const h = headings[i]!;
            if (h.startPosition.row >= head.line) continue;
            if (level !== undefined && headingLevelFromNode(h) !== level)
                continue;
            count++;
            if (count >= repeat) return { line: h.startPosition.row, ch: 0 };
        }
    }

    return head;
}

function regexHeadingMotion(
    cm: { getLine: (n: number) => string; lastLine: () => number },
    head: VimPos,
    repeat: number,
    forward: boolean,
    level: number | undefined,
): VimPos {
    const lastLine = cm.lastLine();
    let count = 0;

    if (forward) {
        for (let i = head.line + 1; i <= lastLine; i++) {
            const headingLevel = getHeadingLevel(cm.getLine(i));
            if (
                headingLevel > 0 &&
                (level === undefined || headingLevel === level)
            ) {
                count++;
                if (count >= repeat) return { line: i, ch: 0 };
            }
        }
    } else {
        for (let i = head.line - 1; i >= 0; i--) {
            const headingLevel = getHeadingLevel(cm.getLine(i));
            if (
                headingLevel > 0 &&
                (level === undefined || headingLevel === level)
            ) {
                count++;
                if (count >= repeat) return { line: i, ch: 0 };
            }
        }
    }

    return head;
}

export const nextHeading = createHeadingMotion(true);
export const prevHeading = createHeadingMotion(false);

export const nextHeading1 = createHeadingMotion(true, 1);
export const prevHeading1 = createHeadingMotion(false, 1);
export const nextHeading2 = createHeadingMotion(true, 2);
export const prevHeading2 = createHeadingMotion(false, 2);
export const nextHeading3 = createHeadingMotion(true, 3);
export const prevHeading3 = createHeadingMotion(false, 3);
export const nextHeading4 = createHeadingMotion(true, 4);
export const prevHeading4 = createHeadingMotion(false, 4);
export const nextHeading5 = createHeadingMotion(true, 5);
export const prevHeading5 = createHeadingMotion(false, 5);
export const nextHeading6 = createHeadingMotion(true, 6);
export const prevHeading6 = createHeadingMotion(false, 6);
