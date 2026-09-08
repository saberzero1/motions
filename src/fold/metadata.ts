import type { EditorState } from '@codemirror/state';
import type { Node, Tree } from 'web-tree-sitter';

export interface HeadingFoldMetadata {
    readonly from: number; // End of heading line; first character hidden by fold.
    readonly to: number; // End of last non-blank content line.
    readonly title: string;
}

export interface FencedCodeFoldMetadata {
    readonly language: string;
}

export interface FoldMetadata {
    readonly headingsByLineStart: ReadonlyMap<number, HeadingFoldMetadata>;
    readonly fencedCodeByLineStart: ReadonlyMap<number, FencedCodeFoldMetadata>;
}

// Exact state identities retain only plain data, never mutable WASM handles.
const metadataByState = new WeakMap<EditorState, FoldMetadata>();

export function setFoldMetadata(
    state: EditorState,
    metadata: FoldMetadata,
): void {
    metadataByState.set(state, metadata);
}

export function getFoldMetadata(state: EditorState): FoldMetadata | undefined {
    return metadataByState.get(state);
}

function extractHeading(
    section: Node,
    state: EditorState,
): [number, HeadingFoldMetadata] | null {
    const heading = section.namedChildren.find(
        (child) =>
            child.type === 'atx_heading' &&
            child.startPosition.row === section.startPosition.row,
    );
    if (!heading) return null;

    const headingRow = heading.startPosition.row;
    if (headingRow >= state.doc.lines) return null;
    const headingLine = state.doc.line(headingRow + 1);

    // A column-zero exclusive end belongs to the next line, not this section.
    let candidateRow =
        section.endPosition.row - (section.endPosition.column === 0 ? 1 : 0);
    candidateRow = Math.min(candidateRow, state.doc.lines - 1);

    let lastContentRow = -1;
    for (let row = candidateRow; row > headingRow; row--) {
        if (state.doc.line(row + 1).text.trim().length > 0) {
            lastContentRow = row;
            break;
        }
    }
    if (lastContentRow <= headingRow) return null;

    const inline = heading.namedChildren.find((c) => c.type === 'inline');
    const title = inline
        ? state.doc.sliceString(inline.startIndex, inline.endIndex).trim()
        : headingLine.text.replace(/^\s{0,3}#{1,6}(?:[ \t]+|$)/, '').trim();

    return [
        headingLine.from,
        {
            from: headingLine.to,
            to: state.doc.line(lastContentRow + 1).to,
            title,
        },
    ];
}

function extractFence(
    node: Node,
    state: EditorState,
): [number, FencedCodeFoldMetadata] | null {
    const row = node.startPosition.row;
    if (row >= state.doc.lines) return null;
    const info = node.namedChildren.find((c) => c.type === 'info_string');
    const language = info
        ? state.doc.sliceString(info.startIndex, info.endIndex).trim()
        : '';
    return [state.doc.line(row + 1).from, { language: language || 'code' }];
}

export function extractFoldMetadata(
    tree: Tree,
    state: EditorState,
): FoldMetadata {
    const headingsByLineStart = new Map<number, HeadingFoldMetadata>();
    const fencedCodeByLineStart = new Map<number, FencedCodeFoldMetadata>();

    for (const node of tree.rootNode.descendantsOfType([
        'section',
        'fenced_code_block',
    ])) {
        if (node.type === 'section') {
            const heading = extractHeading(node, state);
            if (heading) headingsByLineStart.set(...heading);
        } else {
            const fence = extractFence(node, state);
            if (fence) fencedCodeByLineStart.set(...fence);
        }
    }

    return { headingsByLineStart, fencedCodeByLineStart };
}
