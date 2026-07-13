import { MarkdownView, type App } from 'obsidian';
import type { PickerSource, PickerItem, PreviewReturn } from '../picker/types';
import type { SnippetRegistry } from './registry';
import type { PreprocessContext } from './types';
import { preprocessSnippetBody } from './preprocess';
import { snippet } from '@codemirror/autocomplete';
import type { EditorView } from '@codemirror/view';

function getActiveEditorView(app: App): EditorView | null {
    const view = app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return null;
    const editorView = (view.editor as unknown as Record<string, unknown>)
        .cm as { cm6?: EditorView } | EditorView | undefined;
    if (!editorView) return null;
    if ('cm6' in editorView) return editorView.cm6 ?? null;
    return editorView as EditorView;
}

export function createSnippetsPickerSource(
    getRegistry: () => SnippetRegistry | null,
    getContext: () => PreprocessContext,
): PickerSource {
    return {
        name: 'snippets',
        placeholder: 'Search snippets…',
        frecencySource: true,
        displayName: 'Insert snippet',
        icon: 'code-2',
        description: 'Insert a code snippet at cursor',
        priority: 8,
        items(): PickerItem[] {
            const registry = getRegistry();
            if (!registry) return [];
            return registry.getAll().map((entry) => {
                const prefixes = entry.prefixes.join(', ');
                const description = entry.description
                    ? `${prefixes} — ${entry.description}`
                    : prefixes;
                const filterValue = `${entry.name} ${entry.prefixes.join(
                    ' ',
                )} ${entry.description}`.trim();
                return {
                    id: entry.id,
                    label: entry.name,
                    description,
                    icon: entry.source === 'bundled' ? 'package' : 'file-text',
                    filterValue,
                    data: { id: entry.id },
                    group: entry.source,
                };
            });
        },
        onSelect(item, app) {
            const registry = getRegistry();
            if (!registry) return;
            const data = item.data as { id: string };
            const entry = registry.get(data.id);
            if (!entry) return;
            const view = getActiveEditorView(app);
            if (!view) return;
            const body = preprocessSnippetBody(entry.body, getContext());
            const selection = view.state.selection.main;
            const apply = snippet(body) as unknown as (
                view: EditorView,
                completion: null,
                from?: number,
                to?: number,
            ) => void;
            apply(view, null, selection.from, selection.to);
        },
        preview(item): PreviewReturn {
            const registry = getRegistry();
            if (!registry) return null;
            const data = item.data as { id: string };
            const entry = registry.get(data.id);
            if (!entry) return null;
            const prefixes = entry.prefixes
                .map((prefix) => `\`${prefix}\``)
                .join(', ');
            let body = preprocessSnippetBody(entry.body, getContext());
            body = body.replace(
                /\$\{?\d+(?::([^}]*))?}?/g,
                (_match, placeholder?: string) => placeholder ?? '',
            );
            body = body.replace(/\$[A-Z_]+/g, '…');
            return `**${entry.name}**\n\nPrefixes: ${
                prefixes || '—'
            }\n\n\`\`\`\n${body}\n\`\`\``;
        },
    };
}
