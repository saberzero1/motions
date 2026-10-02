import { browser, expect } from '@wdio/globals';
import {
    ensureLivePreview,
    getEditorValue,
    loadSingleFileWorkspace,
    setPluginSettingAndReload,
    setupEditor,
} from '../helpers';

/**
 * Plan E1.4: cell and delimiter decorations in the nested table editor.
 *
 * Geometry is measured, never screenshotted. The two alignment assertions a
 * reader might expect — `getComputedStyle(cell).textAlign` — are deliberately
 * **absent**: `text-align` is a no-op on an inline span, so asserting the
 * property would pass while nothing moved. The alignment *class* is asserted
 * instead, because that is what the code actually produces and what the
 * passive grid consumes; `TableLayout.alignments` is unit-tested against the
 * separator row directly.
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

interface Deco {
    error?: string;
    mounted: number;
    cellCount: number;
    delimiterCount: number;
    cellTexts: string[];
    alignClasses: string[];
    /** Per column, the x of each row's cell span. */
    columnLefts: number[][];
    /** Per delimiter index, the x on each row. */
    delimiterLefts: number[][];
    usesWidgetClass: boolean;
}

async function decorations(): Promise<Deco> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const empty: Deco = {
            mounted: -1,
            cellCount: -1,
            delimiterCount: -1,
            cellTexts: [],
            alignClasses: [],
            columnLefts: [],
            delimiterLefts: [],
            usesWidgetClass: false,
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

        const nested = view.containerEl.querySelector<HTMLElement>(
            '.vim-motions-table-nested',
        );
        if (!nested) return { ...empty, error: 'no nested editor' };

        const lines = Array.from(
            nested.querySelectorAll<HTMLElement>('.cm-line'),
        );
        const cells = Array.from(
            nested.querySelectorAll<HTMLElement>('.vim-motions-table-cell'),
        );
        const delims = Array.from(
            nested.querySelectorAll<HTMLElement>('.vim-motions-table-delim'),
        );

        const x = (el: HTMLElement): number =>
            Math.round(el.getBoundingClientRect().left * 100) / 100;

        // Grouped per line, so "this column lines up across rows" is a real
        // comparison rather than a flat list that could be any order.
        const perLineCells = lines.map((line) =>
            Array.from(
                line.querySelectorAll<HTMLElement>('.vim-motions-table-cell'),
            ),
        );
        const perLineDelims = lines.map((line) =>
            Array.from(
                line.querySelectorAll<HTMLElement>('.vim-motions-table-delim'),
            ),
        );

        const rowsWithCells = perLineCells.filter((c) => c.length > 0);
        const columnCount = Math.max(0, ...rowsWithCells.map((c) => c.length));
        const columnLefts: number[][] = [];
        for (let col = 0; col < columnCount; col++) {
            columnLefts.push(
                rowsWithCells
                    .map((row) => row[col])
                    .filter((el): el is HTMLElement => el !== undefined)
                    .map(x),
            );
        }

        const delimCount = Math.max(0, ...perLineDelims.map((d) => d.length));
        const delimiterLefts: number[][] = [];
        for (let i = 0; i < delimCount; i++) {
            delimiterLefts.push(
                perLineDelims
                    .map((row) => row[i])
                    .filter((el): el is HTMLElement => el !== undefined)
                    .map(x),
            );
        }

        return {
            mounted: plugin.getNestedTableStats().mounted,
            cellCount: cells.length,
            delimiterCount: delims.length,
            cellTexts: cells.map((c) => c.textContent ?? ''),
            alignClasses: (rowsWithCells[0] ?? []).map((c) =>
                Array.from(c.classList)
                    .filter((n) => n.startsWith('is-align-'))
                    .join(' '),
            ),
            columnLefts,
            delimiterLefts,
            // The one class that must never appear here: it is
            // surface-gate.ts's TABLE_CELL_SELECTOR.
            usesWidgetClass:
                nested.classList.contains('cm-table-widget') ||
                nested.querySelector('.cm-table-widget') !== null,
        };
    })) as Deco;
}

async function enterTable(line = 5): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }, target: number) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        const cm = (view?.editor as unknown as { cm?: unknown })?.cm as
            | {
                  state: { doc: { line: (n: number) => { from: number } } };
                  dispatch: (s: unknown) => void;
              }
            | undefined;
        if (!cm) throw new Error('no EditorView');
        cm.dispatch({
            selection: { anchor: cm.state.doc.line(target).from + 2 },
        });
    }, line);
    await browser.pause(900);
}

describe('Owned table cell decorations (Plan E1.4)', function () {
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

    it('marks every cell and every delimiter', async () => {
        await enterTable();
        const d = await decorations();
        expect(d.error).toBeUndefined();
        expect(d.mounted).toBe(1);

        // Three columns on the header and two data rows; the separator row is
        // deliberately not decorated as cells.
        expect(d.cellCount).toBe(9);
        // Four delimiters on each of four rows, separator included.
        expect(d.delimiterCount).toBe(16);
        // Content, not just count: a mark on the wrong range still counts 9.
        expect(d.cellTexts.slice(0, 3)).toStrictEqual([
            ' h1   ',
            ' h2   ',
            ' h3   ',
        ]);
        expect(d.cellTexts).toContain(' aa   ');
        expect(d.cellTexts).toContain(' yy   ');
        expect(await getEditorValue()).toBe(TABLE_DOC);
    });

    it('takes each column alignment from the separator row', async () => {
        await enterTable();
        const d = await decorations();
        // `|:-----|-----:|:----:|` — left, right, centre, read straight out of
        // the markdown. The class is asserted rather than `text-align`, which
        // does nothing on an inline span and would pass either way.
        expect(d.alignClasses).toStrictEqual([
            'is-align-left',
            'is-align-right',
            'is-align-center',
        ]);
    });

    it('lines every column up across rows', async () => {
        await enterTable();
        const d = await decorations();
        expect(d.columnLefts.length).toBe(3);
        for (const lefts of d.columnLefts) {
            expect(lefts.length).toBe(3);
            const spread = Math.max(...lefts) - Math.min(...lefts);
            expect(spread).toBeLessThan(1);
        }
        // And the columns are in increasing x order, so this is a grid rather
        // than three columns stacked at the same place.
        const firsts = d.columnLefts.map((l) => l[0]!);
        expect(firsts[1]).toBeGreaterThan(firsts[0]!);
        expect(firsts[2]).toBeGreaterThan(firsts[1]!);
    });

    it('lines every delimiter up across rows', async () => {
        await enterTable();
        const d = await decorations();
        expect(d.delimiterLefts.length).toBe(4);
        for (const lefts of d.delimiterLefts) {
            // All four rows, separator included.
            expect(lefts.length).toBe(4);
            const spread = Math.max(...lefts) - Math.min(...lefts);
            expect(spread).toBeLessThan(1);
        }
    });

    it('never reuses the cm-table-widget class', async () => {
        await enterTable();
        const d = await decorations();
        // That selector IS surface-gate.ts's TABLE_CELL_SELECTOR: reusing it
        // would make the treesitter bridge withhold its parser from this
        // surface and make the cursorline rule hide its cursorline.
        expect(d.usesWidgetClass).toBe(false);
    });

    it('decorates a malformed table without throwing', async () => {
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
        await enterTable();

        const d = await decorations();
        expect(d.error).toBeUndefined();
        expect(d.mounted).toBe(1);
        // Two header cells, one on the short row, two of the four on the long
        // one — the excess is excluded from layout, never from the document.
        expect(d.cellCount).toBe(5);
        expect(await getEditorValue()).toBe(malformed);
    });
});
