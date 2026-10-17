import {
    EditorView,
    ViewPlugin,
    type PluginValue,
    type ViewUpdate,
} from '@codemirror/view';
import { type EditorState, type Extension } from '@codemirror/state';
import { type App, Scope, editorInfoField } from 'obsidian';
import {
    setCursorSuppressedForView,
    clearCursorSuppressedForView,
    setKeyInterceptActive,
} from '@replit/codemirror-vim';
import { pushKeymapScope, popKeymapScope } from '../util/keymap';
import { isBuiltinVimEnabled } from '../util/vault';
import { findTableRanges, cursorInRange, type TableRange } from './table-utils';
import {
    findTableWidgetElement,
    getEditModeForView,
    getTableEditorFromWidgetEl,
    type EditMode,
} from './native-table-adapter';
import type { TableEditor } from '@obsidian-typings/obsidian-public-latest';
import { tableRealign } from './table-operations';
import { getCmAdapterFromEditorView } from './vim-api';
import { isVimIdle } from '../editors/embeddable-editor';
import {
    enterTableNav,
    exitTableNav,
    isTableNavActive,
    tableNavStateField,
} from './table-nav-state';
import {
    pauseAnimatedCursorForView,
    resumeAnimatedCursorForView,
} from './animated-cursor/config';
import { isExternalBackendActive } from './external-mode';
import type { VimApi, CmAdapter } from '../types/vim-api';
import { getScrolloffMargin } from './scrolloff';
import {
    createTableNavKeyHandler,
    clearLastStructuralAction,
    type TableNavKeyHandler,
    type TableNavActions,
} from './table-nav-keymap';

/**
 * Like isVimIdle but treats null/undefined mode as idle.
 * Cell editors opened in normal mode may have mode=null before vim
 * finishes initialization — this is effectively idle.
 */
function isCellVimIdle(vim: Parameters<typeof isVimIdle>[0]): boolean {
    if (!vim) return true;
    const vs = vim as Record<string, unknown>;
    if (vs.insertMode) return false;
    if (vs.visualMode) return false;
    if (vim.mode === 'normal' || vim.mode == null) {
        if (vim.inputState?.operator) return false;
        if (vs['surroundState']) return false;
        if (vim.inputState?.keyBuffer && vim.inputState.keyBuffer.length > 0)
            return false;
        if (vim.expectLiteralNext) return false;
        return true;
    }
    return false;
}

const CELL_HIDDEN_CLASS = 'vim-motions-table-nav-cell-hidden';
const CURSOR_LAYER_HIDDEN_CLASS = 'vim-motions-cursor-layer-hidden';
const NAV_HIGHLIGHT_CLASS = 'vim-motions-table-nav-active';
const NAV_MODE_CLASS = 'vim-motions-table-nav-mode';
const ENTRY_DEBOUNCE_MS = 80;
const EXIT_COOLDOWN_MS = 500;
const STRUCTURAL_REFRESH_MS = 100;

export interface TableNavSettings {
    enableTableNav: boolean;
    tableWidgetMode: string;
}

/**
 * Why a deferred `abandonNav()` was scheduled.
 *
 * The two causes have disjoint validity conditions and must not share one, so
 * the reason has to survive to the frame that acts on it.
 */
type AbandonReason = 'caret-left' | 'widget-gone';

interface TableNavSession {
    state: 'inactive' | 'nav' | 'edit';
    activeRow: number;
    activeCol: number;
    tableFrom: number;
    widgetEl: HTMLElement | null;
    hiddenEl: HTMLElement | null;
    navScope: Scope | null;
    cellEditScope: Scope | null;
    cellEscapeCleanup: (() => void) | null;
    entryTimer: number | null;
    refreshTimer: number | null;
    exitTimestamp: number;
    dirty: boolean;
    pendingEntryMode: string | null;
    preEntryScrollTop: number;
}

const sessions = new WeakMap<EditorView, TableNavSession>();

function getSession(view: EditorView): TableNavSession {
    let s = sessions.get(view);
    if (!s) {
        s = {
            state: 'inactive',
            activeRow: 0,
            activeCol: 0,
            tableFrom: 0,
            widgetEl: null,
            hiddenEl: null,
            navScope: null,
            cellEditScope: null,
            cellEscapeCleanup: null,
            entryTimer: null,
            refreshTimer: null,
            exitTimestamp: 0,
            dirty: false,
            pendingEntryMode: null,
            preEntryScrollTop: 0,
        };
        sessions.set(view, s);
    }
    return s;
}

class TableNavController implements PluginValue {
    private readonly view: EditorView;
    private readonly app: App | null;
    private readonly settings: TableNavSettings;
    private readonly getVimApi: () => VimApi | null;
    private readonly isEmbedded: boolean;
    private readonly forkAvailable: boolean;
    private session: TableNavSession;
    private navKeyHandler: TableNavKeyHandler | null = null;

    constructor(
        view: EditorView,
        settings: TableNavSettings,
        getVimApi: () => VimApi | null,
    ) {
        this.view = view;
        this.settings = settings;
        this.getVimApi = getVimApi;
        this.session = getSession(view);

        let app: App | null = null;
        try {
            const info = view.state.field(editorInfoField);
            app = (info as { app?: App }).app ?? null;
        } catch {
            app = null;
        }
        this.app = app;

        this.isEmbedded =
            view.dom.closest(
                '.vim-table-embedded-editor, .vim-table-cell-editor, .vim-motions-textarea-overlay, .cm-table-widget',
            ) !== null;
        this.forkAvailable = app ? !isBuiltinVimEnabled(app) : false;

        if (__DEV__)
            console.debug(
                '[table-nav] constructor, session.state=',
                this.session.state,
                'isEmbedded=',
                this.isEmbedded,
            );

        if (this.session.state === 'nav') {
            this.resumeNav();
        }
    }

    update(update: ViewUpdate): void {
        if (this.isEmbedded) return;
        const s = this.session;

        if (!this.canActivate()) {
            if (s.state !== 'inactive') this.exitTable('before');
            return;
        }

        if (s.state === 'nav') {
            // Nav's own exits all run from its key handlers, so anything that
            // moves the caret without a keystroke — a picker jump, `:42`, a
            // mark, a harpoon slot — used to leave nav active with the caret
            // outside the table: keys still swallowed, and the vim cursor left
            // suppressed with an emptied layer, because
            // `table-cell-cursor-guard` early-returns while nav is active.
            // Measured, same document and same end offset: leaving with `k`
            // ended at `overrideCount: 0` with one visible cursor, while a
            // dispatched move ended at `1` with none, and a following `j` did
            // not move the head.
            //
            // Selection-only: an edit is never a "something moved the caret"
            // event, and `refreshAfterDocChange` below already owns that case.
            // Entry requires a rendered widget (`findTableWidgetElement`
            // below); nothing required one to *stay*. `cursorInAnyTable` is
            // keyed on the table's document range, and in Source mode that
            // range is still a table, so a Live Preview → Source switch left
            // this session in `nav` holding both the global key intercept and
            // the parent's cursor suppression: keys swallowed, no cursor
            // drawn, editor dead until the view was recreated. The widget is
            // what nav actually drives, so losing it is the signal.
            if (!s.widgetEl?.isConnected) {
                this.scheduleAbandon('widget-gone');
                return;
            }
            if (
                update.selectionSet &&
                !update.docChanged &&
                !this.cursorInAnyTable(update.state)
            ) {
                this.scheduleAbandon('caret-left');
                return;
            }
            if (update.docChanged) this.refreshAfterDocChange();
            else this.ensureHighlight();
            this.suppressWidgetCursorLayers();
            this.clearVimCursorLayer();
            return;
        }

        if (s.state !== 'inactive') return;
        if (!(update.selectionSet || update.focusChanged)) return;

        const tables = findTableRanges(update.state);
        const active = tables.find((t) =>
            cursorInRange(update.state, t.from, t.to),
        );
        if (!active) {
            this.cancelEntry();
            return;
        }
        if (!this.hasDataRows(active)) return;
        if (!findTableWidgetElement(this.view, active.from)) return;

        this.scheduleEntry();
    }

    private cursorInAnyTable(state: EditorState): boolean {
        return findTableRanges(state).some((t) =>
            cursorInRange(state, t.from, t.to),
        );
    }

    /**
     * Whether vim demonstrably has nothing in flight.
     *
     * Fail-closed: an unresolvable adapter or vim state answers **false**.
     * `isCellVimIdle` is the wrong predicate here precisely because it treats
     * a null state as idle, which is right for a cell editor still
     * initialising and wrong for a safety decision that dispatches and tears
     * down a cell editor.
     */
    private vimQuiescent(): boolean {
        const adapter = getCmAdapterFromEditorView(this.view);
        const vim = adapter?.state?.vim;
        if (!adapter || !vim) return false;
        const vs = vim as unknown as Record<string, unknown>;
        if (vs['insertMode'] || vs['visualMode']) return false;
        if (vim.inputState?.operator) return false;
        const buffered = vim.inputState?.keyBuffer;
        if (buffered && buffered.length > 0) return false;
        if (vs['surroundState']) return false;
        if (vim.expectLiteralNext) return false;
        // A vim operation still being applied. `ca|` is inside one for the
        // whole of its change, which is the window the stale-position crash
        // lived in.
        if ((adapter as unknown as Record<string, unknown>)['curOp']) {
            return false;
        }
        return true;
    }

    /**
     * Leave nav mode on a later frame, for a caret the controller did not move.
     *
     * Deferred because the teardown dispatches, and CodeMirror rejects a
     * reentrant dispatch from inside a ViewPlugin `update()` — called directly
     * it aborts partway, leaving the session in `nav` still holding the
     * suppression it was trying to release.
     *
     * Everything is re-validated in the frame rather than captured, because
     * that window is exactly where an operator can start. The document is
     * compared by identity: CodeMirror's `Text` is immutable, so a different
     * object means the document moved under the pending exit.
     */
    private scheduleAbandon(reason: AbandonReason): void {
        if (this.abandonFrame !== null) return;
        const doc = this.view.state.doc;
        this.abandonFrame = window.requestAnimationFrame(() => {
            this.abandonFrame = null;
            if (this.session.state !== 'nav') return;
            if (this.view.state.doc !== doc) return;
            // Re-validate only the reason that scheduled this. Checking both
            // is what made the leak unreachable: a `widget-gone` exit was
            // blocked by the caret still being inside the table's document
            // range, which it always is in Source mode.
            if (reason === 'caret-left') {
                if (this.cursorInAnyTable(this.view.state)) return;
                if (!this.vimQuiescent()) return;
            } else {
                if (this.session.widgetEl?.isConnected) return;
                // No quiescence gate on this path, deliberately. That gate
                // protects `destroyTableCell()` from running inside a vim
                // change, but a disconnected widget means there is no cell
                // editor left to protect — and declining to release here
                // would hold global key interception for a surface that no
                // longer exists, which is strictly worse than the teardown it
                // guards against. `abandonNav` null-checks every DOM handle.
            }
            this.abandonNav();
        });
    }

    /**
     * Tear nav mode down without moving the caret or taking focus.
     *
     * Deliberately not a placement variant of `exitTable`: the order differs
     * where it matters. `exitTableNav` is dispatched **before**
     * `destroyTableCell()`, because destroying Obsidian's cell editor can
     * flush a document transaction, and a stale range still held in
     * `tableNavStateField` would be mapped against it.
     *
     * No `placeCursorAround` and no `view.focus()`: the caret is already where
     * whatever moved it wanted it, and focus may legitimately have gone with
     * it.
     */
    private abandonNav(): void {
        const s = this.session;
        if (s.state !== 'nav') return;

        s.state = 'inactive';
        s.exitTimestamp = Date.now();
        this.cancelEntry();
        this.clearRefreshTimer();
        this.removeHighlight();
        this.removeNavScope();
        s.widgetEl?.classList.remove(NAV_MODE_CLASS);
        setKeyInterceptActive(false);

        this.view.dispatch({ effects: exitTableNav.of(null) });

        const editMode = getEditModeForView(this.view);
        if (editMode?.tableCell) editMode.destroyTableCell();
        if (s.hiddenEl) {
            s.hiddenEl.classList.remove(CELL_HIDDEN_CLASS);
            s.hiddenEl = null;
        }

        const wasDirty = s.dirty;
        s.widgetEl = null;
        s.dirty = false;
        this.navKeyHandler?.resetPending();

        if (wasDirty) {
            const range = this.resolveTableRange();
            if (range && range.to <= this.view.state.doc.length) {
                tableRealign(this.view, range);
            }
        }

        clearCursorSuppressedForView(this.view);
        resumeAnimatedCursorForView(this.view);
        // No explicit cursor redraw here. One was added, on the measured
        // grounds that clearing the suppression is only a map write and
        // `restoreCursorLayers` restores `display` without repopulating the
        // layer — both true. It is not needed in *this* ordering, though: the
        // `exitTableNav` dispatch above, and the cell-editor teardown after
        // it, produce the update the fork redraws on. Removing it kept both
        // suites green, so it is gone rather than kept on faith. If this
        // teardown is ever reordered so no transaction follows the release,
        // `refreshVimCursors()` is the fix.
        this.restoreCursorLayers();

        // Reclaim focus only when it is *orphaned*. The docstring above is
        // right that focus may legitimately have followed whatever moved the
        // caret — a picker, a modal, another pane — and `activeElement` names
        // it in every such case. `<body>` is the one value that means nothing
        // holds focus at all, and that is what a Live Preview → Source switch
        // produces: Obsidian destroys its own cell editor and hands focus
        // back to no one, leaving the editor accepting no keys.
        const doc = this.view.dom.ownerDocument;
        if (doc.activeElement === null || doc.activeElement === doc.body) {
            this.view.contentDOM.focus();
        }
    }

    private canActivate(): boolean {
        return (
            this.settings.enableTableNav &&
            this.settings.tableWidgetMode === 'native' &&
            this.forkAvailable
        );
    }

    private scrollLockCleanup: (() => void) | null = null;

    /** Pending deferred `abandonNav()`, so it can be cancelled. */
    private abandonFrame: number | null = null;

    private scheduleEntry(): void {
        const s = this.session;
        if (s.entryTimer !== null) return;
        s.preEntryScrollTop = this.view.scrollDOM.scrollTop;
        const scroller = this.view.scrollDOM;
        const locked = s.preEntryScrollTop;
        const scrollLock = () => {
            scroller.scrollTop = locked;
        };
        scroller.addEventListener('scroll', scrollLock);
        this.scrollLockCleanup = () => {
            scroller.removeEventListener('scroll', scrollLock);
        };
        s.entryTimer = window.setTimeout(() => {
            this.releaseScrollLock();
            s.entryTimer = null;
            this.tryEnter();
        }, ENTRY_DEBOUNCE_MS);
    }

    private releaseScrollLock(): void {
        if (this.scrollLockCleanup) {
            this.scrollLockCleanup();
            this.scrollLockCleanup = null;
        }
    }

    private cancelEntry(): void {
        const s = this.session;
        this.releaseScrollLock();
        if (s.entryTimer !== null) {
            window.clearTimeout(s.entryTimer);
            s.entryTimer = null;
        }
    }

    /**
     * Enter nav mode, resolving the table from the **current** state.
     *
     * The range is deliberately not carried from `scheduleEntry`. That runs
     * `ENTRY_DEBOUNCE_MS` earlier and its `entryTimer !== null` guard stops a
     * later update replacing the pending candidate, so an edit inside the
     * window leaves the captured `to` past the end of the document. Nothing
     * caught it: the only check here was `cursorInRange(from, to)`, which
     * still passes because the cursor is numerically inside the stale span.
     * The stale `tableTo` then reached `tableNavStateField`, where the next
     * document-changing transaction maps it and throws
     * `Position 41 is out of range for changeset of length 37` from inside a
     * StateField update — which takes the field, and the editor, down.
     *
     * Reproduced by `ca|` on a 41-character table: the change leaves 37
     * characters while an entry scheduled before it is still pending.
     */
    private tryEnter(): void {
        if (__DEV__) console.debug('[table-nav] tryEnter');
        const s = this.session;
        if (s.state !== 'inactive') return;
        if (!this.canActivate()) return;
        if (Date.now() - s.exitTimestamp < EXIT_COOLDOWN_MS) return;

        const editMode = getEditModeForView(this.view);
        if (!editMode?.tableCell) return;

        const table = findTableRanges(this.view.state).find((t) =>
            cursorInRange(this.view.state, t.from, t.to),
        );
        if (!table) return;
        if (table.to > this.view.state.doc.length) return;
        if (!this.hasDataRows(table)) return;

        const widgetEl = findTableWidgetElement(this.view, table.from);
        if (!widgetEl) return;

        const row = editMode.tableCell.cell.row;
        const col = editMode.tableCell.cell.col;

        this.hideCellEditor(editMode);

        s.tableFrom = table.from;
        s.widgetEl = widgetEl;
        s.activeRow = row;
        s.activeCol = col;
        s.state = 'nav';
        s.dirty = false;

        setKeyInterceptActive(true);
        setCursorSuppressedForView(this.view, true);
        pauseAnimatedCursorForView(this.view);

        this.view.dispatch({
            effects: enterTableNav.of({
                row,
                col,
                tableFrom: table.from,
                tableTo: table.to,
            }),
        });

        this.clearVimCursorLayer();

        this.installNavScope();
        widgetEl.classList.add(NAV_MODE_CLASS);
        this.highlightCell();
        this.focusWithoutScroll();
        this.view.scrollDOM.scrollTop = s.preEntryScrollTop;
        this.suppressWidgetCursorLayers();
        const session = this.session;
        const scroller = this.view.scrollDOM;
        const savedScroll = s.preEntryScrollTop;
        window.requestAnimationFrame(() => {
            if (session.state === 'nav') {
                this.suppressWidgetCursorLayers();
                scroller.scrollTop = savedScroll;
            }
        });
    }

    private focusWithoutScroll(): void {
        const scrollTop = this.view.scrollDOM.scrollTop;
        this.view.contentDOM.focus({ preventScroll: true });
        this.view.scrollDOM.scrollTop = scrollTop;
    }

    private clearVimCursorLayer(): void {
        const vimLayer =
            this.view.scrollDOM.querySelector('.cm-vimCursorLayer');
        if (vimLayer) {
            vimLayer.textContent = '';
            vimLayer.classList.add(CURSOR_LAYER_HIDDEN_CLASS);
        }
    }

    private restoreCursorLayers(): void {
        this.view.scrollDOM
            .querySelectorAll('.' + CURSOR_LAYER_HIDDEN_CLASS)
            .forEach((el) => el.classList.remove(CURSOR_LAYER_HIDDEN_CLASS));
        this.session.widgetEl
            ?.querySelectorAll('.' + CURSOR_LAYER_HIDDEN_CLASS)
            .forEach((el) => el.classList.remove(CURSOR_LAYER_HIDDEN_CLASS));
    }

    private suppressWidgetCursorLayers(): void {
        const el = this.session.widgetEl;
        if (!el) return;
        const layers = el.querySelectorAll<HTMLElement>('.cm-vimCursorLayer');
        for (let i = 0; i < layers.length; i++) {
            const layer = layers.item(i);
            if (!layer) continue;
            if (
                !layer.classList.contains(CURSOR_LAYER_HIDDEN_CLASS) ||
                layer.children.length > 0
            ) {
                layer.textContent = '';
                layer.classList.add(CURSOR_LAYER_HIDDEN_CLASS);
            }
        }
    }

    private resumeNav(): void {
        const s = this.session;
        if (s.state !== 'nav') return;

        setKeyInterceptActive(true);
        setCursorSuppressedForView(this.view, true);
        pauseAnimatedCursorForView(this.view);
        this.clearVimCursorLayer();

        const widgetEl = findTableWidgetElement(this.view, s.tableFrom);
        if (widgetEl) {
            s.widgetEl = widgetEl;
            widgetEl.classList.add(NAV_MODE_CLASS);
        }

        this.installNavScope();
        this.highlightCell();
        this.focusWithoutScroll();
    }

    private getFreshTable(): TableEditor | null {
        const widgetEl = this.session.widgetEl?.isConnected
            ? this.session.widgetEl
            : findTableWidgetElement(this.view, this.session.tableFrom);
        if (!widgetEl) return null;
        if (widgetEl !== this.session.widgetEl)
            this.session.widgetEl = widgetEl;
        return getTableEditorFromWidgetEl(widgetEl);
    }

    navigate(direction: 'h' | 'j' | 'k' | 'l', count = 1, wrap = false): void {
        const s = this.session;
        if (s.state !== 'nav') return;

        const table = this.getFreshTable();
        if (!table) return;

        const rowCount = table.rows?.length ?? 0;
        const colCount = table.rows?.[0]?.length ?? 0;

        for (let i = 0; i < count; i++) {
            if (direction === 'h') {
                if (s.activeCol <= 0) {
                    if (wrap && s.activeRow > 0) {
                        s.activeRow--;
                        s.activeCol = colCount - 1;
                    } else {
                        break;
                    }
                } else {
                    s.activeCol--;
                }
            } else if (direction === 'l') {
                if (s.activeCol >= colCount - 1) {
                    if (wrap && s.activeRow < rowCount - 1) {
                        s.activeRow++;
                        s.activeCol = 0;
                    } else {
                        break;
                    }
                } else {
                    s.activeCol++;
                }
            } else if (direction === 'j') {
                if (s.activeRow >= rowCount - 1) {
                    this.exitTable('after');
                    return;
                }
                s.activeRow++;
            } else if (direction === 'k') {
                if (s.activeRow <= 0) {
                    this.exitTable('before');
                    return;
                }
                s.activeRow--;
            }
        }

        this.highlightCell();
        this.scrollHighlightedCellIntoView();
        this.clearVimCursorLayer();
    }

    enterCellEdit(
        mode: 'insert' | 'insert-append' | 'change' | 'substitute' | 'normal',
    ): void {
        if (__DEV__) console.debug('[table-nav] enterCellEdit, mode=', mode);
        const s = this.session;
        if (s.state !== 'nav') return;

        const editMode = getEditModeForView(this.view);
        if (!editMode) {
            this.exitTable('before');
            return;
        }

        this.removeHighlight();
        s.widgetEl?.classList.remove(NAV_MODE_CLASS);
        this.removeNavScope();

        setKeyInterceptActive(false);
        this.restoreCursorLayers();

        const currentCell = editMode.tableCell?.cell;
        const needsCellSwitch =
            !currentCell ||
            currentCell.row !== s.activeRow ||
            currentCell.col !== s.activeCol;

        this.showCellEditor(editMode);

        if (needsCellSwitch) {
            const table = this.getFreshTable();
            if (table) {
                table.receiveCellFocus(s.activeRow, s.activeCol);
            }
        }

        s.state = 'edit';
        s.pendingEntryMode = mode;

        window.setTimeout(() => {
            this.finishCellEditEntry();
        }, 150);
    }

    private finishCellEditEntry(): void {
        const s = this.session;
        if (s.state !== 'edit') return;

        const editMode = getEditModeForView(this.view);
        if (!editMode?.tableCell) {
            s.state = 'inactive';
            s.pendingEntryMode = null;
            return;
        }

        const cellView = editMode.tableCell.cm as EditorView | null | undefined;
        if (cellView) {
            cellView.focus();
            cellView.contentDOM?.click();
        }

        this.installCellEditScope();
        this.installCellEscapeCapture();

        const mode = s.pendingEntryMode;
        s.pendingEntryMode = null;

        const entryKeyMap: Record<string, string> = {
            insert: 'i',
            'insert-append': 'A',
            change: 'cc',
            substitute: 'S',
            normal: '',
        };
        const keys = entryKeyMap[mode ?? ''] ?? '';
        if (keys && cellView) {
            const adapter = getCmAdapterFromEditorView(cellView);
            const vim = this.getVimApi();
            if (adapter && vim) {
                for (const k of keys) {
                    vim.handleKey(adapter, k);
                }
            }
        }
    }

    private exitCellEditToNav(): void {
        if (__DEV__) console.debug('[table-nav] exitCellEditToNav');
        const s = this.session;
        if (s.state !== 'edit') return;

        const editMode = getEditModeForView(this.view);
        const cell = editMode?.tableCell?.cell;
        if (cell) {
            s.activeRow = cell.row;
            s.activeCol = cell.col;
        }

        this.removeCellEscapeCapture();
        this.removeCellEditScope();
        this.hideCellEditor(editMode);

        setKeyInterceptActive(true);
        setCursorSuppressedForView(this.view, true);
        pauseAnimatedCursorForView(this.view);
        this.clearVimCursorLayer();

        s.state = 'nav';
        this.installNavScope();

        const widgetEl = findTableWidgetElement(this.view, s.tableFrom);
        if (widgetEl) {
            s.widgetEl = widgetEl;
            widgetEl.classList.add(NAV_MODE_CLASS);
        }

        this.highlightCell();
        this.view.focus();
    }

    exitTable(placement: 'before' | 'after'): void {
        if (__DEV__)
            console.debug(
                '[table-nav] exitTable, placement=',
                placement,
                'state=',
                this.session.state,
            );
        const s = this.session;
        if (s.state === 'inactive') return;

        const wasEdit = s.state === 'edit';
        s.state = 'inactive';
        s.exitTimestamp = Date.now();

        this.cancelEntry();
        this.clearRefreshTimer();
        this.removeHighlight();
        this.removeNavScope();
        if (wasEdit) {
            this.removeCellEscapeCapture();
            this.removeCellEditScope();
        }

        s.widgetEl?.classList.remove(NAV_MODE_CLASS);

        setKeyInterceptActive(false);

        // Destroy cell editor BEFORE cursor placement so Obsidian's
        // internal blur/focus/selection side-effects resolve first.
        const editMode = getEditModeForView(this.view);
        if (editMode?.tableCell) {
            editMode.destroyTableCell();
        }
        // Clear the hidden-cell CSS class after destruction.
        if (s.hiddenEl) {
            s.hiddenEl.classList.remove(CELL_HIDDEN_CLASS);
            s.hiddenEl = null;
        }

        if (s.dirty) {
            const tableRange = this.resolveTableRange();
            if (tableRange) tableRealign(this.view, tableRange);
        }

        s.widgetEl = null;
        s.dirty = false;
        this.navKeyHandler?.resetPending();

        this.view.dispatch({ effects: exitTableNav.of(null) });

        // Defer cursor placement to the next frame so Obsidian's
        // cell-editor teardown handlers finish before we set the
        // final authoritative cursor position.
        const table = this.getFreshTable();
        const view = this.view;
        window.requestAnimationFrame(() => {
            table?.placeCursorAround(placement);
            clearCursorSuppressedForView(view);
            resumeAnimatedCursorForView(view);
            this.restoreCursorLayers();
            view.focus();
        });
    }

    addRowAfter(): void {
        const s = this.session;
        const table = this.getFreshTable();
        if (!table || s.activeRow < 0) return;
        table.insertRow(s.activeRow + 1, s.activeCol);
        s.activeRow++;
        this.markDirtyAndRefresh();
    }

    addRowBefore(): void {
        const s = this.session;
        const table = this.getFreshTable();
        if (!table || s.activeRow <= 0) return;
        table.insertRow(s.activeRow, s.activeCol);
        this.markDirtyAndRefresh();
    }

    deleteRow(): void {
        const s = this.session;
        const table = this.getFreshTable();
        if (!table || s.activeRow <= 0) return;
        const rowCount = table.rows?.length ?? 0;
        if (rowCount <= 2) return;
        table.removeRow(s.activeRow, s.activeCol);
        this.markDirtyAndRefresh();
    }

    deleteCol(): void {
        const s = this.session;
        const table = this.getFreshTable();
        if (!table) return;
        const colCount = table.rows?.[0]?.length ?? 0;
        if (colCount <= 1) return;
        table.removeColumn(s.activeRow, s.activeCol);
        this.markDirtyAndRefresh();
    }

    moveRowDown(): void {
        const s = this.session;
        const table = this.getFreshTable();
        if (!table) return;
        const rowCount = table.rows?.length ?? 0;
        if (s.activeRow <= 0 || s.activeRow >= rowCount - 1) return;
        table.moveRow(s.activeRow, s.activeRow + 1, s.activeCol);
        s.activeRow++;
        this.markDirtyAndRefresh();
    }

    moveRowUp(): void {
        const s = this.session;
        const table = this.getFreshTable();
        if (!table) return;
        if (s.activeRow <= 1) return;
        table.moveRow(s.activeRow, s.activeRow - 1, s.activeCol);
        s.activeRow--;
        this.markDirtyAndRefresh();
    }

    moveColLeft(): void {
        const s = this.session;
        const table = this.getFreshTable();
        if (!table || s.activeCol <= 0) return;
        table.moveColumn(s.activeCol, s.activeCol - 1, s.activeRow);
        s.activeCol--;
        this.markDirtyAndRefresh();
    }

    moveColRight(): void {
        const s = this.session;
        const table = this.getFreshTable();
        if (!table) return;
        const colCount = table.rows?.[0]?.length ?? 0;
        if (s.activeCol >= colCount - 1) return;
        table.moveColumn(s.activeCol, s.activeCol + 1, s.activeRow);
        s.activeCol++;
        this.markDirtyAndRefresh();
    }

    addColBefore(): void {
        const table = this.getFreshTable();
        if (!table) return;
        table.insertColumn(
            this.session.activeRow,
            this.session.activeCol,
            null,
        );
        this.markDirtyAndRefresh();
    }

    addColAfter(): void {
        const s = this.session;
        const table = this.getFreshTable();
        if (!table) return;
        table.insertColumn(s.activeRow, s.activeCol + 1, null);
        s.activeCol++;
        this.markDirtyAndRefresh();
    }

    realign(): void {
        const tableRange = this.resolveTableRange();
        if (!tableRange) return;
        tableRealign(this.view, tableRange);
        this.markDirtyAndRefresh();
    }

    private markDirtyAndRefresh(): void {
        this.session.dirty = true;
        this.scheduleRefresh();
    }

    private scheduleRefresh(): void {
        const s = this.session;
        if (s.refreshTimer !== null) window.clearTimeout(s.refreshTimer);
        s.refreshTimer = window.setTimeout(() => {
            s.refreshTimer = null;
            this.refreshAfterDocChange();
        }, STRUCTURAL_REFRESH_MS);
    }

    private clearRefreshTimer(): void {
        const s = this.session;
        if (s.refreshTimer !== null) {
            window.clearTimeout(s.refreshTimer);
            s.refreshTimer = null;
        }
    }

    private refreshAfterDocChange(): void {
        const s = this.session;
        if (s.state !== 'nav') return;

        const widgetEl = findTableWidgetElement(this.view, s.tableFrom);
        if (!widgetEl) {
            this.exitTable('before');
            return;
        }
        s.widgetEl = widgetEl;
        widgetEl.classList.add(NAV_MODE_CLASS);

        const table = getTableEditorFromWidgetEl(widgetEl);
        if (!table) {
            this.exitTable('before');
            return;
        }

        const rowCount = table.rows?.length ?? 0;
        const colCount = table.rows?.[0]?.length ?? 0;
        if (s.activeRow >= rowCount) s.activeRow = Math.max(0, rowCount - 1);
        if (s.activeCol >= colCount) s.activeCol = Math.max(0, colCount - 1);

        this.highlightCell();
        this.scrollHighlightedCellIntoView();
    }

    private scrollHighlightedCellIntoView(): void {
        const s = this.session;
        if (s.state !== 'nav') return;
        const table = this.getFreshTable();
        if (!table) return;
        const cell = table.getCellAt(s.activeRow, s.activeCol);
        if (!cell?.el) return;
        const scroller = this.view.scrollDOM;
        const cellRect = cell.el.getBoundingClientRect();
        const scrollerRect = scroller.getBoundingClientRect();
        const margin = getScrolloffMargin(this.view);
        const effectiveMargin = margin > 0 ? margin : 5;
        let dy = 0;
        if (cellRect.top < scrollerRect.top + effectiveMargin) {
            dy = cellRect.top - (scrollerRect.top + effectiveMargin);
        } else if (cellRect.bottom > scrollerRect.bottom - effectiveMargin) {
            dy = cellRect.bottom - (scrollerRect.bottom - effectiveMargin);
        }
        if (dy) scroller.scrollTop += dy;

        const widgetEl = s.widgetEl;
        if (widgetEl && widgetEl.scrollWidth > widgetEl.clientWidth) {
            const widgetRect = widgetEl.getBoundingClientRect();
            const hMargin = 5;
            let dx = 0;
            if (cellRect.left < widgetRect.left + hMargin) {
                dx = cellRect.left - (widgetRect.left + hMargin);
            } else if (cellRect.right > widgetRect.right - hMargin) {
                dx = cellRect.right - (widgetRect.right - hMargin);
            }
            if (dx) widgetEl.scrollLeft += dx;
        }
    }

    private ensureHighlight(): void {
        const s = this.session;
        if (s.state !== 'nav') return;
        if (!s.widgetEl?.isConnected) {
            const widgetEl = findTableWidgetElement(this.view, s.tableFrom);
            if (!widgetEl) return;
            s.widgetEl = widgetEl;
            widgetEl.classList.add(NAV_MODE_CLASS);
        }
        if (!s.widgetEl.querySelector('.' + NAV_HIGHLIGHT_CLASS)) {
            this.highlightCell();
        }
    }

    private highlightCell(): void {
        this.removeHighlight();
        const table = this.getFreshTable();
        if (!table) return;
        const cell = table.getCellAt(
            this.session.activeRow,
            this.session.activeCol,
        );
        cell?.el?.classList.add(NAV_HIGHLIGHT_CLASS);
    }

    private removeHighlight(): void {
        const s = this.session;
        const roots: HTMLElement[] = [];
        if (s.widgetEl?.isConnected) roots.push(s.widgetEl);
        for (const root of roots) {
            root.querySelectorAll('.' + NAV_HIGHLIGHT_CLASS).forEach((el) =>
                el.classList.remove(NAV_HIGHLIGHT_CLASS),
            );
        }
    }

    private hideCellEditor(editMode?: EditMode | null): void {
        const s = this.session;
        const em = editMode ?? getEditModeForView(this.view);
        const cellView = em?.tableCell?.cm as EditorView | null | undefined;
        const target = cellView?.dom ?? em?.tableCell?.cell?.el ?? null;
        if (target) {
            target.classList.add(CELL_HIDDEN_CLASS);
            s.hiddenEl = target;
        }
    }

    private showCellEditor(editMode?: EditMode | null): void {
        const s = this.session;
        if (s.hiddenEl) {
            s.hiddenEl.classList.remove(CELL_HIDDEN_CLASS);
            s.hiddenEl = null;
        }
        const em = editMode ?? getEditModeForView(this.view);
        const cellView = em?.tableCell?.cm as EditorView | null | undefined;
        const target = cellView?.dom ?? em?.tableCell?.cell?.el ?? null;
        if (target) target.classList.remove(CELL_HIDDEN_CLASS);
    }

    private installNavScope(): void {
        const s = this.session;
        if (s.navScope || !this.app) return;

        const actions: TableNavActions = {
            navigate: (d, c, w) => this.navigate(d, c, w),
            enterCellEdit: (m) => {
                this.navKeyHandler?.resetPending();
                clearLastStructuralAction();
                this.enterCellEdit(m);
            },
            exitTableNav: (p) => {
                this.navKeyHandler?.resetPending();
                this.exitTable(p);
            },
            addRowAfter: () => this.addRowAfter(),
            addRowBefore: () => this.addRowBefore(),
            deleteRow: () => this.deleteRow(),
            deleteCol: () => this.deleteCol(),
            moveRowDown: () => this.moveRowDown(),
            moveRowUp: () => this.moveRowUp(),
            moveColLeft: () => this.moveColLeft(),
            moveColRight: () => this.moveColRight(),
            addColBefore: () => this.addColBefore(),
            addColAfter: () => this.addColAfter(),
            realign: () => this.realign(),
        };
        const handler = createTableNavKeyHandler(actions);
        this.navKeyHandler = handler;

        const scope = new Scope(this.app.scope);
        scope.register(null, null, (evt: KeyboardEvent) => {
            if (s.state !== 'nav') return undefined;
            const handled = handler(evt);
            if (handled) {
                evt.preventDefault();
            }
            return handled ? false : undefined;
        });

        s.navScope = scope;
        pushKeymapScope(this.app, scope);
    }

    private removeNavScope(): void {
        const s = this.session;
        if (!s.navScope || !this.app) return;
        popKeymapScope(this.app, s.navScope);
        s.navScope = null;
    }

    private installCellEditScope(): void {
        const s = this.session;
        if (s.cellEditScope || !this.app) return;

        const scope = new Scope(this.app.scope);
        scope.register(null, 'Escape', () => {
            if (s.state !== 'edit') return undefined;
            const editMode = getEditModeForView(this.view);
            const cellView = editMode?.tableCell?.cm as
                EditorView | null | undefined;
            if (cellView) {
                const adapter = getCmAdapterFromEditorView(cellView);
                const vimState = adapter?.state?.vim ?? null;
                if (vimState && !isVimIdle(vimState)) return true;
            }
            this.exitCellEditToNav();
            return false;
        });

        const navKeys: Record<string, 'h' | 'j' | 'k' | 'l'> = {
            h: 'h',
            j: 'j',
            k: 'k',
            l: 'l',
        };
        for (const [key, direction] of Object.entries(navKeys)) {
            scope.register(null, key, () => {
                if (s.state !== 'edit') return undefined;
                const editMode = getEditModeForView(this.view);
                const cellView = editMode?.tableCell?.cm as
                    EditorView | null | undefined;
                if (!cellView) return undefined;
                const adapter = getCmAdapterFromEditorView(cellView);
                const vimState = adapter?.state?.vim ?? null;
                if (!vimState || !isVimIdle(vimState)) return undefined;
                if (!adapter || !this.cursorAtCellBoundary(adapter, direction))
                    return undefined;
                this.exitCellEditToNav();
                this.navigate(direction);
                return false;
            });
        }

        scope.register(null, 'Tab', () => {
            if (s.state !== 'edit') return undefined;
            this.exitCellEditToNav();
            this.navigate('l', 1, true);
            return false;
        });
        scope.register(['Shift'], 'Tab', () => {
            if (s.state !== 'edit') return undefined;
            this.exitCellEditToNav();
            this.navigate('h', 1, true);
            return false;
        });

        s.cellEditScope = scope;
        pushKeymapScope(this.app, scope);
    }

    private removeCellEditScope(): void {
        const s = this.session;
        if (!s.cellEditScope || !this.app) return;
        popKeymapScope(this.app, s.cellEditScope);
        s.cellEditScope = null;
    }

    private installCellEscapeCapture(): void {
        this.removeCellEscapeCapture();

        const s = this.session;
        const handler = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            if (s.state !== 'edit') return;
            const editMode = getEditModeForView(this.view);
            const cv = editMode?.tableCell?.cm as EditorView | null | undefined;
            if (cv) {
                const adapter = getCmAdapterFromEditorView(cv);
                const vimState = adapter?.state?.vim ?? null;
                if (vimState && !isCellVimIdle(vimState)) return;
            }
            e.preventDefault();
            // Only destroy the event when the bundled engine owns keys. Under
            // RPC this listener runs on `document` capture, ahead of the key
            // delegation listener on the parent `contentDOM`, so stopping it
            // here means `<Esc>` never reaches `nvim_input` and a Neovim
            // command awaiting its second character can never be cancelled.
            if (!isExternalBackendActive()) e.stopImmediatePropagation();
            this.exitCellEditToNav();
        };

        this.view.dom.ownerDocument.addEventListener('keydown', handler, true);
        s.cellEscapeCleanup = () =>
            this.view.dom.ownerDocument.removeEventListener(
                'keydown',
                handler,
                true,
            );
    }

    private removeCellEscapeCapture(): void {
        const s = this.session;
        if (s.cellEscapeCleanup) {
            s.cellEscapeCleanup();
            s.cellEscapeCleanup = null;
        }
    }

    private cursorAtCellBoundary(
        adapter: CmAdapter,
        direction: 'h' | 'j' | 'k' | 'l',
    ): boolean {
        const head = adapter.getCursor();
        if (direction === 'h') {
            return head.ch <= 0;
        }
        if (direction === 'l') {
            const lineLen = adapter.getLine(head.line)?.length ?? 0;
            return head.ch >= lineLen - 1;
        }
        if (direction === 'j') {
            return head.line >= adapter.lastLine();
        }
        return head.line <= adapter.firstLine();
    }

    private hasDataRows(table: TableRange): boolean {
        return table.lines.length >= 3;
    }

    private resolveTableRange(): TableRange | null {
        const tables = findTableRanges(this.view.state);
        const from = this.session.tableFrom;
        let best: TableRange | null = null;
        let bestDist = Infinity;
        for (const t of tables) {
            const d = Math.abs(t.from - from);
            if (d < bestDist) {
                bestDist = d;
                best = t;
            }
        }
        return best;
    }

    destroy(): void {
        const s = this.session;
        if (__DEV__) console.debug('[table-nav] destroy, state=', s.state);
        if (this.abandonFrame !== null) {
            window.cancelAnimationFrame(this.abandonFrame);
            this.abandonFrame = null;
        }
        if (s.state !== 'inactive') {
            this.removeHighlight();
            this.removeNavScope();
            this.removeCellEscapeCapture();
            this.removeCellEditScope();
            s.widgetEl?.classList.remove(NAV_MODE_CLASS);
            this.showCellEditor();
            setKeyInterceptActive(false);
            clearCursorSuppressedForView(this.view);
            resumeAnimatedCursorForView(this.view);
            this.restoreCursorLayers();
        }
        this.cancelEntry();
        this.clearRefreshTimer();
    }
}

const tableNavScrollHandler = EditorView.scrollHandler.of(
    (view, _range, options) => {
        if (!isTableNavActive(view.state)) return false;

        const widget = view.dom.querySelector('.' + NAV_MODE_CLASS);
        if (!widget) return false;

        const cell = widget.querySelector('.' + NAV_HIGHLIGHT_CLASS);
        if (!(cell instanceof HTMLElement)) return false;

        const scroller = view.scrollDOM;
        const cellRect = cell.getBoundingClientRect();
        const scrollerRect = scroller.getBoundingClientRect();
        const scrolloff = getScrolloffMargin(view);
        const margin =
            scrolloff > 0
                ? scrolloff
                : options.y === 'nearest'
                  ? (options.yMargin ?? 5)
                  : 5;

        let dy = 0;
        if (cellRect.top < scrollerRect.top + margin) {
            dy = cellRect.top - (scrollerRect.top + margin);
        } else if (cellRect.bottom > scrollerRect.bottom - margin) {
            dy = cellRect.bottom - (scrollerRect.bottom - margin);
        }

        if (dy) scroller.scrollTop += dy;

        return true;
    },
);

export function createTableNavExtension(
    app: App,
    settings: TableNavSettings,
    getVimApi: () => VimApi | null,
): Extension {
    if (isBuiltinVimEnabled(app)) {
        return [tableNavStateField];
    }
    const plugin = ViewPlugin.fromClass(
        class extends TableNavController {
            constructor(view: EditorView) {
                super(view, settings, getVimApi);
            }
        },
    );
    return [tableNavStateField, plugin, tableNavScrollHandler];
}

export { isTableNavActive };

export function getTableNavSessionSnapshot(
    view: EditorView,
): Record<string, unknown> | null {
    const s = sessions.get(view);
    if (!s) return null;
    return {
        state: s.state,
        activeRow: s.activeRow,
        activeCol: s.activeCol,
        tableFrom: s.tableFrom,
        widgetConnected: s.widgetEl?.isConnected ?? false,
        hasHiddenEl: s.hiddenEl !== null,
        hasNavScope: s.navScope !== null,
        hasCellEditScope: s.cellEditScope !== null,
        hasCellEscapeCleanup: s.cellEscapeCleanup !== null,
        hasEntryTimer: s.entryTimer !== null,
        hasRefreshTimer: s.refreshTimer !== null,
        exitTimestamp: s.exitTimestamp,
        dirty: s.dirty,
        pendingEntryMode: s.pendingEntryMode,
        preEntryScrollTop: s.preEntryScrollTop,
    };
}
