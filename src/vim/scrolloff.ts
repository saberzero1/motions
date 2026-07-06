import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import type { Plugin } from 'obsidian';

let scrolloffLines = 0;

export function createScrolloffExtension(): Extension {
    return EditorView.scrollMargins.of((view) => {
        if (scrolloffLines <= 0) return null;
        const lineHeight = view.defaultLineHeight || 22;
        const margin = scrolloffLines * lineHeight;
        // Clamp to half the viewport height so that high scrolloff values
        // (e.g. `set scrolloff=999`) center the cursor instead of pinning
        // the view at the top or bottom. This mirrors Vim's behavior of
        // silently capping scrolloff to (window_height - 1) / 2.
        const halfViewport = Math.floor(view.scrollDOM.clientHeight / 2);
        const clampedMargin = Math.min(margin, halfViewport);
        return { top: clampedMargin, bottom: clampedMargin };
    });
}

export class ScrolloffManager {
    constructor(private plugin: Plugin) {}

    setup(lines: number): void {
        scrolloffLines = lines > 0 ? lines : 0;
    }

    destroy(): void {
        scrolloffLines = 0;
    }
}
