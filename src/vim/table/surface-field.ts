import { Decoration, EditorView } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import {
    Prec,
    StateField,
    type EditorState,
    type Extension,
    type Range,
} from '@codemirror/state';
import { findRenderableTableRanges } from './renderable-ranges';
import { TableSurfaceWidget } from './surface-widget';

/** Decides, per state, whether this editor should render owned tables. */
export type ShouldRender = (state: EditorState) => boolean;

export interface TableSurface {
    extension: Extension;
    decorations(state: EditorState): DecorationSet;
}

/**
 * Block-replaces every renderable table with our own widget.
 *
 * Supplied from a `StateField` at `Prec.highest`. Both are load-bearing:
 *
 * - A `ViewPlugin` cannot provide block decorations at all — CM6 throws
 *   `RangeError: Block decorations may not be specified via plugins`.
 * - At `Prec.highest` our replacement wins over Obsidian's own table
 *   decoration, which is measurably removed from the DOM entirely. At a lower
 *   precedence Obsidian's renders instead and ours is dropped.
 *
 * `shouldRender` is injected rather than read from Obsidian here, so this
 * module stays free of an `obsidian` import and the field is constructible in
 * a unit test. Production supplies the Live Preview check; the decoration must
 * not engage in Source mode or Reading view, since replacing table source in a
 * mode meant to show source is issue #167 item 2.
 *
 * The set is rebuilt on every document change rather than mapped forward.
 * That is deliberate: DOM survival is `TableSurfaceWidget.updateDOM`'s job,
 * not the field's, so a rebuilt widget with equal content is either ignored by
 * CM6 (`eq` true) or patched in place. An earlier version mapped the set and
 * reused widget instances; that preserved the DOM but left the reused widget's
 * cached `lines` stale, and its range-keyed reuse broke when an edit landed
 * exactly on a table's end boundary.
 *
 * The remaining cost is the scan itself. `findRenderableTableRanges` is linear
 * in the document, so a very large note pays it per keystroke; replacing the
 * rebuild with a mapped, incrementally reconciled set is a measured
 * optimisation deferred until it is shown to matter.
 */
export function createTableSurface(shouldRender: ShouldRender): TableSurface {
    const build = (state: EditorState): DecorationSet => {
        if (!shouldRender(state)) return Decoration.none;
        const ranges: Range<Decoration>[] = [];
        for (const table of findRenderableTableRanges(state.doc)) {
            ranges.push(
                Decoration.replace({
                    widget: new TableSurfaceWidget(table.lines),
                    block: true,
                }).range(table.from, table.to),
            );
        }
        return Decoration.set(ranges, true);
    };

    const field = StateField.define<DecorationSet>({
        create: (state) => build(state),
        update: (value, tr) => (tr.docChanged ? build(tr.state) : value),
        provide: (f) => Prec.highest(EditorView.decorations.from(f)),
    });

    return {
        extension: [field],
        decorations: (state) => state.field(field),
    };
}
