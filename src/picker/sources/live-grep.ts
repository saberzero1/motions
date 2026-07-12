import { App, MarkdownView, prepareSimpleSearch } from 'obsidian';
import type { PickerItem, PickerSource, SplitDirection } from '../types';
import { readLinesAroundPosition } from './preview-utils';
import { openInSplit } from './split-open';

const MAX_RESULTS = 100;

export function createLiveGrepSource(): PickerSource {
    return {
        name: 'livegrep',
        placeholder: 'Search vault content…',
        frecencySource: true,
        displayName: 'Live grep',
        icon: 'text-search',
        description: 'Search file contents in real-time',
        priority: 11,
        items() {
            return [];
        },
        async search(query: string, app: App) {
            const search = prepareSimpleSearch(query);
            const files = app.vault.getMarkdownFiles();
            const results: PickerItem[] = [];

            for (const file of files) {
                if (results.length >= MAX_RESULTS) break;

                const content = await app.vault.cachedRead(file);
                const lines = content.split('\n');
                for (let i = 0; i < lines.length; i++) {
                    if (results.length >= MAX_RESULTS) break;
                    const line = lines[i];
                    if (!line) continue;
                    const lineResult = search(line);
                    if (lineResult) {
                        const preview =
                            line.length > 80 ? line.slice(0, 80) : line;
                        results.push({
                            id: `${file.path}:${i + 1}`,
                            label: file.basename,
                            description: `L${i + 1}: ${preview}`,
                            filterValue: `${file.basename} ${preview}`,
                            data: { path: file.path, line: i + 1 },
                        });
                    }
                }
            }

            return results;
        },
        onSelect(item, app) {
            const data = item.data as { path: string; line: number };
            void app.workspace.openLinkText(data.path, '').then(() => {
                if (data.line > 0) {
                    const view =
                        app.workspace.getActiveViewOfType(MarkdownView);
                    if (view) {
                        view.editor.setCursor(data.line - 1, 0);
                        view.editor.focus();
                    }
                }
            });
        },
        onSelectSplit(item, app, direction: SplitDirection) {
            const data = item.data as { path: string; line: number };
            openInSplit(app, data.path, direction);
            if (data.line > 0) {
                window.setTimeout(() => {
                    const view =
                        app.workspace.getActiveViewOfType(MarkdownView);
                    if (view) {
                        view.editor.setCursor(data.line - 1, 0);
                        view.editor.focus();
                    }
                }, 100);
            }
        },
        async preview(item, app) {
            const data = item.data as { path: string; line: number };
            return readLinesAroundPosition(app, data.path, data.line - 1);
        },
    };
}
