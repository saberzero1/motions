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
 * The set is rebuilt on every document change rather than mapped forward.
 * That is deliberate: DOM survival is `TableSurfaceWidget.updateDOM`'s job,
 * not the field's, so a rebuilt widget with equal content is either ignored by
 * CM6 (`eq` true) or patched in place. An earlier version mapped the set and
 * reused widget instances to preserve identity; that preserved the DOM but
 * left the reused widget's cached `lines` stale, and its range-keyed reuse
 * broke when an edit landed exactly on a table's end boundary.
 *
 * The remaining cost is the scan itself. `findRenderableTableRanges` is linear
 * in the document, so a very large note pays it per keystroke; replacing the
 * rebuild with a mapped, incrementally reconciled set is a measured
 * optimisation deferred until it is shown to matter.
 */
const tableSurfaceField = StateField.define<DecorationSet>({
    create: (state) => build(state),
    update: (value, tr) => (tr.docChanged ? build(tr.state) : value),
    provide: (field) => Prec.highest(EditorView.decorations.from(field)),
});

function build(state: EditorState): DecorationSet {
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
}

export function createTableSurfaceExtension(): Extension {
    return [tableSurfaceField];
}

/** @internal — read the field's decorations for assertions. */
export function getTableSurfaceDecorations(state: EditorState): DecorationSet {
    return state.field(tableSurfaceField);
}
