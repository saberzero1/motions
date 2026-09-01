import { StateField, StateEffect } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { Tree } from 'web-tree-sitter';

const viewTrees = new WeakMap<EditorView, Tree>();

export const setTreeEffect = StateEffect.define<Tree | null>();

export const treeSitterTreeField = StateField.define<Tree | null>({
    create: () => null,
    update: (value, tr) => {
        for (const effect of tr.effects) {
            if (effect.is(setTreeEffect)) return effect.value;
        }
        return value;
    },
});

export function setTreeForView(view: EditorView, tree: Tree): void {
    viewTrees.set(view, tree);
}

export function deleteTreeForView(view: EditorView): void {
    viewTrees.delete(view);
}

export function getTreeForView(view: EditorView): Tree | null {
    return viewTrees.get(view) ?? null;
}

export function hasTreeForView(view: EditorView): boolean {
    return viewTrees.has(view);
}
