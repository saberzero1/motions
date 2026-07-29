import { describe, it, expect, vi } from 'vitest';

vi.mock('obsidian', () => ({
    App: class {},
    Modal: class {
        open() {}
    },
}));

import {
    WORKSPACE_NAV_CONFLICTS,
    type HotkeyConflict,
} from '../../src/workspace/hotkey-conflicts';

function filterConflicts(hotkeys: Record<string, unknown[]>): HotkeyConflict[] {
    return WORKSPACE_NAV_CONFLICTS.filter((conflict) => {
        const entry = hotkeys[conflict.commandId];
        if (entry === undefined) return true;
        if (Array.isArray(entry) && entry.length === 0) return false;
        return true;
    });
}

describe('WORKSPACE_NAV_CONFLICTS', () => {
    it('has 4 conflict entries', () => {
        expect(WORKSPACE_NAV_CONFLICTS).toHaveLength(4);
    });

    it('includes workspace:close for Ctrl+W', () => {
        const entry = WORKSPACE_NAV_CONFLICTS.find(
            (c) => c.commandId === 'workspace:close',
        );
        expect(entry).toBeDefined();
        expect(entry!.key).toBe('Ctrl+W');
    });

    it('includes editor:open-search for Ctrl+F', () => {
        const entry = WORKSPACE_NAV_CONFLICTS.find(
            (c) => c.commandId === 'editor:open-search',
        );
        expect(entry).toBeDefined();
        expect(entry!.key).toBe('Ctrl+F');
    });
});

describe('conflict detection logic', () => {
    it('all defaults active when hotkeys.json is empty', () => {
        const conflicts = filterConflicts({});
        expect(conflicts).toHaveLength(4);
    });

    it('no conflicts when all commands have empty arrays', () => {
        const conflicts = filterConflicts({
            'workspace:close': [],
            'editor:delete-paragraph': [],
            'editor:open-search': [],
            'editor:toggle-bold': [],
        });
        expect(conflicts).toHaveLength(0);
    });

    it('partial conflicts when some are unbound', () => {
        const conflicts = filterConflicts({
            'workspace:close': [],
            'editor:toggle-bold': [],
        });
        expect(conflicts).toHaveLength(2);
        expect(conflicts.map((c) => c.commandId)).toContain(
            'editor:delete-paragraph',
        );
        expect(conflicts.map((c) => c.commandId)).toContain(
            'editor:open-search',
        );
    });

    it('custom binding (non-empty array) counts as conflict', () => {
        const conflicts = filterConflicts({
            'workspace:close': [{ modifiers: ['Ctrl'], key: 'W' }],
            'editor:delete-paragraph': [],
            'editor:open-search': [],
            'editor:toggle-bold': [],
        });
        expect(conflicts).toHaveLength(1);
        expect(conflicts[0]!.commandId).toBe('workspace:close');
    });

    it('unrelated keys in hotkeys.json do not affect detection', () => {
        const conflicts = filterConflicts({
            'some:other-command': [],
            'workspace:close': [],
            'editor:delete-paragraph': [],
            'editor:open-search': [],
            'editor:toggle-bold': [],
        });
        expect(conflicts).toHaveLength(0);
    });
});
