import { EditorView, ViewPlugin } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import type { Plugin } from 'obsidian';

let scrolloffLines = 0;
let mouseActive = false;
let mouseSettleTimer = 0;

function onDocumentPointerUp(): void {
    window.clearTimeout(mouseSettleTimer);
    mouseSettleTimer = window.setTimeout(() => {
        mouseActive = false;
    }, 100);
}

const mouseTracker = ViewPlugin.define(
    () => ({
        destroy() {},
    }),
    {
        eventObservers: {
            pointerdown() {
                window.clearTimeout(mouseSettleTimer);
                mouseActive = true;
            },
            pointerup() {
                onDocumentPointerUp();
            },
        },
    },
);

/**
 * Enforce scrolloff by adjusting scroll position after cursor moves.
 *
 * Uses `EditorView.updateListener` instead of `EditorView.scrollMargins`
 * because CM6's tooltip plugin treats scroll margins as physical
 * obstructions and hides tooltips whose position falls within the
 * margin zone. Scrolloff is a virtual margin — the text is fully
 * visible and tooltips must appear there normally.
 *
 * The listener fires after every selection change and scrolls the
 * viewport so the cursor stays at least `scrolloffLines` away from
 * the top/bottom edge. Mouse-driven selection (mouseDown) is excluded
 * to avoid fighting the user's scroll intent.
 */
export function createScrolloffExtension(): Extension {
    return [
        mouseTracker,
        EditorView.updateListener.of((update) => {
            if (scrolloffLines <= 0 || mouseActive) return;
            if (!update.selectionSet && !update.viewportChanged) return;

            const view = update.view;
            const head = view.state.selection.main.head;
            const coords = view.coordsAtPos(head);
            if (!coords) return;

            const scrollRect = view.scrollDOM.getBoundingClientRect();
            const lineHeight = view.defaultLineHeight || 22;
            const margin = scrolloffLines * lineHeight;
            const halfViewport = Math.floor(scrollRect.height / 2);
            const clampedMargin = Math.min(margin, halfViewport);

            const cursorTop = coords.top - scrollRect.top;
            const cursorBottom = scrollRect.bottom - coords.bottom;

            if (cursorTop < clampedMargin) {
                view.scrollDOM.scrollTop -= clampedMargin - cursorTop;
            } else if (cursorBottom < clampedMargin) {
                view.scrollDOM.scrollTop += clampedMargin - cursorBottom;
            }
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
