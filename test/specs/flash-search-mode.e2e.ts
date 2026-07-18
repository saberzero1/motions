import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    getCursorPos,
    sendVimEscape,
    vimKeys,
    PAUSE,
} from '../helpers';

function getFlashLabelCount(): Promise<number> {
    return browser.executeObsidian(() => {
        return document.querySelectorAll('.vim-motions-easymotion-label')
            .length;
    }) as unknown as Promise<number>;
}

describe('Flash search mode: post-commit labels on /? search', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(50);
    });

    it('should show labels after /pattern Enter', async function () {
        await setupEditor('foo bar foo baz foo', { line: 0, ch: 0 });
        await vimKeys('/');
        await browser.keys(['f', 'o', 'o', 'Enter']);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const labels = await getFlashLabelCount();
        expect(labels).toBeGreaterThanOrEqual(2);

        await browser.keys(['Escape']);
        await browser.pause(200);
        const labelsAfterEscape = await getFlashLabelCount();
        expect(labelsAfterEscape).toBe(0);
    });

    it('should jump to labeled match when label key is pressed', async function () {
        await setupEditor('foo bar foo baz foo', { line: 0, ch: 0 });
        await vimKeys('/');
        await browser.keys(['f', 'o', 'o', 'Enter']);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const labels = await getFlashLabelCount();
        if (labels >= 2) {
            await browser.keys(['a']);
            await browser.pause(200);
            const pos = await getCursorPos();
            expect(pos.ch).toBeGreaterThan(0);
        }
    });

    it('should clear labels on non-label key', async function () {
        await setupEditor('foo bar foo baz foo', { line: 0, ch: 0 });
        await vimKeys('/');
        await browser.keys(['f', 'o', 'o', 'Enter']);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        await browser.keys(['j']);
        await browser.pause(200);
        const labels = await getFlashLabelCount();
        expect(labels).toBe(0);
    });

    it('should not show labels when no matches', async function () {
        await setupEditor('hello world', { line: 0, ch: 0 });
        await vimKeys('/');
        await browser.keys(['z', 'z', 'z', 'Enter']);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const labels = await getFlashLabelCount();
        expect(labels).toBe(0);
    });

    it('should not show labels for single match', async function () {
        await setupEditor('hello world xyz', { line: 0, ch: 0 });
        await vimKeys('/');
        await browser.keys(['x', 'y', 'z', 'Enter']);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const labels = await getFlashLabelCount();
        expect(labels).toBe(0);
    });
});
