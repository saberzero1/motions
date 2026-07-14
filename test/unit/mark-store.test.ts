import { describe, expect, it, beforeEach } from 'vitest';
import { MarkStore } from '../../src/vim/mark-store';

describe('MarkStore', () => {
    let store: MarkStore;

    beforeEach(() => {
        store = new MarkStore();
    });

    describe('set() and get()', () => {
        it('stores and retrieves a global mark', () => {
            store.set('A', 'test.md', 5, 10);
            const mark = store.get('A');
            expect(mark).toEqual({
                name: 'A',
                filePath: 'test.md',
                line: 5,
                ch: 10,
            });
        });

        it('rejects lowercase marks', () => {
            store.set('a', 'test.md', 0, 0);
            expect(store.get('a')).toBeUndefined();
        });
    });

    describe('renamePath()', () => {
        it('updates filePath for matching marks', () => {
            store.set('A', 'old.md', 3, 7);
            store.renamePath('old.md', 'new.md');
            expect(store.get('A')?.filePath).toBe('new.md');
            expect(store.get('A')?.line).toBe(3);
        });

        it('updates multiple marks pointing to the same file', () => {
            store.set('A', 'old.md', 1, 0);
            store.set('B', 'old.md', 5, 3);
            store.set('C', 'other.md', 2, 0);
            store.renamePath('old.md', 'renamed.md');
            expect(store.get('A')?.filePath).toBe('renamed.md');
            expect(store.get('B')?.filePath).toBe('renamed.md');
            expect(store.get('C')?.filePath).toBe('other.md');
        });

        it('no-ops for unknown path', () => {
            store.set('A', 'test.md', 0, 0);
            store.renamePath('unknown.md', 'new.md');
            expect(store.get('A')?.filePath).toBe('test.md');
        });
    });

    describe('removeByPath()', () => {
        it('removes marks pointing to the deleted file', () => {
            store.set('A', 'deleted.md', 0, 0);
            store.set('B', 'kept.md', 0, 0);
            store.removeByPath('deleted.md');
            expect(store.has('A')).toBe(false);
            expect(store.has('B')).toBe(true);
        });

        it('removes multiple marks from the same file', () => {
            store.set('A', 'gone.md', 1, 0);
            store.set('B', 'gone.md', 5, 0);
            store.removeByPath('gone.md');
            expect(store.size).toBe(0);
        });

        it('no-ops for unknown path', () => {
            store.set('A', 'test.md', 0, 0);
            store.removeByPath('unknown.md');
            expect(store.size).toBe(1);
        });
    });

    describe('load() and save()', () => {
        it('round-trips marks through load/save', () => {
            store.set('A', 'a.md', 1, 2);
            store.set('B', 'b.md', 3, 4);
            const saved = store.save();
            const store2 = new MarkStore();
            store2.load(saved);
            expect(store2.get('A')).toEqual(store.get('A'));
            expect(store2.get('B')).toEqual(store.get('B'));
        });

        it('filters out non-global marks during load', () => {
            store.load([
                { name: 'A', filePath: 'a.md', line: 0, ch: 0 },
                { name: 'a', filePath: 'b.md', line: 0, ch: 0 },
                { name: '1', filePath: 'c.md', line: 0, ch: 0 },
            ]);
            expect(store.size).toBe(1);
            expect(store.has('A')).toBe(true);
        });
    });
});
