export interface HarpoonItem {
    filePath: string;
    row: number;
    col: number;
}

export class HarpoonStore {
    private items: (HarpoonItem | null)[] = [];
    private _index = 0;

    load(data: (HarpoonItem | null)[]): void {
        this.items = data.map((item) => (item ? { ...item } : null));
        this._index = 0;
    }

    save(): (HarpoonItem | null)[] {
        return this.items.map((item) => (item ? { ...item } : null));
    }

    add(filePath: string, row: number, col: number): number {
        const existing = this.indexOfPath(filePath);
        if (existing !== -1) return existing;

        for (let i = 0; i < this.items.length; i++) {
            if (this.items[i] === null) {
                this.items[i] = { filePath, row, col };
                return i;
            }
        }

        const idx = this.items.length;
        this.items.push({ filePath, row, col });
        return idx;
    }

    remove(index: number): void {
        if (index >= 0 && index < this.items.length) {
            this.items[index] = null;
            this.trimTrailingNulls();
        }
    }

    removeByPath(filePath: string): void {
        const idx = this.indexOfPath(filePath);
        if (idx !== -1) this.remove(idx);
    }

    toggle(filePath: string, row: number, col: number): boolean {
        const idx = this.indexOfPath(filePath);
        if (idx !== -1) {
            this.remove(idx);
            return false;
        }
        this.add(filePath, row, col);
        return true;
    }

    get(index: number): HarpoonItem | null {
        return this.items[index] ?? null;
    }

    getByPath(filePath: string): { item: HarpoonItem; index: number } | null {
        const idx = this.indexOfPath(filePath);
        if (idx === -1) return null;
        const item = this.items[idx];
        return item ? { item, index: idx } : null;
    }

    getAll(): { item: HarpoonItem; index: number }[] {
        const result: { item: HarpoonItem; index: number }[] = [];
        for (let i = 0; i < this.items.length; i++) {
            const item = this.items[i];
            if (item) result.push({ item, index: i });
        }
        return result;
    }

    capacity(): number {
        for (let i = this.items.length - 1; i >= 0; i--) {
            if (this.items[i] !== null) return i + 1;
        }
        return 0;
    }

    count(): number {
        return this.items.filter((item) => item !== null).length;
    }

    updateCursor(filePath: string, row: number, col: number): void {
        const idx = this.indexOfPath(filePath);
        if (idx === -1) return;
        const item = this.items[idx];
        if (item) {
            item.row = row;
            item.col = col;
        }
    }

    renamePath(oldPath: string, newPath: string): void {
        const idx = this.indexOfPath(oldPath);
        if (idx === -1) return;
        const item = this.items[idx];
        if (item) item.filePath = newPath;
    }

    selectNext(wrap = true): HarpoonItem | null {
        const all = this.getAll();
        if (all.length === 0) return null;

        this._index++;
        if (this._index >= all.length) {
            this._index = wrap ? 0 : all.length - 1;
        }
        return all[this._index]?.item ?? null;
    }

    selectPrev(wrap = true): HarpoonItem | null {
        const all = this.getAll();
        if (all.length === 0) return null;

        this._index--;
        if (this._index < 0) {
            this._index = wrap ? all.length - 1 : 0;
        }
        return all[this._index]?.item ?? null;
    }

    private indexOfPath(filePath: string): number {
        for (let i = 0; i < this.items.length; i++) {
            if (this.items[i]?.filePath === filePath) return i;
        }
        return -1;
    }

    private trimTrailingNulls(): void {
        while (
            this.items.length > 0 &&
            this.items[this.items.length - 1] === null
        ) {
            this.items.pop();
        }
    }
}
