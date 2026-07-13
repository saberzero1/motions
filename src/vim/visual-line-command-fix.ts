import { type App, MarkdownView } from 'obsidian';
import { around } from '../util/around';
import { getCmAdapter } from './vim-api';
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

export function installVisualLineCommandFix(app: App): () => void {
    const commands = (
        app as unknown as {
            commands: Record<string, (...args: unknown[]) => unknown>;
        }
    ).commands;

    return around(commands, {
        executeCommand(next) {
            return function (this: unknown, ...args: unknown[]): unknown {
                const state = getActiveVisualLineState(app);
                if (!state) return next.apply(this, args);

                expandSelection(state.editorView, state.vim.sel!);
                try {
                    return next.apply(this, args);
                } finally {
                    const currentVim = state.cm.state?.vim as
                        | VimState
                        | undefined;
                    if (currentVim?.visualLine && currentVim.sel) {
                        restoreCursorOnly(state.cm, currentVim);
                    }
                }
            };
        },
    });
}
