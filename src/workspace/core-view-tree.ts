import type { App } from 'obsidian';
import type {
    Tree,
    TreeCollapsibleItem,
    TreeItem,
} from '@obsidian-typings/obsidian-public-latest';

import type {
    CollapsibleTreeViewType,
    InertTreeShapedViewType,
    NavigableTreeViewType,
    TreeBackedView,
} from '../types/core-view-trees';

/**
 * Resolution is by allowlist, not by shape: `backlink` and `search` both
 * expose a `changeFocusedItem`-carrying object that never moves focus.
 */
export const NAVIGABLE_TREE_VIEW_TYPES: readonly NavigableTreeViewType[] = [
    'file-explorer',
    'outline',
    'tag',
    'all-properties',
    'bookmarks',
];

export const COLLAPSIBLE_TREE_VIEW_TYPES: readonly CollapsibleTreeViewType[] = [
    'file-explorer',
    'outline',
    'tag',
];

/**
 * Carry a `changeFocusedItem`-shaped object that never moves focus. Listed so
 * the exclusion is reviewable, and so a regression test can assert it.
 */
export const INERT_TREE_SHAPED_VIEW_TYPES: readonly InertTreeShapedViewType[] =
    ['backlink', 'search'];

export function isNavigableTreeViewType(
    viewType: string,
): viewType is NavigableTreeViewType {
    return (NAVIGABLE_TREE_VIEW_TYPES as readonly string[]).includes(viewType);
}

/** The first open leaf's tree for `viewType`, or null when unavailable. */
export function getNavigableTree(
    app: App,
    viewType: string,
): Tree<TreeItem> | null {
    if (!isNavigableTreeViewType(viewType)) return null;
    const view = app.workspace.getLeavesOfType(viewType)[0]?.view as
        TreeBackedView | undefined;
    const tree = view?.tree;
    if (!tree || typeof tree.changeFocusedItem !== 'function') return null;
    return tree;
}

/** Moves focus `count` steps, returning how many steps were applied. */
export function moveTreeFocus(
    tree: Tree<TreeItem>,
    direction: 'backwards' | 'forwards',
    count = 1,
): number {
    const steps = Math.max(count, 1);
    for (let i = 0; i < steps; i++) tree.changeFocusedItem(direction);
    return steps;
}

/**
 * Collapses or expands the focused item. Returns false when the item is not
 * collapsible — `all-properties` and `bookmarks` rows never are.
 */
export function setFocusedItemCollapsed(
    tree: Tree<TreeItem>,
    collapsed: boolean,
): boolean {
    const item = tree.focusedItem as TreeCollapsibleItem | null;
    if (!item || typeof item.setCollapsed !== 'function') return false;
    void item.setCollapsed(collapsed);
    return true;
}
