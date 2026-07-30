import { describe, it, expect, vi } from 'vitest';
import type { App } from 'obsidian';

vi.mock('../../src/workspace/navigation', () => ({
    executeCommand: vi.fn(),
}));
vi.mock('../../src/ui/global-ex-command', () => ({
    GlobalExCommandModal: vi.fn(),
}));
vi.mock('../../src/vim/options', () => ({
    isJumpListEnabled: () => false,
}));

import {
    GlobalMappingRegistry,
    type GlobalMapAction,
} from '../../src/workspace/global-mapping-registry';
import { registerDefaultGlobalMappings } from '../../src/workspace/global-defaults';
import { executeCommand } from '../../src/workspace/navigation';

interface MockLeaf {
    id: string;
    root: unknown;
    getRoot: () => unknown;
    view: { getViewType: () => string };
}

function makeMockApp(leaves: MockLeaf[]) {
    const activated: string[] = [];
    const rootSplit = { type: 'root' };

    const app = {
        workspace: {
            rootSplit,
            iterateAllLeaves: (cb: (leaf: MockLeaf) => void) => {
                for (const leaf of leaves) cb(leaf);
            },
            setActiveLeaf: (leaf: MockLeaf, _opts: unknown) => {
                activated.push(leaf.id);
            },
        },
    } as unknown as App;

    return { app, activated, rootSplit };
}

function makeLeaf(id: string, root: unknown): MockLeaf {
    return {
        id,
        root,
        getRoot: () => root,
        view: { getViewType: () => 'markdown' },
    };
}

function getGtAction(registry: GlobalMappingRegistry): GlobalMapAction {
    const entries = registry.getAllEntries();
    const gt = entries.find((e) => e.keys === 'gt');
    if (!gt) throw new Error('gt mapping not found');
    return gt.action;
}

describe('gotoNthTab (via gt mapping)', () => {
    it('skips sidebar leaves and activates correct root tab', () => {
        const { app, activated, rootSplit } = makeMockApp([]);
        const sidebar = { type: 'sidebar' };

        const leaves = [
            makeLeaf('sidebar-1', sidebar),
            makeLeaf('tab-1', rootSplit),
            makeLeaf('tab-2', rootSplit),
            makeLeaf('sidebar-2', sidebar),
            makeLeaf('tab-3', rootSplit),
        ];

        const appWithLeaves = {
            ...app,
            workspace: {
                ...(app.workspace as Record<string, unknown>),
                iterateAllLeaves: (cb: (leaf: MockLeaf) => void) => {
                    for (const leaf of leaves) cb(leaf);
                },
                setActiveLeaf: (leaf: MockLeaf) => {
                    activated.push(leaf.id);
                },
            },
        } as unknown as App;

        const registry = new GlobalMappingRegistry();
        registerDefaultGlobalMappings(registry, appWithLeaves, null);
        const action = getGtAction(registry);

        if (action.type !== 'builtin') throw new Error('expected builtin');
        action.fn(appWithLeaves, 2);

        expect(activated).toEqual(['tab-2']);
    });

    it('activates first root tab for count=1', () => {
        const rootSplit = { type: 'root' };
        const sidebar = { type: 'sidebar' };
        const activated: string[] = [];

        const leaves = [
            makeLeaf('sidebar-1', sidebar),
            makeLeaf('tab-1', rootSplit),
            makeLeaf('tab-2', rootSplit),
        ];

        const app = {
            workspace: {
                rootSplit,
                iterateAllLeaves: (cb: (leaf: MockLeaf) => void) => {
                    for (const leaf of leaves) cb(leaf);
                },
                setActiveLeaf: (leaf: MockLeaf) => {
                    activated.push(leaf.id);
                },
            },
        } as unknown as App;

        const registry = new GlobalMappingRegistry();
        registerDefaultGlobalMappings(registry, app, null);
        const action = getGtAction(registry);

        if (action.type !== 'builtin') throw new Error('expected builtin');
        action.fn(app, 1);

        expect(activated).toEqual(['tab-1']);
    });

    it('does nothing when count exceeds root tab count', () => {
        const rootSplit = { type: 'root' };
        const activated: string[] = [];

        const leaves = [
            makeLeaf('tab-1', rootSplit),
            makeLeaf('tab-2', rootSplit),
        ];

        const app = {
            workspace: {
                rootSplit,
                iterateAllLeaves: (cb: (leaf: MockLeaf) => void) => {
                    for (const leaf of leaves) cb(leaf);
                },
                setActiveLeaf: (leaf: MockLeaf) => {
                    activated.push(leaf.id);
                },
            },
        } as unknown as App;

        const registry = new GlobalMappingRegistry();
        registerDefaultGlobalMappings(registry, app, null);
        const action = getGtAction(registry);

        if (action.type !== 'builtin') throw new Error('expected builtin');
        action.fn(app, 5);

        expect(activated).toEqual([]);
    });

    it('calls workspace:next-tab when count=0 (no count typed)', () => {
        const rootSplit = { type: 'root' };
        const app = {
            workspace: {
                rootSplit,
                iterateAllLeaves: () => {},
                setActiveLeaf: () => {},
            },
        } as unknown as App;

        const registry = new GlobalMappingRegistry();
        registerDefaultGlobalMappings(registry, app, null);
        const action = getGtAction(registry);

        if (action.type !== 'builtin') throw new Error('expected builtin');
        action.fn(app, 0);

        expect(executeCommand).toHaveBeenCalledWith(app, 'workspace:next-tab');
    });
});
