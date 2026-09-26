import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

import { PAUSE } from '../helpers';

/**
 * Validates `src/types/core-view-trees.d.ts` against a running Obsidian.
 *
 * The declarations are runtime-discovered, so they can drift on any Obsidian
 * release. This spec is the evidence behind them — and the evidence attached
 * to the upstream obsidian-typings request.
 */
const ROOT = 'Core View Trees';
const NOTE = `${ROOT}/Target.md`;

// Restated rather than imported: test/specs cannot value-import a
// src/**/*.ts module. test/unit/workspace/core-view-tree.test.ts pins these
// literals against the source lists.
const NAVIGABLE = [
    'file-explorer',
    'outline',
    'tag',
    'all-properties',
    'bookmarks',
] as const;
const RESULT_DOM = ['backlink', 'search'] as const;
const COLLAPSIBLE = ['file-explorer', 'outline', 'tag'] as const;

type Measured = {
    view: string;
    treeAtViewTree: boolean;
    moves: boolean;
    collapsible: boolean;
};

async function openAndFocus(viewType: string): Promise<void> {
    await browser.executeObsidian(async ({ app }, type: string) => {
        await app.workspace.ensureSideLeaf(type, 'left', {
            active: true,
            reveal: true,
        });
        const leaf = app.workspace.getLeavesOfType(type)[0];
        if (leaf) app.workspace.setActiveLeaf(leaf, { focus: true });
    }, viewType);
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

async function measure(viewType: string): Promise<Measured> {
    return (await browser.executeObsidian(({ app }, type: string) => {
        const view = app.workspace.getLeavesOfType(type)[0]?.view as unknown as
            Record<string, unknown> | undefined;
        const tree = view?.tree as Record<string, unknown> | undefined;
        if (!tree || typeof tree.changeFocusedItem !== 'function') {
            return {
                view: type,
                treeAtViewTree: false,
                moves: false,
                collapsible: false,
            };
        }
        // Call through the property: hoisting the method into a local
        // detaches it from `tree` and it throws on `this.focusedItem`.
        const step = () =>
            (tree.changeFocusedItem as (d: string) => void).call(
                tree,
                'forwards',
            );

        // Compare by object identity. Bookmarks rows render no text, so
        // comparing labels reports "did not move" for a tree that did.
        const before = tree.focusedItem;
        step();
        const after = tree.focusedItem;
        const moves = before !== after;

        // Collapsibility is a property of the items a view can hold, not of
        // whichever row focus happens to land on — a file is not collapsible
        // even in a view whose folders are. Walk a bounded number of rows.
        let collapsible =
            typeof (tree.focusedItem as Record<string, unknown> | null)
                ?.setCollapsed === 'function';
        for (let i = 0; i < 20 && !collapsible; i++) {
            step();
            collapsible =
                typeof (tree.focusedItem as Record<string, unknown> | null)
                    ?.setCollapsed === 'function';
        }

        return { view: type, treeAtViewTree: true, moves, collapsible };
    }, viewType)) as Measured;
}

describe('Core-plugin view trees match their declarations', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        for (const n of ['Target', 'Linker']) {
            await obsidianPage.write(
                `${ROOT}/${n}.md`,
                n === 'Target'
                    ? '#cvt-one\n\n# H1\n\nbody\n\n# H2\n\nmore\n\n# H3\n'
                    : '#cvt-two\n\n[[Target]]\n[[Target|again]]\n',
            );
        }
        await browser.pause(PAUSE.OBSIDIAN_LOAD);
        await browser.executeObsidian(async ({ app }, rootPath: string) => {
            const bm = app.internalPlugins.getEnabledPluginById(
                'bookmarks',
            ) as { instance?: { addItem?: (i: unknown) => void } } | null;
            for (const n of ['Target', 'Linker']) {
                bm?.instance?.addItem?.({
                    type: 'file',
                    path: `${rootPath}/${n}.md`,
                });
            }
        }, ROOT);
        await obsidianPage.openFile(NOTE);
        await browser.pause(PAUSE.EDITOR_SETTLE);
    });

    after(async function () {
        await browser.executeObsidian(async ({ app }, rootPath: string) => {
            const root = app.vault.getAbstractFileByPath(rootPath);
            if (root) await app.vault.delete(root, true);
        }, ROOT);
    });

    for (const view of NAVIGABLE) {
        it(`${view} exposes a navigable tree at view.tree`, async function () {
            await openAndFocus(view);
            const m = await measure(view);
            expect({
                view: m.view,
                treeAtViewTree: m.treeAtViewTree,
                moves: m.moves,
            }).toEqual({ view, treeAtViewTree: true, moves: true });
        });
    }

    for (const view of NAVIGABLE) {
        it(`${view} collapsibility matches the declaration`, async function () {
            await openAndFocus(view);
            const m = await measure(view);
            expect(m.collapsible).toBe(
                (COLLAPSIBLE as readonly string[]).includes(view),
            );
        });
    }

    for (const view of RESULT_DOM) {
        it(`${view} has no view.tree — its results are a ResultDom`, async function () {
            await openAndFocus(view);
            const m = await measure(view);
            // The positive claim: there is no `tree` on these views at all.
            // Their `ResultDom` is a separate interface and is NOT inert —
            // its changeFocusedItem also takes 'forwards'.
            expect(m.treeAtViewTree).toBe(false);
        });
    }
});
