import { browser, expect } from '@wdio/globals';
import { handleEx, loadSingleFileWorkspace } from '../helpers';

// The floating "Results" title must not cover the first result (#171). It
// took its height from the theme's line height, so a theme with a taller one
// covered the first result, and the default only just cleared it: the title
// ended 1.2 px into the first result's box.

interface Clearance {
    /** The first result's top edge, less the title's bottom edge. */
    item: number;
    /** The same for the first result's text. */
    label: number;
}

async function clearance(lineHeight: string | null): Promise<Clearance> {
    await browser.execute((value: string | null) => {
        document.body.style.lineHeight = value ?? '';
    }, lineHeight);
    await handleEx('files');
    await browser.pause(800);
    const measured = (await browser.execute(() => {
        const title = Array.from(
            document.querySelectorAll('.vim-motions-picker-title'),
        ).find((el) => el.textContent === 'Results');
        const item = document.querySelector(
            '.vim-motions-picker-results .vim-motions-picker-item',
        );
        const label = item?.querySelector('.vim-motions-picker-item-label');
        if (!title || !item || !label) return null;
        const bottom = title.getBoundingClientRect().bottom;
        const round = (n: number) => Math.round(n * 10) / 10;
        return {
            item: round(item.getBoundingClientRect().top - bottom),
            label: round(label.getBoundingClientRect().top - bottom),
        };
    })) as Clearance | null;
    await browser.keys(['Escape']);
    await browser.pause(300);
    if (!measured) throw new Error('no picker results to measure');
    return measured;
}

describe('Picker results title (#171)', function () {
    beforeEach(async function () {
        await loadSingleFileWorkspace();
    });

    afterEach(async function () {
        await browser.execute(() => {
            document.body.style.lineHeight = '';
        });
    });

    it('clears the first result in the default theme', async function () {
        const { item, label } = await clearance(null);
        expect({ itemClear: item >= 0, labelGap: label >= 4 }).toEqual({
            itemClear: true,
            labelGap: true,
        });
    });

    // Obsidian's own line height is 1.5; some themes set more.
    it('clears the first result in a theme with a taller line height', async function () {
        const { item, label } = await clearance('2.4');
        expect({ itemClear: item >= 0, labelGap: label >= 4 }).toEqual({
            itemClear: true,
            labelGap: true,
        });
    });
});
