import type { EditorView } from '@codemirror/view';
import type { Tree } from 'web-tree-sitter';

const viewTrees = new WeakMap<EditorView, Tree>();

export function setTreeForView(view: EditorView, tree: Tree): void {
    viewTrees.set(view, tree);
}

export function deleteTreeForView(view: EditorView): void {
    viewTrees.delete(view);
}

export function getTreeForView(view: EditorView): Tree | null {
    return viewTrees.get(view) ?? null;
}
