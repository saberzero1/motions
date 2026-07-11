import { foldedRanges, foldEffect } from '@codemirror/language';
import type { EditorView } from '@codemirror/view';

const MAX_ENTRIES = 500;
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface FoldEntry {
    ranges: { from: number; to: number }[];
    ts: number;
}

export class FoldPersistenceStore {
    private data: Record<string, FoldEntry> = {};

    load(raw: Record<string, FoldEntry> | undefined): void {
        this.data = raw ?? {};
        this.evict();
    }

    save(): Record<string, FoldEntry> {
        this.evict();
        return { ...this.data };
    }

    capture(filePath: string, view: EditorView): void {
        const ranges: { from: number; to: number }[] = [];
        const folded = foldedRanges(view.state);
        const iter = folded.iter();
        while (iter.value) {
            ranges.push({ from: iter.from, to: iter.to });
            iter.next();
        }
        if (ranges.length === 0) {
            delete this.data[filePath];
        } else {
            this.data[filePath] = { ranges, ts: Date.now() };
        }
    }

    restore(filePath: string, view: EditorView): void {
        const entry = this.data[filePath];
        if (!entry || entry.ranges.length === 0) return;

        const docLength = view.state.doc.length;
        const validRanges = entry.ranges.filter(
            (r) => r.from >= 0 && r.to <= docLength && r.from < r.to,
        );
        if (validRanges.length === 0) return;

        const effects = validRanges.map((r) => foldEffect.of(r));
        try {
            view.dispatch({ effects });
        } catch {
            delete this.data[filePath];
        }
    }

    removePath(filePath: string): void {
        delete this.data[filePath];
    }

    renamePath(oldPath: string, newPath: string): void {
        const entry = this.data[oldPath];
        if (entry) {
            this.data[newPath] = entry;
            delete this.data[oldPath];
        }
    }

    private evict(): void {
        const now = Date.now();
        const entries = Object.entries(this.data);
        for (const [key, entry] of entries) {
            if (now - entry.ts > TTL_MS) {
                delete this.data[key];
            }
        }

        const remaining = Object.entries(this.data);
        if (remaining.length > MAX_ENTRIES) {
            remaining.sort((a, b) => a[1].ts - b[1].ts);
            const toRemove = remaining.length - MAX_ENTRIES;
            for (let i = 0; i < toRemove; i++) {
                const key = remaining[i]?.[0];
                if (key) delete this.data[key];
            }
        }
    }
}
