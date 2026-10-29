import type { ChangeDesc, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

/**
 * The fields of Obsidian's private table widget this module touches.
 *
 * Duck-typed by method names, which survive minification, rather than by the
 * minified class name, which changes every release (`nI`, `DB`, `KR`, `bq`,
 * `nj` across 1.5.8–1.13.7).
 */
interface ObsidianTableWidget {
    start: number;
    receiveSelection: (...args: unknown[]) => void;
}

function isObsidianTableWidget(value: unknown): value is ObsidianTableWidget {
    const w = value as Record<string, unknown> | null;
    return (
        !!w &&
        typeof w['start'] === 'number' &&
        typeof w['receiveSelection'] === 'function' &&
        typeof w['receiveUpdate'] === 'function' &&
        typeof w['rebuildTable'] === 'function'
    );
}

let retired = 0;

/** How many widgets have been retired this session, for e2e assertions. */
export function getRetiredWidgetCount(): number {
    return retired;
}

/**
 * Stops Obsidian reusing its widget for each table about to be revealed.
 *
 * Revealing a table does not destroy Obsidian's widget for it. The builder
 * keeps the instance in its reuse list and, every transaction, calls its
 * `receiveUpdate` and `receiveSelection` whether or not the widget is still
 * displayed. With the caret inside a cell that opens a `TableCellEditor`; on a
 * pipe or the delimiter row it schedules `placeCursorInCell` on a timer, which
 * is the cursor jump of issue #121. Measured: without this, entering a revealed
 * table pushed the caret out to the line below and `x` changed nothing.
 *
 * A no-op `receiveSelection` alone is **not** enough. `receiveUpdate` still
 * reconciles the widget's private copy of the table and writes back through
 * `dispatchTable`, which reformatted the delimiter row in the spike. So the
 * instance is dropped instead: the builder reuses a widget only when its
 * `start` matches the table's, and `Infinity` matches nothing — without
 * reaching the `mapPos` call that a negative value would. A fresh widget is
 * built when the table is hidden again. `receiveSelection` is silenced as
 * well, so a future builder that reuses it anyway still cannot act on it.
 *
 * Must run before Obsidian's builder sees the transaction, which is why it is
 * called from a transaction extender. Only the revealed tables' widgets may be
 * retired: retiring an idle one would rebuild it on every transaction.
 */
export function retireTableWidgets(
    startState: EditorState,
    changes: ChangeDesc,
    spans: readonly { from: number; to: number }[],
): void {
    if (spans.length === 0) return;
    const back = changes.invertedDesc;
    for (const source of startState.facet(EditorView.decorations)) {
        if (typeof source === 'function') continue;
        for (const span of spans) {
            source.between(
                back.mapPos(span.from, -1),
                back.mapPos(span.to, 1),
                (_from, _to, value) => {
                    const widget: unknown = (
                        value.spec as { widget?: unknown } | undefined
                    )?.widget;
                    if (!isObsidianTableWidget(widget)) return;
                    if (widget.start === Infinity) return;
                    widget.start = Infinity;
                    widget.receiveSelection = () => {};
                    retired++;
                },
            );
        }
    }
}
