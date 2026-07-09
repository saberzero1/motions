import { bench, describe } from 'vitest';
import { createUFuzzyMatcher } from '../../src/picker/matcher-ufuzzy';
import { createObsidianMatcher } from '../../src/picker/matcher-obsidian';
import {
    buildHaystack,
    buildHighlights,
    indicesToRanges,
    utf32ToUtf16Indices,
} from '../../src/picker/matcher-utils';
import type { PickerItem, PickerMatcher } from '../../src/picker/types';

function createTestNucleoMatcher(): PickerMatcher | null {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mod = require('nucleo-matcher-wasm') as Record<string, unknown>;
        const NucleoMatcherCls = mod.NucleoMatcher as new (
            items: string[],
            options?: Record<string, unknown>,
        ) => Record<string, unknown>;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let nucleo: any = null;
        let lastHaystackKey = '';

        return {
            search(query: string, items: PickerItem[]) {
                const haystack = items.map(buildHaystack);
                const haystackKey = `${haystack.length}`;

                if (!nucleo) {
                    nucleo = new NucleoMatcherCls(haystack, {
                        matchPaths: true,
                        caseMatching: 'smart',
                        normalization: 'smart',
                    });
                    lastHaystackKey = haystackKey;
                } else if (haystackKey !== lastHaystackKey) {
                    nucleo.setItems(haystack);
                    lastHaystackKey = haystackKey;
                }

                if (!query) {
                    return items.map((it) => ({
                        item: it,
                        score: 0,
                        highlights: [] as [number, number][],
                    }));
                }

                const result = nucleo.matchLiteralIndexedWithIndices(
                    query,
                    'fuzzy',
                    { maxResults: 500 },
                ) as {
                    indices: Uint32Array;
                    scores: Uint32Array;
                    charIndices: Uint32Array[];
                };

                const total = result.indices.length;
                const matches = [];
                for (let i = 0; i < total; i++) {
                    const itemIdx = result.indices[i]!;
                    const it = items[itemIdx];
                    if (!it) continue;
                    const rawIndices = Array.from(result.charIndices[i] ?? []);
                    const utf16Indices = utf32ToUtf16Indices(
                        haystack[itemIdx]!,
                        rawIndices,
                    );
                    const ranges = indicesToRanges(utf16Indices);
                    const highlights = buildHighlights(it, ranges);
                    matches.push({
                        item: it,
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
    } catch {
        return null;
    }
}

const TAGS = [
    'project',
    'meeting',
    'journal',
    'research',
    'idea',
    'todo',
    'reference',
    'draft',
    'review',
    'archive',
];

const FOLDERS = [
    'notes',
    'projects',
    'daily',
    'weekly',
    'templates',
    'attachments',
    'references',
    'work',
    'personal',
    'archive',
];

function generateItems(count: number): PickerItem[] {
    const items: PickerItem[] = [];
    for (let i = 0; i < count; i++) {
        const folder = FOLDERS[i % FOLDERS.length]!;
        const tag = TAGS[i % TAGS.length]!;
        const name = `${tag}-${String(i).padStart(5, '0')}`;
        const path = `${folder}/${name}.md`;
        items.push({
            id: path,
            label: `${name}.md`,
            description: path,
            filterValue: `${name}.md ${path}`,
        });
    }
    return items;
}

const QUERIES = [
    'proj meet',
    'config sett',
    'daily journal',
    'ref arch',
    'todo',
    'a',
    'notes/project',
    'draft review idea',
];

const sizes = [1_000, 5_000, 10_000] as const;

for (const size of sizes) {
    const items = generateItems(size);

    describe(`${size} items`, () => {
        const ufuzzy = createUFuzzyMatcher();
        const obsidian = createObsidianMatcher();
        const nucleo = createTestNucleoMatcher();

        for (const query of QUERIES) {
            bench(`ufuzzy: "${query}"`, () => {
                ufuzzy.search(query, items);
            });

            bench(`obsidian: "${query}"`, () => {
                obsidian.search(query, items);
            });

            if (nucleo) {
                bench(`nucleo: "${query}"`, () => {
                    nucleo.search(query, items);
                });
            }
        }
    });
}
