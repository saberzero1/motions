import { EditorState, type Extension } from '@codemirror/state';
import {
    EditorView,
    ViewPlugin,
    type PluginValue,
    type ViewUpdate,
} from '@codemirror/view';
import type { TableRange } from '../table-utils';
import { runCleanups } from '../../util/cleanup';
import { getRoutedKeyCount, installKeyRouter } from './key-router';
import { findRenderableTableRanges } from './renderable-ranges';
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
}

interface Mounted {
    from: number;
    view: EditorView;
    root: HTMLElement;
    cleanups: (() => void)[];
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
    };
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
    /** Captured at construction: a popout's window must survive teardown. */
    private readonly win: Window;

    constructor(
        private readonly parent: EditorView,
        private readonly suppressNativeCellEditor: SuppressNativeCellEditor,
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
            this.unmount();
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
            this.syncCaret(held, table);
            return;
        }

        const root = findSurfaceRoot(this.parent, table);
        if (!root) {
            this.unmount();
            return;
        }

        this.unmount();
        this.mount(table, text, root);
        if (this.current) this.syncCaret(this.current, table);
    }

    /**
     * Put the child's caret where the parent's vim head is.
     *
     * The child's document is exactly the parent's slice `[from, to]`, so the
     * translation is a subtraction. Without it the user's caret and the
     * position commands act on drift apart, and every command appears to
     * operate somewhere other than where the cursor is.
     */
    private syncCaret(held: Mounted, table: TableRange): void {
        const head = this.parent.state.selection.main.head;
        const offset = Math.max(
            0,
            Math.min(head - table.from, held.view.state.doc.length),
        );
        if (held.view.state.selection.main.head === offset) return;
        held.view.dispatch({ selection: { anchor: offset } });
    }

    private mount(table: TableRange, text: string, root: HTMLElement): void {
        const host = nestedHostContainer(root);
        const view = new EditorView({
            state: EditorState.create({
                doc: text,
                extensions: [
                    EditorView.editorAttributes.of({ class: NESTED_CLASS }),
                    // `readOnly`, not `editable: false`, which is not
                    // interchangeable here: the view must stay focusable or
                    // the router never receives a key. Read-only keeps text
                    // out of a document the parent never sees.
                    EditorState.readOnly.of(true),
                ],
            }),
            parent: host,
        });

        const releaseRouter = installKeyRouter(view, this.parent);
        // Focus is the point of the nested editor: a block-replaced range has
        // no caret of its own. The parent keeps its selection parked where it
        // is precisely because it is no longer the focused view.
        view.contentDOM.focus();

        setNestedMounted(root, true);
        mounts++;
        this.current = {
            from: table.from,
            view,
            root,
            cleanups: [
                releaseRouter,
                () => view.destroy(),
                () => setNestedMounted(root, false),
                () => host.remove(),
            ],
        };
        live.add(this.current);
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
): Extension {
    return ViewPlugin.define(
        (view) => new NestedTableHost(view, suppressNativeCellEditor),
    );
}
