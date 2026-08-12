import type { MarkdownView } from 'obsidian';
import type { EditorView } from '@codemirror/view';

export function getEditorView(view: MarkdownView): EditorView | null {
    try {
        return view.editor.cm ?? null;
    } catch {
        return null;
    }
}
