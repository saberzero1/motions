import type { App } from 'obsidian';
import { TFile } from 'obsidian';
import type { SplitDirection } from '../types';
import {
    navigateWithJump,
    navigateWithJumpFile,
} from '../../workspace/navigate';

export function openInSplit(
    app: App,
    path: string,
    direction: SplitDirection,
): void {
    const file = app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
        void navigateWithJump(app, path, '');
        return;
    }

    if (direction === 'tab') {
        const newLeaf = app.workspace.getLeaf('tab');
        void navigateWithJumpFile(app, newLeaf, file);
    } else {
        const activeLeaf = app.workspace.getMostRecentLeaf();
        if (activeLeaf) {
            const newLeaf = app.workspace.createLeafBySplit(
                activeLeaf,
                direction === 'vertical' ? 'vertical' : 'horizontal',
            );
            void navigateWithJumpFile(app, newLeaf, file);
        } else {
            void navigateWithJump(app, path, '');
        }
    }
}
