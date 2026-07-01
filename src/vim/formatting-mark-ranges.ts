import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';

export interface FormattingMarkRange {
    from: number;
    to: number;
    text: string;
}

const FORMATTING_NODE_PATTERNS = [
    'formatting-strong',
    'formatting-em',
    'formatting-code',
    'formatting-strikethrough',
    'formatting-highlight',
];

function isFormattingMarkNode(name: string): boolean {
    return FORMATTING_NODE_PATTERNS.some((p) => name.includes(p));
}

export function collectFormattingMarks(
    state: EditorState,
    lineNumbers: Set<number>,
): FormattingMarkRange[] {
    const result: FormattingMarkRange[] = [];
    const tree = syntaxTree(state);

    for (const lineNum of lineNumbers) {
        if (lineNum < 1 || lineNum > state.doc.lines) continue;
        const line = state.doc.line(lineNum);

        tree.iterate({
            from: line.from,
            to: line.to,
            enter(node) {
                if (!isFormattingMarkNode(node.type.name)) return;
                const len = node.to - node.from;
                if (len < 1 || len > 3) return;
                result.push({
                    from: node.from,
                    to: node.to,
                    text: state.doc.sliceString(node.from, node.to),
                });
            },
        });
    }

    result.sort((a, b) => a.from - b.from);
    return result;
}
