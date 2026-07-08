import uFuzzy from '@leeoniya/ufuzzy';
import type { PickerItem, PickerMatch, PickerMatcher } from './types';

const fuzzy = new uFuzzy({ unicode: true });

function toPairs(ranges: number[]): [number, number][] {
    const pairs: [number, number][] = [];
    for (let i = 0; i < ranges.length; i += 2) {
        const start = ranges[i];
        const end = ranges[i + 1];
        if (start === undefined || end === undefined) break;
        pairs.push([start, end]);
    }
    return pairs;
}

function mapRangesToSegment(
    ranges: [number, number][],
    start: number,
    end: number,
): [number, number][] {
    const result: [number, number][] = [];
    for (const [rangeStart, rangeEnd] of ranges) {
        if (rangeEnd <= start || rangeStart >= end) continue;
        const clampedStart = Math.max(rangeStart, start) - start;
        const clampedEnd = Math.min(rangeEnd, end) - start;
        if (clampedEnd > clampedStart) {
            result.push([clampedStart, clampedEnd]);
        }
    }
    return result;
}

function buildHighlights(
    item: PickerItem,
    ranges: [number, number][],
): { label: [number, number][]; desc: [number, number][] } {
    const label = item.label;
    const description = item.description ?? '';
    const base = item.filterValue ?? `${label} ${description}`;
    const labelStart = 0;
    const labelEnd = label.length;
    const descStart = description ? base.indexOf(description, labelEnd) : -1;
    const descEnd = descStart >= 0 ? descStart + description.length : descStart;

    const labelHighlights = mapRangesToSegment(ranges, labelStart, labelEnd);
    const descHighlights =
        descStart >= 0 ? mapRangesToSegment(ranges, descStart, descEnd) : [];

    return { label: labelHighlights, desc: descHighlights };
}

export function createMatcher(): PickerMatcher {
    return {
        search(query: string, items: PickerItem[]): PickerMatch[] {
            if (!query) {
                return items.map((item) => ({
                    item,
                    score: 0,
                    highlights: [],
                }));
            }

            const haystack = items.map(
                (item) =>
                    item.filterValue ??
                    `${item.label} ${item.description ?? ''}`,
            );

            const [idxs, info, order] = fuzzy.search(haystack, query, 1);

            if (!idxs && !info && !order) {
                return items.map((item) => ({
                    item,
                    score: 0,
                    highlights: [],
                }));
            }

            if (idxs && !info && !order) {
                return idxs.map((idx) => ({
                    item: items[idx]!,
                    score: 0,
                    highlights: [],
                }));
            }

            if (!idxs || !info || !order) {
                return [];
            }

            const matches: PickerMatch[] = [];
            const total = order.length;
            for (let i = 0; i < order.length; i++) {
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
