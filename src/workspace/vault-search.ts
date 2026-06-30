import {
    App,
    MarkdownView,
    SuggestModal,
    TFile,
    prepareSimpleSearch,
} from 'obsidian';
import type { ExCommandFn } from '../types/vim-api';

interface SearchResult {
    file: TFile;
    score: number;
    linePreview: string;
    lineNumber: number;
    matches: [number, number][];
}

const MAX_RESULTS = 100;

async function searchVault(app: App, query: string): Promise<SearchResult[]> {
    const search = prepareSimpleSearch(query);
    const files = app.vault.getMarkdownFiles();
    const results: SearchResult[] = [];

    for (const file of files) {
        if (results.length >= MAX_RESULTS) break;

        const nameResult = search(file.basename);
        if (nameResult) {
            results.push({
                file,
                score: nameResult.score + 1,
                linePreview: file.path,
                lineNumber: 0,
                matches: nameResult.matches ?? [],
            });
        }

        const content = await app.vault.cachedRead(file);
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!line) continue;
            const lineResult = search(line);
            if (lineResult) {
                results.push({
                    file,
                    score: lineResult.score,
                    linePreview: line.slice(0, 80),
                    lineNumber: i + 1,
                    matches: lineResult.matches ?? [],
                });
                break;
            }
        }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, MAX_RESULTS);
}

class SearchResultsModal extends SuggestModal<SearchResult> {
    private results: SearchResult[];

    constructor(app: App, results: SearchResult[]) {
        super(app);
        this.results = results;
        this.setPlaceholder('Select result\u2026');
    }

    getSuggestions(query: string): SearchResult[] {
        if (!query) return this.results;
        const lower = query.toLowerCase();
        return this.results.filter(
            (r) =>
                r.file.basename.toLowerCase().includes(lower) ||
                r.linePreview.toLowerCase().includes(lower),
        );
    }

    renderSuggestion(item: SearchResult, el: HTMLElement): void {
        el.createDiv({
            text: item.file.basename,
            cls: 'vim-motions-search-file',
        });
        if (item.lineNumber > 0) {
            const preview = el.createEl('small', {
                cls: 'vim-motions-search-preview',
            });
            preview.appendText(`L${item.lineNumber}: `);
            this.renderHighlighted(preview, item.linePreview, item.matches);
        }
    }

    private renderHighlighted(
        container: HTMLElement,
        text: string,
        matches: [number, number][],
    ): void {
        if (matches.length === 0) {
            container.appendText(text);
            return;
        }
        let cursor = 0;
        for (const [start, end] of matches) {
            if (start > text.length) break;
            if (start > cursor) {
                container.appendText(text.slice(cursor, start));
            }
            const clampedEnd = Math.min(end, text.length);
            container.createEl('mark', { text: text.slice(start, clampedEnd) });
            cursor = clampedEnd;
        }
        if (cursor < text.length) {
            container.appendText(text.slice(cursor));
        }
    }

    onChooseSuggestion(item: SearchResult): void {
        void this.app.workspace.openLinkText(item.file.path, '').then(() => {
            if (item.lineNumber > 0) {
                const view =
                    this.app.workspace.getActiveViewOfType(MarkdownView);
                if (view) {
                    view.editor.setCursor(item.lineNumber - 1, 0);
                    view.editor.focus();
                }
            }
        });
    }
}

export function createGrepCommand(app: App): ExCommandFn {
    return (_cm, params) => {
        const query = params.argString?.trim();
        if (!query) return;

        void searchVault(app, query).then((results) => {
            new SearchResultsModal(app, results).open();
        });
    };
}
