import { FileView } from 'obsidian';
import type { App } from 'obsidian';
import type { ActionFn } from '../types/vim-api';
import {
    navigateWithJump,
    navigateWithJumpSetActive,
} from '../workspace/navigate';
import { getViewFilePath } from '../util/leaf';

function getFileLeaves(app: App): ReturnType<typeof app.workspace.getLeaf>[] {
    const rootSplit = app.workspace.rootSplit;
    const leaves: ReturnType<typeof app.workspace.getLeaf>[] = [];
    app.workspace.iterateAllLeaves((leaf) => {
        if (leaf.view instanceof FileView && leaf.getRoot() === rootSplit) {
            leaves.push(leaf);
        }
    });
    return leaves;
}

function createBufferNavAction(app: App, direction: 1 | -1): ActionFn {
    return (_cm, actionArgs) => {
        const repeat = actionArgs.repeat ?? 1;
        const leaves = getFileLeaves(app);
        if (leaves.length === 0) return;

        const activeLeaf = app.workspace.getLeaf(false);
        const currentIdx = leaves.indexOf(activeLeaf);

        if (leaves.length <= 1 && currentIdx >= 0) {
            const recentFiles = app.workspace.getLastOpenFiles();
            const currentPath = getViewFilePath(activeLeaf.view);
            const nextRecent = recentFiles.find((p) => p !== currentPath);
            if (nextRecent) {
                void navigateWithJump(app, nextRecent, '');
            }
            return;
        }

        const targetIdx =
            (currentIdx +
                ((direction * repeat) % leaves.length) +
                leaves.length) %
            leaves.length;
        const target = leaves[targetIdx];
        if (target) {
            navigateWithJumpSetActive(app, target, { focus: true });
        }
    };
}

export const nextBuffer = (app: App): ActionFn => createBufferNavAction(app, 1);
export const prevBuffer = (app: App): ActionFn =>
    createBufferNavAction(app, -1);
