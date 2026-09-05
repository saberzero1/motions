import { EditorView, ViewPlugin } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import type { Plugin } from 'obsidian';

let scrolloffLines = 0;
let mouseDown = false;

function onDocumentPointerUp(): void {
    mouseDown = false;
}

const mouseTracker = ViewPlugin.define(
    () => ({
        destroy() {},
    }),
    {
        eventObservers: {
            pointerdown() {
                mouseDown = true;
            },
            pointerup() {
                mouseDown = false;
            },
        },
    },
);

export function createScrolloffExtension(): Extension {
    return [
        mouseTracker,
        EditorView.scrollMargins.of((view) => {
            if (scrolloffLines <= 0 || mouseDown) return null;
            const lineHeight = view.defaultLineHeight || 22;
            const margin = scrolloffLines * lineHeight;
            const halfViewport = Math.floor(view.scrollDOM.clientHeight / 2);
            const clampedMargin = Math.min(margin, halfViewport);
            return { top: clampedMargin, bottom: clampedMargin };
        }),
    ];
}

export function getScrolloffMargin(view: EditorView): number {
    if (scrolloffLines <= 0) return 0;
    const lineHeight = view.defaultLineHeight || 22;
    const margin = scrolloffLines * lineHeight;
    const halfViewport = Math.floor(view.scrollDOM.clientHeight / 2);
    return Math.min(margin, halfViewport);
}

export class ScrolloffManager {
    constructor(private plugin: Plugin) {
        plugin.registerDomEvent(
            activeDocument,
            'pointerup',
            onDocumentPointerUp,
        );
    }

    setup(lines: number): void {
        scrolloffLines = lines > 0 ? lines : 0;
    }

    destroy(): void {
        scrolloffLines = 0;
    }
}
