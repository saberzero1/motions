import {
    type App,
    type Command,
    MarkdownView,
    editorInfoField,
} from 'obsidian';
import { type Extension } from '@codemirror/state';
import { type EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { around } from '../util/around';
import { getCmAdapter, getCmAdapterFromEditorView } from './vim-api';
import { getVimApi } from './vim-api';
import { getEditorView } from '../util/editor';

interface VimSel {
    anchor: { line: number; ch: number };
    head: { line: number; ch: number };
}

interface VimState {
    visualMode: boolean;
    visualLine: boolean;
    sel: VimSel | null;
}

interface EditorViewLike {
    state: {
        doc: {
            line: (n: number) => { from: number; to: number };
        };
    };
    dispatch: (spec: { selection: { anchor: number; head: number } }) => void;
}

interface VisualLineState {
    vim: VimState;
    editorView: EditorViewLike;
    cm: NonNullable<ReturnType<typeof getCmAdapter>>;
}

interface SelSnapshot {
    sel: VimSel;
    timer: number | null;
}

/**
 * Per-EditorView snapshot of the visual-line selection range, set by
 * {@link withExpandedSelection} before it temporarily expands the native CM6
 * selection.  The {@link VisualLineSomethingSelectedPatch} reads this as a
 * last-resort fallback when vim is no longer in visual-line mode AND the
 * `lastVisualLineSel` cache was never populated (which happens when
 * `getSelection()` was satisfied by the expanded native selection).
 *
 * Cleared on first successful use by `replaceSelection`, after a 30 s TTL
 * to prevent stale replacements when a modal is cancelled, or once the user
 * acts in the editor again.
 */
const pendingVisualLineSel = new WeakMap<EditorView, SelSnapshot>();
const lastVisualLineSel = new WeakMap<EditorView, SelSnapshot>();

/**
 * The TTL timer is stored beside the selection it expires. A single
 * module-scope timer would be cleared by the next view to store a selection,
 * leaving the earlier view's entry with no expiry at all.
 */
function storeSnapshot(
    store: WeakMap<EditorView, SelSnapshot>,
    editorView: EditorView,
    sel: VimSel,
    ttl: number | null,
): void {
    clearSnapshot(store, editorView);
    const snapshot: SelSnapshot = {
        sel: {
            anchor: { line: sel.anchor.line, ch: sel.anchor.ch },
            head: { line: sel.head.line, ch: sel.head.ch },
        },
        timer: null,
    };
    if (ttl !== null) {
        snapshot.timer = window.setTimeout(() => {
            if (store.get(editorView) === snapshot) store.delete(editorView);
        }, ttl);
    }
    store.set(editorView, snapshot);
}

function clearSnapshot(
    store: WeakMap<EditorView, SelSnapshot>,
    editorView: EditorView,
): void {
    const snapshot = store.get(editorView);
    if (!snapshot) return;
    if (snapshot.timer !== null) window.clearTimeout(snapshot.timer);
    store.delete(editorView);
}

function discardSnapshots(editorView: EditorView): void {
    clearSnapshot(pendingVisualLineSel, editorView);
    clearSnapshot(lastVisualLineSel, editorView);
}

function peekSnapshot(
    store: WeakMap<EditorView, SelSnapshot>,
    editorView: EditorView,
): VimSel | null {
    return store.get(editorView)?.sel ?? null;
}

function consumePendingSel(editorView: EditorView): VimSel | null {
    const sel = peekSnapshot(pendingVisualLineSel, editorView);
    clearSnapshot(pendingVisualLineSel, editorView);
    return sel;
}

function sameSel(a: VimSel | null, b: VimSel): boolean {
    return (
        a !== null &&
        a.anchor.line === b.anchor.line &&
        a.anchor.ch === b.anchor.ch &&
        a.head.line === b.head.line &&
        a.head.ch === b.head.ch
    );
}

function getActiveVisualLineState(app: App): VisualLineState | null {
    const view = app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return null;

    const cm = getCmAdapter(view);
    if (!cm?.state?.vim) return null;

    const vim = cm.state.vim as unknown as VimState;
    if (!vim.visualMode || !vim.visualLine || !vim.sel) return null;

    const editorView = getEditorView(view) as EditorViewLike | null;
    if (!editorView?.dispatch) return null;

    return { vim, editorView, cm };
}

function expandSelection(editorView: EditorViewLike, sel: VimSel): void {
    const startLine = Math.min(sel.anchor.line, sel.head.line);
    const endLine = Math.max(sel.anchor.line, sel.head.line);
    const from = editorView.state.doc.line(startLine + 1).from;
    const to = editorView.state.doc.line(endLine + 1).to;
    editorView.dispatch({ selection: { anchor: from, head: to } });
}

function restoreCursorOnly(
    cm: ReturnType<typeof getCmAdapter>,
    vim: VimState,
): void {
    if (!cm || !vim.visualLine || !vim.sel) return;
    const cmAny = cm as unknown as {
        operation: (fn: () => void) => void;
        curOp?: { isVimOp?: boolean };
        setCursor: (line: number, ch: number) => void;
    };
    cmAny.operation(() => {
        if (cmAny.curOp) cmAny.curOp.isVimOp = true;
        cmAny.setCursor(vim.sel!.head.line, 0);
    });
}

function withExpandedSelection(
    app: App,
    fn: (...args: unknown[]) => unknown,
    thisArg: unknown,
    args: unknown[],
): unknown {
    const state = getActiveVisualLineState(app);
    if (!state) {
        const view = app.workspace.getActiveViewOfType(MarkdownView);
        const editorView = view ? getEditorView(view) : null;
        if (editorView) discardSnapshots(editorView);
        return fn.apply(thisArg, args);
    }

    // Snapshot BEFORE expanding — async commands (Note Composer, Note Refactor)
    // call getSelection/replaceSelection after their modal closes, by which
    // time the expanded native selection and visual-line vim state are both
    // gone.  The snapshot survives as a last-resort fallback.
    storeSnapshot(
        pendingVisualLineSel,
        state.editorView as unknown as EditorView,
        state.vim.sel!,
        30_000,
    );

    expandSelection(state.editorView, state.vim.sel!);
    try {
        return fn.apply(thisArg, args);
    } finally {
        const currentVim = state.cm.state?.vim as VimState | undefined;
        if (currentVim?.visualLine && currentVim.sel) {
            restoreCursorOnly(state.cm, currentVim);
        }
    }
}

type CommandRecord = Record<
    string,
    Command & { checkCallback?: (checking: boolean) => boolean | void }
>;
const WRAPPED = Symbol('vl-wrapped');

function wrapCheckCallback(app: App, cmd: Command): void {
    const tagged = cmd as unknown as Record<symbol, boolean>;
    if (tagged[WRAPPED]) return;
    const original = (
        cmd as { checkCallback?: (...args: unknown[]) => unknown }
    ).checkCallback;
    if (!original) return;

    (
        cmd as unknown as { checkCallback: (...args: unknown[]) => unknown }
    ).checkCallback = function (this: unknown, ...args: unknown[]): unknown {
        const checking = args[0] === true;
        if (checking) {
            // checkCallback(true) only queries availability — the patched
            // somethingSelected()/getCursor()/listSelections() already
            // report the visual-line range.  Expanding the CM6 selection
            // for every command in the palette causes visible lag (#163).
            return original.apply(this, args);
        }
        return withExpandedSelection(app, original, this, args);
    };
    tagged[WRAPPED] = true;
}

export function installVisualLineCommandFix(app: App): () => void {
    const commandsObj = (
        app as unknown as {
            commands: Record<string, (...args: unknown[]) => unknown> & {
                commands: CommandRecord;
            };
        }
    ).commands;

    for (const cmd of Object.values(commandsObj.commands)) {
        wrapCheckCallback(app, cmd);
    }

    const removeExecuteCommandPatch = around(commandsObj, {
        executeCommand(next) {
            return function (this: unknown, ...args: unknown[]): unknown {
                return withExpandedSelection(app, next, this, args);
            };
        },
    });

    const removeAddCommandPatch = around(commandsObj, {
        addCommand(next) {
            return function (this: unknown, ...args: unknown[]): unknown {
                const result = next.apply(this, args);
                const cmd = args[0] as Command | undefined;
                if (cmd?.id) {
                    const registered = commandsObj.commands[cmd.id];
                    if (registered) wrapCheckCallback(app, registered);
                }
                return result;
            };
        },
    });

    return () => {
        removeExecuteCommandPatch();
        removeAddCommandPatch();
    };
}

class VisualLineSomethingSelectedPatch {
    private patched = false;
    private original: (() => boolean) | null = null;
    private origGetSelection: (() => string) | null = null;
    private origReplaceSelection:
        ((text: string, origin?: string) => void) | null = null;
    private editorRef: {
        somethingSelected: () => boolean;
        getSelection: () => string;
        replaceSelection: (text: string, origin?: string) => void;
        getCursor: (pos?: string) => { line: number; ch: number };
        listSelections: () => {
            anchor: { line: number; ch: number };
            head: { line: number; ch: number };
        }[];
    } | null = null;
    private origGetCursor:
        ((pos?: string) => { line: number; ch: number }) | null = null;
    private origListSelections:
        | (() => {
              anchor: { line: number; ch: number };
              head: { line: number; ch: number };
          }[])
        | null = null;

    private readonly onKeyDown = (): void => {
        if (this.view.hasFocus) discardSnapshots(this.view);
    };
    private readonly onPointerDown = (): void => {
        discardSnapshots(this.view);
    };
    private readonly inputWindow: Window | null;

    constructor(private view: import('@codemirror/view').EditorView) {
        this.inputWindow = view.dom.ownerDocument.defaultView;
        this.inputWindow?.addEventListener('keydown', this.onKeyDown, true);
        view.dom.addEventListener('pointerdown', this.onPointerDown, true);
        this.tryPatch();
    }

    update(_update: ViewUpdate): void {
        if (!this.patched) this.tryPatch();
    }

    private tryPatch(): void {
        let info: unknown = null;
        try {
            info = this.view.state.field(editorInfoField);
        } catch {
            return;
        }
        if (!info) return;

        const editor = (info as { editor?: unknown }).editor as
            | {
                  somethingSelected: () => boolean;
                  getSelection: () => string;
                  replaceSelection: (text: string, origin?: string) => void;
                  getCursor: (pos?: string) => { line: number; ch: number };
                  listSelections: () => {
                      anchor: { line: number; ch: number };
                      head: { line: number; ch: number };
                  }[];
              }
            | undefined;
        if (!editor || typeof editor.somethingSelected !== 'function') return;

        const origSelected = editor.somethingSelected.bind(editor);
        const origGetSel = editor.getSelection.bind(editor);
        const origReplaceSel = editor.replaceSelection.bind(editor);
        const origGetCursor = editor.getCursor.bind(editor);
        const origListSel = editor.listSelections.bind(editor);
        const editorView = this.view;
        this.patched = true;
        this.original = origSelected;
        this.editorRef = editor;

        const getVisualLineSel = (): VimState | null => {
            const cm = getCmAdapterFromEditorView(editorView);
            const vim = cm?.state?.vim as unknown as VimState | undefined;
            if (vim?.visualMode && vim.visualLine && vim.sel) return vim;
            return null;
        };

        editor.somethingSelected = function () {
            if (origSelected()) return true;
            if (getVisualLineSel() !== null) return true;
            const last = peekSnapshot(lastVisualLineSel, editorView);
            if (last && isSelInBounds(last)) return true;
            const pending = peekSnapshot(pendingVisualLineSel, editorView);
            if (pending && isSelInBounds(pending)) return true;
            return false;
        };

        const isSelInBounds = (sel: VimSel): boolean => {
            const maxLine = editorView.state.doc.lines - 1;
            return (
                sel.anchor.line <= maxLine &&
                sel.head.line <= maxLine &&
                sel.anchor.line >= 0 &&
                sel.head.line >= 0
            );
        };

        this.origGetSelection = origGetSel;
        editor.getSelection = function () {
            const nativeSel = origGetSel();
            if (nativeSel) return nativeSel;
            const vim = getVisualLineSel();
            const last = peekSnapshot(lastVisualLineSel, editorView);
            let sel: VimSel | null =
                vim?.sel ??
                last ??
                peekSnapshot(pendingVisualLineSel, editorView);
            if (sel && !isSelInBounds(sel)) {
                clearSnapshot(lastVisualLineSel, editorView);
                sel = null;
            }
            if (!sel) return '';
            if (!sameSel(last, sel)) {
                storeSnapshot(lastVisualLineSel, editorView, sel, null);
            }
            const startLine = Math.min(sel.anchor.line, sel.head.line);
            const endLine = Math.max(sel.anchor.line, sel.head.line);
            const doc = editorView.state.doc;
            const from = doc.line(startLine + 1).from;
            const to = doc.line(endLine + 1).to;
            return editorView.state.sliceDoc(from, to);
        };

        this.origReplaceSelection = origReplaceSel;
        editor.replaceSelection = function (text: string, origin?: string) {
            const vim = getVisualLineSel();
            let sel: VimSel | null =
                vim?.sel ??
                peekSnapshot(lastVisualLineSel, editorView) ??
                consumePendingSel(editorView);
            clearSnapshot(lastVisualLineSel, editorView);
            if (sel && !isSelInBounds(sel)) sel = null;
            if (!sel) {
                origReplaceSel(text, origin);
                return;
            }
            const startLine = Math.min(sel.anchor.line, sel.head.line);
            const endLine = Math.max(sel.anchor.line, sel.head.line);
            const doc = editorView.state.doc;
            const from = doc.line(startLine + 1).from;
            const lineEnd = doc.line(endLine + 1).to;
            const includeTrailingNewline = lineEnd < doc.length;
            const to = includeTrailingNewline ? lineEnd + 1 : lineEnd;
            editorView.dispatch({
                changes: {
                    from,
                    to,
                    insert: includeTrailingNewline ? text + '\n' : text,
                },
                selection: { anchor: from + text.length },
            });
            const cm = getCmAdapterFromEditorView(editorView);
            if (cm) {
                const vimApi = getVimApi();
                if (vimApi) {
                    vimApi.handleKey(cm, '<Esc>');
                }
            }
        };

        this.origGetCursor = origGetCursor;
        editor.getCursor = function (pos?: string) {
            const vim = getVisualLineSel();
            if (!vim?.sel) return origGetCursor(pos);
            const startLine = Math.min(vim.sel.anchor.line, vim.sel.head.line);
            const endLine = Math.max(vim.sel.anchor.line, vim.sel.head.line);
            if (pos === 'from' || pos === 'anchor')
                return { line: startLine, ch: 0 };
            if (pos === 'to' || pos === 'head') {
                const doc = editorView.state.doc;
                const endLineLen =
                    doc.line(endLine + 1).to - doc.line(endLine + 1).from;
                return { line: endLine, ch: endLineLen };
            }
            return origGetCursor(pos);
        };

        this.origListSelections = origListSel;
        editor.listSelections = function () {
            const vim = getVisualLineSel();
            if (!vim?.sel) return origListSel();
            const startLine = Math.min(vim.sel.anchor.line, vim.sel.head.line);
            const endLine = Math.max(vim.sel.anchor.line, vim.sel.head.line);
            const doc = editorView.state.doc;
            const endLineLen =
                doc.line(endLine + 1).to - doc.line(endLine + 1).from;
            return [
                {
                    anchor: { line: startLine, ch: 0 },
                    head: { line: endLine, ch: endLineLen },
                },
            ];
        };
    }

    destroy(): void {
        this.inputWindow?.removeEventListener('keydown', this.onKeyDown, true);
        this.view.dom.removeEventListener(
            'pointerdown',
            this.onPointerDown,
            true,
        );
        discardSnapshots(this.view);
        if (this.editorRef) {
            if (this.original) this.editorRef.somethingSelected = this.original;
            if (this.origGetSelection)
                this.editorRef.getSelection = this.origGetSelection;
            if (this.origReplaceSelection)
                this.editorRef.replaceSelection = this.origReplaceSelection;
            if (this.origGetCursor)
                this.editorRef.getCursor = this.origGetCursor;
            if (this.origListSelections)
                this.editorRef.listSelections = this.origListSelections;
        }
    }
}

export function visualLineSelectionSyncExtension(): Extension {
    return ViewPlugin.fromClass(VisualLineSomethingSelectedPatch);
}
