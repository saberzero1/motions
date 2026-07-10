export interface PersistedMark {
    name: string;
    filePath: string;
    line: number;
    ch: number;
}

const GLOBAL_MARK_RE = /^[A-Z]$/;

export class MarkStore {
    private marks: Map<string, PersistedMark> = new Map();

    load(data: PersistedMark[]): void {
        this.marks.clear();
        for (const m of data) {
            if (GLOBAL_MARK_RE.test(m.name)) {
                this.marks.set(m.name, m);
            }
        }
    }

    save(): PersistedMark[] {
        return [...this.marks.values()];
    }

    set(name: string, filePath: string, line: number, ch: number): void {
        if (!GLOBAL_MARK_RE.test(name)) return;
        this.marks.set(name, { name, filePath, line, ch });
    }

    get(name: string): PersistedMark | undefined {
        return this.marks.get(name);
    }

    delete(name: string): void {
        this.marks.delete(name);
    }

    getAll(): PersistedMark[] {
        return [...this.marks.values()];
    }

    has(name: string): boolean {
        return this.marks.has(name);
    }

    get size(): number {
        return this.marks.size;
    }
}
