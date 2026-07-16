import { type App, MarkdownView, TFile, Notice } from 'obsidian';
import type { HarpoonItem } from './harpoon-store';
import {
    navigateWithJumpFile,
    navigateWithJumpSetActive,
} from '../workspace/navigate';

export async function navigateToHarpoonPin(
    app: App,
    item: HarpoonItem,
): Promise<void> {
    const file = app.vault.getAbstractFileByPath(item.filePath);
    if (!(file instanceof TFile)) {
        new Notice(`File not found: ${item.filePath}`);
        return;
    }

    let targetLeaf: ReturnType<typeof app.workspace.getLeaf> | null = null;
    app.workspace.iterateAllLeaves((leaf) => {
        if (
            !targetLeaf &&
            leaf.view instanceof MarkdownView &&
            leaf.view.file?.path === item.filePath
        ) {
            targetLeaf = leaf;
        }
    });

    if (targetLeaf) {
        navigateWithJumpSetActive(app, targetLeaf, { focus: true });
    } else {
        const leaf = app.workspace.getLeaf(false);
        await navigateWithJumpFile(app, leaf, file);
    }

    await new Promise((resolve) => window.setTimeout(resolve, 50));

    const view = app.workspace.getActiveViewOfType(MarkdownView);
    if (view && view.file?.path === item.filePath) {
        const maxLine = view.editor.lineCount() - 1;
        const line = Math.min(item.row, maxLine);
        const maxCol = view.editor.getLine(line).length;
        const col = Math.min(item.col, maxCol);
        view.editor.setCursor(line, col);
        view.editor.focus();
    }
}
