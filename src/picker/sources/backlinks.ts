import { App, Notice } from 'obsidian';
import type { PickerItem, PickerSource, SplitDirection } from '../types';
import { openInSplit } from './split-open';
import { readFilePreview } from './preview-utils';

interface BacklinkItem {
    path: string;
    name: string;
    count: number;
}

function getBacklinks(app: App): BacklinkItem[] {
    const activeFile = app.workspace.getActiveFile();
    if (!activeFile) {
        new Notice('No active file');
        return [];
    }

    const resolvedLinks = (
        app.metadataCache as unknown as {
            resolvedLinks: Record<string, Record<string, number>>;
        }
    ).resolvedLinks;

    const items: BacklinkItem[] = [];
    for (const [sourcePath, targets] of Object.entries(resolvedLinks)) {
        const count = targets[activeFile.path];
        if (count && count > 0) {
            const name =
                sourcePath.replace(/\.md$/, '').split('/').pop() ?? sourcePath;
            items.push({ path: sourcePath, name, count });
        }
    }

    return items.sort((a, b) => a.name.localeCompare(b.name));
}

export function createBacklinksSource(): PickerSource {
    return {
        name: 'backlinks',
        placeholder: 'Filter backlinks…',
        frecencySource: true,
        displayName: 'Backlinks',
        icon: 'link',
        description: 'Files linking to the current file',
        priority: 6,
        items(app) {
            const backlinks = getBacklinks(app);
            return backlinks.map(
                (item): PickerItem => ({
                    id: item.path,
                    label: item.name,
                    description: `${item.path} (${item.count})`,
                    filterValue: `${item.name} ${item.path}`,
                    data: { path: item.path },
                }),
            );
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
