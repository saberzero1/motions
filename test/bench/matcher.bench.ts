import { bench, describe } from 'vitest';
import { createUFuzzyMatcher } from '../../src/picker/matcher-ufuzzy';
import { createObsidianMatcher } from '../../src/picker/matcher-obsidian';
import type { PickerItem } from '../../src/picker/types';

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

        for (const query of QUERIES) {
            bench(`ufuzzy: "${query}"`, () => {
                ufuzzy.search(query, items);
            });

            bench(`obsidian: "${query}"`, () => {
                obsidian.search(query, items);
            });
        }
    });
}
