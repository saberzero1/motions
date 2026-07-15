import { App, MarkdownView, SuggestModal } from 'obsidian';

interface HeadingItem {
    heading: string;
    level: number;
    line: number;
}

export class OutlineModal extends SuggestModal<HeadingItem> {
    private headings: HeadingItem[];

    constructor(app: App, headings: HeadingItem[]) {
        super(app);
        this.headings = headings;
        this.setPlaceholder('Jump to heading\u2026');
        this.setInstructions([
            { command: 'Enter', purpose: 'jump' },
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
                    text: 'Outline',
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

    getSuggestions(query: string): HeadingItem[] {
        const lower = query.toLowerCase();
        return this.headings.filter((h) =>
            h.heading.toLowerCase().includes(lower),
        );
    }

    renderSuggestion(item: HeadingItem, el: HTMLElement): void {
        const indent = '\u00A0\u00A0'.repeat(item.level - 1);
        el.createDiv({
            text: indent + '#'.repeat(item.level) + ' ' + item.heading,
            cls: 'vim-motions-prompt-modal-suggestion-label',
        });
        el.createDiv({
            text: `L${item.line + 1}`,
            cls: 'vim-motions-prompt-modal-suggestion-description',
        });
    }

    onChooseSuggestion(item: HeadingItem): void {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view) {
            view.editor.setCursor(item.line, 0);
            view.editor.focus();
        }
    }
}

export function getDocumentHeadings(app: App): HeadingItem[] {
    const view = app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file) return [];

    const cache = app.metadataCache.getFileCache(view.file);
    if (cache?.headings) {
        return cache.headings.map((h) => ({
            heading: h.heading,
            level: h.level,
            line: h.position.start.line,
        }));
    }

    const editor = view.editor;
    const headings: HeadingItem[] = [];
    const lineCount = editor.lineCount();
    const headingRe = /^(#{1,6})\s+(.+)$/;
    for (let i = 0; i < lineCount; i++) {
        const match = editor.getLine(i).match(headingRe);
        if (match && match[1] && match[2]) {
            headings.push({
                heading: match[2],
                level: match[1].length,
                line: i,
            });
        }
    }
    return headings;
}
