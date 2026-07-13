/**
 * Sign column — shows vim mark letters in a dedicated gutter column
 * using the CM6 gutter() API with GutterMarker + Compartment.
 */

import {
    Compartment,
    RangeSet,
    RangeSetBuilder,
    StateEffect,
    StateField,
    type Extension,
} from '@codemirror/state';
import { EditorView, GutterMarker, gutter } from '@codemirror/view';

// ── Constants ────────────────────────────────────────────

const MAX_GUTTER_MARKS = 3;

// ── Types ────────────────────────────────────────────────

export interface SignEntry {
    pos: number;
    labels: string;
}

export type SignColumnMode = 'auto' | 'yes' | 'no';

// ── GutterMarker ─────────────────────────────────────────

class SignMarker extends GutterMarker {
    constructor(private readonly text: string) {
        super();
    }

    toDOM(): HTMLElement {
        return createSpan({
            cls: 'vim-motions-sign-marker',
            text: this.text,
        });
    }

    eq(other: SignMarker): boolean {
        return this.text === other.text;
    }
}

class SignSpacer extends GutterMarker {
    constructor(private readonly text: string) {
        super();
    }

    toDOM(): HTMLElement {
        return createSpan({
            cls: 'vim-motions-sign-spacer',
            text: this.text,
        });
    }

    eq(other: SignSpacer): boolean {
        return this.text === other.text;
    }
}

// ── StateEffect & StateField ─────────────────────────────

export const setSignsEffect = StateEffect.define<SignEntry[]>();

const signColumnField = StateField.define<RangeSet<GutterMarker>>({
    create() {
        return RangeSet.empty;
    },
    update(set, tr) {
        set = set.map(tr.changes);
        for (const e of tr.effects) {
            if (e.is(setSignsEffect)) {
                const builder = new RangeSetBuilder<GutterMarker>();
                const sorted = [...e.value].sort((a, b) => a.pos - b.pos);
                for (const { pos, labels } of sorted) {
                    const display =
                        labels.length > MAX_GUTTER_MARKS
                            ? labels.slice(0, MAX_GUTTER_MARKS) + '\u2026'
                            : labels;
                    builder.add(pos, pos, new SignMarker(display));
                }
                set = builder.finish();
            }
        }
        return set;
    },
});

// ── Compartment ──────────────────────────────────────────

const signColumnCompartment = new Compartment();

// ── Extension factory ────────────────────────────────────

function createSignColumnGutter(): Extension {
    return [
        signColumnField,
        gutter({
            class: 'vim-motions-sign-column',
            markers: (v) => v.state.field(signColumnField),
            initialSpacer() {
                return new SignSpacer('aa');
            },
        }),
    ];
}

// ── Public API ───────────────────────────────────────────

/**
 * Create a configurable sign-column extension (auto/yes/no).
 * Always register unconditionally — the Compartment handles enable/disable.
 */
export function createSignColumnExtension(mode: SignColumnMode): Extension {
    return signColumnCompartment.of(
        mode === 'no' ? [] : createSignColumnGutter(),
    );
}

/**
 * Reconfigure the sign-column mode at runtime without full reload.
 */
export function reconfigureSignColumn(
    view: EditorView,
    mode: SignColumnMode,
): void {
    const ext = mode === 'no' ? [] : createSignColumnGutter();
    try {
        view.dispatch({ effects: signColumnCompartment.reconfigure(ext) });
    } catch {
        // noop — view may be destroyed or compartment not registered
    }
}
