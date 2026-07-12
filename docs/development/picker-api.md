---
title: Picker provider API
description: Register custom picker sources from external plugins
tags:
    - development
    - reference
---

# Picker provider API

Vim Motions exposes a public API that lets other Obsidian plugins register custom picker sources. Users can then access these sources through `:Picker <name>` or the meta-picker (`:Picker` with no arguments).

## Quick start

```typescript
// In your plugin's onload():
const register = () => {
    const api = (window as any).VimMotions?.picker;
    if (!api) return;

    const dispose = api.registerSource({
        name: 'my-plugin:search',
        placeholder: 'Search my plugin...',
        displayName: 'My Plugin Search',
        icon: 'search',
        description: 'Search through my plugin data',
        async items(app) {
            const results = await getMyResults();
            return results.map((r) => ({
                id: r.id,
                label: r.title,
                description: r.path,
            }));
        },
        onSelect(item, app) {
            app.workspace.openLinkText(item.id, '');
        },
    });

    this.register(() => dispose());
};

this.app.workspace.onLayoutReady(register);
this.registerEvent(
    this.app.workspace.on('vim-motions:picker-ready' as any, register),
);
```

## API reference

### `window.VimMotions.picker`

The picker API is available at `window.VimMotions.picker` after Vim Motions loads. It is also accessible via `app.plugins.plugins['vim-motions'].pickerAPI`.

#### `registerSource(source: PickerSource): () => void`

Register a picker source. Returns a dispose function that unregisters the source.

Throws if:

- `source.name` does not use `pluginId:sourceName` format
- `source.name` conflicts with a built-in source
- Required fields (`name`, `placeholder`, `items`, `onSelect`) are missing

#### `unregisterSource(name: string): boolean`

Remove a source by name. Returns `true` if found and removed. Cannot remove built-in sources.

#### `getSources(): ReadonlyArray<SourceMeta>`

List all registered sources with metadata (name, displayName, icon, description, external flag).

#### `hasSource(name: string): boolean`

Check whether a source is registered.

#### `on(event, callback): () => void`

Subscribe to `'source-registered'` or `'source-unregistered'` events. Returns an unsubscribe function.

## Source interface

```typescript
interface PickerSource {
    name: string; // Must be "pluginId:sourceName"
    placeholder: string; // Input placeholder text
    frecencySource?: boolean; // Enable frecency ranking (default: false)
    displayName?: string; // Human-readable name for meta-picker
    icon?: string; // Lucide icon name
    description?: string; // One-line description
    priority?: number; // Sort order in meta-picker (lower = higher)

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

interface PickerItem {
    id: string;
    label: string;
    description?: string;
    icon?: string;
    sortValue?: string;
    filterValue?: string;
    data?: unknown;
    group?: string;
}
```

### Static vs dynamic sources

- **Static**: Implement `items()` only. The picker calls it once when opened and filters results locally using the built-in fuzzy matcher.
- **Dynamic**: Implement `search(query, app)`. The picker calls this on every keystroke for live results. Use `items()` to return an empty array.

### Preview

Return markdown content, a plain string, or `null`:

```typescript
preview(item, app) {
    return {
        markdown: '# Preview\nSome content...',
        sourcePath: item.data.path,
        lineRange: { lineStart: 1, lineEnd: 20, targetLine: 10 },
    };
}
```

## Naming convention

External source names **must** use `pluginId:sourceName` format:

- `omnisearch:vault`
- `tasks:search`
- `dataview:pages`

This prevents collisions with built-in sources and other plugins.

## Load order

Plugin load order in Obsidian is undefined. Use both patterns to handle all scenarios:

1. **`onLayoutReady`** — by then all plugins have loaded
2. **`vim-motions:picker-ready` event** — handles hot-reload (Vim Motions disabled/re-enabled)

## Safety guarantees

The API wraps external source methods with safety layers:

- `items()` and `search()` have a 5-second timeout
- Exceptions in `items()`, `onSelect()`, or `preview()` are caught (picker shows empty results, error logged to console)
- Results are capped at 10,000 items

## Example: Omnisearch integration

```typescript
const register = () => {
    const api = (window as any).VimMotions?.picker;
    const omnisearch = (window as any).omnisearch;
    if (!api || !omnisearch) return;

    const dispose = api.registerSource({
        name: 'omnisearch:vault',
        placeholder: 'Search with Omnisearch...',
        displayName: 'Omnisearch',
        icon: 'search',
        description: 'Full-text search powered by Omnisearch',
        async search(query, app) {
            if (!query.trim()) return [];
            const results = await omnisearch.search(query);
            return results.map((r) => ({
                id: r.path,
                label: r.basename,
                description: `${r.path} · score: ${r.score}`,
                data: r,
            }));
        },
        items() {
            return [];
        },
        onSelect(item, app) {
            app.workspace.openLinkText(item.id, '');
        },
    });

    this.register(() => dispose());
};
```

## Example: Obsidian Tasks integration

```typescript
const register = () => {
    const api = (window as any).VimMotions?.picker;
    const tasks = (this.app as any).plugins?.plugins?.['obsidian-tasks-plugin'];
    if (!api || !tasks?.apiV1) return;

    const dispose = api.registerSource({
        name: 'tasks:search',
        placeholder: 'Search tasks...',
        displayName: 'Tasks',
        icon: 'check-square',
        description: 'Search Obsidian Tasks',
        async items(app) {
            // Use Tasks API to query all tasks
            return []; // Implementation depends on Tasks API
        },
        onSelect(item, app) {
            const data = item.data as { path: string; line: number };
            app.workspace.openLinkText(data.path, '');
        },
    });

    this.register(() => dispose());
};
```

## Bundled integrations

Vim Motions ships built-in picker sources for three popular plugins. These register automatically when the target plugin is detected:

| Source       | Plugin         | Type    | Description                                     |
| ------------ | -------------- | ------- | ----------------------------------------------- |
| `omnisearch` | Omnisearch     | Dynamic | Full-text vault search (debounced, min 2 chars) |
| `tasks`      | Obsidian Tasks | Static  | Incomplete tasks sorted by due date             |
| `dataview`   | Dataview       | Static  | All indexed pages with tags/aliases             |

Each can be disabled in **Settings → Vim Motions → Third-party integrations**.

These serve as reference implementations for external plugin authors. See `src/picker/sources/omnisearch.ts`, `tasks.ts`, and `dataview.ts`.

## Type definitions

Copy `src/picker/picker-api.d.ts` into your plugin for full type safety, or reference the types from the Vim Motions repository.
