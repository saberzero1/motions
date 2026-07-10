import { StateEffect, StateField, type Extension } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view';

export type YankHighlightMode = 'off' | 'solid' | 'fade';

interface YankHighlightPayload {
    ranges: { from: number; to: number }[];
    mode: 'solid' | 'fade';
}

const addYankHighlight = StateEffect.define<YankHighlightPayload>();
const clearYankHighlight = StateEffect.define<null>();

const solidMark = Decoration.mark({
    class: 'vim-motions-yank-highlight',
});

const fadeMark = Decoration.mark({
    class: 'vim-motions-yank-highlight vim-motions-yank-highlight-fade',
});

const yankHighlightField = StateField.define<DecorationSet>({
    create() {
        return Decoration.none;
    },
    update(prev, tr) {
        let decos = prev.map(tr.changes);
        for (const effect of tr.effects) {
            if (effect.is(addYankHighlight)) {
                const mark =
                    effect.value.mode === 'fade' ? fadeMark : solidMark;
                const ranges = effect.value.ranges
                    .filter((r) => r.from < r.to)
                    .map((r) => mark.range(r.from, r.to));
                decos = Decoration.set(ranges, true);
            }
            if (effect.is(clearYankHighlight)) {
                decos = Decoration.none;
            }
        }
        return decos;
    },
    provide: (f) => EditorView.decorations.from(f),
});

export function yankHighlightExtension(): Extension {
    return yankHighlightField;
}

/**
 * Dispatch a yank highlight to a specific EditorView.
 *
 * - Replaces any existing highlight (handles rapid successive yanks).
 * - Skips highlights for very large yanks (>1000 lines) to avoid stalls.
 * - Guards against disposed views (tab close during animation).
 * - In fade mode, sets `--vim-motions-yank-duration` on the view DOM so the
 *   CSS animation duration matches the JS removal timeout.
 */
export function showYankHighlight(
    view: EditorView,
    ranges: { from: number; to: number }[],
    durationMs: number,
    mode: 'solid' | 'fade',
): void {
    if (ranges.length === 0) return;

    // Cap: skip highlight for very large yanks (> 1000 lines)
    const doc = view.state.doc;
    const totalLines = ranges.reduce((sum, r) => {
        const fromLine = doc.lineAt(r.from).number;
        const toLine = doc.lineAt(Math.min(r.to, doc.length)).number;
        return sum + (toLine - fromLine + 1);
    }, 0);
    if (totalLines > 1000) return;

    if (mode === 'fade') {
        view.dom.style.setProperty(
            '--vim-motions-yank-duration',
            `${durationMs}ms`,
        );
    }

    try {
        view.dispatch({
            effects: addYankHighlight.of({ ranges, mode }),
        });
    } catch {
        return; // View may be destroyed
    }

    window.setTimeout(() => {
        try {
            view.dispatch({ effects: clearYankHighlight.of(null) });
        } catch {
            // View may have been destroyed during timeout
        }
    }, durationMs);
}
