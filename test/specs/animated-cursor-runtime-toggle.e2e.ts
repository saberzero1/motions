import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { setupEditor, setPluginSettingAndReload, PAUSE } from '../helpers';

// Follow-up to https://github.com/saberzero1/motions/issues/181
//
// `animatedCursor` gates membership of the canvas ViewPlugin in
// `vimExtensionSlot`, which only `setupVimSubsystems()` populates — and that
// runs from `onload()` and `enableVim()`, never from `reloadFeatures()`.
// The settings toggle therefore never installed the extension, while
// `reloadFeatures()` did call `setCursorSuppressed(true)`: the fork's own
// cursor was hidden and nothing replaced it, leaving no cursor at all until
// Obsidian restarted.

async function canvasIdentity(): Promise<{
    exists: boolean;
    matchesStashed: boolean;
}> {
    return (await browser.execute(() => {
        const w = window as unknown as Record<string, unknown>;
        const canvas = document.querySelector(
            '.vim-motions-animated-cursor-canvas',
        );
        return {
            exists: canvas !== null,
            matchesStashed: canvas !== null && canvas === w.__acStashed,
        };
    })) as { exists: boolean; matchesStashed: boolean };
}

async function stashCanvas(): Promise<void> {
    await browser.execute(() => {
        const w = window as unknown as Record<string, unknown>;
        w.__acStashed = document.querySelector(
            '.vim-motions-animated-cursor-canvas',
        );
    });
}

async function cursorIsPainted(): Promise<boolean> {
    return (await browser.execute(() => {
        const canvas = document.querySelector(
            '.vim-motions-animated-cursor-canvas',
        ) as HTMLCanvasElement | null;
        if (!canvas) return false;
        const ctx = canvas.getContext('2d');
        if (!ctx || canvas.width === 0) return false;
        const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let i = 3; i < d.length; i += 4) {
            if (d[i] > 8) return true;
        }
        return false;
    })) as boolean;
}

async function pollPainted(samples: number): Promise<boolean> {
    for (let i = 0; i < samples; i++) {
        if (await cursorIsPainted()) return true;
        await browser.pause(90);
    }
    return false;
}

describe('Animated cursor runtime toggle (#181)', function () {
    before(async function () {
        this.timeout(60000);
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        // Start from a plugin load that genuinely has the cursor disabled, so
        // "the extension is absent" is the baseline rather than a leftover.
        await browser.executeObsidian(async ({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<
                            string,
                            {
                                settings: Record<string, unknown>;
                                saveSettings: () => Promise<void>;
                            }
                        >;
                    };
                }
            ).plugins.plugins['vim-motions'];
            if (!plugin) return;
            plugin.settings.animatedCursor = false;
            await plugin.saveSettings();
        });
        await obsidianPage.disablePlugin('vim-motions');
        await browser.pause(PAUSE.OBSIDIAN_LOAD);
        await obsidianPage.enablePlugin('vim-motions');
        await browser.pause(PAUSE.OBSIDIAN_LOAD);
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(PAUSE.OBSIDIAN_LOAD);
    });

    after(async function () {
        this.timeout(60000);
        await setPluginSettingAndReload('animatedCursor', false);
    });

    it('enabling at runtime installs the canvas and paints a cursor (#181)', async function () {
        this.timeout(60000);

        await setupEditor('alpha bravo charlie\ndelta echo foxtrot', {
            line: 0,
            ch: 4,
        });

        // Negative control: with the setting off there must be no canvas, so
        // finding one after the toggle is attributable to the toggle.
        const before = await canvasIdentity();
        expect(before.exists).toBe(false);

        await setPluginSettingAndReload('animatedCursor', true);
        await setupEditor('alpha bravo charlie\ndelta echo foxtrot', {
            line: 0,
            ch: 4,
        });

        const after = await canvasIdentity();
        expect(after.exists).toBe(true);

        // The regression this guards is an invisible caret: the fork cursor is
        // suppressed the moment the setting flips, so if the canvas is absent
        // or inert the editor shows no cursor at all.
        expect(await pollPainted(20)).toBe(true);
    });

    it('disabling at runtime removes the canvas (#181)', async function () {
        this.timeout(60000);

        await setPluginSettingAndReload('animatedCursor', true);
        await setupEditor('alpha bravo charlie', { line: 0, ch: 2 });
        expect((await canvasIdentity()).exists).toBe(true);

        await setPluginSettingAndReload('animatedCursor', false);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        expect((await canvasIdentity()).exists).toBe(false);
    });

    it('an unrelated settings reload does not recreate the cursor canvas (#181)', async function () {
        this.timeout(60000);

        await setPluginSettingAndReload('animatedCursor', true);
        await setupEditor('alpha bravo charlie', { line: 0, ch: 2 });
        expect((await canvasIdentity()).exists).toBe(true);

        await stashCanvas();
        expect((await canvasIdentity()).matchesStashed).toBe(true);

        await setPluginSettingAndReload('scrolloffLines', 3);
        await browser.pause(PAUSE.EDITOR_SETTLE);

        // The manager drops the canvas when its last controller deregisters, so
        // a surviving element identity is evidence that the cursor ViewPlugin
        // instance was not torn down and rebuilt by the reload.
        const afterUnrelated = await canvasIdentity();
        expect(afterUnrelated.exists).toBe(true);
        expect(afterUnrelated.matchesStashed).toBe(true);

        await setPluginSettingAndReload('scrolloffLines', 0);
    });
});
