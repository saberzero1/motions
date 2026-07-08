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
    ): string | null | Promise<string | null>;
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
