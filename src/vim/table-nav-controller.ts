import {
    ViewPlugin,
    EditorView,
    type ViewUpdate,
    type PluginValue,
} from '@codemirror/view';
import { type Extension } from '@codemirror/state';
import { type App, Scope, editorInfoField } from 'obsidian';
import { pushKeymapScope, popKeymapScope } from '../util/keymap';
import {
    findTableRanges,
    cursorInRange,
    type TableRange,
    SEPARATOR_RE,
    splitCellsEscapeAware,
    getCellDocumentRange,
} from './table-utils';
import { setActiveEditTableRange } from './table-render-widget';
import { openCellEditor, closeCellEditor } from './table-cell-editor';
import { getCmAdapterFromEditorView, getVimApi } from './vim-api';
import { WhichKeyOverlay, type WhichKeyConfig } from '../ui/which-key';
import {
    setCursorSuppressedForView,
    clearCursorSuppressedForView,
} from '@replit/codemirror-vim';
import {
    pauseAnimatedCursorForView,
    resumeAnimatedCursorForView,
} from './animated-cursor/config';
import {
    tableAddRowAfter,
    tableAddRowBefore,
    tableDeleteRow,
    tableMoveRowDown,
    tableMoveRowUp,
    tableAddColAfter,
    tableAddColBefore,
    tableDeleteCol,
    tableMoveColRight,
    tableMoveColLeft,
    tableRealign,
} from './table-operations';
import { devAssert } from '../util/invariant';

let realignAfterCellEdit = false;
export function setRealignAfterCellEdit(value: boolean): void {
    realignAfterCellEdit = value;
}

type NavState = 'inactive' | 'table-nav' | 'cell-edit';

let navWhichKeyConfig: WhichKeyConfig | null = null;
export function setTableNavWhichKeyConfig(config: WhichKeyConfig | null): void {
    navWhichKeyConfig = config;
}

let controllerEnabled = false;
export function setTableNavControllerEnabled(value: boolean): void {
    controllerEnabled = value;
}

class TableNavController implements PluginValue {
    private state: NavState = 'inactive';
    private activeTable: TableRange | null = null;
    private activeRow = 0;
    private activeCol = 0;
    private widgetEl: HTMLElement | null = null;
    private readonly view: EditorView;
    private readonly isNested: boolean;
    private pendingTimer: number | null = null;
    private refreshTimer: number | null = null;
    private cursorInTable = false;
    private exitingTable = false;
    private clickOutsideHandler: ((e: MouseEvent) => void) | null = null;
    private navScope: Scope | null = null;
    private navWhichKey: WhichKeyOverlay | null = null;

    constructor(view: EditorView) {
        this.view = view;
        this.isNested = !!view.dom.closest(
            '.vim-table-embedded-editor, .vim-table-cell-editor',
        );
    }

    update(update: ViewUpdate): void {
        if (this.isNested) return;
        if (!controllerEnabled) {
            if (this.state !== 'inactive') this.exitTable();
            return;
        }
        if (this.state !== 'inactive') {
            if (update.docChanged) {
                const tables = findTableRanges(update.state);
                const stillInTable = tables.some((t) =>
                    cursorInRange(update.state, t.from, t.to),
                );
                if (!stillInTable) {
                    this.exitTable();
                }
            }
            return;
        }
        if (!(update.selectionSet || update.docChanged)) return;

        if (update.selectionSet && !this.exitingTable) {
            const tables = findTableRanges(update.state);
            const inTable = tables.some((t) =>
                cursorInRange(update.state, t.from, t.to),
            );
            if (inTable && !this.cursorInTable) {
                setCursorSuppressedForView(this.view, true);
                pauseAnimatedCursorForView(this.view);
            } else if (!inTable && this.cursorInTable) {
                clearCursorSuppressedForView(this.view);
                resumeAnimatedCursorForView(this.view);
            }
            this.cursorInTable = inTable;
        }

        this.scheduleCheck();
    }

    private scheduleCheck(): void {
        if (this.pendingTimer !== null) return;
        this.pendingTimer = window.setTimeout(() => {
            this.pendingTimer = null;
            this.checkEntry();
        }, 100);
    }

    private checkEntry(): void {
        if (!controllerEnabled || this.state !== 'inactive') return;
        const state = this.view.state;
        const tables = findTableRanges(state);
        for (const table of tables) {
            if (cursorInRange(state, table.from, table.to)) {
                this.enterTableNav(table);
                return;
            }
        }
    }

    private findWidgetEl(tableFrom?: number): HTMLElement | null {
        const targetFrom = tableFrom ?? this.activeTable?.from;
        const widgets = this.view.dom.querySelectorAll('.vim-table-rendered');
        if (widgets.length === 0) return null;
        if (widgets.length === 1) return widgets[0] as HTMLElement;

        // Multiple widgets: match by document position
        if (targetFrom !== undefined) {
            let bestEl: HTMLElement | null = null;
            let bestDist = Infinity;
            for (let i = 0; i < widgets.length; i++) {
                const el = widgets[i] as HTMLElement;
                try {
                    const pos = this.view.posAtDOM(el, 0);
                    const dist = Math.abs(pos - targetFrom);
                    if (dist < bestDist) {
                        bestDist = dist;
                        bestEl = el;
                    }
                } catch {
                    // Widget may be detached or offscreen — skip
                }
            }
            if (bestEl) return bestEl;
        }

        // Fallback: first widget (preserves single-table behavior)
        return (widgets[0] as HTMLElement) ?? null;
    }

    private enterTableNav(table: TableRange): void {
        this.activeTable = table;
        this.state = 'table-nav';

        this.widgetEl = this.findWidgetEl(table.from);
        if (!this.widgetEl) {
            this.state = 'inactive';
            return;
        }

        if (__DEV__) {
            try {
                const widgetPos = this.view.posAtDOM(this.widgetEl, 0);
                devAssert(
                    widgetPos === this.activeTable.from,
                    `findWidgetEl returned widget at pos ${widgetPos}, expected ${this.activeTable.from}`,
                );
            } catch {
                /* widget detached */
            }
        }

        setCursorSuppressedForView(this.view, true);
        pauseAnimatedCursorForView(this.view);

        setActiveEditTableRange({ from: table.from, to: table.to });
        this.view.dispatch();

        const cursorPos = this.view.state.selection.main.head;
        const enteredFromBottom = cursorPos > (table.from + table.to) / 2;
        if (enteredFromBottom) {
            const dataRows = this.getDataRowIndices();
            this.activeRow = dataRows[dataRows.length - 1] ?? 0;
        } else {
            this.activeRow = 0;
        }
        this.activeCol = 0;

        this.highlightCell();
        this.installKeyHandler();
        this.installNavScope();
        this.attachNavWhichKey();
    }

    private attachNavWhichKey(): void {
        this.detachNavWhichKey();
        if (!navWhichKeyConfig?.enabled) return;
        const adapter = getCmAdapterFromEditorView(this.view);
        if (!adapter) return;
        const viewContent: HTMLElement | null =
            this.widgetEl?.closest('.view-content') ?? null;
        if (!viewContent) return;
        const app = this.getApp();
        if (!app) return;
        this.navWhichKey = WhichKeyOverlay.forEmbeddedEditor(
            app,
            adapter,
            viewContent,
            navWhichKeyConfig.leaderKey,
            navWhichKeyConfig.leaderBindings,
            navWhichKeyConfig.generalMode,
            navWhichKeyConfig.groupLeaderBindings,
            navWhichKeyConfig.groupLabels,
            navWhichKeyConfig.commandLabels,
            navWhichKeyConfig.showIcons,
            navWhichKeyConfig.showDelay,
            navWhichKeyConfig.sortOrder,
        );
        this.navWhichKey.attach();
    }

    private detachNavWhichKey(): void {
        this.navWhichKey?.destroy();
        this.navWhichKey = null;
    }

    private installNavScope(): void {
        this.removeNavScope();
        const app = this.getApp();
        if (!app) return;
        this.navScope = new Scope();
        this.navScope.register([], 'Escape', () => {
            if (this.state === 'table-nav') {
                this.exitTable();
                return false;
            }
            return true;
        });
        pushKeymapScope(app, this.navScope);
    }

    private removeNavScope(): void {
        if (this.navScope) {
            const app = this.getApp();
            if (app) popKeymapScope(app, this.navScope);
            this.navScope = null;
        }
    }

    private exitTableAtBoundary(direction: 'before' | 'after'): void {
        const table = this.activeTable;
        this.exitTable();
        if (!table) return;
        const doc = this.view.state.doc;
        if (direction === 'before') {
            const tableLine = doc.lineAt(table.from);
            const pos =
                tableLine.number > 1 ? doc.line(tableLine.number - 1).from : 0;
            this.view.dispatch({ selection: { anchor: pos } });
        } else {
            const tableLine = doc.lineAt(table.to);
            if (tableLine.number < doc.lines) {
                const pos = doc.line(tableLine.number + 1).from;
                this.view.dispatch({ selection: { anchor: pos } });
            } else {
                this.view.dispatch({
                    changes: { from: doc.length, insert: '\n' },
                    selection: { anchor: doc.length + 1 },
                });
            }
        }
    }

    private exitTable(): void {
        if (this.refreshTimer !== null) {
            window.clearTimeout(this.refreshTimer);
            this.refreshTimer = null;
        }
        if (this.state === 'cell-edit') {
            closeCellEditor(this.view);
        }
        this.removeHighlight();
        this.removeKeyHandler();
        this.removeNavScope();
        this.detachNavWhichKey();
        setActiveEditTableRange(null);
        this.activeTable = null;
        this.widgetEl = null;
        this.state = 'inactive';
        this.cursorInTable = false;
        this.exitingTable = true;
        clearCursorSuppressedForView(this.view);
        resumeAnimatedCursorForView(this.view);
        this.view.dispatch({
            selection: { anchor: this.view.state.selection.main.head },
        });
        this.view.focus();
        this.exitingTable = false;
    }

    private enterCellEdit(
        entryMode:
            | 'insert'
            | 'insert-append'
            | 'change'
            | 'substitute' = 'insert',
    ): void {
        // Cancel any pending refresh that could destroy this editor
        if (this.refreshTimer !== null) {
            window.clearTimeout(this.refreshTimer);
            this.refreshTimer = null;
        }
        this.pendingD = false;
        if (!this.widgetEl || !this.activeTable) return;

        const app = this.getApp();
        if (!app) return;

        const cell = this.getCellElement();
        if (!cell) return;

        const doc = this.view.state.doc;
        const tableFirstLine = doc.lineAt(this.activeTable.from).number;

        const cellRange = getCellDocumentRange(
            doc,
            tableFirstLine,
            this.activeRow,
            this.activeCol,
        );

        const handle = openCellEditor(
            cell,
            this.activeRow,
            this.activeCol,
            tableFirstLine,
            app,
            () => {
                // Defer so the Scope handler returns `true` (consuming the
                // Escape) while the editor's scope is still on the stack.
                window.requestAnimationFrame(() => this.exitCellEdit());
            },
            cellRange?.text,
        );
        if (!handle) return;

        this.state = 'cell-edit';
        this.removeHighlight();
        if (this.navKeyHandler) {
            this.widgetEl?.removeEventListener(
                'keydown',
                this.navKeyHandler,
                true,
            );
            activeDocument.removeEventListener(
                'keydown',
                this.navKeyHandler,
                true,
            );
        }
        this.installCellEditKeyHandler();

        const cellView = handle.editor.getEditorView();
        if (cellView) {
            window.setTimeout(() => {
                const adapter = getCmAdapterFromEditorView(cellView);
                const vimApi = getVimApi();
                if (adapter && vimApi) {
                    switch (entryMode) {
                        case 'insert':
                            vimApi.handleKey(adapter, 'i');
                            break;
                        case 'insert-append':
                            vimApi.handleKey(adapter, 'A');
                            break;
                        case 'change':
                            vimApi.handleKey(adapter, 'c');
                            vimApi.handleKey(adapter, 'c');
                            break;
                        case 'substitute':
                            vimApi.handleKey(adapter, 'S');
                            break;
                    }
                }
            }, 0);
        }
    }

    private exitCellEdit(opts?: { skipRefresh?: boolean }): void {
        // Keep activeEditTableRange set throughout — clearing it would
        // cause buildDecorations to create a Decoration.replace for the
        // active table, displacing the cursor. doRefreshAfterOp manages
        // the activeEditTableRange lifecycle after the refresh delay.
        const { changed } = closeCellEditor(this.view);
        if (changed) realignAfterCellEdit = true;
        this.removeCellEditKeyHandler();
        this.state = 'table-nav';
        if (this.navKeyHandler) {
            this.widgetEl?.addEventListener(
                'keydown',
                this.navKeyHandler,
                true,
            );
            activeDocument.addEventListener(
                'keydown',
                this.navKeyHandler,
                true,
            );
        }
        if (!opts?.skipRefresh) {
            this.refreshAfterOp();
        }
    }

    private navKeyHandler: ((e: KeyboardEvent) => void) | null = null;
    private cellEditKeyHandler: ((e: KeyboardEvent) => void) | null = null;

    private installKeyHandler(): void {
        this.removeKeyHandler();
        this.navKeyHandler = (e: KeyboardEvent) => {
            if (this.state === 'table-nav') {
                this.handleTableNavKey(e);
            }
        };
        this.widgetEl?.addEventListener('keydown', this.navKeyHandler, true);
        activeDocument.addEventListener('keydown', this.navKeyHandler, true);
        this.installClickOutsideHandler();
    }

    private installCellEditKeyHandler(): void {
        this.removeCellEditKeyHandler();
        this.cellEditKeyHandler = (e: KeyboardEvent) => {
            if (this.state !== 'cell-edit') return;
            this.handleCellEditKey(e);
        };
        this.widgetEl?.addEventListener(
            'keydown',
            this.cellEditKeyHandler,
            true,
        );
    }

    private removeKeyHandler(): void {
        if (this.navKeyHandler) {
            this.widgetEl?.removeEventListener(
                'keydown',
                this.navKeyHandler,
                true,
            );
            activeDocument.removeEventListener(
                'keydown',
                this.navKeyHandler,
                true,
            );
            this.navKeyHandler = null;
        }
        this.removeClickOutsideHandler();
        this.removeCellEditKeyHandler();
    }

    private installClickOutsideHandler(): void {
        this.removeClickOutsideHandler();
        this.clickOutsideHandler = (e: MouseEvent) => {
            if (this.state === 'inactive') return;
            const target = e.target as Node | null;
            if (target && this.widgetEl?.contains(target)) return;
            this.exitTable();
        };
        activeDocument.addEventListener(
            'mousedown',
            this.clickOutsideHandler,
            true,
        );
    }

    private removeClickOutsideHandler(): void {
        if (this.clickOutsideHandler) {
            activeDocument.removeEventListener(
                'mousedown',
                this.clickOutsideHandler,
                true,
            );
            this.clickOutsideHandler = null;
        }
    }

    private removeCellEditKeyHandler(): void {
        if (this.cellEditKeyHandler) {
            this.widgetEl?.removeEventListener(
                'keydown',
                this.cellEditKeyHandler,
                true,
            );
            this.cellEditKeyHandler = null;
        }
    }

    private pendingD = false;

    private handleTableNavKey(e: KeyboardEvent): void {
        if (!this.activeTable) return;
        if (e.ctrlKey || e.altKey || e.metaKey) return;
        if (activeDocument.querySelector('.modal-container')) return;

        const dataRows = this.getDataRowIndices();
        const colCount = this.getColumnCount();

        if (this.pendingD) {
            this.pendingD = false;
            switch (e.key) {
                case 'd':
                    this.executeTableOp(tableDeleteRow, this.activeRow);
                    break;
                case 'c':
                    this.executeTableOp(tableDeleteCol, this.activeCol);
                    break;
                default:
                    return;
            }
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        let handled = true;

        switch (e.key) {
            case 'h':
            case 'ArrowLeft':
                if (this.activeCol > 0) this.activeCol--;
                this.highlightCell();
                break;
            case 'l':
            case 'ArrowRight':
                if (this.activeCol < colCount - 1) this.activeCol++;
                this.highlightCell();
                break;
            case 'j':
            case 'ArrowDown': {
                const currentIdx = dataRows.indexOf(this.activeRow);
                if (currentIdx >= 0 && currentIdx < dataRows.length - 1) {
                    this.activeRow = dataRows[currentIdx + 1]!;
                    this.highlightCell();
                } else {
                    this.exitTableAtBoundary('after');
                }
                break;
            }
            case 'k':
            case 'ArrowUp': {
                const currentIdx = dataRows.indexOf(this.activeRow);
                if (currentIdx > 0) {
                    this.activeRow = dataRows[currentIdx - 1]!;
                    this.highlightCell();
                } else {
                    this.exitTableAtBoundary('before');
                }
                break;
            }
            case 'i':
                this.enterCellEdit('insert');
                break;
            case 'a':
                this.enterCellEdit('insert-append');
                break;
            case 'c':
                this.enterCellEdit('change');
                break;
            case 's':
                this.enterCellEdit('substitute');
                break;
            case 'Enter':
                this.enterCellEdit('insert');
                break;
            case 'Escape':
                this.exitTable();
                break;
            case 'o':
                this.executeTableOp(tableAddRowAfter, this.activeRow);
                break;
            case 'O':
                this.executeTableOp(tableAddRowBefore, this.activeRow);
                break;
            case 'd':
                this.pendingD = true;
                break;
            case 'J':
                this.executeTableOp(tableMoveRowDown, this.activeRow);
                break;
            case 'K':
                this.executeTableOp(tableMoveRowUp, this.activeRow);
                break;
            case 'H':
                this.executeTableOp(tableMoveColLeft, this.activeCol);
                break;
            case 'L':
                this.executeTableOp(tableMoveColRight, this.activeCol);
                break;
            case 'I':
                this.executeTableOp(tableAddColBefore, this.activeCol);
                break;
            case 'A':
                this.executeTableOp(tableAddColAfter, this.activeCol);
                break;
            case '=':
                if (this.activeTable) {
                    setActiveEditTableRange(null);
                    tableRealign(this.view, this.activeTable);
                    this.refreshAfterOp();
                }
                break;
            default:
                handled = false;
                break;
        }

        if (handled) {
            e.preventDefault();
            e.stopPropagation();
        }
    }

    private executeTableOp(
        op: (view: EditorView, table: TableRange, idx: number) => void,
        idx: number,
    ): void {
        if (!this.activeTable) return;
        setActiveEditTableRange(null);
        op(this.view, this.activeTable, idx);
        this.refreshAfterOp();
    }

    private refreshAfterOp(): void {
        if (this.refreshTimer !== null) {
            window.clearTimeout(this.refreshTimer);
        }
        this.refreshTimer = window.setTimeout(() => {
            this.refreshTimer = null;
            this.doRefreshAfterOp();
        }, 50);
    }

    private doRefreshAfterOp(): void {
        if (this.state === 'cell-edit') return;
        if (!controllerEnabled || this.state === 'inactive') return;
        const state = this.view.state;
        const tables = findTableRanges(state);
        const prevFrom = this.activeTable?.from ?? 0;
        let best: TableRange | null = null;
        let bestDist = Infinity;
        for (const table of tables) {
            const dist = Math.abs(table.from - prevFrom);
            if (dist < bestDist) {
                bestDist = dist;
                best = table;
            }
        }
        if (!best) {
            this.exitTable();
            return;
        }
        this.activeTable = best;
        // Set activeEditTableRange before tableRealign so the StateField
        // fast-path (prev.map) fires during the realign dispatch instead
        // of buildDecorations — avoids cursor displacement.
        setActiveEditTableRange({ from: best.from, to: best.to });
        if (realignAfterCellEdit) {
            realignAfterCellEdit = false;
            tableRealign(this.view, best);
            const refreshedTables = findTableRanges(this.view.state);
            let refreshed: TableRange | null = null;
            let refreshedDist = Infinity;
            for (const t of refreshedTables) {
                const d = Math.abs(t.from - best.from);
                if (d < refreshedDist) {
                    refreshedDist = d;
                    refreshed = t;
                }
            }
            if (refreshed) {
                this.activeTable = refreshed;
                setActiveEditTableRange({
                    from: refreshed.from,
                    to: refreshed.to,
                });
            }
        }

        this.removeKeyHandler();
        this.widgetEl = this.findWidgetEl();
        if (!this.widgetEl) {
            this.exitTable();
            return;
        }
        this.installKeyHandler();

        const dataRows = this.getDataRowIndices();
        const colCount = this.getColumnCount();
        if (dataRows.indexOf(this.activeRow) < 0) {
            this.activeRow = dataRows[dataRows.length - 1] ?? 0;
        }
        if (this.activeCol >= colCount) {
            this.activeCol = Math.max(0, colCount - 1);
        }
        this.highlightCell();
    }

    private handleCellEditKey(e: KeyboardEvent): void {
        if (activeDocument.querySelector('.modal-container')) return;
        if (e.key === 'Tab') {
            e.preventDefault();
            e.stopPropagation();
            this.exitCellEdit({ skipRefresh: true });

            this.widgetEl = this.findWidgetEl();
            if (!this.widgetEl) {
                this.exitTable();
                return;
            }

            const colCount = this.getColumnCount();
            const dataRows = this.getDataRowIndices();
            let moved = false;

            if (e.shiftKey) {
                if (this.activeCol > 0) {
                    this.activeCol--;
                    moved = true;
                } else {
                    const idx = dataRows.indexOf(this.activeRow);
                    if (idx > 0) {
                        this.activeRow = dataRows[idx - 1]!;
                        this.activeCol = colCount - 1;
                        moved = true;
                    }
                }
            } else {
                if (this.activeCol < colCount - 1) {
                    this.activeCol++;
                    moved = true;
                } else {
                    const idx = dataRows.indexOf(this.activeRow);
                    if (idx >= 0 && idx < dataRows.length - 1) {
                        this.activeRow = dataRows[idx + 1]!;
                        this.activeCol = 0;
                        moved = true;
                    }
                }
            }

            if (moved) {
                this.enterCellEdit('insert');
            } else {
                this.highlightCell();
                this.refreshAfterOp();
            }
        }
    }

    private highlightCell(): void {
        this.removeHighlight();
        const cell = this.getCellElement();
        if (cell) cell.classList.add('vim-table-cell-active');
    }

    private removeHighlight(): void {
        this.widgetEl
            ?.querySelectorAll('.vim-table-cell-active')
            .forEach((el) => el.classList.remove('vim-table-cell-active'));
    }

    private getCellElement(): HTMLElement | null {
        if (!this.widgetEl) return null;
        return this.widgetEl.querySelector(
            `[data-row="${this.activeRow}"][data-col="${this.activeCol}"]`,
        );
    }

    private getDataRowIndices(): number[] {
        if (!this.activeTable) return [];
        const indices: number[] = [0]; // header row
        for (let i = 0; i < this.activeTable.lines.length; i++) {
            if (i === 0) continue; // header already added
            if (!SEPARATOR_RE.test(this.activeTable.lines[i] ?? '')) {
                indices.push(i);
            }
        }
        return indices;
    }

    private getColumnCount(): number {
        if (!this.activeTable || !this.activeTable.lines[0]) return 0;
        return splitCellsEscapeAware(this.activeTable.lines[0]).length;
    }

    private getApp(): App | null {
        try {
            const info = this.view.state.field(editorInfoField);
            return (info as { app: App }).app;
        } catch {
            return null;
        }
    }

    destroy(): void {
        if (this.state !== 'inactive') this.exitTable();
        if (this.pendingTimer !== null) {
            window.clearTimeout(this.pendingTimer);
            this.pendingTimer = null;
        }
        if (this.refreshTimer !== null) {
            window.clearTimeout(this.refreshTimer);
            this.refreshTimer = null;
        }
    }
}

export const tableNavControllerField: Extension =
    ViewPlugin.fromClass(TableNavController);
