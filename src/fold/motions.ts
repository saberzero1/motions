import { foldable, foldedRanges } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import type { MotionFn, VimPos } from '../types/vim-api';

export function findNextFoldable(
    state: EditorState,
    fromLine: number,
    parentRange?: { from: number; to: number } | null,
): { from: number; to: number; line: number } | null {
    for (let i = fromLine + 1; i <= state.doc.lines; i++) {
        const line = state.doc.line(i);
        const range = foldable(state, line.from, line.to);
        if (!range) continue;
        // Skip child folds contained within the parent's range
        if (
            parentRange &&
            range.from >= parentRange.from &&
            range.to <= parentRange.to
        )
            continue;
        return { from: range.from, to: range.to, line: i - 1 };
    }
    return null;
}

export function findPrevFoldable(
    state: EditorState,
    fromLine: number,
    parentRange?: { from: number; to: number } | null,
): { from: number; to: number; line: number } | null {
    for (let i = fromLine - 1; i >= 1; i--) {
        const line = state.doc.line(i);
        const range = foldable(state, line.from, line.to);
        if (!range) continue;
        // Skip child folds contained within the parent's range
        if (
            parentRange &&
            range.from >= parentRange.from &&
            range.to <= parentRange.to
        )
            continue;
        return { from: range.from, to: range.to, line: i - 1 };
    }
    return null;
}

export function findEnclosingFoldable(
    state: EditorState,
    pos: number,
): { from: number; to: number } | null {
    const currentLine = state.doc.lineAt(pos).number;
    for (let i = currentLine; i >= 1; i--) {
        const line = state.doc.line(i);
        const range = foldable(state, line.from, line.to);
        if (range && range.from <= pos && range.to >= pos) {
            return range;
        }
    }
    return null;
}

export function foldedRangesWithin(
    state: EditorState,
    from: number,
    to: number,
): { from: number; to: number }[] {
    const result: { from: number; to: number }[] = [];
    const folded = foldedRanges(state);
    const iter = folded.iter();
    while (iter.value) {
        if (iter.from >= from && iter.to <= to) {
            result.push({ from: iter.from, to: iter.to });
        }
        iter.next();
    }
    return result;
}

export function foldableRegionsWithin(
    state: EditorState,
    from: number,
    to: number,
): { from: number; to: number }[] {
    const result: { from: number; to: number }[] = [];
    const startLine = state.doc.lineAt(from).number;
    const endLine = state.doc.lineAt(to).number;
    for (let i = startLine; i <= endLine; i++) {
        const line = state.doc.line(i);
        const range = foldable(state, line.from, line.to);
        if (range && range.from >= from && range.to <= to) {
            result.push(range);
        }
    }
    return result;
}

export const foldNext: MotionFn = (cm, head, motionArgs) => {
    const view = cm.cm6;
    if (!view) return head;
    const state = view.state;
    const repeat = motionArgs.repeat ?? 1;
    let result: VimPos = head;
    let searchFrom = head.line;
    for (let i = 0; i < repeat; i++) {
        const found = findNextFoldable(state, searchFrom + 1);
        if (!found) break;
        result = { line: found.line, ch: 0 };
        searchFrom = found.line;
    }
    return result;
};

export const foldPrev: MotionFn = (cm, head, motionArgs) => {
    const view = cm.cm6;
    if (!view) return head;
    const state = view.state;
    const repeat = motionArgs.repeat ?? 1;
    let result: VimPos = head;
    let searchFrom = head.line + 1;
    for (let i = 0; i < repeat; i++) {
        const found = findPrevFoldable(state, searchFrom);
        if (!found) break;
        const endLine = state.doc.lineAt(found.to).number - 1;
        result = { line: endLine, ch: 0 };
        searchFrom = found.line + 1;
    }
    return result;
};

export const foldStart: MotionFn = (cm, head) => {
    const view = cm.cm6;
    if (!view) return head;
    const state = view.state;
    const pos = cm.indexFromPos(head);
    const found = findEnclosingFoldable(state, pos);
    if (!found) return head;
    const startLine = state.doc.lineAt(found.from).number - 1;
    return { line: startLine, ch: 0 };
};

export const foldEnd: MotionFn = (cm, head) => {
    const view = cm.cm6;
    if (!view) return head;
    const state = view.state;
    const pos = cm.indexFromPos(head);
    const found = findEnclosingFoldable(state, pos);
    if (!found) return head;
    const endLine = state.doc.lineAt(found.to).number - 1;
    return { line: endLine, ch: 0 };
};
