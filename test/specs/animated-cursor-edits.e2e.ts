import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { PAUSE, setupEditor } from '../helpers';

/**
 * The animated cursor follows edits, not only selection changes (#181).
 *
 * Two reports from the issue thread, both measured against pixels painted on
 * the animated-cursor canvas:
 *
 *   1. "Text artifacts when moving the cursor … while typing and editing."
 *      The block cursor repaints the character under it, cached by document
 *      position and row. `x` changes that character without moving either,
 *      so the deleted letter was painted again.
 *   2. "The cursor does not immediately wake and follow" when Enter outdents
 *      an empty nested bullet. The controller woke only for `selectionSet`,
 *      scroll and focus; a change that moves the caret through the document
 *      without setting the selection was never re-measured.
 *
 * Smooth interpolation and the smear trail are off, so the painted pixels
 * are the resolved caret rect rather than an animation catching up.
 */

type PluginRef = {
    settings: Record<string, unknown>;
    saveSettings: () => Promise<void>;
};

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

interface Painted {
    painted: boolean;
    left: number;
    top: number;
    right: number;
    bottom: number;
    /**
     * The glyph inside the painted bounds: one character per pixel, `1` where
     * it is light enough to be the letter drawn on the accent-coloured block.
     */
    glyph: string;
}

/** The cursor's painted bounds and pixels on the animated-cursor canvas. */
async function painted(): Promise<Painted> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const empty = {
            painted: false,
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            glyph: '',
        };
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        const cm = (
            view?.editor as unknown as { cm?: { scrollDOM: HTMLElement } }
        )?.cm;
        const canvas = document.querySelector(
            '.vim-motions-animated-cursor-canvas',
        ) as HTMLCanvasElement | null;
        const ctx = canvas?.getContext('2d');
        if (!cm || !canvas || !ctx) return empty;
        const pane = cm.scrollDOM.getBoundingClientRect();
        const scale =
            canvas.width / (parseFloat(canvas.style.width) || canvas.width) ||
            1;
        const x0 = Math.max(0, Math.floor(pane.left * scale));
        const y0 = Math.max(0, Math.floor(pane.top * scale));
        const w = Math.min(canvas.width - x0, Math.ceil(pane.width * scale));
        const h = Math.min(canvas.height - y0, Math.ceil(pane.height * scale));
        if (w <= 0 || h <= 0) return empty;
        const data = ctx.getImageData(x0, y0, w, h).data;
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if ((data[(y * w + x) * 4 + 3] ?? 0) > 8) {
                    minX = Math.min(minX, x);
                    maxX = Math.max(maxX, x);
                    minY = Math.min(minY, y);
                    maxY = Math.max(maxY, y);
                }
            }
        }
        if (minX === Infinity) return empty;
        const box = ctx.getImageData(
            x0 + minX,
            y0 + minY,
            maxX - minX + 1,
            maxY - minY + 1,
        ).data;
        return {
            painted: true,
            left: (x0 + minX) / scale,
            top: (y0 + minY) / scale,
            right: (x0 + maxX + 1) / scale,
            bottom: (y0 + maxY + 1) / scale,
            glyph: Array.from({ length: box.length / 4 }, (_, i) =>
                (box[i * 4] ?? 0) > 170 && (box[i * 4 + 3] ?? 0) > 128
                    ? '1'
                    : '0',
            ).join(''),
        };
    })) as Painted;
}

/** Pixels whose glyph membership differs between two paints of one size. */
function glyphDistance(a: Painted, b: Painted): number {
    let n = 0;
    for (let i = 0; i < a.glyph.length; i++) {
        if (a.glyph[i] !== b.glyph[i]) n++;
    }
    return n;
}

/** The caret's screen left edge, from CodeMirror. */
async function caretLeft(): Promise<number> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        const cm = (
            view?.editor as unknown as {
                cm?: {
                    state: { selection: { main: { head: number } } };
                    coordsAtPos(
                        pos: number,
                        side?: number,
                    ): { left: number } | null;
                };
            }
        )?.cm;
        if (!cm) return Number.NaN;
        return (
            cm.coordsAtPos(cm.state.selection.main.head, 1)?.left ?? Number.NaN
        );
    })) as number;
}

/**
 * Samples the canvas until it shows the cursor, for longer than one blink
 * cycle (1200 ms), so a cursor that was never woken is still caught in an
 * on phase and judged by where it is rather than by whether it blinked.
 */
async function paintedNow(): Promise<Painted> {
    let sample = await painted();
    for (let i = 0; i < 28 && !sample.painted; i++) {
        await browser.pause(50);
        sample = await painted();
    }
    return sample;
}

describe('animated cursor and edits (#181)', function () {
    this.timeout(120000);

    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await applySettingsAndReloadPlugin({
            animatedCursor: true,
            smoothCursor: false,
            smearTrail: false,
        });
    });

    after(async function () {
        await applySettingsAndReloadPlugin({
            animatedCursor: false,
            smoothCursor: true,
            smearTrail: true,
        });
    });

    /**
     * Paints the cursor on `abc def`'s first character after layout has
     * settled, so the glyph cache holds `a` keyed on a row top that the edit
     * leaves bit-identical; then runs `keys` and compares the paint with a
     * fresh one of the same position.
     */
    async function editUnderCursor(keys: string[]): Promise<number> {
        await setupEditor('abc def', { line: 0, ch: 0 });
        await browser.keys(['Escape']);
        await browser.pause(PAUSE.EDITOR_SETTLE);
        await browser.keys(['l']);
        await browser.pause(150);
        await browser.keys(['h']);
        await browser.pause(150);

        await browser.keys(keys);
        await browser.pause(150);
        const afterEdit = await paintedNow();

        // Away and back: a fresh measurement of the same character.
        await browser.keys(['l']);
        await browser.pause(150);
        await browser.keys(['h']);
        await browser.pause(150);
        const fresh = await paintedNow();

        expect(afterEdit.painted).toBe(true);
        expect(fresh.painted).toBe(true);
        expect(afterEdit.glyph.length).toBe(fresh.glyph.length);
        // Not byte equality: the two measurements can place the block a
        // fraction of a pixel apart, which changes edge anti-aliasing
        // (measured: alpha 32 against 17 at a corner) but not the letter.
        return glyphDistance(afterEdit, fresh);
    }

    it('x repaints the new character under the block cursor', async function () {
        expect(await editUnderCursor(['x'])).toBeLessThanOrEqual(4);
    });

    it('r repaints the replaced character under the block cursor', async function () {
        expect(await editUnderCursor(['r', 'z'])).toBeLessThanOrEqual(4);
    });

    it('follows a change that moves the caret without setting the selection', async function () {
        await setupEditor('xxxxabc', { line: 0, ch: 4 });
        await browser.keys(['Escape']);
        await browser.pause(PAUSE.EDITOR_SETTLE);
        const before = await paintedNow();

        // Delete the four characters before the caret. The selection maps
        // through the change; the transaction does not set it.
        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            const cm = (
                view?.editor as unknown as {
                    cm?: { dispatch(spec: unknown): void };
                }
            )?.cm;
            cm?.dispatch({ changes: { from: 0, to: 4, insert: '' } });
        });
        await browser.pause(150);
        const after = await paintedNow();
        const caret = await caretLeft();

        expect(before.painted).toBe(true);
        expect(after.painted).toBe(true);
        expect(Math.abs(after.left - caret)).toBeLessThan(2);
        expect(after.left).toBeLessThan(before.left - 10);
    });

    it('follows Enter outdenting an empty nested bullet', async function () {
        await setupEditor('- a\n\t- b\n\t\t- ', { line: 2, ch: 4 });
        await browser.keys(['Escape']);
        await browser.pause(PAUSE.EDITOR_SETTLE);
        await browser.keys(['A']);
        await browser.pause(PAUSE.EDITOR_SETTLE);
        const before = await paintedNow();

        await browser.keys(['Enter']);
        await browser.pause(150);
        const after = await paintedNow();
        const caret = await caretLeft();
        const line = (await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            const editor = view?.editor;
            return editor ? editor.getLine(editor.getCursor().line) : null;
        })) as string | null;

        // Obsidian outdents the empty item rather than opening a new one.
        expect(line).toBe('\t- ');
        expect(before.painted).toBe(true);
        expect(after.painted).toBe(true);
        expect(Math.abs(after.left - caret)).toBeLessThan(2);
    });
});
