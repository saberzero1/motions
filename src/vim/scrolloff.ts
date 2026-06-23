import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import type { Plugin } from 'obsidian';

let scrolloffLines = 0;

export function createScrolloffExtension(): Extension {
    return EditorView.scrollMargins.of((view) => {
        if (scrolloffLines <= 0) return null;
        const lineHeight = view.defaultLineHeight || 22;
        const margin = scrolloffLines * lineHeight;
        return { top: margin, bottom: margin };
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
