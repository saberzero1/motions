import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

function findFirstEditableLine(view: EditorView): number {
    const doc = view.state.doc;
    if (doc.line(1).text !== '---') return 1;
    for (let i = 2; i <= doc.lines; i++) {
        if (doc.line(i).text === '---') return Math.min(i + 1, doc.lines);
    }
    return 1;
}

export function createPropertiesNavExtension(): Extension {
    return EditorView.domEventHandlers({
        keydown(event, view) {
            if (event.key !== 'k' && event.key !== 'ArrowUp') return false;
            if (event.ctrlKey || event.altKey || event.metaKey) return false;

            const cm = (view as unknown as Record<string, unknown>).cm as
                | Record<string, unknown>
                | undefined;
            const vim = (cm?.state as Record<string, unknown>)?.vim as
                | Record<string, boolean>
                | undefined;
            if (!vim || vim.insertMode || vim.visualMode) return false;

            const cursor = view.state.selection.main.head;
            const line = view.state.doc.lineAt(cursor);
            const firstEditable = findFirstEditableLine(view);
            if (line.number > firstEditable) return false;

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
        },
    });
}
