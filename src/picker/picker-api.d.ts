/**
 * Vim Motions Picker Provider API
 *
 * This file contains type definitions for plugins that want to register
 * custom picker sources with the Vim Motions picker.
 *
 * ## Usage
 *
 * ```typescript
 * import type { PickerAPI, PickerSource, PickerItem } from './picker-api';
 *
 * // In your plugin's onload():
 * const register = () => {
 *     const api = (window as any).VimMotions?.picker as PickerAPI | undefined;
 *     if (!api) return;
 *
 *     const dispose = api.registerSource({
 *         name: 'my-plugin:search',
 *         placeholder: 'Search my plugin...',
 *         displayName: 'My Plugin Search',
 *         icon: 'search',
 *         description: 'Search through my plugin data',
 *         async items(app) {
 *             return [{ id: '1', label: 'Result 1' }];
 *         },
 *         onSelect(item, app) {
 *             // Handle selection
 *         },
 *     });
 *
 *     // Clean up when your plugin unloads
 *     this.register(() => dispose());
 * };
 *
 * // Register after layout is ready (handles load order)
 * this.app.workspace.onLayoutReady(register);
 * // Also listen for hot-reload scenarios
 * this.registerEvent(
 *     this.app.workspace.on('vim-motions:picker-ready' as any, register),
 * );
 * ```
 */

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

export interface PreviewResult {
    markdown: string;
    sourcePath: string;
    lineRange?: {
        lineStart: number;
        lineEnd: number;
        targetLine: number;
    };
}

export type PreviewReturn = PreviewResult | string | null;

export interface PickerSource {
    /**
     * Unique source name. External sources MUST use "pluginId:sourceName" format.
     * @example 'omnisearch:vault', 'tasks:query', 'dataview:pages'
     */
    name: string;
    /** Placeholder text shown in the picker input field. */
    placeholder: string;
    /** Enable frecency (recency + frequency) ranking. Default: false for external sources. */
    frecencySource?: boolean;
    /** Human-readable name shown in the meta-picker. Falls back to `name`. */
    displayName?: string;
    /** Lucide icon name for display in source listings. */
    icon?: string;
    /** One-line description of this source. */
    description?: string;
    /** Sort priority in the meta-picker (lower = higher priority). */
    priority?: number;
    /**
     * Provide items for the picker. Called once when the picker opens.
     * For dynamic/live search, implement `search()` instead.
     */
    items(app: App): PickerItem[] | Promise<PickerItem[]>;
    /**
     * Optional dynamic search. When provided, the picker calls this on every
     * keystroke instead of filtering `items()` results locally.
     */
    search?(query: string, app: App): PickerItem[] | Promise<PickerItem[]>;
    /** Called when the user confirms a selection. */
    onSelect(item: PickerItem, app: App): void;
    /** Called when the user opens a selection in a split/tab. */
    onSelectSplit?(item: PickerItem, app: App, direction: SplitDirection): void;
    /** Called when no results match and the user presses Enter. */
    onEmpty?(query: string, app: App): void;
    /** Provide a preview for the currently highlighted item. */
    preview?(
        item: PickerItem,
        app: App,
    ): PreviewReturn | Promise<PreviewReturn>;
}

export interface PickerAPISourceMeta {
    name: string;
    displayName?: string;
    icon?: string;
    description?: string;
    external: boolean;
}

export interface PickerAPI {
    /**
     * Register a custom picker source. Returns a dispose function to unregister.
     * @throws If source.name doesn't use "pluginId:sourceName" format
     * @throws If source.name conflicts with a built-in source
     * @throws If required fields (name, placeholder, items, onSelect) are missing
     */
    registerSource(source: PickerSource): () => void;
    /** Unregister a source by name. Returns true if found and removed. Cannot remove built-in sources. */
    unregisterSource(name: string): boolean;
    /** List all registered sources (metadata only). */
    getSources(): ReadonlyArray<PickerAPISourceMeta>;
    /** Check if a source exists by name. */
    hasSource(name: string): boolean;
    /** Subscribe to registration events. Returns an unsubscribe function. */
    on(
        event: 'source-registered' | 'source-unregistered',
        callback: (name: string) => void,
    ): () => void;
}

declare global {
    interface Window {
        VimMotions?: {
            picker?: PickerAPI;
        };
    }
}
