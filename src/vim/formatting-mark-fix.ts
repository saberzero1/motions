import {
    EditorState,
    EditorSelection,
    Prec,
    type Extension,
    type SelectionRange,
    type Transaction,
} from '@codemirror/state';
import { editorLivePreviewField } from 'obsidian';
import {
    collectFormattingMarks,
    type FormattingMarkRange,
} from './formatting-mark-ranges';

export type FormattingMarkMode = 'off' | 'cursor';

let currentMode: FormattingMarkMode = 'cursor';

export function setFormattingMarkMode(mode: FormattingMarkMode): void {
    currentMode = mode;
}

function snapRange(
    range: SelectionRange,
    oldHead: number,
    marks: FormattingMarkRange[],
    state: EditorState,
): SelectionRange {
    const newHead = range.head;
    for (const mark of marks) {
        if (newHead > mark.from && newHead < mark.to) {
            const movingRight = newHead > oldHead;
            const snappedHead = movingRight ? mark.to : mark.from;

            if (snappedHead === newHead || oldHead === newHead) return range;

            const line = state.doc.lineAt(newHead);
            if (movingRight && mark.to >= line.to) return range;

            if (range.empty) {
                return EditorSelection.cursor(snappedHead);
            }
            return EditorSelection.range(range.anchor, snappedHead);
        }
    }
    return range;
}

export function createFormattingTransactionFilter(): Extension {
    return Prec.low(
        EditorState.transactionFilter.of((tr: Transaction) => {
            if (currentMode === 'off') return tr;

            if (!tr.startState.field(editorLivePreviewField, false)) return tr;

            if (!tr.selection || tr.docChanged) return tr;

            const state = tr.startState;
            const oldSel = tr.startState.selection;
            const newSel = tr.newSelection;

            const lineNumbers = new Set<number>();
            for (const range of newSel.ranges) {
                const headLine = state.doc.lineAt(range.head).number;
                lineNumbers.add(headLine);
                if (!range.empty) {
                    const anchorLine = state.doc.lineAt(range.anchor).number;
                    lineNumbers.add(anchorLine);
                }
            }
            const marks = collectFormattingMarks(state, lineNumbers);

            if (marks.length === 0) return tr;

            let adjusted = false;
            const newRanges = newSel.ranges.map((range, i) => {
                if (!range.empty) return range;
                const oldHead =
                    i < oldSel.ranges.length
                        ? oldSel.ranges[i]!.head
                        : range.head;
                const snapped = snapRange(range, oldHead, marks, state);
                if (snapped !== range) adjusted = true;
                return snapped;
            });

            if (!adjusted) return tr;

            return [
                tr,
                {
                    selection: EditorSelection.create(
                        newRanges,
                        newSel.mainIndex,
                    ),
                },
            ];
        }),
    );
}
