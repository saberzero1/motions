import type { App } from 'obsidian';
import type { PickerItem, PickerSource, PreviewReturn } from './types';
import { pickerRegistry } from './registry';

const EXTERNAL_SOURCE_TIMEOUT = 5000;
const EXTERNAL_SOURCE_MAX_ITEMS = 10000;

/**
 * Races `work` against a timeout, cancelling the timer whichever side wins.
 *
 * `Promise.race` settles but does not cancel the loser, so an uncleared timer
 * stays live for the full duration holding its closure — once per call, and
 * `search()` runs on every keystroke.
 */
export function withTimeout<T>(work: Promise<T>, label: string): Promise<T> {
    let timer: number | undefined;
    const expiry = new Promise<never>((_, reject) => {
        timer = window.setTimeout(() => {
            reject(
                new Error(
                    `${label} timed out after ${EXTERNAL_SOURCE_TIMEOUT}ms`,
                ),
            );
        }, EXTERNAL_SOURCE_TIMEOUT);
    });

    return Promise.race([work, expiry]).finally(() => {
        if (timer !== undefined) window.clearTimeout(timer);
    });
}

export interface PickerAPISourceMeta {
    name: string;
    displayName?: string;
    icon?: string;
    description?: string;
    external: boolean;
}

export interface PickerAPI {
    registerSource(source: PickerSource): () => void;
    unregisterSource(name: string): boolean;
    getSources(): ReadonlyArray<PickerAPISourceMeta>;
    hasSource(name: string): boolean;
    on(
        event: 'source-registered' | 'source-unregistered',
        callback: (name: string) => void,
    ): () => void;
}

type PickerEvent = 'source-registered' | 'source-unregistered';

class PickerAPIImpl implements PickerAPI {
    private listeners = new Map<PickerEvent, Set<(name: string) => void>>();

    registerSource(source: PickerSource): () => void {
        this.validateSource(source);

        const wrapped = this.wrapExternalSource(source);
        pickerRegistry.register(wrapped);
        this.emit('source-registered', source.name);

        return () => {
            pickerRegistry.unregister(source.name);
            this.emit('source-unregistered', source.name);
        };
    }

    unregisterSource(name: string): boolean {
        if (pickerRegistry.isBuiltin(name)) {
            return false;
        }
        const removed = pickerRegistry.unregister(name);
        if (removed) {
            this.emit('source-unregistered', name);
        }
        return removed;
    }

    getSources(): ReadonlyArray<PickerAPISourceMeta> {
        return pickerRegistry.getAll().map((s) => ({
            name: s.name,
            displayName: s.displayName,
            icon: s.icon,
            description: s.description,
            external: !pickerRegistry.isBuiltin(s.name),
        }));
    }

    hasSource(name: string): boolean {
        return pickerRegistry.has(name);
    }

    on(event: PickerEvent, callback: (name: string) => void): () => void {
        let set = this.listeners.get(event);
        if (!set) {
            set = new Set();
            this.listeners.set(event, set);
        }
        const listeners = set;
        listeners.add(callback);
        return () => {
            listeners.delete(callback);
        };
    }

    private emit(event: PickerEvent, name: string): void {
        const set = this.listeners.get(event);
        if (!set) return;
        for (const cb of set) {
            try {
                cb(name);
            } catch (e) {
                console.error(
                    `[vim-motions] Picker API event listener error:`,
                    e,
                );
            }
        }
    }

    private validateSource(source: PickerSource): void {
        if (!source || typeof source !== 'object') {
            throw new Error(
                '[vim-motions] registerSource: source must be an object',
            );
        }
        if (!source.name || typeof source.name !== 'string') {
            throw new Error(
                '[vim-motions] registerSource: source.name is required',
            );
        }
        if (!source.name.includes(':')) {
            throw new Error(
                `[vim-motions] registerSource: external source names must use "pluginId:sourceName" format, got "${source.name}"`,
            );
        }
        if (pickerRegistry.isBuiltin(source.name)) {
            throw new Error(
                `[vim-motions] registerSource: "${source.name}" conflicts with a built-in source`,
            );
        }
        if (!source.placeholder || typeof source.placeholder !== 'string') {
            throw new Error(
                '[vim-motions] registerSource: source.placeholder is required',
            );
        }
        if (typeof source.items !== 'function') {
            throw new Error(
                '[vim-motions] registerSource: source.items must be a function',
            );
        }
        if (typeof source.onSelect !== 'function') {
            throw new Error(
                '[vim-motions] registerSource: source.onSelect must be a function',
            );
        }
    }

    private wrapExternalSource(source: PickerSource): PickerSource {
        return {
            ...source,
            items: (app: App) => this.safeItems(source, app),
            search: source.search
                ? (query: string, app: App) =>
                      this.safeSearch(source, query, app)
                : undefined,
            onSelect: (item: PickerItem, app: App) =>
                this.safeOnSelect(source, item, app),
            preview: source.preview
                ? (item: PickerItem, app: App) =>
                      this.safePreview(source, item, app)
                : undefined,
        };
    }

    private async safeItems(
        source: PickerSource,
        app: App,
    ): Promise<PickerItem[]> {
        try {
            const result = await withTimeout(
                Promise.resolve(source.items(app)),
                `Source "${source.name}" items()`,
            );
            if (result.length > EXTERNAL_SOURCE_MAX_ITEMS) {
                console.warn(
                    `[vim-motions] Source "${source.name}" returned ${result.length} items, truncating to ${EXTERNAL_SOURCE_MAX_ITEMS}`,
                );
                return result.slice(0, EXTERNAL_SOURCE_MAX_ITEMS);
            }
            return result;
        } catch (e) {
            console.error(
                `[vim-motions] Source "${source.name}" items() failed:`,
                e,
            );
            return [];
        }
    }

    private async safeSearch(
        source: PickerSource,
        query: string,
        app: App,
    ): Promise<PickerItem[]> {
        try {
            const result = await withTimeout(
                Promise.resolve(source.search!(query, app)),
                `Source "${source.name}" search()`,
            );
            if (result.length > EXTERNAL_SOURCE_MAX_ITEMS) {
                console.warn(
                    `[vim-motions] Source "${source.name}" returned ${result.length} items, truncating to ${EXTERNAL_SOURCE_MAX_ITEMS}`,
                );
                return result.slice(0, EXTERNAL_SOURCE_MAX_ITEMS);
            }
            return result;
        } catch (e) {
            console.error(
                `[vim-motions] Source "${source.name}" search() failed:`,
                e,
            );
            return [];
        }
    }

    private safeOnSelect(
        source: PickerSource,
        item: PickerItem,
        app: App,
    ): void {
        try {
            source.onSelect(item, app);
        } catch (e) {
            console.error(
                `[vim-motions] Source "${source.name}" onSelect() failed:`,
                e,
            );
        }
    }

    private async safePreview(
        source: PickerSource,
        item: PickerItem,
        app: App,
    ): Promise<PreviewReturn> {
        try {
            return await withTimeout(
                Promise.resolve(source.preview!(item, app)),
                `Source "${source.name}" preview()`,
            );
        } catch (e) {
            console.error(
                `[vim-motions] Source "${source.name}" preview() failed:`,
                e,
            );
            return null;
        }
    }
}

let apiInstance: PickerAPIImpl | null = null;
let installed = false;

export function installPickerAPI(): PickerAPI {
    if (installed && apiInstance) return apiInstance;

    apiInstance = new PickerAPIImpl();
    installed = true;

    const win = window as unknown as Record<string, Record<string, unknown>>;
    if (!win.VimMotions) {
        win.VimMotions = {};
    }
    Object.defineProperty(win.VimMotions, 'picker', {
        get() {
            return apiInstance;
        },
        configurable: true,
        enumerable: true,
    });

    return apiInstance;
}

export function uninstallPickerAPI(): void {
    if (!installed) return;
    installed = false;
    apiInstance = null;

    const win = window as unknown as Record<string, Record<string, unknown>>;
    if (win.VimMotions) {
        delete win.VimMotions.picker;
        if (Object.keys(win.VimMotions).length === 0) {
            delete (win as Record<string, unknown>).VimMotions;
        }
    }
}
