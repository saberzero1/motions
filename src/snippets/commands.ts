import { Notice, MarkdownView, type App } from 'obsidian';
import { snippet } from './autocomplete-types';
import type { EditorView } from '@codemirror/view';
import type { VimRegistration } from '../vim/registration';
import type { SnippetRegistry } from './registry';
import type { PreprocessContext } from './types';
import type { VimPos } from '../types/vim-api';
import { preprocessSnippetBody } from './preprocess';
import { getEditorView as getActiveEditorView } from '../util/editor';

function getEditorView(app: App): EditorView | null {
    const mdView = app.workspace.getActiveViewOfType(MarkdownView);
    if (!mdView) return null;
    return getActiveEditorView(mdView);
}

interface LastSelection {
    visualMode?: boolean;
    visualLine?: boolean;
}

function recoverVisualSelection(
    cm: Parameters<import('../types/vim-api').ExCommandFn>[0],
): { text: string; from: number; to: number } | null {
    const vim = cm.state.vim;
    if (!vim) return null;

    const lastSel = vim.lastSelection as LastSelection | undefined;
    if (!lastSel?.visualMode) return null;

    const startMark = vim.marks?.['<']?.find();
    const endMark = vim.marks?.['>']?.find();
    if (!startMark || !endMark) return null;

    let start: VimPos;
    let endExclusive: VimPos;
    if (lastSel.visualLine) {
        start = { line: startMark.line, ch: 0 };
        const lineLen = cm.getLine(endMark.line).length;
        endExclusive = { line: endMark.line, ch: lineLen };
    } else {
        start = startMark;
        endExclusive = { line: endMark.line, ch: endMark.ch + 1 };
    }

    const text = cm.getRange(start, endExclusive);
    const from = cm.indexFromPos(start);
    const to = cm.indexFromPos(endExclusive);

    return { text, from, to };
}

export function registerSnippetCommands(
    reg: VimRegistration,
    app: App,
    getRegistry: () => SnippetRegistry | null,
    getContext: () => PreprocessContext,
    getOpenPicker?: () =>
        ((source: string, opts?: Record<string, unknown>) => void) | undefined,
): void {
    reg.defineEx('snippet', 'snip', (cm, params) => {
        const query = (params.argString ?? '').trim();
        if (!query) {
            const picker = getOpenPicker?.();
            if (!picker) {
                new Notice('Picker is unavailable');
                return;
            }
            picker('snippets');
            return;
        }

        const registry = getRegistry();
        if (!registry) {
            new Notice('No snippets loaded');
            return;
        }

        const lowered = query.toLowerCase();
        const all = registry.getAll();
        const exact = all.find(
            (entry) =>
                entry.name.toLowerCase() === lowered ||
                entry.prefixes.some(
                    (prefix) => prefix.toLowerCase() === lowered,
                ),
        );
        const entry = exact ?? registry.search(query)[0];
        if (!entry) {
            new Notice(`No snippet matching: ${query}`);
            return;
        }

        const view = getEditorView(app);
        if (!view) {
            new Notice('No active editor');
            return;
        }

        const visual = recoverVisualSelection(cm);
        let from: number;
        let to: number;

        const ctx = getContext();
        if (visual) {
            from = visual.from;
            to = visual.to;
            ctx.selectedText = visual.text;
        } else {
            const sel = view.state.selection.main;
            from = sel.from;
            to = sel.to;
        }

        const body = preprocessSnippetBody(entry.body, ctx);
        const apply = snippet(body) as unknown as (
            v: EditorView,
            completion: null,
            from?: number,
            to?: number,
        ) => void;
        apply(view, null, from, to);
    });

    reg.defineEx('snippets', '', () => {
        const picker = getOpenPicker?.();
        if (!picker) {
            new Notice('Picker is unavailable');
            return;
        }
        picker('snippets');
    });
}
