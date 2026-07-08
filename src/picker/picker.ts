import {
    App,
    Component,
    MarkdownRenderer,
    MarkdownView,
    Modal,
    Notice,
} from 'obsidian';
import { isEasyMotionActive } from '../easymotion/register';
import { isHintModeActive } from '../ui/hint-mode';
import type { FrecencyStore } from './frecency';
import type {
    PickerItem,
    PickerMatch,
    PickerMatcher,
    PickerOptions,
    PickerSource,
    PreviewResult,
    PreviewReturn,
} from './types';

const MAX_RENDERED = 200;

let lastSession: {
    source: string;
    query: string;
    selectedId: string;
} | null = null;

export function getLastSession() {
    return lastSession;
}

export function clearLastSession(): void {
    lastSession = null;
}

export class PickerModal extends Modal {
    static activeInstance: PickerModal | null = null;

    private matcher: PickerMatcher;
    private source: PickerSource;
    private options?: PickerOptions;
    private selectedIndex = 0;
    private currentMatches: PickerMatch[] = [];
    private allItems: PickerItem[] = [];
    private inputEl: HTMLInputElement | null = null;
    private countEl: HTMLElement | null = null;
    private resultsEl: HTMLElement | null = null;
    private previewEl: HTMLElement | null = null;
    private itemElements: HTMLElement[] = [];
    private previewFrame: number | null = null;
    private previewComponent: Component | null = null;
    private isDynamic = false;
    private searchGeneration = 0;
    private searchTimer: number | null = null;
    private frecencyStore?: FrecencyStore;
    private resumeSelectedId: string | null = null;

    constructor(
        app: App,
        source: PickerSource,
        matcher: PickerMatcher,
        options?: PickerOptions,
        frecencyStore?: FrecencyStore,
    ) {
        super(app);
        this.source = source;
        this.matcher = matcher;
        this.options = options;
        this.frecencyStore = frecencyStore;
        this.resumeSelectedId = options?.resumeSelectedId ?? null;
    }

    static open(
        app: App,
        source: PickerSource,
        matcher: PickerMatcher,
        options?: PickerOptions,
        frecencyStore?: FrecencyStore,
    ): void {
        if (isHintModeActive() || isEasyMotionActive()) return;
        if (PickerModal.activeInstance) {
            PickerModal.activeInstance.close();
        }
        const modal = new PickerModal(
            app,
            source,
            matcher,
            options,
            frecencyStore,
        );
        PickerModal.activeInstance = modal;
        modal.open();
    }

    private static formatTitle(name: string): string {
        return name.charAt(0).toUpperCase() + name.slice(1);
    }

    onOpen(): void {
        this.modalEl.addClass('vim-motions-picker');
        const container = this.contentEl.createDiv({
            cls: 'vim-motions-picker-container',
        });

        const sourceTitle = PickerModal.formatTitle(this.source.name);

        const inputWrapper = container.createDiv({
            cls: 'vim-motions-picker-section',
        });
        inputWrapper.createSpan({
            cls: 'vim-motions-picker-title',
            text: sourceTitle,
        });
        this.inputEl = inputWrapper.createEl('input', {
            cls: 'vim-motions-picker-input',
            type: 'text',
        });
        this.inputEl.placeholder = this.source.placeholder;
        if (this.options?.query) {
            this.inputEl.value = this.options.query;
        }
        this.inputEl.focus();

        this.countEl = container.createDiv({
            cls: 'vim-motions-picker-count',
        });

        const hasPreview = typeof this.source.preview === 'function';

        if (hasPreview) {
            this.modalEl.addClass('vim-motions-picker-with-preview');
            const bodyEl = container.createDiv({
                cls: 'vim-motions-picker-body',
            });
            const resultsWrapper = bodyEl.createDiv({
                cls: 'vim-motions-picker-section',
            });
            resultsWrapper.createSpan({
                cls: 'vim-motions-picker-title',
                text: 'Results',
            });
            this.resultsEl = resultsWrapper.createDiv({
                cls: 'vim-motions-picker-results',
            });
            const previewWrapper = bodyEl.createDiv({
                cls: 'vim-motions-picker-section',
            });
            previewWrapper.createSpan({
                cls: 'vim-motions-picker-title',
                text: 'Preview',
            });
            this.previewEl = previewWrapper.createDiv({
                cls: 'vim-motions-picker-preview',
            });
        } else {
            const resultsWrapper = container.createDiv({
                cls: 'vim-motions-picker-section',
            });
            resultsWrapper.createSpan({
                cls: 'vim-motions-picker-title',
                text: 'Results',
            });
            this.resultsEl = resultsWrapper.createDiv({
                cls: 'vim-motions-picker-results',
            });
        }

        this.isDynamic = typeof this.source.search === 'function';

        this.inputEl.addEventListener('input', () => {
            const query = this.inputEl?.value ?? '';
            if (this.isDynamic) {
                this.dynamicSearch(query);
            } else {
                this.updateResults(query);
            }
        });

        this.inputEl.addEventListener('keydown', (event) => {
            const key = event.key;
            const ctrl = event.ctrlKey || event.metaKey;
            if (key === 'ArrowDown' || (ctrl && (key === 'n' || key === 'j'))) {
                event.preventDefault();
                this.moveSelection(1);
                return;
            }
            if (key === 'ArrowUp' || (ctrl && (key === 'p' || key === 'k'))) {
                event.preventDefault();
                this.moveSelection(-1);
                return;
            }
            if (key === 'Enter') {
                event.preventDefault();
                this.confirmSelection();
                return;
            }
            if (ctrl && key === 'x') {
                event.preventDefault();
                this.confirmSelection('horizontal');
                return;
            }
            if (ctrl && key === 'v') {
                event.preventDefault();
                this.confirmSelection('vertical');
                return;
            }
            if (ctrl && key === 't') {
                event.preventDefault();
                this.confirmSelection('tab');
                return;
            }
            if (ctrl && key === 'd') {
                if (this.scrollPreview(1)) {
                    event.preventDefault();
                    return;
                }
            }
            if (ctrl && key === 'u') {
                if (this.scrollPreview(-1)) {
                    event.preventDefault();
                    return;
                }
            }
            if (key === 'Escape' || (ctrl && key === 'c')) {
                event.preventDefault();
                this.close();
            }
        });

        const initialQuery = this.inputEl?.value ?? '';

        if (this.isDynamic) {
            if (initialQuery) {
                this.dynamicSearch(initialQuery, true);
            } else {
                this.dynamicSearch(initialQuery);
            }
            return;
        }

        const loadItems = async () => {
            try {
                const items = await this.source.items(this.app);
                this.allItems = items;
                this.updateResults(this.inputEl?.value ?? '');
            } catch (error) {
                this.showError(error instanceof Error ? error.message : error);
            }
        };

        void loadItems();
    }

    private updateResults(query: string): void {
        if (this.isDynamic) return;
        if (!this.resultsEl || !this.countEl) return;

        const matches = query
            ? this.matcher.search(query, this.allItems)
            : this.allItems.map((item) => ({
                  item,
                  score: 0,
                  highlights: [],
              }));

        let rankedMatches = matches;
        const frecencyStore = this.frecencyStore;
        if (frecencyStore && this.source.frecencySource) {
            if (!query) {
                rankedMatches = [...matches].sort((a, b) => {
                    const scoreA = frecencyStore.getScore(a.item.id);
                    const scoreB = frecencyStore.getScore(b.item.id);
                    if (scoreA !== scoreB) return scoreB - scoreA;
                    return a.item.label.localeCompare(b.item.label);
                });
            } else if (matches.length > 0) {
                const frecencyScores = matches.map((match) =>
                    frecencyStore.getScore(match.item.id),
                );
                const maxScore = Math.max(0, ...frecencyScores);
                const total = matches.length;
                const scored = matches.map((match, index) => {
                    const normalizedRank = (total - index) / total;
                    const frecencyScore = frecencyScores[index] ?? 0;
                    const frecencyBoost =
                        maxScore > 0 ? (frecencyScore / maxScore) * 0.3 : 0;
                    return {
                        match,
                        score: normalizedRank + frecencyBoost,
                    };
                });
                scored.sort((a, b) => b.score - a.score);
                rankedMatches = scored.map((entry) => entry.match);
            }
        }

        this.currentMatches = rankedMatches;
        if (this.resumeSelectedId) {
            const resumeIndex = rankedMatches.findIndex(
                (match) => match.item.id === this.resumeSelectedId,
            );
            this.selectedIndex = resumeIndex >= 0 ? resumeIndex : 0;
            this.resumeSelectedId = null;
        } else {
            this.selectedIndex = 0;
        }

        const total = this.allItems.length;
        const matched = rankedMatches.length;
        const capped = matched > MAX_RENDERED;
        this.countEl.textContent = capped
            ? `${MAX_RENDERED}/${total} (top ${MAX_RENDERED} of ${matched})`
            : `${matched}/${total}`;

        const container = this.resultsEl;
        container.empty();
        this.itemElements = [];

        if (rankedMatches.length === 0) {
            container.createDiv({
                cls: 'vim-motions-picker-empty',
                text: 'No results',
            });
            this.updatePreview();
            return;
        }

        const renderCount = Math.min(rankedMatches.length, MAX_RENDERED);
        for (let i = 0; i < renderCount; i++) {
            const match = rankedMatches[i];
            if (match) this.renderItem(match, container, i);
        }

        this.updatePreview();
    }

    private dynamicSearch(query: string, immediate = false): void {
        if (!this.resultsEl || !this.countEl) return;

        if (query.length < 2) {
            this.searchGeneration += 1;
            if (this.searchTimer !== null) {
                window.clearTimeout(this.searchTimer);
                this.searchTimer = null;
            }
            this.allItems = [];
            this.currentMatches = [];
            this.selectedIndex = 0;
            this.countEl.textContent = '';
            this.resultsEl.empty();
            this.resultsEl.createDiv({
                cls: 'vim-motions-picker-empty',
                text: 'Type at least 2 characters to search…',
            });
            this.updatePreview();
            return;
        }

        this.searchGeneration += 1;
        if (this.searchTimer !== null) {
            window.clearTimeout(this.searchTimer);
        }
        if (this.currentMatches.length === 0) {
            this.countEl.textContent = 'Searching…';
        }
        const generation = this.searchGeneration;
        const runSearch = async () => {
            try {
                const items = await this.source.search!(query, this.app);
                if (this.searchGeneration !== generation) return;
                if (!this.countEl || !this.resultsEl) return;
                this.allItems = items;
                this.currentMatches = items.map((item) => ({
                    item,
                    score: 0,
                    highlights: [],
                }));
                this.selectedIndex = 0;
                this.countEl.textContent = `${items.length} results`;
                if (this.searchGeneration !== generation) return;
                const container = this.resultsEl;
                if (!container) return;
                container.empty();
                this.itemElements = [];
                if (items.length === 0) {
                    container.createDiv({
                        cls: 'vim-motions-picker-empty',
                        text: 'No results',
                    });
                    this.updatePreview();
                    return;
                }
                const renderCount = Math.min(items.length, MAX_RENDERED);
                for (let i = 0; i < renderCount; i++) {
                    const match = this.currentMatches[i];
                    if (match) this.renderItem(match, container, i);
                }
                this.updatePreview();
            } catch (error) {
                if (this.searchGeneration !== generation) return;
                this.showError(error instanceof Error ? error.message : error);
            }
        };

        if (immediate) {
            void runSearch();
        } else {
            this.searchTimer = window.setTimeout(() => {
                this.searchTimer = null;
                void runSearch();
            }, 200);
        }
    }

    private renderItem(
        match: PickerMatch,
        container: HTMLElement,
        index: number,
    ): void {
        const itemEl = container.createDiv({
            cls: 'vim-motions-picker-item',
        });
        if (index === this.selectedIndex) {
            itemEl.addClass('is-selected');
        }
        const labelEl = itemEl.createDiv({
            cls: 'vim-motions-picker-item-label',
        });
        this.renderHighlighted(labelEl, match.item.label, match.highlights);

        if (match.item.description) {
            const descEl = itemEl.createDiv({
                cls: 'vim-motions-picker-item-description',
            });
            this.renderHighlighted(
                descEl,
                match.item.description,
                match.descHighlights ?? [],
            );
        }

        itemEl.addEventListener('click', () => {
            this.selectedIndex = index;
            this.confirmSelection();
        });

        this.itemElements.push(itemEl);
    }

    private renderHighlighted(
        container: HTMLElement,
        text: string,
        ranges: [number, number][],
    ): void {
        if (ranges.length === 0) {
            container.appendText(text);
            return;
        }
        let cursor = 0;
        for (const [start, end] of ranges) {
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

    private confirmSelection(split?: 'horizontal' | 'vertical' | 'tab'): void {
        const match = this.currentMatches[this.selectedIndex];
        if (!match) {
            this.source.onEmpty?.(this.inputEl?.value ?? '', this.app);
            return;
        }
        const item = match.item;
        const source = this.source;
        const app = this.app;
        if (this.frecencyStore && this.source.frecencySource) {
            this.frecencyStore.recordAccess(item.id);
            this.options?.onFrecencyUpdate?.();
        }
        this.close();
        window.setTimeout(() => {
            try {
                if (split && source.onSelectSplit) {
                    source.onSelectSplit(item, app, split);
                } else {
                    source.onSelect(item, app);
                }
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error);
                new Notice(`Picker selection failed: ${message}`);
            }
        }, 10);
    }

    private moveSelection(delta: number): void {
        if (this.currentMatches.length === 0) return;
        const next =
            (this.selectedIndex + delta + this.currentMatches.length) %
            this.currentMatches.length;
        if (this.itemElements[this.selectedIndex]) {
            this.itemElements[this.selectedIndex]?.classList.remove(
                'is-selected',
            );
        }
        this.selectedIndex = next;
        const nextEl = this.itemElements[this.selectedIndex];
        if (nextEl) {
            nextEl.addClass('is-selected');
            nextEl.scrollIntoView({ block: 'nearest' });
        }
        this.updatePreview();
    }

    private scrollPreview(direction: number): boolean {
        if (!this.previewEl) return false;
        if (!this.modalEl.hasClass('vim-motions-picker-with-preview')) {
            return false;
        }
        if (this.previewEl.offsetParent === null) return false;
        const amount = this.previewEl.clientHeight / 2;
        this.previewEl.scrollTop += amount * direction;
        return true;
    }

    private updatePreview(): void {
        if (!this.previewEl) return;
        if (this.previewFrame !== null) {
            window.cancelAnimationFrame(this.previewFrame);
            this.previewFrame = null;
        }

        const match = this.currentMatches[this.selectedIndex];
        const item = match?.item;
        if (!item || !this.source.preview) {
            this.showPreviewMessage(
                'No preview',
                'vim-motions-picker-preview-empty',
            );
            return;
        }

        const currentId = item.id;
        this.showPreviewMessage(
            'Loading…',
            'vim-motions-picker-preview-loading',
        );
        this.previewFrame = window.requestAnimationFrame(() => {
            this.previewFrame = null;
            Promise.resolve(this.source.preview?.(item, this.app))
                .then((raw: PreviewReturn | undefined) => {
                    if (
                        this.currentMatches[this.selectedIndex]?.item.id !==
                        currentId
                    ) {
                        return;
                    }
                    if (!this.previewEl) return;
                    if (raw == null) {
                        this.showPreviewMessage(
                            'No preview',
                            'vim-motions-picker-preview-empty',
                        );
                        return;
                    }

                    if (typeof raw === 'string') {
                        this.previewEl.empty();
                        const pre = this.previewEl.createEl('pre');
                        pre.createEl('code', { text: raw });
                        return;
                    }

                    this.renderMarkdownPreview(raw);
                })
                .catch((error: unknown) => {
                    if (!this.previewEl) return;
                    const message =
                        error instanceof Error ? error.message : String(error);
                    this.showPreviewMessage(
                        `Preview failed: ${message}`,
                        'vim-motions-picker-preview-empty',
                    );
                });
        });
    }

    private renderMarkdownPreview(result: PreviewResult): void {
        if (!this.previewEl) return;

        this.previewComponent?.unload();
        this.previewComponent = new Component();
        this.previewComponent.load();

        this.previewEl.empty();

        const { lineRange } = result;

        if (lineRange) {
            const wrapper = this.previewEl.createDiv({
                cls: 'vim-motions-picker-preview-positional',
            });

            const gutter = wrapper.createDiv({
                cls: 'vim-motions-picker-preview-gutter',
            });

            const contentLines = result.markdown.split('\n');
            const lineCount = lineRange.lineEnd - lineRange.lineStart + 1;

            for (let i = 0; i < lineCount; i++) {
                const n = lineRange.lineStart + i;
                const lineEl = gutter.createDiv({
                    cls: 'vim-motions-picker-preview-line-number',
                    text: String(n),
                });
                if (n === lineRange.targetLine) {
                    lineEl.addClass('is-target');
                }
            }

            const pre = wrapper.createEl('pre', {
                cls: 'vim-motions-picker-preview-code',
            });
            for (let i = 0; i < lineCount; i++) {
                const n = lineRange.lineStart + i;
                const line = contentLines[i] ?? '';
                const lineEl = pre.createEl('div', {
                    cls: 'vim-motions-picker-preview-code-line',
                    text: line || '\u00A0',
                });
                if (n === lineRange.targetLine) {
                    lineEl.addClass('is-target');
                }
            }
        } else {
            const content = this.previewEl.createDiv({
                cls: 'vim-motions-picker-preview-content markdown-rendered',
            });

            MarkdownRenderer.render(
                this.app,
                result.markdown,
                content,
                result.sourcePath,
                this.previewComponent,
            ).catch(() => {});
        }
    }

    private showPreviewMessage(text: string, className: string): void {
        if (!this.previewEl) return;
        this.previewEl.empty();
        this.previewEl.createDiv({
            cls: className,
            text,
        });
    }

    private showError(error: unknown): void {
        if (!this.resultsEl) return;
        const message = error instanceof Error ? error.message : String(error);
        this.resultsEl.empty();
        this.resultsEl.createDiv({
            cls: 'vim-motions-picker-error',
            text: `Failed to load items: ${message}`,
        });
    }

    onClose(): void {
        PickerModal.activeInstance = null;
        lastSession = {
            source: this.source.name,
            query: this.inputEl?.value ?? '',
            selectedId: this.currentMatches[this.selectedIndex]?.item.id ?? '',
        };
        if (this.searchTimer !== null) {
            window.clearTimeout(this.searchTimer);
            this.searchTimer = null;
        }
        if (this.previewFrame !== null) {
            window.cancelAnimationFrame(this.previewFrame);
            this.previewFrame = null;
        }
        this.previewComponent?.unload();
        this.previewComponent = null;
        this.previewEl = null;
        this.modalEl.removeClass('vim-motions-picker-with-preview');
        this.contentEl.empty();
        this.itemElements = [];
        this.currentMatches = [];
        this.allItems = [];
        window.setTimeout(() => {
            const view = this.app.workspace.getActiveViewOfType(MarkdownView);
            view?.editor.focus();
        }, 0);
    }
}
