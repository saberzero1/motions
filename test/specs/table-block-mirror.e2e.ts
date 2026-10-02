import { browser, expect } from '@wdio/globals';
import {
    ensureLivePreview,
    getEditorValue,
    getVimMode,
    loadSingleFileWorkspace,
    setPluginSettingAndReload,
    setupEditor,
} from '../helpers';

/**
 * Plan E1.5: the nested editor mirrors **every** parent selection range.
 *
 * Visual block is the case. The parent carries one range per row, and the
 * mirror used to keep only `.main` — so a three-row block rendered as a
 * one-row selection, misreporting what the operator would act on.
 *
 * The linewise scenario at the end is the pairing the plan requires: a mirror
 * that rendered the wrong ranges could otherwise satisfy the block assertions
 * alone.
 */

const TABLE_DOC = [
    'Line above',
    '',
    '| h1   | h2   |',
    '|------|------|',
    '| aa   | 11   |',
    '| bb   | 22   |',
    '| cc   | 33   |',
    '',
    'Line below',
].join('\n');

interface Mirror {
    error?: string;
    parentTexts: string[];
    parentCount: number;
    childTexts: string[];
    childCount: number;
    childMain: number;
    rects: number;
    mounted: number;
    focused: boolean;
}

interface MirrorPlugin {
    getNestedTableStats(): { mounted: number; focused: boolean };
    getNestedSelectionReport(): {
        childTexts: string[];
        childCount: number;
        childMain: number;
    };
}

async function mirror(): Promise<Mirror> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const empty: Mirror = {
            parentTexts: [],
            parentCount: -1,
            childTexts: [],
            childCount: -1,
            childMain: -1,
            rects: -1,
            mounted: -1,
            focused: false,
        };
        const plugin = (
            app as unknown as {
                plugins: { plugins: Record<string, MirrorPlugin> };
            }
        ).plugins.plugins['vim-motions'];
        if (!plugin) return { ...empty, error: 'no plugin' };
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return { ...empty, error: 'no MarkdownView' };
        const cm = (view.editor as unknown as { cm?: unknown }).cm as
            | {
                  state: {
                      selection: {
                          ranges: readonly { from: number; to: number }[];
                      };
                      sliceDoc: (a: number, b: number) => string;
                  };
              }
            | undefined;
        if (!cm) return { ...empty, error: 'no EditorView' };

        const stats = plugin.getNestedTableStats();
        const child = plugin.getNestedSelectionReport();
        return {
            parentTexts: cm.state.selection.ranges.map((r) =>
                cm.state.sliceDoc(r.from, r.to),
            ),
            parentCount: cm.state.selection.ranges.length,
            childTexts: child.childTexts,
            childCount: child.childCount,
            childMain: child.childMain,
            rects: document.querySelectorAll(
                '.vim-motions-table-nested .cm-selectionBackground',
            ).length,
            mounted: stats.mounted,
            focused: stats.focused,
        };
    })) as Mirror;
}

async function enterCell(line = 5, ch = 2): Promise<void> {
    await browser.executeObsidian(
        ({ app, obsidian }, target: number, col: number) => {
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
                selection: { anchor: cm.state.doc.line(target).from + col },
            });
        },
        line,
        ch,
    );
    await browser.pause(800);
}

async function openOwnedTable(): Promise<void> {
    await setPluginSettingAndReload('tableWidgetMode', 'owned');
    await ensureLivePreview();
    await setupEditor(TABLE_DOC, { line: 0, ch: 0 });
    await browser.pause(800);
}

describe('Table block selection mirror (Plan E1.5)', function () {
    this.timeout(300000);

    before(async () => {
        await loadSingleFileWorkspace();
    });

    after(async () => {
        await setPluginSettingAndReload('tableWidgetMode', 'native');
    });

    beforeEach(async () => {
        await openOwnedTable();
    });

    it('mirrors all three ranges of a three-row block', async () => {
        await enterCell();
        const before = await mirror();
        expect(before.error).toBeUndefined();
        expect(before.mounted).toBe(1);
        expect(before.focused).toBe(true);

        await browser.keys(['Control', 'v', 'NULL']);
        await browser.pause(500);
        await browser.keys(['j', 'j', 'l']);
        await browser.pause(700);

        const after = await mirror();
        // The parent is the source of truth: three ranges, one per row.
        expect(after.parentCount).toBe(3);
        expect(after.parentTexts).toStrictEqual(['aa', 'bb', 'cc']);
        // And the child renders exactly those, because it is the focused view.
        expect(after.childCount).toBe(3);
        expect(after.childTexts).toStrictEqual(['aa', 'bb', 'cc']);
        // Content, not just count: a mirror that kept only `.main` reports 1.
        expect(after.rects).toBeGreaterThanOrEqual(3);
        expect(await getEditorValue()).toBe(TABLE_DOC);
    });

    it('keeps the main range so the caret follows the vim head', async () => {
        await enterCell();
        await browser.keys(['Control', 'v', 'NULL']);
        await browser.pause(500);
        await browser.keys(['j', 'l']);
        await browser.pause(700);

        const after = await mirror();
        expect(after.childCount).toBe(2);
        // The head is on the lower row, so main must be the last range.
        expect(after.childMain).toBe(1);
    });

    it('pairs with linewise, which must stay a single range', async () => {
        await enterCell();
        await browser.keys(['V']);
        await browser.pause(500);
        expect(await getVimMode()).toBe('visual');
        await browser.keys(['j']);
        await browser.pause(700);

        const after = await mirror();
        // Linewise is one CM6 range spanning both rows, not two ranges.
        expect(after.childCount).toBe(1);
        expect(after.childTexts[0]).toContain('| aa   | 11   |');
        expect(after.childTexts[0]).toContain('| bb   | 22   |');
        expect(after.childTexts[0]).not.toContain('| cc');
    });

    it('a block delete removes the block, not whole rows', async () => {
        await enterCell();
        await browser.keys(['Control', 'v', 'NULL']);
        await browser.pause(500);
        await browser.keys(['j', 'j', 'l']);
        await browser.pause(700);
        await browser.keys(['d']);
        await browser.pause(800);

        const doc = await getEditorValue();
        // Derived rather than hand-counted: exactly the two selected
        // characters leave each of the three rows and nothing else moves.
        // A hand-written literal got the space count wrong here, which reads
        // as a product failure rather than as a bad expectation.
        expect(doc).toBe(
            TABLE_DOC.replace('aa', '').replace('bb', '').replace('cc', ''),
        );
        expect(doc.split('\n').length).toBe(TABLE_DOC.split('\n').length);
        // The other column is untouched, so this was a block and not a row op.
        expect(doc).toContain('| 11   |');
        expect(doc).toContain('| 33   |');
    });
});
