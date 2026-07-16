import { type App, Component, MarkdownRenderer } from 'obsidian';
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
    app: App;
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
    rawMarkdown?: string,
): CellEditorHandle | null {
    closeCellEditor(null); // close any previous

    const wrapper = cellEl.querySelector<HTMLElement>('.table-cell-wrapper');
    if (!wrapper) return null;

    const originalText = rawMarkdown ?? wrapper.textContent?.trim() ?? '';

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
        app,
    };
    return activeHandle;
}

export function closeCellEditor(mainView: EditorView | null): {
    changed: boolean;
} {
    if (!activeHandle) return { changed: false };

    const { editor, row, col, originalText, tableFromLine, wrapperEl, app } =
        activeHandle;
    const newText = editor.getValue().trim();
    const changed = newText !== originalText;

    try {
        editor.destroy();
    } catch {
        /* */
    }

    const displayText = changed ? newText : originalText;
    wrapperEl.textContent = displayText;
    rerenderCellContent(wrapperEl, displayText, app);

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

function rerenderCellContent(
    wrapper: HTMLElement,
    markdown: string,
    app: App,
): void {
    if (!markdown) return;

    const comp = new Component();
    comp.load();
    const sourcePath = app.workspace.getActiveFile()?.path ?? '';

    MarkdownRenderer.render(app, markdown, wrapper, sourcePath, comp)
        .then(() => {
            const p = wrapper.querySelector(':scope > p');
            if (wrapper.children.length === 1 && p) {
                while (p.firstChild) {
                    wrapper.appendChild(p.firstChild);
                }
                p.remove();
            }
            const first = wrapper.firstChild;
            if (
                first?.nodeType === Node.TEXT_NODE &&
                first.textContent === markdown
            ) {
                first.remove();
            }
        })
        .catch(() => {});
}
