import { $, $$, browser, expect } from '@wdio/globals';
import { Key } from 'webdriverio';
import { obsidianPage } from 'wdio-obsidian-service';
import { ensureLivePreview, PAUSE } from '../helpers';

/**
 * Escape in a page preview closes that preview (#210).
 *
 * Previews are opened the way a user opens them, holding Ctrl over a link, so
 * Obsidian's page-preview plugin and its popover nesting are real: a preview
 * opened from a link inside another is that one's child (`childHovers`). A
 * click into a preview makes it an editor, which is where the bundled
 * engine's idle-Escape callback runs.
 */

interface Popovers {
    count: number;
    texts: string[];
}

async function popovers(): Promise<Popovers> {
    return (await browser.executeObsidian(() => {
        const els = Array.from(document.querySelectorAll('.hover-popover'));
        return {
            count: els.length,
            texts: els.map((el) =>
                (
                    el.querySelector('.cm-content, .markdown-preview-view')
                        ?.textContent ?? ''
                ).trim(),
            ),
        };
    })) as Popovers;
}

/** Ctrl-hovers the first link matching `selector` and waits for a preview. */
async function hoverLink(selector: string, expected: number): Promise<void> {
    const link = $(selector);
    await browser.action('key').down(Key.Ctrl).perform(true);
    await link.moveTo();
    await browser.waitUntil(async () => (await popovers()).count >= expected, {
        timeout: 5000,
        interval: 100,
        timeoutMsg: `no preview opened from ${selector}`,
    });
    await browser.action('key').up(Key.Ctrl).perform();
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

/** Clicks into the preview that was opened last, turning it into an editor. */
async function clickLastPreview(): Promise<void> {
    const els = await $$('.hover-popover').getElements();
    const last = els[els.length - 1];
    if (!last) throw new Error('clickLastPreview: no preview open');
    await last.$('.markdown-preview-view, .cm-content').click();
    await browser.waitUntil(
        async () =>
            (await browser.executeObsidian(() => {
                const all = document.querySelectorAll('.hover-popover');
                const top = all[all.length - 1];
                return !!top?.contains(document.activeElement);
            })) as boolean,
        { timeout: 3000, interval: 100, timeoutMsg: 'preview took no focus' },
    );
}

async function closeAllPreviews(): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        const root = (
            view as unknown as {
                hoverPopover?: {
                    hide(): void;
                    childHovers?: { hide(): void }[];
                } | null;
            } | null
        )?.hoverPopover;
        root?.childHovers?.forEach((c) => c.hide());
        root?.hide();
    });
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

describe('Escape in page previews (#210)', function () {
    this.timeout(120000);

    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await browser.executeObsidian(async ({ app }) => {
            await app.vault.adapter.write('PopA.md', 'See [[PopB]] here\n');
            await app.vault.adapter.write('PopB.md', 'Then [[PopC]] there\n');
            await app.vault.adapter.write('PopC.md', 'Deep note text\n');
        });
        await browser.pause(PAUSE.OBSIDIAN_LOAD);
    });

    beforeEach(async function () {
        await obsidianPage.openFile('PopA.md');
        await ensureLivePreview();
        await browser.pause(PAUSE.OBSIDIAN_LOAD);
    });

    afterEach(async function () {
        await closeAllPreviews();
    });

    after(async function () {
        await browser.executeObsidian(async ({ app }) => {
            for (const f of ['PopA.md', 'PopB.md', 'PopC.md']) {
                if (await app.vault.adapter.exists(f)) {
                    await app.vault.adapter.remove(f);
                }
            }
        });
    });

    it('closes the focused nested preview rather than the one beneath it', async function () {
        await hoverLink('.workspace-leaf.mod-active .cm-hmd-internal-link', 1);
        await hoverLink(
            '.hover-popover .cm-hmd-internal-link, .hover-popover .internal-link',
            2,
        );
        await clickLastPreview();
        const before = await popovers();

        await browser.keys(['Escape']);
        await browser.pause(PAUSE.EDITOR_SETTLE * 2);
        const after = await popovers();

        expect(before.count).toBe(2);
        // Before the fix Escape hid the parent and left the focused preview
        // open: one popover, reading `Deep note text`. Whether the parent
        // then stays is Obsidian's hover logic — it closes once neither the
        // pointer nor the focus is on it — so it is not asserted.
        expect(
            after.texts.some((text) => text.includes('Deep note text')),
        ).toBe(false);
        expect(after.count).toBeLessThan(before.count);
    });

    it('closes a single focused preview', async function () {
        await hoverLink('.workspace-leaf.mod-active .cm-hmd-internal-link', 1);
        await clickLastPreview();

        await browser.keys(['Escape']);
        await browser.pause(PAUSE.EDITOR_SETTLE * 2);

        expect((await popovers()).count).toBe(0);
    });
});
