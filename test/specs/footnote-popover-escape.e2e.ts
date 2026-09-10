import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    ensureLivePreview,
    PAUSE,
    sendVimEscape,
    setupEditor,
} from '../helpers';

async function hasPopover(): Promise<boolean> {
    return (await browser.executeObsidian(
        () => document.querySelector('.popover') !== null,
    )) as boolean;
}

async function dismissPopover(): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        const popover = (
            view as unknown as { hoverPopover?: { hide?: () => void } } | null
        )?.hoverPopover;
        popover?.hide?.();
    });
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

describe('Footnote popover Escape handling (#130)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await ensureLivePreview();
    });

    afterEach(async function () {
        await dismissPopover();
    });

    it('first Escape returns to normal mode and second Escape closes the popover', async function () {
        await setupEditor('Text before footnote.', { line: 0, ch: 20 });
        await sendVimEscape();
        expect(await hasPopover()).toBe(false);

        await browser.executeObsidian(({ app }) => {
            app.commands.executeCommandById('editor:insert-footnote');
        });
        await browser.pause(PAUSE.OBSIDIAN_LOAD * 2);
        expect(await hasPopover()).toBe(true);

        await browser.keys(['t', 'e', 's', 't', 'Escape']);
        await browser.pause(PAUSE.EDITOR_SETTLE);
        expect(await hasPopover()).toBe(true);

        await browser.keys(['Escape']);
        await browser.pause(PAUSE.EDITOR_SETTLE);
        expect(await hasPopover()).toBe(false);
    });
});
