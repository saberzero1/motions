import { EditorState, type Extension } from '@codemirror/state';
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
    return [foldScrollExtender, foldAwareNavExtender, propertiesFoldObserver];
}
