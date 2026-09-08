import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { setupEditor, PAUSE } from '../helpers';

// https://github.com/saberzero1/motions/issues/181
//
// The animated cursor is painted onto a single document-level canvas at
// viewport coordinates.  Scrolling the editor moves the caret on screen
// without producing a CodeMirror transaction, so the controller has to
// notice the scroll by itself.  Two failures were reported:
//
//   1. A "phantom letter" is left behind on the page and never cleared —
//      the caret scrolls out of the visible pane, `coordsAtPos()` stops
//      resolving, and the controller keeps repainting its last known rect.
//   2. The cursor does not follow the text while scrolling — no `scroll`
//      listener exists, so the position is only re-derived by the 500 ms
//      staleness fallback inside the animation tick.
//
// Both assertions below are made against pixels actually painted on the
// animated-cursor canvas, which is the surface the bug report shows.

type PluginRef = {
    settings: Record<string, unknown>;
    saveSettings: () => Promise<void>;
};

interface PaintedBounds {
    painted: boolean;
    left: number;
    top: number;
    right: number;
    bottom: number;
}

interface PhantomProbe {
    ok: boolean;
    reason: string;
    controlPainted: PaintedBounds;
    settled: boolean;
    phantom: PaintedBounds | null;
    caretOnScreen: boolean;
    scrolledBy: number;
    repainted: PaintedBounds | null;
    caretTopOnReturn: number;
}

interface TrackingProbe {
    ok: boolean;
    reason: string;
    paintedBefore: PaintedBounds;
    paintedAfter: PaintedBounds;
    caretTopBefore: number;
    caretTopAfter: number;
    caretHeightAfter: number;
    elapsedSinceCaretMove: number;
}

const LINES = Array.from(
    { length: 400 },
    (_, i) => `line ${i} alpha bravo charlie delta`,
).join('\n');

// `reloadFeatures()` does not rebuild the editor-extension slot, so flipping
// `animatedCursor` at runtime never installs the canvas ViewPlugin.  The
// setting has to be persisted and the plugin re-loaded for it to take effect.
async function applySettingsAndReloadPlugin(
    settings: Record<string, unknown>,
): Promise<void> {
    await browser.executeObsidian(
        async ({ app }, s: Record<string, unknown>) => {
            const plugin = (
                app as unknown as {
                    plugins: { plugins: Record<string, PluginRef> };
                }
            ).plugins.plugins['vim-motions'];
            if (!plugin) return;
            Object.assign(plugin.settings, s);
            await plugin.saveSettings();
        },
        settings,
    );
    await obsidianPage.disablePlugin('vim-motions');
    await browser.pause(PAUSE.OBSIDIAN_LOAD);
    await obsidianPage.enablePlugin('vim-motions');
    await browser.pause(PAUSE.OBSIDIAN_LOAD);
    await obsidianPage.openFile('Welcome.md');
    await browser.pause(PAUSE.OBSIDIAN_LOAD);
}

describe('Animated cursor scrolling (#181)', function () {
    before(async function () {
        this.timeout(60000);
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        // Smooth interpolation and the smear trail both animate towards the
        // target over several frames.  Disabling them makes the painted
        // pixels equal the resolved caret rect, so a stale position is
        // unambiguous rather than "still catching up".
        await applySettingsAndReloadPlugin({
            animatedCursor: true,
            smoothCursor: false,
            smearTrail: false,
        });
    });

    after(async function () {
        this.timeout(60000);
        await applySettingsAndReloadPlugin({
            animatedCursor: false,
            smoothCursor: true,
            smearTrail: true,
        });
    });

    it('clears the cursor when the caret scrolls out of view (#181)', async function () {
        this.timeout(90000);

        await setupEditor(LINES, { line: 0, ch: 0 });

        const probe = (await browser.executeObsidian(
            async ({ app, obsidian }) => {
                const sleep = (ms: number): Promise<void> =>
                    new Promise((resolve) => setTimeout(resolve, ms));

                const empty = {
                    painted: false,
                    left: 0,
                    top: 0,
                    right: 0,
                    bottom: 0,
                };
                const fail = (reason: string) => ({
                    ok: false,
                    reason,
                    controlPainted: empty,
                    settled: false,
                    phantom: null,
                    caretOnScreen: false,
                    scrolledBy: 0,
                    repainted: null,
                    caretTopOnReturn: 0,
                });

                const makeScan = (pane: DOMRect) => (): typeof empty => {
                    const canvas = document.querySelector(
                        '.vim-motions-animated-cursor-canvas',
                    ) as HTMLCanvasElement | null;
                    if (!canvas) return empty;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) return empty;
                    const cssWidth =
                        parseFloat(canvas.style.width) || canvas.width;
                    const scale = canvas.width / cssWidth || 1;
                    const x0 = Math.max(0, Math.floor(pane.left * scale));
                    const y0 = Math.max(0, Math.floor(pane.top * scale));
                    const w = Math.min(
                        canvas.width - x0,
                        Math.ceil(pane.width * scale),
                    );
                    const h = Math.min(
                        canvas.height - y0,
                        Math.ceil(pane.height * scale),
                    );
                    if (w <= 0 || h <= 0) return empty;
                    const data = ctx.getImageData(x0, y0, w, h).data;
                    let minX = Infinity;
                    let minY = Infinity;
                    let maxX = -Infinity;
                    let maxY = -Infinity;
                    for (let y = 0; y < h; y++) {
                        const row = y * w * 4;
                        for (let x = 0; x < w; x++) {
                            if (data[row + x * 4 + 3] > 8) {
                                if (x < minX) minX = x;
                                if (x > maxX) maxX = x;
                                if (y < minY) minY = y;
                                if (y > maxY) maxY = y;
                            }
                        }
                    }
                    if (minX === Infinity) return empty;
                    return {
                        painted: true,
                        left: (x0 + minX) / scale,
                        top: (y0 + minY) / scale,
                        right: (x0 + maxX + 1) / scale,
                        bottom: (y0 + maxY + 1) / scale,
                    };
                };

                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return fail('no MarkdownView');
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as
                    | {
                          scrollDOM: HTMLElement;
                          state: { selection: { main: { head: number } } };
                          dispatch: (spec: unknown) => void;
                          coordsAtPos: (
                              pos: number,
                              side?: number,
                          ) => { top: number; bottom: number } | null;
                      }
                    | undefined;
                if (!cm) return fail('no CM6 view');

                const scan = makeScan(cm.scrollDOM.getBoundingClientRect());

                cm.scrollDOM.scrollTop = 0;
                cm.dispatch({ selection: { anchor: 0, head: 0 } });
                await sleep(400);

                const controlPainted = scan();

                const scrollBefore = cm.scrollDOM.scrollTop;
                cm.scrollDOM.scrollTop = cm.scrollDOM.scrollHeight;
                await sleep(120);
                const scrolledBy = cm.scrollDOM.scrollTop - scrollBefore;

                // Wait for the canvas to go empty first.  Unrelated transient
                // remnants can sit on the shared canvas until the next
                // full-canvas clear, so "painted right now" is not by itself
                // evidence of a phantom.
                let settled = false;
                for (let i = 0; i < 20; i++) {
                    await sleep(90);
                    if (!scan().painted) {
                        settled = true;
                        break;
                    }
                }

                // Then hold for more than one full blink cycle (1200 ms).  A
                // stale cursor is repainted every warm frame and blinks, so a
                // single sample could land in a blink-off frame and miss it.
                let phantom: typeof empty | null = null;
                if (settled) {
                    for (let i = 0; i < 14; i++) {
                        await sleep(90);
                        const sample = scan();
                        if (sample.painted) {
                            phantom = sample;
                            break;
                        }
                    }
                }

                // CodeMirror still reports coordinates for positions it has
                // rendered outside the visible pane, so "off screen" has to be
                // decided against the pane rectangle, not against a null.
                const caretCoords = cm.coordsAtPos(
                    cm.state.selection.main.head,
                    1,
                );
                const paneNow = cm.scrollDOM.getBoundingClientRect();
                const caretOnScreen =
                    caretCoords !== null &&
                    caretCoords.top >= paneNow.top - 1 &&
                    caretCoords.bottom <= paneNow.bottom + 1;

                // Scrolling back must bring the cursor back — clearing the
                // stale rect must not permanently kill the cursor.
                cm.scrollDOM.scrollTop = 0;
                let repainted: typeof empty | null = null;
                for (let i = 0; i < 16; i++) {
                    await sleep(90);
                    const sample = scan();
                    if (sample.painted) {
                        repainted = sample;
                        break;
                    }
                }
                const returnCoords = cm.coordsAtPos(
                    cm.state.selection.main.head,
                    1,
                );

                return {
                    ok: true,
                    reason: '',
                    controlPainted,
                    settled,
                    phantom,
                    caretOnScreen,
                    scrolledBy,
                    repainted,
                    caretTopOnReturn: returnCoords ? returnCoords.top : -1,
                };
            },
        )) as PhantomProbe;

        expect(probe.reason).toBe('');
        expect(probe.ok).toBe(true);

        // Negative controls: the cursor really was on the canvas before the
        // scroll, and the scroll really did take the caret off screen.
        expect(probe.controlPainted.painted).toBe(true);
        expect(probe.scrolledBy).toBeGreaterThan(500);
        expect(probe.caretOnScreen).toBe(false);

        expect(probe.settled).toBe(true);

        const phantomDetail = probe.phantom
            ? `phantom painted at ${JSON.stringify(probe.phantom)}`
            : 'canvas clear';
        expect(phantomDetail).toBe('canvas clear');

        // Scrolling back must bring the real cursor back at the caret, not
        // leave the editor with no cursor at all.
        expect(probe.repainted).not.toBeNull();
        expect(probe.caretTopOnReturn).toBeGreaterThan(0);
        const returnOffset = Math.abs(
            (probe.repainted?.top ?? -1000) - probe.caretTopOnReturn,
        );
        expect(returnOffset).toBeLessThanOrEqual(3);
    });

    it('repaints the cursor at the new screen position while scrolling (#181)', async function () {
        this.timeout(90000);

        await setupEditor(LINES, { line: 0, ch: 0 });

        const probe = (await browser.executeObsidian(
            async ({ app, obsidian }) => {
                const sleep = (ms: number): Promise<void> =>
                    new Promise((resolve) => setTimeout(resolve, ms));

                const empty = {
                    painted: false,
                    left: 0,
                    top: 0,
                    right: 0,
                    bottom: 0,
                };
                const fail = (reason: string) => ({
                    ok: false,
                    reason,
                    paintedBefore: empty,
                    paintedAfter: empty,
                    caretTopBefore: 0,
                    caretTopAfter: 0,
                    caretHeightAfter: 0,
                    elapsedSinceCaretMove: 0,
                });

                const makeScan = (pane: DOMRect) => (): typeof empty => {
                    const canvas = document.querySelector(
                        '.vim-motions-animated-cursor-canvas',
                    ) as HTMLCanvasElement | null;
                    if (!canvas) return empty;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) return empty;
                    const cssWidth =
                        parseFloat(canvas.style.width) || canvas.width;
                    const scale = canvas.width / cssWidth || 1;
                    const x0 = Math.max(0, Math.floor(pane.left * scale));
                    const y0 = Math.max(0, Math.floor(pane.top * scale));
                    const w = Math.min(
                        canvas.width - x0,
                        Math.ceil(pane.width * scale),
                    );
                    const h = Math.min(
                        canvas.height - y0,
                        Math.ceil(pane.height * scale),
                    );
                    if (w <= 0 || h <= 0) return empty;
                    const data = ctx.getImageData(x0, y0, w, h).data;
                    let minX = Infinity;
                    let minY = Infinity;
                    let maxX = -Infinity;
                    let maxY = -Infinity;
                    for (let y = 0; y < h; y++) {
                        const row = y * w * 4;
                        for (let x = 0; x < w; x++) {
                            if (data[row + x * 4 + 3] > 8) {
                                if (x < minX) minX = x;
                                if (x > maxX) maxX = x;
                                if (y < minY) minY = y;
                                if (y > maxY) maxY = y;
                            }
                        }
                    }
                    if (minX === Infinity) return empty;
                    return {
                        painted: true,
                        left: (x0 + minX) / scale,
                        top: (y0 + minY) / scale,
                        right: (x0 + maxX + 1) / scale,
                        bottom: (y0 + maxY + 1) / scale,
                    };
                };

                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return fail('no MarkdownView');
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as
                    | {
                          scrollDOM: HTMLElement;
                          state: { selection: { main: { head: number } } };
                          dispatch: (spec: unknown) => void;
                          posAtCoords: (coords: {
                              x: number;
                              y: number;
                          }) => number | null;
                          coordsAtPos: (
                              pos: number,
                              side?: number,
                          ) => { top: number; bottom: number } | null;
                      }
                    | undefined;
                if (!cm) return fail('no CM6 view');

                const scan = makeScan(cm.scrollDOM.getBoundingClientRect());

                cm.scrollDOM.scrollTop = 600;
                await sleep(300);

                // Put the caret on a line that is comfortably inside the
                // visible pane so a small scroll keeps it on screen.
                const pane = cm.scrollDOM.getBoundingClientRect();
                const pos = cm.posAtCoords({
                    x: pane.left + 30,
                    y: pane.top + pane.height / 2,
                });
                if (pos === null) return fail('no position at pane centre');

                // The selection change resets the blink phase, guaranteeing a
                // lit cursor for the whole measurement window below (the blink
                // only starts 600 ms after the last cursor movement).
                cm.dispatch({ selection: { anchor: pos, head: pos } });
                const caretMovedAt = performance.now();
                await sleep(150);

                const coordsBefore = cm.coordsAtPos(
                    cm.state.selection.main.head,
                    1,
                );
                if (!coordsBefore) return fail('caret not resolvable before');
                const paintedBefore = scan();

                cm.scrollDOM.scrollTop += 40;
                await sleep(150);

                const coordsAfter = cm.coordsAtPos(
                    cm.state.selection.main.head,
                    1,
                );
                if (!coordsAfter) return fail('caret not resolvable after');
                const paintedAfter = scan();

                return {
                    ok: true,
                    reason: '',
                    paintedBefore,
                    paintedAfter,
                    caretTopBefore: coordsBefore.top,
                    caretTopAfter: coordsAfter.top,
                    caretHeightAfter: coordsAfter.bottom - coordsAfter.top,
                    elapsedSinceCaretMove: performance.now() - caretMovedAt,
                };
            },
        )) as TrackingProbe;

        expect(probe.reason).toBe('');
        expect(probe.ok).toBe(true);

        // Guards the blink assumption: past 600 ms the cursor starts blinking
        // and an unpainted sample would no longer mean "stale".
        expect(probe.elapsedSinceCaretMove).toBeLessThan(600);

        // Negative controls: a cursor was painted at both sample points, and
        // the scroll genuinely moved the caret on screen.
        expect(probe.paintedBefore.painted).toBe(true);
        expect(probe.paintedAfter.painted).toBe(true);

        const caretDelta = probe.caretTopAfter - probe.caretTopBefore;
        expect(Math.abs(caretDelta)).toBeGreaterThan(20);

        // The painted cursor must have moved by the same amount as the caret.
        // Comparing deltas rather than absolute positions cancels any constant
        // offset between the drawn shape and the reported caret coordinates.
        const paintedDelta = probe.paintedAfter.top - probe.paintedBefore.top;
        expect(Math.abs(paintedDelta - caretDelta)).toBeLessThanOrEqual(3);

        // The whole cursor must move, not just its box. The block shape and the
        // character drawn inside it derive their positions independently, so a
        // stale glyph left at the pre-scroll position still satisfies the delta
        // check above — it only widens the painted box downwards.
        const paintedHeight =
            probe.paintedAfter.bottom - probe.paintedAfter.top;
        expect(paintedHeight).toBeLessThanOrEqual(probe.caretHeightAfter + 6);
    });
});
