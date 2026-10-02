import { WidgetType } from '@codemirror/view';
import type { Alignment } from '../table-utils';
import { CELL_CLASS, DELIMITER_CLASS } from './cell-decorations';
import { buildTableLayout, type TableRowLayout } from './layout-model';

const ROOT_CLASS = 'vim-motions-table-surface';
const ROWS_CLASS = 'vim-motions-table-surface-rows';
const ROW_CLASS = 'vim-motions-table-surface-row';
const HOST_CLASS = 'vim-motions-table-surface-host';
const MOUNTED_CLASS = 'vim-motions-table-surface-mounted';

export const TABLE_SURFACE_ROOT_SELECTOR = `.${ROOT_CLASS}`;

let redrawCount = 0;

/**
 * How many times a table surface widget has built its DOM from scratch.
 *
 * Should stay at one per table across an editing session. A climbing count
 * means `updateDOM` is declining to patch and CM6 is redrawing, which would
 * destroy whatever the widget contains — including, once the nested editor
 * lands, its focus and any IME composition.
 */
export function getTableSurfaceRedrawCount(): number {
    return redrawCount;
}

/** @internal — test seam, so one spec's redraws do not leak into the next. */
export function _resetTableSurfaceRedrawCount(): void {
    redrawCount = 0;
}

/** The rows container, created on demand so `updateDOM` never assumes one. */
function rowsContainer(root: HTMLElement): HTMLElement {
    const existing = root.querySelector<HTMLElement>(`:scope > .${ROWS_CLASS}`);
    return existing ?? root.createDiv({ cls: ROWS_CLASS });
}

/** Where the nested editor mounts: a sibling of the rows, never a row. */
export function nestedHostContainer(root: HTMLElement): HTMLElement {
    const existing = root.querySelector<HTMLElement>(`:scope > .${HOST_CLASS}`);
    return existing ?? root.createDiv({ cls: HOST_CLASS });
}

/** True while a nested editor is mounted, which is what hides the rows. */
export function setNestedMounted(root: HTMLElement, mounted: boolean): void {
    root.classList.toggle(MOUNTED_CLASS, mounted);
}

/**
 * Renders a table's source lines in place of Obsidian's own table widget.
 *
 * `eq` compares **content**, and `updateDOM` patches the existing element in
 * place when content differs. That pairing is what preserves the DOM across
 * edits, and it is easy to get wrong in both directions:
 *
 * - `updateDOM`'s default implementation returns `false`, which makes CM6
 *   redraw. A content-comparing `eq` on its own therefore destroys and
 *   rebuilds the DOM on every keystroke.
 * - Faking a stable identity instead — a monotonic token, or the table's start
 *   offset — keeps the DOM but leaves the widget's cached `lines` stale, so the
 *   table renders text the document no longer contains.
 *
 * `ignoreEvent` is deliberately **not** overridden: returning `false` from it
 * was measured to stop every key reaching the editor.
 */
export class TableSurfaceWidget extends WidgetType {
    constructor(readonly lines: readonly string[]) {
        super();
    }

    eq(other: TableSurfaceWidget): boolean {
        if (other.lines.length !== this.lines.length) return false;
        return other.lines.every((line, i) => line === this.lines[i]);
    }

    toDOM(): HTMLElement {
        redrawCount++;
        const root = createDiv({ cls: ROOT_CLASS });
        root.createDiv({ cls: ROWS_CLASS });
        this.paint(root);
        return root;
    }

    updateDOM(dom: HTMLElement): boolean {
        this.paint(dom);
        return true;
    }

    /**
     * Reconcile row elements to `lines`, reusing the elements already there.
     *
     * Rows live in their own container rather than directly under the root,
     * because the nested editor mounts as a sibling of that container. Painting
     * the root's children directly would treat the nested editor's host element
     * as row *n* and overwrite its `textContent` — destroying the editor.
     */
    private paint(root: HTMLElement): void {
        const container = rowsContainer(root);
        const rows = container.children;
        const layout = buildTableLayout({
            from: 0,
            to: this.lines.join('\n').length,
            lines: [...this.lines],
        });

        for (let i = 0; i < this.lines.length; i++) {
            const line = this.lines[i] ?? '';
            const existing = rows.item(i);
            const row =
                existing instanceof HTMLElement
                    ? existing
                    : container.createDiv({ cls: ROW_CLASS });
            this.paintRow(row, line, layout?.rows[i], layout?.alignments);
        }
        while (rows.length > this.lines.length) {
            rows.item(rows.length - 1)?.remove();
        }
    }

    /**
     * One row, as cell and delimiter spans over **exactly** the line's text.
     *
     * Same classes the nested editor's decorations use, so a theme styles one
     * surface and gets both.
     *
     * Not a `<table>`, and not re-aligned. The nested editor is CodeMirror text
     * showing the padded source, so anything that moved a glyph here would
     * shift the grid the moment the cursor entered the table — the jump
     * `table-typography.e2e.ts` pins to within 1px. Every character of `line`
     * is emitted in order and nothing is inserted or hidden; the only thing
     * added is structure to hang styling on.
     *
     * Guarded by the line text so an edit elsewhere in the note does not
     * rebuild spans for rows that did not change.
     */
    private paintRow(
        row: HTMLElement,
        line: string,
        rowLayout: TableRowLayout | undefined,
        alignments: readonly Alignment[] | undefined,
    ): void {
        if (row.dataset['vimMotionsRow'] === line) return;
        row.dataset['vimMotionsRow'] = line;
        row.textContent = '';
        row.classList.toggle('is-header', rowLayout?.kind === 'header');
        row.classList.toggle('is-separator', rowLayout?.kind === 'separator');

        if (!rowLayout) {
            row.textContent = line;
            return;
        }

        const base = rowLayout.from;
        let cursor = 0;
        const emit = (text: string, cls?: string): void => {
            if (text.length === 0) return;
            if (cls === undefined) row.appendText(text);
            else row.createSpan({ cls, text });
        };

        // The separator row carries delimiters only, matching the nested
        // editor's decorations — `buildTableLayout` does produce cells for it,
        // and treating them as cells here would give the two surfaces
        // different class counts for the same table.
        const isSeparator = rowLayout.kind === 'separator';

        for (const offset of rowLayout.delimiters) {
            const index = offset - base;
            const cell = isSeparator
                ? undefined
                : rowLayout.cells.find(
                      (c) => c.from - base === cursor && cursor < index,
                  );
            if (cell) {
                const align = alignments?.[cell.column] ?? 'none';
                emit(
                    line.slice(cursor, index),
                    `${CELL_CLASS} is-align-${align}`,
                );
            } else {
                emit(line.slice(cursor, index));
            }
            emit(line.slice(index, index + 1), DELIMITER_CLASS);
            cursor = index + 1;
        }
        emit(line.slice(cursor));
    }
}
