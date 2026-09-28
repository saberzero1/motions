import {
    EditorState,
    Transaction,
    type EditorSelection,
    type Extension,
    type TransactionSpec,
} from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { setActive } from './autocomplete-types';

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
 * A tabstop jump is a selection-carrying transaction with the autocomplete
 * fork's `setActive` effect. When one is seen, the selection it produced is
 * recorded, and a following transaction is dropped when it is a bare selection
 * move — no document change, no effects, no user event — that starts from the
 * recorded selection and leaves it.
 *
 * The window is closed by the first transaction that moves the cursor or edits
 * the document, and by a zero-delay timer for the ordinary case where the snap
 * never comes. Transactions that do neither must pass through without closing
 * it: the completion plugin dispatches a selection-less, effect-only
 * bookkeeping transaction in between, and consuming the guard there is what
 * made an earlier state-identity version of this guard miss the snap entirely.
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

export function createSnippetLivePreviewGuard(): Extension {
    return [
        EditorState.transactionFilter.of(
            (tr): TransactionSpec | readonly TransactionSpec[] => {
                const guarded = guardedSelection;
                if (guarded === null) return tr;

                const selection = tr.selection;
                if (selection === undefined && !tr.docChanged) return tr;

                guardedSelection = null;
                if (
                    selection === undefined ||
                    tr.docChanged ||
                    tr.effects.length > 0 ||
                    tr.annotation(Transaction.userEvent) !== undefined ||
                    !tr.startState.selection.eq(guarded) ||
                    selection.eq(guarded)
                )
                    return tr;
                return [];
            },
        ),
        EditorView.updateListener.of((update) => {
            if (!update.transactions.some(isTabstopJump)) return;
            const armed = update.state.selection;
            guardedSelection = armed;
            const win = update.view.dom.ownerDocument.defaultView ?? window;
            win.setTimeout(() => {
                if (guardedSelection === armed) guardedSelection = null;
            }, 0);
        }),
    ];
}
