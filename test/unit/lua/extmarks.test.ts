import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import {
    extmarkField,
    setExtmarkEffect,
    delExtmarkEffect,
    clearNamespaceEffect,
} from '../../../src/lua/extmarks';

function createState(doc = 'hello world\nsecond line\nthird line') {
    return EditorState.create({
        doc,
        extensions: [extmarkField],
    });
}

function getRegistry(state: EditorState) {
    return state.field(extmarkField).registry;
}

describe('extmark engine', () => {
    it('should start with empty registry', () => {
        const state = createState();
        const reg = getRegistry(state);
        expect(reg.byNs.size).toBe(0);
    });

    it('should set an extmark via effect', () => {
        const state = createState();
        const next = state.update({
            effects: setExtmarkEffect.of({
                nsId: 1,
                id: 1,
                from: 0,
                to: 5,
                opts: { hlGroup: 'Search' },
            }),
        }).state;
        const reg = getRegistry(next);
        expect(reg.byNs.get(1)?.size).toBe(1);
        const mark = reg.byNs.get(1)?.get(1);
        expect(mark?.from).toBe(0);
        expect(mark?.to).toBe(5);
        expect(mark?.opts.hlGroup).toBe('Search');
    });

    it('should auto-assign IDs when id is null', () => {
        const state = createState();
        const s1 = state.update({
            effects: setExtmarkEffect.of({
                nsId: 1,
                id: null,
                from: 0,
                to: 3,
                opts: {},
            }),
        }).state;
        const s2 = s1.update({
            effects: setExtmarkEffect.of({
                nsId: 1,
                id: null,
                from: 5,
                to: 8,
                opts: {},
            }),
        }).state;
        const reg = getRegistry(s2);
        const nsMap = reg.byNs.get(1);
        expect(nsMap?.size).toBe(2);
        const ids = Array.from(nsMap?.keys() ?? []);
        expect(ids[0]).not.toBe(ids[1]);
    });

    it('should bump nextIdByNs when explicit id >= current next', () => {
        const state = createState();
        const s1 = state.update({
            effects: setExtmarkEffect.of({
                nsId: 1,
                id: 100,
                from: 0,
                to: 3,
                opts: {},
            }),
        }).state;
        const s2 = s1.update({
            effects: setExtmarkEffect.of({
                nsId: 1,
                id: null,
                from: 5,
                to: 8,
                opts: {},
            }),
        }).state;
        const nsMap = getRegistry(s2).byNs.get(1);
        expect(nsMap?.size).toBe(2);
        expect(nsMap?.has(100)).toBe(true);
        expect(nsMap?.has(101)).toBe(true);
    });

    it('should delete an extmark via effect', () => {
        const state = createState();
        const s1 = state.update({
            effects: setExtmarkEffect.of({
                nsId: 1,
                id: 42,
                from: 0,
                to: 5,
                opts: {},
            }),
        }).state;
        expect(getRegistry(s1).byNs.get(1)?.size).toBe(1);

        const s2 = s1.update({
            effects: delExtmarkEffect.of({ nsId: 1, id: 42 }),
        }).state;
        expect(getRegistry(s2).byNs.get(1)?.size).toBe(0);
    });

    it('should handle deleting non-existent mark gracefully', () => {
        const state = createState();
        const s1 = state.update({
            effects: setExtmarkEffect.of({
                nsId: 1,
                id: 1,
                from: 0,
                to: 3,
                opts: {},
            }),
        }).state;
        const s2 = s1.update({
            effects: delExtmarkEffect.of({ nsId: 1, id: 99 }),
        }).state;
        expect(getRegistry(s2).byNs.get(1)?.size).toBe(1);
    });

    it('should clear namespace in range', () => {
        const state = createState('aaaa\nbbbb\ncccc');
        const s1 = state.update({
            effects: [
                setExtmarkEffect.of({
                    nsId: 1,
                    id: 1,
                    from: 0,
                    to: 2,
                    opts: {},
                }),
                setExtmarkEffect.of({
                    nsId: 1,
                    id: 2,
                    from: 5,
                    to: 8,
                    opts: {},
                }),
                setExtmarkEffect.of({
                    nsId: 1,
                    id: 3,
                    from: 10,
                    to: 13,
                    opts: {},
                }),
            ],
        }).state;
        expect(getRegistry(s1).byNs.get(1)?.size).toBe(3);

        const s2 = s1.update({
            effects: clearNamespaceEffect.of({
                nsId: 1,
                fromOffset: 5,
                toOffset: 9,
            }),
        }).state;
        const remaining = getRegistry(s2).byNs.get(1);
        expect(remaining?.size).toBe(2);
        expect(remaining?.has(1)).toBe(true);
        expect(remaining?.has(2)).toBe(false);
        expect(remaining?.has(3)).toBe(true);
    });

    it('should clear entire namespace with -1 offsets', () => {
        const state = createState();
        const s1 = state.update({
            effects: [
                setExtmarkEffect.of({
                    nsId: 1,
                    id: 1,
                    from: 0,
                    to: 3,
                    opts: {},
                }),
                setExtmarkEffect.of({
                    nsId: 1,
                    id: 2,
                    from: 5,
                    to: 8,
                    opts: {},
                }),
            ],
        }).state;
        const s2 = s1.update({
            effects: clearNamespaceEffect.of({
                nsId: 1,
                fromOffset: -1,
                toOffset: -1,
            }),
        }).state;
        expect(getRegistry(s2).byNs.get(1)?.size).toBe(0);
    });

    it('should handle clearing empty/non-existent namespace', () => {
        const state = createState();
        const s1 = state.update({
            effects: clearNamespaceEffect.of({
                nsId: 99,
                fromOffset: -1,
                toOffset: -1,
            }),
        }).state;
        expect(getRegistry(s1).byNs.get(99)).toBeUndefined();
    });

    it('should map positions through document changes', () => {
        const state = createState('hello world');
        const s1 = state.update({
            effects: setExtmarkEffect.of({
                nsId: 1,
                id: 1,
                from: 6,
                to: 11,
                opts: { hlGroup: 'Search' },
            }),
        }).state;

        const s2 = s1.update({
            changes: { from: 0, insert: 'XX' },
        }).state;
        const mark = getRegistry(s2).byNs.get(1)?.get(1);
        expect(mark?.from).toBe(8);
        expect(mark?.to).toBe(13);
    });

    it('should not remap on empty changes', () => {
        const state = createState('hello');
        const s1 = state.update({
            effects: setExtmarkEffect.of({
                nsId: 1,
                id: 1,
                from: 2,
                to: 4,
                opts: {},
            }),
        }).state;
        const s2 = s1.update({}).state;
        const mark = getRegistry(s2).byNs.get(1)?.get(1);
        expect(mark?.from).toBe(2);
        expect(mark?.to).toBe(4);
    });

    it('should handle point marks (from === to) during mapping', () => {
        const state = createState('abcdef');
        const s1 = state.update({
            effects: setExtmarkEffect.of({
                nsId: 1,
                id: 1,
                from: 3,
                to: 3,
                opts: {},
            }),
        }).state;

        const s2 = s1.update({
            changes: { from: 0, insert: 'XX' },
        }).state;
        const mark = getRegistry(s2).byNs.get(1)?.get(1);
        expect(mark?.from).toBe(5);
        expect(mark?.to).toBe(5);
    });

    it('should produce decorations for hl_group marks', () => {
        const state = createState('hello world');
        const s1 = state.update({
            effects: setExtmarkEffect.of({
                nsId: 1,
                id: 1,
                from: 0,
                to: 5,
                opts: { hlGroup: 'IncSearch' },
            }),
        }).state;

        const decos = s1.field(extmarkField).decorations;
        let count = 0;
        const cursor = decos.iter();
        while (cursor.value) {
            count++;
            cursor.next();
        }
        expect(count).toBeGreaterThan(0);
    });

    it('should not produce mark decorations when from === to', () => {
        const state = createState('hello world');
        const s1 = state.update({
            effects: setExtmarkEffect.of({
                nsId: 1,
                id: 1,
                from: 3,
                to: 3,
                opts: { hlGroup: 'Search' },
            }),
        }).state;

        const decos = s1.field(extmarkField).decorations;
        let count = 0;
        const cursor = decos.iter();
        while (cursor.value) {
            count++;
            cursor.next();
        }
        expect(count).toBe(0);
    });

    it('should isolate namespaces', () => {
        const state = createState();
        const s1 = state.update({
            effects: [
                setExtmarkEffect.of({
                    nsId: 1,
                    id: 1,
                    from: 0,
                    to: 3,
                    opts: {},
                }),
                setExtmarkEffect.of({
                    nsId: 2,
                    id: 1,
                    from: 5,
                    to: 8,
                    opts: {},
                }),
            ],
        }).state;
        expect(getRegistry(s1).byNs.get(1)?.size).toBe(1);
        expect(getRegistry(s1).byNs.get(2)?.size).toBe(1);

        const s2 = s1.update({
            effects: clearNamespaceEffect.of({
                nsId: 1,
                fromOffset: -1,
                toOffset: -1,
            }),
        }).state;
        expect(getRegistry(s2).byNs.get(1)?.size).toBe(0);
        expect(getRegistry(s2).byNs.get(2)?.size).toBe(1);
    });

    it('should update extmark in-place when id is reused', () => {
        const state = createState();
        const s1 = state.update({
            effects: setExtmarkEffect.of({
                nsId: 1,
                id: 5,
                from: 0,
                to: 3,
                opts: { hlGroup: 'A' },
            }),
        }).state;
        const s2 = s1.update({
            effects: setExtmarkEffect.of({
                nsId: 1,
                id: 5,
                from: 6,
                to: 9,
                opts: { hlGroup: 'B' },
            }),
        }).state;
        const nsMap = getRegistry(s2).byNs.get(1);
        expect(nsMap?.size).toBe(1);
        const mark = nsMap?.get(5);
        expect(mark?.from).toBe(6);
        expect(mark?.opts.hlGroup).toBe('B');
    });

    it('should apply multiple effects in a single transaction', () => {
        const state = createState();
        const s1 = state.update({
            effects: [
                setExtmarkEffect.of({
                    nsId: 1,
                    id: 1,
                    from: 0,
                    to: 3,
                    opts: { hlGroup: 'A' },
                }),
                setExtmarkEffect.of({
                    nsId: 1,
                    id: 2,
                    from: 5,
                    to: 8,
                    opts: { hlGroup: 'B' },
                }),
                delExtmarkEffect.of({ nsId: 1, id: 1 }),
            ],
        }).state;
        const nsMap = getRegistry(s1).byNs.get(1);
        expect(nsMap?.size).toBe(1);
        expect(nsMap?.has(1)).toBe(false);
        expect(nsMap?.has(2)).toBe(true);
    });

    it('should store opts.id on the stored mark', () => {
        const state = createState();
        const s1 = state.update({
            effects: setExtmarkEffect.of({
                nsId: 1,
                id: 7,
                from: 0,
                to: 3,
                opts: { hlGroup: 'Test' },
            }),
        }).state;
        const mark = getRegistry(s1).byNs.get(1)?.get(7);
        expect(mark?.opts.id).toBe(7);
    });

    it('should return Decoration.none when registry is empty', () => {
        const state = createState();
        const decos = state.field(extmarkField).decorations;
        let count = 0;
        const cursor = decos.iter();
        while (cursor.value) {
            count++;
            cursor.next();
        }
        expect(count).toBe(0);
    });

    it('should clamp decoration positions to doc length', () => {
        const state = createState('ab');
        const s1 = state.update({
            effects: setExtmarkEffect.of({
                nsId: 1,
                id: 1,
                from: 0,
                to: 100,
                opts: { hlGroup: 'X' },
            }),
        }).state;

        const decos = s1.field(extmarkField).decorations;
        let found = false;
        const cursor = decos.iter();
        while (cursor.value) {
            expect(cursor.from).toBe(0);
            expect(cursor.to).toBe(2);
            found = true;
            cursor.next();
        }
        expect(found).toBe(true);
    });
});
