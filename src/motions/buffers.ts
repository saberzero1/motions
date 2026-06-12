import { MarkdownView } from 'obsidian';
import type { App } from 'obsidian';
import type { ActionFn } from '../types/vim-api';

function getMarkdownLeaves(
    app: App,
): ReturnType<typeof app.workspace.getLeaf>[] {
    const leaves: ReturnType<typeof app.workspace.getLeaf>[] = [];
    app.workspace.iterateAllLeaves((leaf) => {
        if (leaf.view.getViewType() === 'markdown') {
            leaves.push(leaf);
        }
    });
    return leaves;
}

function createBufferNavAction(app: App, direction: 1 | -1): ActionFn {
    return (_cm, actionArgs) => {
        const repeat = actionArgs.repeat ?? 1;
        const leaves = getMarkdownLeaves(app);
        if (leaves.length === 0) return;

        const activeLeaf = app.workspace.getLeaf(false);
        const currentIdx = leaves.indexOf(activeLeaf);

        if (leaves.length <= 1 && currentIdx >= 0) {
            const recentFiles = app.workspace.getLastOpenFiles();
            const currentPath = (activeLeaf.view as MarkdownView).file?.path;
            const nextRecent = recentFiles.find(
                (p) => p !== currentPath && p.endsWith('.md'),
            );
            if (nextRecent) {
                void app.workspace.openLinkText(nextRecent, '', false);
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
            app.workspace.setActiveLeaf(target, { focus: true });
        }
    };
}

export const nextBuffer = (app: App): ActionFn => createBufferNavAction(app, 1);
export const prevBuffer = (app: App): ActionFn =>
    createBufferNavAction(app, -1);
