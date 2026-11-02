import { browser, expect } from '@wdio/globals';
import {
    ensureLivePreview,
    loadSingleFileWorkspace,
    setupEditor,
} from '../helpers';

// The screen column `gj` and `gk` keep (#228). A click moves the cursor
// without a motion, so the column of the `gj` before it was kept and the next
// `gj` went back there; Vim resets the column on a click. And `gj` stopped
// short of a last display row shorter than the column, where Neovim moves to
// its end: `gj` from column 9 of `abcdefghij` onto `xy` lands on `y`
// (measured, 0.12.5).

const testing = (n: number) => Array(n).fill('testing').join(' ');

interface At {
    line: number;
    ch: number;
    x: number;
    y: number;
}

async function at(): Promise<At> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        const cm = (
            view?.editor as unknown as {
                cm?: {
                    state: { selection: { main: { head: number } } };
                    coordsAtPos(
                        p: number,
                    ): { left: number; top: number } | null;
                    contentDOM: HTMLElement;
                };
            }
        )?.cm;
        const pos = view?.editor.getCursor() ?? { line: -1, ch: -1 };
        const c = cm?.coordsAtPos(cm.state.selection.main.head);
        const rect = cm?.contentDOM.getBoundingClientRect();
        return {
            line: pos.line,
            ch: pos.ch,
            x: Math.round((c?.left ?? 0) - (rect?.left ?? 0)),
            y: Math.round((c?.top ?? 0) - (rect?.top ?? 0)),
        };
    })) as At;
}

/** Vim keys, `gj` as two keys; named keys such as `Escape` whole. */
async function press(...keys: string[]): Promise<void> {
    for (const key of keys) {
        await browser.keys(/^[A-Z][a-z]+$/.test(key) ? [key] : key.split(''));
        await browser.pause(150);
    }
    await browser.pause(150);
}

/** A real click on character `ch` of `line`. */
async function click(line: number, ch: number): Promise<void> {
    const point = (await browser.executeObsidian(
        ({ app, obsidian }, l: number, c: number) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            const cm = (
                view?.editor as unknown as {
                    cm?: {
                        coordsAtPos(p: number): {
                            left: number;
                            top: number;
                            bottom: number;
                        } | null;
                        state: { doc: { line(n: number): { from: number } } };
                    };
                }
            )?.cm;
            const coords = cm?.coordsAtPos(cm.state.doc.line(l + 1).from + c);
            return coords
                ? {
                      x: Math.round(coords.left + 2),
                      y: Math.round((coords.top + coords.bottom) / 2),
                  }
                : null;
        },
        line,
        ch,
    )) as { x: number; y: number } | null;
    if (!point) throw new Error(`no coordinates for ${line}:${ch}`);
    await browser
        .action('pointer')
        .move({ x: point.x, y: point.y, origin: 'viewport' })
        .down()
        .up()
        .perform();
    await browser.pause(300);
}

describe('The screen column of gj and gk (#228)', function () {
    this.timeout(120000);

    beforeEach(async function () {
        await loadSingleFileWorkspace();
        await ensureLivePreview();
    });

    it('a click sets the column the next gj keeps', async function () {
        await setupEditor([testing(32), '', testing(16)].join('\n'), {
            line: 0,
            ch: 0,
        });
        await press('Escape', 'e', 'e', 'e', 'e', 'e', 'e', 'gj', 'gj');
        const before = await at();
        await click(2, 12);
        const clicked = await at();
        await press('gj');
        const after = await at();
        expect({
            line: after.line,
            nextRow: after.y > clicked.y,
            // Within a character of the click, nowhere near the column the
            // `gj` before it kept.
            clickedColumn: Math.abs(after.x - clicked.x) < 12,
            oldColumn: Math.abs(after.x - before.x) < 12,
        }).toEqual({
            line: 2,
            nextRow: true,
            clickedColumn: true,
            oldColumn: false,
        });
    });

    it('gj reaches a last display row shorter than the column', async function () {
        const text = testing(32);
        await setupEditor(text, { line: 0, ch: 0 });
        await press('Escape');
        // The end of each display row down to the last.
        const rows: At[] = [];
        for (let i = 0; i < 8; i++) {
            await press('g$');
            const end = await at();
            if (rows.length && end.ch === rows[rows.length - 1]!.ch) break;
            rows.push(end);
            await press('gj');
        }
        // From the end of the row above the last, which is longer.
        const aboveLast = rows[rows.length - 2]!;
        await setupEditor(text, { line: 0, ch: aboveLast.ch });
        await press('Escape', 'h', 'l', 'gj');
        const landed = await at();
        await press('gj');
        expect({
            rows: rows.length >= 3,
            landed: landed.ch,
            again: (await at()).ch,
        }).toEqual({
            rows: true,
            landed: text.length - 1,
            again: text.length - 1,
        });
    });
});
