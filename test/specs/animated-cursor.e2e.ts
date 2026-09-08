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

// These assertions read the canvas because every cheaper proxy in this file —
// the setting value, the caret position — was satisfied by a build where the
// cursor extension was never installed and no canvas existed at all (#181).
async function paintedCursorBounds(): Promise<{
    painted: boolean;
    left: number;
    top: number;
    bottom: number;
}> {
    return (await browser.execute(() => {
        const empty = { painted: false, left: 0, top: 0, bottom: 0 };
        const canvas = document.querySelector(
            '.vim-motions-animated-cursor-canvas',
        ) as HTMLCanvasElement | null;
        if (!canvas) return empty;
        const ctx = canvas.getContext('2d');
        if (!ctx || canvas.width === 0) return empty;
        const w = canvas.width;
        const h = canvas.height;
        const d = ctx.getImageData(0, 0, w, h).data;
        let minX = Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (let y = 0; y < h; y++) {
            const row = y * w * 4;
            for (let x = 0; x < w; x++) {
                if (d[row + x * 4 + 3] > 8) {
                    if (x < minX) minX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
        }
        if (minX === Infinity) return empty;
        const scale = w / (parseFloat(canvas.style.width) || w) || 1;
        return {
            painted: true,
            left: minX / scale,
            top: minY / scale,
            bottom: (maxY + 1) / scale,
        };
    })) as { painted: boolean; left: number; top: number; bottom: number };
}

async function pollPaintedCursor(): Promise<{
    painted: boolean;
    left: number;
    top: number;
    bottom: number;
}> {
    let last = await paintedCursorBounds();
    for (let i = 0; i < 20 && !last.painted; i++) {
        await browser.pause(90);
        last = await paintedCursorBounds();
    }
    return last;
}

async function caretScreenTop(): Promise<number> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return -1;
        const cm = (view.editor as unknown as Record<string, unknown>).cm as
            | {
                  state: { selection: { main: { head: number } } };
                  coordsAtPos: (
                      p: number,
                      s?: number,
                  ) => { top: number } | null;
              }
            | undefined;
        if (!cm) return -1;
        return cm.coordsAtPos(cm.state.selection.main.head, 1)?.top ?? -1;
    })) as number;
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
        this.timeout(60000);
        await setAnimatedCursor(true);
        await setPluginSettings({
            animatedCursor: true,
            smoothCursor: false,
            smearTrail: false,
        });
        await setupEditor('line one\nline two\nline three\nline four', {
            line: 0,
            ch: 0,
        });

        expect((await pollPaintedCursor()).painted).toBe(true);

        await vimKeys('j', 'j', 'j');
        await browser.pause(PAUSE.OBSIDIAN_LOAD);

        const pos = await getCursorPos();
        expect(pos.line).toBe(3);

        // The caret moving is not evidence that the cursor moved with it: the
        // canvas is a separate surface, and it renders nothing at all when the
        // extension is missing. Compared in absolute viewport coordinates —
        // the canvas is shared between tests, so a delta against an earlier
        // sample can be measured against paint left behind by another one.
        const endPainted = await pollPaintedCursor();
        const endCaretTop = await caretScreenTop();
        expect(endPainted.painted).toBe(true);
        expect(endCaretTop).toBeGreaterThan(0);
        expect(Math.abs(endPainted.top - endCaretTop)).toBeLessThanOrEqual(4);
    });

    it('no canvas cursor is painted while the feature is disabled', async function () {
        this.timeout(60000);
        await setAnimatedCursor(false);
        await setupEditor('line one\nline two', { line: 0, ch: 0 });
        await browser.pause(PAUSE.OBSIDIAN_LOAD);

        expect((await paintedCursorBounds()).painted).toBe(false);
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
