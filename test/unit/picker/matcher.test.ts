import { describe, expect, it } from 'vitest';
import { createUFuzzyMatcher } from '../../../src/picker/matcher-ufuzzy';
import { createObsidianMatcher } from '../../../src/picker/matcher-obsidian';
import {
    indicesToRanges,
    utf32ToUtf16Indices,
} from '../../../src/picker/matcher-utils';
import type { PickerItem, PickerMatcher } from '../../../src/picker/types';

function item(label: string, description?: string): PickerItem {
    return { id: label, label, description };
}

function itemWithFilter(
    label: string,
    filterValue: string,
    description?: string,
): PickerItem {
    return { id: label, label, description, filterValue };
}

const engines: [string, () => PickerMatcher][] = [
    ['ufuzzy', createUFuzzyMatcher],
    ['obsidian', createObsidianMatcher],
];

describe.each(engines)('%s matcher', (_name, factory) => {
    const matcher = factory();

    describe('empty query', () => {
        it('returns all items when query is empty', () => {
            const items = [item('foo'), item('bar'), item('baz')];
            const results = matcher.search('', items);
            expect(results).toHaveLength(3);
        });

        it('returns items with score 0 and empty highlights', () => {
            const items = [item('foo')];
            const results = matcher.search('', items);
            expect(results[0]!.score).toBe(0);
            expect(results[0]!.highlights).toEqual([]);
        });
    });

    describe('empty items', () => {
        it('returns empty results for empty items array', () => {
            const results = matcher.search('foo', []);
            expect(results).toHaveLength(0);
        });
    });

    describe('single character filtering', () => {
        it('filters items matching a single character', () => {
            const items = [item('apple'), item('banana'), item('cherry')];
            const results = matcher.search('a', items);
            const labels = results.map((r) => r.item.label);
            expect(labels).toContain('apple');
            expect(labels).toContain('banana');
            expect(labels).not.toContain('cherry');
        });
    });

    describe('multi-word query', () => {
        it('matches items containing both terms', () => {
            const items = [
                item('My Document', 'notes/personal'),
                item('Work Report', 'notes/work'),
                item('My Recipe', 'cooking/personal'),
            ];
            const results = matcher.search('my per', items);
            const labels = results.map((r) => r.item.label);
            expect(labels).toContain('My Document');
            expect(labels).toContain('My Recipe');
            expect(labels).not.toContain('Work Report');
        });
    });

    describe('scoring', () => {
        it('scores exact prefix match higher than substring match', () => {
            const items = [
                item('settings'),
                item('my-settings'),
                item('reset'),
            ];
            const results = matcher.search('set', items);
            const matchedLabels = results.map((r) => r.item.label);
            expect(matchedLabels).toContain('settings');
            if (matchedLabels.includes('my-settings')) {
                const settingsIdx = matchedLabels.indexOf('settings');
                const mySettingsIdx = matchedLabels.indexOf('my-settings');
                expect(settingsIdx).toBeLessThan(mySettingsIdx);
            }
        });
    });

    describe('highlights', () => {
        it('returns highlight ranges for matched characters', () => {
            const items = [item('foobar')];
            const results = matcher.search('foo', items);
            expect(results).toHaveLength(1);
            const match = results[0]!;
            expect(match.highlights.length).toBeGreaterThan(0);
            for (const [start, end] of match.highlights) {
                expect(start).toBeGreaterThanOrEqual(0);
                expect(end).toBeLessThanOrEqual(match.item.label.length);
                expect(end).toBeGreaterThan(start);
            }
        });

        it('produces highlight ranges within label bounds', () => {
            const items = [
                itemWithFilter('main.ts', 'main.ts src/main.ts', 'src/main.ts'),
            ];
            const results = matcher.search('main', items);
            expect(results).toHaveLength(1);
            const match = results[0]!;
            for (const [start, end] of match.highlights) {
                expect(start).toBeGreaterThanOrEqual(0);
                expect(end).toBeLessThanOrEqual('main.ts'.length);
            }
        });
    });

    describe('special characters', () => {
        it('handles bracket characters as literal text', () => {
            const items = [
                item('[tag]'),
                item('normal text'),
                item('tag without brackets'),
            ];
            const results = matcher.search('tag', items);
            const labels = results.map((r) => r.item.label);
            expect(labels).toContain('[tag]');
            expect(labels).toContain('tag without brackets');
        });

        it('handles asterisk as literal text', () => {
            const items = [item('*.md'), item('readme'), item('notes.md')];
            const results = matcher.search('md', items);
            const labels = results.map((r) => r.item.label);
            expect(labels).toContain('*.md');
            expect(labels).toContain('notes.md');
        });

        it('handles parentheses as literal text', () => {
            const items = [
                item('function(args)'),
                item('constant'),
                item('function call'),
            ];
            const results = matcher.search('func', items);
            const labels = results.map((r) => r.item.label);
            expect(labels).toContain('function(args)');
            expect(labels).toContain('function call');
        });

        it('handles dollar sign as literal text', () => {
            const items = [item('$100'), item('price'), item('dollar')];
            const results = matcher.search('100', items);
            const labels = results.map((r) => r.item.label);
            expect(labels).toContain('$100');
        });
    });

    describe('unicode filenames', () => {
        it('matches CJK characters', () => {
            const items = [
                item('日本語メモ'),
                item('english note'),
                item('中文笔记'),
            ];
            const results = matcher.search('日本', items);
            const labels = results.map((r) => r.item.label);
            expect(labels).toContain('日本語メモ');
        });

        it('matches emoji in filenames', () => {
            const items = [
                item('🎉 party notes'),
                item('regular notes'),
                item('🎉 celebration'),
            ];
            const results = matcher.search('party', items);
            const labels = results.map((r) => r.item.label);
            expect(labels).toContain('🎉 party notes');
        });

        it('matches accented characters', () => {
            const items = [
                item('café menu'),
                item('resume'),
                item('naïve approach'),
            ];
            const results = matcher.search('café', items);
            const labels = results.map((r) => r.item.label);
            expect(labels).toContain('café menu');
        });
    });

    describe('filterValue', () => {
        it('uses filterValue when provided', () => {
            const items = [
                itemWithFilter('main.ts', 'main.ts src/', 'src/'),
                itemWithFilter('test.ts', 'test.ts test/', 'test/'),
            ];
            const results = matcher.search('src', items);
            const labels = results.map((r) => r.item.label);
            expect(labels).toContain('main.ts');
        });

        it('falls back to label + description when no filterValue', () => {
            const items = [item('main.ts', 'src/main.ts')];
            const results = matcher.search('src', items);
            expect(results).toHaveLength(1);
            expect(results[0]!.item.label).toBe('main.ts');
        });
    });

    describe('no matches', () => {
        it('returns empty array when nothing matches', () => {
            const items = [item('apple'), item('banana'), item('cherry')];
            const results = matcher.search('xyz', items);
            expect(results).toHaveLength(0);
        });
    });
});

describe('matcher-utils', () => {
    describe('indicesToRanges', () => {
        it('converts consecutive indices to ranges', () => {
            expect(indicesToRanges([3, 4, 5, 10, 11])).toEqual([
                [3, 6],
                [10, 12],
            ]);
        });

        it('handles single index', () => {
            expect(indicesToRanges([5])).toEqual([[5, 6]]);
        });

        it('handles empty array', () => {
            expect(indicesToRanges([])).toEqual([]);
        });

        it('handles non-consecutive indices', () => {
            expect(indicesToRanges([1, 3, 5])).toEqual([
                [1, 2],
                [3, 4],
                [5, 6],
            ]);
        });
    });

    describe('utf32ToUtf16Indices', () => {
        it('passes through ASCII indices unchanged', () => {
            expect(utf32ToUtf16Indices('hello', [0, 1, 2])).toEqual([0, 1, 2]);
        });

        it('adjusts indices after emoji (surrogate pair)', () => {
            const text = '🎉 hello';
            const result = utf32ToUtf16Indices(text, [0, 2, 3]);
            expect(result[0]).toBe(0);
            expect(result[1]).toBe(3);
            expect(result[2]).toBe(4);
        });

        it('handles multiple emoji', () => {
            const text = '🎉🎊 hi';
            const result = utf32ToUtf16Indices(text, [2, 3]);
            expect(result[0]).toBe(4);
            expect(result[1]).toBe(5);
        });

        it('handles empty indices', () => {
            expect(utf32ToUtf16Indices('hello', [])).toEqual([]);
        });
    });
});
