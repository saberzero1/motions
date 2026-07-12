/**
 * Sign column — shows vim mark letters overlaid on the existing gutter
 * area using line decorations + CSS ::after. Zero layout shift.
 */

import {
    RangeSetBuilder,
    StateEffect,
    StateField,
    type Extension,
} from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view';

// ── Constants ────────────────────────────────────────────

const MAX_GUTTER_MARKS = 3;

// ── Types ────────────────────────────────────────────────

export interface SignEntry {
    pos: number;
    labels: string;
}

// ── StateEffect & StateField ─────────────────────────────

export const setSignsEffect = StateEffect.define<SignEntry[]>();

const signColumnField = StateField.define<DecorationSet>({
    create() {
        return Decoration.none;
    },
    update(set, tr) {
        set = set.map(tr.changes);
        for (const e of tr.effects) {
            if (e.is(setSignsEffect)) {
                const builder = new RangeSetBuilder<Decoration>();
                const sorted = [...e.value].sort((a, b) => a.pos - b.pos);
                for (const { pos, labels } of sorted) {
                    const display =
                        labels.length > MAX_GUTTER_MARKS
                            ? labels.slice(0, MAX_GUTTER_MARKS) + '\u2026'
                            : labels;
                    builder.add(
                        pos,
                        pos,
                        Decoration.line({
                            attributes: {
                                'data-vim-marks': display,
                            },
                        }),
                    );
                }
                set = builder.finish();
            }
        }
        return set;
    },
    provide: (f) => EditorView.decorations.from(f),
});

// ── Extension ────────────────────────────────────────────

export function signColumnExtension(): Extension {
    return signColumnField;
}
