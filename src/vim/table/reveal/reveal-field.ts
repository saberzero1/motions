import {
    EditorState,
    MapMode,
    StateEffect,
    StateField,
    type ChangeDesc,
    type Extension,
} from '@codemirror/state';
import { getHighlightChannel } from './highlight-channel';
import { rowRanges, tablesTouchedBy } from './table-extent';
import { retireTableWidgets } from './widget-retire';

export interface RevealedSpan {
    from: number;
    to: number;
}

/**
 * What this plugin has asked Obsidian to leave as source.
 *
 * `highlights` are the ranges carrying our highlight — one per row, ascending.
 * `tables` are the extents those rows belong to, which the grid decorations
 * and the cursor guard read.
 */
export interface RevealState {
    highlights: readonly RevealedSpan[];
    tables: readonly RevealedSpan[];
}

const EMPTY: RevealState = { highlights: [], tables: [] };

const setReveal = StateEffect.define<RevealState>();

/**
 * Asks the extender to reconcile on a transaction that would otherwise give it
 * no reason to — a view created with its caret already inside a table, or one
 * whose channel was only just captured.
 */
export const requestReveal = StateEffect.define<null>();

/**
 * Maps the state through `changes` the way CodeMirror maps a mark range.
 *
 * A mark maps its start with a positive association under
 * `MapMode.TrackDel` — dropped when a deletion spans it — and its end with a
 * negative one, and is dropped when the two meet. Mirroring that exactly keeps
 * this record equal to what Obsidian's highlight field holds, which is what
 * lets teardown remove precisely our highlights and nobody else's.
 */
function mapReveal(value: RevealState, changes: ChangeDesc): RevealState {
    if (value.highlights.length === 0 && value.tables.length === 0) {
        return value;
    }
    const highlights: RevealedSpan[] = [];
    for (const span of value.highlights) {
        const from = changes.mapPos(span.from, 1, MapMode.TrackDel);
        if (from === null) continue;
        const to = changes.mapPos(span.to, -1);
        if (from < to) highlights.push({ from, to });
    }
    const tables = value.tables.map((t) => ({
        from: changes.mapPos(t.from, 1),
        to: changes.mapPos(t.to, -1),
    }));
    return { highlights, tables };
}

const key = (from: number, to: number): string => `${from}:${to}`;

export const revealField = StateField.define<RevealState>({
    create: () => EMPTY,
    update(value, tr) {
        for (const effect of tr.effects) {
            if (effect.is(setReveal)) return effect.value;
        }
        return tr.docChanged ? mapReveal(value, tr.changes) : value;
    },
});

/** The part of an `EditorView` the extender needs: whether IME is composing. */
interface ComposingSource {
    readonly composing: boolean;
}

const viewOfState = new WeakMap<EditorState, ComposingSource>();

/**
 * Records which view a state belongs to, so the extender — which receives a
 * transaction and no view — can ask whether an IME composition is live.
 *
 * Called by the surface's view plugin on construction and on every update, so
 * every transaction's `startState` is the latest state recorded for its view.
 */
export function noteRevealView(
    state: EditorState,
    view: ComposingSource,
): void {
    viewOfState.set(state, view);
}

/** Whether `pos` lies in a table this plugin has revealed. */
export function isRevealedAt(state: EditorState, pos: number): boolean {
    const value = state.field(revealField, false);
    if (!value) return false;
    return value.tables.some((t) => pos >= t.from && pos <= t.to);
}

function sameSpans(
    a: readonly RevealedSpan[],
    b: readonly RevealedSpan[],
): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        const x = a[i];
        const y = b[i];
        if (!x || !y || x.from !== y.from || x.to !== y.to) return false;
    }
    return true;
}

/**
 * Reveals every table the selection touches, in the same transaction that
 * moves the selection there.
 *
 * Same-transaction is the whole design. Obsidian's builder reads its
 * highlight field from the new state, so a highlight added here means the
 * table is never replaced around the caret at all — no frame in which the
 * widget holds the selection, and no window for its `receiveSelection` to
 * open a cell editor. A reveal dispatched afterwards would arrive too late:
 * by then the widget has taken focus into a cell.
 *
 * The extender is not gated on Live Preview. In Source mode Obsidian's builder
 * does not run and a highlight on a newline draws nothing, so keeping the
 * highlights there is harmless — and it means switching back to Live Preview
 * with the caret in a table needs no special case.
 *
 * When Obsidian removes highlights itself — in-file search closing, or any
 * `removeHighlights()` call — its filter effect also removes ours, and this
 * re-adds them in that same transaction.
 */
function revealExtender(): Extension {
    return EditorState.transactionExtender.of((tr) => {
        const channel = getHighlightChannel();
        if (!channel) return null;
        const previous = tr.startState.field(revealField, false);
        if (previous === undefined) return null;
        // Never rebuild the marks during an IME composition. The highlight
        // wraps each row's text, and a composition at a row's end falls
        // outside it, so a resync would rewrap the composing text node —
        // measured as a corrupted row: the leading pipe deleted and the
        // preedit left behind beside the commit. The marks still map with
        // the edit, and the first ordinary transaction resyncs them.
        //
        // Asked of the live view, not of the user event. The vim adapter
        // labels every change it dispatches `input.type.compose`, for undo
        // grouping, so keying on the label skipped every vim edit too: a
        // realign replaced the whole table, removed every highlight, and
        // Obsidian built a widget that took the caret into a cell editor.
        if (viewOfState.get(tr.startState)?.composing) return null;

        const external = tr.effects.some((e) => e.is(channel.filter));
        const requested = tr.effects.some((e) => e.is(requestReveal));
        if (!tr.docChanged && !tr.selection && !external && !requested) {
            return null;
        }

        const doc = tr.newDoc;
        const tables = tablesTouchedBy(doc, tr.newSelection);
        const desired = tables.flatMap((t) => rowRanges(doc, t));
        const mapped = tr.docChanged
            ? mapReveal(previous, tr.changes)
            : previous;
        if (!external && sameSpans(mapped.highlights, desired)) return null;

        const fresh = tables.filter(
            (t) => !mapped.tables.some((r) => r.from <= t.to && r.to >= t.from),
        );
        retireTableWidgets(tr.startState, tr.changes, fresh);

        const ours = new Set(mapped.highlights.map((h) => key(h.from, h.to)));
        const effects: StateEffect<unknown>[] = [
            channel.filter.of(
                (from, to, value) =>
                    !(value === channel.mark && ours.has(key(from, to))),
            ),
        ];
        if (desired.length > 0) {
            effects.push(
                channel.add.of(
                    desired.map((h) => channel.mark.range(h.from, h.to)),
                ),
            );
        }
        effects.push(
            setReveal.of({
                highlights: desired,
                tables: tables.map((t) => ({ from: t.from, to: t.to })),
            }),
        );
        return { effects };
    });
}

/** The state half of the reveal surface: the record and its extender. */
export function revealStateExtension(): Extension {
    return [revealField, revealExtender()];
}

/**
 * The effect that withdraws every highlight this plugin placed, for teardown.
 *
 * Null while no channel has been captured, since then nothing was placed.
 */
export function withdrawRevealEffect(
    highlights: readonly RevealedSpan[],
): StateEffect<unknown> | null {
    const channel = getHighlightChannel();
    if (!channel) return null;
    const ours = new Set(highlights.map((h) => key(h.from, h.to)));
    return channel.filter.of(
        (from, to, value) =>
            !(value === channel.mark && ours.has(key(from, to))),
    );
}
