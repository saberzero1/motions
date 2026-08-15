import {
    EditorView,
    ViewPlugin,
    type PluginValue,
    type ViewUpdate,
} from '@codemirror/view';
import { type Extension } from '@codemirror/state';
import { MarkdownView, editorInfoField } from 'obsidian';
import {
    setCursorSuppressedForView,
    clearCursorSuppressedForView,
} from '@replit/codemirror-vim';
import { findTableRanges, cursorInRange } from './table-utils';
import { isTableNavActive } from './table-nav-state';
import {
    pauseAnimatedCursorForView,
    resumeAnimatedCursorForView,
} from './animated-cursor/config';

function isTableCellEditor(view: EditorView): boolean {
    return view.dom.closest('.cm-table-widget') !== null;
}

function getParentEditorView(cellView: EditorView): EditorView | null {
    try {
        const info = cellView.state.field(editorInfoField);
        const mdView = info.app?.workspace?.getActiveViewOfType(MarkdownView);
        if (!mdView) return null;
        return (mdView.editor as unknown as { cm?: EditorView }).cm ?? null;
    } catch {
        return null;
    }
}

// Runs on the MAIN editor: suppress vim cursor when cursor is in a table range.
const mainEditorTableCursorGuard = ViewPlugin.fromClass(
    class implements PluginValue {
        private cursorInTable = false;

        constructor(private view: EditorView) {}

        update(update: ViewUpdate): void {
            if (isTableCellEditor(update.view)) return;
            if (isTableNavActive(update.state)) return;
            if (!(update.selectionSet || update.focusChanged)) return;

            const tables = findTableRanges(update.state);
            const inTable = tables.some((t) =>
                cursorInRange(update.state, t.from, t.to),
            );
            if (inTable && !this.cursorInTable) {
                this.cursorInTable = true;
                setCursorSuppressedForView(update.view, true);
                pauseAnimatedCursorForView(update.view);
                const vimLayer =
                    update.view.scrollDOM.querySelector('.cm-vimCursorLayer');
                if (vimLayer) vimLayer.textContent = '';
            } else if (!inTable && this.cursorInTable) {
                this.cursorInTable = false;
                clearCursorSuppressedForView(update.view);
                resumeAnimatedCursorForView(update.view);
            }
        }

        destroy(): void {
            if (this.cursorInTable) {
                this.cursorInTable = false;
                // Clear per-view override so global state takes effect.
                // Without this, a stale `true` override persists through
                // plugin recreation, leaving the cursor permanently hidden.
                clearCursorSuppressedForView(this.view);
                resumeAnimatedCursorForView(this.view);
            }
        }
    },
);

// Runs on CELL editors: clears parent cursor on open, restores on close.
const cellEditorCursorGuard = ViewPlugin.fromClass(
    class implements PluginValue {
        private parentView: EditorView | null = null;

        private cellView: EditorView | null = null;

        constructor(view: EditorView) {
            if (!isTableCellEditor(view)) return;
            const parentView = getParentEditorView(view);
            if (parentView && isTableNavActive(parentView.state)) return;
            this.cellView = view;
            setCursorSuppressedForView(view, false);
            this.parentView = getParentEditorView(view);
            if (this.parentView) {
                setCursorSuppressedForView(this.parentView, true);
                pauseAnimatedCursorForView(this.parentView);
                const vimLayer =
                    this.parentView.scrollDOM.querySelector(
                        '.cm-vimCursorLayer',
                    );
                if (vimLayer) vimLayer.textContent = '';
            }
        }

        update(_update: ViewUpdate): void {
            if (!this.cellView) return;
            const cv = this.cellView;
            queueMicrotask(() => {
                const vimLayer =
                    cv.scrollDOM.querySelector('.cm-vimCursorLayer');
                if (
                    vimLayer instanceof HTMLElement &&
                    vimLayer.style.display === 'none'
                ) {
                    vimLayer.removeAttribute('style');
                    cv.requestMeasure();
                }
            });
        }

        destroy(): void {
            if (this.parentView) {
                clearCursorSuppressedForView(this.parentView);
                resumeAnimatedCursorForView(this.parentView);
                const pv = this.parentView;
                this.parentView = null;
                queueMicrotask(() => {
                    try {
                        pv.requestMeasure();
                    } catch {
                        void 0;
                    }
                });
            }
        }
    },
);

export function createTableCellCursorGuard(): Extension {
    return [mainEditorTableCursorGuard, cellEditorCursorGuard];
}
