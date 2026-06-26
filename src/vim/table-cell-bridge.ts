/**
 * Table cell focus bridge.
 *
 * In Live Preview, Obsidian renders Markdown tables as interactive widgets.
 * Each table cell gets its own CM6 EditorView (with vim already attached via
 * `registerEditorExtension`).  However, the plugin's UI components (status
 * bar, chord display, which-key) listen only to the **main** editor's
 * CmAdapter, so they go silent when focus enters a cell.
 *
 * This module detects table-cell focus transitions and exposes the cell's
 * CmAdapter so consumers can forward events.
 *
 * Access path: `.cm-content` → `.cmTile.view` → `.cm` (CmAdapter)
 */

import { MarkdownView } from 'obsidian';
import type { App } from 'obsidian';
import type { CmAdapter, VimApi } from '../types/vim-api';
import type { EditorView } from '@codemirror/view';

type CellFocusCallback = (adapter: CmAdapter) => void;
type CellBlurCallback = () => void;

/** DOM element with CM6 internal tile reference. */
interface CmContentElement extends HTMLElement {
    cmTile?: { view: EditorView & { cm?: CmAdapter } };
}

export class TableCellBridge {
    private focusCallbacks: CellFocusCallback[] = [];
    private blurCallbacks: CellBlurCallback[] = [];
    private focusHandler: ((e: FocusEvent) => void) | null = null;
    private blurHandler: ((e: FocusEvent) => void) | null = null;
    private activeAdapter: CmAdapter | null = null;
    private activeTableWidget: HTMLElement | null = null;

    constructor(
        private app: App,
        vim?: VimApi,
    ) {
        this.setupListeners();
        if (vim) this.setupEscapeAction(vim);
    }

    onCellFocus(cb: CellFocusCallback): void {
        this.focusCallbacks.push(cb);
    }

    onCellBlur(cb: CellBlurCallback): void {
        this.blurCallbacks.push(cb);
    }

    /** The currently-active table cell adapter, if any. */
    getActiveAdapter(): CmAdapter | null {
        return this.activeAdapter;
    }

    private setupListeners(): void {
        this.focusHandler = (e: FocusEvent) => {
            const target = e.target as HTMLElement | null;
            if (!target) return;

            const tableWidget = target.closest('.cm-table-widget');
            if (!tableWidget) return;

            const adapter = this.extractAdapter(tableWidget as HTMLElement);
            if (!adapter || this.activeAdapter === adapter) return;

            this.activeAdapter = adapter;
            this.activeTableWidget = tableWidget as HTMLElement;
            for (const cb of this.focusCallbacks) {
                cb(adapter);
            }
        };

        this.blurHandler = (e: FocusEvent) => {
            if (!this.activeAdapter) return;

            const related = e.relatedTarget as HTMLElement | null;
            if (related?.closest('.cm-table-widget')) return;

            const adapter = this.activeAdapter;
            this.activeAdapter = null;
            this.activeTableWidget = null;

            // Delay: Obsidian may destroy/recreate the cell editor on
            // cell-to-cell transitions; avoid flicker if focus returns.
            setTimeout(() => {
                if (this.activeAdapter) return;
                if (adapter) {
                    for (const cb of this.blurCallbacks) {
                        cb();
                    }
                }
            }, 50);
        };

        // Capture phase: see focus before table widget handles it
        activeDocument.addEventListener('focusin', this.focusHandler, true);
        activeDocument.addEventListener('focusout', this.blurHandler, true);
    }

    private setupEscapeAction(vim: VimApi): void {
        vim.defineAction('exitTableCell', (cm: CmAdapter) => {
            const widget = cm.cm6?.dom?.closest('.cm-table-widget');
            if (!widget) return;

            // Click the main editor below the table widget to exit.
            // setCursor + focus doesn't work — Obsidian's table widget
            // intercepts focus and pulls the cursor back into the table.
            const mainContent = widget
                .closest('.cm-editor')
                ?.parentElement?.querySelector(
                    '.cm-editor:not(.cm-table-widget .cm-editor) .cm-content',
                ) as HTMLElement | null;
            if (!mainContent) return;

            const widgetRect = widget.getBoundingClientRect();
            const mainRect = mainContent.getBoundingClientRect();
            const x = mainRect.left + 10;
            // Click just below the table widget
            const y = Math.min(widgetRect.bottom + 5, mainRect.bottom - 5);

            const opts: MouseEventInit = {
                bubbles: true,
                cancelable: true,
                clientX: x,
                clientY: y,
                button: 0,
            };
            mainContent.dispatchEvent(new MouseEvent('mousedown', opts));
            mainContent.dispatchEvent(new MouseEvent('mouseup', opts));
            mainContent.dispatchEvent(new MouseEvent('click', opts));
        });
        vim.mapCommand(
            '<Esc>',
            'action',
            'exitTableCell',
            {},
            { context: 'normal' },
        );
    }

    /**
     * Extract the CmAdapter from a table widget element.
     *
     * The cell's CM6 editor stores its EditorView on the `.cm-content`
     * element as `cmTile.view`, and the vim extension attaches the
     * CmAdapter as `view.cm`.
     */
    private extractAdapter(tableWidget: HTMLElement): CmAdapter | null {
        const cmContent = tableWidget.querySelector(
            '.cm-content',
        ) as CmContentElement | null;
        if (!cmContent?.cmTile?.view?.cm) return null;

        return cmContent.cmTile.view.cm as CmAdapter;
    }

    destroy(): void {
        if (this.focusHandler) {
            activeDocument.removeEventListener(
                'focusin',
                this.focusHandler,
                true,
            );
        }
        if (this.blurHandler) {
            activeDocument.removeEventListener(
                'focusout',
                this.blurHandler,
                true,
            );
        }
        this.activeAdapter = null;
        this.activeTableWidget = null;
        this.focusCallbacks = [];
        this.blurCallbacks = [];
    }
}
