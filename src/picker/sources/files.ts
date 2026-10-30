import type { PickerSource, SplitDirection } from '../types';
import { openInSplit } from './split-open';
import { readFilePreview } from './preview-utils';
import type { NonMarkdownPreviewMode } from './preview-utils';
import { navigateWithJump } from '../../workspace/navigate';
import { pickerFileName } from './display-name';

export function createFilesSource(
    getNonMarkdownPreview: () => NonMarkdownPreviewMode,
): PickerSource {
    return {
        name: 'files',
        placeholder: 'Find files…',
        frecencySource: true,
        displayName: 'Find files',
        icon: 'file-text',
        description: 'Search vault files by name',
        priority: 1,
        items(app) {
            return app.vault.getFiles().map((file) => ({
                id: file.path,
                label: pickerFileName(file.path),
                description: file.parent?.path ?? '',
                filterValue: `${pickerFileName(file.path)} ${file.path}`,
                data: { path: file.path },
            }));
        },
        yankText(item) {
            return (item.data as { path: string }).path;
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
            return readFilePreview(app, data.path, getNonMarkdownPreview());
        },
    };
}
