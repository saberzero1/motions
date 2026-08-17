import { describe, expect, it } from 'vitest';
import { FoldPersistenceStore } from '../../src/fold/persistence';

describe('FoldPersistenceStore — load/save/removePath/renamePath', () => {
    it('starts empty', () => {
        const store = new FoldPersistenceStore();
        const saved = store.save();
        expect(Object.keys(saved)).toHaveLength(0);
    });

    it('loads and round-trips data', () => {
        const store = new FoldPersistenceStore();
        const data = {
            'file.md': { ranges: [{ from: 0, to: 10 }], ts: Date.now() },
        };
        store.load(data);
        const saved = store.save();
        expect(saved['file.md']?.ranges).toEqual([{ from: 0, to: 10 }]);
    });

    it('loads undefined as empty', () => {
        const store = new FoldPersistenceStore();
        store.load(undefined);
        expect(Object.keys(store.save())).toHaveLength(0);
    });

    it('removePath deletes a stored entry', () => {
        const store = new FoldPersistenceStore();
        store.load({
            'a.md': { ranges: [{ from: 0, to: 5 }], ts: Date.now() },
            'b.md': { ranges: [{ from: 0, to: 3 }], ts: Date.now() },
        });
        store.removePath('a.md');
        const saved = store.save();
        expect(saved['a.md']).toBeUndefined();
        expect(saved['b.md']).toBeDefined();
    });

    it('renamePath moves entry from old to new path', () => {
        const store = new FoldPersistenceStore();
        store.load({
            'old.md': { ranges: [{ from: 1, to: 5 }], ts: Date.now() },
        });
        store.renamePath('old.md', 'new.md');
        const saved = store.save();
        expect(saved['old.md']).toBeUndefined();
        expect(saved['new.md']?.ranges).toEqual([{ from: 1, to: 5 }]);
    });

    it('renamePath is a no-op when old path does not exist', () => {
        const store = new FoldPersistenceStore();
        store.load({});
        store.renamePath('nonexistent.md', 'new.md');
        expect(Object.keys(store.save())).toHaveLength(0);
    });

    it('evicts entries older than TTL on save', () => {
        const store = new FoldPersistenceStore();
        const oldTs = Date.now() - 31 * 24 * 60 * 60 * 1000;
        store.load({
            'old.md': { ranges: [{ from: 0, to: 5 }], ts: oldTs },
            'recent.md': { ranges: [{ from: 0, to: 3 }], ts: Date.now() },
        });
        const saved = store.save();
        expect(saved['old.md']).toBeUndefined();
        expect(saved['recent.md']).toBeDefined();
    });

    it('evicts excess entries beyond MAX_ENTRIES (oldest first)', () => {
        const store = new FoldPersistenceStore();
        const data: Record<
            string,
            { ranges: { from: number; to: number }[]; ts: number }
        > = {};
        for (let i = 0; i < 510; i++) {
            data[`file${i}.md`] = {
                ranges: [{ from: 0, to: 1 }],
                ts: Date.now() - (510 - i) * 1000,
            };
        }
        store.load(data);
        const saved = store.save();
        expect(Object.keys(saved).length).toBeLessThanOrEqual(500);
    });
});
