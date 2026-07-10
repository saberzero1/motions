import { type App } from 'obsidian';
import { EditorView } from '@codemirror/view';
import {
    createEmbeddableEditor,
    type EmbeddableMarkdownEditor,
} from '../editors/embeddable-editor';
import { createTableAutoFormatExtension } from './table-auto-format';
import { getCellDocumentRange } from './table-utils';

export interface CellEditorHandle {
    editor: EmbeddableMarkdownEditor;
    row: number;
    col: number;
    originalText: string;
    tableFromLine: number;
    wrapperEl: HTMLElement;
}

let activeHandle: CellEditorHandle | null = null;

export function openCellEditor(
    cellEl: HTMLElement, // the <td> or <th>
    row: number,
    col: number,
    tableFromLine: number,
    app: App,
    onEscape: () => void,
): CellEditorHandle | null {
    closeCellEditor(null); // close any previous

    const wrapper = cellEl.querySelector<HTMLElement>('.table-cell-wrapper');
    if (!wrapper) return null;

    const originalText = wrapper.textContent?.trim() ?? '';

    // Clear rendered content, create editor container
    wrapper.textContent = '';
    const editorContainer = createDiv();
    editorContainer.className = 'vim-table-cell-editor';
    wrapper.appendChild(editorContainer);

    const editor = createEmbeddableEditor(app, editorContainer, {
        value: originalText,
        cls: 'vim-table-cell-editor-inner',
        extensions: [createTableAutoFormatExtension(app)],
        onEscape,
    });

    editor.load();
    editor.focus();

    activeHandle = {
        editor,
        row,
        col,
        originalText,
        tableFromLine,
        wrapperEl: wrapper,
    };
    return activeHandle;
}

export function closeCellEditor(mainView: EditorView | null): {
    changed: boolean;
} {
    if (!activeHandle) return { changed: false };

    const { editor, row, col, originalText, tableFromLine, wrapperEl } =
        activeHandle;
    const newText = editor.getValue().trim();
    const changed = newText !== originalText;

    // Detach editor from DOM before write-back (D12 guard)
    try {
        editor.destroy();
    } catch {
        /* */
    }
    wrapperEl.textContent = originalText; // restore temporarily until widget re-renders

    if (changed && mainView) {
        const doc = mainView.state.doc;
        const range = getCellDocumentRange(doc, tableFromLine, row, col);
        if (range) {
            const insertText = newText || ' ';
            mainView.dispatch({
                changes: { from: range.from, to: range.to, insert: insertText },
            });
        }
    }

    activeHandle = null;
    return { changed };
}

export function getActiveCellEditor(): CellEditorHandle | null {
    return activeHandle;
}

export function hasActiveCellEditor(): boolean {
    return activeHandle !== null;
}
