import { WidgetType } from '@codemirror/view';

const ROOT_CLASS = 'vim-motions-table-surface';
const ROW_CLASS = 'vim-motions-table-surface-row';

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
        this.paint(root);
        return root;
    }

    updateDOM(dom: HTMLElement): boolean {
        this.paint(dom);
        return true;
    }

    /** Reconcile row elements to `lines`, reusing the elements already there. */
    private paint(root: HTMLElement): void {
        const rows = root.children;
        for (let i = 0; i < this.lines.length; i++) {
            const line = this.lines[i] ?? '';
            const existing = rows.item(i);
            if (existing instanceof HTMLElement) {
                if (existing.textContent !== line) existing.textContent = line;
            } else {
                const row = root.createDiv({ cls: ROW_CLASS });
                row.textContent = line;
            }
        }
        while (rows.length > this.lines.length) {
            rows.item(rows.length - 1)?.remove();
        }
    }
}
