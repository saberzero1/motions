import { describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', () => ({
    App: class {},
    Modal: class {
        open() {}
    },
}));

import { WORKSPACE_NAV_CONFLICTS } from '../../src/workspace/hotkey-conflicts';
import { HOTKEY_COLLISIONS } from '../fixtures/hotkey-collisions';

/**
 * The collision table that `hotkey-collisions.e2e.ts` enforces names the
 * keys the conflict check must cover; the spec cannot import `src/`, so the
 * two are pinned here.
 */

const asConflictKey = (hotkey: string): string =>
    hotkey.replace(/^Mod\+/, 'Ctrl+');

describe('hotkey collision table', () => {
    it('lists exactly the conflict check’s keys as conflict-check', () => {
        const fromTable = HOTKEY_COLLISIONS.filter(
            (c) => c.resolution === 'conflict-check',
        )
            .map((c) => `${asConflictKey(c.hotkey)} ${c.commandId}`)
            .sort();
        const fromCheck = WORKSPACE_NAV_CONFLICTS.map(
            (c) => `${c.key} ${c.commandId}`,
        ).sort();

        expect(fromTable).toEqual(fromCheck);
    });

    it('gives every row a reason and lists each hotkey once', () => {
        const hotkeys = HOTKEY_COLLISIONS.map((c) => c.hotkey);

        expect(new Set(hotkeys).size).toBe(hotkeys.length);
        expect(HOTKEY_COLLISIONS.filter((c) => !c.reason.trim())).toEqual([]);
    });
});
