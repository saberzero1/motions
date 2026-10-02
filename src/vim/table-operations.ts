import type { EditorView } from '@codemirror/view';
import type { TableRange } from './table-utils';
import { realignTableLines } from './table-utils';
import { getCmAdapterFromEditorView } from './vim-api';

/**
 * Whether it is safe to rewrite a table's source right now.
 *
 * Realignment replaces the **whole** table, and three facts make that
 * dangerous during insert mode rather than merely untidy: the fork's adapter
 * exposes changed regions with no meaningful origin, insert recording accepts
 * `origin === undefined` as input, and a replacement spanning the table is
 * therefore eligible to enter `lastInsertModeChanges`. A formatter transaction
 * can then be replayed by `.`, which is the defect Plan B Step 5 fixed for
 * `sync-up`.
 *
 * There is deliberately **no** composition check. Plan E1.7 asked for one, and
 * it is both unreachable and unverifiable: every realign entry point —
 * `:tablerealign`, `<Leader>tr`, `=` — is a normal-mode operation, while
 * composition happens in insert mode, which the check below already refuses.
 * A synthetic `compositionstart` cannot even produce the state, because
 * CodeMirror sets `composing` to 0 there and the getter tests `> 0`, so a
 * scenario for it would have asserted nothing.
 */
export function canRealignTable(view: EditorView): boolean {
    return getCmAdapterFromEditorView(view)?.state?.vim?.insertMode !== true;
}

/**
 * Rewrite a table's source to its aligned form.
 *
 * Dispatched straight at the parent, never through `sync-up.ts`: that path
 * exists to carry a *keystroke* as a minimal diff, and handing it a whole-table
 * replacement is what put a formatter edit into dot-repeat before.
 *
 * No `isolateHistory` annotation. Plan E1.7 asked for one, but
 * `@codemirror/commands` is not a declared dependency here — only a transitive
 * one — and the annotation is an `AnnotationType` *instance*, so a copy of it
 * is not the one the host's history extension reads. Undo granularity is
 * measured instead, in `table-realign-guard.e2e.ts`.
 */
export function tableRealign(view: EditorView, table: TableRange): void {
    if (!canRealignTable(view)) return;
    const newLines = realignTableLines(table.lines);
    const newText = newLines.join('\n');
    if (newText === table.lines.join('\n')) return;
    view.dispatch({
        changes: { from: table.from, to: table.to, insert: newText },
    });
}
