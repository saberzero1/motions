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

describe('Static snippet regression (Phase 3b)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    it('should expand static bundled snippet unaffected by Phase 3b', async function () {
        await setupEditor('', { line: 0, ch: 0 });
        await typePrefixAndTab('cb');
        const value = await getEditorValue();
        expect(value).toContain('```');
    });

    it('should navigate tabstops in static snippet', async function () {
        await setupEditor('', { line: 0, ch: 0 });
        await typePrefixAndTab('link');
        await browser.keys(Array.from('hello'));
        await browser.pause(PAUSE.EDITOR_SETTLE);
        await browser.keys(['Tab']);
        await browser.pause(PAUSE.EDITOR_SETTLE);
        await browser.keys(Array.from('http://example.com'));
        await browser.pause(PAUSE.EDITOR_SETTLE);
        const value = await getEditorValue();
        expect(value).toContain('[hello](http://example.com)');
    });
});
