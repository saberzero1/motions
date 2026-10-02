import { browser, expect } from '@wdio/globals';
import {
    ensureLivePreview,
    handleEx,
    loadSingleFileWorkspace,
    sendVimEscape,
    setPluginSettingAndReload,
    setupEditor,
} from '../helpers';

/**
 * Plan G, step G2b.
 *
 * Obsidian creates one editor per table cell, and every extension registered
 * through `registerEditorExtension()` is instantiated again for each one-line
 * cell document. The scrolloff enforcer was measured running **8 times inside
 * a cell across two keystrokes**, calling `coordsAtPos` and
 * `getBoundingClientRect` each time. It is now gated.
 *
 * The observable is a **count**, not geometry: a one-line cell editor has
 * `scrollHeight ≈ clientHeight`, so the enforcer's own `>= 1` threshold means
 * it never writes `scrollTop` there. "It did not scroll" holds whether or not
 * the listener ran.
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

interface Report {
    error?: string;
    parent: number | null;
    cell: number | null;
}

interface ScrolloffPlugin {
    getScrolloffReport(): { parent: number | null; cell: number | null };
}

async function report(): Promise<Report> {
    return (await browser.executeObsidian(({ app }) => {
        const plugin = (
            app as unknown as {
                plugins: { plugins: Record<string, ScrolloffPlugin> };
            }
        ).plugins.plugins['vim-motions'];
        if (!plugin) return { error: 'no plugin', parent: null, cell: null };
        return plugin.getScrolloffReport();
    })) as Report;
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

describe('Scrolloff is withheld from table cell editors (Plan G)', function () {
    this.timeout(240000);

    before(async () => {
        await loadSingleFileWorkspace();
    });

    after(async () => {
        await setPluginSettingAndReload('tableWidgetMode', 'native');
    });

    it('does not run in a cell editor while still running in the parent', async () => {
        await setPluginSettingAndReload('tableWidgetMode', 'native');
        await ensureLivePreview();
        await setupEditor(TABLE_DOC, { line: 0, ch: 0 });
        await sendVimEscape();
        await browser.pause(400);

        // Explicit, not relying on the default: a scenario that passed because
        // scrolloff was off would prove nothing.
        const ex = await handleEx('set scrolloff=5');
        expect(ex.unknownCommand).toBe(false);
        await browser.pause(300);

        // Drive the PARENT first, outside any table.
        await park(1, 0);
        await browser.keys(['j', 'j', 'j', 'j', 'j']);
        await browser.pause(500);
        const afterParent = await report();

        expect(afterParent.error).toBeUndefined();
        // The parent control: the extension reaches a main editor and runs.
        // Without this, a cell count of zero is indistinguishable from the
        // extension never installing anywhere.
        expect(afterParent.parent).toBeGreaterThan(0);

        // Now enter a cell and drive it.
        await park(5, 2);
        const entered = await report();
        expect(entered.cell).not.toBeNull();

        const cellBefore = entered.cell ?? -1;
        await browser.keys(['l', 'l', 'l', 'l', 'l']);
        await browser.pause(500);

        const after = await report();
        expect(after.cell).toBe(cellBefore);
        expect(after.cell).toBe(0);
        // And the parent is unaffected by the gate.
        expect(after.parent).toBeGreaterThanOrEqual(afterParent.parent ?? 0);
    });
});
