import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import type { Plugin } from 'obsidian';

let scrolloffMargin = 0;

export function createScrolloffExtension(): Extension {
    return EditorView.scrollMargins.of(() => {
        if (scrolloffMargin <= 0) return null;
        return { top: scrolloffMargin, bottom: scrolloffMargin };
    });
}

export class ScrolloffManager {
    constructor(private plugin: Plugin) {}

    setup(lines: number): void {
        const lineHeight = 22;
        scrolloffMargin = lines > 0 ? lines * lineHeight : 0;
    }

    destroy(): void {
        scrolloffMargin = 0;
    }
}
