import type { EditorView } from '@codemirror/view';
import {
    isTreeAvailable,
    findContainingNodeOfType,
    getNodeAtPosition,
    hasAncestorOfType,
} from '../treesitter/js-api';

interface DocLike {
    lineAt(pos: number): { number: number; text: string };
    line(n: number): { text: string };
    lines: number;
}

interface EditorStateLike {
    doc: DocLike;
}

export type CursorContextType = 'prose' | 'code' | 'frontmatter';

export interface CursorContext {
    type: CursorContextType;
    language?: string;
}

const FENCE_RE = /^(`{3,}|~{3,})\s*(.*)/;

function detectCursorContextTreesitter(
    view: EditorView,
    pos: number,
): CursorContext | null {
    if (!isTreeAvailable(view)) return null;

    const doc = view.state.doc;
    const line = doc.lineAt(pos);
    const row = line.number - 1;
    const col = pos - line.from;

    const node = getNodeAtPosition(view, row, col);
    if (!node) return null;

    if (
        node.type === 'minus_metadata' ||
        hasAncestorOfType(node, 'minus_metadata')
    ) {
        return { type: 'frontmatter' };
    }

    const codeBlock = findContainingNodeOfType(
        view,
        row,
        col,
        'fenced_code_block',
    );
    if (codeBlock) {
        let language: string | undefined;
        for (let i = 0; i < codeBlock.childCount; i++) {
            const child = codeBlock.child(i);
            if (child?.type === 'info_string') {
                const langNode = child.child(0);
                if (langNode) {
                    language = view.state.doc.sliceString(
                        langNode.startIndex,
                        langNode.endIndex,
                    );
                }
                break;
            }
        }
        return { type: 'code', language: language || undefined };
    }

    return { type: 'prose' };
}

export function detectCursorContext(
    state: EditorStateLike,
    pos: number,
    view?: EditorView,
): CursorContext {
    if (view) {
        const tsResult = detectCursorContextTreesitter(view, pos);
        if (tsResult) return tsResult;
    }
    const doc = state.doc;
    const cursorLine = doc.lineAt(pos).number;

    const firstLine = doc.line(1).text.trim();
    if (firstLine === '---') {
        for (let i = 2; i <= doc.lines; i++) {
            const line = doc.line(i).text.trim();
            if (line === '---' || line === '...') {
                if (cursorLine >= 1 && cursorLine <= i) {
                    return { type: 'frontmatter' };
                }
                break;
            }
        }
    }

    let openFence: {
        line: number;
        marker: string;
        language: string;
    } | null = null;

    for (let i = 1; i <= doc.lines; i++) {
        const lineText = doc.line(i).text;
        const match = FENCE_RE.exec(lineText);
        const fenceMarker = match?.[1];
        if (fenceMarker) {
            if (!openFence) {
                openFence = {
                    line: i,
                    marker: fenceMarker.charAt(0),
                    language: (match?.[2] ?? '').trim(),
                };
            } else if (lineText.trim().startsWith(openFence.marker.repeat(3))) {
                if (cursorLine > openFence.line && cursorLine < i) {
                    return {
                        type: 'code',
                        language: openFence.language || undefined,
                    };
                }
                openFence = null;
            }
        }
    }

    return { type: 'prose' };
}

export function matchesContext(
    snippetContext: string | undefined,
    cursorContext: CursorContext,
): boolean {
    if (!snippetContext) return true;

    switch (snippetContext) {
        case 'prose':
            return cursorContext.type === 'prose';
        case 'frontmatter':
            return cursorContext.type === 'frontmatter';
        case 'code:*':
            return cursorContext.type === 'code';
        default:
            if (snippetContext.startsWith('code:')) {
                const lang = snippetContext.slice(5);
                return (
                    cursorContext.type === 'code' &&
                    cursorContext.language?.toLowerCase() === lang.toLowerCase()
                );
            }
            return true;
    }
}
