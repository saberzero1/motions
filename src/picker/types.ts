import type { App } from 'obsidian';

export interface PickerItem {
    id: string;
    label: string;
    description?: string;
    icon?: string;
    sortValue?: string;
    filterValue?: string;
    data?: unknown;
}

export type SplitDirection = 'horizontal' | 'vertical' | 'tab';

/** Rendered markdown preview of a file (or file excerpt). */
export interface PreviewResult {
    /** Raw markdown content to render via MarkdownRenderer. */
    markdown: string;
    /** Vault-relative path for resolving relative links/images. */
    sourcePath: string;
    /**
     * When set, a line-number gutter is shown alongside the rendered
     * markdown.  The gutter spans `lineStart` through `lineEnd`
     * (1-indexed, inclusive) and highlights `targetLine`.
     */
    lineRange?: {
        lineStart: number;
        lineEnd: number;
        targetLine: number;
    };
}

export type PreviewReturn = PreviewResult | string | null;

export interface PickerSource {
    name: string;
    placeholder: string;
    frecencySource?: boolean;
    items(app: App): PickerItem[] | Promise<PickerItem[]>;
    search?(query: string, app: App): PickerItem[] | Promise<PickerItem[]>;
    onSelect(item: PickerItem, app: App): void;
    onSelectSplit?(item: PickerItem, app: App, direction: SplitDirection): void;
    onEmpty?(query: string, app: App): void;
    preview?(
        item: PickerItem,
        app: App,
    ): PreviewReturn | Promise<PreviewReturn>;
}

export interface PickerOptions {
    source: string;
    query?: string;
    resumeSelectedId?: string;
    onFrecencyUpdate?: () => void;
}

export interface PickerMatcher {
    search(query: string, items: PickerItem[]): PickerMatch[];
}

export interface PickerMatch {
    item: PickerItem;
    score: number;
    highlights: [number, number][];
    descHighlights?: [number, number][];
}
