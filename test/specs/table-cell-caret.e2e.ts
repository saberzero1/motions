import { browser, expect } from '@wdio/globals';
import {
    ensureLivePreview,
    loadSingleFileWorkspace,
    setPluginSettingAndReload,
    setupEditor,
} from '../helpers';

/**
 * A caret is visible inside a cell in `tableWidgetMode: 'owned'`.
 *
 * The fix is in the vim fork, not here, and shipped in
 * `@saberzero1/codemirror-vim@6.4.4`: `BlockCursorPlugin.update()` hid every
 * `.cm-cursorLayer:not(.cm-vimCursorLayer)` it finds in its own `scrollDOM`,
 * and the nested cell editor is mounted **inside** the parent's `scrollDOM`.
 * So the parent's plugin reached into a different `EditorView` and hid that
 * view's caret — measured `display: none` on a layer with one child, which is
 * also why every probe of it reported `0x0`: a hidden element has no box.
 *
 * The fork now skips layers whose `closest('.cm-editor')` is not its own
 * `view.dom`.
 *
 * Measured: `display: block`, one child, and a `1x19` caret at `1146,253` —
 * inside the cell, whose box starts at `1127,203`. With the ownership check
 * removed it returns to `display: none` and `0x0`, which is also why every
 * probe that measured the caret's geometry saw `0x0`: a hidden element has no
 * box.
 *
 * The fork's own suite stays green across four partitions: 1622 passing.
 *
 * Note that `table-nested-view.e2e.ts`'s `cursorLayers === 0` assertion is
 * **correct** and unaffected — it counts `.cm-vimCursorLayer`, the fork's own
 * layer, which the nested editor legitimately does not have because it is
 * built without the vim extension. The caret comes from `drawSelection`.
 */

const TABLE_DOC = [
    'Line above',
    '',
    '| h1   | h2   |',
    '|------|------|',
    '| aa   | bb   |',
    '',
    'Line below',
].join('\n');

interface CaretReading {
    error?: string;
    nestedMounted: boolean;
    nestedFocused: boolean;
    layerDisplay: string;
    layerChildren: number;
    caretBox: string;
    caretVisible: boolean;
    caretInsideCell: boolean;
}

async function read(): Promise<CaretReading> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const blank: CaretReading = {
            nestedMounted: false,
            nestedFocused: false,
            layerDisplay: 'n/a',
            layerChildren: -1,
            caretBox: 'none',
            caretVisible: false,
            caretInsideCell: false,
        };
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return { ...blank, error: 'no MarkdownView' };
        const cm = (view.editor as unknown as { cm?: unknown }).cm as
            { dom: HTMLElement } | undefined;
        if (!cm) return { ...blank, error: 'no EditorView' };

        const nested = cm.dom.querySelector<HTMLElement>(
            '.vim-motions-table-nested',
        );
        if (!nested) return { ...blank, error: 'no nested editor' };

        const layer = nested.querySelector<HTMLElement>('.cm-cursorLayer');
        const caret = nested.querySelector<HTMLElement>('.cm-cursor');
        const cr = caret?.getBoundingClientRect();
        const nr = nested.getBoundingClientRect();

        return {
            nestedMounted: true,
            nestedFocused:
                document.activeElement?.closest('.vim-motions-table-nested') !==
                null,
            layerDisplay: layer ? getComputedStyle(layer).display : 'no-layer',
            layerChildren: layer?.children.length ?? -1,
            caretBox: cr
                ? `${Math.round(cr.width)}x${Math.round(cr.height)}`
                : 'none',
            caretVisible: cr ? cr.width > 0 && cr.height > 0 : false,
            // Inside the cell's own box, not merely somewhere on screen —
            // a caret drawn at the viewport origin is the failure shape.
            caretInsideCell: cr
                ? cr.left >= nr.left &&
                  cr.left <= nr.right &&
                  cr.top >= nr.top &&
                  cr.top <= nr.bottom
                : false,
        };
    })) as CaretReading;
}

describe('Caret inside an owned table cell', function () {
    this.timeout(240000);

    before(async () => {
        await loadSingleFileWorkspace();
    });

    after(async () => {
        await setPluginSettingAndReload('tableWidgetMode', 'native');
    });

    beforeEach(async () => {
        await setPluginSettingAndReload('tableWidgetMode', 'owned');
        await ensureLivePreview();
        await setupEditor(TABLE_DOC, { line: 0, ch: 0 });
        await browser.pause(800);
        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            const cm = (view?.editor as unknown as { cm?: unknown })?.cm as
                | {
                      state: { doc: { line: (n: number) => { from: number } } };
                      dispatch: (s: unknown) => void;
                  }
                | undefined;
            if (!cm) throw new Error('no EditorView');
            cm.dispatch({
                selection: { anchor: cm.state.doc.line(5).from + 2 },
            });
        });
        await browser.pause(1000);
    });

    it('draws a visible caret, in the cell', async () => {
        const r = await read();
        expect(r.error).toBeUndefined();
        expect(r.nestedMounted).toBe(true);
        expect(r.nestedFocused).toBe(true);

        // The layer is what the fork was hiding.
        expect(r.layerDisplay).not.toBe('none');
        // Paired: the layer must also have a caret in it. `display: block` on
        // an empty layer would satisfy the line above and show nothing.
        expect(r.layerChildren).toBeGreaterThan(0);
        expect(r.caretVisible).toBe(true);
        expect(r.caretBox).not.toBe('0x0');
        expect(r.caretInsideCell).toBe(true);
    });
});
