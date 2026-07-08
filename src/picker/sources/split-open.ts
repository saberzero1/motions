import type { App } from 'obsidian';
import { TFile } from 'obsidian';
import type { SplitDirection } from '../types';

export function openInSplit(
    app: App,
    path: string,
    direction: SplitDirection,
): void {
    const file = app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
        void app.workspace.openLinkText(path, '');
        return;
    }

    if (direction === 'tab') {
        const newLeaf = app.workspace.getLeaf('tab');
        void newLeaf.openFile(file, { active: true });
    } else {
        const activeLeaf = app.workspace.getMostRecentLeaf();
        if (activeLeaf) {
            const newLeaf = app.workspace.createLeafBySplit(
                activeLeaf,
                direction === 'vertical' ? 'vertical' : 'horizontal',
            );
            void newLeaf.openFile(file, { active: true });
        } else {
            void app.workspace.openLinkText(path, '');
        }
    }
}
