import { type App } from 'obsidian';
import { EditorView } from '@codemirror/view';
import {
    createEmbeddableEditor,
    type EmbeddableMarkdownEditor,
} from '../editors/embeddable-editor';
import { getCellDocumentRange } from './table-utils';
import type { CursorShape, CursorShapes } from '../settings';

export interface CellEditorHandle {
    editor: EmbeddableMarkdownEditor;
    row: number;
    col: number;
    originalText: string;
    tableFromLine: number;
    wrapperEl: HTMLElement;
}

let activeHandle: CellEditorHandle | null = null;
let cellEditorCursorShapes: CursorShapes | undefined;
let cursorSheet: CSSStyleSheet | null = null;

function shapeCSS(shape: CursorShape): string {
    switch (shape) {
        case 'block':
            return 'background: var(--interactive-accent) !important; color: var(--text-on-accent) !important; outline: none !important;';
        case 'bar':
            return 'background: transparent !important; width: 2px !important; border-left: 2px solid var(--interactive-accent) !important; outline: none !important;';
        case 'underline':
            return 'background: transparent !important; border-bottom: 2px solid var(--interactive-accent) !important; outline: none !important;';
        case 'hollow':
            return 'background: transparent !important; outline: solid 1px var(--interactive-accent) !important;';
    }
}

function updateCursorStyleSheet(shapes: CursorShapes): void {
    if (!cursorSheet) {
        cursorSheet = new CSSStyleSheet();
        document.adoptedStyleSheets = [
            ...document.adoptedStyleSheets,
            cursorSheet,
        ];
    }

    const S = '.vim-table-cell-editor .cm-editor';
    const rules = [
        `${S} .cm-fat-cursor { ${shapeCSS(shapes.normal)} }`,
        `${S} .cm-scroller:not(.cm-vimMode) .cm-line { caret-color: var(--caret-color, var(--text-normal)) !important; }`,
        `${S} .cm-scroller:not(.cm-vimMode) .cm-cursorLayer { display: block !important; }`,
    ];

    cursorSheet.replaceSync(rules.join('\n'));
}

export function setCellEditorCursorShapes(
    shapes: CursorShapes | undefined,
): void {
    cellEditorCursorShapes = shapes;
    if (shapes) {
        updateCursorStyleSheet(shapes);
    }
}

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
        extensions: [],
        cursorShapes: cellEditorCursorShapes,
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

export function destroyCellEditorCursorSheet(): void {
    if (cursorSheet) {
        document.adoptedStyleSheets = document.adoptedStyleSheets.filter(
            (s) => s !== cursorSheet,
        );
        cursorSheet = null;
    }
}
