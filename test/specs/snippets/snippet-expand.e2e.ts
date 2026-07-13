import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { getEditorValue, PAUSE, setupEditor, vimKeys } from '../../helpers';

async function typePrefixAndTab(prefix: string): Promise<void> {
    await vimKeys('i');
    await browser.keys(Array.from(prefix));
    await browser.pause(PAUSE.KEY_GAP);
    await browser.keys(['Tab']);
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

describe('Snippet expansion', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    it('should expand a snippet when typing prefix + Tab in insert mode', async function () {
        await setupEditor('', { line: 0, ch: 0 });
        await typePrefixAndTab('cb');
        const value = await getEditorValue();
        expect(value).toContain('```');
    });

    it('should not expand when prefix does not match any snippet', async function () {
        await setupEditor('', { line: 0, ch: 0 });
        await typePrefixAndTab('xyznotasnippet');
        const value = await getEditorValue();
        expect(value).not.toContain('```');
        expect(value).toContain('xyznotasnippet');
    });

    it('should expand heading snippet', async function () {
        await setupEditor('', { line: 0, ch: 0 });
        await typePrefixAndTab('h1');
        const value = await getEditorValue();
        expect(value.startsWith('# ')).toBe(true);
    });

    it('should expand wikilink snippet', async function () {
        await setupEditor('', { line: 0, ch: 0 });
        await typePrefixAndTab('wl');
        const value = await getEditorValue();
        expect(value).toContain('[[');
        expect(value).toContain(']]');
    });

    it('should expand callout snippet', async function () {
        await setupEditor('', { line: 0, ch: 0 });
        await typePrefixAndTab('cnote');
        const value = await getEditorValue();
        expect(value).toContain('> [!note]');
    });
});
