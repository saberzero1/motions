import { browser, expect } from '@wdio/globals';
import {
    ensureLivePreview,
    getCursorPos,
    getEditorValue,
    loadSingleFileWorkspace,
    setPluginSettingAndReload,
    setupEditor,
} from '../helpers';

/**
 * Plan B Step 7: leaving the table hands control back to the parent.
 *
 * The nested editor owns focus while the cursor is inside a table. When a
 * motion takes the cursor out, the child unmounts and its DOM goes with it — so
 * unless focus is handed back, the next keystroke reaches nothing at all. Every
 * scenario therefore presses a key **after** the hand-off and asserts on its
 * effect, not merely on where the first motion landed.
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

interface Stats {
    mounted: number;
    focused: boolean;
}

interface BoundaryPlugin {
    getNestedTableStats(): Stats;
}

interface Snapshot {
    error?: string;
    mounted: number;
    nestedFocused: boolean;
    parentFocused: boolean;
    activeTag: string;
}

async function snapshot(): Promise<Snapshot> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const empty = {
            mounted: -1,
            nestedFocused: false,
            parentFocused: false,
            activeTag: '',
        };
        const plugin = (
            app as unknown as {
                plugins: { plugins: Record<string, BoundaryPlugin> };
            }
        ).plugins.plugins['vim-motions'];
        if (!plugin) return { ...empty, error: 'no plugin' };
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return { ...empty, error: 'no MarkdownView' };
        const cm = (view.editor as unknown as { cm?: unknown }).cm as
            { hasFocus: boolean } | undefined;
        if (!cm) return { ...empty, error: 'no EditorView' };
        const stats = plugin.getNestedTableStats();
        return {
            mounted: stats.mounted,
            nestedFocused: stats.focused,
            parentFocused: cm.hasFocus,
            activeTag:
                (document.activeElement as HTMLElement | null)?.tagName ?? '',
        };
    })) as Snapshot;
}

/** Park the parent on `line` (1-based) at column `ch`, then settle. */
async function park(line: number, ch: number): Promise<void> {
    await browser.executeObsidian(
        ({ app, obsidian }, target: { line: number; ch: number }) => {
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
            cm.dispatch({
                selection: {
                    anchor: cm.state.doc.line(target.line).from + target.ch,
                },
            });
        },
        { line, ch },
    );
    await browser.pause(700);
}

async function openDoc(): Promise<void> {
    await setPluginSettingAndReload('tableWidgetMode', 'owned');
    await ensureLivePreview();
    await setupEditor(DOC, { line: 0, ch: 0 });
    await browser.pause(800);
}

describe('Table boundary hand-off (Plan B Step 7)', function () {
    this.timeout(240000);

    before(async () => {
        await loadSingleFileWorkspace();
    });

    after(async () => {
        await setPluginSettingAndReload('tableWidgetMode', 'native');
    });

    beforeEach(async () => {
        await openDoc();
    });

    it('j from the last table row leaves the table and the parent regains focus', async () => {
        await park(6, 2);
        const inside = await snapshot();
        expect(inside.mounted).toBe(1);
        expect(inside.nestedFocused).toBe(true);

        await browser.keys(['j']);
        await browser.pause(700);

        const after = await snapshot();
        expect(after.mounted).toBe(0);
        // Without the hand-off the child's DOM is gone and focus is on <body>.
        expect(after.parentFocused).toBe(true);

        const pos = await getCursorPos();
        expect(pos.line).toBe(6);
    });

    it('keeps moving after the hand-off, which proves focus was restored', async () => {
        await park(6, 2);
        expect((await snapshot()).mounted).toBe(1);

        await browser.keys(['j']);
        await browser.pause(600);
        await browser.keys(['j']);
        await browser.pause(600);

        const pos = await getCursorPos();
        // Line 8 of the document, zero-based 7.
        expect(pos.line).toBe(7);
        // The desired column survives the blank line in between, which is
        // vim's `lastHPos` doing its job on the parent.
        expect(pos.ch).toBe(2);
        expect(await getEditorValue()).toBe(DOC);
    });

    it('3j from the second-to-last row consumes the whole count outside the table', async () => {
        await park(5, 2);
        expect((await snapshot()).mounted).toBe(1);

        await browser.keys(['3', 'j']);
        await browser.pause(700);

        const pos = await getCursorPos();
        expect(pos.line).toBe(7);
        expect((await snapshot()).mounted).toBe(0);
        expect(await getEditorValue()).toBe(DOC);
    });

    it('k from the header row leaves upwards and keeps moving', async () => {
        await park(3, 2);
        expect((await snapshot()).mounted).toBe(1);

        await browser.keys(['k']);
        await browser.pause(600);
        expect((await snapshot()).mounted).toBe(0);
        expect((await getCursorPos()).line).toBe(1);

        await browser.keys(['k']);
        await browser.pause(600);
        const pos = await getCursorPos();
        expect(pos.line).toBe(0);
        expect(pos.ch).toBe(2);
    });

    it('does not pull focus into the editor when the child did not have it', async () => {
        await park(6, 2);
        expect((await snapshot()).mounted).toBe(1);

        // The user's attention has gone elsewhere — a sidebar, another pane.
        await browser.executeObsidian(() => {
            (document.activeElement as HTMLElement | null)?.blur();
        });
        await browser.pause(300);
        expect((await snapshot()).nestedFocused).toBe(false);

        await park(8, 0);

        const after = await snapshot();
        expect(after.mounted).toBe(0);
        // Handing focus back unconditionally would yank it into the editor
        // from wherever the user actually is.
        expect(after.parentFocused).toBe(false);
    });

    it('re-enters the table and remounts when a motion comes back in', async () => {
        await park(6, 2);
        expect((await snapshot()).mounted).toBe(1);

        await browser.keys(['j']);
        await browser.pause(700);
        expect((await snapshot()).mounted).toBe(0);

        await browser.keys(['k']);
        await browser.pause(700);

        const back = await snapshot();
        expect(back.mounted).toBe(1);
        expect(back.nestedFocused).toBe(true);
        expect((await getCursorPos()).line).toBe(5);
    });
});
