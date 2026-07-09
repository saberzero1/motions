import { prepareFuzzySearch } from 'obsidian';
import type { PickerItem, PickerMatch, PickerMatcher } from './types';
import { buildHighlights, buildHaystack } from './matcher-utils';

export function createObsidianMatcher(): PickerMatcher {
    return {
        search(query: string, items: PickerItem[]): PickerMatch[] {
            if (!query) {
                return items.map((item) => ({
                    item,
                    score: 0,
                    highlights: [],
                }));
            }

            const fuzzy = prepareFuzzySearch(query);
            const matches: PickerMatch[] = [];

            for (const item of items) {
                const haystack = buildHaystack(item);
                const result = fuzzy(haystack);
                if (!result) continue;
                const highlights = buildHighlights(item, result.matches);
                matches.push({
                    item,
                    score: result.score,
                    highlights: highlights.label,
                    descHighlights:
                        highlights.desc.length > 0
                            ? highlights.desc
                            : undefined,
                });
            }

            matches.sort((a, b) => b.score - a.score);
            return matches;
        },
    };
}
