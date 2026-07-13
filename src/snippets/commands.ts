import { Notice, MarkdownView, type App } from 'obsidian';
import { snippet } from '@codemirror/autocomplete';
import type { EditorView } from '@codemirror/view';
import type { VimRegistration } from '../vim/registration';
import type { SnippetRegistry } from './registry';
import type { PreprocessContext } from './types';
import { preprocessSnippetBody } from './preprocess';

function getEditorView(app: App): EditorView | null {
    const mdView = app.workspace.getActiveViewOfType(MarkdownView);
    if (!mdView) return null;
    const cmObj = (mdView.editor as unknown as Record<string, unknown>).cm as
        | Record<string, unknown>
        | undefined;
    if (!cmObj) return null;
    const inner = cmObj.cm as Record<string, unknown> | undefined;
    if (inner?.cm6) return inner.cm6 as EditorView;
    if (cmObj.cm6) return cmObj.cm6 as EditorView;
    return null;
}

export function registerSnippetCommands(
    reg: VimRegistration,
    app: App,
    getRegistry: () => SnippetRegistry | null,
    getContext: () => PreprocessContext,
    getOpenPicker?: () =>
        | ((source: string, opts?: Record<string, unknown>) => void)
        | undefined,
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

        const body = preprocessSnippetBody(entry.body, getContext());
        const selection = view.state.selection.main;
        const apply = snippet(body) as unknown as (
            v: EditorView,
            completion: null,
            from?: number,
            to?: number,
        ) => void;
        apply(view, null, selection.from, selection.to);
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
