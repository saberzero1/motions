import {
    type App,
    type MarkdownEditView,
    MarkdownView,
    editorInfoField,
} from 'obsidian';
import type {
    TableCell,
    TableEditor,
} from '@obsidian-typings/obsidian-public-latest';
import type { EditorView } from '@codemirror/view';

export type { EditMode };

/**
 * Extended MarkdownEditView shape that narrows table cell properties
 * to the upstream obsidian-typings TableEditor / TableCell interfaces.
 */
type EditMode = MarkdownEditView & {
    tableCell: {
        table: TableEditor;
        cell: TableCell;
        cm: unknown;
    } | null;
};

function getEditMode(app: App): EditMode | null {
    const view = app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return null;
    const editMode = view.editMode as EditMode | undefined;
    if (!editMode || typeof editMode.editTableCell !== 'function') return null;
    return editMode;
}

export function getActiveTableEditor(app: App): TableEditor | null {
    const editMode = getEditMode(app);
    if (!editMode?.tableCell) return null;
    return editMode.tableCell.table;
}

export function getActiveTableCell(app: App): TableCell | null {
    const editMode = getEditMode(app);
    if (!editMode?.tableCell) return null;
    return editMode.tableCell.cell;
}

export function getActiveTableCellEditorView(app: App): EditorView | null {
    const editMode = getEditMode(app);
    if (!editMode?.tableCell) return null;
    const cm = editMode.tableCell.cm as EditorView | null | undefined;
    return cm ?? null;
}

export function hasActiveTableCell(app: App): boolean {
    const editMode = getEditMode(app);
    return editMode?.tableCell != null;
}

export function destroyActiveTableCell(app: App): void {
    const editMode = getEditMode(app);
    if (!editMode?.tableCell) return;
    editMode.destroyTableCell();
}

export function isNativeTableEditorAvailable(app: App): boolean {
    const editMode = getEditMode(app);
    return editMode !== null;
}

export function getTableEditorFromWidgetEl(
    widgetEl: HTMLElement,
): TableEditor | null {
    const cmTile = (widgetEl as unknown as Record<string, unknown>).cmTile as
        Record<string, unknown> | undefined;
    const widget = cmTile?.widget as TableEditor | undefined;
    if (!widget || typeof widget.getCellAt !== 'function') return null;
    return widget;
}

export function isInLivePreview(app: App): boolean {
    const view = app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return false;
    return view.getMode() === 'source' && !view.editMode.sourceMode;
}

// -- View-local EditMode access (split-view safe) --

export function getEditModeForView(view: EditorView): EditMode | null {
    try {
        const info = view.state.field(editorInfoField);
        if (!(info instanceof MarkdownView)) return null;
        const editMode = info.editMode as EditMode | undefined;
        if (!editMode || typeof editMode.editTableCell !== 'function') {
            return null;
        }
        return editMode;
    } catch {
        return null;
    }
}

// -- TableEditor registry (WeakMap keyed by containerEl) --

const tableEditorRegistry = new WeakMap<HTMLElement, TableEditor>();

export function registerTableEditor(
    containerEl: HTMLElement,
    table: TableEditor,
): void {
    tableEditorRegistry.set(containerEl, table);
}

export function getTableEditorFromRegistry(
    containerEl: HTMLElement,
): TableEditor | null {
    if (!containerEl.isConnected) return null;
    return tableEditorRegistry.get(containerEl) ?? null;
}

export function findTableWidgetElement(
    view: EditorView,
    tableFrom: number,
): HTMLElement | null {
    const widgets = view.dom.querySelectorAll('.cm-table-widget');
    if (widgets.length === 0) return null;
    if (widgets.length === 1) return widgets[0] as HTMLElement;

    let bestEl: HTMLElement | null = null;
    let bestDist = Infinity;
    for (let i = 0; i < widgets.length; i++) {
        const el = widgets[i] as HTMLElement;
        try {
            const pos = view.posAtDOM(el, 0);
            const dist = Math.abs(pos - tableFrom);
            if (dist < bestDist) {
                bestDist = dist;
                bestEl = el;
            }
        } catch {
            // detached or offscreen
        }
    }
    return bestEl;
}

export function getTableEditorForPosition(
    view: EditorView,
    tableFrom: number,
): TableEditor | null {
    const widgetEl = findTableWidgetElement(view, tableFrom);
    if (!widgetEl) return null;
    return getTableEditorFromWidgetEl(widgetEl);
}
