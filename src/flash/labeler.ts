import type { Target, LabeledTarget } from '../easymotion/types';

function targetId(t: Target): string {
    return `${t.line}:${t.ch}`;
}

function sortByDistance(
    targets: Target[],
    cursorLine: number,
    cursorCh: number,
): Target[] {
    return [...targets].sort((a, b) => {
        const distA =
            Math.abs(a.line - cursorLine) * 10000 + Math.abs(a.ch - cursorCh);
        const distB =
            Math.abs(b.line - cursorLine) * 10000 + Math.abs(b.ch - cursorCh);
        return distA - distB;
    });
}

function buildLabels(
    sorted: Target[],
    keys: string[],
    skipChars: Set<string>,
    reuse: Map<string, string>,
): LabeledTarget[] {
    const K = keys.length;
    const N = sorted.length;
    if (N === 0 || K === 0) return [];

    const available = keys.filter((k) => !skipChars.has(k.toLowerCase()));
    const A = available.length;
    if (A === 0) return [];

    const labeled: LabeledTarget[] = [];
    const usedLabels = new Set<string>();

    for (const t of sorted) {
        const id = targetId(t);
        const prev = reuse.get(id);
        if (prev && !usedLabels.has(prev)) {
            labeled.push({ ...t, label: prev });
            usedLabels.add(prev);
        }
    }

    const unlabeled = sorted.filter(
        (t) => !labeled.some((l) => l.line === t.line && l.ch === t.ch),
    );
    const remainingKeys = available.filter((k) => !usedLabels.has(k));

    if (unlabeled.length <= remainingKeys.length) {
        for (let i = 0; i < unlabeled.length; i++) {
            const label = remainingKeys[i]!;
            labeled.push({ ...unlabeled[i]!, label });
        }
    } else {
        const rK = remainingKeys.length;
        if (rK === 0) return labeled;
        const groupCount = Math.min(
            rK,
            Math.ceil((unlabeled.length - rK) / (rK - 1)),
        );
        const singleCount = rK - groupCount;

        for (let i = 0; i < singleCount && i < unlabeled.length; i++) {
            labeled.push({ ...unlabeled[i]!, label: remainingKeys[i]! });
        }

        let idx = singleCount;
        for (let g = 0; g < groupCount && idx < unlabeled.length; g++) {
            const prefix = remainingKeys[singleCount + g]!;
            for (let s = 0; s < rK && idx < unlabeled.length; s++) {
                labeled.push({
                    ...unlabeled[idx]!,
                    label: prefix + remainingKeys[s]!,
                });
                idx++;
            }
        }
    }

    return labeled;
}

export class FlashLabeler {
    private reuse = new Map<string, string>();
    private keys: string[] = [];

    reset(chars: string): void {
        this.keys = [...chars];
        this.reuse.clear();
    }

    assign(
        targets: Target[],
        chars: string,
        cursorLine: number,
        cursorCh: number,
        skipChars?: Set<string>,
    ): LabeledTarget[] {
        this.keys = [...chars];
        const sorted = sortByDistance(targets, cursorLine, cursorCh);
        const labeled = buildLabels(
            sorted,
            this.keys,
            skipChars ?? new Set(),
            this.reuse,
        );

        this.reuse.clear();
        for (const l of labeled) {
            this.reuse.set(targetId(l), l.label);
        }

        return labeled;
    }
}

export function assignFlashLabels(
    targets: Target[],
    chars: string,
    cursorLine: number,
    cursorCh: number,
): LabeledTarget[] {
    const keys = [...chars];
    const K = keys.length;
    const N = targets.length;

    if (N === 0 || K === 0) return [];

    const sorted = sortByDistance(targets, cursorLine, cursorCh);

    if (N <= K) {
        return sorted.map((t, i) => ({ ...t, label: keys[i]! }));
    }

    const labeled: LabeledTarget[] = [];
    const groupCount = Math.min(K, Math.ceil((N - K) / (K - 1)));
    const singleCount = K - groupCount;

    for (let i = 0; i < singleCount && i < N; i++) {
        labeled.push({ ...sorted[i]!, label: keys[i]! });
    }

    let targetIdx = singleCount;
    for (let g = 0; g < groupCount && targetIdx < N; g++) {
        const prefix = keys[singleCount + g]!;
        for (let s = 0; s < K && targetIdx < N; s++) {
            labeled.push({
                ...sorted[targetIdx]!,
                label: prefix + keys[s]!,
            });
            targetIdx++;
        }
    }

    return labeled;
}
