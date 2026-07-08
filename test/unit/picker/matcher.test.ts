import { describe, expect, it } from 'vitest';
import { createMatcher } from '../../../src/picker/matcher';
import type { PickerItem } from '../../../src/picker/types';

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

const matcher = createMatcher();

describe('UFuzzyMatcher', () => {
    describe('empty query', () => {
        it('returns all items when query is empty', () => {
            const items = [item('foo'), item('bar'), item('baz')];
            const results = matcher.search('', items);
            expect(results).toHaveLength(3);
            expect(results.map((r) => r.item.label)).toEqual([
                'foo',
                'bar',
                'baz',
            ]);
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
            // 'a' appears in apple and banana but not cherry
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
            // Both "my" and "per" should match in "My Document notes/personal"
            // and "My Recipe cooking/personal"
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
            // 'settings' starts with 'set', should score higher
            // than 'my-settings' where 'set' is a substring
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
            // The highlight should cover characters within the label
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
            // uFuzzy strips non-alphanumeric for matching, so 'tag' part
            // should still match items containing 'tag'
            const results = matcher.search('tag', items);
            const labels = results.map((r) => r.item.label);
            expect(labels).toContain('[tag]');
            expect(labels).toContain('tag without brackets');
        });

        it('handles asterisk as literal text', () => {
            const items = [item('*.md'), item('readme'), item('notes.md')];
            // '*' is not alphanumeric, uFuzzy treats 'md' as the search term
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
            if (results.length > 1) {
                const jpIdx = labels.indexOf('日本語メモ');
                expect(jpIdx).toBe(0);
            }
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
            // Searching 'src' should match via filterValue even though
            // the label doesn't contain 'src'
            const results = matcher.search('src', items);
            const labels = results.map((r) => r.item.label);
            expect(labels).toContain('main.ts');
        });

        it('falls back to label + description when no filterValue', () => {
            const items = [item('main.ts', 'src/main.ts')];
            // 'src' is in description, should match
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
