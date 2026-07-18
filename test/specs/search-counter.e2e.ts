import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { setupEditor, sendVimEscape, vimKeys, PAUSE } from '../helpers';

function getSearchCountText(): Promise<string> {
    return browser.executeObsidian(() => {
        const el = document.querySelector('.vim-motions-search-count');
        if (!el) return '';
        const style = window.getComputedStyle(el);
        if (style.display === 'none') return '';
        return (el as HTMLElement).textContent ?? '';
    }) as unknown as Promise<string>;
}

describe('Search match counter (hlslens-style)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(50);
    });

    it('should show match count after / search', async function () {
        await setupEditor('foo bar foo baz foo', { line: 0, ch: 0 });
        await vimKeys('/');
        await browser.keys(['f', 'o', 'o', 'Enter']);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const count = await getSearchCountText();
        expect(count).toMatch(/\[\d+\/3\]/);
    });

    it('should update count after n', async function () {
        await setupEditor('foo bar foo baz foo', { line: 0, ch: 0 });
        await vimKeys('/');
        await browser.keys(['f', 'o', 'o', 'Enter']);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const count1 = await getSearchCountText();
        expect(count1).toMatch(/\[1\/3\]/);

        await vimKeys('n');
        await browser.pause(PAUSE.EDITOR_SETTLE);
        const count2 = await getSearchCountText();
        expect(count2).toMatch(/\[\d+\/3\]/);
        expect(count2).not.toBe(count1);
    });

    it('should hide when search is cleared', async function () {
        await setupEditor('hello world', { line: 0, ch: 0 });
        await sendVimEscape();
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const count = await getSearchCountText();
        expect(count).toBe('');
    });
});
