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
const DEFAULT_SIGN_WIDTH = 2;
const MAX_SIGN_WIDTH = 4;

// ── Types ────────────────────────────────────────────────

export interface SignEntry {
    pos: number;
    labels: string;
}

export interface ParsedSignColumnMode {
    base: 'auto' | 'yes' | 'no';
    width: number;
}

// ── Mode parsing ─────────────────────────────────────────

const SIGN_COLUMN_RE = /^(auto|yes|no)(?::([1-4]))?$/;

export function parseSignColumnMode(raw: string): ParsedSignColumnMode {
    const m = SIGN_COLUMN_RE.exec(raw);
    if (!m) return { base: 'auto', width: DEFAULT_SIGN_WIDTH };
    return {
        base: m[1] as 'auto' | 'yes' | 'no',
        width: m[2] ? Number(m[2]) : DEFAULT_SIGN_WIDTH,
    };
}

export function isValidSignColumnValue(raw: string): boolean {
    return SIGN_COLUMN_RE.test(raw);
}

// ── GutterMarker ─────────────────────────────────────────

export class SignMarker extends GutterMarker {
    readonly label: string;

    constructor(label: string) {
        super();
        this.label = label;
    }

    toDOM(): HTMLElement {
        const first = this.label[0] ?? '';
        const typeCls =
            first >= 'A' && first <= 'Z'
                ? 'vim-motions-sign-marker-global'
                : 'vim-motions-sign-marker-local';
        return createSpan({
            cls: `vim-motions-sign-marker ${typeCls}`,
            text: this.label,
        });
    }

    eq(other: SignMarker): boolean {
        return this.label === other.label;
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

export const signColumnField = StateField.define<RangeSet<GutterMarker>>({
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

export function signColumnFieldExtension(): Extension {
    return signColumnField;
}

function createSignColumnGutter(width: number): Extension {
    const spacerText = 'a'.repeat(Math.min(width, MAX_SIGN_WIDTH));
    return gutter({
        class: 'vim-motions-sign-column',
        markers: (v) => v.state.field(signColumnField),
        initialSpacer() {
            return new SignSpacer(spacerText);
        },
        domEventHandlers: {
            click(view, line) {
                let hasMarker = false;
                view.state
                    .field(signColumnField)
                    .between(line.from, line.from, () => {
                        hasMarker = true;
                    });
                if (!hasMarker) return false;
                view.dispatch({
                    selection: { anchor: line.from },
                });
                view.focus();
                return true;
            },
        },
    });
}

// ── Public API ───────────────────────────────────────────

/**
 * Create a configurable sign-column extension.
 * Always register unconditionally — the Compartment handles enable/disable.
 */
export function createSignColumnExtension(raw: string): Extension {
    const mode = parseSignColumnMode(raw);
    return signColumnCompartment.of(
        mode.base === 'no' ? [] : createSignColumnGutter(mode.width),
    );
}

/**
 * Reconfigure the sign-column mode at runtime without full reload.
 */
export function reconfigureSignColumn(view: EditorView, raw: string): void {
    const mode = parseSignColumnMode(raw);
    const ext = mode.base === 'no' ? [] : createSignColumnGutter(mode.width);
    try {
        view.dispatch({ effects: signColumnCompartment.reconfigure(ext) });
    } catch {
        // noop — view may be destroyed or compartment not registered
    }
}
