import type { Tree, TreeItem } from '@obsidian-typings/obsidian-public-latest';
import type { View } from 'obsidian';

/**
 * Runtime-discovered typings for the `tree` property on Obsidian's
 * tree-backed core-plugin views.
 *
 * obsidian-typings (1.13.7) declares `Tree<T extends TreeItem>`,
 * `TreeItem` and `TreeCollapsibleItem`, but attaches `tree` to
 * `FileExplorerView` only. Five core views own an equivalent `Tree` at
 * runtime; four of them are undeclared upstream.
 *
 * Obsidian version: 1.13.7 (measured via e2e probe — for each view the
 * probe located the tree, called `changeFocusedItem('forwards')` twice and
 * recorded `focusedItem`).
 *
 * Measured, per view:
 *
 * | View             | Path                          | Moves | Collapsible |
 * | ---------------- | ----------------------------- | ----- | ----------- |
 * | `file-explorer`  | `view.tree` (typed upstream)  | yes   | yes         |
 * | `outline`        | `view.tree`                   | yes   | yes         |
 * | `tag`            | `view.tree`                   | yes   | yes         |
 * | `all-properties` | `view.tree`                   | yes   | no          |
 * | `bookmarks`      | `view.tree`                   | yes   | no          |
 * | `backlink`       | `view.backlink.backlinkDom`   | NO    | no          |
 * | `search`         | `view.dom`                    | NO    | no          |
 *
 * The last two rows are the reason this file exists as an allowlist rather
 * than a structural check: both expose an object carrying
 * `changeFocusedItem`, so duck-typing finds them and then silently does
 * nothing. Never resolve a tree by shape alone.
 */

/** A core-plugin view that owns a navigable `Tree` at runtime. */
export interface TreeBackedView extends View {
    tree: Tree<TreeItem>;
}

/**
 * View types whose `tree.changeFocusedItem()` was measured to move
 * `focusedItem`. Membership is empirical; do not extend without measuring.
 */
export type NavigableTreeViewType =
    'file-explorer' | 'outline' | 'tag' | 'all-properties' | 'bookmarks';

/**
 * Navigable view types whose focused item was measured to implement
 * `TreeCollapsibleItem.setCollapsed` — i.e. where expand/collapse applies.
 */
export type CollapsibleTreeViewType = 'file-explorer' | 'outline' | 'tag';

/**
 * View types carrying a `changeFocusedItem`-shaped object that does **not**
 * respond. Declared so the exclusion is reviewable rather than folklore.
 */
export type InertTreeShapedViewType = 'backlink' | 'search';
