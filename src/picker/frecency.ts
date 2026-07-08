export interface FrecencyEntry {
    count: number;
    timestamps: number[];
}

export type FrecencyData = Record<string, FrecencyEntry>;

const ONE_HOUR = 60 * 60 * 1000;
const ONE_DAY = 24 * ONE_HOUR;
const MAX_ENTRIES = 1000;
const PRUNE_AGE_MS = 90 * ONE_DAY;

const SCORE_BUCKETS: Array<{ maxAge: number; weight: number }> = [
    { maxAge: ONE_HOUR, weight: 100 },
    { maxAge: ONE_DAY, weight: 80 },
    { maxAge: 3 * ONE_DAY, weight: 60 },
    { maxAge: 7 * ONE_DAY, weight: 40 },
    { maxAge: 14 * ONE_DAY, weight: 20 },
    { maxAge: 30 * ONE_DAY, weight: 10 },
    { maxAge: Number.POSITIVE_INFINITY, weight: 5 },
];

function weightForAge(ageMs: number): number {
    for (const bucket of SCORE_BUCKETS) {
        if (ageMs <= bucket.maxAge) return bucket.weight;
    }
    return 5;
}

export class FrecencyStore {
    private entries = new Map<string, FrecencyEntry>();

    recordAccess(id: string): void {
        if (!id) return;
        const now = Date.now();
        const entry = this.entries.get(id) ?? { count: 0, timestamps: [] };
        entry.count += 1;
        entry.timestamps.push(now);
        this.entries.set(id, entry);
        this.enforceEntryCap(now);
    }

    getScore(id: string): number {
        const entry = this.entries.get(id);
        if (!entry) return 0;
        return this.getScoreForEntry(entry, Date.now());
    }

    serialize(): FrecencyData {
        const now = Date.now();
        const result: FrecencyData = {};
        for (const [id, entry] of this.entries) {
            const timestamps = entry.timestamps.filter(
                (timestamp) => now - timestamp <= PRUNE_AGE_MS,
            );
            if (timestamps.length === 0) {
                this.entries.delete(id);
                continue;
            }
            const count = Math.min(entry.count, timestamps.length);
            const updated: FrecencyEntry = {
                count,
                timestamps,
            };
            this.entries.set(id, updated);
            result[id] = { count, timestamps: [...timestamps] };
        }
        return result;
    }

    deserialize(data: FrecencyData): void {
        this.entries.clear();
        if (!data) return;
        for (const [id, entry] of Object.entries(data)) {
            if (!entry || !Array.isArray(entry.timestamps)) continue;
            const count =
                typeof entry.count === 'number' && entry.count > 0
                    ? entry.count
                    : entry.timestamps.length;
            this.entries.set(id, {
                count,
                timestamps: entry.timestamps.filter(
                    (timestamp) => typeof timestamp === 'number',
                ),
            });
        }
        this.enforceEntryCap(Date.now());
    }

    clear(): void {
        this.entries.clear();
    }

    private getScoreForEntry(entry: FrecencyEntry, now: number): number {
        let total = 0;
        for (const timestamp of entry.timestamps) {
            total += weightForAge(now - timestamp);
        }
        const scale = Math.log2(entry.count + 1);
        return total * scale;
    }

    private enforceEntryCap(now: number): void {
        if (this.entries.size <= MAX_ENTRIES) return;
        const scored = Array.from(this.entries.entries()).map(
            ([id, entry]) => ({
                id,
                score: this.getScoreForEntry(entry, now),
            }),
        );
        scored.sort((a, b) => a.score - b.score);
        const excess = this.entries.size - MAX_ENTRIES;
        for (let i = 0; i < excess; i++) {
            const entry = scored[i];
            if (entry) this.entries.delete(entry.id);
        }
    }
}
