import type { App } from 'obsidian';
import type { PickerItem, PickerSource, SplitDirection } from '../types';
import { readFilePreview } from './preview-utils';
import { openInSplit } from './split-open';

interface DataviewPage {
    file: {
        path: string;
        name: string;
        tags: string[];
        aliases: string[];
        mtime: { toFormat?: (fmt: string) => string };
    };
    [key: string]: unknown;
}

interface DataviewApiLike {
    pages(source?: string): { array(): DataviewPage[] };
}

function getDataviewApi(app: App): DataviewApiLike | undefined {
    const win = window as unknown as Record<string, unknown>;
    const api = win.DataviewAPI as DataviewApiLike | undefined;
    if (api && typeof api.pages === 'function') {
        return api;
    }
    const plugin = (
        app as unknown as {
            plugins: { plugins: Record<string, { api?: DataviewApiLike }> };
        }
    ).plugins?.plugins?.dataview;
    if (plugin?.api && typeof plugin.api.pages === 'function') {
        return plugin.api;
    }
    return undefined;
}

export function isDataviewAvailable(app: App): boolean {
    return getDataviewApi(app) !== undefined;
}

export function createDataviewSource(): PickerSource {
    return {
        name: 'dataview',
        placeholder: 'Browse pages…',
        displayName: 'Dataview pages',
        icon: 'database',
        description: 'Browse indexed pages with metadata',
        priority: 22,

        items(app: App): PickerItem[] {
            const api = getDataviewApi(app);
            if (!api) return [];

            try {
                const pages = api.pages().array();
                return pages.map((page) => {
                    const tags = Array.isArray(page.file.tags)
                        ? page.file.tags.join(', ')
                        : '';
                    const aliases = Array.isArray(page.file.aliases)
                        ? page.file.aliases.join(', ')
                        : '';
                    const parts: string[] = [];
                    if (tags) parts.push(tags);
                    if (aliases) parts.push(aliases);

                    return {
                        id: page.file.path,
                        label: page.file.name,
                        description: parts.join('  ·  ') || page.file.path,
                        filterValue: [
                            page.file.name,
                            page.file.path,
                            tags,
                            aliases,
                        ]
                            .filter(Boolean)
                            .join(' '),
                        data: { path: page.file.path },
                    };
                });
            } catch (e) {
                console.warn('[vim-motions] Dataview pages() failed:', e);
                return [];
            }
        },

        onSelect(item, app) {
            const data = item.data as { path: string };
            void app.workspace.openLinkText(data.path, '');
        },

        onSelectSplit(item, app, direction: SplitDirection) {
            const data = item.data as { path: string };
            openInSplit(app, data.path, direction);
        },

        async preview(item, app) {
            const data = item.data as { path: string };
            return readFilePreview(app, data.path);
        },
    };
}
