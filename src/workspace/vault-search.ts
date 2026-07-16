import { App, SuggestModal, TFile, prepareSimpleSearch } from 'obsidian';
import type { ExCommandFn } from '../types/vim-api';
import { navigateWithJump } from './navigate';

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
        this.setInstructions([
            { command: 'Enter', purpose: 'open' },
            { command: 'Esc', purpose: 'cancel' },
        ]);
        const { modalEl } = this;
        modalEl.addClass('vim-motions-prompt-modal-container');
        const childEls = modalEl.children;
        if (childEls.length === 3) {
            const input = childEls[0];
            const results = childEls[1];
            const instructions = childEls[2];
            if (input) {
                input.addClass('vim-motions-prompt-modal-input');
                input.createSpan({
                    text: 'Search results',
                    cls: 'vim-motions-prompt-modal-title',
                });
            }
            if (results) {
                results.addClass('vim-motions-prompt-modal-results');
            }
            if (instructions) {
                instructions.addClass('vim-motions-prompt-modal-instructions');
            }
        }
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
            cls: 'vim-motions-prompt-modal-suggestion-label',
        });
        const desc =
            item.lineNumber > 0
                ? `L${item.lineNumber}: ${item.linePreview}`
                : item.file.path;
        el.createDiv({
            text: desc,
            cls: 'vim-motions-prompt-modal-suggestion-description',
        });
    }

    onChooseSuggestion(item: SearchResult): void {
        const options =
            item.lineNumber > 0
                ? { line: item.lineNumber - 1, ch: 0 }
                : undefined;
        void navigateWithJump(this.app, item.file.path, '', options);
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
