import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

function getFrontmatterEnd(view: EditorView): number {
    const doc = view.state.doc;
    if (doc.line(1).text !== '---') return 0;
    for (let i = 2; i <= doc.lines; i++) {
        if (doc.line(i).text === '---') return i;
    }
    return 0;
}

function focusLastProperty(view: EditorView): boolean {
    const container = view.dom.closest('.markdown-source-view');
    if (!container) return false;

    const metadataEl = container.querySelector(
        '.metadata-container .metadata-property:last-child',
    );
    if (!metadataEl) return false;

    const focusable =
        metadataEl.querySelector<HTMLElement>(
            'input, textarea, [contenteditable]',
        ) ?? (metadataEl as HTMLElement);

    focusable.focus();
    return true;
}

export function createPropertiesNavExtension(): Extension {
    return EditorView.updateListener.of((update) => {
        if (!update.selectionSet) return;

        const cm = (update.view as unknown as Record<string, unknown>).cm as
            | Record<string, unknown>
            | undefined;
        const vim = (cm?.state as Record<string, unknown>)?.vim as
            | Record<string, boolean>
            | undefined;
        if (!vim || vim.insertMode || vim.visualMode) return;

        const fmEnd = getFrontmatterEnd(update.view);
        if (fmEnd === 0) return;

        const cursor = update.state.selection.main.head;
        const line = update.state.doc.lineAt(cursor);
        if (line.number > fmEnd) return;

        focusLastProperty(update.view);
    });
}
