import type { EditorView } from '@codemirror/view';
import type { Node, Tree } from 'web-tree-sitter';
import { getTreeForView } from './tree-state';

export function getTree(view: EditorView): Tree | null {
    return getTreeForView(view);
}

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

export function getNamedNodeAtPosition(
    view: EditorView,
    row: number,
    col: number,
): Node | null {
    const root = getRootNode(view);
    if (!root) return null;
    return root.namedDescendantForPosition({ row, column: col });
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

export function isInsideNodeType(
    view: EditorView,
    row: number,
    col: number,
    type: string,
): boolean {
    const node = getNodeAtPosition(view, row, col);
    if (!node) return false;
    if (node.type === type) return true;
    return hasAncestorOfType(node, type);
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

export type ScanDirection = 'forward' | 'backward';

export function findNextNodeOfType(
    view: EditorView,
    row: number,
    col: number,
    type: string | string[],
    direction: ScanDirection,
): Node | null {
    const root = getRootNode(view);
    if (!root) return null;

    const types = Array.isArray(type) ? type : [type];
    const cursor = root.walk();
    const results: Node[] = [];

    let moved = cursor.gotoFirstChild();
    while (moved) {
        collectNodesOfType(cursor, types, results);
        moved = cursor.gotoNextSibling();
    }

    if (direction === 'forward') {
        for (const n of results) {
            const sp = n.startPosition;
            if (sp.row > row || (sp.row === row && sp.column > col)) return n;
        }
    } else {
        for (let i = results.length - 1; i >= 0; i--) {
            const n = results[i]!;
            const sp = n.startPosition;
            if (sp.row < row || (sp.row === row && sp.column < col)) return n;
        }
    }

    return null;
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
let _queryModule: typeof import('./query') | null = null;

export function setJsApiModules(
    runtime: typeof import('./runtime'),
    query: typeof import('./query'),
): void {
    _runtimeModule = runtime;
    _queryModule = query;
}

export function queryCaptures(
    view: EditorView,
    querySource: string,
    lang = 'markdown',
): Array<{ name: string; node: Node }> {
    const tree = getTreeForView(view);
    if (!tree || !_runtimeModule || !_queryModule) return [];

    const language = _runtimeModule.getLanguage(lang);
    if (!language) return [];

    const docText = view.state.doc.toString();

    try {
        const wrapper = new _queryModule.QueryWrapper(language, querySource);
        const captures = wrapper.iterCaptures(tree.rootNode, docText);
        const result = captures.map((c) => ({
            name: c.captureName,
            node: c.node,
        }));
        wrapper.delete();
        return result;
    } catch {
        return [];
    }
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

export function getNodeText(view: EditorView, node: Node): string {
    return view.state.doc.sliceString(node.startIndex, node.endIndex);
}
