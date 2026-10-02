import { browser, expect } from '@wdio/globals';
import {
    ensureLivePreview,
    loadSingleFileWorkspace,
    setPluginSettingAndReload,
    setupEditor,
} from '../helpers';

/**
 * Plan E1.2: the owned surface renders in a monospace grid, and the passive
 * and active renderers agree on geometry.
 *
 * Two renderers show the same table alternately — the passive rows while the
 * cursor is elsewhere, the nested editor while it is inside — so a typography
 * difference between them is a visible jump at the moment of entry. The 1px
 * parity assertion here is the regression guard for every later styling
 * change in the owned surface.
 *
 * Geometry is measured, never screenshotted: a screenshot is evidence, not a
 * gate.
 */

const TABLE_DOC = [
    'Line above',
    '',
    '| h1   | h2   |',
    '|------|------|',
    '| aa   | 11   |',
    '| bb   | 22   |',
    '| cc   | 33   |',
    '',
    'Line below',
].join('\n');

interface Geometry {
    error?: string;
    mounted: number;
    /** Monospace is detected by advance width, not by font name. */
    monospaced: boolean;
    fontFamily: string;
    ligatures: string;
    whiteSpace: string;
    /** x of the first glyph of each rendered row's text. */
    rowLefts: number[];
    /** Width of each row's rendered text, not of its element box. */
    rowWidths: number[];
    lineHeight: number;
    scrollWidth: number;
}

async function geometry(passive: boolean): Promise<Geometry> {
    return (await browser.executeObsidian(
        ({ app, obsidian }, wantPassive: boolean) => {
            const empty: Geometry = {
                mounted: -1,
                monospaced: false,
                fontFamily: '',
                ligatures: '',
                whiteSpace: '',
                rowLefts: [],
                rowWidths: [],
                lineHeight: -1,
                scrollWidth: -1,
            };
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<
                            string,
                            { getNestedTableStats: () => { mounted: number } }
                        >;
                    };
                }
            ).plugins.plugins['vim-motions'];
            if (!plugin) return { ...empty, error: 'no plugin' };
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { ...empty, error: 'no MarkdownView' };

            const rows = wantPassive
                ? Array.from(
                      view.containerEl.querySelectorAll<HTMLElement>(
                          '.vim-motions-table-surface-row',
                      ),
                  )
                : Array.from(
                      view.containerEl.querySelectorAll<HTMLElement>(
                          '.vim-motions-table-nested .cm-line',
                      ),
                  );
            if (rows.length === 0) {
                return { ...empty, error: `no rows (passive=${wantPassive})` };
            }

            const probeHost = rows[0] as HTMLElement;
            const cs = getComputedStyle(probeHost);

            // Advance-width test: an `i` and an `M` must occupy the same
            // width. Asserting the font *name* would pass on any theme that
            // merely names a proportional font in --font-monospace.
            const measure = (ch: string): number => {
                const span = document.createElement('span');
                span.textContent = ch.repeat(20);
                // Longhands, not the `font` shorthand: Chrome serializes
                // `getComputedStyle().font` as an empty string unless every
                // longhand round-trips, which left the probe in the body's
                // proportional font and reported every grid as non-monospace.
                span.style.fontFamily = cs.fontFamily;
                span.style.fontSize = cs.fontSize;
                span.style.fontWeight = cs.fontWeight;
                span.style.fontStyle = cs.fontStyle;
                span.style.letterSpacing = cs.letterSpacing;
                span.style.whiteSpace = 'pre';
                span.style.position = 'absolute';
                span.style.visibility = 'hidden';
                document.body.appendChild(span);
                const w = span.getBoundingClientRect().width;
                span.remove();
                return w;
            };
            const narrow = measure('i');
            const wide = measure('M');

            // The rendered TEXT, not the element box. A passive row is a
            // block div that fills its container while a `.cm-line` is sized
            // by CodeMirror's content box, so the two boxes differ by 12px
            // for reasons that have nothing to do with typography — measured.
            // A Range over the text measures what the font actually drew.
            const boxes = rows.map((r) => {
                const range = document.createRange();
                range.selectNodeContents(r);
                const rect = range.getBoundingClientRect();
                range.detach();
                return rect.width > 0 ? rect : r.getBoundingClientRect();
            });
            const scroller = wantPassive
                ? (view.containerEl.querySelector<HTMLElement>(
                      '.vim-motions-table-surface-rows',
                  ) ?? probeHost)
                : (view.containerEl.querySelector<HTMLElement>(
                      '.vim-motions-table-nested .cm-scroller',
                  ) ?? probeHost);

            return {
                mounted: plugin.getNestedTableStats().mounted,
                monospaced: Math.abs(narrow - wide) < 0.5,
                fontFamily: cs.fontFamily,
                ligatures: cs.fontVariantLigatures,
                whiteSpace: cs.whiteSpace,
                rowLefts: boxes.map((b) => Math.round(b.left * 100) / 100),
                rowWidths: boxes.map((b) => Math.round(b.width * 100) / 100),
                lineHeight: Math.round(boxes[0]!.height * 100) / 100,
                scrollWidth: scroller.scrollWidth,
            };
        },
        passive,
    )) as Geometry;
}

async function parkOutsideTable(): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        const cm = (view?.editor as unknown as { cm?: unknown })?.cm as
            | {
                  state: { doc: { line: (n: number) => { from: number } } };
                  dispatch: (s: unknown) => void;
              }
            | undefined;
        if (!cm) throw new Error('no EditorView');
        cm.dispatch({ selection: { anchor: cm.state.doc.line(1).from } });
    });
    await browser.pause(800);
}

async function enterTable(): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        const cm = (view?.editor as unknown as { cm?: unknown })?.cm as
            | {
                  state: { doc: { line: (n: number) => { from: number } } };
                  dispatch: (s: unknown) => void;
              }
            | undefined;
        if (!cm) throw new Error('no EditorView');
        cm.dispatch({ selection: { anchor: cm.state.doc.line(5).from + 2 } });
    });
    await browser.pause(900);
}

describe('Owned table typography (Plan E1.2)', function () {
    this.timeout(300000);

    before(async () => {
        await loadSingleFileWorkspace();
        await setPluginSettingAndReload('tableWidgetMode', 'owned');
        await ensureLivePreview();
    });

    after(async () => {
        await setPluginSettingAndReload('tableWidgetMode', 'native');
    });

    beforeEach(async () => {
        await setupEditor(TABLE_DOC, { line: 0, ch: 0 });
        await browser.pause(800);
    });

    it('renders the passive rows in a monospace grid', async () => {
        await parkOutsideTable();
        const g = await geometry(true);
        expect(g.error).toBeUndefined();
        expect(g.mounted).toBe(0);
        // Measured by advance width, so a theme naming a proportional font in
        // --font-monospace would still fail this.
        expect(g.monospaced).toBe(true);
        expect(g.ligatures).toBe('none');
        expect(g.whiteSpace).toBe('pre');
        // Every row starts at the same x, which is what a grid means.
        expect(new Set(g.rowLefts).size).toBe(1);
    });

    it('renders the nested editor in the same monospace grid', async () => {
        await enterTable();
        const g = await geometry(false);
        expect(g.error).toBeUndefined();
        expect(g.mounted).toBe(1);
        expect(g.monospaced).toBe(true);
        expect(g.ligatures).toBe('none');
        expect(new Set(g.rowLefts).size).toBe(1);
    });

    it('passive and active geometry agree within 1px', async () => {
        await parkOutsideTable();
        const passive = await geometry(true);
        await enterTable();
        const active = await geometry(false);

        expect(passive.error).toBeUndefined();
        expect(active.error).toBeUndefined();
        expect(passive.mounted).toBe(0);
        expect(active.mounted).toBe(1);

        // Same font, so the advance width is identical and the grid does not
        // reflow when the cursor enters the table.
        expect(active.fontFamily).toBe(passive.fontFamily);
        expect(Math.abs(active.lineHeight - passive.lineHeight)).toBeLessThan(
            1,
        );
        expect(
            Math.abs(active.rowLefts[0]! - passive.rowLefts[0]!),
        ).toBeLessThan(1);

        // The rendered rows are the same table, so each row's width matches.
        expect(active.rowWidths.length).toBe(passive.rowWidths.length);
        for (let i = 0; i < passive.rowWidths.length; i++) {
            expect(
                Math.abs(active.rowWidths[i]! - passive.rowWidths[i]!),
            ).toBeLessThan(1);
        }
    });
});
