import { type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

function isTableCellEditor(view: EditorView): boolean {
    return view.dom.closest('.cm-table-widget') !== null;
}

const tableCellClass = EditorView.editorAttributes.of((view) => {
    if (isTableCellEditor(view)) {
        return { class: 'vim-motions-table-cell-editor' };
    }
    return null;
});

export function skipInTableCells(extension: Extension): Extension {
    return [extension, tableCellClass];
}
