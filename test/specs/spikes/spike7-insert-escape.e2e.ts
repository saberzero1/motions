import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

import { sendVimEscape } from '../../helpers';
async function getEditorValue(): Promise<string> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        return view?.editor.getValue() ?? '';
    })) as string;
}

describe('Spike 7: Insert mode escape via imap jk', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    it('should test if imap jk <Esc> works via vimrc', async function () {
        await obsidianPage.write('.obsidian.vimrc', 'imap jk <Esc>\n');
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(500);

        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            view.editor.setValue('');
            view.editor.setCursor(0, 0);
            view.editor.focus();
        });
        await browser.pause(300);

        await sendVimEscape();
        await browser.pause(50);
        await browser.keys(['i']);
        await browser.pause(50);
        await browser.keys('hello'.split(''));
        await browser.pause(50);
        await browser.keys(['j']);
        await browser.pause(30);
        await browser.keys(['k']);
        await browser.pause(300);

        await browser.keys(['A']);
        await browser.pause(50);
        await browser.keys('world'.split(''));
        await sendVimEscape();
        await browser.pause(200);

        const value = await getEditorValue();
        // eslint-disable-next-line obsidianmd/rule-custom-message -- spike discovery output
        console.log('Insert escape result:', JSON.stringify({ value }));

        const vimMode = await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return 'unknown';
            const cm = (view.editor as unknown as Record<string, unknown>)
                .cm as Record<string, unknown>;
            const adapter = cm?.cm as Record<string, unknown> | undefined;
            const vimState = adapter?.state as
                | Record<string, unknown>
                | undefined;
            const vim = vimState?.vim as Record<string, unknown> | undefined;
            return vim?.mode ?? 'unknown';
        });
        // eslint-disable-next-line obsidianmd/rule-custom-message -- spike discovery output
        console.log('Vim mode after jk:', vimMode);

        expect(typeof value).toBe('string');
    });
});
