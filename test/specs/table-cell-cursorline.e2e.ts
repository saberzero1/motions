import { browser, expect } from '@wdio/globals';
import {
    ensureLivePreview,
    loadSingleFileWorkspace,
    sendVimEscape,
    setPluginSetting,
    setPluginSettingAndReload,
    setupEditor,
} from '../helpers';

/**
 * Plan G, step G1 — regression coverage of **existing** behaviour.
 *
 * `createCursorlineExtension` used to be wrapped in `skipInTableCells()`, a
 * function that skipped nothing, so the plan assumed cursor-line decorations
 * rendered inside Obsidian's one-line table cell editors. **Measured, they do
 * not** — in neither the `Decoration.line` modes nor the measured-rectangle
 * `screenline` mode. No fix was needed and none was made.
 *
 * This pins the absence, because the reason no CSS or gate exists is that
 * measurement, and a future refactor of the cursorline extension could start
 * rendering in cells with nobody noticing.
 *
 * The parent control is deliberately **mode-specific**. A second measured fact:
 * in `line`/`both` the parent's own cursorline also disappears while the cursor
 * sits in a table, because `Decoration.line` at a position inside the
 * block-replaced table range has no rendered `.cm-line` to attach to. Asserting
 * a parent highlight there would fail for a reason unrelated to cells.
 */

const TABLE_DOC = [
    'Line above',
    '',
    '| Name | Value |',
    '|------|-------|',
    '| aa   | 11    |',
    '',
    'Line below',
].join('\n');

interface Reading {
    error?: string;
    cellEditorActive: boolean;
    cellDoc: string;
    cellLineCount: number;
    highlightsInWidget: number;
    /** Of those, how many actually paint a background. */
    tintedInWidget: number;
    highlightsOutsideWidget: number;
    tintedOutsideWidget: number;
    layersInWidget: number;
    layersOutsideWidget: number;
}

async function read(): Promise<Reading> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const blank = {
            cellEditorActive: false,
            cellDoc: '',
            cellLineCount: -1,
            highlightsInWidget: -1,
            tintedInWidget: -1,
            highlightsOutsideWidget: -1,
            tintedOutsideWidget: -1,
            layersInWidget: -1,
            layersOutsideWidget: -1,
        };
        const isTransparent = (c: string): boolean =>
            c === 'transparent' ||
            c === 'rgba(0, 0, 0, 0)' ||
            /^rgba\(.*,\s*0\)$/.test(c);
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return { ...blank, error: 'no MarkdownView' };
        const contentEl = (view as unknown as { contentEl: HTMLElement })
            .contentEl;

        const editMode = (view as unknown as Record<string, unknown>)
            .editMode as Record<string, unknown> | undefined;
        const cell = editMode?.tableCell as Record<string, unknown> | null;
        const cellCm = cell?.cm as
            | { dom?: HTMLElement; state?: { doc?: { toString(): string } } }
            | undefined;

        const inWidget = (el: Element) =>
            el.closest('.cm-table-widget') !== null;
        const highlights = Array.from(
            contentEl.querySelectorAll('.vim-motions-cursorline'),
        );
        const layers = Array.from(
            contentEl.querySelectorAll('.vim-motions-cursorline-layer'),
        );

        return {
            cellEditorActive: cell != null,
            cellDoc: cellCm?.state?.doc?.toString() ?? '',
            cellLineCount:
                cellCm?.dom?.querySelectorAll('.cm-line').length ?? -1,
            highlightsInWidget: highlights.filter(inWidget).length,
            // What the user actually sees. Whether the decoration APPLIES in a
            // cell editor is environment-dependent — measured absent on one
            // developer machine and present in CI on all three platforms — so
            // an element count is not a property worth asserting. A painted
            // background is.
            tintedInWidget: highlights
                .filter(inWidget)
                .filter(
                    (e) => !isTransparent(getComputedStyle(e).backgroundColor),
                ).length,
            highlightsOutsideWidget: highlights.filter((e) => !inWidget(e))
                .length,
            tintedOutsideWidget: highlights
                .filter((e) => !inWidget(e))
                .filter(
                    (e) => !isTransparent(getComputedStyle(e).backgroundColor),
                ).length,
            layersInWidget: layers.filter(inWidget).length,
            layersOutsideWidget: layers.filter((e) => !inWidget(e)).length,
        };
    })) as Reading;
}

async function park(line: number, ch: number): Promise<void> {
    await browser.executeObsidian(
        ({ app, obsidian }, t: { line: number; ch: number }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            const cm = (view?.editor as unknown as { cm?: unknown })?.cm as
                | {
                      state: { doc: { line: (n: number) => { from: number } } };
                      dispatch: (spec: unknown) => void;
                  }
                | undefined;
            if (!cm) throw new Error('no EditorView');
            cm.dispatch({
                selection: { anchor: cm.state.doc.line(t.line).from + t.ch },
            });
        },
        { line, ch },
    );
    await browser.pause(900);
}

async function openTable(opt: 'line' | 'both' | 'screenline'): Promise<void> {
    await setPluginSetting('cursorline', true);
    await setPluginSettingAndReload('cursorlineopt', opt);
    await setPluginSettingAndReload('tableWidgetMode', 'native');
    await ensureLivePreview();
    await setupEditor(TABLE_DOC, { line: 0, ch: 0 });
    await sendVimEscape();
    await browser.pause(400);
}

describe('Cursorline does not reach table cell editors (Plan G)', function () {
    this.timeout(240000);

    before(async () => {
        await loadSingleFileWorkspace();
    });

    after(async () => {
        await setPluginSetting('cursorline', true);
        await setPluginSettingAndReload('cursorlineopt', 'both');
        await setPluginSettingAndReload('tableWidgetMode', 'native');
    });

    for (const opt of ['line', 'both'] as const) {
        it(`cursorlineopt=${opt}: no highlight in a cell, and the parent's returns on leaving`, async () => {
            await openTable(opt);

            // Selector validity: with the cursor outside any table the parent
            // must have exactly one highlight. Without this, "0 in the cell"
            // is indistinguishable from a selector that matches nothing.
            const outside = await read();
            expect(outside.error).toBeUndefined();
            expect(outside.highlightsOutsideWidget).toBe(1);
            // Selector validity: the parent's highlight is actually painted, so
            // "nothing painted in the cell" cannot pass on a dead selector.
            expect(outside.tintedOutsideWidget).toBe(1);

            await park(5, 2);
            const inside = await read();

            // Precondition, or everything below passes trivially.
            expect(inside.cellEditorActive).toBe(true);
            expect(inside.cellLineCount).toBeGreaterThan(0);
            expect(inside.cellDoc).toBe('aa');

            expect(inside.tintedInWidget).toBe(0);

            // Mode-specific parent control: in these modes the parent's own
            // highlight is gone too, because its cursor is inside the
            // block-replaced range. So assert it RETURNS once we leave.
            await park(1, 0);
            const left = await read();
            expect(left.highlightsOutsideWidget).toBe(1);
            expect(left.tintedOutsideWidget).toBe(1);
            expect(left.tintedInWidget).toBe(0);
        });
    }

    it('the suppression rule itself neutralises a cursorline in a cell', async () => {
        // Tests the CSS rule directly, by injecting a probe element rather
        // than waiting for the decoration to apply. Whether it applies is
        // environment-dependent — absent on one developer machine, present in
        // CI on all three platforms — so without this the suppression is
        // untestable wherever the decoration happens not to appear, which is
        // exactly how the defect was declared non-existent in the first place.
        await openTable('line');

        const probe = (await browser.executeObsidian(() => {
            const widget = document.querySelector('.cm-table-widget');
            const content = document.querySelector('.cm-content');
            if (!widget || !content) return null;

            const make = (host: Element): string => {
                const el = document.createElement('div');
                el.className = 'vim-motions-cursorline';
                el.textContent = 'probe';
                host.appendChild(el);
                const bg = getComputedStyle(el).backgroundColor;
                el.remove();
                return bg;
            };
            const transparent = (c: string): boolean =>
                c === 'transparent' ||
                c === 'rgba(0, 0, 0, 0)' ||
                /^rgba\(.*,\s*0\)$/.test(c);

            const inside = make(widget);
            const outside = make(content);
            return {
                inside,
                outside,
                insideTransparent: transparent(inside),
                outsideTransparent: transparent(outside),
            };
        })) as {
            inside: string;
            outside: string;
            insideTransparent: boolean;
            outsideTransparent: boolean;
        } | null;

        expect(probe).not.toBeNull();
        // Inside the widget the rule wins and paints nothing.
        expect(probe!.insideTransparent).toBe(true);
        // Outside it the ordinary rule still paints, so the probe is a real
        // test of specificity rather than of a class nobody styles.
        expect(probe!.outsideTransparent).toBe(false);
    });

    it('cursorlineopt=screenline: no layer in a cell while the parent keeps its own', async () => {
        await openTable('screenline');

        const outside = await read();
        expect(outside.error).toBeUndefined();
        expect(outside.layersOutsideWidget).toBeGreaterThan(0);

        await park(5, 2);
        const inside = await read();

        expect(inside.cellEditorActive).toBe(true);
        expect(inside.cellDoc).toBe('aa');
        expect(inside.layersInWidget).toBe(0);
        expect(inside.tintedInWidget).toBe(0);

        // The parent control proper: unlike the line modes, the measured
        // rectangle survives the cursor being in a table, so it can be
        // asserted in place.
        expect(inside.layersOutsideWidget).toBeGreaterThan(0);
    });
});
