import {
    EditorView,
    ViewPlugin,
    type PluginValue,
    type ViewUpdate,
} from '@codemirror/view';
import { type Extension } from '@codemirror/state';
import { getEditorView } from '../util/editor';
import { MarkdownView, editorInfoField } from 'obsidian';
import {
    setCursorSuppressedForView,
    clearCursorSuppressedForView,
} from '@replit/codemirror-vim';
import { findTableRanges, cursorInRange } from './table-utils';
import { isTableNavActive } from './table-nav-state';
import { isRevealedAt } from './table/reveal/reveal-field';
import {
    pauseAnimatedCursorForView,
    resumeAnimatedCursorForView,
} from './animated-cursor/config';

function isTableCellEditor(view: EditorView): boolean {
    return view.dom.closest('.cm-table-widget') !== null;
}

/**
 * Whether a table in this view is rendered as Obsidian's widget.
 *
 * A revealed table is not, by design: its rows are ordinary editor lines and
 * the caret drawn there is the only one. The caller asks `isRevealedAt` first
 * for exactly that reason, so a widget elsewhere in the note does not read as
 * the caret's table.
 *
 * `offsetParent` rather than presence: a widget inside a collapsed fold or an
 * inactive tab is in the DOM and renders nothing, and suppressing the cursor
 * for it would hide the caret in a view with no visible table at all.
 */
function hasRenderedTable(view: EditorView): boolean {
    const rendered = view.dom.querySelectorAll('.cm-table-widget');
    for (let i = 0; i < rendered.length; i++) {
        if ((rendered[i] as HTMLElement).offsetParent !== null) return true;
    }
    return false;
}

function getParentEditorView(cellView: EditorView): EditorView | null {
    try {
        const info = cellView.state.field(editorInfoField);
        const mdView = info.app?.workspace?.getActiveViewOfType(MarkdownView);
        if (!mdView) return null;
        return getEditorView(mdView);
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
            // While suppression is held, re-evaluate on EVERY update. What
            // releases it — the table ceasing to render — is neither a
            // selection nor a focus change, and a Live Preview → Source
            // switch is exactly that case: the parent's head does not move
            // and the parent never held focus (the nested child did), so this
            // early return stranded the override permanently and no cursor
            // was drawn anywhere until the view was recreated. The cheap
            // guard is kept for the common unsuppressed case.
            if (
                !this.cursorInTable &&
                !(update.selectionSet || update.focusChanged)
            ) {
                return;
            }

            // A revealed table is ordinary editor lines, and the caret drawn
            // in it is the only one there is. Asked of the state, not the
            // DOM: this runs before CodeMirror redraws, so on the keystroke
            // that enters a table its widget is still in the DOM, and every
            // *other* table on screen keeps Obsidian's widget anyway — either
            // would hide the caret in the one table being edited.
            const inTable =
                !isRevealedAt(update.state, update.state.selection.main.head) &&
                hasRenderedTable(update.view) &&
                findTableRanges(update.state).some((t) =>
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
                const navActive = isTableNavActive(this.parentView.state);
                if (!navActive) {
                    clearCursorSuppressedForView(this.parentView);
                    resumeAnimatedCursorForView(this.parentView);
                }
                const pv = this.parentView;
                this.parentView = null;
                if (!navActive) {
                    queueMicrotask(() => {
                        try {
                            pv.requestMeasure();
                        } catch {
                            void 0;
                        }
                    });
                }
            }
        }
    },
);

export function createTableCellCursorGuard(): Extension {
    return [mainEditorTableCursorGuard, cellEditorCursorGuard];
}
