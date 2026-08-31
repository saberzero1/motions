import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    vimKeys,
    getCursorPos,
    sendVimEscape,
    ensureLivePreview,
    PAUSE,
} from '../../helpers';

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
