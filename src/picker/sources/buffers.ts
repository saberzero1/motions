import type { PickerItem, PickerSource, SplitDirection } from '../types';
import { FileView } from 'obsidian';
import { openInSplit } from './split-open';
import { readFilePreview } from './preview-utils';
import type { NonMarkdownPreviewMode } from './preview-utils';
import { navigateWithJumpSetActive } from '../../workspace/navigate';
import { pickerFileName, pickerFileType } from './display-name';

export function createBuffersSource(
    getNonMarkdownPreview: () => NonMarkdownPreviewMode,
): PickerSource {
    return {
        name: 'buffers',
        placeholder: 'Switch buffers…',
        frecencySource: true,
        displayName: 'Switch buffer',
        icon: 'arrow-left-right',
        description: 'Switch between open editors',
        priority: 2,
        items(app) {
            const items: PickerItem[] = [];
            const activeLeaf = app.workspace.getLeaf(false);
            const rootSplit = app.workspace.rootSplit;
            app.workspace.iterateAllLeaves((leaf) => {
                if (!(leaf.view instanceof FileView)) return;
                if (leaf.getRoot() !== rootSplit) return;
                const file = leaf.view.file;
                const path = file?.path ?? '';
                const basename = file
                    ? pickerFileName(file.path)
                    : '(untitled)';
                const active = leaf === activeLeaf ? '% ' : '';
                items.push({
                    id: path || basename,
                    label: basename,
                    fileType: path ? pickerFileType(path) : undefined,
                    description: `${active}${path}`.trim(),
                    filterValue: `${basename} ${path}`,
                    data: { path },
                });
            });
            return items;
        },
        yankText(item) {
            return (item.data as { path: string }).path;
        },
        onSelect(item, app) {
            const data = item.data as { path: string };
            let target: ReturnType<typeof app.workspace.getLeaf> | null = null;
            const rootSplit = app.workspace.rootSplit;
            app.workspace.iterateAllLeaves((leaf) => {
                if (target) return;
                if (!(leaf.view instanceof FileView)) return;
                if (leaf.getRoot() !== rootSplit) return;
                const path = leaf.view.file?.path ?? '';
                if (path === data.path) target = leaf;
            });
            if (target) {
                navigateWithJumpSetActive(app, target, { focus: true });
            }
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
