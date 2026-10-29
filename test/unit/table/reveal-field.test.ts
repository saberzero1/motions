import { describe, expect, it } from 'vitest';
import {
    EditorSelection,
    EditorState,
    StateEffect,
    StateField,
    type Range,
} from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import {
    captureHighlightChannel,
    getHighlightChannel,
    parseCapturedSpec,
    SEARCH_HIGHLIGHT_STYLE,
    type HighlightFilter,
} from '../../../src/vim/table/reveal/highlight-channel';
import {
    isRevealedAt,
    noteRevealView,
    revealField,
    revealStateExtension,
} from '../../../src/vim/table/reveal/reveal-field';
import { getRetiredWidgetCount } from '../../../src/vim/table/reveal/widget-retire';

/**
 * The reveal extender, driven through a real `EditorState` against a
 * stand-in for Obsidian's highlight field.
 *
 * The stand-in reproduces what `app.js` does — a `StateField` of marks that
 * an add effect extends and a filter effect prunes, mapped through changes —
 * and the fake `addHighlights` reproduces the spec Obsidian's method
 * dispatches, so the capture path is exercised too. What these tests cannot
 * reach is Obsidian's table builder; `table-reveal.e2e.ts` covers that.
 */

const OBSIDIAN_ADD = StateEffect.define<readonly Range<Decoration>[]>();
const OBSIDIAN_FILTER = StateEffect.define<HighlightFilter>();
const OBSIDIAN_MARK = Decoration.mark({ class: SEARCH_HIGHLIGHT_STYLE });

/** Obsidian's highlight field, as read from `app.js`. */
const obsidianHighlights = StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(value, tr) {
        let next = value.map(tr.changes);
        for (const e of tr.effects) {
            if (e.is(OBSIDIAN_ADD))
                next = next.update({ add: e.value, sort: true });
            else if (e.is(OBSIDIAN_FILTER))
                next = next.update({ filter: e.value });
        }
        return next;
    },
});

/** Obsidian's `addHighlights`, as read from `app.js`. */
const fakeEditor = {
    addHighlights(
        this: { cm: { state: EditorState; dispatch: (s: unknown) => void } },
        ranges: {
            from: { line: number; ch: number };
            to: { line: number; ch: number };
        }[],
        _style: string,
        removePrevious: boolean,
    ): void {
        const doc = this.cm.state.doc;
        const pos = (p: { line: number; ch: number }) =>
            doc.line(p.line + 1).from + p.ch;
        const effects: StateEffect<unknown>[] = [];
        if (removePrevious) {
            effects.push(
                OBSIDIAN_FILTER.of((_f, _t, v) => v !== OBSIDIAN_MARK),
            );
        }
        effects.push(
            OBSIDIAN_ADD.of(
                ranges.map((r) => OBSIDIAN_MARK.range(pos(r.from), pos(r.to))),
            ),
        );
        this.cm.dispatch({ effects });
    },
};

/** Obsidian's table widget, reduced to the fields `widget-retire` reads. */
class FakeTableWidget extends WidgetType {
    start: number;
    selections = 0;
    constructor(start: number) {
        super();
        this.start = start;
    }
    receiveSelection(): void {
        this.selections++;
    }
    receiveUpdate(): boolean {
        return true;
    }
    rebuildTable(): void {}
    toDOM(): HTMLElement {
        throw new Error('not rendered in unit tests');
    }
}

const DOC = [
    'Line above',
    '',
    '| Name | Value |',
    '|------|-------|',
    '| aa   | 11    |',
    '| bb   | 22    |',
    '',
    'Below',
].join('\n');

function setup(widget?: FakeTableWidget): EditorState {
    expect(captureHighlightChannel(fakeEditor)).not.toBeNull();
    const extensions = [obsidianHighlights, revealStateExtension()];
    if (widget) {
        extensions.push(
            EditorView.decorations.of(
                Decoration.set([
                    Decoration.replace({ widget, block: true }).range(
                        12,
                        DOC.indexOf('\n\nBelow'),
                    ),
                ]),
            ),
        );
    }
    return EditorState.create({ doc: DOC, extensions });
}

/** The search-style marks in Obsidian's field, as ranges. */
function marks(state: EditorState): { from: number; to: number }[] {
    const out: { from: number; to: number }[] = [];
    state
        .field(obsidianHighlights)
        .between(0, state.doc.length, (from, to, v) => {
            if (v === OBSIDIAN_MARK) out.push({ from, to });
        });
    return out;
}

/** The text ranges of lines `first`..`last` (1-based). */
function rows(state: EditorState, first: number, last: number) {
    const out: { from: number; to: number }[] = [];
    for (let n = first; n <= last; n++) {
        out.push({ from: state.doc.line(n).from, to: state.doc.line(n).to });
    }
    return out;
}

const lineStart = (state: EditorState, n: number): number =>
    state.doc.line(n).from;

describe('parseCapturedSpec', () => {
    it('picks the add and filter types and the exact mark', () => {
        const channel = parseCapturedSpec({
            effects: [
                OBSIDIAN_FILTER.of(() => true),
                OBSIDIAN_ADD.of([OBSIDIAN_MARK.range(0, 1)]),
            ],
        });
        expect(channel?.mark).toBe(OBSIDIAN_MARK);
        expect(OBSIDIAN_ADD.of([]).is(channel!.add)).toBe(true);
        expect(OBSIDIAN_FILTER.of(() => true).is(channel!.filter)).toBe(true);
    });

    it('rejects a mark of another style', () => {
        const other = Decoration.mark({ class: 'something-else' });
        expect(
            parseCapturedSpec({
                effects: [
                    OBSIDIAN_FILTER.of(() => true),
                    OBSIDIAN_ADD.of([other.range(0, 1)]),
                ],
            }),
        ).toBeNull();
    });

    it('rejects a spec without a filter effect', () => {
        expect(
            parseCapturedSpec({
                effects: [OBSIDIAN_ADD.of([OBSIDIAN_MARK.range(0, 1)])],
            }),
        ).toBeNull();
    });
});

describe('reveal extender', () => {
    it('captures the channel from the editor without dispatching anywhere', () => {
        setup();
        expect(getHighlightChannel()?.mark).toBe(OBSIDIAN_MARK);
    });

    it('reveals in the same transaction that moves the caret into the table', () => {
        const start = setup();
        expect(marks(start)).toEqual([]);

        const inside = start.update({
            selection: { anchor: lineStart(start, 5) + 2 },
        }).state;
        expect(marks(inside)).toEqual(rows(inside, 3, 6));
        expect(isRevealedAt(inside, lineStart(inside, 5))).toBe(true);
        expect(isRevealedAt(inside, 0)).toBe(false);
    });

    it('withdraws every highlight when the caret leaves', () => {
        const start = setup();
        const inside = start.update({
            selection: { anchor: lineStart(start, 4) },
        }).state;
        const outside = inside.update({
            selection: { anchor: lineStart(inside, 8) },
        }).state;
        expect(marks(outside)).toEqual([]);
        expect(outside.field(revealField).tables).toEqual([]);
        expect(outside.field(revealField).highlights).toEqual([]);
    });

    it('withdraws only its own highlights, leaving a search match alone', () => {
        const start = setup();
        const match = {
            from: lineStart(start, 8),
            to: lineStart(start, 8) + 3,
        };
        const searched = start.update({
            effects: OBSIDIAN_ADD.of([
                OBSIDIAN_MARK.range(match.from, match.to),
            ]),
        }).state;
        const inside = searched.update({
            selection: { anchor: lineStart(searched, 4) },
        }).state;
        const outside = inside.update({
            selection: { anchor: lineStart(inside, 1) },
        }).state;
        expect(marks(inside)).toHaveLength(5);
        expect(marks(outside)).toEqual([match]);
    });

    it('re-adds its highlights when Obsidian clears them while the caret is inside', () => {
        const start = setup();
        const inside = start.update({
            selection: { anchor: lineStart(start, 5) },
        }).state;
        const before = marks(inside);
        // What closing in-file search does: `removeHighlights(style)`.
        const cleared = inside.update({
            effects: OBSIDIAN_FILTER.of((_f, _t, v) => v !== OBSIDIAN_MARK),
        }).state;
        expect(marks(cleared)).toEqual(before);
    });

    it('leaves the highlights alone while typing inside a row', () => {
        const start = setup();
        const inside = start.update({
            selection: { anchor: lineStart(start, 5) + 2 },
        }).state;
        const typed = inside.update({
            changes: { from: lineStart(inside, 5) + 2, insert: 'xyz' },
            selection: { anchor: lineStart(inside, 5) + 5 },
        });
        expect(
            typed.effects.some(
                (e) => e.is(OBSIDIAN_ADD) || e.is(OBSIDIAN_FILTER),
            ),
        ).toBe(false);
        expect(marks(typed.state)).toEqual(rows(typed.state, 3, 6));
        expect(typed.state.field(revealField).highlights).toEqual(
            marks(typed.state),
        );
    });

    it('follows a row joined away, in its own record and in Obsidian’s', () => {
        const start = setup();
        const inside = start.update({
            selection: { anchor: lineStart(start, 5) },
        }).state;
        const nl = inside.doc.line(5).to;
        const joined = inside.update({
            changes: { from: nl, to: nl + 1, insert: ' ' },
            selection: { anchor: nl },
        }).state;
        expect(marks(joined)).toEqual(rows(joined, 3, 5));
        expect(joined.field(revealField).highlights).toEqual(marks(joined));
    });

    it('leaves the marks alone while the view is composing, then resyncs', () => {
        const start = setup();
        const inside = start.update({
            selection: { anchor: lineStart(start, 5) },
        }).state;
        noteRevealView(inside, { composing: true });
        const end = inside.doc.line(5).to;
        const composing = inside.update({
            changes: { from: end, insert: 'に' },
            selection: { anchor: end + 1 },
            userEvent: 'input.type.compose',
        });
        expect(
            composing.effects.some(
                (e) => e.is(OBSIDIAN_ADD) || e.is(OBSIDIAN_FILTER),
            ),
        ).toBe(false);
        // Typed past the row's end, outside its mark, until the next
        // ordinary transaction.
        expect(marks(composing.state)[2]).toEqual({
            from: composing.state.doc.line(5).from,
            to: end,
        });
        noteRevealView(composing.state, { composing: false });
        const settled = composing.state.update({
            selection: { anchor: end },
        }).state;
        expect(marks(settled)).toEqual(rows(settled, 3, 6));
    });

    it('resyncs a vim edit the adapter labels as a composition', () => {
        // The vim adapter tags every change it dispatches
        // `input.type.compose`. A whole-table replacement through it — what
        // a realign does — must still be re-highlighted, or Obsidian
        // replaces the table around the caret.
        const start = setup();
        const inside = start.update({
            selection: { anchor: lineStart(start, 5) },
        }).state;
        noteRevealView(inside, { composing: false });
        const from = lineStart(inside, 3);
        const to = inside.doc.line(6).to;
        const replaced = inside.update({
            changes: {
                from,
                to,
                insert: '| Name  | Value |\n| ----- | ----- |\n| aa    | 11    |\n| bb    | 22    |',
            },
            userEvent: 'input.type.compose',
        }).state;
        expect(marks(replaced)).toEqual(rows(replaced, 3, 6));
    });

    it('keeps a row whose leading pipe was deleted revealed', () => {
        const start = setup();
        const inside = start.update({
            selection: { anchor: lineStart(start, 5) },
        }).state;
        const at = lineStart(inside, 5);
        const deleted = inside.update({
            changes: { from: at, to: at + 1 },
            selection: { anchor: at },
        }).state;
        expect(isRevealedAt(deleted, at)).toBe(true);
        expect(marks(deleted)).toEqual(rows(deleted, 3, 6));
    });

    it('retires Obsidian’s widget for the table it reveals, before the builder runs', () => {
        const widget = new FakeTableWidget(12);
        const start = setup(widget);
        const before = getRetiredWidgetCount();
        start.update({ selection: { anchor: lineStart(start, 5) } });
        expect(widget.start).toBe(Infinity);
        widget.receiveSelection();
        expect(widget.selections).toBe(0);
        expect(getRetiredWidgetCount()).toBe(before + 1);
    });

    it('does not retire the widget of a table the caret stays out of', () => {
        const widget = new FakeTableWidget(12);
        const start = setup(widget);
        start.update({ selection: { anchor: lineStart(start, 8) } });
        expect(widget.start).toBe(12);
    });

    it('reveals every table a visual selection spans', () => {
        const start = setup();
        const spanning = start.update({
            selection: EditorSelection.single(0, start.doc.length),
        }).state;
        expect(marks(spanning)).toEqual(rows(spanning, 3, 6));
    });
});
