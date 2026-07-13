import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    getEditorValue,
    getVimMode,
    PAUSE,
    setupEditor,
    vimKeys,
} from '../../helpers';

async function expandLinkSnippet(): Promise<void> {
    await vimKeys('i');
    await browser.keys(['l', 'i', 'n', 'k']);
    await browser.pause(PAUSE.KEY_GAP);
    await browser.keys(['Tab']);
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

describe('Snippet tabstop navigation', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    it('should place cursor on first tabstop after expansion', async function () {
        await setupEditor('', { line: 0, ch: 0 });
        await expandLinkSnippet();
        expect(await getVimMode()).toBe('insert');
        const value = await getEditorValue();
        expect(value).toContain('[text](url)');
    });

    it('should navigate to next tabstop on Tab', async function () {
        await setupEditor('', { line: 0, ch: 0 });
        await expandLinkSnippet();
        await browser.keys(['Tab']);
        await browser.pause(PAUSE.EDITOR_SETTLE);
        await browser.keys(['h', 't', 't', 'p']);
        await browser.pause(PAUSE.EDITOR_SETTLE);
        const value = await getEditorValue();
        expect(value).toContain('[text](http)');
    });

    it('should navigate backward on Shift+Tab', async function () {
        await setupEditor('', { line: 0, ch: 0 });
        await expandLinkSnippet();
        await browser.keys(['Tab']);
        await browser.pause(PAUSE.EDITOR_SETTLE);
        await browser.keys(['Shift', 'Tab', 'NULL']);
        await browser.pause(PAUSE.EDITOR_SETTLE);
        await browser.keys(['t', 'e', 's', 't']);
        await browser.pause(PAUSE.EDITOR_SETTLE);
        const value = await getEditorValue();
        expect(value).toContain('[test]');
    });
});
