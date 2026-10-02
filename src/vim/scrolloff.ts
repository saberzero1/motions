import { EditorView, ViewPlugin } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import type { Plugin } from 'obsidian';
import { classifySurface } from '../util/surface-gate';

/**
 * How many times the enforcer has run for a view, for e2e assertions.
 *
 * A geometry reading cannot verify the cell gate below: a one-line cell editor
 * has `scrollHeight ≈ clientHeight`, so the enforcer's own `>= 1` threshold
 * means it never writes `scrollTop` there. "It did not scroll" is therefore
 * true whether or not the listener ran, and only a count distinguishes inert
 * from no-op.
 */
const applied = new WeakMap<EditorView, number>();

export function getScrolloffApplications(view: EditorView): number {
    return applied.get(view) ?? 0;
}

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

function clamp(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, n));
}

export function createScrolloffExtension(): Extension {
    return [
        mouseTracker,
        EditorView.updateListener.of((update) => {
            if (scrolloffLines <= 0 || mouseActive) return;
            if (!update.selectionSet) return;
            // Obsidian creates one editor per table cell, and this listener
            // measured 8 runs inside a cell across two keystrokes. A one-line
            // cell cannot scroll, so the work is pure cost.
            //
            // No connected-view latch is needed here, unlike the treesitter
            // bridge's: that gate runs in a `ViewPlugin` constructor, which
            // executes while a cell editor is still detached. An
            // `updateListener` has no such phase, and `selectionSet` above
            // already implies the view is in the document.
            if (classifySurface(update.view) === 'table-cell') return;
            applied.set(update.view, (applied.get(update.view) ?? 0) + 1);

            const view = update.view;
            const head = view.state.selection.main.head;
            const coords = view.coordsAtPos(head);
            if (!coords) return;

            const lineHeight = view.defaultLineHeight || 22;
            const viewportH = view.scrollDOM.clientHeight;
            if (viewportH <= 0) return;

            const m = Math.min(scrolloffLines * lineHeight, viewportH / 2);
            const scrollTop = view.scrollDOM.scrollTop;
            const scrollRect = view.scrollDOM.getBoundingClientRect();

            // Use visual coordinates to compute document-relative cursor position,
            // then derive scroll constraints that enforce both margins simultaneously.
            const cursorDocTop = scrollTop + (coords.top - scrollRect.top);
            const cursorDocBottom =
                scrollTop + (coords.bottom - scrollRect.top);

            const minScroll = cursorDocBottom - viewportH + m;
            const maxScroll = cursorDocTop - m;

            let target: number;
            if (minScroll <= maxScroll) {
                target = clamp(scrollTop, minScroll, maxScroll);
            } else {
                // Zone smaller than line block (high scrolloff centering):
                // use midpoint for direction-independent symmetric centering.
                target = (minScroll + maxScroll) / 2;
            }

            const maxPossible = Math.max(
                0,
                view.scrollDOM.scrollHeight - viewportH,
            );
            target = clamp(target, 0, maxPossible);

            if (Math.abs(target - scrollTop) >= 1) {
                view.scrollDOM.scrollTop = target;
            }
        }),
    ];
}

/**
 * Effective `scrolloff`, in display rows. The bundled fork reads this so
 * `zz`/`zt`/`zb` honour the same value as the cursor-motion enforcer above:
 * those commands scroll `scrollDOM` directly without dispatching a
 * transaction, so the update listener never sees them.
 */
export function getScrolloffLines(): number {
    return scrolloffLines;
}

export function getScrolloffMargin(view: EditorView): number {
    if (scrolloffLines <= 0) return 0;
    const lineHeight = view.defaultLineHeight || 22;
    const margin = scrolloffLines * lineHeight;
    const halfViewport = Math.floor(view.scrollDOM.clientHeight / 2);
    return Math.min(margin, halfViewport);
}

export class ScrolloffManager {
    constructor(plugin: Plugin) {
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
