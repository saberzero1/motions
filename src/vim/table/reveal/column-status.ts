import type { Extension } from '@codemirror/state';
import {
    ViewPlugin,
    type EditorView,
    type PluginValue,
    type ViewUpdate,
} from '@codemirror/view';
import { cellBounds, cellIndexAt } from './cells';
import { isRevealedAt } from './reveal-field';
import { findTableAt } from './table-extent';

/** Where the caret is in a revealed table, for the status bar. */
export interface TableColumnInfo {
    /** 1-based column of the caret. */
    column: number;
    /** Columns in the header row. */
    columns: number;
    /** The header text of the caret's column, trimmed. */
    header: string;
    /** Cells in the caret's row; a mismatch with `columns` is a warning. */
    rowCells: number;
}

/**
 * Reports the caret's column in a revealed table — its number, the header's
 * column count and the header text — and the row's own cell count, so a row
 * that no longer matches the header shows up while it is being edited.
 * rainbow_csv and csv.vim show the same in their statuslines.
 *
 * Only the focused editor reports, and `null` means "not in a revealed
 * table", including when the surface is removed.
 */
export function revealColumnStatus(
    report: (info: TableColumnInfo | null) => void,
): Extension {
    return ViewPlugin.define((view) => new ColumnStatus(view, report));
}

class ColumnStatus implements PluginValue {
    private last: string | null = null;

    constructor(
        private readonly view: EditorView,
        private readonly report: (info: TableColumnInfo | null) => void,
    ) {
        if (view.hasFocus) this.publish();
    }

    update(update: ViewUpdate): void {
        if (update.focusChanged && !update.view.hasFocus) {
            this.send(null);
            return;
        }
        if (!update.view.hasFocus) return;
        if (update.focusChanged || update.selectionSet || update.docChanged) {
            this.publish();
        }
    }

    destroy(): void {
        if (this.last !== null) this.report(null);
    }

    private publish(): void {
        this.send(columnInfo(this.view));
    }

    private send(info: TableColumnInfo | null): void {
        const key = info === null ? null : JSON.stringify(info);
        if (key === this.last) return;
        this.last = key;
        this.report(info);
    }
}

function columnInfo(view: EditorView): TableColumnInfo | null {
    const { state } = view;
    const head = state.selection.main.head;
    if (!isRevealedAt(state, head)) return null;
    const doc = state.doc;
    const line = doc.lineAt(head);
    const table = findTableAt(doc, line.number);
    if (!table) return null;

    const headerText = doc.line(table.fromLine).text;
    const headerBounds = cellBounds(headerText);
    const columns = headerBounds.length - 1;
    const rowBounds = cellBounds(line.text);
    const rowCells = rowBounds.length - 1;
    if (columns < 1 || rowCells < 1) return null;

    const index = Math.min(
        Math.max(cellIndexAt(rowBounds, head - line.from), 0),
        rowCells - 1,
    );
    const from = (headerBounds[index] ?? 0) + 1;
    const to = headerBounds[index + 1];
    const header = to === undefined ? '' : headerText.slice(from, to).trim();
    return { column: index + 1, columns, header, rowCells };
}
