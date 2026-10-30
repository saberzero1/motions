import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The picker's Style Settings entries and the CSS that reads them name the
 * same variables and classes (#171). Style Settings sets a variable by its
 * `id`, so a typo on either side would leave a setting that does nothing.
 */

const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
const start = css.indexOf('/* @settings');
const end = css.indexOf('\n*/', start);
const settings = css.slice(start, end);
const rules = css.slice(0, start) + css.slice(end);

const pickerEntries = [
    ...settings.matchAll(
        /id: (vim-motions-picker-[\w-]+)\n\s+title: [^\n]+\n(?:\s+description: [^\n]+\n)?\s+type: ([\w-]+)/g,
    ),
].map((m) => ({ id: m[1]!, type: m[2]! }));

describe('picker Style Settings', () => {
    it('lists the picker settings', () => {
        expect(pickerEntries.map((e) => e.id).sort()).toEqual(
            [
                'vim-motions-picker-font',
                'vim-motions-picker-font-size',
                'vim-motions-picker-height',
                'vim-motions-picker-mono-icons',
                'vim-motions-picker-no-icons',
                'vim-motions-picker-preview-font-size',
                'vim-motions-picker-results-width',
                'vim-motions-picker-truncate',
                'vim-motions-picker-width',
            ].sort(),
        );
    });

    it('each variable is read by a rule, and each class is styled', () => {
        const unused = pickerEntries.filter((e) =>
            e.type === 'class-toggle'
                ? !rules.includes(`.${e.id} `)
                : !rules.includes(`var(--${e.id},`),
        );

        expect(unused).toEqual([]);
    });

    it('every picker variable a rule reads has a setting, apart from internal ones', () => {
        const read = new Set(
            [...rules.matchAll(/var\(\s*--(vim-motions-picker-[\w-]+)/g)].map(
                (m) => m[1]!,
            ),
        );
        // Internal: set per item by the picker, and per file type by the
        // icon rules, which carry their own --vim-motions-icon-* overrides.
        read.delete('vim-motions-picker-depth');
        read.delete('vim-motions-picker-icon');
        read.delete('vim-motions-picker-icon-color');
        const listed = new Set(pickerEntries.map((e) => e.id));

        expect([...read].filter((id) => !listed.has(id))).toEqual([]);
    });
});
