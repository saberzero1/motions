import { App, getAllTags } from 'obsidian';
import { PickerModal } from '../picker';
import type {
    PickerItem,
    PickerKeymap,
    PickerMatcher,
    PickerSource,
} from '../types';

function normalizeTag(tag: string): string {
    const trimmed = tag.trim();
    return trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
}

function addTag(map: Map<string, Set<string>>, tag: string, path: string) {
    const normalized = normalizeTag(tag);
    if (!normalized) return;
    const entry = map.get(normalized) ?? new Set<string>();
    entry.add(path);
    map.set(normalized, entry);
}

function getFrontmatterTags(tags: unknown): string[] {
    if (!tags) return [];
    if (Array.isArray(tags)) {
        return tags
            .flatMap((tag) => (typeof tag === 'string' ? tag : []))
            .filter(Boolean);
    }
    if (typeof tags === 'string') {
        return tags
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean);
    }
    return [];
}

function buildTagIndex(app: App): Map<string, Set<string>> {
    const tagMap = new Map<string, Set<string>>();
    for (const file of app.vault.getMarkdownFiles()) {
        const cache = app.metadataCache.getFileCache(file);
        if (cache) {
            if (typeof getAllTags === 'function') {
                const allTags = getAllTags(cache);
                if (allTags) {
                    for (const tag of allTags) {
                        addTag(tagMap, tag, file.path);
                    }
                }
            } else if (cache.tags) {
                for (const tag of cache.tags) {
                    addTag(tagMap, tag.tag, file.path);
                }
            }

            const frontmatterTags = getFrontmatterTags(cache.frontmatter?.tags);
            for (const tag of frontmatterTags) {
                addTag(tagMap, tag, file.path);
            }
        }
    }
    return tagMap;
}

function buildFileItems(paths: string[]): PickerItem[] {
    return paths.map(
        (path): PickerItem => ({
            id: path,
            label: path.replace(/\.md$/, '').split('/').pop() ?? path,
            description: path,
            filterValue: path,
            data: { path },
        }),
    );
}

export function createTagsSource(
    matcher: PickerMatcher,
    getKeymap?: () => PickerKeymap | undefined,
): PickerSource {
    return {
        name: 'tags',
        placeholder: 'Search tags…',
        displayName: 'Search tags',
        icon: 'tag',
        description: 'Browse files by tag',
        priority: 7,
        items(app) {
            const tagMap = buildTagIndex(app);
            return Array.from(tagMap.entries())
                .sort(([a], [b]) => a.localeCompare(b))
                .map(
                    ([tag, files]): PickerItem => ({
                        id: tag,
                        label: tag,
                        description: `${files.size} files`,
                        filterValue: tag,
                        data: { tag, files: Array.from(files) },
                    }),
                );
        },
        onSelect(item, app) {
            const data = item.data as { tag: string; files: string[] };
            const tagFiles = data.files.slice().sort();
            const source: PickerSource = {
                name: `tag:${data.tag}`,
                placeholder: 'Filter files…',
                items() {
                    return buildFileItems(tagFiles);
                },
                onSelect(fileItem) {
                    const fileData = fileItem.data as { path: string };
                    void app.workspace.openLinkText(fileData.path, '');
                },
            };
            PickerModal.open(
                app,
                source,
                matcher,
                { source: `tag:${data.tag}` },
                undefined,
                getKeymap?.(),
            );
        },
    };
}
