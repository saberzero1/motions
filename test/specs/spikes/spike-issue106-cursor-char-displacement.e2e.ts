import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    sendVimEscape,
    ensureLivePreview,
    PAUSE,
} from '../../helpers';

/**
 * Spike: Issue #106 — Character beneath cursor displaced on tall lines.
 *
 * renderer.ts baseline formula:
 *   baseline = rect.top + (rect.height - fontHeight) / 2 + ascent
 *
 * When rect.height (from coordsAtPos) equals fontHeight, centering is a
 * no-op and the character lands at the correct baseline. When rect.height
 * is inflated (e.g. to the full cm-line height on a tall MathJax line),
 * the character shifts down by (rect.height - fontHeight) / 2.
 *
 * In our CI environment, coordsAtPos returns per-character height (19 px)
 * even on 80 px-tall cm-lines, so the bug doesn't manifest naturally.
 * The tests below artificially feed the cm-line height into the baseline
 * formula to reproduce the displacement and verify any future fix.
 */

// ─── Helpers ────────────────────────────────────────────────────────────

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

interface LineMeasurements {
    charPositions: {
        char: string;
        charOffset: number;
        coordsTop: number;
        coordsHeight: number;
        domCharTop: number;
        domCharHeight: number;
        font: string;
    }[];
    cmLineHeight: number;
    mathjaxPresent: boolean;
}

/**
 * With cursor parked on `cursorLine` (0-indexed), measure several
 * character positions on `targetLine` (1-indexed) without moving the
 * cursor (so Live Preview widgets stay rendered).
 */
async function measureLine(
    targetLine: number,
    charOffsets: number[],
    cursorLine: number,
    content: string,
): Promise<LineMeasurements> {
    await setupEditor(content, { line: cursorLine, ch: 0 });
    await browser.pause(3000);

    return (await browser.executeObsidian(
        (
            { app, obsidian },
            args: { targetLine: number; charOffsets: number[] },
        ) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view)
                return {
                    charPositions: [],
                    cmLineHeight: 0,
                    mathjaxPresent: false,
                };

            const ev = (view.editor as unknown as Record<string, unknown>)
                .cm as
                | {
                      contentDOM: HTMLElement;
                      coordsAtPos: (
                          pos: number,
                          side: number,
                      ) => {
                          top: number;
                          bottom: number;
                          left: number;
                          right: number;
                      } | null;
                      state: {
                          doc: {
                              line: (n: number) => {
                                  from: number;
                                  to: number;
                                  text: string;
                              };
                          };
                      };
                      domAtPos: (pos: number) => {
                          node: Node;
                          offset: number;
                      };
                  }
                | undefined;
            if (!ev)
                return {
                    charPositions: [],
                    cmLineHeight: 0,
                    mathjaxPresent: false,
                };

            const line = ev.state.doc.line(args.targetLine);

            // Walk up from the first char to find the parent .cm-line
            let cmLineHeight = 0;
            let mathjaxPresent = false;
            try {
                const domInfo = ev.domAtPos(line.from);
                let el: Node | null = domInfo.node;
                while (
                    el &&
                    !(
                        el instanceof HTMLElement &&
                        el.classList.contains('cm-line')
                    )
                ) {
                    el = el.parentNode;
                }
                if (el) {
                    cmLineHeight = (el as HTMLElement).getBoundingClientRect()
                        .height;
                    mathjaxPresent =
                        (el as HTMLElement).querySelector(
                            'mjx-container, .MathJax, .math',
                        ) !== null;
                }
            } catch {
                /* ignore */
            }

            const charPositions: LineMeasurements['charPositions'] = [];
            for (const offset of args.charOffsets) {
                if (offset >= line.text.length) continue;
                const pos = line.from + offset;
                const ch = line.text[offset];
                const coords = ev.coordsAtPos(pos, 1);
                if (!coords) continue;

                let domCharTop = 0;
                let domCharHeight = 0;
                let font = '';
                try {
                    const di = ev.domAtPos(pos);
                    const parent = di.node.parentElement;
                    if (parent) {
                        const s = window.getComputedStyle(parent);
                        font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
                    }
                    const range = document.createRange();
                    range.setStart(di.node, di.offset);
                    range.setEnd(
                        di.node,
                        Math.min(
                            di.offset + 1,
                            di.node.textContent?.length ?? 0,
                        ),
                    );
                    const r = range.getBoundingClientRect();
                    domCharTop = r.top;
                    domCharHeight = r.height;
                } catch {
                    /* widget content */
                }

                charPositions.push({
                    char: ch ?? '',
                    charOffset: offset,
                    coordsTop: coords.top,
                    coordsHeight: coords.bottom - coords.top,
                    domCharTop,
                    domCharHeight,
                    font,
                });
            }

            return { charPositions, cmLineHeight, mathjaxPresent };
        },
        { targetLine, charOffsets },
    )) as LineMeasurements;
}

/**
 * Replicates the renderer.ts baseline formula:
 *   baseline = rectTop + (rectHeight - fontHeight) / 2 + ascent
 *
 * Run inside executeObsidian so we have a real canvas context with the
 * correct font metrics.
 */
async function computeBaseline(
    font: string,
    char: string,
    rectTop: number,
    rectHeight: number,
): Promise<{ baseline: number; ascent: number; fontHeight: number }> {
    return (await browser.executeObsidian(
        (
            _ctx,
            args: {
                font: string;
                char: string;
                rectTop: number;
                rectHeight: number;
            },
        ) => {
            const c = document.createElement('canvas');
            const ctx = c.getContext('2d')!;
            ctx.font = args.font;
            ctx.textBaseline = 'alphabetic';
            const m = ctx.measureText(args.char);
            const ascent =
                m.fontBoundingBoxAscent ??
                m.actualBoundingBoxAscent ??
                args.rectHeight * 0.8;
            const descent =
                m.fontBoundingBoxDescent ??
                m.actualBoundingBoxDescent ??
                args.rectHeight * 0.2;
            const fontHeight = ascent + descent;
            const baseline =
                args.rectTop + (args.rectHeight - fontHeight) / 2 + ascent;
            return { baseline, ascent, fontHeight };
        },
        { font, char, rectTop, rectHeight },
    )) as { baseline: number; ascent: number; fontHeight: number };
}

// ─── Tests ──────────────────────────────────────────────────────────────

const MATHJAX_CONTENT = [
    'like this $\\dfrac{\\text{really}}{\\dfrac{\\text{tall}}{\\dfrac{\\text{line}}{\\text{height}}}}$',
    'Normal line below',
].join('\n');

describe('Spike #106 v3: Cursor character displacement on tall lines', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await ensureLivePreview();
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);
    });

    // ── Precondition: MathJax renders and the cm-line is tall ────────

    describe('Precondition: MathJax tall line', function () {
        it('cm-line height should exceed coordsAtPos height', async function () {
            // Cursor on line 2 so line 1 MathJax renders as a widget
            const m = await measureLine(1, [0, 2, 5], 1, MATHJAX_CONTENT);

            console.log(`cm-line height: ${m.cmLineHeight.toFixed(1)}px`);
            console.log(`MathJax present: ${m.mathjaxPresent}`);
            for (const p of m.charPositions) {
                console.log(
                    `  '${p.char}' @${p.charOffset}: coordsH=${p.coordsHeight.toFixed(1)}, domCharH=${p.domCharHeight.toFixed(1)}`,
                );
            }

            expect(m.mathjaxPresent).toBe(true);
            expect(m.charPositions.length).toBeGreaterThan(0);
            expect(m.cmLineHeight).toBeGreaterThan(
                m.charPositions[0]!.coordsHeight * 2,
            );
        });
    });

    // ── Artificially injected displacement ───────────────────────────

    describe('Injected displacement: feed cm-line height into baseline formula', function () {
        it('should produce significant displacement when using cm-line height', async function () {
            await setAnimatedCursor(true);

            // Cursor on line 2 so line 1 MathJax renders as a widget
            const m = await measureLine(1, [0, 2, 4, 6], 1, MATHJAX_CONTENT);
            expect(m.mathjaxPresent).toBe(true);

            for (const p of m.charPositions) {
                // "Correct" baseline: formula fed with coordsAtPos height
                const correct = await computeBaseline(
                    p.font,
                    p.char,
                    p.coordsTop,
                    p.coordsHeight,
                );

                // "Buggy" baseline: formula fed with cm-line height,
                // simulating a platform where coordsAtPos returns the
                // full line height instead of per-character height.
                const buggy = await computeBaseline(
                    p.font,
                    p.char,
                    p.coordsTop,
                    m.cmLineHeight,
                );

                const displacement = buggy.baseline - correct.baseline;

                console.log(
                    `'${p.char}' @${p.charOffset}: correct=${correct.baseline.toFixed(1)}, buggy=${buggy.baseline.toFixed(1)}, displacement=${displacement.toFixed(1)}px`,
                );

                // The displacement must equal (cmLineHeight - coordsHeight) / 2
                const expectedShift = (m.cmLineHeight - p.coordsHeight) / 2;
                expect(displacement).toBeCloseTo(expectedShift, 0);

                // With a ~80 px line and ~19 px char, shift ≈ 30 px
                expect(Math.abs(displacement)).toBeGreaterThan(10);
            }

            await setAnimatedCursor(false);
        });

        it('should show zero displacement when using DOM char height', async function () {
            await setAnimatedCursor(true);

            const m = await measureLine(1, [0, 2, 4, 6], 1, MATHJAX_CONTENT);
            expect(m.mathjaxPresent).toBe(true);

            for (const p of m.charPositions) {
                // Baseline anchored to the actual DOM character rect
                const domBased = await computeBaseline(
                    p.font,
                    p.char,
                    p.domCharTop,
                    p.domCharHeight,
                );

                // Baseline anchored to coordsAtPos (what the renderer does today)
                const coordsBased = await computeBaseline(
                    p.font,
                    p.char,
                    p.coordsTop,
                    p.coordsHeight,
                );

                const displacement = coordsBased.baseline - domBased.baseline;

                console.log(
                    `'${p.char}' @${p.charOffset}: coordsBased=${coordsBased.baseline.toFixed(1)}, domBased=${domBased.baseline.toFixed(1)}, diff=${displacement.toFixed(2)}px`,
                );

                // coordsAtPos and DOM char rects agree in our environment,
                // so the displacement should be ~0. A fix that switches to
                // DOM-based rects would produce the same result.
                expect(Math.abs(displacement)).toBeLessThan(1);
            }

            await setAnimatedCursor(false);
        });
    });

    // ── Regression guard: same character on normal vs tall line ──────

    describe('Same character, different line heights', function () {
        it('buggy formula should displace on tall line but not on normal line', async function () {
            await setAnimatedCursor(true);

            const content = [
                'the * character on a normal line',
                'the * character $\\dfrac{a}{\\dfrac{b}{\\dfrac{c}{d}}}$ on tall',
                'the * character on another normal line',
            ].join('\n');

            // Cursor on line 1 (0-indexed) so line 2 MathJax renders
            const tall = await measureLine(2, [4], 0, content);
            const normal = await measureLine(1, [4], 2, content);

            expect(tall.mathjaxPresent).toBe(true);
            expect(tall.charPositions.length).toBeGreaterThan(0);
            expect(normal.charPositions.length).toBeGreaterThan(0);

            const tallChar = tall.charPositions[0]!;
            const normalChar = normal.charPositions[0]!;

            // Buggy baselines (using cm-line height)
            const buggyTall = await computeBaseline(
                tallChar.font,
                tallChar.char,
                tallChar.coordsTop,
                tall.cmLineHeight,
            );
            const buggyNormal = await computeBaseline(
                normalChar.font,
                normalChar.char,
                normalChar.coordsTop,
                normal.cmLineHeight,
            );

            // Correct baselines (using coordsAtPos / DOM char height)
            const correctTall = await computeBaseline(
                tallChar.font,
                tallChar.char,
                tallChar.coordsTop,
                tallChar.coordsHeight,
            );
            const correctNormal = await computeBaseline(
                normalChar.font,
                normalChar.char,
                normalChar.coordsTop,
                normalChar.coordsHeight,
            );

            const buggyShiftTall = buggyTall.baseline - correctTall.baseline;
            const buggyShiftNormal =
                buggyNormal.baseline - correctNormal.baseline;

            console.log(
                `'${tallChar.char}' on tall line: cmLineH=${tall.cmLineHeight.toFixed(0)}, coordsH=${tallChar.coordsHeight.toFixed(0)}, buggy shift=${buggyShiftTall.toFixed(1)}px`,
            );
            console.log(
                `'${normalChar.char}' on normal line: cmLineH=${normal.cmLineHeight.toFixed(0)}, coordsH=${normalChar.coordsHeight.toFixed(0)}, buggy shift=${buggyShiftNormal.toFixed(1)}px`,
            );

            // Tall line: significant shift. Normal line: negligible shift.
            expect(Math.abs(buggyShiftTall)).toBeGreaterThan(10);
            expect(Math.abs(buggyShiftNormal)).toBeLessThan(5);

            await setAnimatedCursor(false);
        });
    });

    // ── Multi-character regression ───────────────────────────────────

    describe('Multiple characters (*, :, a) on tall line', function () {
        it('all characters should shift equally under buggy formula', async function () {
            await setAnimatedCursor(true);

            const content = [
                'a * b : c',
                'a * b : c $\\dfrac{x}{\\dfrac{y}{z}}$ tail',
            ].join('\n');

            const m = await measureLine(2, [0, 2, 4, 6, 8], 0, content);
            expect(m.mathjaxPresent).toBe(true);

            const shifts: number[] = [];

            for (const p of m.charPositions) {
                const correct = await computeBaseline(
                    p.font,
                    p.char,
                    p.coordsTop,
                    p.coordsHeight,
                );
                const buggy = await computeBaseline(
                    p.font,
                    p.char,
                    p.coordsTop,
                    m.cmLineHeight,
                );

                const shift = buggy.baseline - correct.baseline;
                shifts.push(shift);

                console.log(`'${p.char}': shift=${shift.toFixed(1)}px`);
            }

            // All shifts should be equal: (cmLineHeight - coordsHeight) / 2
            expect(m.charPositions.length).toBeGreaterThan(0);
            const expectedShift =
                (m.cmLineHeight - m.charPositions[0]!.coordsHeight) / 2;
            for (const s of shifts) {
                expect(s).toBeCloseTo(expectedShift, 0);
            }

            await setAnimatedCursor(false);
        });
    });
});
