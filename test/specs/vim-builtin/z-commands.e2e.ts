import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    vimKeys,
    getCursorPos,
    sendVimEscape,
    ensureLivePreview,
    ensureSourceMode,
    PAUSE,
} from '../../helpers';

interface WrapGeometry {
    viewportHeight: number;
    lineHeight: number;
    /** Cursor's display row, relative to the top of the scroll viewport. */
    cursorTop: number;
    cursorBottom: number;
    /** First/last display row of the cursor's logical line, viewport-relative. */
    blockTop: number;
    blockBottom: number;
}

async function getWrapGeometry(): Promise<WrapGeometry | null> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return null;
        const cm = (view.editor as unknown as Record<string, unknown>).cm as
            import('@codemirror/view').EditorView | undefined;
        if (!cm) return null;
        const head = cm.state.selection.main.head;
        const line = cm.state.doc.lineAt(head);
        const cursorCoords = cm.coordsAtPos(head);
        const startCoords = cm.coordsAtPos(line.from);
        const endCoords = cm.coordsAtPos(line.to);
        if (!cursorCoords || !startCoords || !endCoords) return null;
        const rect = cm.scrollDOM.getBoundingClientRect();
        return {
            viewportHeight: rect.height,
            lineHeight: cm.defaultLineHeight || 22,
            cursorTop: cursorCoords.top - rect.top,
            cursorBottom: cursorCoords.bottom - rect.top,
            blockTop: startCoords.top - rect.top,
            blockBottom: endCoords.bottom - rect.top,
        };
    })) as WrapGeometry | null;
}

async function getScrollTop(): Promise<number> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return -1;
        const cm6 = (view.editor as unknown as Record<string, unknown>).cm as
            { scrollDOM: HTMLElement } | undefined;
        return cm6?.scrollDOM.scrollTop ?? -1;
    })) as number;
}

describe('Normal mode — z-prefix commands (Tier 1)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(50);
    });

    describe('zz / zt / zb (scroll cursor to screen position)', function () {
        it('zz/zt/zb should produce distinct scroll positions in correct order', async function () {
            const lines = Array.from(
                { length: 200 },
                (_, i) => `line ${i + 1}`,
            ).join('\n');
            await setupEditor(lines, { line: 100, ch: 0 });

            await vimKeys('z', 'b');
            await browser.pause(100);
            const scrollZb = await getScrollTop();
            expect((await getCursorPos()).line).toBe(100);

            await vimKeys('z', 'z');
            await browser.pause(100);
            const scrollZz = await getScrollTop();
            expect((await getCursorPos()).line).toBe(100);

            await vimKeys('z', 't');
            await browser.pause(100);
            const scrollZt = await getScrollTop();
            expect((await getCursorPos()).line).toBe(100);

            expect(scrollZb).toBeLessThan(scrollZz);
            expect(scrollZz).toBeLessThan(scrollZt);
        });
    });

    describe('zz / zt / zb with visible frontmatter properties (#143)', function () {
        /**
         * When YAML frontmatter properties are rendered in Live Preview,
         * the .metadata-container occupies space inside scrollDOM but above
         * contentDOM. The scrollToCursor action uses charCoords (relative to
         * contentDOM) for the scroll target but scrollTo (which operates on
         * scrollDOM). Without adjusting for the metadata offset, zt/zz/zb
         * scroll to wrong positions — zt acts like zz, zz overshoots, etc.
         */

        const FRONTMATTER_PROPS = Array.from(
            { length: 15 },
            (_, i) => `prop${i + 1}: value${i + 1}`,
        );

        const BODY_LINES = Array.from(
            { length: 200 },
            (_, i) => `line ${i + 1}`,
        );

        const CONTENT_WITH_FM = [
            '---',
            ...FRONTMATTER_PROPS,
            '---',
            '',
            ...BODY_LINES,
        ].join('\n');

        before(async function () {
            await ensureLivePreview();
            await browser.pause(PAUSE.EDITOR_SETTLE);
        });

        it('zz/zt/zb should produce distinct scroll positions with frontmatter visible', async function () {
            // Line 100 in body = line ~118 in document (17 frontmatter lines + 1 blank)
            await setupEditor(CONTENT_WITH_FM, { line: 118, ch: 0 });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            await vimKeys('z', 'b');
            await browser.pause(100);
            const scrollZb = await getScrollTop();
            expect((await getCursorPos()).line).toBe(118);

            await vimKeys('z', 'z');
            await browser.pause(100);
            const scrollZz = await getScrollTop();
            expect((await getCursorPos()).line).toBe(118);

            await vimKeys('z', 't');
            await browser.pause(100);
            const scrollZt = await getScrollTop();
            expect((await getCursorPos()).line).toBe(118);

            // Core invariant: zb < zz < zt (scroll positions must be distinct
            // and in correct order even when frontmatter is visible)
            expect(scrollZb).toBeLessThan(scrollZz);
            expect(scrollZz).toBeLessThan(scrollZt);
        });

        it('zt should place cursor line near the top of viewport, not center (#143)', async function () {
            await setupEditor(CONTENT_WITH_FM, { line: 118, ch: 0 });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const info = (await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return null;
                const cm6 = (view.editor as unknown as Record<string, unknown>)
                    .cm as
                    | {
                          scrollDOM: HTMLElement;
                          contentDOM: HTMLElement;
                          defaultLineHeight: number;
                      }
                    | undefined;
                if (!cm6) return null;
                return {
                    viewportHeight: cm6.scrollDOM.clientHeight,
                    lineHeight: cm6.defaultLineHeight,
                };
            })) as { viewportHeight: number; lineHeight: number } | null;
            expect(info).not.toBeNull();

            await vimKeys('z', 't');
            await browser.pause(100);
            const scrollAfterZt = await getScrollTop();

            await vimKeys('z', 'z');
            await browser.pause(100);
            const scrollAfterZz = await getScrollTop();

            // zt and zz must produce meaningfully different positions.
            // The difference should be roughly half the viewport height.
            // If zt acts like zz (the reported bug), the difference will be tiny.
            const diff = scrollAfterZt - scrollAfterZz;
            expect(diff).toBeGreaterThan(info!.viewportHeight * 0.3);
        });

        it('zt should place cursor line within top 15% of viewport (#143)', async function () {
            await setupEditor(CONTENT_WITH_FM, { line: 118, ch: 0 });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            await vimKeys('z', 't');
            await browser.pause(100);

            const result = (await browser.executeObsidian(
                ({ app, obsidian }) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return null;
                    const cm6 = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as
                        | {
                              scrollDOM: HTMLElement;
                              coordsAtPos: (
                                  pos: number,
                              ) => { top: number; bottom: number } | null;
                              state: {
                                  doc: {
                                      line: (n: number) => { from: number };
                                  };
                              };
                          }
                        | undefined;
                    if (!cm6) return null;

                    const scrollRect = cm6.scrollDOM.getBoundingClientRect();
                    const cursorLine = view.editor.getCursor().line;
                    const lineFrom = cm6.state.doc.line(cursorLine + 1).from;
                    const coords = cm6.coordsAtPos(lineFrom);
                    if (!coords) return null;

                    return {
                        offsetFromTop: coords.top - scrollRect.top,
                        viewportHeight: scrollRect.height,
                    };
                },
            )) as {
                offsetFromTop: number;
                viewportHeight: number;
            } | null;

            expect(result).not.toBeNull();
            const relativePosition =
                result!.offsetFromTop / result!.viewportHeight;
            expect(relativePosition).toBeLessThan(0.15);
            expect(relativePosition).toBeGreaterThanOrEqual(0);
        });
    });

    describe('zz on wrapped lines (#183)', function () {
        /**
         * Reference behaviour measured against Neovim 0.12.5 (`nvim -u NONE`,
         * 80x22 window, wrap on, scrolloff=0, smoothscroll off), cursor on the
         * final character of a single long line:
         *
         *   3 display rows  -> topline 12, skipcol 0    (3 rows below 9 above)
         *   15 display rows -> topline 18, skipcol 0    (15 rows below 3 above)
         *   38 display rows -> topline 21, skipcol 1280 (16 rows scrolled into)
         *
         * So `zz` centres the *whole* wrapped line rather than its first
         * display row, and once the line is taller than the window Vim scrolls
         * inside the line so the cursor stays on screen.
         */

        const FILLER = Array.from({ length: 120 }, (_, i) => `line ${i + 1}`);
        const LONG_LINE_INDEX = FILLER.length;
        const WORD = 'wrapped ';

        function docWith(longLine: string): string {
            return [...FILLER, longLine, ...FILLER].join('\n');
        }

        function lineOfRows(rows: number): string {
            return WORD.repeat(
                Math.ceil((charsPerRow * rows) / WORD.length),
            ).trim();
        }

        async function placeCursorAtEndOfLongLine(
            longLine: string,
        ): Promise<void> {
            await setupEditor(docWith(longLine), {
                line: LONG_LINE_INDEX,
                ch: longLine.length - 1,
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);
        }

        let charsPerRow = 0;
        let viewportRows = 0;

        before(async function () {
            await ensureSourceMode();
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const probe = WORD.repeat(250).trim();
            await placeCursorAtEndOfLongLine(probe);
            const geo = await getWrapGeometry();
            expect(geo).not.toBeNull();

            const probeRows = Math.round(
                (geo!.blockBottom - geo!.blockTop) / geo!.lineHeight,
            );
            expect(probeRows).toBeGreaterThan(1);
            charsPerRow = probe.length / probeRows;
            viewportRows = Math.floor(geo!.viewportHeight / geo!.lineHeight);
            expect(viewportRows).toBeGreaterThan(12);
        });

        it('zz should keep the cursor on screen when the line is taller than the viewport (#183)', async function () {
            await placeCursorAtEndOfLongLine(lineOfRows(viewportRows * 3));

            await vimKeys('z', 'z');
            await browser.pause(200);

            const geo = await getWrapGeometry();
            expect(geo).not.toBeNull();
            expect(geo!.blockBottom - geo!.blockTop).toBeGreaterThan(
                geo!.viewportHeight,
            );

            expect(geo!.cursorTop).toBeGreaterThanOrEqual(-1);
            expect(geo!.cursorBottom).toBeLessThanOrEqual(
                geo!.viewportHeight + 1,
            );
            expect(geo!.cursorBottom).toBeGreaterThan(
                geo!.viewportHeight - 2 * geo!.lineHeight,
            );
        });

        it('zz should centre the whole wrapped line, not its first display row (#183)', async function () {
            const rows = Math.max(6, Math.floor(viewportRows / 3));
            await placeCursorAtEndOfLongLine(lineOfRows(rows));

            await vimKeys('z', 'z');
            await browser.pause(200);

            const geo = await getWrapGeometry();
            expect(geo).not.toBeNull();
            const blockHeight = geo!.blockBottom - geo!.blockTop;
            expect(
                Math.round(blockHeight / geo!.lineHeight),
            ).toBeGreaterThanOrEqual(6);
            expect(blockHeight).toBeLessThan(
                geo!.viewportHeight - 4 * geo!.lineHeight,
            );

            const gapAbove = geo!.blockTop;
            const gapBelow = geo!.viewportHeight - geo!.blockBottom;
            expect(Math.abs(gapAbove - gapBelow)).toBeLessThanOrEqual(
                1.5 * geo!.lineHeight,
            );
        });

        it('zz should still centre a short unwrapped line', async function () {
            await setupEditor(docWith('short line'), {
                line: LONG_LINE_INDEX,
                ch: 0,
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            await vimKeys('z', 'z');
            await browser.pause(200);

            const geo = await getWrapGeometry();
            expect(geo).not.toBeNull();
            expect(geo!.blockBottom - geo!.blockTop).toBeLessThan(
                geo!.lineHeight * 1.5,
            );

            const blockCentre = (geo!.blockTop + geo!.blockBottom) / 2;
            expect(
                Math.abs(blockCentre - geo!.viewportHeight / 2),
            ).toBeLessThanOrEqual(geo!.lineHeight);
        });
    });

    describe('zh / zl / zH / zL (horizontal scroll)', function () {
        it('zh should not move cursor vertically', async function () {
            await setupEditor('short line', { line: 0, ch: 0 });
            await vimKeys('z', 'h');
            expect((await getCursorPos()).line).toBe(0);
        });

        it('zl should not move cursor vertically', async function () {
            await setupEditor('short line', { line: 0, ch: 0 });
            await vimKeys('z', 'l');
            expect((await getCursorPos()).line).toBe(0);
        });
    });
});
