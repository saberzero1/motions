import type { App, Component, Editor } from 'obsidian';
import type { EditorView } from '@codemirror/view';
import type { EditorSelection, Text } from '@codemirror/state';
import type { TableCellEditor } from 'obsidian';

/**
 * Runtime-discovered typings for Obsidian's internal table editor API.
 *
 * Source: spike-table-editor-introspection + spike-table-editor-hooks
 * (runtime Object.getOwnPropertyNames + prototype chain enumeration).
 *
 * The obsidian-typings package (1.13.7) declares `TableEditor` as an
 * empty interface.  At runtime, the object has 55 methods and 18 own
 * properties.  These typings document the discovered API surface.
 *
 * Obsidian version: 1.13.7 (verified via e2e spike tests).
 *
 * Prototype chain (all minified as `t`/`e`):
 *   [0] TableEditor — table management (55 members)
 *   [1] ChildWidgetType — addChild/removeChild/noReuse (4 members)
 *   [2] ObsidianWidgetType — addAction/addEditButton/destroy/hookClickHandler/
 *       resizeWidget/setOwner/setPos/toDOM (9 members)
 *   [3] CM6 WidgetType — compare/coordsAt/destroy/editable/eq/
 *       estimatedHeight/ignoreEvent/isHidden/lineBreaks/updateDOM (11 members)
 */

// ---------------------------------------------------------------------------
// TableCell — a single cell in the table grid
// ---------------------------------------------------------------------------

export interface ObsidianTableCell {
    col: number;
    contentEl: HTMLElement;
    dirty: boolean;
    el: HTMLElement;
    end: number;
    padEnd: number;
    padStart: number;
    row: number;
    start: number;
    table: ObsidianTableEditor;
    text: string;

    getAbsoluteOffsets(): { start: number; end: number; textStart: number };
    setTextDir(): void;
}

// ---------------------------------------------------------------------------
// TableRow — an array-like of cells (indexed by column)
// ---------------------------------------------------------------------------

export interface ObsidianTableRow {
    readonly length: number;
    [index: number]: ObsidianTableCell;
    first(): ObsidianTableCell;
    last(): ObsidianTableCell;
    splice(
        start: number,
        deleteCount: number,
        ...items: ObsidianTableCell[]
    ): ObsidianTableCell[];
}

// ---------------------------------------------------------------------------
// SelectionBounds — returned by getSelectionBounds()
// ---------------------------------------------------------------------------

export interface TableSelectionBounds {
    minRow: number;
    maxRow: number;
    minCol: number;
    maxCol: number;
}

// ---------------------------------------------------------------------------
// ObsidianTableEditor — the runtime table manager (CM6 WidgetType subclass)
// ---------------------------------------------------------------------------

export type TableAlignment = 'left' | 'right' | 'center' | null;
export type CursorPlacement = 'before' | 'after';
export type CellPosition = 'end' | 'last-line' | number;
export type CellDirection = 'end' | 'start';

export interface ObsidianTableEditor {
    // ── Own properties ──────────────────────────────────────────────────
    actionsEl: HTMLElement | null;
    alignments: TableAlignment[];
    app: App;
    cellChildMap: Map<ObsidianTableCell, Component>;
    children: Component[];
    colWidths: number[];
    containerEl: HTMLDivElement;
    doc: Text;
    editor: Editor;
    end: number;
    isDocComplete: boolean;
    isMalformed: boolean;
    rows: ObsidianTableRow[];
    selectedCells: ObsidianTableCell[];
    selectionAnchor: ObsidianTableCell | null;
    selectionHead: ObsidianTableCell | null;
    start: number;
    tableEl: HTMLTableElement;
    updateCellReadonly: () => void;

    // ── Cell access ─────────────────────────────────────────────────────
    getCellAt(row: number, col: number): ObsidianTableCell | null;
    getCellAbove(cell: ObsidianTableCell): ObsidianTableCell | null;
    getCellBelow(cell: ObsidianTableCell): ObsidianTableCell | null;
    getClosestCell(x: number, y: number): ObsidianTableCell;
    getNextCell(
        cell: ObsidianTableCell,
        direction: CellDirection,
    ): ObsidianTableCell | null;
    getSelectedCell(cell: ObsidianTableCell): ObsidianTableCell | null;

    // ── Cell focus / editing ────────────────────────────────────────────
    receiveCellFocus(
        row: number,
        col: number,
        selectionFn?: (view: EditorView) => EditorSelection,
        isUserInitiated?: boolean,
    ): TableCellEditor;
    setCellFocus(
        row: number,
        col: number,
        selectionFn?: (view: EditorView) => EditorSelection,
    ): void;
    placeCursorInCell(cell: ObsidianTableCell, position: CellPosition): void;
    placeCursorAround(placement: CursorPlacement): void;

    // ── Row operations ──────────────────────────────────────────────────
    insertRow(
        index: number,
        focusCol: number,
        copyFromRow?: false | string,
    ): void;
    removeRow(index: number, focusCol: number): void;
    moveRow(from: number, to: number, focusCol: number): void;
    addNewLine(placement: CursorPlacement): void;

    // ── Column operations ───────────────────────────────────────────────
    insertColumn(
        focusRow: number,
        index: number,
        alignment: TableAlignment,
        copyFromCol?: boolean,
    ): void;
    removeColumn(focusRow: number, index: number): void;
    moveColumn(from: number, to: number, focusRow: number): void;
    setAlignment(cols: number[], alignment: 'start' | 'end' | 'center'): void;

    // ── Selection ───────────────────────────────────────────────────────
    selectCells(
        anchor: ObsidianTableCell,
        head: ObsidianTableCell,
        force?: boolean,
    ): void;
    deselectCells(): void;
    selectTable(): void;
    deselectTable(): void;
    getSelectionBounds(): TableSelectionBounds | null;
    validateSelectionBounds(bounds: TableSelectionBounds): TableSelectionBounds;
    containsSelection(selection: ObsidianTableCell): boolean;
    containedBySelection(cell: ObsidianTableCell): boolean;
    containsRange(from: number, to: number): boolean;

    // ── Clipboard ───────────────────────────────────────────────────────
    copySelection(event: ClipboardEvent, cut: boolean): void;
    pasteSelection(event: ClipboardEvent): void;
    deleteSelection(cut: boolean): void;

    // ── Cell content ────────────────────────────────────────────────────
    updateCell(
        cell: ObsidianTableCell,
        text: string,
    ): Array<{ from: number; to: number; insert: string }>;
    rerenderCell(cell: ObsidianTableCell): void;
    trimCell(cell: ObsidianTableCell): void;
    offsetCellsAfter(cell: ObsidianTableCell, offset: number): void;

    // ── Document sync ───────────────────────────────────────────────────
    dispatchTable(
        focusRow?: number,
        focusCol?: number,
        selectionFn?: (view: EditorView) => EditorSelection,
    ): void;
    dispatchUpdate(cellEditorUpdate: unknown, cellEditorTr: unknown): void;
    receiveUpdate(viewUpdate: unknown, newDoc: Text): boolean;
    receiveIncompleteUpdate(viewUpdate: unknown, newDoc: Text): void;
    receiveSelection(selection: unknown): void;
    reconcileChanges(viewUpdate: unknown, newDoc: Text): unknown;
    applyCellUpdates(
        changes: unknown,
        cellMap: Map<ObsidianTableCell, string>,
        annotations: unknown[],
    ): void;
    getTableString(bounds: TableSelectionBounds): string;
    rebuildTable(): Text;

    // ── Rendering / DOM ─────────────────────────────────────────────────
    render(): void;
    initDOM(): void;
    toDOM(): HTMLElement;
    postProcess(cell: ObsidianTableCell): void;
    cleanupChildren(): void;
    removeChildren(cell: ObsidianTableCell): void;

    // ── UI chrome ───────────────────────────────────────────────────────
    makeAlignmentMenu(menu: unknown, cols: number[]): void;
    makeAlignmentRow(menu: unknown, cols: number[]): void;
    makeColMenu(menu: unknown, col: number): void;
    makeRowMenu(menu: unknown, row: number): void;
    makeSortMenu(menu: unknown, col: number): void;
    onContextMenu(event: MouseEvent, cell: ObsidianTableCell): void;
    sortByColumn(
        col: number,
        direction: 'asc' | 'desc',
        focusRow: number,
    ): void;

    // ── Drag handles ────────────────────────────────────────────────────
    createDragHandle(type: 'row' | 'col', index: number): HTMLElement;
    setActiveDragHandles(cell: ObsidianTableCell): void;
    unsetActiveDragHandles(cell: ObsidianTableCell): void;

    // ── CM6 WidgetType overrides ────────────────────────────────────────
    readonly estimatedHeight: number;
    readonly text: string;
}

// ---------------------------------------------------------------------------
// Augment obsidian-typings' empty TableEditor with our discovered API.
// This allows code that receives a TableEditor from editTableCell() or
// tableCell.table to access the real methods without manual casting.
// ---------------------------------------------------------------------------

declare module 'obsidian' {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- declaration merging: augments obsidian-typings' empty TableEditor with discovered methods
    interface TableEditor extends ObsidianTableEditor {}

    interface TableCell {
        table: ObsidianTableEditor;
        getAbsoluteOffsets(): { start: number; end: number; textStart: number };
        setTextDir(): void;
    }
}
