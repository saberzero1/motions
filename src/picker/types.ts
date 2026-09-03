import type { App } from 'obsidian';

export interface PickerItem {
    id: string;
    label: string;
    description?: string;
    icon?: string;
    sortValue?: string;
    filterValue?: string;
    data?: unknown;
    group?: string;
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
    /** Human-readable name shown in the meta-picker (fallback: name). */
    displayName?: string;
    /** Lucide icon name for display in source listings. */
    icon?: string;
    /** One-line description of this source. */
    description?: string;
    /** Sort priority in the meta-picker (lower = higher priority). */
    priority?: number;
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

export interface PickerKeymap {
    moveDown: string[];
    moveUp: string[];
    confirm: string[];
    splitH: string[];
    splitV: string[];
    openTab: string[];
    scrollDown: string[];
    scrollUp: string[];
    close: string[];
}

export const DEFAULT_PICKER_KEYMAP: PickerKeymap = {
    moveDown: ['ArrowDown', 'C-n', 'C-j'],
    moveUp: ['ArrowUp', 'C-p', 'C-k'],
    confirm: ['Enter'],
    splitH: ['C-x'],
    splitV: ['C-v'],
    openTab: ['C-t'],
    scrollDown: ['C-d'],
    scrollUp: ['C-u'],
    close: ['Escape', 'C-c'],
};

const MODIFIER_PREFIXES = ['C-', 'A-', 'S-', 'M-'] as const;

function parsePickerKeySpec(spec: string): {
    wantCtrl: boolean;
    wantAlt: boolean;
    wantShift: boolean;
    wantMeta: boolean;
    key: string;
} {
    let rest = spec;
    let wantCtrl = false;
    let wantAlt = false;
    let wantShift = false;
    let wantMeta = false;

    let found = true;
    while (found) {
        found = false;
        for (const prefix of MODIFIER_PREFIXES) {
            if (rest.startsWith(prefix)) {
                rest = rest.slice(prefix.length);
                found = true;
                if (prefix === 'C-') wantCtrl = true;
                else if (prefix === 'A-') wantAlt = true;
                else if (prefix === 'S-') wantShift = true;
                else if (prefix === 'M-') wantMeta = true;
            }
        }
    }

    return { wantCtrl, wantAlt, wantShift, wantMeta, key: rest };
}

export function matchesPickerKey(
    event: KeyboardEvent,
    keys: string[],
): boolean {
    for (const spec of keys) {
        const { wantCtrl, wantAlt, wantShift, wantMeta, key } =
            parsePickerKeySpec(spec);

        // C- matches ctrlKey OR metaKey (macOS Cmd treated as Ctrl).
        // M- matches metaKey only — exclude metaKey from the C- check
        // so that M-j doesn't falsely trigger the ctrl guard.
        const hasCtrl = wantMeta
            ? event.ctrlKey
            : event.ctrlKey || event.metaKey;
        if (wantCtrl !== hasCtrl) continue;

        if (wantAlt !== event.altKey) continue;
        if (wantShift !== event.shiftKey) continue;

        // M- requires metaKey. When M- is absent, don't enforce metaKey
        // because C- already accepts it via the hasCtrl check above.
        if (wantMeta && !event.metaKey) continue;

        if (event.key === key) return true;
    }
    return false;
}
