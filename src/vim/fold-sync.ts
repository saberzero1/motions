import {
    EditorState,
    type Extension,
    type StateEffect,
} from '@codemirror/state';
import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { foldEffect, unfoldEffect, foldedRanges } from '@codemirror/language';

let foldAwareNavigationEnabled = false;

export function setFoldAwareNavigation(enabled: boolean): void {
    foldAwareNavigationEnabled = enabled;
}

const foldScrollExtender = EditorState.transactionExtender.of((tr) => {
    if (!tr.docChanged) {
        for (const effect of tr.effects) {
            if (effect.is(foldEffect) || effect.is(unfoldEffect)) {
                return {
                    effects: EditorView.scrollIntoView(
                        tr.newSelection.main.head,
                    ),
                };
            }
        }
    }
    return null;
});

const foldAwareNavExtender = EditorState.transactionExtender.of((tr) => {
    if (!foldAwareNavigationEnabled) return null;
    if (tr.docChanged) return null;
    if (!tr.selection) return null;

    const cursorPos = tr.newSelection.main.head;
    const cursorLine = tr.state.doc.lineAt(cursorPos);
    const folded = foldedRanges(tr.state);
    const iter = folded.iter();
    while (iter.value) {
        if (cursorPos >= iter.from && cursorPos <= iter.to) {
            return {
                effects: unfoldEffect.of({ from: iter.from, to: iter.to }),
            };
        }
        const foldLine = tr.state.doc.lineAt(iter.from);
        if (foldLine.number === cursorLine.number) {
            return {
                effects: unfoldEffect.of({ from: iter.from, to: iter.to }),
            };
        }
        iter.next();
    }
    return null;
});

/**
 * Normalizes `unfoldEffect` ranges.  CM6's `foldState` requires an exact
 * `{from, to}` match to remove a fold — if any click path dispatches an
 * `unfoldEffect` with a range that doesn't perfectly match the stored fold
 * decoration, the unfold is silently ignored.  This extender detects
 * mismatched unfold effects and appends a corrective effect with the actual
 * stored fold range so the unfold succeeds regardless of the source.
 */
const unfoldNormalizerExtender = EditorState.transactionExtender.of((tr) => {
    if (tr.effects.length === 0) return null;

    const folded = foldedRanges(tr.startState);
    const corrections: StateEffect<{ from: number; to: number }>[] = [];

    for (const effect of tr.effects) {
        if (!effect.is(unfoldEffect)) continue;
        const { from, to } = effect.value;

        let exactMatch = false;
        folded.between(from, from, (fFrom, fTo) => {
            if (fFrom === from && fTo === to) exactMatch = true;
        });
        if (exactMatch) continue;

        const line = tr.startState.doc.lineAt(from);
        let best: { from: number; to: number } | null = null;
        folded.between(line.from, line.to, (fFrom, fTo) => {
            if (!best || Math.abs(fFrom - from) < Math.abs(best.from - from)) {
                best = { from: fFrom, to: fTo };
            }
        });
        if (best) corrections.push(unfoldEffect.of(best));
    }

    return corrections.length > 0 ? { effects: corrections } : null;
});

const METADATA_SELECTOR = '.metadata-container';

const propertiesFoldObserver = ViewPlugin.fromClass(
    class {
        private observer: MutationObserver | null = null;
        private view: EditorView;

        constructor(view: EditorView) {
            this.view = view;
            this.observe();
        }

        update(update: ViewUpdate): void {
            if (update.docChanged) {
                this.disconnect();
                this.observe();
            }
        }

        destroy(): void {
            this.disconnect();
        }

        private observe(): void {
            const container =
                this.view.dom.closest('.workspace-leaf-content') ??
                this.view.dom.parentElement;
            if (!container) return;

            const metadata = container.querySelector(METADATA_SELECTOR);
            if (!metadata) return;

            this.observer = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    if (
                        mutation.type === 'attributes' &&
                        mutation.attributeName === 'class'
                    ) {
                        this.scrollCursorIntoView();
                        return;
                    }
                }
            });

            this.observer.observe(metadata, {
                attributes: true,
                attributeFilter: ['class'],
            });
        }

        private disconnect(): void {
            if (this.observer) {
                this.observer.disconnect();
                this.observer = null;
            }
        }

        private scrollCursorIntoView(): void {
            window.requestAnimationFrame(() => {
                try {
                    this.view.dispatch({
                        effects: EditorView.scrollIntoView(
                            this.view.state.selection.main.head,
                        ),
                    });
                } catch {
                    // View may have been destroyed
                }
            });
        }
    },
);

export function foldSyncExtension(): Extension {
    return [
        unfoldNormalizerExtender,
        foldScrollExtender,
        foldAwareNavExtender,
        propertiesFoldObserver,
    ];
}
