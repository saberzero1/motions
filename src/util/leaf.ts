import { FileView, type View, type WorkspaceLeaf } from 'obsidian';

export function getLeafId(leaf: WorkspaceLeaf): string {
    return leaf.id;
}

export function isLeafPinned(leaf: WorkspaceLeaf): boolean {
    return leaf.pinned;
}

export function getViewFilePath(view: View): string | null {
    if (view instanceof FileView) {
        return view.file?.path ?? null;
    }
    return null;
}

export function getViewFileBasename(view: View): string | null {
    if (view instanceof FileView) {
        return view.file?.basename ?? null;
    }
    return null;
}
