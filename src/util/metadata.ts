import type { App } from 'obsidian';

export function getResolvedLinks(
    app: App,
): Record<string, Record<string, number>> {
    return app.metadataCache.resolvedLinks;
}
