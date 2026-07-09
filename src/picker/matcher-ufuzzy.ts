import uFuzzy from '@leeoniya/ufuzzy';
import type { PickerItem, PickerMatch, PickerMatcher } from './types';
import { toPairs, buildHighlights, buildHaystack } from './matcher-utils';

const fuzzy = new uFuzzy({ unicode: true });

const INFO_BUDGET = 500;

function filePickerSort(
    info: uFuzzy.Info,
    haystack: string[],
    needle: string,
): number[] {
    const needleLower = needle.toLowerCase();
    const terms = needleLower.split(/\s+/).filter(Boolean);
    const lastTerm = terms[terms.length - 1] ?? needleLower;
    const total = info.idx.length;
    const order: number[] = [];
    for (let j = 0; j < total; j++) order.push(j);

    order.sort((a, b) => {
        const aPath = haystack[info.idx[a]!]!;
        const bPath = haystack[info.idx[b]!]!;
        const aSlash = aPath.lastIndexOf('/');
        const bSlash = bPath.lastIndexOf('/');
        const aFile = aPath.slice(aSlash + 1).toLowerCase();
        const bFile = bPath.slice(bSlash + 1).toLowerCase();

        const aPrefix = aFile.startsWith(lastTerm);
        const bPrefix = bFile.startsWith(lastTerm);
        if (aPrefix !== bPrefix) return aPrefix ? -1 : 1;

        if (aPrefix && bPrefix) {
            const aDot = aFile.lastIndexOf('.');
            const bDot = bFile.lastIndexOf('.');
            const aBase = aDot >= 0 ? aFile.slice(0, aDot) : aFile;
            const bBase = bDot >= 0 ? bFile.slice(0, bDot) : bFile;
            if (aBase.length !== bBase.length)
                return aBase.length - bBase.length;
        }

        const aInFile = info.start[a]! > aSlash;
        const bInFile = info.start[b]! > bSlash;
        if (aInFile !== bInFile) return aInFile ? -1 : 1;

        const termDiff = (info.terms[b] ?? 0) - (info.terms[a] ?? 0);
        if (termDiff !== 0) return termDiff;

        const interDiff = (info.interIns[a] ?? 0) - (info.interIns[b] ?? 0);
        if (interDiff !== 0) return interDiff;

        return aPath.length - bPath.length;
    });

    return order;
}

export function createUFuzzyMatcher(): PickerMatcher {
    return {
        search(query: string, items: PickerItem[]): PickerMatch[] {
            if (!query) {
                return items.map((item) => ({
                    item,
                    score: 0,
                    highlights: [],
                }));
            }

            const haystack = items.map(buildHaystack);
            const idxs = fuzzy.filter(haystack, query);

            if (!idxs) {
                return items.map((item) => ({
                    item,
                    score: 0,
                    highlights: [],
                }));
            }

            if (idxs.length === 0) {
                return [];
            }

            const needleLower = query.toLowerCase();
            const terms = needleLower.split(/\s+/).filter(Boolean);
            const lastTerm = terms[terms.length - 1] ?? needleLower;

            let toScore: number[];
            if (idxs.length <= INFO_BUDGET) {
                toScore = idxs;
            } else {
                const prefixIdxs: number[] = [];
                const otherIdxs: number[] = [];
                for (const idx of idxs) {
                    const path = haystack[idx]!;
                    const slash = path.lastIndexOf('/');
                    const file = path.slice(slash + 1).toLowerCase();
                    if (file.startsWith(lastTerm)) {
                        prefixIdxs.push(idx);
                    } else if (otherIdxs.length < INFO_BUDGET) {
                        otherIdxs.push(idx);
                    }
                }
                toScore = [
                    ...prefixIdxs,
                    ...otherIdxs.slice(0, INFO_BUDGET - prefixIdxs.length),
                ];
            }

            const info = fuzzy.info(toScore, haystack, query);
            const order = filePickerSort(info, haystack, query);

            const matches: PickerMatch[] = [];
            const total = order.length;
            for (let i = 0; i < total; i++) {
                const infoIdx = order[i]!;
                const itemIndex = info.idx[infoIdx]!;
                const item = items[itemIndex]!;
                const ranges = toPairs(info.ranges[infoIdx] ?? []);
                const highlights = buildHighlights(item, ranges);
                matches.push({
                    item,
                    score: total - i,
                    highlights: highlights.label,
                    descHighlights:
                        highlights.desc.length > 0
                            ? highlights.desc
                            : undefined,
                });
            }
            return matches;
        },
    };
}
