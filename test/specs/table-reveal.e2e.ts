import { browser, expect } from '@wdio/globals';
import {
    ensureLivePreview,
    ensureSourceMode,
    getCursorPos,
    getEditorValue,
    getVimMode,
    handleEx,
    loadSingleFileWorkspace,
    setPluginSettingAndReload,
    setupEditor,
    vimKeys,
} from '../helpers';

/**
 * `tableWidgetMode: reveal` — Obsidian renders idle tables, and the table
 * holding the caret becomes ordinary editor lines edited by the parent's vim.
 *
 * Every scenario asserts on Obsidian's widget **and** on the editor lines,
 * because each alone is satisfiable by a broken surface: a table hidden by
 * CSS has no widget and no lines, and a table revealed under a live cell
 * editor has lines while keys go nowhere. `tableCell` and `parentFocused`
 * are read alongside for the same reason — the failure the spike kept
 * reproducing was Obsidian's cell editor taking the caret, which looks like a
 * revealed table that ignores the keyboard.
 */

const DOC = [
    'Line above',
    '',
    '| Name | Value |',
    '|------|-------|',
    '| aa   | 11    |',
    '| bb   | 22    |',
    '',
    'Below the table here',
].join('\n');

const TWO_TABLES = [
    'Top',
    '',
    '| a | b |',
    '|---|---|',
    '| 1 | 2 |',
    '',
    'Middle',
    '',
    '| c | d |',
    '|---|---|',
    '| 3 | 4 |',
    '',
    'End',
].join('\n');

interface RevealReport {
    channel: boolean;
    failed: boolean;
    retired: number;
    tables: { from: number; to: number }[];
    highlights: { from: number; to: number }[];
    rowLines: number;
}

interface RevealPlugin {
    getTableRevealReport(): RevealReport;
}

interface Probe {
    error?: string;
    widgets: number;
    widgetCells: number;
    pipeLines: number;
    tableCell: boolean;
    parentFocused: boolean;
    suppressed: boolean | null;
    report: RevealReport | null;
}

async function probe(): Promise<Probe> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const empty: Probe = {
            widgets: -1,
            widgetCells: -1,
            pipeLines: -1,
            tableCell: false,
            parentFocused: false,
            suppressed: null,
            report: null,
        };
        const plugin = (
            app as unknown as {
                plugins: { plugins: Record<string, RevealPlugin> };
            }
        ).plugins.plugins['vim-motions'];
        if (!plugin) return { ...empty, error: 'no plugin' };
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return { ...empty, error: 'no MarkdownView' };
        const cm = (view.editor as unknown as { cm?: unknown }).cm as
            | {
                  dom: HTMLElement;
                  contentDOM: HTMLElement;
                  hasFocus: boolean;
              }
            | undefined;
        if (!cm) return { ...empty, error: 'no EditorView' };
        const lines = Array.from(
            cm.contentDOM.querySelectorAll('.cm-line'),
        ) as HTMLElement[];
        const cma = (
            window as unknown as {
                CodeMirrorAdapter?: {
                    isCursorSuppressedForView?: (v: unknown) => boolean;
                };
            }
        ).CodeMirrorAdapter;
        return {
            widgets: cm.dom.querySelectorAll('.cm-table-widget').length,
            widgetCells: cm.dom.querySelectorAll(
                '.cm-table-widget td, .cm-table-widget th',
            ).length,
            pipeLines: lines.filter((l) => (l.textContent ?? '').includes('|'))
                .length,
            tableCell: !!(
                view as unknown as { editMode?: { tableCell?: unknown } }
            ).editMode?.tableCell,
            parentFocused: cm.hasFocus,
            suppressed: cma?.isCursorSuppressedForView
                ? cma.isCursorSuppressedForView(cm)
                : null,
            report: plugin.getTableRevealReport(),
        };
    })) as Probe;
}

/** Plain keys with a settle, without the leading Escape `vimKeys` sends. */
async function keys(...k: string[]): Promise<void> {
    for (const key of k) {
        await browser.keys([key]);
        await browser.pause(80);
    }
    await browser.pause(350);
}

describe('Table reveal surface (tableWidgetMode: reveal)', function () {
    before(async function () {
        await loadSingleFileWorkspace();
        await ensureLivePreview();
        await setPluginSettingAndReload('tableWidgetMode', 'reveal');
    });

    beforeEach(async function () {
        await loadSingleFileWorkspace();
        await ensureLivePreview();
        await browser.pause(200);
    });

    after(async function () {
        await setPluginSettingAndReload('tableWidgetMode', 'native');
    });

    it('leaves an idle table to Obsidian and captures the channel', async function () {
        await setupEditor(DOC, { line: 0, ch: 0 });
        await browser.pause(400);
        const p = await probe();
        expect(p.error).toBeUndefined();
        expect(p.report?.channel).toBe(true);
        expect(p.report?.failed).toBe(false);
        expect(p.widgets).toBe(1);
        expect(p.widgetCells).toBe(6);
        expect(p.pipeLines).toBe(0);
        expect(p.report?.rowLines).toBe(0);
    });

    it('reveals the table on the keystroke that enters it, with no jump and no cell editor', async function () {
        await setupEditor(DOC, { line: 0, ch: 0 });
        await browser.pause(400);
        const before = await probe();

        await vimKeys('j', 'j');
        const header = await probe();
        const headerPos = await getCursorPos();
        await keys('j');
        await browser.pause(300);
        const separator = await probe();
        const separatorPos = await getCursorPos();

        expect(header.widgets).toBe(0);
        expect(header.pipeLines).toBe(4);
        expect(header.report?.rowLines).toBe(4);
        expect(header.tableCell).toBe(false);
        expect(header.parentFocused).toBe(true);
        expect(header.suppressed).toBe(false);
        expect(headerPos).toEqual({ line: 2, ch: 0 });
        // The delimiter row is where Obsidian's widget schedules its
        // `placeCursorInCell` jump; the caret must stay on it.
        expect(separatorPos).toEqual({ line: 3, ch: 0 });
        expect(separator.tableCell).toBe(false);
        expect(
            (header.report?.retired ?? 0) - (before.report?.retired ?? 0),
        ).toBe(1);
    });

    it('edits the revealed table with the parent vim: operators, undo, dot-repeat, visual', async function () {
        await setupEditor(DOC, { line: 0, ch: 0 });
        await browser.pause(400);
        await vimKeys('j', 'j', 'j', 'j');
        expect(await getCursorPos()).toEqual({ line: 4, ch: 0 });

        await keys('x');
        const afterX = await getEditorValue();
        await keys('u');
        const afterU = await getEditorValue();
        await keys('d', 'd');
        const afterDD = await getEditorValue();
        await keys('u');
        await keys('0', 'w', 'i', 'Q', 'Escape');
        const afterInsert = await getEditorValue();
        await keys('j', '0', 'w', '.');
        const afterDot = await getEditorValue();
        await keys('V', 'k');
        const mode = await getVimMode();
        const inVisual = await probe();
        await keys('Escape', 'u', 'u');
        const afterUndo = await getEditorValue();

        expect(afterX.split('\n')[4]).toBe(' aa   | 11    |');
        expect(afterU).toBe(DOC);
        expect(afterDD.split('\n')).toEqual([
            'Line above',
            '',
            '| Name | Value |',
            '|------|-------|',
            '| bb   | 22    |',
            '',
            'Below the table here',
        ]);
        expect(afterInsert.split('\n')[4]).toBe('| Qaa   | 11    |');
        expect(afterDot.split('\n')[5]).toBe('| Qbb   | 22    |');
        expect(mode).toContain('visual');
        expect(inVisual.widgets).toBe(0);
        expect(inVisual.tableCell).toBe(false);
        expect(afterUndo).toBe(DOC);
    });

    it('applies visual block across rows, which a per-cell editor cannot', async function () {
        await setupEditor(DOC, { line: 4, ch: 2 });
        await browser.pause(300);
        await vimKeys();
        await browser.keys(['Control', 'v', 'NULL']);
        await browser.pause(150);
        await keys('j', 'l', 'd');
        const value = await getEditorValue();
        expect(value.split('\n')[4]).toBe('|    | 11    |');
        expect(value.split('\n')[5]).toBe('|    | 22    |');
    });

    it('extends a visual selection from above into the table, and deletes across the edge', async function () {
        await setupEditor(DOC, { line: 0, ch: 0 });
        await browser.pause(300);
        await vimKeys('V', 'j', 'j', 'j');
        const p = await probe();
        const mode = await getVimMode();
        await keys('d');
        const value = await getEditorValue();
        await keys('u');
        // The selection's head sits on the delimiter row, so the table must
        // be revealed while visual mode is live — without it, the head lies
        // inside Obsidian's widget and its cell editor takes the keys.
        expect(mode).toContain('visual');
        expect(p.widgets).toBe(0);
        expect(p.tableCell).toBe(false);
        expect(value.split('\n')).toEqual([
            '| aa   | 11    |',
            '| bb   | 22    |',
            '',
            'Below the table here',
        ]);
        expect(await getEditorValue()).toBe(DOC);
    });

    it('reveals the table a search lands in', async function () {
        await setupEditor(DOC, { line: 0, ch: 0 });
        await browser.pause(300);
        await vimKeys('/');
        await browser.keys(['b', 'b']);
        await browser.keys(['Enter']);
        await browser.pause(500);
        const p = await probe();
        expect(await getCursorPos()).toEqual({ line: 5, ch: 2 });
        expect(p.widgets).toBe(0);
        expect(p.tableCell).toBe(false);
        expect(p.parentFocused).toBe(true);
    });

    it('records and replays a macro down the table\u2019s rows', async function () {
        await setupEditor(DOC, { line: 4, ch: 0 });
        await browser.pause(300);
        await vimKeys('q', 'a', '0', 'l', 'l', 'r', 'X', 'j', 'q');
        await keys('@', 'a');
        const lines = (await getEditorValue()).split('\n');
        expect(lines[4]).toBe('| Xa   | 11    |');
        expect(lines[5]).toBe('| Xb   | 22    |');
    });

    it('hands the table back to Obsidian on leaving, and reveals it again on re-entry', async function () {
        await setupEditor(DOC, { line: 0, ch: 0 });
        await browser.pause(400);
        await vimKeys('j', 'j', 'j', 'j', 'j');
        expect((await probe()).widgets).toBe(0);

        await keys('j', 'j');
        const left = await probe();
        const leftPos = await getCursorPos();
        await keys('k', 'k');
        const back = await probe();
        const backPos = await getCursorPos();
        await keys('x');
        const afterX = await getEditorValue();

        expect(leftPos.line).toBe(7);
        expect(left.widgets).toBe(1);
        expect(left.widgetCells).toBe(6);
        expect(left.report?.rowLines).toBe(0);
        expect(left.report?.highlights).toEqual([]);
        expect(backPos.line).toBe(5);
        expect(back.widgets).toBe(0);
        expect(back.tableCell).toBe(false);
        expect(afterX.split('\n')[5]).not.toBe('| bb   | 22    |');
    });

    it('reveals only the table holding the caret, and keeps the caret drawn there', async function () {
        await setupEditor(TWO_TABLES, { line: 0, ch: 0 });
        await browser.pause(400);
        await vimKeys('j', 'j', 'j', 'j');
        const p = await probe();
        expect(await getCursorPos()).toEqual({ line: 4, ch: 0 });
        expect(p.widgets).toBe(1);
        expect(p.report?.tables).toHaveLength(1);
        expect(p.report?.rowLines).toBe(3);
        // The other table's widget is on screen; the cursor guard must not
        // read it as the caret's table.
        expect(p.suppressed).toBe(false);
    });

    it('runs the :table commands on a revealed table while another keeps its widget', async function () {
        await setupEditor(TWO_TABLES, { line: 4, ch: 2 });
        await browser.pause(400);
        const result = await handleEx('tablerowafter');
        await browser.pause(300);
        expect(result.unknownCommand).toBe(false);
        const lines = (await getEditorValue()).split('\n');
        // Structural edits realign, so the padding is the formatter's; what
        // this asserts is that a row was added below the caret's row in the
        // revealed table and the other table was left alone.
        expect(lines).toHaveLength(14);
        expect(lines[4]).toMatch(/^\|\s*1\s*\|\s*2\s*\|$/);
        expect(lines[5]).toMatch(/^\|\s+\|\s+\|$/);
        expect(lines.slice(9, 12)).toEqual([
            '| c | d |',
            '|---|---|',
            '| 3 | 4 |',
        ]);
        expect((await probe()).widgets).toBe(1);
    });

    it('keeps a row revealed after its leading pipe is deleted', async function () {
        await setupEditor(DOC, { line: 0, ch: 0 });
        await browser.pause(400);
        await vimKeys('j', 'j', 'j', 'j');
        await keys('x');
        const p = await probe();
        await keys('u');
        expect(p.widgets).toBe(0);
        expect(p.tableCell).toBe(false);
        expect(await getEditorValue()).toBe(DOC);
    });

    it('stays revealed when in-file search closes on a match inside the table', async function () {
        await setupEditor(DOC, { line: 0, ch: 0 });
        await browser.pause(400);
        await vimKeys('j', 'j', 'j', 'j');
        await browser.executeObsidian(({ app }) => {
            (
                app as unknown as {
                    commands: { executeCommandById: (id: string) => boolean };
                }
            ).commands.executeCommandById('editor:open-search');
        });
        await browser.pause(400);
        await browser.keys(['b', 'b']);
        await browser.pause(400);
        await browser.keys(['Escape']);
        await browser.pause(500);
        const closed = await probe();
        const pos = await getCursorPos();
        expect(pos.line).toBe(5);
        expect(closed.widgets).toBe(0);
        expect(closed.report?.rowLines).toBe(4);
    });

    it('does not jump the cursor while a new table is typed (#121)', async function () {
        await setupEditor('Intro\n\n\nOutro', { line: 1, ch: 0 });
        await browser.pause(300);
        await vimKeys('o');
        for (const ch of '| a | b |') await browser.keys([ch]);
        await browser.keys(['Enter']);
        for (const ch of '|---|---|') await browser.keys([ch]);
        await browser.pause(300);
        const sepPos = await getCursorPos();
        await browser.keys(['Enter']);
        for (const ch of '| 1 | 2 |') await browser.keys([ch]);
        await browser.pause(300);
        const rowPos = await getCursorPos();
        const typing = await probe();
        await keys('Escape', 'k', 'k');
        const headerPos = await getCursorPos();
        await keys('G');
        const left = await probe();

        expect(await getEditorValue()).toBe(
            'Intro\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\nOutro',
        );
        expect(sepPos).toEqual({ line: 3, ch: 9 });
        expect(rowPos).toEqual({ line: 4, ch: 9 });
        expect(headerPos.line).toBe(2);
        expect(typing.widgets).toBe(0);
        expect(typing.tableCell).toBe(false);
        expect(left.widgets).toBe(1);
    });

    it('places the caret in the clicked cell of an idle table, without a cell editor', async function () {
        await setupEditor(DOC, { line: 7, ch: 0 });
        await browser.pause(400);
        const cell = browser.$('.cm-table-widget tbody tr:nth-child(2) td');
        await cell.click();
        await browser.pause(400);
        const p = await probe();
        const pos = await getCursorPos();
        expect(pos.line).toBe(5);
        expect(pos.ch).toBeGreaterThanOrEqual(2);
        expect(pos.ch).toBeLessThanOrEqual(4);
        expect(p.widgets).toBe(0);
        expect(p.tableCell).toBe(false);
        expect(p.parentFocused).toBe(true);
        await keys('Escape', '0', 'x');
        expect((await getEditorValue()).split('\n')[5]).toBe(' bb   | 22    |');
    });

    it('styles revealed rows as an aligned grid and shows inline markup as source', async function () {
        const marked = DOC.replace('| aa   |', '| **b** |').replace(
            '| bb   |',
            '| [[x]] |',
        );
        await setupEditor(marked, { line: 0, ch: 0 });
        await browser.pause(300);
        await vimKeys('j', 'j', 'j', 'j');
        await keys('l', 'l');
        const grid = (await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            const cm = (
                view?.editor as unknown as { cm?: { contentDOM: HTMLElement } }
            )?.cm;
            if (!cm) return null;
            const rows = Array.from(
                cm.contentDOM.querySelectorAll('.vim-motions-reveal-row'),
            ) as HTMLElement[];
            const plain = Array.from(
                cm.contentDOM.querySelectorAll('.cm-line'),
            ).find((l) => l.textContent === 'Line above') as
                HTMLElement | undefined;
            return {
                kinds: rows.map((r) =>
                    ['is-header', 'is-separator', 'is-data'].find((k) =>
                        r.classList.contains(k),
                    ),
                ),
                texts: rows.map((r) => r.textContent),
                rowFont: rows[0] ? getComputedStyle(rows[0]).fontFamily : '',
                plainFont: plain ? getComputedStyle(plain).fontFamily : '',
                // A mark is split into fragments around nested syntax spans,
                // so the active cell is read as the text its fragments spell.
                activeText: Array.from(
                    cm.contentDOM.querySelectorAll('.is-active-cell'),
                )
                    .map((el) => el.textContent ?? '')
                    .join(''),
            };
        })) as {
            kinds: string[];
            texts: string[];
            rowFont: string;
            plainFont: string;
            activeText: string;
        } | null;
        expect(grid).not.toBeNull();
        expect(grid!.kinds).toEqual([
            'is-header',
            'is-separator',
            'is-data',
            'is-data',
        ]);
        expect(grid!.texts[2]).toBe('| **b** | 11    |');
        expect(grid!.texts[3]).toBe('| [[x]] | 22    |');
        expect(grid!.rowFont).not.toBe(grid!.plainFont);
        expect(grid!.activeText).toBe(' **b** ');
    });

    it('draws nothing for the reveal highlight, while a real search match keeps its ring', async function () {
        await setupEditor(DOC, { line: 0, ch: 0 });
        await browser.pause(300);
        await vimKeys('j', 'j', 'j', 'j');
        const rings = async () =>
            (await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                const cm = (
                    view?.editor as unknown as {
                        cm?: { contentDOM: HTMLElement };
                    }
                )?.cm;
                if (!cm) return null;
                const sel =
                    '.vim-motions-revealed-line span.obsidian-search-match-highlight';
                const all = Array.from(
                    cm.contentDOM.querySelectorAll(sel),
                ) as HTMLElement[];
                const nested = all.filter((el) =>
                    el.parentElement?.closest(
                        'span.obsidian-search-match-highlight',
                    ),
                );
                const outer = all.filter((el) => !nested.includes(el));
                return {
                    outer: outer.length,
                    outerShadows: [
                        ...new Set(
                            outer.map((el) => getComputedStyle(el).boxShadow),
                        ),
                    ],
                    nested: nested.length,
                    nestedShadows: [
                        ...new Set(
                            nested.map((el) => getComputedStyle(el).boxShadow),
                        ),
                    ],
                };
            })) as {
                outer: number;
                outerShadows: string[];
                nested: number;
                nestedShadows: string[];
            } | null;

        const idle = await rings();
        await browser.executeObsidian(({ app }) => {
            (
                app as unknown as {
                    commands: { executeCommandById: (id: string) => boolean };
                }
            ).commands.executeCommandById('editor:open-search');
        });
        await browser.pause(400);
        await browser.keys(['1', '1']);
        await browser.pause(500);
        const searching = await rings();
        await browser.keys(['Escape']);
        await browser.pause(300);

        expect(idle).not.toBeNull();
        expect(idle!.outer).toBe(4);
        expect(idle!.outerShadows).toEqual(['none']);
        expect(idle!.nested).toBe(0);
        expect(searching!.nested).toBeGreaterThanOrEqual(1);
        expect(searching!.nestedShadows).not.toContain('none');
    });

    it('survives a Live Preview to Source round trip with the caret inside', async function () {
        await setupEditor(DOC, { line: 0, ch: 0 });
        await browser.pause(300);
        await vimKeys('j', 'j', 'j', 'j');
        await ensureSourceMode();
        await browser.pause(300);
        // Source mode shows plain Markdown: no grid, and the highlight that is
        // kept there for the way back draws no search ring.
        const source = (await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            const cm = (
                view?.editor as unknown as { cm?: { contentDOM: HTMLElement } }
            )?.cm;
            if (!cm) return null;
            const marks = Array.from(
                cm.contentDOM.querySelectorAll(
                    'span.obsidian-search-match-highlight',
                ),
            ) as HTMLElement[];
            return {
                gridRows: cm.contentDOM.querySelectorAll(
                    '.vim-motions-reveal-row',
                ).length,
                marks: marks.length,
                rings: [
                    ...new Set(marks.map((m) => getComputedStyle(m).boxShadow)),
                ],
            };
        })) as { gridRows: number; marks: number; rings: string[] } | null;
        await ensureLivePreview();
        await browser.pause(400);
        const p = await probe();
        expect(source).not.toBeNull();
        expect(source!.gridRows).toBe(0);
        expect(source!.marks).toBe(4);
        expect(source!.rings).toEqual(['none']);
        expect(p.widgets).toBe(0);
        expect(p.tableCell).toBe(false);
        await vimKeys('x');
        expect((await getEditorValue()).split('\n')[4]).toBe(' aa   | 11    |');
    });

    it('hands a revealed table back when the mode is switched away', async function () {
        await setupEditor(DOC, { line: 0, ch: 0 });
        await browser.pause(300);
        await vimKeys('j', 'j', 'j', 'j');
        expect((await probe()).widgets).toBe(0);
        await setPluginSettingAndReload('tableWidgetMode', 'native');
        await browser.pause(400);
        const after = await probe();
        await setPluginSettingAndReload('tableWidgetMode', 'reveal');
        // Obsidian's widget is back and the source lines are gone: the
        // highlights were withdrawn, not merely left behind undecorated.
        expect(after.widgets).toBe(1);
        expect(after.pipeLines).toBe(0);
    });
});
