import type { PickerSource } from '../types';
import type { HarpoonStore, HarpoonItem } from '../../vim/harpoon-store';
import { navigateToHarpoonPin } from '../../vim/harpoon-nav';
import { openInSplit } from './split-open';
import { readLinesAroundPosition } from './preview-utils';

interface HarpoonPickerData {
    item: HarpoonItem;
    index: number;
}

export function createHarpoonSource(store: HarpoonStore): PickerSource {
    return {
        name: 'harpoon',
        placeholder: 'Jump to pinned file\u2026',
        displayName: 'Harpoon pins',
        icon: 'anchor',
        description: 'Pinned files for quick access',
        priority: 12,
        items() {
            return store.getAll().map(({ item, index }) => {
                const basename =
                    item.filePath.split('/').pop() ?? item.filePath;
                return {
                    id: `harpoon:${index}`,
                    label: `${index + 1}  ${basename}`,
                    description: item.filePath,
                    filterValue: `${index + 1} ${basename} ${item.filePath}`,
                    data: {
                        item,
                        index,
                    } satisfies HarpoonPickerData,
                };
            });
        },
        onSelect(pickerItem, app) {
            const { item } = pickerItem.data as HarpoonPickerData;
            void navigateToHarpoonPin(app, item);
        },
        onSelectSplit(pickerItem, app, direction) {
            const { item } = pickerItem.data as HarpoonPickerData;
            openInSplit(app, item.filePath, direction);
        },
        async preview(pickerItem, app) {
            const { item } = pickerItem.data as HarpoonPickerData;
            return readLinesAroundPosition(app, item.filePath, item.row);
        },
    };
}
