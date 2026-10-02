import { beforeEach, describe, expect, it } from 'vitest';
import { EditorState, Prec, StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { createTableSurface } from '../../../src/vim/table/surface-field';
import {
    TableSurfaceWidget,
    getTableSurfaceRedrawCount,
    _resetTableSurfaceRedrawCount,
} from '../../../src/vim/table/surface-widget';

/**
 * Plan B Step 2.
 *
 * The load-bearing property is that an edit inside a table leaves the widget
 * describing the **new** text. Two plausible implementations get this wrong in
 * opposite directions, and both are regression-tested here:
 *
 * - a content-comparing `eq` without `updateDOM` destroys and rebuilds the DOM
 *   on every keystroke, because `updateDOM`'s default returns `false`;
 * - faking a stable identity (a monotonic token, or the table's start offset)
 *   keeps the DOM but leaves the widget's cached `lines` stale, so the table
 *   renders text the document no longer contains.
 *
 * No test calls `toDOM()`: it uses Obsidian's `createDiv` global, which does
 * not exist outside Obsidian. That is also why the redraw counter must stay at
 * zero — these tests exercise state, not rendering.
 */

const TABLE = ['| Name | Value |', '|------|-------|', '| aa   | 11    |'];

/** Live Preview is injected, so these tests drive the field directly. */
const surface = createTableSurface(() => true);

function stateOf(...lines: string[]): EditorState {
    return EditorState.create({
        doc: lines.join('\n'),
        extensions: [surface.extension],
    });
}

interface Entry {
    from: number;
    to: number;
    widget: TableSurfaceWidget;
    block: boolean;
}

function entries(state: EditorState): Entry[] {
    const out: Entry[] = [];
    const cursor = surface.decorations(state).iter();
    while (cursor.value !== null) {
        const spec = cursor.value.spec as {
            widget?: unknown;
            block?: boolean;
        };
        if (spec.widget instanceof TableSurfaceWidget) {
            out.push({
                from: cursor.from,
                to: cursor.to,
                widget: spec.widget,
                block: spec.block === true,
            });
        }
        cursor.next();
    }
    return out;
}

describe('table surface field', () => {
    beforeEach(() => {
        _resetTableSurfaceRedrawCount();
    });

    it('block-replaces a renderable table across its full range', () => {
        const state = stateOf('Above', '', ...TABLE, '', 'Below');
        const found = entries(state);

        expect(found).toHaveLength(1);
        expect(found[0]?.block).toBe(true);
        expect(found[0]?.from).toBe(state.doc.line(3).from);
        expect(found[0]?.to).toBe(state.doc.line(5).to);
        expect(found[0]?.widget.lines).toEqual(TABLE);
    });

    it('produces nothing for a table inside a fenced code block', () => {
        expect(entries(stateOf('```', ...TABLE, '```'))).toHaveLength(0);
    });

    it('reflects the NEW text after an edit inside the table', () => {
        const before = stateOf('Above', '', ...TABLE);
        const at = before.doc.line(5).from + 2;
        const after = before.update({
            changes: { from: at, insert: 'X' },
        }).state;

        const widget = entries(after)[0]?.widget;
        expect(widget).toBeInstanceOf(TableSurfaceWidget);
        // Reusing a cached widget would still report `| aa   | 11    |` here.
        expect(widget?.lines[2]).toBe('| Xaa   | 11    |');
        expect(widget?.lines[2]).not.toBe(TABLE[2]);
    });

    it('tracks the table through a shift of earlier text', () => {
        const before = stateOf('Above', '', ...TABLE);
        const after = before.update({
            changes: { from: 0, insert: 'prefix\n' },
        }).state;

        const found = entries(after);
        expect(found).toHaveLength(1);
        expect(found[0]?.from).toBe(after.doc.line(4).from);
        expect(found[0]?.widget.lines).toEqual(TABLE);
    });

    it('finds both tables when a second is appended at the end boundary', () => {
        // An edit landing exactly on the first table's `to` broke the earlier
        // range-keyed reuse scheme, so it is pinned here.
        const before = stateOf(...TABLE);
        const after = before.update({
            changes: {
                from: before.doc.length,
                insert: `\n\n${TABLE.join('\n')}`,
            },
        }).state;

        const found = entries(after);
        expect(found).toHaveLength(2);
        expect(found[0]?.widget.lines).toEqual(TABLE);
        expect(found[1]?.widget.lines).toEqual(TABLE);
    });

    it('drops the decoration when the table stops being renderable', () => {
        const before = stateOf(...TABLE);
        expect(entries(before)).toHaveLength(1);

        const separator = before.doc.line(2);
        const after = before.update({
            changes: {
                from: separator.from,
                to: separator.to,
                insert: '| x |',
            },
        }).state;

        expect(entries(after)).toHaveLength(0);
    });

    it('provides its decorations at the highest precedence', () => {
        const state = EditorState.create({
            doc: TABLE.join('\n'),
            extensions: [
                // Given a precedence boost of its own, so this fails if
                // `Prec.highest` is dropped from the field.
                Prec.high(EditorView.decorations.of(Decoration.none)),
                surface.extension,
            ],
        });

        const values = state.facet(EditorView.decorations);
        const ours = surface.decorations(state);
        expect(values.indexOf(ours as DecorationSet)).toBe(0);
    });

    it('never builds DOM, so the redraw counter stays at zero', () => {
        const before = stateOf(...TABLE);
        before.update({ changes: { from: 0, insert: 'x' } });
        expect(getTableSurfaceRedrawCount()).toBe(0);
    });
});

describe('TableSurfaceWidget.eq', () => {
    it('is true for identical content and false for any difference', () => {
        const a = new TableSurfaceWidget(TABLE);
        expect(a.eq(new TableSurfaceWidget([...TABLE]))).toBe(true);
        expect(
            a.eq(new TableSurfaceWidget([...TABLE.slice(0, 2), '| bb | 22 |'])),
        ).toBe(false);
        expect(a.eq(new TableSurfaceWidget(TABLE.slice(0, 2)))).toBe(false);
    });
});

describe('table surface gating', () => {
    it('renders nothing when shouldRender is false', () => {
        const gated = createTableSurface(() => false);
        const state = EditorState.create({
            doc: TABLE.join('\n'),
            extensions: [gated.extension],
        });
        expect(gated.decorations(state).size).toBe(0);
    });

    it('renders when shouldRender is true, so the gate is what decides', () => {
        const open = createTableSurface(() => true);
        const state = EditorState.create({
            doc: TABLE.join('\n'),
            extensions: [open.extension],
        });
        expect(open.decorations(state).size).toBe(1);
    });
});

describe('table surface gate changes', () => {
    /**
     * Regression for a gap in the tests above: they all used a CONSTANT
     * predicate, so a gate that flips was never exercised. The field rebuilt
     * only on `docChanged`, and switching Live Preview to Source mode changes
     * the gate without touching the document — so the cached decoration set
     * survived and the table stayed replaced in Source mode, which is issue
     * #167 item 2 reproduced by the gate meant to prevent it. Caught in a
     * browser, not here.
     *
     * The gate must be **state-derived** to model production, where it reads
     * `editorLivePreviewField`. A predicate closing over a mutable variable
     * cannot exercise the fix at all: both `tr.startState` and `tr.state`
     * would read the same current value, so nothing would ever look changed.
     */
    it('rebuilds when the gate flips without a document change', () => {
        const setLive = StateEffect.define<boolean>();
        const liveField = StateField.define<boolean>({
            create: () => true,
            update: (value, tr) => {
                for (const effect of tr.effects) {
                    if (effect.is(setLive)) return effect.value;
                }
                return value;
            },
        });
        const surface = createTableSurface(
            (state) => state.field(liveField, false) === true,
        );
        const state = EditorState.create({
            doc: TABLE.join('\n'),
            extensions: [liveField, surface.extension],
        });
        expect(surface.decorations(state).size).toBe(1);

        const hidden = state.update({ effects: setLive.of(false) }).state;
        expect(surface.decorations(hidden).size).toBe(0);

        const shown = hidden.update({ effects: setLive.of(true) }).state;
        expect(surface.decorations(shown).size).toBe(1);
    });
});
