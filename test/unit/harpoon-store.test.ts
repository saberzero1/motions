import { describe, expect, it, beforeEach } from 'vitest';
import { HarpoonStore } from '../../src/vim/harpoon-store';

describe('HarpoonStore', () => {
    let store: HarpoonStore;

    beforeEach(() => {
        store = new HarpoonStore();
    });

    describe('add()', () => {
        it('returns slot index for new pin', () => {
            const idx = store.add('foo.md', 0, 0);
            expect(idx).toBe(0);
        });

        it('returns existing index for duplicate', () => {
            store.add('foo.md', 0, 0);
            const idx = store.add('foo.md', 5, 3);
            expect(idx).toBe(0);
        });

        it('appends sequential pins', () => {
            expect(store.add('a.md', 0, 0)).toBe(0);
            expect(store.add('b.md', 0, 0)).toBe(1);
            expect(store.add('c.md', 0, 0)).toBe(2);
        });

        it('fills first null slot in sparse array', () => {
            store.add('a.md', 0, 0);
            store.add('b.md', 0, 0);
            store.add('c.md', 0, 0);
            store.remove(1);
            const idx = store.add('d.md', 0, 0);
            expect(idx).toBe(1);
        });
    });

    describe('remove()', () => {
        it('sets slot to null and preserves others', () => {
            store.add('a.md', 0, 0);
            store.add('b.md', 0, 0);
            store.add('c.md', 0, 0);
            store.remove(1);
            expect(store.get(0)?.filePath).toBe('a.md');
            expect(store.get(1)).toBeNull();
            expect(store.get(2)?.filePath).toBe('c.md');
        });

        it('trims trailing nulls', () => {
            store.add('a.md', 0, 0);
            store.add('b.md', 0, 0);
            store.remove(1);
            expect(store.capacity()).toBe(1);
        });
    });

    describe('removeByPath()', () => {
        it('removes by file path', () => {
            store.add('a.md', 0, 0);
            store.add('b.md', 0, 0);
            store.removeByPath('a.md');
            expect(store.get(0)).toBeNull();
            expect(store.get(1)?.filePath).toBe('b.md');
        });

        it('no-ops for unknown path', () => {
            store.add('a.md', 0, 0);
            store.removeByPath('z.md');
            expect(store.count()).toBe(1);
        });
    });

    describe('toggle()', () => {
        it('adds if absent, returns true', () => {
            const added = store.toggle('a.md', 0, 0);
            expect(added).toBe(true);
            expect(store.count()).toBe(1);
        });

        it('removes if present, returns false', () => {
            store.add('a.md', 0, 0);
            const added = store.toggle('a.md', 0, 0);
            expect(added).toBe(false);
            expect(store.count()).toBe(0);
        });
    });

    describe('getByPath()', () => {
        it('returns item and index', () => {
            store.add('a.md', 1, 2);
            const result = store.getByPath('a.md');
            expect(result).not.toBeNull();
            expect(result!.index).toBe(0);
            expect(result!.item.row).toBe(1);
            expect(result!.item.col).toBe(2);
        });

        it('returns null for unknown path', () => {
            expect(store.getByPath('z.md')).toBeNull();
        });
    });

    describe('getAll()', () => {
        it('returns non-null items in slot order', () => {
            store.add('a.md', 0, 0);
            store.add('b.md', 0, 0);
            store.add('c.md', 0, 0);
            store.remove(1);
            const all = store.getAll();
            expect(all).toHaveLength(2);
            expect(all[0]!.index).toBe(0);
            expect(all[0]!.item.filePath).toBe('a.md');
            expect(all[1]!.index).toBe(2);
            expect(all[1]!.item.filePath).toBe('c.md');
        });
    });

    describe('updateCursor()', () => {
        it('updates row/col for pinned file', () => {
            store.add('a.md', 0, 0);
            store.updateCursor('a.md', 10, 5);
            const item = store.get(0);
            expect(item?.row).toBe(10);
            expect(item?.col).toBe(5);
        });

        it('no-ops for unpinned file', () => {
            store.updateCursor('z.md', 10, 5);
            expect(store.count()).toBe(0);
        });
    });

    describe('renamePath()', () => {
        it('updates filePath in-place', () => {
            store.add('old.md', 3, 7);
            store.renamePath('old.md', 'new.md');
            expect(store.get(0)?.filePath).toBe('new.md');
            expect(store.get(0)?.row).toBe(3);
        });
    });

    describe('capacity()', () => {
        it('returns highest non-null index + 1', () => {
            store.add('a.md', 0, 0);
            store.add('b.md', 0, 0);
            store.add('c.md', 0, 0);
            store.remove(1);
            expect(store.capacity()).toBe(3);
        });

        it('returns 0 for empty store', () => {
            expect(store.capacity()).toBe(0);
        });
    });

    describe('count()', () => {
        it('returns number of non-null items', () => {
            store.add('a.md', 0, 0);
            store.add('b.md', 0, 0);
            store.add('c.md', 0, 0);
            store.remove(1);
            expect(store.count()).toBe(2);
        });
    });

    describe('load()/save() roundtrip', () => {
        it('preserves items', () => {
            store.add('a.md', 1, 2);
            store.add('b.md', 3, 4);
            const saved = store.save();

            const store2 = new HarpoonStore();
            store2.load(saved);
            expect(store2.get(0)?.filePath).toBe('a.md');
            expect(store2.get(0)?.row).toBe(1);
            expect(store2.get(1)?.filePath).toBe('b.md');
        });

        it('preserves sparse array with nulls', () => {
            store.add('a.md', 0, 0);
            store.add('b.md', 0, 0);
            store.add('c.md', 0, 0);
            store.remove(1);
            const saved = store.save();

            const store2 = new HarpoonStore();
            store2.load(saved);
            expect(store2.get(0)?.filePath).toBe('a.md');
            expect(store2.get(1)).toBeNull();
            expect(store2.get(2)?.filePath).toBe('c.md');
        });
    });

    describe('selectNext() / selectPrev()', () => {
        it('cycles through non-null items', () => {
            store.add('a.md', 0, 0);
            store.add('b.md', 0, 0);
            store.add('c.md', 0, 0);

            const first = store.selectNext();
            expect(first?.filePath).toBe('b.md');
            const second = store.selectNext();
            expect(second?.filePath).toBe('c.md');
            const wrapped = store.selectNext();
            expect(wrapped?.filePath).toBe('a.md');
        });

        it('selectPrev wraps backward', () => {
            store.add('a.md', 0, 0);
            store.add('b.md', 0, 0);

            const first = store.selectPrev();
            expect(first?.filePath).toBe('b.md');
            const wrapped = store.selectPrev();
            expect(wrapped?.filePath).toBe('a.md');
        });

        it('returns null for empty store', () => {
            expect(store.selectNext()).toBeNull();
            expect(store.selectPrev()).toBeNull();
        });
    });
});
