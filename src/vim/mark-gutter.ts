/**
 * Mark gutter indicators — shows vim mark letters overlaid on the
 * existing gutter area using line decorations + CSS ::after.
 *
 * Uses Decoration.line() with a data attribute to pass mark labels,
 * then a CSS ::after pseudo-element positions the label in the gutter
 * area. This adds zero horizontal space — marks appear in the existing
 * margin without shifting document content.
 */

import {
    RangeSetBuilder,
    StateEffect,
    StateField,
    type Extension,
} from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view';
import type { CmAdapter } from '../types/vim-api';

// ── Constants ────────────────────────────────────────────

const MAX_GUTTER_MARKS = 3;

// ── StateEffect & StateField ─────────────────────────────

const setMarksEffect = StateEffect.define<{ pos: number; labels: string }[]>();

const markGutterField = StateField.define<DecorationSet>({
    create() {
        return Decoration.none;
    },
    update(set, tr) {
        set = set.map(tr.changes);
        for (const e of tr.effects) {
            if (e.is(setMarksEffect)) {
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

export function markGutterExtension(): Extension {
    return markGutterField;
}

// ── Refresh Logic ────────────────────────────────────────

const pendingRefresh = new WeakMap<EditorView, number>();

export interface PersistedMarkEntry {
    name: string;
    line: number;
}

export function scheduleMarkGutterRefresh(
    view: EditorView,
    cm: CmAdapter,
    persistedMarksForFile?: PersistedMarkEntry[],
): void {
    if (pendingRefresh.has(view)) return;
    const id = window.requestAnimationFrame(() => {
        pendingRefresh.delete(view);
        refreshMarkGutter(view, cm, persistedMarksForFile);
    });
    pendingRefresh.set(view, id);
}

export function cancelMarkGutterRefresh(view: EditorView): void {
    const id = pendingRefresh.get(view);
    if (id !== undefined) {
        cancelAnimationFrame(id);
        pendingRefresh.delete(view);
    }
}

function refreshMarkGutter(
    view: EditorView,
    cm: CmAdapter,
    persistedMarksForFile?: PersistedMarkEntry[],
): void {
    const marks = cm.state.vim?.marks;

    const byLine = new Map<number, string[]>();

    if (marks) {
        for (const [name, marker] of Object.entries(marks)) {
            const pos = marker.find();
            if (!pos) continue;
            // pos.line is 0-based; CM6 doc.line() is 1-based
            const lineNum = pos.line + 1;
            if (lineNum < 1 || lineNum > view.state.doc.lines) continue;
            const lineStart = view.state.doc.line(lineNum).from;
            const existing = byLine.get(lineStart) ?? [];
            existing.push(name);
            byLine.set(lineStart, existing);
        }
    }

    if (persistedMarksForFile) {
        for (const pm of persistedMarksForFile) {
            const lineNum = pm.line + 1;
            if (lineNum < 1 || lineNum > view.state.doc.lines) continue;
            const lineStart = view.state.doc.line(lineNum).from;
            const existing = byLine.get(lineStart) ?? [];
            if (!existing.includes(pm.name)) {
                existing.push(pm.name);
            }
            byLine.set(lineStart, existing);
        }
    }

    const entries: { pos: number; labels: string }[] = [];
    for (const [pos, names] of byLine) {
        entries.push({ pos, labels: names.sort().join('') });
    }

    try {
        view.dispatch({ effects: setMarksEffect.of(entries) });
    } catch {
        // noop — view destroyed
    }
}
