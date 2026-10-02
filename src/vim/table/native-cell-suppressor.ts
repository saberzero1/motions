import { MarkdownView, type App } from 'obsidian';
import type { EditorView } from '@codemirror/view';
import { getEditorView } from '../../util/editor';

interface NativeCellEditor {
    destroy?: () => void;
}

interface TableEditMode {
    tableCell?: NativeCellEditor | null;
}

/**
 * Clears Obsidian's own table cell editor for `parent`, so the cell the cursor
 * is in stays writable through the parent document.
 *
 * Owning the table *renderer* does not take over the table *editor*. With the
 * owned surface installed, Obsidian's `.cm-table-widget` is measurably gone
 * from the document, yet parking the cursor in a table still constructs a
 * `TableCellEditor` — **off-document**, measured at `isConnected: false` inside
 * a detached widget — and while `editMode.tableCell` holds it, a change
 * dispatched to that one cell's range does not apply. Writes to the header row,
 * the separator row and the rest of the document all do, so this is a per-cell
 * lock rather than anything range-wide.
 *
 * `null` is Obsidian's own resting value for the field — it is null whenever no
 * cell is being edited — so clearing it puts the view in a state Obsidian
 * already handles everywhere, rather than a fabricated one. `destroy()` runs
 * first because it releases the editor's own resources; it is **not**
 * sufficient on its own, measured: after `destroy()` the reference remains set
 * and the write is still blocked.
 *
 * It must be re-applied whenever the selection moves inside a table, because
 * Obsidian reconstructs the editor then. It does not come back on its own: a
 * cleared editor stayed cleared across a second of idle time.
 *
 * Measured facts this relies on, all in
 * `.omo/table-probe/FINDINGS.md` § "STEP 3b" and § "CELL EDITOR SUPPRESSION".
 */
export function suppressNativeCellEditor(
    app: App,
    parent: EditorView,
): boolean {
    for (const leaf of app.workspace.getLeavesOfType('markdown')) {
        const view = leaf.view;
        if (!(view instanceof MarkdownView)) continue;
        if (getEditorView(view) !== parent) continue;

        const editMode = (view as unknown as { editMode?: TableEditMode })
            .editMode;
        const cell = editMode?.tableCell;
        if (!editMode || !cell) return false;

        try {
            cell.destroy?.();
        } catch (err) {
            console.warn(
                'Vim Motions: native table cell editor teardown failed:',
                err,
            );
        }
        editMode.tableCell = null;
        return true;
    }
    return false;
}
