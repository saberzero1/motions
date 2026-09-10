import {
    Compartment,
    type EditorState,
    RangeSetBuilder,
    StateField,
    type Extension,
} from '@codemirror/state';
import {
    Decoration,
    type DecorationSet,
    Direction,
    EditorView,
    RectangleMarker,
    layer,
} from '@codemirror/view';
import { cursorlineFlags, type CursorlineOpt } from './cursorline-option';

export type { CursorlineOpt };

// ── Compartment ──────────────────────────────────────────

const cursorlineCompartment = new Compartment();

// ── Current-line number highlight ────────────────────────

// Mirrors DEFAULT_SETTINGS (cursorline: true, cursorlineopt: 'number') so the
// gutter renders identically if the setter has not run yet.
let cursorlineNumberHighlight = true;

/**
 * Neovim draws the cursor line's number with `CursorLineNr` only when
 * `'cursorline'` is on AND `'cursorlineopt'` contains `"number"` (or is
 * `"both"`); it is never used while `'cursorline'` is off. The number itself is
 * still drawn — with `LineNr` — so this gates only the highlight.
 */
export function setCursorlineNumberHighlight(
    enabled: boolean,
    opt: CursorlineOpt,
): void {
    cursorlineNumberHighlight = enabled && cursorlineFlags(opt).number;
}

export function isCursorlineNumberHighlight(): boolean {
    return cursorlineNumberHighlight;
}

// ── Decorations ──────────────────────────────────────────

function createCursorlineStateField(): StateField<DecorationSet> {
    return StateField.define<DecorationSet>({
        create(state) {
            return buildCursorlineDecorations(state);
        },
        update(decorations, update) {
            const selectionSet =
                update.selection !== update.startState.selection;
            if (!selectionSet && !update.docChanged) {
                return decorations;
            }
            return buildCursorlineDecorations(update.state);
        },
        provide: (field) => EditorView.decorations.from(field),
    });
}

function buildCursorlineDecorations(state: EditorState): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const lineFrom = state.doc.lineAt(state.selection.main.head).from;
    builder.add(
        lineFrom,
        lineFrom,
        Decoration.line({ class: 'vim-motions-cursorline' }),
    );
    return builder.finish();
}

// ── Screen-line highlight ────────────────────────────────

// Mirrors CodeMirror's own `getBase` (view/src/layer.ts): the layer is
// positioned in document coordinates, so client rects must be rebased onto the
// scroller's unscrolled origin. `scaleX`/`scaleY` are applied here and NOT to
// the marker itself, because the layer already applies the inverse scale.
function layerBase(view: EditorView): { left: number; top: number } {
    const rect = view.scrollDOM.getBoundingClientRect();
    const left =
        view.textDirection === Direction.LTR
            ? rect.left
            : rect.right - view.scrollDOM.clientWidth * view.scaleX;
    return {
        left: left - view.scrollDOM.scrollLeft * view.scaleX,
        top: rect.top - view.scrollDOM.scrollTop * view.scaleY,
    };
}

/**
 * `screenline` highlights only the cursor's display row. A `Decoration.line`
 * cannot express that — it spans the whole wrapped line block — and a mark
 * decoration would stop at the last glyph instead of filling to the content
 * edge as Vim does. A measured rectangle is the only shape that does both.
 */
const cursorScreenlineLayer = layer({
    above: false,
    class: 'vim-motions-cursorline-layer',
    update(update) {
        return update.selectionSet || update.docChanged;
    },
    updateOnDocViewUpdate: true,
    markers(view) {
        const { main } = view.state.selection;
        const forward = main.assoc >= 0;
        const caret =
            view.coordsAtPos(main.head, forward ? 1 : -1) ??
            view.coordsAtPos(main.head, forward ? -1 : 1);
        if (!caret) return [];

        const content = view.contentDOM.getBoundingClientRect();
        const base = layerBase(view);
        const width = content.right - content.left;
        const height = caret.bottom - caret.top;
        if (width <= 0 || height <= 0) return [];

        return [
            new RectangleMarker(
                'vim-motions-cursorline',
                content.left - base.left,
                caret.top - base.top,
                width,
                height,
            ),
        ];
    },
});

// ── Extension factory ────────────────────────────────────

function createCursorlineDecoration(opt: CursorlineOpt): Extension {
    const flags = cursorlineFlags(opt);
    if (flags.screenline) return cursorScreenlineLayer;
    if (flags.line) return createCursorlineStateField();
    return [];
}

/**
 * Create a configurable cursorline extension (number/line/both).
 */
export function createCursorlineExtension(
    enabled: boolean,
    opt: CursorlineOpt,
): Extension {
    if (!enabled) {
        return cursorlineCompartment.of([]);
    }
    return cursorlineCompartment.of(createCursorlineDecoration(opt));
}

/**
 * Reconfigure the active cursorline mode at runtime.
 */
export function reconfigureCursorline(
    view: EditorView,
    enabled: boolean,
    opt: CursorlineOpt,
): void {
    view.dispatch({
        effects: cursorlineCompartment.reconfigure(
            enabled ? createCursorlineDecoration(opt) : [],
        ),
    });
}
