import {
    type App,
    type Command,
    MarkdownView,
    editorInfoField,
} from 'obsidian';
import { type Extension } from '@codemirror/state';
import { ViewPlugin, type ViewUpdate } from '@codemirror/view';
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
    if (!state) return fn.apply(thisArg, args);

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
    } | null = null;

    constructor(private view: import('@codemirror/view').EditorView) {
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
              }
            | undefined;
        if (!editor || typeof editor.somethingSelected !== 'function') return;

        const origSelected = editor.somethingSelected.bind(editor);
        const origGetSel = editor.getSelection.bind(editor);
        const origReplaceSel = editor.replaceSelection.bind(editor);
        const editorView = this.view;
        this.patched = true;
        this.original = origSelected;
        this.editorRef = editor;

        let lastVisualLineSel: VimSel | null = null;

        const getVisualLineSel = (): VimState | null => {
            const cm = getCmAdapterFromEditorView(editorView);
            const vim = cm?.state?.vim as unknown as VimState | undefined;
            if (vim?.visualMode && vim.visualLine && vim.sel) return vim;
            return null;
        };

        editor.somethingSelected = function () {
            if (origSelected()) return true;
            return getVisualLineSel() !== null;
        };

        this.origGetSelection = origGetSel;
        editor.getSelection = function () {
            const nativeSel = origGetSel();
            if (nativeSel) return nativeSel;
            const vim = getVisualLineSel();
            if (!vim?.sel) return '';
            lastVisualLineSel = {
                anchor: { line: vim.sel.anchor.line, ch: vim.sel.anchor.ch },
                head: { line: vim.sel.head.line, ch: vim.sel.head.ch },
            };
            const startLine = Math.min(vim.sel.anchor.line, vim.sel.head.line);
            const endLine = Math.max(vim.sel.anchor.line, vim.sel.head.line);
            const doc = editorView.state.doc;
            const from = doc.line(startLine + 1).from;
            const to = doc.line(endLine + 1).to;
            return editorView.state.sliceDoc(from, to);
        };

        this.origReplaceSelection = origReplaceSel;
        editor.replaceSelection = function (text: string, origin?: string) {
            const vim = getVisualLineSel();
            const sel = vim?.sel ?? lastVisualLineSel;
            if (!sel) {
                origReplaceSel(text, origin);
                return;
            }
            lastVisualLineSel = null;
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
    }

    destroy(): void {
        if (this.editorRef) {
            if (this.original) this.editorRef.somethingSelected = this.original;
            if (this.origGetSelection)
                this.editorRef.getSelection = this.origGetSelection;
            if (this.origReplaceSelection)
                this.editorRef.replaceSelection = this.origReplaceSelection;
        }
    }
}

export function visualLineSelectionSyncExtension(): Extension {
    return ViewPlugin.fromClass(VisualLineSomethingSelectedPatch);
}
