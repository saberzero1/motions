import {
    EditorState,
    Transaction,
    type EditorSelection,
    type Extension,
    type TransactionSpec,
} from '@codemirror/state';
import { EditorView, type ViewUpdate } from '@codemirror/view';
import {
    setActive,
    snippetState,
    type ActiveSnippet,
} from './autocomplete-types';

/**
 * Keeps Obsidian's Live Preview from dragging a snippet tabstop out of the
 * Markdown syntax it was placed in (issue #198).
 *
 * Live Preview hides inactive formatting markers (`*`, `**`, `` ` ``, …) behind
 * replace decorations, and a view plugin re-snaps any selection that lands
 * inside a hidden marker to that marker's outer edge. It tests the incoming
 * selection against the decoration set built for the *previous* one, so the
 * snap fires on the very transaction that first moves the cursor into the
 * markup — which is what a tabstop jump does. The corrected selection is
 * dispatched from a zero-delay timer, so the cursor visibly lands on the
 * tabstop and hops out a tick later. Obsidian skips the snap when the same
 * transaction also changed the document, which is why expansion places the
 * first tabstop correctly and only later jumps are affected.
 *
 * The snap has two exposures, and both are guarded here.
 *
 * A tabstop *jump* is a selection-carrying transaction with the autocomplete
 * fork's `setActive` effect. The first *edit* at a tabstop is a document change
 * that leaves the selection inside the active field — the jump's own window is
 * already closed by then, because the edit closes it.
 *
 * Either way the selection that results is recorded, and a following
 * transaction is dropped when it is a bare selection move — no document change,
 * no effects, no user event — that starts from the recorded selection and
 * leaves it.
 *
 * The window is closed by the first transaction that moves the cursor or edits
 * the document, and by a zero-delay timer for the ordinary case where the snap
 * never comes. Transactions that do neither must pass through without closing
 * it: the completion plugin dispatches a selection-less, effect-only
 * bookkeeping transaction in between, and consuming the guard there is what
 * made an earlier state-identity version of this guard miss the snap entirely.
 * A transaction that re-sets the selection it already has moves nothing either,
 * and closing the window on one leaves the snap behind it unguarded. Dropping a
 * snap does not close the window: against a multi-range selection Obsidian does
 * not offset each range past its marker but collapses the selection and
 * rebuilds it over several transactions, so the whole macrotask must be held.
 * The view plugin that schedules the snap runs before update listeners, so
 * Obsidian's timer is always queued ahead of the release.
 */
let guardedSelection: EditorSelection | null = null;

function isTabstopJump(tr: Transaction): boolean {
    return (
        tr.selection !== undefined &&
        !tr.docChanged &&
        tr.effects.some((effect) => effect.is(setActive))
    );
}

function isInsideActiveField(
    active: ActiveSnippet | null | undefined,
    selection: EditorSelection,
): boolean {
    if (!active) return false;
    return selection.ranges.every((range) =>
        active.ranges.some(
            (field) =>
                field.field === active.active &&
                field.from <= range.from &&
                field.to >= range.to,
        ),
    );
}

function isTabstopEdit(update: ViewUpdate): boolean {
    return (
        update.docChanged &&
        isInsideActiveField(
            update.state.field(snippetState, false),
            update.state.selection,
        )
    );
}

function isMarkerSnap(tr: Transaction, guarded: EditorSelection): boolean {
    return (
        tr.selection !== undefined &&
        !tr.docChanged &&
        tr.effects.length === 0 &&
        tr.annotation(Transaction.userEvent) === undefined &&
        tr.startState.selection.eq(guarded) &&
        !tr.selection.eq(guarded)
    );
}

export function createSnippetLivePreviewGuard(): Extension {
    return [
        EditorState.transactionFilter.of(
            (tr): TransactionSpec | readonly TransactionSpec[] => {
                const guarded = guardedSelection;
                if (guarded === null) return tr;

                const selection = tr.selection;
                const movesNothing =
                    !tr.docChanged &&
                    (selection === undefined || selection.eq(guarded));
                if (movesNothing) return tr;

                if (isMarkerSnap(tr, guarded)) return [];

                guardedSelection = null;
                return tr;
            },
        ),
        EditorView.updateListener.of((update) => {
            if (
                !update.transactions.some(isTabstopJump) &&
                !isTabstopEdit(update)
            )
                return;
            const armed = update.state.selection;
            guardedSelection = armed;
            const win = update.view.dom.ownerDocument.defaultView ?? window;
            win.setTimeout(() => {
                if (guardedSelection === armed) guardedSelection = null;
            }, 0);
        }),
    ];
}
