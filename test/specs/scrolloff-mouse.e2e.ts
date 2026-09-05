import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    sendVimEscape,
    setPluginSetting,
    setPluginSettingAndReload,
    PAUSE,
} from '../helpers';

// https://github.com/saberzero1/motions/issues/175

async function getScrollTop(): Promise<number> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return -1;
        const cm = (
            (view as unknown as Record<string, unknown>).editMode as
                Record<string, unknown> | undefined
        )?.cm as { scrollDOM?: HTMLElement } | undefined;
        return cm?.scrollDOM?.scrollTop ?? -1;
    })) as number;
}

describe('Scrolloff mouse suppression (#175)', function () {
    const lines = Array.from({ length: 80 }, (_, i) => `line ${i + 1}`).join(
        '\n',
    );

    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await setPluginSettingAndReload('scrolloffLines', 10);
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);
    });

    after(async function () {
        await setPluginSetting('scrolloffLines', 0);
    });

    it('mouse drag near viewport edge should not cause scroll drift (#175)', async function () {
        this.timeout(15000);

        await setupEditor(lines, { line: 40, ch: 0 });
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const scrollBefore = await getScrollTop();

        const scrollDom = await browser.$('.cm-scroller');
        const scrollerSize = await scrollDom.getSize();
        const halfH = Math.floor(scrollerSize.height / 2);

        await browser
            .action('pointer', { parameters: { pointerType: 'mouse' } })
            .move({ origin: scrollDom, x: 30, y: 0 })
            .down()
            .pause(50)
            .move({ origin: scrollDom, x: 30, y: halfH - 10 })
            .pause(300)
            .up()
            .perform();

        await browser.pause(PAUSE.EDITOR_SETTLE);

        const scrollAfter = await getScrollTop();
        const drift = Math.abs(scrollAfter - scrollBefore);

        expect(drift).toBeLessThan(50);
    });

    it('keyboard navigation should still trigger scrolloff (#175)', async function () {
        this.timeout(15000);

        await setupEditor(lines, { line: 0, ch: 0 });
        await browser.pause(PAUSE.EDITOR_SETTLE);

        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            view.editor.setCursor(40, 0);
            view.editor.focus();
        });
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const scrollBefore = await getScrollTop();

        await browser.keys(['G']);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const scrollAfter = await getScrollTop();
        const drift = Math.abs(scrollAfter - scrollBefore);

        expect(drift).toBeGreaterThan(10);
    });
});
