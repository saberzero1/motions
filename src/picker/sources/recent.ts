import type { PickerItem, PickerSource, SplitDirection } from '../types';
import { openInSplit } from './split-open';
import { readFilePreview } from './preview-utils';
import { navigateWithJump } from '../../workspace/navigate';

const MAX_RECENTS = 50;
const recentFiles: string[] = [];

export function trackRecentFile(path: string): void {
    if (!path) return;
    const existingIndex = recentFiles.indexOf(path);
    if (existingIndex >= 0) {
        recentFiles.splice(existingIndex, 1);
    }
    recentFiles.unshift(path);
    if (recentFiles.length > MAX_RECENTS) {
        recentFiles.splice(MAX_RECENTS);
    }
}

export function createRecentSource(): PickerSource {
    return {
        name: 'recent',
        placeholder: 'Recent files…',
        frecencySource: true,
        displayName: 'Recent files',
        icon: 'clock',
        description: 'Recently opened files',
        priority: 8,
        items() {
            return recentFiles.map(
                (path): PickerItem => ({
                    id: path,
                    label: path.replace(/\.md$/, '').split('/').pop() ?? path,
                    description: path,
                    filterValue: path,
                    data: { path },
                }),
            );
        },
        onSelect(item, app) {
            const data = item.data as { path: string };
            void navigateWithJump(app, data.path, '');
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
