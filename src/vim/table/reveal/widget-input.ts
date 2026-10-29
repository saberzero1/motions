import { editorInfoField } from 'obsidian';
import type { Extension } from '@codemirror/state';
import { ViewPlugin, type EditorView } from '@codemirror/view';
import { buildTableLayout } from '../layout-model';
import { getHighlightChannel } from './highlight-channel';
import { isRevealedAt } from './reveal-field';
import { findTableAt } from './table-extent';

const WIDGET_SELECTOR = '.cm-table-widget';
const CELL_SELECTOR = 'td, th';

/**
 * Targets inside a cell that keep Obsidian's own handling: a link still opens,
 * a checkbox still toggles. Row and column buttons and drag handles sit
 * outside the cells and are not intercepted at all.
 */
const INTERACTIVE_SELECTOR =
    'a, .internal-link, .external-link, .tag, input, button, [draggable="true"], .table-row-drag-handle, .table-col-drag-handle';

const POINTER_EVENTS = [
    'pointerdown',
    'mousedown',
    'click',
    'dblclick',
] as const;

/**
 * `target` as an `Element`, checked across windows.
 *
 * A popout window has its own `Element` constructor, so `instanceof` is false
 * there for every element and clicks on its tables would silently fall
 * through to Obsidian. Obsidian's `Node.instanceOf` compares by window.
 */
function asElement(target: EventTarget | null): Element | null {
    const node = target as Node | null;
    if (!node || typeof node.instanceOf !== 'function') return null;
    return node.instanceOf(Element) ? node : null;
}

interface CellHit {
    widget: HTMLElement;
    row: HTMLTableRowElement;
    cell: HTMLTableCellElement;
}

function resolveCell(
    view: EditorView,
    target: EventTarget | null,
): CellHit | null {
    const el = asElement(target);
    if (!el) return null;
    const cell = el.closest(CELL_SELECTOR);
    const widget = el.closest(WIDGET_SELECTOR);
    if (
        !cell?.instanceOf(HTMLTableCellElement) ||
        !widget?.instanceOf(HTMLElement)
    ) {
        return null;
    }
    // Only this editor's own widgets: a widget can hold editors of its own.
    if (widget.closest('.cm-editor') !== view.dom) return null;
    const row = cell.parentElement;
    if (!row?.instanceOf(HTMLTableRowElement)) return null;
    return { widget, row, cell };
}

/** The character offset of a point within `el`'s text, or null. */
function textOffsetAt(el: Element, x: number, y: number): number | null {
    const doc = el.ownerDocument;
    const caret =
        typeof doc.caretRangeFromPoint === 'function'
            ? doc.caretRangeFromPoint(x, y)
            : null;
    if (!caret || !el.contains(caret.startContainer)) return null;
    let seen = 0;
    const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node === caret.startContainer) return seen + caret.startOffset;
        seen += (node.textContent ?? '').length;
    }
    return null;
}

/**
 * The document offset a cell of Obsidian's widget stands for.
 *
 * The widget's own DOM supplies only which row and column was hit; the
 * position comes from the document, through the same layout model the grid
 * decorations use. `posAtDOM` on a block widget returns the start of the range
 * it replaces, which is the table's header line. Row `0` is the header and the
 * widget renders no delimiter row, so every later row sits one source line
 * further down.
 *
 * Inside a cell, the click lands on the character under the pointer when the
 * cell's rendered text is its source text — plain cells, the common case — and
 * at the start of the cell's content otherwise, since rendered markup does not
 * map back to source characters.
 */
function cellSourcePosition(
    view: EditorView,
    hit: CellHit,
    point: { x: number; y: number } | null,
): number | null {
    let tableFrom: number;
    try {
        tableFrom = view.posAtDOM(hit.widget, 0);
    } catch {
        return null;
    }
    const doc = view.state.doc;
    const extent = findTableAt(doc, doc.lineAt(tableFrom).number);
    if (!extent) return null;

    const table = hit.widget.querySelector('table');
    if (!table) return null;
    const rowIndex = Array.from(table.rows).indexOf(hit.row);
    const column = Array.from(hit.row.cells).indexOf(hit.cell);
    if (rowIndex < 0 || column < 0) return null;
    const sourceRow = rowIndex === 0 ? 0 : rowIndex + 1;

    const lines: string[] = [];
    for (let n = extent.fromLine; n <= extent.toLine; n++) {
        lines.push(doc.line(n).text);
    }
    const layout = buildTableLayout({
        from: extent.from,
        to: extent.to,
        lines,
    });
    const row = layout?.rows[sourceRow];
    if (!row) {
        const line = extent.fromLine + sourceRow;
        return line <= extent.toLine ? doc.line(line).from : extent.from;
    }
    const cell = row.cells[column];
    if (!cell) return row.from;

    const source = doc.sliceString(cell.contentFrom, cell.contentTo);
    if (point && (hit.cell.textContent ?? '').trim() === source) {
        const wrapper =
            hit.cell.querySelector('.table-cell-wrapper') ?? hit.cell;
        const offset = textOffsetAt(wrapper, point.x, point.y);
        if (offset !== null) {
            const leading =
                (wrapper.textContent ?? '').length -
                (wrapper.textContent ?? '').trimStart().length;
            const within = Math.max(
                0,
                Math.min(offset - leading, source.length),
            );
            return cell.contentFrom + within;
        }
    }
    return cell.contentFrom;
}

/** The view's `MarkdownView`-like owner, read without iterating leaves. */
interface CellEditorOwner {
    editMode?: { tableCell?: { destroy?: () => void } | null };
}

/**
 * Releases Obsidian's own cell editor for this view, if it opened one.
 *
 * While `editMode.tableCell` holds an editor, a write to that one cell's range
 * through the parent does not land (measured in `owned` mode, FINDINGS § STEP
 * 3b). `null` is Obsidian's resting value for the field.
 */
export function releaseNativeCellEditor(view: EditorView): void {
    const owner = view.state.field(editorInfoField, false) as
        CellEditorOwner | undefined;
    const editMode = owner?.editMode;
    const cell = editMode?.tableCell;
    if (!editMode || !cell) return;
    try {
        cell.destroy?.();
    } catch (err) {
        console.warn(
            'Vim Motions: native table cell editor teardown failed:',
            err,
        );
    }
    editMode.tableCell = null;
}

class RevealWidgetInput {
    /** Set once a `pointerdown` has placed the caret, until its `click`. */
    private placedByPointer = false;

    /**
     * Set when a placement did not reveal its table, after which this view's
     * widgets are left entirely to Obsidian.
     *
     * Converting a cell editor into a caret placement is only sound when the
     * placement reveals the table. If it does not — no channel, or a table
     * Obsidian renders that the finder misses — the caret lands inside a
     * replaced table, Obsidian's widget opens its cell editor again, focus
     * enters it, and this would place again: measured as a renderer that hung
     * until WebDriver aborted. Stopping after the first failed placement turns
     * that loop into Obsidian's ordinary table editor.
     */
    private disabled = false;

    private readonly onPointer = (event: Event): void => {
        const mouse = event as MouseEvent;
        if (mouse.button !== 0) return;
        if (this.disabled || !getHighlightChannel()) return;
        const hit = resolveCell(this.view, event.target);
        if (!hit) return;
        if (asElement(event.target)?.closest(INTERACTIVE_SELECTOR)) return;
        // Claimed in the capture phase, before Obsidian's widget sees it:
        // its handlers would open a cell editor of its own, the very thing
        // this mode replaces.
        event.preventDefault();
        event.stopPropagation();
        // Placed on `pointerdown`. Cancelling it suppresses the compatibility
        // `mousedown` (Pointer Events spec), measured as `pointerdown` then
        // `click` with no `mousedown` between — so a caret placed only on
        // `mousedown` never moved. `mousedown` still places when no pointer
        // event preceded it.
        if (event.type === 'pointerdown') {
            this.placedByPointer = true;
            this.place(hit, { x: mouse.clientX, y: mouse.clientY });
        } else if (event.type === 'mousedown' && !this.placedByPointer) {
            this.place(hit, { x: mouse.clientX, y: mouse.clientY });
        } else if (event.type === 'click') {
            this.placedByPointer = false;
        }
    };

    /**
     * A cell editor Obsidian opened anyway — a row button, a drag, a path not
     * intercepted above — is converted into the parent's caret in that cell.
     */
    private readonly onFocusIn = (event: FocusEvent): void => {
        if (this.disabled || !getHighlightChannel()) return;
        const target = asElement(event.target);
        if (!target) return;
        const nested = target.closest('.cm-editor');
        if (!nested || nested === this.view.dom) return;
        const hit = resolveCell(this.view, target);
        if (!hit) return;
        queueMicrotask(() => this.place(hit, null));
    };

    constructor(private readonly view: EditorView) {
        for (const type of POINTER_EVENTS) {
            view.contentDOM.addEventListener(type, this.onPointer, true);
        }
        view.dom.addEventListener('focusin', this.onFocusIn, true);
    }

    private place(hit: CellHit, point: { x: number; y: number } | null): void {
        if (this.disabled) return;
        const pos = cellSourcePosition(this.view, hit, point);
        if (pos === null) return;
        releaseNativeCellEditor(this.view);
        this.view.dispatch({
            selection: { anchor: pos },
            userEvent: 'select.pointer',
        });
        if (!isRevealedAt(this.view.state, pos)) {
            this.disabled = true;
            console.warn(
                'Vim Motions: a table could not be revealed; leaving it to Obsidian.',
            );
            return;
        }
        this.view.focus();
    }

    destroy(): void {
        for (const type of POINTER_EVENTS) {
            this.view.contentDOM.removeEventListener(
                type,
                this.onPointer,
                true,
            );
        }
        this.view.dom.removeEventListener('focusin', this.onFocusIn, true);
    }
}

/** Routes pointer input on Obsidian's idle table widgets to the parent. */
export function revealWidgetInput(): Extension {
    return ViewPlugin.fromClass(RevealWidgetInput);
}
