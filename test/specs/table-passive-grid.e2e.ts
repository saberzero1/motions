import { browser, expect } from '@wdio/globals';
import {
    ensureLivePreview,
    getEditorValue,
    loadSingleFileWorkspace,
    setPluginSettingAndReload,
    setupEditor,
} from '../helpers';

/**
 * Plan E1.6: the idle table renders as a styled grid.
 *
 * The invariant that matters is **character identity**: every row's rendered
 * text equals its source line exactly. The nested editor is CodeMirror text
 * showing the padded source, so a passive renderer that inserted, hid or
 * re-ordered a glyph would shift the grid the moment the cursor entered the
 * table. `table-typography.e2e.ts` measures the resulting jump; this spec
 * asserts the cause directly, which is the cheaper signal when it breaks.
 *
 * That is also why the grid is not a `<table>` and is not re-aligned, despite
 * alignment being parsed and carried as a class.
 */

const TABLE_DOC = [
    'Line above',
    '',
    '| h1   | h2   | h3   |',
    '|:-----|-----:|:----:|',
    '| aa   | 11   | xx   |',
    '| bb   | 22   | yy   |',
    '',
    'Line below',
].join('\n');

const SOURCE_ROWS = [
    '| h1   | h2   | h3   |',
    '|:-----|-----:|:----:|',
    '| aa   | 11   | xx   |',
    '| bb   | 22   | yy   |',
];

interface Grid {
    error?: string;
    mounted: number;
    rowCount: number;
    rowTexts: string[];
    cellCount: number;
    delimiterCount: number;
    alignClasses: string[];
    headerRows: number;
    separatorRows: number;
    isTableElement: boolean;
    hasEditor: boolean;
    hasFocusable: boolean;
}

async function grid(): Promise<Grid> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const empty: Grid = {
            mounted: -1,
            rowCount: -1,
            rowTexts: [],
            cellCount: -1,
            delimiterCount: -1,
            alignClasses: [],
            headerRows: -1,
            separatorRows: -1,
            isTableElement: false,
            hasEditor: false,
            hasFocusable: false,
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
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return { ...empty, error: 'no MarkdownView' };

        const surface = view.containerEl.querySelector<HTMLElement>(
            '.vim-motions-table-surface',
        );
        if (!surface) return { ...empty, error: 'no surface' };

        const rows = Array.from(
            surface.querySelectorAll<HTMLElement>(
                '.vim-motions-table-surface-row',
            ),
        );
        const headerRow = rows.find((r) => r.classList.contains('is-header'));

        return {
            mounted: plugin.getNestedTableStats().mounted,
            rowCount: rows.length,
            rowTexts: rows.map((r) => r.textContent ?? ''),
            cellCount: surface.querySelectorAll('.vim-motions-table-cell')
                .length,
            delimiterCount: surface.querySelectorAll('.vim-motions-table-delim')
                .length,
            alignClasses: Array.from(
                headerRow?.querySelectorAll<HTMLElement>(
                    '.vim-motions-table-cell',
                ) ?? [],
            ).map((c) =>
                Array.from(c.classList)
                    .filter((n) => n.startsWith('is-align-'))
                    .join(' '),
            ),
            headerRows: rows.filter((r) => r.classList.contains('is-header'))
                .length,
            separatorRows: rows.filter((r) =>
                r.classList.contains('is-separator'),
            ).length,
            // Must stay a passive renderer.
            isTableElement: surface.querySelector('table') !== null,
            hasEditor: surface.querySelector('.cm-editor') !== null,
            hasFocusable:
                surface.querySelector('[tabindex], input, textarea, button') !==
                null,
        };
    })) as Grid;
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
    await browser.pause(900);
}

describe('Passive table grid (Plan E1.6)', function () {
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
        await parkOutsideTable();
    });

    it('renders every row with text identical to its source line', async () => {
        const g = await grid();
        expect(g.error).toBeUndefined();
        expect(g.mounted).toBe(0);
        expect(g.rowCount).toBe(4);
        // The invariant. Not a substring check: an inserted spacer or a hidden
        // pad character would still satisfy `toContain`.
        expect(g.rowTexts).toStrictEqual(SOURCE_ROWS);
        expect(await getEditorValue()).toBe(TABLE_DOC);
    });

    it('marks cells and delimiters with the same classes as the editor', async () => {
        const g = await grid();
        // Three columns on header plus two data rows; separator carries
        // delimiters only, matching the nested editor's decorations.
        expect(g.cellCount).toBe(9);
        expect(g.delimiterCount).toBe(16);
        expect(g.headerRows).toBe(1);
        expect(g.separatorRows).toBe(1);
    });

    it('carries each column alignment from the separator row', async () => {
        const g = await grid();
        expect(g.alignClasses).toStrictEqual([
            'is-align-left',
            'is-align-right',
            'is-align-center',
        ]);
    });

    it('stays passive: no table element, no editor, nothing focusable', async () => {
        const g = await grid();
        // Deliberately not a <table>. Real table cells would let CSS align
        // text properly and would therefore move glyphs, reintroducing the
        // geometry jump on entry that E1.2 exists to prevent.
        expect(g.isTableElement).toBe(false);
        expect(g.hasEditor).toBe(false);
        expect(g.hasFocusable).toBe(false);
    });

    it('renders a malformed table without dropping a character', async () => {
        const malformed = [
            'Line above',
            '',
            '| a | b |',
            '|---|---|',
            '| c |',
            '| d | e | f | g |',
            '',
            'Line below',
        ].join('\n');
        await setupEditor(malformed, { line: 0, ch: 0 });
        await browser.pause(800);
        await parkOutsideTable();

        const g = await grid();
        expect(g.error).toBeUndefined();
        // Overflow cells are excluded from layout, never from the rendering:
        // the row's text still matches the source exactly.
        expect(g.rowTexts).toStrictEqual([
            '| a | b |',
            '|---|---|',
            '| c |',
            '| d | e | f | g |',
        ]);
        expect(await getEditorValue()).toBe(malformed);
    });
});
