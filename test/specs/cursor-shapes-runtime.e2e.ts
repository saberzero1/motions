import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { setupEditor, setPluginSettingAndReload, PAUSE } from '../helpers';

// Follow-up to https://github.com/saberzero1/motions/issues/181
//
// `cursorShapes` reaches two independent consumers. The animated cursor keeps
// its own copy, made by `setCursorShapes()`, which only `setupVimSubsystems()`
// called — so shape changes did not reach the canvas until Obsidian restarted.
// A slot cannot fix this: the bundled vim extension is never gated, so there
// is no membership to change; the reload path has to re-push the value.
//
// The fork is measured here as a control. It already tracked shape changes at
// runtime on the unfixed build, so its case passes either way and exists to
// keep that true — do not read it as a reproduction.

// Mirrors what both settings implementations do: mutate the nested property
// and reload. `setPluginSetting` cannot express this — it assigns
// `settings[key]`, so a dotted key becomes a flat property of that literal
// name and the real `cursorShapes` object is never touched.
async function setCursorShapeAndReload(
    mode: string,
    shape: string,
): Promise<void> {
    await browser.executeObsidian(
        async ({ app }, m: string, s: string) => {
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<
                            string,
                            {
                                settings: Record<string, unknown>;
                                saveSettings: () => Promise<void>;
                                reloadFeatures: () => void;
                            }
                        >;
                    };
                }
            ).plugins.plugins['vim-motions'];
            if (!plugin) throw new Error('plugin not found');
            (plugin.settings.cursorShapes as Record<string, string>)[m] = s;
            await plugin.saveSettings();
            plugin.reloadFeatures();
        },
        mode,
        shape,
    );
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

async function forkCursorShapeClass(): Promise<string> {
    return (await browser.execute(() => {
        const el = document.querySelector(
            '.cm-vimCursorLayer .cm-fat-cursor.cm-cursor-primary',
        );
        if (!el) return 'none';
        return (
            Array.from(el.classList)
                .filter((c) => c.startsWith('cm-cursor-'))
                .filter((c) => c !== 'cm-cursor-primary')
                .sort()
                .join(',') || 'block'
        );
    })) as string;
}

async function paintedHeight(): Promise<number> {
    return (await browser.execute(() => {
        const canvas = document.querySelector(
            '.vim-motions-animated-cursor-canvas',
        ) as HTMLCanvasElement | null;
        if (!canvas) return -1;
        const ctx = canvas.getContext('2d');
        if (!ctx || canvas.width === 0) return -1;
        const w = canvas.width;
        const h = canvas.height;
        const d = ctx.getImageData(0, 0, w, h).data;
        let minY = Infinity;
        let maxY = -Infinity;
        for (let y = 0; y < h; y++) {
            const row = y * w * 4;
            for (let x = 0; x < w; x++) {
                if (d[row + x * 4 + 3] > 8) {
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                    break;
                }
            }
        }
        if (minY === Infinity) return -1;
        const cssWidth = parseFloat(canvas.style.width) || w;
        return (maxY + 1 - minY) / (w / cssWidth || 1);
    })) as number;
}

// The budget is a wall-clock bet on how soon the cursor canvas paints, and
// macOS lost it: CI reported -1, the give-up sentinel, on the first
// measurement rather than a wrong height. That run reaches here after four
// setting reloads, and 20 * 90ms is under two seconds on a runner roughly
// three times slower than this one. The mocha budget for the scenario is 60s,
// so the poll was the binding constraint, not the test.
//
// A bare -1 also reports nothing: "expected > 8, received -1" does not say
// whether the canvas was missing, empty, or simply late. On give-up the
// canvas state is now described instead.
async function pollPaintedHeight(): Promise<number> {
    for (let i = 0; i < 60; i++) {
        const v = await paintedHeight();
        if (v > 0) return v;
        await browser.pause(90);
    }
    const diagnosis = await browser.executeObsidian(() => {
        const canvases = Array.from(
            document.querySelectorAll('canvas'),
        ) as HTMLCanvasElement[];
        return {
            canvasCount: canvases.length,
            sizes: canvases.map((c) => `${c.width}x${c.height}`),
            styleWidths: canvases.map((c) => c.style.width),
        };
    });
    throw new Error(
        `cursor canvas never painted within 5.4s: ${JSON.stringify(diagnosis)}`,
    );
}

describe('Cursor shapes applied at runtime (#181)', function () {
    before(async function () {
        this.timeout(60000);
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    after(async function () {
        this.timeout(60000);
        await setCursorShapeAndReload('normal', 'block');
        await setPluginSettingAndReload('animatedCursor', false);
    });

    it('control: the fork cursor already tracks shape changes at runtime (#181)', async function () {
        this.timeout(60000);

        await setPluginSettingAndReload('animatedCursor', false);
        await setCursorShapeAndReload('normal', 'block');
        await setupEditor('alpha bravo charlie', { line: 0, ch: 2 });

        // Negative control: the block shape must be what is actually rendered
        // first, or a later "underline" reading proves nothing about the change.
        expect(await forkCursorShapeClass()).toBe('block');

        await setCursorShapeAndReload('normal', 'underline');
        await setupEditor('alpha bravo charlie', { line: 0, ch: 2 });

        expect(await forkCursorShapeClass()).toBe('cm-cursor-underline');
    });

    it('the animated cursor picks up a shape change without a restart (#181)', async function () {
        this.timeout(60000);

        await setCursorShapeAndReload('normal', 'block');
        await setPluginSettingAndReload('smoothCursor', false);
        await setPluginSettingAndReload('smearTrail', false);
        await setPluginSettingAndReload('animatedCursor', true);
        await setupEditor('alpha bravo charlie', { line: 0, ch: 2 });

        const blockHeight = await pollPaintedHeight();
        expect(blockHeight).toBeGreaterThan(8);

        await setCursorShapeAndReload('normal', 'underline');
        await setupEditor('alpha bravo charlie', { line: 0, ch: 2 });
        await browser.pause(PAUSE.EDITOR_SETTLE);

        // The underline shape is a 2px bar at the bottom of the cursor rect,
        // so the painted height collapses from a full line to a few pixels.
        const underlineHeight = await pollPaintedHeight();
        expect(underlineHeight).toBeGreaterThan(0);
        expect(underlineHeight).toBeLessThan(blockHeight / 2);
    });
});
