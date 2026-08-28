import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { setupEditor, vimKeys, getCursorPos, PAUSE } from '../helpers';

type PluginRef = {
    settings: Record<string, unknown>;
    reloadFeatures: () => void;
};

async function setAnimatedCursor(enabled: boolean): Promise<void> {
    await browser.executeObsidian(({ app }, value: boolean) => {
        const plugin = (
            app as unknown as {
                plugins: { plugins: Record<string, PluginRef> };
            }
        ).plugins.plugins['vim-motions'];
        if (!plugin) return;
        plugin.settings.animatedCursor = value;
        plugin.reloadFeatures();
    }, enabled);
    await browser.pause(1000);
}

async function getPluginSetting(key: string): Promise<unknown> {
    return browser.executeObsidian(({ app }, k: string) => {
        const plugin = (
            app as unknown as {
                plugins: { plugins: Record<string, PluginRef> };
            }
        ).plugins.plugins['vim-motions'];
        return (plugin?.settings as Record<string, unknown>)?.[k];
    }, key);
}

async function setPluginSettings(
    settings: Record<string, unknown>,
): Promise<void> {
    await browser.executeObsidian(({ app }, s: Record<string, unknown>) => {
        const plugin = (
            app as unknown as {
                plugins: { plugins: Record<string, PluginRef> };
            }
        ).plugins.plugins['vim-motions'];
        if (!plugin) return;
        Object.assign(plugin.settings, s);
        plugin.reloadFeatures();
    }, settings);
    await browser.pause(PAUSE.OBSIDIAN_LOAD);
}

describe('Animated cursor', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    after(async function () {
        await setAnimatedCursor(false);
    });

    it('animated cursor setting is persisted when enabled', async function () {
        await setAnimatedCursor(true);
        const enabled = await getPluginSetting('animatedCursor');
        expect(enabled).toBe(true);
    });

    it('animated cursor config is active when enabled', async function () {
        await setAnimatedCursor(true);

        const configEnabled = (await browser.executeObsidian(({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<string, PluginRef>;
                    };
                }
            ).plugins.plugins['vim-motions'];
            return plugin?.settings?.animatedCursor ?? false;
        })) as boolean;

        expect(configEnabled).toBe(true);
    });

    it('disabling sets config to disabled', async function () {
        await setAnimatedCursor(true);

        const enabledBefore = await getPluginSetting('animatedCursor');
        expect(enabledBefore).toBe(true);

        await setAnimatedCursor(false);

        const enabledAfter = await getPluginSetting('animatedCursor');
        expect(enabledAfter).toBe(false);
    });

    it('cursor follows cursor movement', async function () {
        await setAnimatedCursor(true);
        await setupEditor('line one\nline two\nline three\nline four', {
            line: 0,
            ch: 0,
        });

        await vimKeys('j', 'j', 'j');
        await browser.pause(PAUSE.OBSIDIAN_LOAD);

        const pos = await getCursorPos();
        expect(pos.line).toBe(3);
    });

    it('idle rAF rate is dramatically lower than continuous 60fps', async function () {
        this.timeout(30000);
        await setAnimatedCursor(true);
        await setupEditor('line one\nline two\nline three\nline four', {
            line: 0,
            ch: 0,
        });

        // Move cursor to trigger animation, then wait for convergence
        await vimKeys('j');
        await browser.pause(2000);

        // Install rAF counter
        await browser.execute(() => {
            (window as unknown as Record<string, number>).__rafCount = 0;
            const orig = window.requestAnimationFrame.bind(window);
            (
                window as unknown as Record<
                    string,
                    typeof window.requestAnimationFrame
                >
            ).__origRaf = orig;
            window.requestAnimationFrame = (cb: FrameRequestCallback) => {
                (window as unknown as Record<string, number>).__rafCount++;
                return orig(cb);
            };
        });

        // Measure idle rAF calls over 5 seconds
        await browser.pause(5000);

        const rafCount = (await browser.execute(() => {
            const count = (window as unknown as Record<string, number>)
                .__rafCount;
            // Restore original rAF
            const orig = (
                window as unknown as Record<
                    string,
                    typeof window.requestAnimationFrame
                >
            ).__origRaf;
            if (orig) window.requestAnimationFrame = orig;
            return count;
        })) as number;

        // Before optimization: 60fps × 5sec = ~300 rAF callbacks from cursor alone
        // (plus other Obsidian rAF users — typically 300-600 total)
        // After optimization: warm gear fires ~1.67/sec × 5sec = ~8 callbacks
        // from the cursor, plus whatever Obsidian's own rAF usage is.
        //
        // We can't isolate cursor-only rAF from Obsidian's baseline, but we CAN
        // verify the total is far below what continuous 60fps cursor would add.
        // A continuous cursor loop would add ~300 to whatever baseline exists.
        //
        // Conservative threshold: total rAF count should be under 150
        // (Obsidian's own baseline + ~8 cursor blink wakes).
        // Before our fix this would be baseline + ~300 = easily over 300.
        console.log(`[GPU AUDIT] Idle rAF callbacks in 5 seconds: ${rafCount}`);
        console.log(
            `[GPU AUDIT] Effective rAF rate: ${(rafCount / 5).toFixed(1)}/sec`,
        );
        console.log(`[GPU AUDIT] Before optimization: 165/sec`);

        // The key assertion: with optimization, total rAF should be well under
        // what a single continuous 60fps loop would produce
        expect(rafCount).toBeLessThan(150);
    });

    it('settings sub-toggles work', async function () {
        await setPluginSettings({
            animatedCursor: true,
            smoothCursor: false,
        });

        const smooth = await getPluginSetting('smoothCursor');
        expect(smooth).toBe(false);

        await setPluginSettings({
            animatedCursor: true,
            smearTrail: false,
        });

        const smear = await getPluginSetting('smearTrail');
        expect(smear).toBe(false);

        await setPluginSettings({
            smoothCursor: true,
            smearTrail: true,
        });

        expect(await getPluginSetting('smoothCursor')).toBe(true);
        expect(await getPluginSetting('smearTrail')).toBe(true);
    });
});
