import type { App } from 'obsidian';

export function getResolvedLinks(
    app: App,
): Record<string, Record<string, number>> {
    return (
        app.metadataCache as unknown as {
            resolvedLinks: Record<string, Record<string, number>>;
        }
    ).resolvedLinks;
}
