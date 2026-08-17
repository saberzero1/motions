import { describe, expect, it } from 'vitest';
import { computeDiff, mergeMultiBufferDiffs } from '../../src/oil/diff';
import type { OilEntry, ParsedLine } from '../../src/oil/types';

function entry(
    id: number,
    name: string,
    type: 'file' | 'folder' = 'file',
): OilEntry {
    return { id, name, type, path: `root/${name}`, parentPath: 'root' };
}

describe('Oil diff — computeDiff', () => {
    it('detects no changes when buffer matches snapshot', () => {
        const snapshot = [entry(1, 'a.md'), entry(2, 'b.md')];
        const parsed: ParsedLine[] = [
            { id: 1, type: 'f', name: 'a.md' },
            { id: 2, type: 'f', name: 'b.md' },
        ];
        const result = computeDiff(parsed, snapshot, 'root');
        expect(result.creates).toHaveLength(0);
        expect(result.deletes).toHaveLength(0);
        expect(result.renames).toHaveLength(0);
        expect(result.foreignIds).toHaveLength(0);
    });

    it('detects a rename when name changes but id stays', () => {
        const snapshot = [entry(1, 'old.md')];
        const parsed: ParsedLine[] = [{ id: 1, type: 'f', name: 'new.md' }];
        const result = computeDiff(parsed, snapshot, 'root');
        expect(result.renames).toHaveLength(1);
        expect(result.renames[0]?.newName).toBe('new.md');
        expect(result.renames[0]?.entry.name).toBe('old.md');
    });

    it('detects a deletion when an entry is removed from buffer', () => {
        const snapshot = [entry(1, 'a.md'), entry(2, 'b.md')];
        const parsed: ParsedLine[] = [{ id: 1, type: 'f', name: 'a.md' }];
        const result = computeDiff(parsed, snapshot, 'root');
        expect(result.deletes).toHaveLength(1);
        expect(result.deletes[0]?.entry.name).toBe('b.md');
    });

    it('detects a creation when a new line has id=0', () => {
        const snapshot = [entry(1, 'a.md')];
        const parsed: ParsedLine[] = [
            { id: 1, type: 'f', name: 'a.md' },
            { id: 0, type: 'f', name: 'new.md' },
        ];
        const result = computeDiff(parsed, snapshot, 'root');
        expect(result.creates).toHaveLength(1);
        expect(result.creates[0]?.name).toBe('new.md');
        expect(result.creates[0]?.isFolder).toBe(false);
    });

    it('detects folder creation', () => {
        const parsed: ParsedLine[] = [{ id: 0, type: 'd', name: 'newdir' }];
        const result = computeDiff(parsed, [], 'root');
        expect(result.creates).toHaveLength(1);
        expect(result.creates[0]?.isFolder).toBe(true);
    });

    it('reports foreign ids when buffer contains unknown ids', () => {
        const snapshot = [entry(1, 'a.md')];
        const parsed: ParsedLine[] = [
            { id: 1, type: 'f', name: 'a.md' },
            { id: 99, type: 'f', name: 'foreign.md' },
        ];
        const result = computeDiff(parsed, snapshot, 'root');
        expect(result.foreignIds).toHaveLength(1);
        expect(result.foreignIds[0]?.id).toBe(99);
        expect(result.foreignIds[0]?.name).toBe('foreign.md');
    });

    it('handles empty snapshot and buffer', () => {
        const result = computeDiff([], [], 'root');
        expect(result.creates).toHaveLength(0);
        expect(result.deletes).toHaveLength(0);
        expect(result.renames).toHaveLength(0);
    });

    it('handles simultaneous create, delete, and rename', () => {
        const snapshot = [
            entry(1, 'keep.md'),
            entry(2, 'remove.md'),
            entry(3, 'rename-me.md'),
        ];
        const parsed: ParsedLine[] = [
            { id: 1, type: 'f', name: 'keep.md' },
            { id: 3, type: 'f', name: 'renamed.md' },
            { id: 0, type: 'f', name: 'brand-new.md' },
        ];
        const result = computeDiff(parsed, snapshot, 'root');
        expect(result.creates).toHaveLength(1);
        expect(result.creates[0]?.name).toBe('brand-new.md');
        expect(result.deletes).toHaveLength(1);
        expect(result.deletes[0]?.entry.name).toBe('remove.md');
        expect(result.renames).toHaveLength(1);
        expect(result.renames[0]?.newName).toBe('renamed.md');
    });
});

describe('Oil diff — mergeMultiBufferDiffs', () => {
    it('resolves a move when foreign id matches a delete in another buffer', () => {
        const e = entry(5, 'moved.md');
        const cache = { getEntry: (id: number) => (id === 5 ? e : undefined) };

        const bufferDiffs = [
            {
                parentPath: 'dirA',
                diff: {
                    creates: [],
                    deletes: [{ entry: e }],
                    renames: [],
                    foreignIds: [],
                },
            },
            {
                parentPath: 'dirB',
                diff: {
                    creates: [],
                    deletes: [],
                    renames: [],
                    foreignIds: [
                        { id: 5, name: 'moved.md', targetParentPath: 'dirB' },
                    ],
                },
            },
        ];

        const result = mergeMultiBufferDiffs(bufferDiffs, cache);
        expect(result.moves).toHaveLength(1);
        expect(result.moves[0]?.newParentPath).toBe('dirB');
        expect(result.deletes).toHaveLength(0);
    });

    it('keeps delete when foreign id is not found in cache', () => {
        const e = entry(5, 'deleted.md');
        const cache = { getEntry: () => undefined };

        const bufferDiffs = [
            {
                parentPath: 'dirA',
                diff: {
                    creates: [],
                    deletes: [{ entry: e }],
                    renames: [],
                    foreignIds: [],
                },
            },
            {
                parentPath: 'dirB',
                diff: {
                    creates: [],
                    deletes: [],
                    renames: [],
                    foreignIds: [
                        { id: 5, name: 'deleted.md', targetParentPath: 'dirB' },
                    ],
                },
            },
        ];

        const result = mergeMultiBufferDiffs(bufferDiffs, cache);
        expect(result.moves).toHaveLength(0);
        expect(result.deletes).toHaveLength(1);
    });

    it('merges creates and renames from multiple buffers', () => {
        const cache = { getEntry: () => undefined };
        const e1 = entry(1, 'old.md');

        const bufferDiffs = [
            {
                parentPath: 'dirA',
                diff: {
                    creates: [
                        {
                            name: 'new-a.md',
                            parentPath: 'dirA',
                            isFolder: false,
                        },
                    ],
                    deletes: [],
                    renames: [{ entry: e1, newName: 'renamed.md' }],
                    foreignIds: [],
                },
            },
            {
                parentPath: 'dirB',
                diff: {
                    creates: [
                        {
                            name: 'new-b.md',
                            parentPath: 'dirB',
                            isFolder: true,
                        },
                    ],
                    deletes: [],
                    renames: [],
                    foreignIds: [],
                },
            },
        ];

        const result = mergeMultiBufferDiffs(bufferDiffs, cache);
        expect(result.creates).toHaveLength(2);
        expect(result.renames).toHaveLength(1);
    });
});
