import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { type App, TFile } from 'obsidian';
import type { CmAdapter } from '../../src/types/vim-api';

vi.mock('../../src/vim/options', () => ({
    getJumpListSize: () => 200,
    isJumpListEnabled: () => true,
}));
vi.mock('../../src/workspace/navigation', () => ({ executeCommand: vi.fn() }));
vi.mock('../../src/ui/global-ex-command', () => ({}));

import { JumpList, type JumpEntry } from '../../src/vim/jumplist';
import { createJumpListWalkOverride } from '../../src/workspace/global-defaults';

describe('JumpList', () => {
    let jl: JumpList;

    beforeEach(() => {
        jl = new JumpList();
    });

    describe('recordJump()', () => {
        it('records a jump entry', () => {
            jl.recordJump('a.md', 10, 5);
            expect(jl.getEntries()).toEqual([
                { filePath: 'a.md', line: 10, ch: 5 },
            ]);
            expect(jl.getIndex()).toBe(0);
        });

        it('deduplicates when filePath and line match current entry', () => {
            jl.recordJump('a.md', 10, 5);
            jl.recordJump('a.md', 10, 8);
            expect(jl.getEntries()).toHaveLength(1);
        });

        it('does not deduplicate when line differs', () => {
            jl.recordJump('a.md', 10, 5);
            jl.recordJump('a.md', 20, 5);
            expect(jl.getEntries()).toHaveLength(2);
        });

        it('does not deduplicate when filePath differs', () => {
            jl.recordJump('a.md', 10, 5);
            jl.recordJump('b.md', 10, 5);
            expect(jl.getEntries()).toHaveLength(2);
        });

        it('truncates forward entries when recording after jumpOlder', () => {
            jl.recordJump('a.md', 0, 0);
            jl.recordJump('b.md', 0, 0);
            jl.recordJump('c.md', 0, 0);
            jl.jumpOlder();
            jl.jumpOlder();
            expect(jl.getIndex()).toBe(0);
            jl.recordJump('d.md', 0, 0);
            expect(jl.getEntries()).toHaveLength(2);
            expect(jl.getEntries()[1]?.filePath).toBe('d.md');
        });

        it('evicts oldest entry when exceeding max size', () => {
            for (let i = 0; i < 210; i++) {
                jl.recordJump(`file${i}.md`, i, 0);
            }
            expect(jl.getEntries().length).toBeLessThanOrEqual(200);
            expect(jl.getEntries()[0]?.filePath).toBe('file10.md');
        });

        it('fires onRecord callback', () => {
            const cb = vi.fn();
            const jlCb = new JumpList(cb);
            jlCb.recordJump('a.md', 0, 0);
            expect(cb).toHaveBeenCalledOnce();
        });
    });

    describe('jumpOlder()', () => {
        it('returns null when list is empty', () => {
            expect(jl.jumpOlder()).toBeNull();
        });

        it('returns null when at start of list', () => {
            jl.recordJump('a.md', 0, 0);
            expect(jl.jumpOlder()).toBeNull();
        });

        it('returns previous entry', () => {
            jl.recordJump('a.md', 10, 0);
            jl.recordJump('b.md', 20, 0);
            const entry = jl.jumpOlder();
            expect(entry).toEqual({ filePath: 'a.md', line: 10, ch: 0 });
        });

        it('supports count parameter', () => {
            jl.recordJump('a.md', 0, 0);
            jl.recordJump('b.md', 0, 0);
            jl.recordJump('c.md', 0, 0);
            jl.recordJump('d.md', 0, 0);
            const entry = jl.jumpOlder(3);
            expect(entry).toEqual({ filePath: 'a.md', line: 0, ch: 0 });
        });

        it('clamps at start of list with large count', () => {
            jl.recordJump('a.md', 0, 0);
            jl.recordJump('b.md', 0, 0);
            const entry = jl.jumpOlder(99);
            expect(entry).toEqual({ filePath: 'a.md', line: 0, ch: 0 });
        });
    });

    describe('jumpNewer()', () => {
        it('returns null when at end of list', () => {
            jl.recordJump('a.md', 0, 0);
            expect(jl.jumpNewer()).toBeNull();
        });

        it('returns next entry after jumpOlder', () => {
            jl.recordJump('a.md', 10, 0);
            jl.recordJump('b.md', 20, 0);
            jl.jumpOlder();
            const entry = jl.jumpNewer();
            expect(entry).toEqual({ filePath: 'b.md', line: 20, ch: 0 });
        });

        it('supports count parameter', () => {
            jl.recordJump('a.md', 0, 0);
            jl.recordJump('b.md', 0, 0);
            jl.recordJump('c.md', 0, 0);
            jl.recordJump('d.md', 0, 0);
            jl.jumpOlder(3);
            const entry = jl.jumpNewer(2);
            expect(entry).toEqual({ filePath: 'c.md', line: 0, ch: 0 });
        });
    });

    describe.each(['older', 'newer'] as const)(
        'unresolved entries: %s',
        (direction) => {
            const isLive = (entry: JumpEntry) => entry.filePath !== 'dead.md';

            function walk(count = 1, isValid = isLive) {
                return direction === 'older'
                    ? jl.jumpOlder(count, isValid)
                    : jl.jumpNewer(count, isValid);
            }

            function load(paths: string[]) {
                const ordered =
                    direction === 'older' ? [...paths].reverse() : paths;
                jl.deserialize(
                    ordered.map((filePath, line) => ({
                        filePath,
                        line,
                        ch: 0,
                    })),
                );
                if (direction === 'newer') jl.jumpOlder(ordered.length);
            }

            it.each([1, 3])(
                'skips %i dead entries without pruning history',
                (deadCount) => {
                    load([
                        'current.md',
                        ...Array<string>(deadCount).fill('dead.md'),
                        'target.md',
                        'farther.md',
                    ]);
                    const history = jl.serialize();
                    const target = history.find(
                        (entry) => entry.filePath === 'target.md',
                    );

                    const index = jl.getIndex();
                    const peek =
                        direction === 'older'
                            ? jl.peekOlder(1, isLive)
                            : jl.peekNewer(1, isLive);
                    expect(peek).toEqual(target);
                    expect(jl.getIndex()).toBe(index);
                    expect(walk()).toEqual(target);
                    expect(jl.getEntries()[jl.getIndex()]).toEqual(target);
                    expect(jl.serialize()).toEqual(history);
                },
            );

            it('leaves the index unchanged when only dead entries remain', () => {
                load(['current.md', 'dead.md', 'dead.md']);
                const index = jl.getIndex();
                expect(walk()).toBeNull();
                expect(walk()).toBeNull();
                expect(jl.getIndex()).toBe(index);
            });

            it('terminates for an entirely dead persisted history and a huge count', () => {
                load(Array<string>(200).fill('dead.md'));
                const index = jl.getIndex();
                const isValid = vi.fn(() => false);
                expect(walk(Number.MAX_SAFE_INTEGER, isValid)).toBeNull();
                expect(isValid).toHaveBeenCalledTimes(199);
                expect(jl.getIndex()).toBe(index);
                expect(jl.getEntries()).toHaveLength(200);
            });

            it.each([2, 99])(
                'counts valid destinations and clamps (count=%i)',
                (count) => {
                    load([
                        'current.md',
                        'dead.md',
                        'first.md',
                        'dead.md',
                        'last.md',
                        'dead.md',
                    ]);
                    expect(walk(count)?.filePath).toBe('last.md');
                    const index = jl.getIndex();
                    expect(walk()).toBeNull();
                    expect(jl.getIndex()).toBe(index);
                },
            );
        },
    );

    describe('handleRename()', () => {
        it('updates filePath for matching entries', () => {
            jl.recordJump('old.md', 5, 0);
            jl.recordJump('other.md', 10, 0);
            jl.handleRename('old.md', 'new.md');
            expect(jl.getEntries()[0]?.filePath).toBe('new.md');
            expect(jl.getEntries()[1]?.filePath).toBe('other.md');
        });

        it('updates all matching entries', () => {
            jl.recordJump('old.md', 5, 0);
            jl.recordJump('between.md', 0, 0);
            jl.recordJump('old.md', 15, 0);
            jl.handleRename('old.md', 'renamed.md');
            expect(jl.getEntries()[0]?.filePath).toBe('renamed.md');
            expect(jl.getEntries()[2]?.filePath).toBe('renamed.md');
        });

        it('no-ops for unknown path', () => {
            jl.recordJump('a.md', 0, 0);
            jl.handleRename('unknown.md', 'new.md');
            expect(jl.getEntries()[0]?.filePath).toBe('a.md');
        });
    });

    describe('handleDelete()', () => {
        it('removes entries matching deleted path', () => {
            jl.recordJump('keep.md', 0, 0);
            jl.recordJump('delete.md', 5, 0);
            jl.recordJump('keep2.md', 10, 0);
            jl.handleDelete('delete.md');
            expect(jl.getEntries()).toHaveLength(2);
            expect(jl.getEntries().map((e) => e.filePath)).toEqual([
                'keep.md',
                'keep2.md',
            ]);
        });

        it('adjusts index when entries before index are removed', () => {
            jl.recordJump('a.md', 0, 0);
            jl.recordJump('delete.md', 0, 0);
            jl.recordJump('c.md', 0, 0);
            expect(jl.getIndex()).toBe(2);
            jl.handleDelete('delete.md');
            expect(jl.getIndex()).toBe(1);
        });

        it('resets to -1 when all entries are deleted', () => {
            jl.recordJump('only.md', 0, 0);
            jl.handleDelete('only.md');
            expect(jl.getIndex()).toBe(-1);
            expect(jl.getEntries()).toHaveLength(0);
        });

        it('clamps index when it exceeds remaining entries', () => {
            jl.recordJump('a.md', 0, 0);
            jl.recordJump('b.md', 0, 0);
            jl.recordJump('c.md', 0, 0);
            jl.handleDelete('c.md');
            expect(jl.getIndex()).toBe(1);
        });
    });

    describe('serialize() / deserialize()', () => {
        it('round-trips entries', () => {
            jl.recordJump('a.md', 1, 2);
            jl.recordJump('b.md', 3, 4);
            const serialized = jl.serialize();
            const jl2 = new JumpList();
            jl2.deserialize(serialized);
            expect(jl2.getEntries()).toEqual(serialized);
        });

        it('sets index to end after deserialize', () => {
            const entries = [
                { filePath: 'a.md', line: 0, ch: 0 },
                { filePath: 'b.md', line: 0, ch: 0 },
            ];
            jl.deserialize(entries);
            expect(jl.getIndex()).toBe(1);
        });

        it('truncates deserialized entries to max size', () => {
            const entries = Array.from({ length: 300 }, (_, i) => ({
                filePath: `f${i}.md`,
                line: i,
                ch: 0,
            }));
            jl.deserialize(entries);
            expect(jl.getEntries().length).toBeLessThanOrEqual(200);
        });
    });

    describe('navigation round-trip', () => {
        it('older then newer returns to same position', () => {
            jl.recordJump('a.md', 0, 0);
            jl.recordJump('b.md', 10, 0);
            jl.recordJump('c.md', 20, 0);
            jl.jumpOlder();
            jl.jumpOlder();
            expect(jl.getIndex()).toBe(0);
            jl.jumpNewer();
            jl.jumpNewer();
            expect(jl.getIndex()).toBe(2);
        });

        it('recording after jumpOlder truncates forward history', () => {
            jl.recordJump('a.md', 0, 0);
            jl.recordJump('b.md', 0, 0);
            jl.recordJump('c.md', 0, 0);
            jl.jumpOlder();
            jl.recordJump('d.md', 0, 0);
            expect(jl.jumpNewer()).toBeNull();
            expect(jl.getEntries().map((e) => e.filePath)).toEqual([
                'a.md',
                'b.md',
                'd.md',
            ]);
        });
    });
});

describe('jump-list action skips unresolved vault paths', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it.each([
        { forward: false, deadCount: 1, validTarget: true },
        { forward: true, deadCount: 1, validTarget: true },
        { forward: false, deadCount: 3, validTarget: true },
        { forward: true, deadCount: 3, validTarget: true },
        { forward: false, deadCount: 200, validTarget: false },
        { forward: true, deadCount: 200, validTarget: false },
        {
            forward: false,
            deadCount: 1,
            validTarget: true,
            returnToCurrent: true,
        },
        {
            forward: true,
            deadCount: 1,
            validTarget: true,
            returnToCurrent: true,
        },
        {
            forward: false,
            deadCount: 3,
            validTarget: true,
            returnToCurrent: true,
            repeat: 99,
        },
        {
            forward: true,
            deadCount: 3,
            validTarget: true,
            returnToCurrent: true,
            repeat: 99,
        },
    ])(
        'forward=$forward, dead=$deadCount, valid=$validTarget, sameFile=$returnToCurrent, count=$repeat',
        async ({
            forward,
            deadCount,
            validTarget,
            returnToCurrent,
            repeat = 1,
        }) => {
            const current = Object.assign(new TFile(), { path: 'current.md' });
            const target = Object.assign(new TFile(), { path: 'target.md' });
            const destination = returnToCurrent ? current : target;
            const files = new Map([
                ['current.md', current],
                ['target.md', target],
            ]);
            let active = current;
            const openFile = vi.fn(async (file: TFile) => {
                active = file;
            });
            const app = {
                vault: {
                    getAbstractFileByPath: (path: string) =>
                        files.get(path) ?? null,
                },
                workspace: {
                    getActiveFile: () => active,
                    iterateAllLeaves: () => {},
                    getLeaf: () => ({ openFile }),
                    getActiveViewOfType: () => null,
                },
            } as unknown as App;
            const jl = new JumpList();
            const paths = validTarget
                ? [
                      'current.md',
                      ...Array<string>(deadCount).fill('dead.md'),
                      destination.path,
                  ]
                : Array<string>(deadCount).fill('dead.md');
            if (!forward) paths.reverse();
            jl.deserialize(
                paths.map((filePath, line) => ({ filePath, line, ch: 0 })),
            );
            if (forward) jl.jumpOlder(paths.length);
            const originalIndex = jl.getIndex();
            const original = vi.fn();

            createJumpListWalkOverride(original, app, jl)(
                {} as CmAdapter,
                { forward, repeat },
                {},
            );
            await vi.runAllTimersAsync();

            expect(original).not.toHaveBeenCalled();
            if (validTarget) {
                expect(openFile).toHaveBeenCalledExactlyOnceWith(destination);
                expect(active).toBe(destination);
                expect(jl.getIndex()).toBe(forward ? paths.length - 1 : 0);
            } else {
                expect(openFile).not.toHaveBeenCalled();
                expect(active).toBe(current);
                expect(jl.getIndex()).toBe(originalIndex);
            }
            expect(jl.getEntries().map((entry) => entry.filePath)).toEqual(
                paths,
            );
        },
    );
});
