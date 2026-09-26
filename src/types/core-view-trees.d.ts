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
 * | `backlink`       | `view.backlink.backlinkDom`   | n/a   | n/a         |
 * | `search`         | `view.dom`                    | n/a   | n/a         |
 *
 * The last two rows carry a **`ResultDom`**, not a `Tree`. It is a distinct
 * interface that happens to share the method name, and duck-typing finds it:
 * resolve a tree by allowlist, never by shape.
 *
 * `ResultDom.changeFocusedItem` is **not** inert. obsidian-typings declares it
 * `(arg1: unknown)`, but the shipped function branches on `"forwards" === e`
 * exactly as `Tree`'s does, and on `search` it moved focus from `null` to the
 * first result. An earlier probe reported "never moves" because it read
 * `focusedItem.selfEl` — `TreeItem` exposes `selfEl`, `ResultDom` items expose
 * `el`, so the label was `null` both times. The exclusion here is about the
 * two interfaces being different, not about one of them being dead.
 *
 * `backlink` is unverified: its view rendered no rows in two attempts, so its
 * `ResultDom` was never exercised. It is the same interface as `search`'s with
 * an identical function body, which is inference, not measurement.
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
 * View types whose results live in a `ResultDom` rather than a `Tree`.
 * Declared so the exclusion is reviewable rather than folklore.
 */
export type ResultDomViewType = 'backlink' | 'search';
