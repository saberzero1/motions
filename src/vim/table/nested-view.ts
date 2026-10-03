import {
    EditorSelection,
    EditorState,
    type Extension,
} from '@codemirror/state';
import {
    EditorView,
    ViewPlugin,
    drawSelection,
    type PluginValue,
    type ViewUpdate,
} from '@codemirror/view';
import type { TableRange } from '../table-utils';
import { runCleanups } from '../../util/cleanup';
import { snippetState } from '../../snippets/autocomplete-types';
import { getCmAdapterFromEditorView } from '../vim-api';
import { isExternalBackendActive } from '../external-mode';
import {
    getRoutedKeyCount,
    installKeyRouter,
    type SnippetTabHandler,
} from './key-router';
import { mirrorRanges } from './selection-mirror';
import { tableCellDecorations } from './cell-decorations';
import { syncUpExtension, type SyncUpTarget, type TextDiff } from './sync-up';
import { findRenderableTableRanges } from './renderable-ranges';
import { buildTableLayout, cellAt } from './layout-model';
import {
    TABLE_SURFACE_ROOT_SELECTOR,
    nestedHostContainer,
    setNestedMounted,
} from './surface-widget';

const NESTED_CLASS = 'vim-motions-table-nested';

/**
 * Clears Obsidian's own cell editor for this parent; true if one was cleared.
 *
 * Injected rather than imported so this module stays free of an `obsidian`
 * dependency, matching how `surface-field.ts` takes its Live Preview gate.
 */
export type SuppressNativeCellEditor = (parent: EditorView) => boolean;

export interface NestedTableStats {
    mounts: number;
    unmounts: number;
    cleanups: number;
    suppressions: number;
    mounted: number;
    gutters: number;
    cursorLayers: number;
    doc: string | null;
    connected: boolean;
    focused: boolean;
    childHead: number;
    routed: number;
    selectedText: string;
    routerInstalled: boolean;
}

interface Mounted {
    from: number;
    view: EditorView;
    root: HTMLElement;
    cleanups: (() => void)[];
    /**
     * Whether this mount installed a key router.
     *
     * Asserted directly rather than inferred from key behaviour: under RPC the
     * parent's capture handler calls `preventDefault` and `stopPropagation`
     * before a child listener would run, so an installed-but-starved router is
     * behaviourally identical to an absent one and a behavioural control for it
     * is unfalsifiable.
     */
    routerInstalled: boolean;
}

let mounts = 0;
let unmounts = 0;
let cleanups = 0;
let suppressions = 0;
const live = new Set<Mounted>();

/**
 * What the nested editors contain and whether any exist, for e2e assertions.
 *
 * `gutters` and `cursorLayers` are counted inside the nested view because it is
 * constructed directly rather than through Obsidian, so nothing registered with
 * `registerEditorExtension` should reach it. Zero here is only meaningful
 * alongside the parent's own non-zero counts: a nested editor that failed to
 * mount at all reads zero for both, which is how two earlier surface-gate
 * attempts reported success while doing nothing.
 *
 * `connected` exists because every other field here survives the editor being
 * torn out of the document: the view object, its state and its own DOM subtree
 * all persist while orphaned. A negative control that detached the host passed
 * on all of them.
 */
export function getNestedTableStats(): NestedTableStats {
    const first: Mounted | undefined = live.values().next().value;
    return {
        mounts,
        unmounts,
        cleanups,
        suppressions,
        mounted: live.size,
        gutters: first
            ? first.view.dom.querySelectorAll('.cm-gutters').length
            : -1,
        cursorLayers: first
            ? first.view.dom.querySelectorAll('.cm-vimCursorLayer').length
            : -1,
        doc: first ? first.view.state.doc.toString() : null,
        connected: first ? first.view.dom.isConnected : false,
        focused: first ? first.view.hasFocus : false,
        childHead: first ? first.view.state.selection.main.head : -1,
        routed: getRoutedKeyCount(),
        selectedText: first
            ? first.view.state.sliceDoc(
                  first.view.state.selection.main.from,
                  first.view.state.selection.main.to,
              )
            : '',
        routerInstalled: first ? first.routerInstalled : false,
    };
}

/**
 * Every selection range the nested editor currently renders.
 *
 * Separate from `getNestedTableStats`'s `selectedText`, which reports only the
 * main range and so cannot distinguish a mirrored three-row block from a
 * mirror that kept just `.main`.
 */
export function getNestedSelectionReport(): {
    childTexts: string[];
    childCount: number;
    childMain: number;
} {
    const first: Mounted | undefined = live.values().next().value;
    if (!first) return { childTexts: [], childCount: -1, childMain: -1 };
    const { selection } = first.view.state;
    return {
        childTexts: selection.ranges.map((r) =>
            first.view.state.sliceDoc(r.from, r.to),
        ),
        childCount: selection.ranges.length,
        childMain: selection.mainIndex,
    };
}

/**
 * A child offset moved out of a delimiter and into a cell.
 *
 * A click on a rendered `|` resolves to a position inside the delimiter's own
 * range, which belongs to no cell — the next motion or text object would then
 * act from between two cells. `cellAt` deliberately returns null there rather
 * than guessing, so the choice is made here: prefer the cell that starts
 * immediately after the delimiter, and fall back to the one ending at it for a
 * row's final `|`.
 */
function snapOutOfDelimiter(table: TableRange, childPos: number): number {
    const layout = buildTableLayout({
        from: 0,
        to: table.lines.join('\n').length,
        lines: table.lines,
    });
    if (!layout || cellAt(layout, childPos)) return childPos;

    for (const row of layout.rows) {
        if (childPos < row.from || childPos > row.to) continue;
        const after = row.cells.find((c) => c.from === childPos + 1);
        if (after) return after.from;
        const before = row.cells.find((c) => c.to === childPos);
        if (before) return before.to;
        return childPos;
    }
    return childPos;
}

/** The table the parent's cursor is in, or null. */
function activeTable(state: EditorState): TableRange | null {
    const head = state.selection.main.head;
    for (const table of findRenderableTableRanges(state.doc)) {
        if (head >= table.from && head <= table.to) return table;
    }
    return null;
}

/**
 * The widget root rendering `table`, or null while it has no DOM.
 *
 * Matched by document position rather than by order, because a note can hold
 * several tables and the viewport may render only some of them. A root outside
 * the viewport does not exist at all, which is why the caller tolerates null
 * and retries instead of latching.
 */
function findSurfaceRoot(
    parent: EditorView,
    table: TableRange,
): HTMLElement | null {
    const roots = parent.dom.querySelectorAll<HTMLElement>(
        TABLE_SURFACE_ROOT_SELECTOR,
    );
    for (const root of Array.from(roots)) {
        try {
            if (parent.posAtDOM(root, 0) === table.from) return root;
        } catch {
            // Detached or not yet measured; the next reconcile retries.
        }
    }
    return null;
}

/**
 * Owns at most one nested `EditorView` per parent editor, mounted in the active
 * table's widget.
 *
 * A nested editor is what can make a block-replaced range editable at all: the
 * replaced range has no caret and no position mapping (measured,
 * `.omo/table-probe/FINDINGS.md` § Q7), while a nested editor hosting focus
 * keeps the parent's parked selection stable (§ Spike 1).
 *
 * It is **not yet wired to the parent**, and is mounted read-only and unfocused
 * deliberately. Routing keys to the parent's vim is Step 4 and forwarding
 * insert-mode text is Step 5; focusing an unrouted editor now would swallow
 * every keystroke as plain text in a document the parent never sees — issue
 * #167 item 3 reproduced in new code, which the spike measured doing exactly
 * that (`dd` inserted a literal `dd`).
 *
 * Reconciliation is deferred to an animation frame because a `ViewPlugin`'s
 * `update` runs before CodeMirror writes the DOM, so a widget root created in
 * the same cycle does not exist yet — the same ordering that defeated the
 * treesitter surface gate's first implementation. It also keeps child-view
 * construction out of the parent's update cycle. The pass re-reads live state
 * rather than a captured one and never latches: a root it cannot find leaves
 * the table unmounted and the next cursor movement tries again.
 *
 * State is per host, not module-global. A single global mount would make two
 * split panes showing tables unmount each other on every update.
 */
class NestedTableHost implements PluginValue {
    private frame: number | null = null;
    private current: Mounted | null = null;
    /** True while this host is writing the child's selection. */
    private mirroring = false;
    /** Captured at construction: a popout's window must survive teardown. */
    private readonly win: Window;

    constructor(
        private readonly parent: EditorView,
        private readonly suppressNativeCellEditor: SuppressNativeCellEditor,
        private readonly snippetTab: SnippetTabHandler,
    ) {
        this.win = parent.dom.win;
    }

    update(update: ViewUpdate): void {
        if (
            update.docChanged ||
            update.selectionSet ||
            update.viewportChanged
        ) {
            this.schedule();
        }
    }

    destroy(): void {
        if (this.frame !== null) {
            this.win.cancelAnimationFrame(this.frame);
            this.frame = null;
        }
        this.unmount();
    }

    private schedule(): void {
        if (this.frame !== null) return;
        this.frame = this.win.requestAnimationFrame(() => {
            this.frame = null;
            this.reconcile();
        });
    }

    private reconcile(): void {
        const table = activeTable(this.parent.state);
        if (!table) {
            this.handOff();
            return;
        }

        // Before anything else: while Obsidian's own cell editor holds this
        // cell, the parent document cannot be written at that one range.
        if (this.suppressNativeCellEditor(this.parent)) suppressions++;

        const text = table.lines.join('\n');
        const held = this.current;
        // `view.dom` as well as `root`: the widget's own repaint can detach the
        // editor's host while leaving the view object perfectly alive, and an
        // orphaned editor shows the user nothing. Remount rather than keep it.
        if (
            held &&
            held.from === table.from &&
            held.root.isConnected &&
            held.view.dom.isConnected
        ) {
            // Same table: keep the view and re-seed its text. Remounting here
            // would destroy focus and any composition once Step 4 wires them.
            if (held.view.state.doc.toString() !== text) {
                held.view.dispatch({
                    changes: {
                        from: 0,
                        to: held.view.state.doc.length,
                        insert: text,
                    },
                });
            }
            this.syncSelection(held, table);
            // While the cursor is in a table the child owns focus — that is
            // the whole arrangement, and it has to be reclaimed rather than
            // only taken at mount. A command that writes the parent through
            // the adapter focuses it as a side effect: measured after
            // `:tablerealign`, `mounted: 1` with the child `focused: false`
            // and the parent focused, which leaves the editor rendered by the
            // child and driven by neither — `u` and `.` both did nothing.
            // Conditional on the parent actually holding focus, so focus is
            // never pulled from another pane or a modal.
            // Never under RPC: there the child is presentational and focus
            // must stay on the parent, which is where every RPC path
            // measures. Reclaiming it here would undo that on the first
            // reconcile after mount.
            if (
                !isExternalBackendActive() &&
                !held.view.hasFocus &&
                this.parent.hasFocus
            ) {
                held.view.contentDOM.focus();
            }
            return;
        }

        const root = findSurfaceRoot(this.parent, table);
        if (!root) {
            this.unmount();
            return;
        }

        this.unmount();
        this.mount(table, text, root);
        if (this.current) this.syncSelection(this.current, table);
    }

    /**
     * Put the child's selection where the parent's is — a caret in normal mode,
     * the visual range in visual mode.
     *
     * Without this the user's caret and the position commands act on drift
     * apart, and every command appears to operate somewhere other than where
     * the cursor is. The visual half is what makes a selection visible at all:
     * the child is the focused view, so its selection is what renders.
     */
    private syncSelection(held: Mounted, table: TableRange): void {
        const doc = this.parent.state.doc;
        const mapped = mirrorRanges(
            getCmAdapterFromEditorView(this.parent)?.state?.vim,
            this.parent.state.selection,
            {
                start: (line) => doc.line(line + 1).from,
                end: (line) => doc.line(line + 1).to,
            },
            table,
            !!this.parent.state.field(snippetState, false),
        );

        const current = held.view.state.selection;
        const unchanged =
            current.ranges.length === mapped.ranges.length &&
            current.mainIndex === mapped.mainIndex &&
            current.ranges.every((r, i) => {
                const m = mapped.ranges[i];
                return (
                    m !== undefined &&
                    r.anchor === m.anchor &&
                    r.head === m.head
                );
            });
        if (unchanged) return;
        // `scrollIntoView` is the whole of horizontal scrolling here. The
        // nested editor's scroller is overflow-x auto and genuinely scrollable,
        // but nothing moves it: the parent's vim owns the motion, so the child
        // never sees a cursor command of its own. Measured without this, the
        // child sat at `scrollLeft: 0` through 60 `l` presses while native
        // reached 623 — `owned` was strictly worse than `native`.
        this.mirroring = true;
        try {
            held.view.dispatch({
                selection: EditorSelection.create(
                    mapped.ranges.map((r) =>
                        EditorSelection.range(r.anchor, r.head),
                    ),
                    mapped.mainIndex,
                ),
                scrollIntoView: true,
            });
        } finally {
            this.mirroring = false;
        }
    }

    /**
     * Carries a selection the **child** originated back up to the parent.
     *
     * Needed because a click is the one way the caret moves without the parent
     * knowing. Measured: clicking the `cc` cell moved the child's head from 34
     * to 52 and left the parent's at 46, so the caret the user saw and the
     * position the next vim command acted on were different cells.
     *
     * Only selection-only updates are considered. A `docChanged` update is
     * `sync-up.ts`'s business, and it already carries the caret.
     *
     * The `mirroring` guard is what stops a loop: this host writes the child's
     * selection whenever the parent's moves, and without the flag that write
     * would bounce straight back. A focus check is not sufficient — the child
     * holds focus in exactly the case the mirror runs.
     */
    private selectionUpExtension(): Extension {
        return EditorView.updateListener.of((update) => {
            if (this.mirroring) return;
            if (!update.selectionSet || update.docChanged) return;
            const held = this.current;
            if (!held || update.view !== held.view) return;

            const table = this.tableAt(held.from);
            if (!table) return;

            const childHead = update.state.selection.main.head;
            const snapped = snapOutOfDelimiter(table, childHead);
            const parentHead = table.from + snapped;
            if (this.parent.state.selection.main.head === parentHead) return;
            this.parent.dispatch({ selection: { anchor: parentHead } });
        });
    }

    /** The live table starting at `from`, re-resolved rather than captured. */
    private tableAt(from: number): TableRange | null {
        for (const candidate of findRenderableTableRanges(
            this.parent.state.doc,
        )) {
            if (candidate.from === from) return candidate;
        }
        return null;
    }

    /**
     * Where the nested editor's edits go.
     *
     * The table is re-resolved by its start offset on every read rather than
     * captured, because the range grows and shrinks as the user types and a
     * captured `to` would be stale by the first keystroke.
     */
    private syncUpTarget(held: () => Mounted | null): SyncUpTarget {
        const tableOf = (): TableRange | null => {
            const current = held();
            if (!current) return null;
            for (const candidate of findRenderableTableRanges(
                this.parent.state.doc,
            )) {
                if (candidate.from === current.from) return candidate;
            }
            return null;
        };

        return {
            read: () => tableOf()?.lines.join('\n') ?? null,
            write: (diff: TextDiff, childHead: number) => {
                const table = tableOf();
                if (!table) return;
                this.parent.dispatch({
                    changes: {
                        from: table.from + diff.from,
                        to: table.from + diff.to,
                        insert: diff.insert,
                    },
                    selection: { anchor: table.from + childHead },
                });
            },
        };
    }

    private mount(table: TableRange, text: string, root: HTMLElement): void {
        const host = nestedHostContainer(root);
        const target = this.syncUpTarget(() => this.current);
        // Under the Neovim backend the surface is **presentational**: Neovim
        // owns text and keys, and `key-delegation.ts` already owns them from
        // the parent's `contentDOM` by enclosure. A focused, editable child
        // would compete for both — and worse, a composition begun in it is
        // yanked to the RPC IME input mid-composition, because the delegation
        // path focuses that input on any `isComposing`/`keyCode === 229`
        // event. So the child is made non-competing by construction rather
        // than by relying on event order, which is accidental here.
        const presentational = isExternalBackendActive();
        const view = new EditorView({
            state: EditorState.create({
                doc: text,
                extensions: [
                    EditorView.editorAttributes.of({ class: NESTED_CLASS }),
                    // Visual block mirrors one range per row; without this
                    // CodeMirror keeps only the first.
                    EditorState.allowMultipleSelections.of(true),
                    tableCellDecorations(),
                    // Without this a selection is left to the browser's native
                    // highlight, which renders no `.cm-selectionBackground` and
                    // is not themed like the rest of the editor.
                    drawSelection(),
                    // The selection mirror stays in both modes: it is read-only
                    // output, and the only thing showing the user where they
                    // are inside a block-replaced range.
                    ...(presentational
                        ? [
                              EditorView.contentAttributes.of({
                                  contenteditable: 'false',
                              }),
                          ]
                        : [
                              syncUpExtension(target),
                              this.selectionUpExtension(),
                          ]),
                ],
            }),
            parent: host,
        });

        const releaseRouter = presentational
            ? null
            : installKeyRouter(view, this.parent, this.snippetTab);
        // Focus is the point of the nested editor under the bundled engine: a
        // block-replaced range has no caret of its own, and the parent keeps
        // its selection parked precisely because it is no longer focused.
        // Under RPC focus must stay on the parent, where every RPC path —
        // cursor, IME anchoring, float placement, the popup menu — measures.
        if (!presentational) view.contentDOM.focus();

        setNestedMounted(root, true);
        mounts++;
        this.current = {
            from: table.from,
            view,
            root,
            routerInstalled: releaseRouter !== null,
            cleanups: [
                ...(releaseRouter ? [releaseRouter] : []),
                () => view.destroy(),
                () => setNestedMounted(root, false),
                () => host.remove(),
            ],
        };
        live.add(this.current);
    }

    /**
     * The cursor has left the table: unmount and give focus back to the parent.
     *
     * Unmounting destroys the child's DOM, and with it the only focused element
     * in the editor — so without this the next keystroke reaches nothing and the
     * cursor simply stops moving. A motion out of the table looks like it worked
     * once and then the editor appears dead.
     *
     * Conditional on the child actually holding focus. `unmount` also runs when
     * the view is destroyed or the table is replaced, and focusing the parent
     * there would pull focus away from wherever the user really is.
     */
    private handOff(): void {
        const held = this.current;
        if (!held) return;
        const hadFocus = held.view.hasFocus;
        this.unmount();
        if (hadFocus) this.parent.contentDOM.focus();
    }

    private unmount(): void {
        const held = this.current;
        if (!held) return;
        this.current = null;
        live.delete(held);
        unmounts++;
        cleanups += held.cleanups.length;
        runCleanups(held.cleanups, 'nested table view');
    }
}

export function createNestedTableHost(
    suppressNativeCellEditor: SuppressNativeCellEditor,
    snippetTab: SnippetTabHandler,
): Extension {
    return ViewPlugin.define(
        (view) =>
            new NestedTableHost(view, suppressNativeCellEditor, snippetTab),
    );
}
