import { getJumpListSize } from './options';

export interface JumpEntry {
    filePath: string;
    line: number;
    ch: number;
}

/**
 * A position in an open editor that follows edits to its note. `find` gives
 * `null` once the text it marked is deleted, and `undefined` once the editor
 * it was made in has gone, after which the last position it gave stands.
 */
export interface JumpMark {
    find(): { line: number; ch: number } | null | undefined;
    clear(): void;
}

export interface JumpPoint {
    line: number;
    ch: number;
    mark?: JumpMark;
}

interface Entry extends JumpEntry {
    mark?: JumpMark;
    /** Where the last jump landed, or a note was entered; see `settleLanding`. */
    landing?: boolean;
}

const DEFAULT_MAX_ENTRIES = 200;

/**
 * One list of note switches and the jumps within each note, in the order they
 * happened, as Neovim keeps one per window.
 *
 * Neovim records where each jump starts, and where the cursor is at the first
 * `<C-o>` after one. This list also records where a jump lands, or a note was
 * entered, as its newest entry, to stand for the cursor until then: the next
 * jump's start in that note replaces it, the first `<C-o>` moves it to the
 * cursor, and once a walk has left it, it is an entry like any other.
 */
export class JumpList {
    private entries: Entry[] = [];
    private index = -1;
    private maxSize = DEFAULT_MAX_ENTRIES;
    private onRecord: (() => void) | null = null;

    constructor(onRecord?: () => void) {
        this.onRecord = onRecord ?? null;
    }

    recordJump(
        filePath: string,
        line: number,
        ch: number,
        options?: { landing?: boolean },
    ): void {
        const current = this.entries[this.index];
        const at = current ? this.resolve(current) : null;
        if (current && at?.filePath === filePath && at.line === line) {
            if (!options?.landing) current.landing = false;
            return;
        }
        this.replaceLanding(filePath);
        this.push({ filePath, line, ch, landing: options?.landing });
    }

    /**
     * A jump within a note: where it started, unless the list is there
     * already, then where it landed. Positions compare whole, as the
     * editor's own list compares them.
     */
    recordInNoteJump(filePath: string, from: JumpPoint, to: JumpPoint): void {
        this.replaceLanding(filePath);
        if (this.isAt(filePath, from)) from.mark?.clear();
        else this.push({ filePath, ...from });
        this.push({ filePath, ...to, landing: true });
    }

    /**
     * Moves the newest entry, when it is where the last jump landed in this
     * note, to the cursor, as Neovim records the cursor at the first `<C-o>`
     * after a jump. `<C-i>` then comes back to where `<C-o>` was pressed:
     * `G` and `k`, then `<C-o>` and `<C-i>`, lands on the line `k` left, and
     * `a`, then `jj` in `b`, on `b:3` (measured, Neovim 0.12.5).
     */
    settleLanding(filePath: string, cursor: () => JumpPoint): void {
        const current = this.entries[this.index];
        if (!current?.landing || current.filePath !== filePath) return;
        current.mark?.clear();
        Object.assign(current, { mark: undefined }, cursor());
    }

    peekOlder(
        count = 1,
        isValid?: (entry: JumpEntry) => boolean,
    ): JumpEntry | null {
        return this.entryAt(this.findNextIndex(-1, count, isValid));
    }

    peekNewer(
        count = 1,
        isValid?: (entry: JumpEntry) => boolean,
    ): JumpEntry | null {
        return this.entryAt(this.findNextIndex(1, count, isValid));
    }

    jumpOlder(
        count = 1,
        isValid?: (entry: JumpEntry) => boolean,
    ): JumpEntry | null {
        const nextIndex = this.findNextIndex(-1, count, isValid);
        if (nextIndex < 0) return null;
        // Left behind, it is an entry like any other: `G`, `<C-o>`, `<C-i>`,
        // `k`, `<C-o>`, `<C-i>` comes back to where `G` landed, not to where
        // `k` left (measured, Neovim 0.12.5).
        const left = this.entries[this.index];
        if (left) left.landing = false;
        this.index = nextIndex;
        return this.entryAt(this.index);
    }

    jumpNewer(
        count = 1,
        isValid?: (entry: JumpEntry) => boolean,
    ): JumpEntry | null {
        const nextIndex = this.findNextIndex(1, count, isValid);
        if (nextIndex < 0) return null;
        this.index = nextIndex;
        return this.entryAt(this.index);
    }

    private findNextIndex(
        direction: -1 | 1,
        count: number,
        isValid?: (entry: JumpEntry) => boolean,
    ): number {
        let remaining = Math.max(1, count || 1);
        let target = -1;
        // Bound the scan by history length, not count. Missing files and
        // deleted text do not consume a step, and an unsuccessful scan leaves
        // the index untouched.
        for (
            let i = this.index + direction;
            i >= 0 && i < this.entries.length;
            i += direction
        ) {
            const entry = this.entries[i];
            const at = entry ? this.resolve(entry) : null;
            if (!at || (isValid && !isValid(at))) continue;
            target = i;
            if (--remaining <= 0) break;
        }
        return target;
    }

    clear(): void {
        this.truncateFrom(0);
    }

    getEntries(): JumpEntry[] {
        return this.entries.map(
            (entry) => this.resolve(entry) ?? this.snapshot(entry),
        );
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
        const nextEntries: Entry[] = [];
        for (let i = 0; i < this.entries.length; i++) {
            const entry = this.entries[i];
            if (!entry) continue;
            if (entry.filePath === path) {
                if (i <= this.index) removedBefore++;
                entry.mark?.clear();
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
        return this.getEntries();
    }

    deserialize(entries: JumpEntry[]): void {
        this.maxSize = getJumpListSize() || DEFAULT_MAX_ENTRIES;
        this.truncateFrom(0);
        this.entries = entries
            .slice(-this.maxSize)
            .map(({ filePath, line, ch }) => ({ filePath, line, ch }));
        this.index = this.entries.length - 1;
    }

    private push(entry: Entry): void {
        this.maxSize = getJumpListSize() || DEFAULT_MAX_ENTRIES;
        this.truncateFrom(this.index + 1);
        // Only the newest entry stands for the cursor.
        const previous = this.entries[this.entries.length - 1];
        if (previous) previous.landing = false;
        this.entries.push(entry);
        while (this.entries.length > this.maxSize) {
            this.entries.shift()?.mark?.clear();
        }
        this.index = this.entries.length - 1;
        this.onRecord?.();
    }

    /**
     * Drops the newest entry when it is where the last jump in this note
     * landed: the next jump starts from there or from where the cursor has
     * moved since, and Neovim records only that. Kept, it was an extra stop:
     * `a`, then `2j` and `G` in `b`, walked back to `b` twice before `a`,
     * where Neovim goes to `b:3` and then `a:1`.
     */
    private replaceLanding(filePath: string): void {
        const current = this.entries[this.index];
        if (current?.landing && current.filePath === filePath) {
            this.truncateFrom(this.index);
        }
    }

    /** Drops the entries from `start` on, releasing their marks. */
    private truncateFrom(start: number): void {
        for (const dropped of this.entries.splice(start)) {
            dropped.mark?.clear();
        }
        this.index = Math.min(this.index, this.entries.length - 1);
    }

    /** Whether the list is at `point` in `filePath` already. */
    private isAt(filePath: string, point: JumpPoint): boolean {
        const current = this.entries[this.index];
        const at = current ? this.resolve(current) : null;
        return (
            at?.filePath === filePath &&
            at.line === point.line &&
            at.ch === point.ch
        );
    }

    /**
     * The entry's position now, or `null` once the text it marked is deleted:
     * the editor's own list skips those, so this one does too.
     */
    private resolve(entry: Entry): JumpEntry | null {
        if (entry.mark) {
            const pos = entry.mark.find();
            if (pos === null) return null;
            if (pos === undefined) {
                // Its editor has gone; the last position it gave stands.
                entry.mark.clear();
                entry.mark = undefined;
            } else {
                entry.line = pos.line;
                entry.ch = pos.ch;
            }
        }
        return this.snapshot(entry);
    }

    private snapshot(entry: Entry): JumpEntry {
        return { filePath: entry.filePath, line: entry.line, ch: entry.ch };
    }

    private entryAt(index: number): JumpEntry | null {
        const entry = this.entries[index];
        return entry ? this.resolve(entry) : null;
    }
}
