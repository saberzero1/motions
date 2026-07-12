import { App, MarkdownView } from 'obsidian';
import type { PickerItem, PickerSource, SplitDirection } from '../types';
import { readLinesAroundPosition } from './preview-utils';
import { openInSplit } from './split-open';

interface OmnisearchResult {
    score: number;
    path: string;
    basename: string;
    foundWords: string[];
    matches: { match: string; offset: number }[];
    excerpt: string;
}

interface OmnisearchApi {
    search(query: string): Promise<OmnisearchResult[]>;
}

function getOmnisearchApi(): OmnisearchApi | undefined {
    const api = (window as unknown as Record<string, unknown>).omnisearch;
    if (api && typeof (api as OmnisearchApi).search === 'function') {
        return api as OmnisearchApi;
    }
    return undefined;
}

export function isOmnisearchAvailable(): boolean {
    return getOmnisearchApi() !== undefined;
}

const DEBOUNCE_MS = 150;
const MIN_QUERY_LENGTH = 2;

export function createOmnisearchSource(): PickerSource {
    let debounceTimer: number | null = null;

    return {
        name: 'omnisearch',
        placeholder: 'Search with Omnisearch…',
        displayName: 'Omnisearch',
        icon: 'search',
        description: 'Full-text vault search powered by Omnisearch',
        priority: 20,

        items() {
            return [];
        },

        search(query: string, _app: App): Promise<PickerItem[]> {
            if (debounceTimer !== null) {
                window.clearTimeout(debounceTimer);
                debounceTimer = null;
            }

            if (query.length < MIN_QUERY_LENGTH) {
                return Promise.resolve([]);
            }

            return new Promise((resolve) => {
                debounceTimer = window.setTimeout(() => {
                    debounceTimer = null;
                    const api = getOmnisearchApi();
                    if (!api) {
                        resolve([]);
                        return;
                    }
                    api.search(query)
                        .then((results) => {
                            resolve(
                                results.map((r) => ({
                                    id: r.path,
                                    label: r.basename,
                                    description: `${r.path}  ·  score: ${Math.round(r.score)}`,
                                    filterValue: `${r.basename} ${r.path}`,
                                    data: {
                                        path: r.path,
                                        offset: r.matches[0]?.offset ?? 0,
                                    },
                                })),
                            );
                        })
                        .catch((e) => {
                            console.warn(
                                '[vim-motions] Omnisearch search() failed:',
                                e,
                            );
                            resolve([]);
                        });
                }, DEBOUNCE_MS);
            });
        },

        onSelect(item, app) {
            const data = item.data as { path: string; offset: number };
            void app.workspace.openLinkText(data.path, '').then(() => {
                if (data.offset > 0) {
                    const view =
                        app.workspace.getActiveViewOfType(MarkdownView);
                    if (view) {
                        const pos = view.editor.offsetToPos(data.offset);
                        view.editor.setCursor(pos);
                        view.editor.focus();
                    }
                }
            });
        },

        onSelectSplit(item, app, direction: SplitDirection) {
            const data = item.data as { path: string; offset: number };
            openInSplit(app, data.path, direction);
        },

        async preview(item, app) {
            const data = item.data as { path: string; offset: number };
            if (data.offset > 0) {
                const file = app.vault.getFileByPath(data.path);
                if (file) {
                    const content = await app.vault.cachedRead(file);
                    const lines = content.slice(0, data.offset).split('\n');
                    const line = lines.length - 1;
                    return readLinesAroundPosition(app, data.path, line);
                }
            }
            return readLinesAroundPosition(app, data.path, 0);
        },
    };
}
