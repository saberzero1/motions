import { foldService } from '@codemirror/language';
import type { Extension, EditorState } from '@codemirror/state';
import type { Node } from 'web-tree-sitter';
import { treeSitterTreeField } from '../treesitter/tree-state';

const FRONTMATTER_DELIM = /^---\s*$/;
const CALLOUT_START = /^(\s*>)\s*\[!.+\]/;
const QUOTE_LINE = /^\s*>/;
const HEADING_RE = /^(#{1,6})\s/;

function frontmatterFold(
    state: EditorState,
    lineStart: number,
    lineEnd: number,
): { from: number; to: number } | null {
    const line = state.doc.lineAt(lineStart);
    if (line.number !== 1) return null;
    if (!FRONTMATTER_DELIM.test(line.text)) return null;

    for (let i = line.number + 1; i <= state.doc.lines; i++) {
        const candidate = state.doc.line(i);
        if (FRONTMATTER_DELIM.test(candidate.text)) {
            if (candidate.to <= lineEnd) return null;
            return { from: lineEnd, to: candidate.to };
        }
    }
    return null;
}

function calloutFold(
    state: EditorState,
    lineStart: number,
    lineEnd: number,
): { from: number; to: number } | null {
    const line = state.doc.lineAt(lineStart);
    if (!CALLOUT_START.test(line.text)) return null;

    let endPos = lineEnd;
    for (let i = line.number + 1; i <= state.doc.lines; i++) {
        const next = state.doc.line(i);
        if (!QUOTE_LINE.test(next.text)) break;
        endPos = next.to;
    }

    if (endPos <= lineEnd) return null;
    return { from: lineEnd, to: endPos };
}

function headingFold(
    state: EditorState,
    lineStart: number,
    lineEnd: number,
): { from: number; to: number } | null {
    const line = state.doc.lineAt(lineStart);
    const match = HEADING_RE.exec(line.text);
    if (!match?.[1]) return null;
    const level = match[1].length;

    let lastContentLine = -1;
    for (let i = line.number + 1; i <= state.doc.lines; i++) {
        const next = state.doc.line(i);
        const nextMatch = HEADING_RE.exec(next.text);
        if (nextMatch?.[1] && nextMatch[1].length <= level) break;
        if (next.text.trim().length > 0) lastContentLine = i;
    }

    if (lastContentLine === -1) return null;
    const endLine = state.doc.line(lastContentLine);
    if (endLine.to <= lineEnd) return null;
    return { from: lineEnd, to: endLine.to };
}

function treesitterHeadingFold(
    state: EditorState,
    lineStart: number,
    lineEnd: number,
): { from: number; to: number } | null {
    let tree;
    try {
        tree = state.field(treeSitterTreeField);
    } catch {
        return null;
    }
    if (!tree) return null;

    const line = state.doc.lineAt(lineStart);
    const row = line.number - 1;

    const node = tree.rootNode.descendantForPosition({ row, column: 0 });
    if (!node) return null;

    let section: Node | null = null;
    let current: Node | null = node;
    while (current) {
        if (current.type === 'section' && current.startPosition.row === row) {
            section = current;
            break;
        }
        current = current.parent;
    }
    if (!section) return null;

    let hasHeading = false;
    for (let i = 0; i < section.childCount; i++) {
        const child = section.child(i);
        if (child?.type === 'atx_heading' && child.startPosition.row === row) {
            hasHeading = true;
            break;
        }
    }
    if (!hasHeading) return null;

    const sectionEndRow = section.endPosition.row;
    const sectionEndCol = section.endPosition.column;

    let lastContentRow = -1;
    for (let r = sectionEndRow; r > row; r--) {
        const docLine = state.doc.line(r + 1);
        if (docLine.text.trim().length > 0) {
            lastContentRow = r;
            break;
        }
    }
    if (sectionEndCol > 0) lastContentRow = sectionEndRow;

    if (lastContentRow <= row) return null;

    const endLine = state.doc.line(lastContentRow + 1);
    if (endLine.to <= lineEnd) return null;
    return { from: lineEnd, to: endLine.to };
}

export function markdownFoldProvider(): Extension {
    return [
        foldService.of((state, lineStart, lineEnd) => {
            return (
                frontmatterFold(state, lineStart, lineEnd) ??
                calloutFold(state, lineStart, lineEnd) ??
                treesitterHeadingFold(state, lineStart, lineEnd) ??
                headingFold(state, lineStart, lineEnd)
            );
        }),
    ];
}
