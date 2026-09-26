import { describe, it, expect, vi } from 'vitest';
import type { App } from 'obsidian';
import type { Tree, TreeItem } from '@obsidian-typings/obsidian-public-latest';

import {
    COLLAPSIBLE_TREE_VIEW_TYPES,
    INERT_TREE_SHAPED_VIEW_TYPES,
    NAVIGABLE_TREE_VIEW_TYPES,
    getNavigableTree,
    isNavigableTreeViewType,
    moveTreeFocus,
    setFocusedItemCollapsed,
} from '../../../src/workspace/core-view-tree';

type FakeTree = {
    changeFocusedItem: ReturnType<typeof vi.fn>;
    focusedItem: unknown;
};

function makeTree(focusedItem: unknown = null): FakeTree {
    return { changeFocusedItem: vi.fn(), focusedItem };
}

function makeApp(leaves: Record<string, unknown>): App {
    return {
        workspace: {
            getLeavesOfType: (type: string) =>
                type in leaves ? [{ view: leaves[type] }] : [],
        },
    } as unknown as App;
}

describe('core-view-tree', () => {
    describe('view-type allowlist', () => {
        // Pinned to the e2e's own literals. test/specs cannot import a
        // src/**/*.ts module (tsconfig.test.json includes only src/**/*.d.ts,
        // so a value import surfaces the dual-VimApi collision), so the two
        // lists are stated independently and this test keeps them aligned.
        it('declares exactly the measured view types', () => {
            expect({
                navigable: [...NAVIGABLE_TREE_VIEW_TYPES],
                collapsible: [...COLLAPSIBLE_TREE_VIEW_TYPES],
                inert: [...INERT_TREE_SHAPED_VIEW_TYPES],
            }).toEqual({
                navigable: [
                    'file-explorer',
                    'outline',
                    'tag',
                    'all-properties',
                    'bookmarks',
                ],
                collapsible: ['file-explorer', 'outline', 'tag'],
                inert: ['backlink', 'search'],
            });
        });

        it('accepts every measured navigable view type', () => {
            expect(
                NAVIGABLE_TREE_VIEW_TYPES.filter((t) =>
                    isNavigableTreeViewType(t),
                ),
            ).toEqual([...NAVIGABLE_TREE_VIEW_TYPES]);
        });

        it.each(['backlink', 'search'])(
            'rejects %s, whose tree-shaped object does not respond',
            (viewType) => {
                expect(isNavigableTreeViewType(viewType)).toBe(false);
            },
        );

        it('lists collapsible types as a subset of navigable ones', () => {
            const outside = COLLAPSIBLE_TREE_VIEW_TYPES.filter(
                (t) => !isNavigableTreeViewType(t),
            );
            expect(outside).toEqual([]);
        });
    });

    describe('getNavigableTree', () => {
        it('returns the tree for an allowlisted view', () => {
            const tree = makeTree();
            const app = makeApp({ outline: { tree } });
            expect(getNavigableTree(app, 'outline')).toBe(tree);
        });

        it('returns null for a non-allowlisted view even when it has a tree', () => {
            const tree = makeTree();
            const app = makeApp({ backlink: { tree } });
            expect(getNavigableTree(app, 'backlink')).toBeNull();
        });

        it('returns null when the view has no tree', () => {
            const app = makeApp({ outline: {} });
            expect(getNavigableTree(app, 'outline')).toBeNull();
        });

        it('returns null when tree lacks changeFocusedItem', () => {
            const app = makeApp({ outline: { tree: { focusedItem: null } } });
            expect(getNavigableTree(app, 'outline')).toBeNull();
        });

        it('returns null when no leaf of that type is open', () => {
            expect(getNavigableTree(makeApp({}), 'outline')).toBeNull();
        });
    });

    describe('moveTreeFocus', () => {
        it.each([
            [1, 1],
            [3, 3],
            [0, 1],
        ])('applies count %s as %s steps', (count, expected) => {
            const tree = makeTree();
            const applied = moveTreeFocus(
                tree as unknown as Tree<TreeItem>,
                'forwards',
                count,
            );
            expect({
                applied,
                calls: tree.changeFocusedItem.mock.calls.map(([d]) => d),
            }).toEqual({
                applied: expected,
                calls: Array.from({ length: expected }, () => 'forwards'),
            });
        });
    });

    describe('setFocusedItemCollapsed', () => {
        it('collapses a collapsible focused item', () => {
            const setCollapsed = vi.fn(() => Promise.resolve(undefined));
            const tree = makeTree({ setCollapsed });
            expect(
                setFocusedItemCollapsed(
                    tree as unknown as Tree<TreeItem>,
                    true,
                ),
            ).toBe(true);
            expect(setCollapsed).toHaveBeenCalledWith(true);
        });

        it('reports false for a non-collapsible item', () => {
            const tree = makeTree({});
            expect(
                setFocusedItemCollapsed(
                    tree as unknown as Tree<TreeItem>,
                    true,
                ),
            ).toBe(false);
        });

        it('reports false when nothing is focused', () => {
            const tree = makeTree(null);
            expect(
                setFocusedItemCollapsed(
                    tree as unknown as Tree<TreeItem>,
                    true,
                ),
            ).toBe(false);
        });
    });
});
