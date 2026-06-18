import type { VimPos, MotionFn } from '../types/vim-api';

const MAX_ENTRIES = 100;

export class ChangeList {
    private changes: VimPos[] = [];
    private index = -1;

    recordChange(line: number, ch: number): void {
        const last = this.changes[this.changes.length - 1];
        if (last && last.line === line && last.ch === ch) return;

        this.changes = this.changes.slice(0, this.index + 1);
        this.changes.push({ line, ch });
        if (this.changes.length > MAX_ENTRIES) this.changes.shift();
        this.index = this.changes.length - 1;
    }

    older(): VimPos | null {
        if (this.index <= 0) return null;
        this.index--;
        return this.changes[this.index] ?? null;
    }

    getEntries(): VimPos[] {
        return [...this.changes];
    }

    getIndex(): number {
        return this.index;
    }

    newer(): VimPos | null {
        if (this.index >= this.changes.length - 1) return null;
        this.index++;
        return this.changes[this.index] ?? null;
    }
}

export function createOlderChangeMotion(changeList: ChangeList): MotionFn {
    return (_cm, head) => {
        return changeList.older() ?? head;
    };
}

export function createNewerChangeMotion(changeList: ChangeList): MotionFn {
    return (_cm, head) => {
        return changeList.newer() ?? head;
    };
}
