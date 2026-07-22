import { Compartment, type Extension } from '@codemirror/state';
import {
    foldable,
    foldEffect,
    foldedRanges,
    unfoldEffect,
} from '@codemirror/language';
import { gutter, GutterMarker, EditorView } from '@codemirror/view';

// ── Compartment ──────────────────────────────────────────

const foldColumnCompartment = new Compartment();

// ── Gutter marker ────────────────────────────────────────

class FoldMarker extends GutterMarker {
    constructor(private readonly folded: boolean) {
        super();
    }

    toDOM(): HTMLElement {
        return createSpan({
            cls: this.folded
                ? 'vim-motions-fold-marker-folded'
                : 'vim-motions-fold-marker-open',
            text: this.folded ? '▾' : '▸',
        });
    }

    eq(other: FoldMarker): boolean {
        return this.folded === other.folded;
    }
}

const openMarker = new FoldMarker(false);
const foldedMarker = new FoldMarker(true);

// ── Extension factory ────────────────────────────────────

function createFoldColumnGutter(): Extension {
    return gutter({
        class: 'vim-motions-fold-column',
        lineMarker(view, line) {
            const folded = foldedRanges(view.state);
            let isFolded = false;
            folded.between(line.from, line.from, () => {
                isFolded = true;
            });
            if (isFolded) return foldedMarker;

            const foldRange = foldable(view.state, line.from, line.to);
            if (foldRange) return openMarker;
            return null;
        },
        lineMarkerChange(update) {
            return (
                update.docChanged ||
                update.viewportChanged ||
                update.transactions.some((tr) =>
                    tr.effects.some(
                        (effect) =>
                            effect.is(foldEffect) || effect.is(unfoldEffect),
                    ),
                )
            );
        },
        domEventHandlers: {
            click(view, line) {
                const folded = foldedRanges(view.state);
                let foldEnd: number | null = null;
                folded.between(line.from, line.from, (_from, to) => {
                    foldEnd = to;
                });
                if (foldEnd !== null) {
                    view.dispatch({
                        effects: unfoldEffect.of({
                            from: line.from,
                            to: foldEnd,
                        }),
                    });
                } else {
                    const range = foldable(view.state, line.from, line.to);
                    if (range) {
                        view.dispatch({
                            effects: foldEffect.of({
                                from: range.from,
                                to: range.to,
                            }),
                        });
                    }
                }
                return true;
            },
        },
    });
}

// ── Public API ───────────────────────────────────────────

export function createFoldColumnExtension(enabled: boolean): Extension {
    return foldColumnCompartment.of(enabled ? createFoldColumnGutter() : []);
}

export function reconfigureFoldColumn(
    view: EditorView,
    enabled: boolean,
): void {
    view.dispatch({
        effects: foldColumnCompartment.reconfigure(
            enabled ? createFoldColumnGutter() : [],
        ),
    });
}
