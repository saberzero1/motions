import {
    ViewPlugin,
    EditorView,
    type ViewUpdate,
    type PluginValue,
} from '@codemirror/view';
import { type Extension } from '@codemirror/state';
import { type App, editorInfoField } from 'obsidian';
import {
    findTableRanges,
    cursorInRange,
    type TableRange,
    SEPARATOR_RE,
} from './table-utils';
import { setActiveEditTableRange } from './table-render-widget';
import { openCellEditor, closeCellEditor } from './table-cell-editor';
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

type NavState = 'inactive' | 'table-nav' | 'cell-edit';

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
        if (this.state !== 'inactive') return; // Don't interfere while navigating/editing
        if (!(update.selectionSet || update.docChanged)) return;
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

    private findWidgetEl(): HTMLElement | null {
        const widgets = this.view.dom.querySelectorAll('.vim-table-rendered');
        for (let i = 0; i < widgets.length; i++) {
            const el = widgets[i] as HTMLElement;
            if (el.closest('.cm-embed-block')) return el;
        }
        return (widgets[0] as HTMLElement) ?? null;
    }

    private enterTableNav(table: TableRange): void {
        this.activeTable = table;
        this.state = 'table-nav';

        this.widgetEl = this.findWidgetEl();
        if (!this.widgetEl) {
            this.state = 'inactive';
            return;
        }

        // Set D12 guard
        setActiveEditTableRange({ from: table.from, to: table.to });

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
            const pos =
                tableLine.number < doc.lines
                    ? doc.line(tableLine.number + 1).from
                    : doc.length;
            this.view.dispatch({ selection: { anchor: pos } });
        }
    }

    private exitTable(): void {
        if (this.state === 'cell-edit') {
            closeCellEditor(this.view);
        }
        this.removeHighlight();
        this.removeKeyHandler();
        setActiveEditTableRange(null);
        this.activeTable = null;
        this.widgetEl = null;
        this.state = 'inactive';
        this.view.dispatch({
            selection: { anchor: this.view.state.selection.main.head },
        });
        this.view.focus();
    }

    private enterCellEdit(): void {
        if (!this.widgetEl || !this.activeTable) return;

        const app = this.getApp();
        if (!app) return;

        const cell = this.getCellElement();
        if (!cell) return;

        const doc = this.view.state.doc;
        const tableFirstLine = doc.lineAt(this.activeTable.from).number;

        const handle = openCellEditor(
            cell,
            this.activeRow,
            this.activeCol,
            tableFirstLine,
            app,
            () => this.exitCellEdit(),
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
    }

    private exitCellEdit(): void {
        closeCellEditor(this.view);
        this.removeCellEditKeyHandler();
        this.state = 'table-nav';
        this.highlightCell();
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
        this.removeCellEditKeyHandler();
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
            }
            e.preventDefault();
            e.stopPropagation();
            return;
        }

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
            case 'a':
            case 'c':
            case 's':
            case 'Enter':
                this.enterCellEdit();
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
                break;
        }

        e.preventDefault();
        e.stopPropagation();
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
        window.setTimeout(() => this.doRefreshAfterOp(), 50);
    }

    private doRefreshAfterOp(): void {
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
        setActiveEditTableRange({ from: best.from, to: best.to });

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
        if (e.key === 'Tab') {
            e.preventDefault();
            e.stopPropagation();
            this.exitCellEdit();
            // Move to next cell
            const colCount = this.getColumnCount();
            const dataRows = this.getDataRowIndices();
            if (e.shiftKey) {
                if (this.activeCol > 0) {
                    this.activeCol--;
                } else {
                    const idx = dataRows.indexOf(this.activeRow);
                    if (idx > 0) {
                        this.activeRow = dataRows[idx - 1]!;
                        this.activeCol = colCount - 1;
                    }
                }
            } else {
                if (this.activeCol < colCount - 1) {
                    this.activeCol++;
                } else {
                    const idx = dataRows.indexOf(this.activeRow);
                    if (idx >= 0 && idx < dataRows.length - 1) {
                        this.activeRow = dataRows[idx + 1]!;
                        this.activeCol = 0;
                    }
                }
            }
            this.enterCellEdit();
        }
        // Escape in cell-edit is handled by the embeddable editor's onEscape
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
        return this.activeTable.lines[0].split('|').length - 2; // exclude leading/trailing empty
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
    }
}

export const tableNavControllerField: Extension =
    ViewPlugin.fromClass(TableNavController);
