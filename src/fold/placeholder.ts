import { codeFolding } from '@codemirror/language';
import type { Extension, EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { treeSitterTreeField } from '../treesitter/tree-state';

const HEADING_RE = /^(#{1,6})\s+(.+)/;
const FENCED_CODE_RE = /^(`{3,}|~{3,})\s*(.*)/;
const FRONTMATTER_RE = /^---\s*$/;
const CALLOUT_RE = /^(\s*>)\s*\[!(\w+)\]\s*(.*)/;

function describeFoldRangeTreesitter(
    state: EditorState,
    range: { from: number; to: number },
): string | null {
    let tree;
    try {
        tree = state.field(treeSitterTreeField);
    } catch {
        return null;
    }
    if (!tree) return null;

    const startLine = state.doc.lineAt(range.from);
    const endLine = state.doc.lineAt(range.to);
    const lineCount = endLine.number - startLine.number;
    const row = startLine.number - 1;

    const node = tree.rootNode.descendantForPosition({ row, column: 0 });
    if (!node) return null;

    let current = node;
    while (current) {
        if (
            current.type === 'atx_heading' &&
            current.startPosition.row === row
        ) {
            const inline = current.namedChildren.find(
                (c) => c.type === 'inline',
            );
            const text = inline
                ? state.doc
                      .sliceString(inline.startIndex, inline.endIndex)
                      .trim()
                : startLine.text.replace(/^#+\s*/, '').trim();
            return `${text} — ${lineCount} lines`;
        }
        if (
            current.type === 'fenced_code_block' &&
            current.startPosition.row === row
        ) {
            const info = current.namedChildren.find(
                (c) => c.type === 'info_string',
            );
            const lang = info
                ? state.doc.sliceString(info.startIndex, info.endIndex).trim()
                : 'code';
            return `${lang || 'code'} — ${lineCount} lines`;
        }
        if (current.parent && current.parent.startPosition.row === row) {
            current = current.parent;
        } else {
            break;
        }
    }

    return null;
}

function describeFoldRange(
    state: EditorState,
    range: { from: number; to: number },
): string {
    const tsResult = describeFoldRangeTreesitter(state, range);
    if (tsResult) return tsResult;

    const startLine = state.doc.lineAt(range.from);
    const endLine = state.doc.lineAt(range.to);
    const lineCount = endLine.number - startLine.number;

    const headingMatch = HEADING_RE.exec(startLine.text);
    if (headingMatch?.[2]) {
        return `${headingMatch[2].trim()} — ${lineCount} lines`;
    }

    const codeMatch = FENCED_CODE_RE.exec(startLine.text);
    if (codeMatch) {
        const lang = codeMatch[2]?.trim() || 'code';
        return `${lang} — ${lineCount} lines`;
    }

    if (FRONTMATTER_RE.test(startLine.text)) {
        const fieldCount = lineCount - 1;
        return `properties — ${fieldCount} field${fieldCount !== 1 ? 's' : ''}`;
    }

    const calloutMatch = CALLOUT_RE.exec(startLine.text);
    if (calloutMatch?.[2]) {
        const type = calloutMatch[2];
        const title = calloutMatch[3]?.trim();
        return title
            ? `${type}: ${title} — ${lineCount} lines`
            : `${type} — ${lineCount} lines`;
    }

    return `${lineCount} lines`;
}

function createPlaceholderDOM(
    view: EditorView,
    onclick: (event: Event) => void,
    prepared: string | null,
): HTMLElement {
    const element = createSpan();
    element.textContent = prepared ?? '…';
    element.setAttribute('aria-label', view.state.phrase('folded code'));
    element.title = view.state.phrase('unfold');
    element.className = 'cm-foldPlaceholder';
    element.onclick = onclick;
    return element;
}

export function foldPlaceholderExtension(): Extension {
    return codeFolding({
        preparePlaceholder: (state, range) => describeFoldRange(state, range),
        placeholderDOM: createPlaceholderDOM,
    });
}
