import {
    Compartment,
    type EditorState,
    RangeSetBuilder,
    StateField,
    type Extension,
} from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view';

// ── Types ────────────────────────────────────────────────

export type CursorlineOpt = 'number' | 'line' | 'both';

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
    cursorlineNumberHighlight = enabled && (opt === 'number' || opt === 'both');
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

// ── Extension factory ────────────────────────────────────

function createCursorlineDecoration(opt: CursorlineOpt): Extension {
    if (opt === 'number') {
        return [];
    }
    return createCursorlineStateField();
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
