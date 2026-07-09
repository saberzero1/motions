import type { OilEntry } from './types';

export class OilCache {
    private nextId = 1;
    private entriesById = new Map<number, OilEntry>();
    private entriesByPath = new Map<string, OilEntry>();

    assignId(entry: Omit<OilEntry, 'id'>): OilEntry {
        const assigned: OilEntry = { ...entry, id: this.nextId++ };
        this.entriesById.set(assigned.id, assigned);
        this.entriesByPath.set(assigned.path, assigned);
        return assigned;
    }

    getEntry(id: number): OilEntry | undefined {
        return this.entriesById.get(id);
    }

    getEntryByPath(path: string): OilEntry | undefined {
        return this.entriesByPath.get(path);
    }

    loadDirectory(
        parentPath: string,
        entries: Array<Omit<OilEntry, 'id'>>,
    ): OilEntry[] {
        for (const [id, existing] of this.entriesById) {
            if (existing.parentPath === parentPath) {
                this.entriesById.delete(id);
                this.entriesByPath.delete(existing.path);
            }
        }
        return entries.map((entry) => this.assignId(entry));
    }

    snapshot(parentPath: string): OilEntry[] {
        const entries = Array.from(this.entriesById.values()).filter(
            (entry) => entry.parentPath === parentPath,
        );
        const frozen = entries.map((entry) => Object.freeze({ ...entry }));
        return frozen;
    }

    clear(): void {
        this.nextId = 1;
        this.entriesById.clear();
        this.entriesByPath.clear();
    }
}
