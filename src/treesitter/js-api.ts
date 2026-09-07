import type { EditorView } from '@codemirror/view';
import type { Node } from 'web-tree-sitter';
import { getTreeForView } from './tree-state';

export function getRootNode(view: EditorView): Node | null {
    return getTreeForView(view)?.rootNode ?? null;
}

export function getNodeAtPosition(
    view: EditorView,
    row: number,
    col: number,
): Node | null {
    const root = getRootNode(view);
    if (!root) return null;
    return root.descendantForPosition({ row, column: col });
}

export function hasAncestorOfType(node: Node, type: string): boolean {
    let current: Node | null = node.parent;
    while (current) {
        if (current.type === type) return true;
        current = current.parent;
    }
    return false;
}

export function findAncestorOfType(node: Node, type: string): Node | null {
    let current: Node | null = node.parent;
    while (current) {
        if (current.type === type) return current;
        current = current.parent;
    }
    return null;
}

export function findContainingNodeOfType(
    view: EditorView,
    row: number,
    col: number,
    type: string,
): Node | null {
    const node = getNodeAtPosition(view, row, col);
    if (!node) return null;
    if (node.type === type) return node;
    return findAncestorOfType(node, type);
}

function collectNodesOfType(
    cursor: ReturnType<Node['walk']>,
    types: string[],
    results: Node[],
): void {
    const node = cursor.currentNode;
    if (types.includes(node.type)) {
        results.push(node);
    }
    let moved = cursor.gotoFirstChild();
    while (moved) {
        collectNodesOfType(cursor, types, results);
        moved = cursor.gotoNextSibling();
    }
    cursor.gotoParent();
}

export function getAllNodesOfType(
    view: EditorView,
    type: string | string[],
): Node[] {
    const root = getRootNode(view);
    if (!root) return [];

    const types = Array.isArray(type) ? type : [type];
    const results: Node[] = [];
    const cursor = root.walk();

    let moved = cursor.gotoFirstChild();
    while (moved) {
        collectNodesOfType(cursor, types, results);
        moved = cursor.gotoNextSibling();
    }

    return results;
}

let _runtimeModule: typeof import('./runtime') | null = null;

export function setJsApiModules(runtime: typeof import('./runtime')): void {
    _runtimeModule = runtime;
}

export function isTreeAvailable(view: EditorView): boolean {
    return getTreeForView(view) !== null;
}

export function getInlineNodeAtPosition(
    view: EditorView,
    row: number,
    col: number,
): Node | null {
    const tree = getTreeForView(view);
    if (!tree || !_runtimeModule) return null;
    const docText = view.state.doc.toString();
    return _runtimeModule.getInlineNodeAtPosition(tree, docText, row, col);
}

export function findContainingInlineNodeOfType(
    view: EditorView,
    row: number,
    col: number,
    type: string,
): Node | null {
    const node = getInlineNodeAtPosition(view, row, col);
    if (!node) return null;
    if (node.type === type) return node;
    let current: Node | null = node.parent;
    while (current) {
        if (current.type === type) return current;
        current = current.parent;
    }
    return null;
}

export function isInsideInlineNodeType(
    view: EditorView,
    row: number,
    col: number,
    type: string,
): boolean {
    return findContainingInlineNodeOfType(view, row, col, type) !== null;
}
