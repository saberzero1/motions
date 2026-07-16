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

    peekOlder(count = 1): JumpEntry | null {
        if (this.index <= 0) return null;
        const nextIndex = Math.max(0, this.index - Math.max(1, count));
        if (nextIndex === this.index) return null;
        return this.entries[nextIndex] ?? null;
    }

    peekNewer(count = 1): JumpEntry | null {
        if (this.index >= this.entries.length - 1) return null;
        const nextIndex = Math.min(
            this.entries.length - 1,
            this.index + Math.max(1, count),
        );
        if (nextIndex === this.index) return null;
        return this.entries[nextIndex] ?? null;
    }

    jumpOlder(count = 1): JumpEntry | null {
        if (this.index <= 0) return null;
        const step = Math.max(1, count);
        const nextIndex = Math.max(0, this.index - step);
        if (nextIndex === this.index) return null;
        this.index = nextIndex;
        return this.entries[this.index] ?? null;
    }

    jumpNewer(count = 1): JumpEntry | null {
        if (this.index >= this.entries.length - 1) return null;
        const step = Math.max(1, count);
        const nextIndex = Math.min(this.entries.length - 1, this.index + step);
        if (nextIndex === this.index) return null;
        this.index = nextIndex;
        return this.entries[this.index] ?? null;
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
