import { describe, it, expect } from 'vitest';
import {
    LuaModuleSnapshot,
    MAX_MODULE_BYTES,
    MAX_MODULE_FILES,
    type SnapshotAdapter,
} from '../../../src/lua/module-snapshot';

function fakeVault(tree: Record<string, string>): SnapshotAdapter {
    return {
        list: async (dir) => {
            const prefix = dir.endsWith('/') ? dir : `${dir}/`;
            const files: string[] = [];
            const folders = new Set<string>();
            for (const path of Object.keys(tree)) {
                if (!path.startsWith(prefix)) continue;
                const rest = path.slice(prefix.length);
                const slash = rest.indexOf('/');
                if (slash === -1) files.push(path);
                else folders.add(prefix + rest.slice(0, slash));
            }
            return { files, folders: [...folders] };
        },
        read: async (path) => {
            const v = tree[path];
            if (v === undefined) throw new Error(`missing ${path}`);
            return v;
        },
    };
}

describe('LuaModuleSnapshot', () => {
    it('indexes lua files by vault-relative path', async () => {
        const snap = new LuaModuleSnapshot();
        await snap.rebuild(
            fakeVault({
                'lua/foo.lua': 'return 1',
                'lua/bar/init.lua': 'return 2',
            }),
        );
        expect(snap.get('lua/foo.lua')).toBe('return 1');
        expect(snap.get('lua/bar/init.lua')).toBe('return 2');
        expect(snap.has('lua/nope.lua')).toBe(false);
        expect(snap.getStats().files).toBe(2);
    });

    it('walks nested directories', async () => {
        const snap = new LuaModuleSnapshot();
        await snap.rebuild(
            fakeVault({
                'lua/flash/init.lua': 'a',
                'lua/flash/search/init.lua': 'b',
                'lua/flash/search/pos.lua': 'c',
                'lua/flash/plugins/char.lua': 'd',
            }),
        );
        expect(snap.getStats().files).toBe(4);
        expect(snap.get('lua/flash/search/pos.lua')).toBe('c');
    });

    it('ignores non-lua files and dot-directories', async () => {
        const snap = new LuaModuleSnapshot();
        await snap.rebuild(
            fakeVault({
                'lua/keep.lua': 'x',
                'lua/notes.md': 'x',
                'lua/.staging/tmp.lua': 'x',
                'lua/.plugin-lock.json': 'x',
            }),
        );
        expect(snap.getStats().files).toBe(1);
        expect(snap.has('lua/.staging/tmp.lua')).toBe(false);
    });

    it('reports an oversized file as skipped rather than dropping it', async () => {
        const snap = new LuaModuleSnapshot();
        await snap.rebuild(
            fakeVault({
                'lua/small.lua': 'ok',
                'lua/huge.lua': 'x'.repeat(MAX_MODULE_BYTES + 1),
            }),
        );
        expect(snap.has('lua/small.lua')).toBe(true);
        expect(snap.has('lua/huge.lua')).toBe(false);
        const skipped = snap.getStats().skipped;
        expect(skipped).toHaveLength(1);
        expect(skipped[0]!.path).toBe('lua/huge.lua');
        expect(skipped[0]!.reason).toContain('exceeds');
    });

    it('reports an unreadable file as skipped', async () => {
        const adapter = fakeVault({ 'lua/a.lua': 'x', 'lua/b.lua': 'y' });
        const failing: SnapshotAdapter = {
            list: adapter.list,
            read: async (p) => {
                if (p === 'lua/b.lua') throw new Error('io');
                return adapter.read(p);
            },
        };
        const snap = new LuaModuleSnapshot();
        await snap.rebuild(failing);
        expect(snap.has('lua/a.lua')).toBe(true);
        expect(snap.getStats().skipped).toEqual([
            { path: 'lua/b.lua', reason: 'unreadable' },
        ]);
    });

    it('caps the file count and reports the overflow', async () => {
        const tree: Record<string, string> = {};
        for (let i = 0; i < MAX_MODULE_FILES + 5; i++) {
            tree[`lua/m${i}.lua`] = 'x';
        }
        const snap = new LuaModuleSnapshot();
        await snap.rebuild(fakeVault(tree));
        expect(snap.getStats().files).toBe(MAX_MODULE_FILES);
        expect(snap.getStats().skipped).toHaveLength(5);
    });

    it('swaps atomically, leaving no partial state on rebuild', async () => {
        const snap = new LuaModuleSnapshot();
        await snap.rebuild(fakeVault({ 'lua/old.lua': '1' }));
        expect(snap.has('lua/old.lua')).toBe(true);

        await snap.rebuild(fakeVault({ 'lua/new.lua': '2' }));
        expect(snap.has('lua/old.lua')).toBe(false);
        expect(snap.get('lua/new.lua')).toBe('2');
        expect(snap.getStats().files).toBe(1);
    });

    it('survives a listing failure without corrupting the previous snapshot', async () => {
        const snap = new LuaModuleSnapshot();
        await snap.rebuild(fakeVault({ 'lua/a.lua': '1' }));
        await snap.rebuild({
            list: async () => {
                throw new Error('vault gone');
            },
            read: async () => '',
        });
        // The walk yields nothing, so the snapshot is empty rather than stale.
        expect(snap.getStats().files).toBe(0);
        expect(snap.has('lua/a.lua')).toBe(false);
    });

    it('clear() empties both sources and stats', async () => {
        const snap = new LuaModuleSnapshot();
        await snap.rebuild(fakeVault({ 'lua/a.lua': '1' }));
        snap.clear();
        expect(snap.getStats()).toEqual({ files: 0, bytes: 0, skipped: [] });
        expect(snap.has('lua/a.lua')).toBe(false);
    });
});
