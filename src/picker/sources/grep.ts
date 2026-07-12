import { App, MarkdownView, prepareSimpleSearch } from 'obsidian';
import type { PickerItem, PickerSource, SplitDirection } from '../types';
import { readLinesAroundPosition } from './preview-utils';
import { openInSplit } from './split-open';

interface GrepResult {
    path: string;
    basename: string;
    linePreview: string;
    lineNumber: number;
    score: number;
}

const MAX_RESULTS = 100;

function truncatePreview(text: string): string {
    return text.length > 80 ? text.slice(0, 80) : text;
}

async function searchVault(app: App, query: string): Promise<GrepResult[]> {
    const search = prepareSimpleSearch(query);
    const files = app.vault.getMarkdownFiles();
    const results: GrepResult[] = [];

    for (const file of files) {
        if (results.length >= MAX_RESULTS) break;

        const nameResult = search(file.basename);
        if (nameResult) {
            results.push({
                path: file.path,
                basename: file.basename,
                linePreview: truncatePreview(file.path),
                lineNumber: 0,
                score: nameResult.score + 1,
            });
        }

        const content = await app.vault.cachedRead(file);
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
            if (results.length >= MAX_RESULTS) break;
            const line = lines[i];
            if (!line) continue;
            const lineResult = search(line);
            if (lineResult) {
                results.push({
                    path: file.path,
                    basename: file.basename,
                    linePreview: truncatePreview(line),
                    lineNumber: i + 1,
                    score: lineResult.score,
                });
            }
        }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, MAX_RESULTS);
}

export function createGrepSource(query: string): PickerSource {
    return {
        name: 'grep',
        placeholder: 'Filter results…',
        frecencySource: true,
        displayName: 'Grep results',
        icon: 'text-search',
        description: 'Search results for a query',
        priority: 11,
        async items(app) {
            const results = await searchVault(app, query);
            return results.map(
                (result): PickerItem => ({
                    id: `${result.path}:${result.lineNumber}`,
                    label: result.basename,
                    description: `L${result.lineNumber}: ${result.linePreview}`,
                    filterValue: `${result.basename} ${result.linePreview}`,
                    data: { path: result.path, line: result.lineNumber },
                }),
            );
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
