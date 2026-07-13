import type { MarkdownView } from 'obsidian';
import type { EditorView } from '@codemirror/view';

export function getEditorView(view: MarkdownView): EditorView | null {
    try {
        const outer = (view.editor as unknown as Record<string, unknown>).cm as
            | Record<string, unknown>
            | undefined;
        if (!outer) return null;
        if (typeof outer.dispatch === 'function')
            return outer as unknown as EditorView;
        const inner = outer.cm6 as EditorView | undefined;
        return inner ?? null;
    } catch {
        return null;
    }
}
