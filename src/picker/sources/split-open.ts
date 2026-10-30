import type { App } from 'obsidian';
import { TFile } from 'obsidian';
import type { SplitDirection } from '../types';
import {
    navigateWithJump,
    navigateWithJumpFile,
} from '../../workspace/navigate';

/**
 * Opens `path` in a new tab or split. A `position` is applied once the open
 * has finished, in the leaf it opened — not on a timer to whichever view is
 * active by then, which a slow open lost to (#201).
 */
export function openInSplit(
    app: App,
    path: string,
    direction: SplitDirection,
    position?: { line: number; ch: number },
): void {
    const file = app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
        void navigateWithJump(app, path, '', position);
        return;
    }

    if (direction === 'tab') {
        const newLeaf = app.workspace.getLeaf('tab');
        void navigateWithJumpFile(app, newLeaf, file, position);
    } else {
        const activeLeaf = app.workspace.getMostRecentLeaf();
        if (activeLeaf) {
            const newLeaf = app.workspace.createLeafBySplit(
                activeLeaf,
                direction === 'vertical' ? 'vertical' : 'horizontal',
            );
            void navigateWithJumpFile(app, newLeaf, file, position);
        } else {
            void navigateWithJump(app, path, '', position);
        }
    }
}
