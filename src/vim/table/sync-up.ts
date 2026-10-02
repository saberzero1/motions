import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

export interface TextDiff {
    from: number;
    to: number;
    insert: string;
}

/**
 * The smallest single-region change turning `before` into `after`, or null.
 *
 * Forwarding the whole table as one region-replacing change is what broke
 * dot-repeat in the spike: the parent's vim observes one transaction rather
 * than a keystroke, so `lastInsertModeChanges` captures the entire synced span
 * and `.` replays it. A single typed character has to arrive as a
 * single-character insert, which is what trimming the common prefix and suffix
 * produces.
 *
 * Code units, not code points, and the region boundary **can** fall inside a
 * surrogate pair — two emoji sharing a high surrogate diff to the low surrogate
 * alone. That is harmless: CodeMirror positions are code units too, so
 * reassembly is exact. Pinned by a round-trip test rather than by a claim that
 * the pair stays whole, which measurement contradicted.
 */
export function minimalDiff(before: string, after: string): TextDiff | null {
    if (before === after) return null;

    const limit = Math.min(before.length, after.length);
    let prefix = 0;
    while (
        prefix < limit &&
        before.charCodeAt(prefix) === after.charCodeAt(prefix)
    ) {
        prefix++;
    }

    let suffix = 0;
    while (
        suffix < limit - prefix &&
        before.charCodeAt(before.length - 1 - suffix) ===
            after.charCodeAt(after.length - 1 - suffix)
    ) {
        suffix++;
    }

    return {
        from: prefix,
        to: before.length - suffix,
        insert: after.slice(prefix, after.length - suffix),
    };
}

export interface SyncUpTarget {
    /** The parent's current text for this table, or null if it is gone. */
    read(): string | null;
    /** Apply a child-coordinate diff, plus the child's caret, to the parent. */
    write(diff: TextDiff, childHead: number): void;
}

function flush(child: EditorView, target: SyncUpTarget): void {
    const before = target.read();
    // A missing table means the mount is stale. Treating that as an empty
    // string would diff the child's whole text in as an insertion.
    if (before === null) return;
    const diff = minimalDiff(before, child.state.doc.toString());
    if (!diff) return;
    target.write(diff, child.state.selection.main.head);
}

/**
 * Forwards the nested editor's own edits to the parent document.
 *
 * Insert-mode characters cannot be routed — `handleKey` returns `undefined` for
 * them and inserts nothing — so they are left native to the nested editor and
 * travel to the parent as changes instead of as keys.
 *
 * The forward is **suppressed while composing**. An IME rewrites its preedit
 * repeatedly before committing, and each rewrite is a document change; letting
 * those through puts preedit text into the real document and makes one
 * composition cost several undo steps.
 *
 * No separate `compositionend` flush is needed, which was measured rather than
 * assumed: by the time CodeMirror dispatches the committing transaction
 * `view.composing` is already false, so the commit arrives here as an ordinary
 * update. A `compositionend` listener was implemented first and removed after
 * a negative control showed its absence changed nothing in any of the three
 * composition scenarios. If a real IME is ever found to commit while
 * `composing` is still true, the fix is to defer rather than drop a suppressed
 * flush — and it will be reproducible, which this was not.
 */
export function syncUpExtension(target: SyncUpTarget): Extension {
    return EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        if (update.view.composing) return;
        flush(update.view, target);
    });
}
