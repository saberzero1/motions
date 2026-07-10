import type { App } from 'obsidian';
import type { PickerItem, PickerSource } from '../types';
import { readLinesAroundPosition } from './preview-utils';
import type { MarkEntry, MarkProvider } from './mark-providers';

interface MarkPickerData {
    entry: MarkEntry;
    providerIndex: number;
}

export function createMarksSource(providers: MarkProvider[]): PickerSource {
    return {
        name: 'marks',
        placeholder: 'Jump to mark…',
        async items(app: App) {
            const items: PickerItem[] = [];

            for (let pi = 0; pi < providers.length; pi++) {
                const provider = providers[pi]!;
                const entries = await provider.getMarks(app);
                if (entries.length === 0) continue;

                const first = entries[0]!;
                const groupLabel =
                    first.category === 'buffer'
                        ? 'Buffer marks'
                        : first.category === 'global'
                          ? 'Global marks'
                          : 'Special marks';

                for (const entry of entries) {
                    const line = entry.line + 1;
                    const col = entry.ch;
                    const desc =
                        entry.category === 'global' && entry.filePath
                            ? `${entry.filePath}  L${line}:${col}`
                            : `L${line}:${col}  ${entry.preview ?? ''}`;

                    items.push({
                        id: `${entry.category}:${entry.name}`,
                        label: entry.name,
                        description: desc.trim(),
                        filterValue: `${entry.name} ${entry.preview ?? ''} ${entry.filePath ?? ''}`,
                        group: groupLabel,
                        data: {
                            entry,
                            providerIndex: pi,
                        } satisfies MarkPickerData,
                    });
                }
            }

            return items;
        },
        onSelect(item, app) {
            const { entry, providerIndex } = item.data as MarkPickerData;
            const provider = providers[providerIndex];
            if (provider) void provider.navigateTo(entry, app);
        },
        async preview(item, app) {
            const { entry } = item.data as MarkPickerData;
            const path = entry.filePath ?? app.workspace.getActiveFile()?.path;
            if (!path) return null;
            return readLinesAroundPosition(app, path, entry.line);
        },
    };
}
