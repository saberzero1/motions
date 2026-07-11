import { codeFolding } from '@codemirror/language';
import type { Extension, EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

const HEADING_RE = /^(#{1,6})\s+(.+)/;
const FENCED_CODE_RE = /^(`{3,}|~{3,})\s*(.*)/;
const FRONTMATTER_RE = /^---\s*$/;
const CALLOUT_RE = /^(\s*>)\s*\[!(\w+)\]\s*(.*)/;

function describeFoldRange(
    state: EditorState,
    range: { from: number; to: number },
): string {
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
