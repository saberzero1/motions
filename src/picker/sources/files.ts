import type { PickerSource, SplitDirection } from '../types';
import { openInSplit } from './split-open';
import { readFilePreview } from './preview-utils';

export function createFilesSource(): PickerSource {
    return {
        name: 'files',
        placeholder: 'Find files…',
        frecencySource: true,
        displayName: 'Find files',
        icon: 'file-text',
        description: 'Search vault files by name',
        priority: 1,
        items(app) {
            return app.vault.getMarkdownFiles().map((file) => ({
                id: file.path,
                label: file.basename,
                description: file.parent?.path ?? '',
                filterValue: `${file.basename} ${file.path}`,
                data: { path: file.path },
            }));
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
