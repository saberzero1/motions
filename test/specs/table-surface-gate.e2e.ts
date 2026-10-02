import { browser, expect } from '@wdio/globals';
import {
    ensureLivePreview,
    loadSingleFileWorkspace,
    sendVimEscape,
    setupEditor,
    PAUSE,
} from '../helpers';

/**
 * Plan B Step 3 / defect A3: the treesitter bridge must not allocate a WASM
 * parser for every one-line table cell editor Obsidian creates.
 *
 * The parent assertion is not decoration. Two earlier gate attempts kept the
 * extension out of the view's configuration with `appendConfig` and installed
 * it **nowhere** — main editors included — and both passed their cell-side
 * assertions for exactly that reason. `parent.hasTree` is the only reading
 * that distinguishes "withheld from cells" from "never installed".
 */

const TABLE_DOC = [
    '# Heading',
    '',
    '| Name | Value |',
    '|------|-------|',
    '| aa   | 11    |',
].join('\n');

const PLAIN_DOC = '# Heading\n\nBody text.';

type SurfaceReading = { surface: string; hasTree: boolean } | null;

interface SurfaceReport {
    error?: string;
    parent: SurfaceReading;
    cell: SurfaceReading;
}

interface GatePlugin {
    getTreesitterSurfaceReport(): {
        parent: SurfaceReading;
        cell: SurfaceReading;
    };
}

async function readReport(): Promise<SurfaceReport> {
    return (await browser.executeObsidian(({ app }) => {
        const plugin = (
            app as unknown as {
                plugins: { plugins: Record<string, GatePlugin> };
            }
        ).plugins.plugins['vim-motions'];
        if (!plugin) {
            return { error: 'no plugin', parent: null, cell: null };
        }
        return plugin.getTreesitterSurfaceReport();
    })) as SurfaceReport;
}

async function waitForTableWidget(): Promise<void> {
    await browser.waitUntil(
        async () =>
            (await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return false;
                const contentEl = (
                    view as unknown as { contentEl: HTMLElement }
                ).contentEl;
                return contentEl.querySelector('.cm-table-widget') !== null;
            })) as boolean,
        { timeout: 6000, interval: 100 },
    );
}

describe('Treesitter surface gate (defect A3)', function () {
    this.timeout(240000);

    before(async () => {
        await loadSingleFileWorkspace();
    });

    it('control: a document surface is classified and does get a tree', async () => {
        await ensureLivePreview();
        await setupEditor(PLAIN_DOC, { line: 0, ch: 0 });
        await sendVimEscape();
        await browser.pause(PAUSE.EDITOR_SETTLE);

        const report = await readReport();

        expect(report.error).toBeUndefined();
        expect(report.parent).not.toBeNull();
        expect(report.parent?.surface).toBe('document');
        // If this is false the bridge never loaded, and every "no tree"
        // reading below would be meaningless.
        expect(report.parent?.hasTree).toBe(true);
        expect(report.cell).toBeNull();
    });

    it('withholds the parser from a table cell while the parent keeps its tree', async () => {
        await ensureLivePreview();
        await setupEditor(TABLE_DOC, { line: 0, ch: 0 });
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);
        await waitForTableWidget();

        // Moving the cursor onto a table row is what makes Obsidian open its
        // per-cell editor.
        await browser.keys(['j', 'j', 'j', 'j']);
        await browser.pause(600);

        const report = await readReport();

        expect(report.error).toBeUndefined();
        // Precondition: without a live cell editor the next two assertions
        // pass trivially.
        expect(report.cell).not.toBeNull();
        expect(report.cell?.surface).toBe('table-cell');
        expect(report.cell?.hasTree).toBe(false);

        // The parent control.
        expect(report.parent).not.toBeNull();
        expect(report.parent?.surface).toBe('document');
        expect(report.parent?.hasTree).toBe(true);
    });
});
