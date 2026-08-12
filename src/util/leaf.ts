import type { View, WorkspaceLeaf } from 'obsidian';

export function getLeafId(leaf: WorkspaceLeaf): string {
    return leaf.id ?? '';
}

export function isLeafPinned(leaf: WorkspaceLeaf): boolean {
    return leaf.pinned ?? false;
}

export function getViewFilePath(view: View): string | null {
    return (view as unknown as { file?: { path?: string } }).file?.path ?? null;
}

export function getViewFileBasename(view: View): string | null {
    return (
        (view as unknown as { file?: { basename?: string } }).file?.basename ??
        null
    );
}
