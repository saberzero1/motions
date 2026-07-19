import { App, MarkdownView, Platform } from 'obsidian';
import type { PickerItem, PickerSource, SplitDirection } from '../types';
import { readLinesAroundPosition } from './preview-utils';
import { openInSplit } from './split-open';
import { navigateWithJump } from '../../workspace/navigate';
import {
    executeRipgrep,
    getVaultBasePath,
    type RipgrepConfig,
    validateRipgrepBinary,
} from './ripgrep-process';

const MAX_RESULTS = 100;

function truncatePreview(text: string): string {
    return text.length > 80 ? text.slice(0, 80) : text;
}

function getBasename(path: string): string {
    const idx = path.lastIndexOf('/');
    return idx === -1 ? path : path.slice(idx + 1);
}

async function tryRipgrep(
    app: App,
    query: string,
    config?: RipgrepConfig,
): Promise<PickerItem[] | null> {
    if (!config || !config.binary.trim()) return null;
    if (!Platform.isDesktop) return null;

    const basePath = getVaultBasePath(app);
    if (!basePath) return null;

    const isValid = await validateRipgrepBinary(config.binary);
    if (!isValid) return null;

    const matches = await executeRipgrep(config, query, basePath);
    if (matches.length === 0) return null;

    return matches.slice(0, MAX_RESULTS).map((match) => {
        const preview = truncatePreview(match.lineText);
        return {
            id: `${match.path}:${match.lineNumber}`,
            label: getBasename(match.path),
            description: `L${match.lineNumber}: ${preview}`,
            filterValue: `${getBasename(match.path)} ${preview}`,
            data: {
                path: match.path,
                line: match.lineNumber,
            },
        };
    });
}

export function createLiveGrepSource(
    ripgrepConfig?: RipgrepConfig,
): PickerSource {
    return {
        name: 'livegrep',
        placeholder: 'Search vault content…',
        frecencySource: true,
        displayName: 'Live grep',
        icon: 'text-search',
        description: 'Search file contents in real-time',
        priority: 11,
        items() {
            return [];
        },
        async search(query: string, app: App) {
            const ripgrepResults = await tryRipgrep(app, query, ripgrepConfig);
            if (ripgrepResults) return ripgrepResults;

            let re: RegExp | null = null;
            try {
                re = new RegExp(query, 'i');
            } catch {
                re = null;
            }
            const match = re
                ? (text: string) => re.test(text)
                : (text: string) =>
                      text.toLowerCase().includes(query.toLowerCase());
            const CHUNK_SIZE = 50;
            const files = app.vault.getMarkdownFiles();
            const results: PickerItem[] = [];

            for (
                let chunkStart = 0;
                chunkStart < files.length;
                chunkStart += CHUNK_SIZE
            ) {
                if (results.length >= MAX_RESULTS) break;

                const chunkEnd = Math.min(
                    chunkStart + CHUNK_SIZE,
                    files.length,
                );
                for (let fi = chunkStart; fi < chunkEnd; fi++) {
                    if (results.length >= MAX_RESULTS) break;
                    const file = files[fi]!;
                    const content = await app.vault.cachedRead(file);
                    const lines = content.split('\n');
                    for (let i = 0; i < lines.length; i++) {
                        if (results.length >= MAX_RESULTS) break;
                        const line = lines[i];
                        if (!line) continue;
                        if (match(line)) {
                            const preview = truncatePreview(line);
                            results.push({
                                id: `${file.path}:${i + 1}`,
                                label: file.basename,
                                description: `L${i + 1}: ${preview}`,
                                filterValue: `${file.basename} ${preview}`,
                                data: {
                                    path: file.path,
                                    line: i + 1,
                                },
                            });
                        }
                    }
                }

                // Yield to event loop between chunks to prevent UI blocking
                if (
                    chunkStart + CHUNK_SIZE < files.length &&
                    results.length < MAX_RESULTS
                ) {
                    await new Promise((resolve) =>
                        window.setTimeout(resolve, 0),
                    );
                }
            }

            return results;
        },
        onSelect(item, app) {
            const data = item.data as { path: string; line: number };
            void navigateWithJump(app, data.path, '', {
                line: data.line - 1,
                ch: 0,
            });
        },
        onSelectSplit(item, app, direction: SplitDirection) {
            const data = item.data as { path: string; line: number };
            openInSplit(app, data.path, direction);
            if (data.line > 0) {
                window.setTimeout(() => {
                    const view =
                        app.workspace.getActiveViewOfType(MarkdownView);
                    if (view) {
                        view.editor.setCursor(data.line - 1, 0);
                        view.editor.focus();
                    }
                }, 100);
            }
        },
        async preview(item, app) {
            const data = item.data as { path: string; line: number };
            return readLinesAroundPosition(app, data.path, data.line - 1);
        },
    };
}
