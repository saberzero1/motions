import type { Target, LabeledTarget } from './types';

/**
 * SCTree (Single-Character Tree) label assignment.
 *
 * Targets are assumed to be pre-sorted by proximity (closest first).
 * Nearby targets get single-char labels; distant targets get 2-char labels.
 * When N <= K: all single-char.  When N > K: first batch single-char,
 * remaining grouped under prefix chars with suffix chars per group.
 */
export function assignLabels(
    targets: Target[],
    chars: string,
): LabeledTarget[] {
    const keys = [...chars];
    const K = keys.length;
    const N = targets.length;

    if (N === 0 || K === 0) return [];

    if (N <= K) {
        return targets.map((t, i) => ({ ...t, label: keys[i]! }));
    }

    const labeled: LabeledTarget[] = [];

    // How many groups of 2-char labels do we need?
    // Each group uses 1 prefix key and up to K suffix keys.
    // We want: singleCount + groupCount = K, and
    //          singleCount + groupCount * K >= N
    // Solving: groupCount = ceil((N - K) / (K - 1))
    const groupCount = Math.min(K, Math.ceil((N - K) / (K - 1)));
    const singleCount = K - groupCount;

    // Assign single-char labels to the closest targets
    for (let i = 0; i < singleCount && i < N; i++) {
        labeled.push({ ...targets[i]!, label: keys[i]! });
    }

    // Assign 2-char labels to remaining targets
    let targetIdx = singleCount;
    for (let g = 0; g < groupCount && targetIdx < N; g++) {
        const prefix = keys[singleCount + g]!;
        for (let s = 0; s < K && targetIdx < N; s++) {
            labeled.push({
                ...targets[targetIdx]!,
                label: prefix + keys[s]!,
            });
            targetIdx++;
        }
    }

    return labeled;
}
