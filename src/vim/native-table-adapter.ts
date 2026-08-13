import { type App, MarkdownView } from 'obsidian';
import type { EditorView } from '@codemirror/view';
import type {
    ObsidianTableEditor,
    ObsidianTableCell,
} from '../types/table-editor';

type EditMode = Record<string, unknown> & {
    tableCell: {
        table: ObsidianTableEditor;
        cell: ObsidianTableCell;
        cm: unknown;
    } | null;
    editTableCell: (te: unknown, cell: unknown) => unknown;
    destroyTableCell: (cell?: unknown) => void;
    cm: unknown;
    activeCM: unknown;
};

function getEditMode(app: App): EditMode | null {
    const view = app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return null;
    const editMode = (view as unknown as Record<string, unknown>).editMode as
        | EditMode
        | undefined;
    if (!editMode || typeof editMode.editTableCell !== 'function') return null;
    return editMode;
}

export function getActiveTableEditor(app: App): ObsidianTableEditor | null {
    const editMode = getEditMode(app);
    if (!editMode?.tableCell) return null;
    return editMode.tableCell.table;
}

export function getActiveTableCell(app: App): ObsidianTableCell | null {
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

export function getTableEditorFromWidget(app: App): ObsidianTableEditor | null {
    const view = app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return null;
    const container = (view as unknown as { contentEl: HTMLElement }).contentEl;
    const widget = container?.querySelector('.cm-table-widget');
    if (!widget) return null;

    const editMode = getEditMode(app);
    if (!editMode?.tableCell) return null;
    return editMode.tableCell.table;
}

export function isInLivePreview(app: App): boolean {
    const view = app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return false;
    const state = view.getState() as { mode: string; source?: boolean };
    return state.mode === 'source' && state.source !== true;
}
