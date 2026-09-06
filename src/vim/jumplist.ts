import { getJumpListSize } from './options';

export interface JumpEntry {
    filePath: string;
    line: number;
    ch: number;
}

const DEFAULT_MAX_ENTRIES = 200;

export class JumpList {
    private entries: JumpEntry[] = [];
    private index = -1;
    private maxSize = DEFAULT_MAX_ENTRIES;
    private onRecord: (() => void) | null = null;

    constructor(onRecord?: () => void) {
        this.onRecord = onRecord ?? null;
    }

    recordJump(filePath: string, line: number, ch: number): void {
        this.maxSize = getJumpListSize() || DEFAULT_MAX_ENTRIES;
        const current = this.entries[this.index];
        if (current && current.filePath === filePath && current.line === line) {
            return;
        }

        this.entries = this.entries.slice(0, this.index + 1);
        this.entries.push({ filePath, line, ch });
        if (this.entries.length > this.maxSize) this.entries.shift();
        this.index = this.entries.length - 1;
        this.onRecord?.();
    }

    peekOlder(
        count = 1,
        isValid?: (entry: JumpEntry) => boolean,
    ): JumpEntry | null {
        return this.entries[this.findNextIndex(-1, count, isValid)] ?? null;
    }

    peekNewer(
        count = 1,
        isValid?: (entry: JumpEntry) => boolean,
    ): JumpEntry | null {
        return this.entries[this.findNextIndex(1, count, isValid)] ?? null;
    }

    jumpOlder(
        count = 1,
        isValid?: (entry: JumpEntry) => boolean,
    ): JumpEntry | null {
        const nextIndex = this.findNextIndex(-1, count, isValid);
        if (nextIndex < 0) return null;
        this.index = nextIndex;
        return this.entries[this.index] ?? null;
    }

    jumpNewer(
        count = 1,
        isValid?: (entry: JumpEntry) => boolean,
    ): JumpEntry | null {
        const nextIndex = this.findNextIndex(1, count, isValid);
        if (nextIndex < 0) return null;
        this.index = nextIndex;
        return this.entries[this.index] ?? null;
    }

    private findNextIndex(
        direction: -1 | 1,
        count: number,
        isValid?: (entry: JumpEntry) => boolean,
    ): number {
        let remaining = Math.max(1, count || 1);
        let target = -1;
        // Bound the scan by history length, not count. Missing files do not
        // consume a step, and an unsuccessful scan leaves the index untouched.
        for (
            let i = this.index + direction;
            i >= 0 && i < this.entries.length;
            i += direction
        ) {
            const entry = this.entries[i];
            if (!entry || (isValid && !isValid(entry))) continue;
            target = i;
            if (--remaining <= 0) break;
        }
        return target;
    }

    clear(): void {
        this.entries = [];
        this.index = -1;
    }

    getEntries(): JumpEntry[] {
        return [...this.entries];
    }

    getIndex(): number {
        return this.index;
    }

    handleRename(oldPath: string, newPath: string): void {
        for (const entry of this.entries) {
            if (entry.filePath === oldPath) entry.filePath = newPath;
        }
    }

    handleDelete(path: string): void {
        if (this.entries.length === 0) return;
        let removedBefore = 0;
        const nextEntries: JumpEntry[] = [];
        for (let i = 0; i < this.entries.length; i++) {
            const entry = this.entries[i];
            if (!entry) continue;
            if (entry.filePath === path) {
                if (i <= this.index) removedBefore++;
                continue;
            }
            nextEntries.push(entry);
        }
        this.entries = nextEntries;
        this.index -= removedBefore;
        if (this.entries.length === 0) {
            this.index = -1;
            return;
        }
        if (this.index >= this.entries.length) {
            this.index = this.entries.length - 1;
        }
    }

    serialize(): JumpEntry[] {
        return [...this.entries];
    }

    deserialize(entries: JumpEntry[]): void {
        this.maxSize = getJumpListSize() || DEFAULT_MAX_ENTRIES;
        this.entries = entries.slice(-this.maxSize);
        this.index = this.entries.length - 1;
    }
}
