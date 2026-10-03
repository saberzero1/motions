import { browser, expect } from '@wdio/globals';
import {
    ensureLivePreview,
    getVimMode,
    loadSingleFileWorkspace,
    setPluginSettingAndReload,
    setupEditor,
} from '../helpers';

/**
 * Restated rather than imported: a spec cannot value-import a `src` module
 * (`tsconfig.test.json` includes only `src` type declarations). Pinned to the source
 * constant by `test/unit/cursor-shape-defaults.test.ts`.
 */
const DEFAULT_SHAPES = {
    normal: 'block',
    insert: 'bar',
    visual: 'block',
    replace: 'underline',
    operatorPending: 'underline',
};

/**
 * The caret inside a cell in `tableWidgetMode: 'owned'` — present, and vim's.
 *
 * Two defects, fixed in two places, and each piece below has a scenario
 * because each is independently load-bearing.
 *
 * **It was hidden entirely.** The fork's `BlockCursorPlugin.update()` set
 * `display: none` on every `.cm-cursorLayer:not(.cm-vimCursorLayer)` in its own
 * `scrollDOM`, and the nested cell editor is a separate `EditorView` mounted
 * inside that `scrollDOM` — `querySelectorAll` does not stop at an editor
 * boundary. So the parent's plugin hid the child's caret. Fixed in
 * `@saberzero1/codemirror-vim@6.4.4` by skipping layers whose
 * `closest('.cm-editor')` is not the view's own `dom`. That also explains why
 * every probe of that caret measured `0x0`: a hidden element has no box.
 *
 * **Then it was the wrong caret.** Unhiding it restored `drawSelection()`'s,
 * a 1px bar identical in every mode — measured `1x19` in normal, insert and
 * back — so normal and insert were indistinguishable in a cell. Three pieces
 * fix that:
 *
 *  - `vimCursorFromSource` (fork) draws the fork's cursor in a view with no
 *    vim state of its own, reading mode from a supplied adapter. The nested
 *    editor is deliberately built without the vim extension so that one vim
 *    state keeps owning commands, registers and dot-repeat.
 *  - a mode-change redraw (host): a vim mode change produces **no transaction
 *    in the child**, so the child's cursor would keep whatever shape it was
 *    first measured with. Measured: the child's cursor plugin received zero
 *    updates across an `i` and an `<Esc>`, and the block stayed `10x19` in
 *    insert mode.
 *  - hiding `drawSelection()`'s cursor layer in the child (CSS): otherwise its
 *    bar renders beside the block — measured `10x19` and `1x19` together. Only
 *    the cursor layer, never the selection layer, which the range mirror needs
 *    for visual mode.
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

interface Shape {
    error?: string;
    nestedMounted: boolean;
    nestedFocused: boolean;
    /** The fork's own cursor, `WxH` or `none`. */
    vimCursor: string;
    vimCursorWidth: number;
    /** The shape classes the fork put on its cursor element. */
    vimCursorClasses: string;
    /** True when the drawn cursor sits inside the nested editor's box. */
    vimCursorInside: boolean;
    /** True when `drawSelection()`'s caret would also be visible. */
    drawSelVisible: boolean;
    /** True when the real browser caret is suppressed. */
    browserCaretTransparent: boolean;
    caretInsideCell: boolean;
}

async function shape(): Promise<Shape> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const blank: Shape = {
            nestedMounted: false,
            nestedFocused: false,
            vimCursor: 'none',
            vimCursorWidth: 0,
            vimCursorClasses: '',
            vimCursorInside: false,
            drawSelVisible: false,
            browserCaretTransparent: false,
            caretInsideCell: false,
        };
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return { ...blank, error: 'no MarkdownView' };
        const nested = view.containerEl.querySelector<HTMLElement>(
            '.vim-motions-table-nested',
        );
        if (!nested) return { ...blank, error: 'no nested editor' };

        const fat = nested.querySelector<HTMLElement>('.cm-fat-cursor');
        const fr = fat?.getBoundingClientRect();
        const nr = nested.getBoundingClientRect();
        const dsLayer = nested.querySelector<HTMLElement>(
            '.cm-cursorLayer:not(.cm-vimCursorLayer)',
        );
        const dsCaret = dsLayer
            ?.querySelector('.cm-cursor')
            ?.getBoundingClientRect();
        const content = nested.querySelector<HTMLElement>('.cm-content');
        const cc = content ? getComputedStyle(content).caretColor : '';

        return {
            nestedMounted: true,
            nestedFocused:
                document.activeElement?.closest('.vim-motions-table-nested') !==
                null,
            vimCursor: fr
                ? `${Math.round(fr.width)}x${Math.round(fr.height)}`
                : 'none',
            vimCursorWidth: fr ? Math.round(fr.width) : 0,
            vimCursorClasses: (fat?.className ?? '').toString(),
            vimCursorInside:
                fr !== undefined &&
                fr.width > 0 &&
                fr.height > 0 &&
                fr.left >= nr.left &&
                fr.left <= nr.right &&
                fr.top >= nr.top &&
                fr.top <= nr.bottom,
            drawSelVisible:
                dsLayer !== null &&
                getComputedStyle(dsLayer).display !== 'none' &&
                (dsCaret?.width ?? 0) > 0,
            browserCaretTransparent:
                cc === 'transparent' || cc === 'rgba(0, 0, 0, 0)',
            // Inside the cell's own box, not merely somewhere on screen — a
            // caret at the viewport origin is the failure shape.
            caretInsideCell: fr
                ? fr.left >= nr.left &&
                  fr.left <= nr.right &&
                  fr.top >= nr.top &&
                  fr.top <= nr.bottom
                : false,
        };
    })) as Shape;
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

    it('draws the vim block cursor in the cell, and only that', async () => {
        const s = await shape();
        expect(s.error).toBeUndefined();
        expect(s.nestedMounted).toBe(true);
        expect(s.nestedFocused).toBe(true);

        // Wider than a bar: the fork's block, driven by the parent's mode.
        expect(s.vimCursor).not.toBe('none');
        expect(s.vimCursorWidth).toBeGreaterThan(3);
        expect(s.caretInsideCell).toBe(true);
        // Exactly one caret. Both of these were violated at some point: the
        // drawSelection bar rendered beside the block, and before 6.4.4 the
        // block was absent and the bar was all there was.
        expect(s.drawSelVisible).toBe(false);
        expect(s.browserCaretTransparent).toBe(true);
    });

    it('draws a bar cursor in insert mode, and returns to the block', async () => {
        await browser.keys(['i']);
        await browser.pause(900);
        expect(await getVimMode()).toBe('insert');

        const ins = await shape();
        // A DRAWN element, not a colour. The previous version of this scenario
        // asserted `caret-color` was non-transparent on `.cm-content` and
        // passed while the cell had no visible caret at all: `drawSelection()`
        // sets `caret-color: transparent !important` on `.cm-line`, which is
        // where the caret actually paints, so the browser drew nothing. A
        // colour read is a precondition for a caret, never evidence of one.
        expect(ins.vimCursor).not.toBe('none');
        expect(ins.vimCursorInside).toBe(true);
        // The user's configured insert shape, `bar` by default.
        expect(DEFAULT_SHAPES.insert).toBe('bar');
        expect(ins.vimCursorClasses).toContain('cm-cursor-bar');
        // A bar, so narrow — and distinguishable from the normal-mode block,
        // which is the whole point of the scenario.
        expect(ins.vimCursorWidth).toBeLessThan(5);
        expect(ins.vimCursorWidth).toBeGreaterThan(0);

        await browser.keys(['Escape']);
        await browser.pause(900);
        expect(await getVimMode()).toBe('normal');

        // The half that fails without the mode-change redraw: leaving insert
        // produces no transaction in the child, so the shape would be stale.
        const back = await shape();
        expect(back.vimCursorWidth).toBeGreaterThan(3);
        expect(back.vimCursorClasses).not.toContain('cm-cursor-bar');
        expect(back.browserCaretTransparent).toBe(true);
    });

    it('follows a configured insert shape instead of assuming a bar', async () => {
        // The fix changes only *whether* a cursor is drawn when the resolved
        // shape is `bar`; the shape itself still comes from the user's own
        // `cursorShapes`. A hard-coded bar would pass the scenario above and
        // fail here, which is the only thing separating the two.
        await setPluginSettingAndReload('cursorShapes', {
            ...DEFAULT_SHAPES,
            insert: 'block',
        });
        await browser.pause(900);

        await browser.keys(['i']);
        await browser.pause(900);
        expect(await getVimMode()).toBe('insert');

        const ins = await shape();
        expect(ins.vimCursor).not.toBe('none');
        expect(ins.vimCursorInside).toBe(true);
        // A block, not the default bar: wide, and without the bar class.
        expect(ins.vimCursorClasses).not.toContain('cm-cursor-bar');
        expect(ins.vimCursorWidth).toBeGreaterThan(3);

        await browser.keys(['Escape']);
        await browser.pause(600);
        await setPluginSettingAndReload('cursorShapes', {
            ...DEFAULT_SHAPES,
        });
        await browser.pause(600);
    });

    it('keeps the selection background in visual mode', async () => {
        await browser.keys(['v', 'l']);
        await browser.pause(900);
        expect(await getVimMode()).toBe('visual');

        // The CSS hides only the cursor layer. Had it hidden the selection
        // layer, the mirrored visual range would render nothing.
        const rects = await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            const nested = view?.containerEl.querySelector<HTMLElement>(
                '.vim-motions-table-nested',
            );
            return (
                nested?.querySelectorAll('.cm-selectionBackground').length ?? -1
            );
        });
        expect(rects).toBeGreaterThan(0);

        await browser.keys(['Escape']);
        await browser.pause(600);
    });
});
