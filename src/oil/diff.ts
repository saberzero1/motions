import type { OilDiff, OilEntry, OilMergedDiff, ParsedLine } from './types';

export interface DiffResult extends OilDiff {
    foreignIds: Array<{ id: number; name: string; targetParentPath: string }>;
}

export function computeDiff(
    parsed: ParsedLine[],
    snapshot: OilEntry[],
    parentPath: string,
): DiffResult {
    const creates: OilDiff['creates'] = [];
    const deletes: OilDiff['deletes'] = [];
    const renames: OilDiff['renames'] = [];
    const foreignIds: DiffResult['foreignIds'] = [];

    const originalEntries = new Map<number, OilEntry>();
    for (const entry of snapshot) {
        originalEntries.set(entry.id, entry);
    }

    for (const line of parsed) {
        if (line.id > 0) {
            const original = originalEntries.get(line.id);
            if (original) {
                if (original.name !== line.name) {
                    renames.push({ entry: original, newName: line.name });
                }
                originalEntries.delete(line.id);
            } else {
                foreignIds.push({
                    id: line.id,
                    name: line.name,
                    targetParentPath: parentPath,
                });
            }
            continue;
        }

        creates.push({ name: line.name, parentPath, isFolder: line.type === 'd' });
    }

    for (const entry of originalEntries.values()) {
        deletes.push({ entry });
    }

    return { creates, deletes, renames, foreignIds };
}

export interface BufferDiff {
    parentPath: string;
    diff: DiffResult;
}

export function mergeMultiBufferDiffs(
    bufferDiffs: BufferDiff[],
    cache: { getEntry: (id: number) => OilEntry | undefined },
): OilMergedDiff {
    const allCreates: OilDiff['creates'] = [];
    const allDeletes: OilDiff['deletes'] = [];
    const allRenames: OilDiff['renames'] = [];
    const moves: OilMergedDiff['moves'] = [];

    for (const bd of bufferDiffs) {
        allCreates.push(...bd.diff.creates);
        allDeletes.push(...bd.diff.deletes);
        allRenames.push(...bd.diff.renames);
    }

    const deletedIds = new Set<number>();
    for (const del of allDeletes) {
        deletedIds.add(del.entry.id);
    }

    const resolvedMoveIds = new Set<number>();

    for (const bd of bufferDiffs) {
        for (const foreign of bd.diff.foreignIds) {
            if (deletedIds.has(foreign.id)) {
                const entry = cache.getEntry(foreign.id);
                if (entry) {
                    moves.push({
                        entry,
                        newParentPath: foreign.targetParentPath,
                        newName: foreign.name,
                    });
                    resolvedMoveIds.add(foreign.id);
                }
            }
        }
    }

    return {
        creates: allCreates,
        deletes: allDeletes.filter((d) => !resolvedMoveIds.has(d.entry.id)),
        renames: allRenames,
        moves,
    };
}
