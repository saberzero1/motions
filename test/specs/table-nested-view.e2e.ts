import { browser, expect } from '@wdio/globals';
import {
    ensureLivePreview,
    getEditorValue,
    loadSingleFileWorkspace,
    setPluginSettingAndReload,
    setupEditor,
} from '../helpers';

/**
 * Plan B Step 3b: the nested editor's lifecycle, mounted but not yet wired.
 *
 * Every assertion about the nested editor is paired with one about the parent.
 * A nested editor that failed to mount reads zero gutters and zero cursor
 * layers, which is indistinguishable from a correctly minimal one — the same
 * shape that let two surface-gate attempts report success while installing
 * nothing anywhere.
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

interface Stats {
    mounts: number;
    unmounts: number;
    cleanups: number;
    mounted: number;
    gutters: number;
    cursorLayers: number;
    doc: string | null;
    connected: boolean;
}

interface Report {
    error?: string;
    nested: Stats;
    parentHead: number;
    parentGutters: number;
    parentCursorLayers: number;
    hostElements: number;
    rowsHidden: boolean;
    rowsInContainer: number;
    strayRows: number;
    tableCellActive: boolean;
}

interface NestedPlugin {
    getNestedTableStats(): Stats;
    getTableSurfaceRedrawCount(): number;
}

async function readReport(): Promise<Report> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        // Declared inside the callback: `executeObsidian` serialises the
        // function, so nothing from the enclosing module scope exists here.
        const empty = {
            nested: {
                mounts: -1,
                unmounts: -1,
                cleanups: -1,
                mounted: -1,
                gutters: -1,
                cursorLayers: -1,
                doc: null,
                connected: false,
            } as Stats,
            parentHead: -1,
            parentGutters: -1,
            parentCursorLayers: -1,
            hostElements: -1,
            rowsHidden: false,
            rowsInContainer: -1,
            strayRows: -1,
            tableCellActive: false,
        };
        const plugin = (
            app as unknown as {
                plugins: { plugins: Record<string, NestedPlugin> };
            }
        ).plugins.plugins['vim-motions'];
        if (!plugin) return { ...empty, error: 'no plugin' };

        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return { ...empty, error: 'no MarkdownView' };
        const cm = (view.editor as unknown as { cm?: unknown }).cm as
            | {
                  dom: HTMLElement;
                  state: { selection: { main: { head: number } } };
              }
            | undefined;
        if (!cm) return { ...empty, error: 'no EditorView' };

        // Count only the PARENT's own layers: the nested editor lives inside
        // the parent's DOM, so an unfiltered count would conflate the two.
        const outside = (selector: string) =>
            Array.from(cm.dom.querySelectorAll(selector)).filter(
                (el) => el.closest('.vim-motions-table-surface') === null,
            ).length;

        const rows = cm.dom.querySelector<HTMLElement>(
            '.vim-motions-table-surface-mounted .vim-motions-table-surface-rows',
        );

        return {
            nested: plugin.getNestedTableStats(),
            parentHead: cm.state.selection.main.head,
            parentGutters: outside('.cm-gutters'),
            parentCursorLayers: outside('.cm-vimCursorLayer'),
            hostElements: cm.dom.querySelectorAll(
                '.vim-motions-table-surface-host',
            ).length,
            rowsHidden:
                rows !== null && getComputedStyle(rows).display === 'none',
            rowsInContainer: cm.dom.querySelectorAll(
                '.vim-motions-table-surface-rows > .vim-motions-table-surface-row',
            ).length,
            // A hidden but EMPTY rows container with the real rows rendered as
            // its siblings satisfies `rowsHidden` while showing a duplicate
            // table. That shipped, briefly, and this is what caught it.
            strayRows: Array.from(
                cm.dom.querySelectorAll('.vim-motions-table-surface-row'),
            ).filter(
                (el) => el.closest('.vim-motions-table-surface-rows') === null,
            ).length,
            tableCellActive:
                (view as unknown as { editMode?: { tableCell?: unknown } })
                    .editMode?.tableCell != null,
        };
    })) as Report;
}

/** Park the parent's cursor on the table's `aa` row. */
async function selectInsideTable(): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        const cm = (view?.editor as unknown as { cm?: unknown })?.cm as
            | {
                  state: { doc: { line: (n: number) => { from: number } } };
                  dispatch: (spec: unknown) => void;
              }
            | undefined;
        if (!cm) throw new Error('no EditorView');
        cm.dispatch({ selection: { anchor: cm.state.doc.line(5).from + 2 } });
    });
    await browser.pause(600);
}

async function selectOutsideTable(): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        const cm = (view?.editor as unknown as { cm?: unknown })?.cm as
            { dispatch: (spec: unknown) => void } | undefined;
        if (!cm) throw new Error('no EditorView');
        cm.dispatch({ selection: { anchor: 0 } });
    });
    await browser.pause(600);
}

async function redrawCount(): Promise<number> {
    return (await browser.executeObsidian(({ app }) => {
        const plugin = (
            app as unknown as {
                plugins: { plugins: Record<string, NestedPlugin> };
            }
        ).plugins.plugins['vim-motions'];
        return plugin?.getTableSurfaceRedrawCount() ?? -1;
    })) as number;
}

async function enterOwnedTableDoc(): Promise<void> {
    await setPluginSettingAndReload('tableWidgetMode', 'owned');
    await ensureLivePreview();
    await setupEditor(TABLE_DOC, { line: 0, ch: 0 });
    await browser.pause(800);
}

describe('Nested table editor lifecycle (Plan B Step 3b)', function () {
    this.timeout(240000);

    before(async () => {
        await loadSingleFileWorkspace();
    });

    after(async () => {
        await setPluginSettingAndReload('tableWidgetMode', 'native');
    });

    it('control: nothing mounts while the native table editor owns tables', async () => {
        await setPluginSettingAndReload('tableWidgetMode', 'native');
        await ensureLivePreview();
        await setupEditor(TABLE_DOC, { line: 0, ch: 0 });
        await browser.pause(800);
        await selectInsideTable();

        const report = await readReport();

        expect(report.error).toBeUndefined();
        expect(report.nested.mounted).toBe(0);
        expect(report.hostElements).toBe(0);
    });

    it('mounts one nested editor holding the table source', async () => {
        await enterOwnedTableDoc();
        await selectInsideTable();

        const report = await readReport();

        expect(report.error).toBeUndefined();
        expect(report.nested.mounted).toBe(1);
        expect(report.hostElements).toBe(1);
        expect(report.nested.connected).toBe(true);
        expect(report.strayRows).toBe(0);
        expect(report.rowsInContainer).toBe(3);
        // Content, not just presence.
        expect(report.nested.doc).toBe(
            ['| Name | Value |', '|------|-------|', '| aa   | 11    |'].join(
                '\n',
            ),
        );
        expect(report.rowsHidden).toBe(true);
    });

    it('carries none of the parent per-view subsystems', async () => {
        await enterOwnedTableDoc();
        await selectInsideTable();

        const report = await readReport();

        expect(report.nested.mounted).toBe(1);
        expect(report.nested.gutters).toBe(0);
        expect(report.nested.cursorLayers).toBe(0);
        // The parent control: without these, a nested editor that never
        // mounted satisfies the two assertions above.
        expect(report.parentGutters).toBeGreaterThan(0);
        expect(report.parentCursorLayers).toBeGreaterThan(0);
    });

    it('survives edits to its own table without being rebuilt', async () => {
        await enterOwnedTableDoc();
        await selectInsideTable();
        expect((await readReport()).nested.mounted).toBe(1);

        const beforeRedraws = await redrawCount();
        const beforeMounts = (await readReport()).nested.mounts;

        await browser.executeObsidian(({ app, obsidian }) => {
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
            // The HEADER row, not the cursor's own cell: Obsidian's native
            // cell editor stays active in owned mode and owns the range of
            // the cell being edited, silently dropping writes to it. Measured
            // and asserted by the scenario below.
            for (let i = 0; i < 10; i++) {
                cm.dispatch({
                    changes: {
                        from: cm.state.doc.line(3).from + 2,
                        insert: 'x',
                    },
                });
            }
        });
        await browser.pause(800);

        const report = await readReport();
        const doc = await getEditorValue();

        // The edits must have landed, or a zero delta proves nothing.
        expect(doc).toContain('xxxxxxxxxx');
        expect(report.nested.mounted).toBe(1);
        // In the document, not merely in memory: every other field here
        // survives the editor being torn out of the DOM, and a negative
        // control that detached the host passed on all of them.
        expect(report.nested.connected).toBe(true);
        expect(report.hostElements).toBe(1);
        expect(report.rowsHidden).toBe(true);
        expect(report.strayRows).toBe(0);
        expect(report.rowsInContainer).toBe(3);
        // Rebuilding the widget would destroy the nested editor's DOM, and
        // remounting instead of re-seeding would lose focus and composition.
        expect((await redrawCount()) - beforeRedraws).toBe(0);
        expect(report.nested.mounts).toBe(beforeMounts);
        // Re-seeded, not stale.
        expect(report.nested.doc).toContain('xxxxxxxxxx');
    });

    it("Obsidian's cell editor stays active in owned mode and owns its own cell's range", async () => {
        // Characterisation, not a wish. Owning the *renderer* does not take
        // over the *editor*: parking the cursor in a table still opens
        // Obsidian's TableCellEditor, and writes to the cell it holds are
        // dropped. Steps 4 and 5 forward insert-mode text to the parent
        // document, so this is the constraint they have to answer.
        await enterOwnedTableDoc();
        await selectInsideTable();
        expect((await readReport()).tableCellActive).toBe(true);

        const outcome = (await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            const cm = (view?.editor as unknown as { cm?: unknown })?.cm as
                | {
                      state: {
                          doc: {
                              line: (n: number) => { from: number };
                              toString(): string;
                          };
                      };
                      dispatch: (spec: unknown) => void;
                  }
                | undefined;
            if (!cm) throw new Error('no EditorView');
            const write = (line: number) => {
                const before = cm.state.doc.toString();
                cm.dispatch({
                    changes: {
                        from: cm.state.doc.line(line).from + 2,
                        insert: 'X',
                    },
                });
                return cm.state.doc.toString() !== before;
            };
            return { ownCell: write(5), headerRow: write(3) };
        })) as { ownCell: boolean; headerRow: boolean };

        expect(outcome.ownCell).toBe(false);
        // The control: dispatching is not broken in general, and the block is
        // scoped to one cell rather than the whole table range.
        expect(outcome.headerRow).toBe(true);
    });

    it('unmounts and runs every disposer when the cursor leaves the table', async () => {
        await enterOwnedTableDoc();
        await selectInsideTable();
        const mounted = await readReport();
        expect(mounted.nested.mounted).toBe(1);

        await selectOutsideTable();
        const report = await readReport();

        expect(report.nested.mounted).toBe(0);
        expect(report.nested.unmounts).toBeGreaterThan(mounted.nested.unmounts);
        // Three disposers per mount: destroy the view, clear the mounted
        // class, remove the host element. A silent early return in the
        // disposer loop would leave this short.
        expect(report.nested.cleanups).toBe(report.nested.unmounts * 3);
        // The host element is removed, not merely emptied.
        expect(report.hostElements).toBe(0);
    });
});
