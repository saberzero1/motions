import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    sendVimEscape,
    ensureLivePreview,
    PAUSE,
} from '../helpers';

/**
 * Issue #184 asked for `align-items: center` on `.cm-gutterElement` so that
 * line numbers sit at the vertical centre of taller heading rows. Measurement
 * showed the premise does not hold and the change would regress two cases, so
 * this spec pins the behaviour that already works instead.
 *
 * Obsidian propagates each line's line-height onto its gutter element (a
 * heading's gutter element measures 31.07px against a normal line's 24px), so
 * the number and the heading glyph already share one line box and are exactly
 * aligned. The number is only above the centre of the taller *block*, because a
 * heading's trailing spacing is part of that block but not part of its text.
 *
 * Centring against the block therefore moves the number off the heading text,
 * and moves a wrapped line's number off the first display row entirely — Neovim,
 * Obsidian's native gutter and VS Code all keep it on row 1. Both cases are
 * asserted so neither can be traded for the other.
 *
 * Each assertion measures the number's glyph centre against the centre of the
 * line's FIRST DISPLAY ROW, not against the text's glyph centre. Comparing two
 * glyph rects means comparing two font content areas at different sizes (a 12px
 * monospace number against a 25.9px heading), and a content area is centred on
 * the line box only when that font governs the line's baseline. On a heading the
 * baseline comes from the strut, so a different platform font stack shifts the
 * heading's centre while the gutter number does not move: that comparison read
 * 0.0px on Linux and 2.5px on Windows for identical, correct rendering. The row
 * centre is font-metric-free on the row side, and it is the invariant the plugin
 * actually controls — where the text sits inside its own row is Obsidian's
 * typography. The row's top is the block's top plus its leading space, because a
 * heading pads above the text rather than below it.
 */

const HEADING_LINE = '# Heading one';
const NORMAL_LINE = 'plain single row';
const WRAPPING_LINE = 'lorem ipsum dolor sit amet consectetur '
    .repeat(12)
    .trim();
const WRAPPING_HEADING = `# ${'wrapping heading text '.repeat(10).trim()}`;
const TAIL_LINE = 'tail';

const DOC = [
    HEADING_LINE,
    NORMAL_LINE,
    WRAPPING_LINE,
    WRAPPING_HEADING,
    TAIL_LINE,
].join('\n');

const HEADING = 0;
const NORMAL = 1;
const WRAPPED = 2;
const WRAPPED_HEADING = 3;

const TOLERANCE_PX = 2;

interface LineMeasurement {
    blockHeight: number;
    rowOffset: number;
}

type Measurement =
    | { error: string; lines?: undefined }
    | { error?: undefined; lines: LineMeasurement[] };

async function setLineNumberGutter(enabled: boolean): Promise<void> {
    await browser.executeObsidian(async ({ app }, on: boolean) => {
        const plugin = (
            app as unknown as {
                plugins: {
                    plugins: Record<
                        string,
                        {
                            settings: Record<string, unknown>;
                            saveSettings: () => Promise<void>;
                            reconfigureLineNumberGutter: () => void;
                        }
                    >;
                };
            }
        ).plugins.plugins['vim-motions'];
        if (!plugin) throw new Error('setLineNumberGutter: plugin not found');
        plugin.settings.number = on;
        await plugin.saveSettings();
        plugin.reconfigureLineNumberGutter();
    }, enabled);
    await browser.waitUntil(
        async () =>
            (await browser.executeObsidian(({ app, obsidian }, on: boolean) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                const dom = (
                    view?.editor as unknown as { cm?: { dom?: HTMLElement } }
                )?.cm?.dom;
                const present =
                    dom?.querySelector('.cm-gutter.vim-motions-line-numbers') !=
                    null;
                return present === on;
            }, enabled)) as boolean,
        {
            timeout: 5000,
            interval: 100,
            timeoutMsg: `line-number gutter did not become ${enabled ? 'present' : 'absent'}`,
        },
    );
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

async function measureGutterAlignment(): Promise<Measurement> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return { error: 'no MarkdownView' };
        const dom = (view.editor as unknown as { cm?: { dom?: HTMLElement } })
            .cm?.dom;
        if (!dom) return { error: 'no CodeMirror dom' };

        const gutter = dom.querySelector('.cm-gutter.vim-motions-line-numbers');
        if (!gutter) return { error: 'no .vim-motions-line-numbers gutter' };

        const lineEls = Array.from(
            dom.querySelectorAll('.cm-content > .cm-line'),
        );
        if (lineEls.length !== 5)
            return {
                error: `expected 5 rendered lines, got ${lineEls.length}`,
            };

        // A DOM Range over the first non-space character yields that glyph's
        // inline box, which is unaffected by whether the containing element is
        // laid out inline or as a block-level flex item. Element rects are not:
        // they change meaning once the fix turns the marker into a flex item.
        const firstGlyphCentre = (root: Element): number | null => {
            const walker = document.createTreeWalker(
                root,
                NodeFilter.SHOW_TEXT,
            );
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                const text = node.textContent ?? '';
                for (let offset = 0; offset < text.length; offset++) {
                    if (/\s/.test(text[offset])) continue;
                    const range = document.createRange();
                    range.setStart(node, offset);
                    range.setEnd(node, offset + 1);
                    const rect = Array.from(range.getClientRects()).find(
                        (r) => r.width > 0 && r.height > 0,
                    );
                    if (rect) return rect.top + rect.height / 2;
                }
            }
            return null;
        };

        // CM6's width-reserving spacer is a zero-height `.cm-gutterElement`
        // carrying no distinguishing class, only inline `visibility: hidden`.
        // It sits at the gutter's top and will otherwise match line 0.
        const gutterEls = Array.from(
            gutter.querySelectorAll('.cm-gutterElement'),
        ).filter((el) => (el as HTMLElement).style.visibility !== 'hidden');

        const lines: LineMeasurement[] = [];
        for (const lineEl of lineEls) {
            const lineTop = lineEl.getBoundingClientRect().top;
            const gutterEl = gutterEls.find(
                (el) => Math.abs(el.getBoundingClientRect().top - lineTop) <= 2,
            );
            if (!gutterEl)
                return {
                    error: `no gutter element aligned with line top ${String(lineTop)}`,
                };

            const marker = gutterEl.querySelector('.vim-motions-line-num');
            if (!marker)
                return { error: 'gutter element has no .vim-motions-line-num' };

            const numberCentre = firstGlyphCentre(marker);
            if (numberCentre === null)
                return { error: 'no glyph rect for the gutter number' };

            const lineStyle = getComputedStyle(lineEl);
            const rowHeight = Number.parseFloat(lineStyle.lineHeight);
            if (!Number.isFinite(rowHeight))
                return { error: 'line has no resolved line-height' };

            // A heading's block is taller than its row because the leading
            // space sits ABOVE the text: measured 47.06px block, 31.07px row,
            // ~16px padding-top. The first row therefore starts at the end of
            // that space, not at the top of the border box.
            const leading =
                (Number.parseFloat(lineStyle.paddingTop) || 0) +
                (Number.parseFloat(lineStyle.borderTopWidth) || 0);

            lines.push({
                blockHeight: gutterEl.getBoundingClientRect().height,
                rowOffset: numberCentre - (lineTop + leading + rowHeight / 2),
            });
        }

        return { lines };
    })) as Measurement;
}

describe('Gutter line-number vertical alignment (#184)', function () {
    let measurement: Measurement;

    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await browser.pause(PAUSE.OBSIDIAN_LOAD);
        await ensureLivePreview();
        // Cursor on the last line so the heading renders with its markup
        // concealed and is not the current line.
        await setupEditor(DOC, { line: 4, ch: 0 });
        // Must follow setState/setValue: Obsidian rebuilds the CodeMirror
        // instance on a mode change, resetting the gutter compartment.
        await setLineNumberGutter(true);
        await sendVimEscape();
        await browser.pause(PAUSE.EDITOR_SETTLE);
        measurement = await measureGutterAlignment();
    });

    after(async function () {
        await setLineNumberGutter(false);
    });

    it('renders a fixture whose heading and wrapped lines are genuinely taller', function () {
        expect(measurement.error).toBeUndefined();
        const lines = measurement.lines as LineMeasurement[];
        const normal = lines[NORMAL].blockHeight;

        // Without these guards a Live Preview that failed to render the heading,
        // or an editor wide enough not to wrap, would make both alignment
        // assertions trivially true.
        expect(lines[HEADING].blockHeight).toBeGreaterThan(normal * 1.3);
        expect(lines[WRAPPED].blockHeight).toBeGreaterThan(normal * 1.8);
        // A wrapped heading is tall for BOTH reasons at once, so it must be
        // taller than the unwrapped heading rather than merely taller than a
        // body line.
        expect(lines[WRAPPED_HEADING].blockHeight).toBeGreaterThan(
            lines[HEADING].blockHeight * 1.5,
        );
        // Anchors the row-centre formula: on a plain single-row line the row IS
        // the block, so a platform that pads above the text fails here rather
        // than silently skewing every other case.
        expect(Math.abs(lines[NORMAL].rowOffset)).toBeLessThanOrEqual(
            TOLERANCE_PX,
        );
    });

    it('aligns the number with the heading text on a tall heading line', function () {
        expect(measurement.error).toBeUndefined();
        const lines = measurement.lines as LineMeasurement[];
        expect(Math.abs(lines[HEADING].rowOffset)).toBeLessThanOrEqual(
            TOLERANCE_PX,
        );
    });

    it('aligns the number on a heading that is tall AND wrapped', function () {
        expect(measurement.error).toBeUndefined();
        const lines = measurement.lines as LineMeasurement[];
        expect(Math.abs(lines[WRAPPED_HEADING].rowOffset)).toBeLessThanOrEqual(
            TOLERANCE_PX,
        );
    });

    it('keeps the number on the first display row of a wrapped line', function () {
        expect(measurement.error).toBeUndefined();
        const lines = measurement.lines as LineMeasurement[];
        expect(Math.abs(lines[WRAPPED].rowOffset)).toBeLessThanOrEqual(
            TOLERANCE_PX,
        );
    });
});
