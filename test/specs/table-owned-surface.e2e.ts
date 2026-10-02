import { browser, expect } from '@wdio/globals';
import {
    ensureLivePreview,
    ensureSourceMode,
    getEditorValue,
    loadSingleFileWorkspace,
    setPluginSettingAndReload,
    setupEditor,
} from '../helpers';

/**
 * Plan B Step 2 acceptance, unblocked by the Step 8 runtime slot.
 *
 * Until now the owned renderer was proven only in unit tests against a bare
 * `EditorState`; its rendering had never been observed in a browser.
 *
 * The render assertion is deliberately three-part, because each part alone is
 * satisfiable while Obsidian still renders the table:
 *   - our root present, but Obsidian's widget also present -> we did not
 *     displace it, we rendered alongside it;
 *   - Obsidian's widget absent, but our root absent too -> nothing renders;
 *   - no `.cm-line` containing a pipe, which holds whenever *either* widget
 *     replaces the source.
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

interface SurfacePlugin {
    getTableSurfaceRedrawCount(): number;
}

interface RenderCounts {
    error?: string;
    ownedRoots: number;
    obsidianWidgets: number;
    linesWithPipe: number;
    ownedRowTexts: string[];
}

async function readRender(): Promise<RenderCounts> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const blank: RenderCounts = {
            ownedRoots: -1,
            obsidianWidgets: -1,
            linesWithPipe: -1,
            ownedRowTexts: [],
        };
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return { ...blank, error: 'no MarkdownView' };
        const cm = (view.editor as unknown as { cm?: unknown }).cm as
            { dom: HTMLElement; contentDOM: HTMLElement } | undefined;
        if (!cm) return { ...blank, error: 'no EditorView' };

        const lineTexts = Array.from(
            cm.contentDOM.querySelectorAll('.cm-line'),
        ).map((l) => l.textContent ?? '');

        return {
            ownedRoots: cm.dom.querySelectorAll('.vim-motions-table-surface')
                .length,
            obsidianWidgets: cm.dom.querySelectorAll('.cm-table-widget').length,
            linesWithPipe: lineTexts.filter((t) => t.includes('|')).length,
            ownedRowTexts: Array.from(
                cm.dom.querySelectorAll(
                    '.vim-motions-table-surface .vim-motions-table-surface-row',
                ),
            ).map((r) => r.textContent ?? ''),
        };
    })) as RenderCounts;
}

async function redrawCount(): Promise<number> {
    return (await browser.executeObsidian(({ app }) => {
        const plugin = (
            app as unknown as {
                plugins: { plugins: Record<string, SurfacePlugin> };
            }
        ).plugins.plugins['vim-motions'];
        return plugin?.getTableSurfaceRedrawCount() ?? -1;
    })) as number;
}

describe('Owned table surface rendering (Plan B)', function () {
    this.timeout(240000);

    before(async () => {
        await loadSingleFileWorkspace();
    });

    after(async () => {
        await setPluginSettingAndReload('tableWidgetMode', 'native');
    });

    it('control: with mode native, Obsidian renders and we do not', async () => {
        await setPluginSettingAndReload('tableWidgetMode', 'native');
        await ensureLivePreview();
        await setupEditor(TABLE_DOC, { line: 0, ch: 0 });
        await browser.pause(800);

        const counts = await readRender();

        expect(counts.error).toBeUndefined();
        // Without this control, the owned-mode assertions below could pass in
        // an editor where no table renders at all for unrelated reasons.
        expect(counts.obsidianWidgets).toBeGreaterThan(0);
        expect(counts.ownedRoots).toBe(0);
    });

    it('displaces Obsidian entirely and renders the table source', async () => {
        await setPluginSettingAndReload('tableWidgetMode', 'owned');
        await ensureLivePreview();
        await setupEditor(TABLE_DOC, { line: 0, ch: 0 });
        await browser.pause(800);

        const counts = await readRender();

        expect(counts.error).toBeUndefined();
        expect(counts.ownedRoots).toBe(1);
        expect(counts.obsidianWidgets).toBe(0);
        expect(counts.linesWithPipe).toBe(0);
        // Content, not just presence: proves we rendered the real table.
        expect(counts.ownedRowTexts).toEqual([
            '| Name | Value |',
            '|------|-------|',
            '| aa   | 11    |',
        ]);
    });

    it('patches the DOM instead of redrawing it while the table is edited', async () => {
        await setPluginSettingAndReload('tableWidgetMode', 'owned');
        await ensureLivePreview();
        await setupEditor(TABLE_DOC, { line: 0, ch: 0 });
        await browser.pause(800);
        expect((await readRender()).ownedRoots).toBe(1);

        const before = await redrawCount();
        expect(before).toBeGreaterThan(0);

        // Edit the table through the document, ten times.
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
            for (let i = 0; i < 10; i++) {
                const at = cm.state.doc.line(5).from + 2;
                cm.dispatch({ changes: { from: at, insert: 'x' } });
            }
        });
        await browser.pause(600);

        const after = await redrawCount();
        const counts = await readRender();
        const doc = await getEditorValue();

        // The edits must have landed, or a zero delta proves nothing.
        expect(doc).toContain('xxxxxxxxxx');
        expect(counts.ownedRoots).toBe(1);
        expect(counts.ownedRowTexts[2]).toContain('xxxxxxxxxx');
        // `updateDOM` returning true keeps the element; a redraw would add to
        // this counter once per rebuild.
        expect(after - before).toBe(0);
    });

    it('#167.2: does not engage in Source mode', async () => {
        await setPluginSettingAndReload('tableWidgetMode', 'owned');
        await ensureLivePreview();
        await setupEditor(TABLE_DOC, { line: 0, ch: 0 });
        await browser.pause(600);
        expect((await readRender()).ownedRoots).toBe(1);

        await ensureSourceMode();
        await browser.pause(800);
        const counts = await readRender();

        expect(counts.ownedRoots).toBe(0);
        expect(counts.obsidianWidgets).toBe(0);
        // Source mode must show the table as ordinary text.
        expect(counts.linesWithPipe).toBeGreaterThan(0);
    });
});
