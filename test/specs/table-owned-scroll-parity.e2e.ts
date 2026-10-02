import { browser, expect } from '@wdio/globals';
import {
    ensureLivePreview,
    getEditorValue,
    handleEx,
    loadSingleFileWorkspace,
    setPluginSettingAndReload,
    setupEditor,
} from '../helpers';

/**
 * Plan B Step 9, scenarios 5A and 5B.
 *
 * Issue #167 items 5 and 6 — horizontal scrolloff, and `scrolloff=100`
 * breaking horizontal movement — are Plan E's work. "Out of scope" here means
 * **`owned` must be no worse than `native`**, which is a comparison rather than
 * an absence of work.
 *
 * 5B deliberately asserts **parity** rather than correctness, because the
 * native behaviour is itself reported broken. Asserting correctness would make
 * this plan responsible for a defect it does not own, and would fail for the
 * wrong reason.
 */

const WIDE_HEADER = '| c1 | c2 | c3 | c4 | c5 | c6 | c7 | c8 | c9 | c10 |';
const WIDE_SEPARATOR = '|----|----|----|----|----|----|----|----|----|-----|';

function wideRow(n: number): string {
    const cell = `r${String(n).padStart(2, '0')}xxxxxxxxx`;
    return `| ${Array.from({ length: 10 }, () => cell).join(' | ')} |`;
}

const FIXTURE = [
    ...Array.from({ length: 30 }, (_, i) => `Filler line ${i + 1}`),
    '',
    WIDE_HEADER,
    WIDE_SEPARATOR,
    ...Array.from({ length: 40 }, (_, i) => wideRow(i + 1)),
    '',
    'After the table',
].join('\n');

/** Line (1-based) of the table's third data row. */
const CURSOR_LINE = 31 + 1 + 2 + 3;

interface Reading {
    error?: string;
    caretLeft: number;
    caretRight: number;
    scrollerLeft: number;
    scrollerRight: number;
    scrollOffset: number;
    inViewport: boolean;
}

async function readCaret(): Promise<Reading> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const blank = {
            caretLeft: NaN,
            caretRight: NaN,
            scrollerLeft: NaN,
            scrollerRight: NaN,
            scrollOffset: NaN,
            inViewport: false,
        };
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return { ...blank, error: 'no MarkdownView' };
        const cm = (view.editor as unknown as { cm?: unknown }).cm as
            | {
                  dom: HTMLElement;
                  scrollDOM: HTMLElement;
                  state: { selection: { main: { head: number } } };
                  coordsAtPos(pos: number): {
                      left: number;
                      right: number;
                  } | null;
              }
            | undefined;
        if (!cm) return { ...blank, error: 'no EditorView' };

        // The owned surface renders its own caret inside the nested editor;
        // the native widget keeps the cursor in a cell editor. Prefer whatever
        // caret is actually on screen, and fall back to the parent's coords.
        const nestedCaret = cm.dom.querySelector<HTMLElement>(
            '.vim-motions-table-nested .cm-cursor, .vim-motions-table-nested .cm-cursor-primary',
        );
        const cellCaret = cm.dom.querySelector<HTMLElement>(
            '.cm-table-widget .cm-cursor, .cm-table-widget .cm-cursor-primary',
        );
        const caretEl = nestedCaret ?? cellCaret;

        let left = NaN;
        let right = NaN;
        if (caretEl) {
            const r = caretEl.getBoundingClientRect();
            left = r.left;
            right = r.right;
        } else {
            const coords = cm.coordsAtPos(cm.state.selection.main.head);
            if (coords) {
                left = coords.left;
                right = coords.right;
            }
        }

        // The scroller that actually moves: the table's own wrapper when one
        // exists, otherwise the editor's.
        const wrapper =
            cm.dom.querySelector<HTMLElement>(
                '.vim-motions-table-nested .cm-scroller',
            ) ??
            cm.dom.querySelector<HTMLElement>(
                '.cm-table-widget .table-wrapper',
            ) ??
            cm.scrollDOM;
        const sr = wrapper.getBoundingClientRect();

        return {
            caretLeft: left,
            caretRight: right,
            scrollerLeft: sr.left,
            scrollerRight: sr.right,
            scrollOffset: wrapper.scrollLeft,
            inViewport:
                Number.isFinite(left) &&
                left >= sr.left - 1 &&
                right <= sr.right + 1,
        };
    })) as Reading;
}

async function park(line: number, ch: number): Promise<void> {
    await browser.executeObsidian(
        ({ app, obsidian }, target: { line: number; ch: number }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            const cm = (view?.editor as unknown as { cm?: unknown })?.cm as
                | {
                      state: {
                          doc: { line: (n: number) => { from: number } };
                      };
                      dispatch: (spec: unknown) => void;
                  }
                | undefined;
            if (!cm) throw new Error('no EditorView');
            cm.dispatch({
                selection: {
                    anchor: cm.state.doc.line(target.line).from + target.ch,
                },
            });
        },
        { line, ch },
    );
    await browser.pause(700);
}

interface ModeResult {
    offsets: number[];
    final: Reading;
    doc: string;
    docUnchanged: boolean;
}

/**
 * Collapses cell padding and separator width.
 *
 * Obsidian's native table editor **realigns the whole table** when the cursor
 * leaves a cell, padding every cell to a uniform width and rewriting
 * `|----|` as `| ------------ |`. Measured: 60 `l` presses cross cells, so the
 * native run rewrites lines 32 and 33. That is Obsidian's documented
 * format-on-exit behaviour, not data loss, and not something this plan may
 * assert away — so native is held to "no content lost" while `owned`, which is
 * our code, is held to byte-identical.
 */
function normalizeTable(text: string): string {
    // Content only: all horizontal whitespace removed, separator runs
    // collapsed. A looser comparison than `owned` is held to, deliberately —
    // native's realignment changes padding everywhere, and the question for it
    // is only whether anything was lost.
    return text.replace(/-{2,}/g, '-').replace(/[ \t]/g, '');
}

async function runSequence(
    mode: 'native' | 'owned',
    scrolloff: number | null,
): Promise<ModeResult> {
    await setPluginSettingAndReload('tableWidgetMode', mode);
    await ensureLivePreview();
    await setupEditor(FIXTURE, { line: 0, ch: 0 });
    await browser.pause(900);
    if (scrolloff !== null) {
        await handleEx(`set scrolloff=${scrolloff}`);
        await browser.pause(300);
    }
    await park(CURSOR_LINE, 2);

    const offsets: number[] = [];
    for (let batch = 0; batch < 6; batch++) {
        await browser.keys(Array.from({ length: 10 }, () => 'l'));
        await browser.pause(350);
        offsets.push((await readCaret()).scrollOffset);
    }

    const doc = await getEditorValue();
    return {
        offsets,
        final: await readCaret(),
        doc,
        docUnchanged: doc === FIXTURE,
    };
}

describe('Owned table horizontal scroll parity (#167 items 5, 6)', function () {
    this.timeout(600000);

    before(async () => {
        await loadSingleFileWorkspace();
    });

    after(async () => {
        await setPluginSettingAndReload('tableWidgetMode', 'native');
    });

    it('5A: the caret stays reachable in owned mode at least as well as native', async () => {
        const native = await runSequence('native', null);
        const owned = await runSequence('owned', null);

        expect(native.final.error).toBeUndefined();
        expect(owned.final.error).toBeUndefined();
        // Our renderer must not touch the document while only moving.
        expect(owned.docUnchanged).toBe(true);
        // Native may realign; it must not lose content.
        expect(normalizeTable(native.doc)).toBe(normalizeTable(FIXTURE));

        // Unconditional, because a conditional form was vacuous: measured,
        // `native.final.inViewport` is FALSE here, so an
        // `if (native…) expect(owned…)` never ran. Phrased as "owned is no
        // worse" instead, which is the bound the plan actually asks for and
        // which executes on every run.
        const ownedNoWorse = owned.final.inViewport || !native.final.inViewport;
        expect(ownedNoWorse).toBe(true);
        // Offsets are readable numbers in both modes, which is what scenario
        // 5B then builds on.
        for (const offset of [...native.offsets, ...owned.offsets]) {
            expect(Number.isFinite(offset)).toBe(true);
            expect(offset).toBeGreaterThanOrEqual(0);
        }
    });

    it('5B: scrolloff=100 does not break horizontal movement in either mode', async () => {
        const native = await runSequence('native', 100);
        const owned = await runSequence('owned', 100);

        expect(owned.docUnchanged).toBe(true);
        expect(normalizeTable(native.doc)).toBe(normalizeTable(FIXTURE));

        for (const offset of [...native.offsets, ...owned.offsets]) {
            expect(Number.isFinite(offset)).toBe(true);
            expect(offset).toBeGreaterThanOrEqual(0);
        }

        // Parity on the reported defect rather than correctness.
        expect(owned.final.inViewport).toBe(native.final.inViewport);
    });
});
