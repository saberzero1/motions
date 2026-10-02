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
 * Plan B Step 4: the parent's vim owns commands pressed inside the table.
 *
 * Every scenario asserts on what the **product** produced — document text,
 * vim mode, the parent's head — and never on the router's own counter alone.
 * `routed` appears only as a precondition, because a scenario where no key
 * reached the router at all would otherwise satisfy "the document is
 * unchanged" style assertions trivially.
 *
 * The focus precondition is load-bearing and was measured the hard way:
 * Obsidian's `editor.focus()` does not stick while a nested editor exists, and
 * a scenario that pressed keys with focus on `<body>` reported "nothing
 * happened" rather than failing.
 */

const TABLE_DOC = [
    'Line above',
    '',
    '| Name | Value |',
    '|------|-------|',
    '| aa   | 11    |',
    '| bb   | 22    |',
    '',
    'Line below',
].join('\n');

interface Stats {
    mounted: number;
    focused: boolean;
    childHead: number;
    routed: number;
    doc: string | null;
}

interface RouterPlugin {
    getNestedTableStats(): Stats;
}

interface Snapshot {
    error?: string;
    nested: Stats;
    parentHead: number;
    parentFocused: boolean;
    activeTag: string;
}

async function snapshot(): Promise<Snapshot> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const empty = {
            nested: {
                mounted: -1,
                focused: false,
                childHead: -1,
                routed: -1,
                doc: null,
            } as Stats,
            parentHead: -1,
            parentFocused: false,
            activeTag: '',
        };
        const plugin = (
            app as unknown as {
                plugins: { plugins: Record<string, RouterPlugin> };
            }
        ).plugins.plugins['vim-motions'];
        if (!plugin) return { ...empty, error: 'no plugin' };
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return { ...empty, error: 'no MarkdownView' };
        const cm = (view.editor as unknown as { cm?: unknown }).cm as
            | {
                  hasFocus: boolean;
                  state: { selection: { main: { head: number } } };
              }
            | undefined;
        if (!cm) return { ...empty, error: 'no EditorView' };

        return {
            nested: plugin.getNestedTableStats(),
            parentHead: cm.state.selection.main.head,
            parentFocused: cm.hasFocus,
            activeTag:
                (document.activeElement as HTMLElement | null)?.tagName ?? '',
        };
    })) as Snapshot;
}

/** Park the parent's cursor on the `aa` row, which mounts and focuses. */
async function enterTable(line = 5): Promise<Snapshot> {
    await browser.executeObsidian(({ app, obsidian }, target: number) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        const cm = (view?.editor as unknown as { cm?: unknown })?.cm as
            | {
                  state: { doc: { line: (n: number) => { from: number } } };
                  dispatch: (spec: unknown) => void;
              }
            | undefined;
        if (!cm) throw new Error('no EditorView');
        cm.dispatch({
            selection: { anchor: cm.state.doc.line(target).from + 2 },
        });
    }, line);
    await browser.pause(700);
    return snapshot();
}

async function openOwnedTable(): Promise<void> {
    await setPluginSettingAndReload('tableWidgetMode', 'owned');
    await ensureLivePreview();
    await setupEditor(TABLE_DOC, { line: 0, ch: 0 });
    await browser.pause(800);
}

/** Every scenario presses keys only after this holds. */
function expectNestedHasFocus(snap: Snapshot): void {
    expect(snap.error).toBeUndefined();
    expect(snap.nested.mounted).toBe(1);
    expect(snap.nested.focused).toBe(true);
    expect(snap.parentFocused).toBe(false);
}

describe('Table key router (Plan B Step 4)', function () {
    this.timeout(240000);

    before(async () => {
        await loadSingleFileWorkspace();
    });

    after(async () => {
        await setPluginSettingAndReload('tableWidgetMode', 'native');
    });

    beforeEach(async () => {
        await openOwnedTable();
    });

    it('focuses the nested editor and parks the parent inside the table', async () => {
        const snap = await enterTable();
        expectNestedHasFocus(snap);
        // The parent's head stays in the table rather than being relocated out
        // of the block-replaced range, which is what makes it authoritative.
        const doc = await getEditorValue();
        const rowStart = doc.indexOf('| aa');
        expect(snap.parentHead).toBeGreaterThanOrEqual(rowStart);
        // Exactly the translation, not merely "a plausible number": the
        // child's document is the parent's slice, so the offset is a
        // subtraction. `>= 0` passes on a default selection of 0 and proved
        // vacuous under a negative control.
        expect(snap.nested.childHead).toBe(
            snap.parentHead - doc.indexOf('| Name'),
        );
    });

    it('routes dd to the parent, removing a row and typing no literal dd', async () => {
        const before = await enterTable();
        expectNestedHasFocus(before);

        await browser.keys(['d', 'd']);
        await browser.pause(700);

        const doc = await getEditorValue();
        const after = await snapshot();

        expect(after.nested.routed).toBeGreaterThan(before.nested.routed);
        expect(doc).not.toContain('| aa');
        expect(doc).not.toContain('dd');
        // The rest of the table survives, so this was a row delete and not a
        // wholesale replacement.
        expect(doc).toContain('| bb   | 22    |');
        expect(doc).toContain('| Name | Value |');
    });

    it('routes u and . so undo and dot-repeat act on one history', async () => {
        const before = await enterTable();
        expectNestedHasFocus(before);

        await browser.keys(['d', 'd']);
        await browser.pause(500);
        expect(await getEditorValue()).not.toContain('| aa');

        await browser.keys(['u']);
        await browser.pause(600);
        const undone = await getEditorValue();
        expect(undone).toContain('| aa   | 11    |');
        expect(undone).not.toContain('u|');

        await browser.keys(['.']);
        await browser.pause(600);
        const repeated = await getEditorValue();
        expect(repeated).not.toContain('| aa');
        expect(repeated).toContain('| bb   | 22    |');
    });

    it('routes l as a motion, moving the parent head by one', async () => {
        const before = await enterTable();
        expectNestedHasFocus(before);

        await browser.keys(['l']);
        await browser.pause(500);

        const after = await snapshot();
        expect(after.parentHead).toBe(before.parentHead + 1);
        // A motion must not touch the document.
        const doc = await getEditorValue();
        expect(doc).toBe(TABLE_DOC);
        // The caret the user sees moved with it.
        expect(after.nested.childHead).toBe(
            after.parentHead - doc.indexOf('| Name'),
        );
    });

    it('routes j one table row and stays inside the table', async () => {
        const before = await enterTable();
        expectNestedHasFocus(before);

        await browser.keys(['j']);
        await browser.pause(600);

        const after = await snapshot();
        const doc = await getEditorValue();
        // One table row, not one visual line past the whole widget.
        expect(after.parentHead).toBeGreaterThan(before.parentHead);
        expect(after.parentHead).toBeLessThan(doc.indexOf('Line below'));
        expect(after.nested.mounted).toBe(1);
        expect(doc).toBe(TABLE_DOC);
        expect(after.nested.childHead).toBe(
            after.parentHead - doc.indexOf('| Name'),
        );
    });

    it('routes V into visual mode and Vjd removes two rows', async () => {
        const before = await enterTable();
        expectNestedHasFocus(before);

        await browser.keys(['V']);
        await browser.pause(500);
        expect(await getVimMode()).toBe('visual');

        await browser.keys(['j', 'd']);
        await browser.pause(700);

        const doc = await getEditorValue();
        expect(doc).not.toContain('| aa');
        expect(doc).not.toContain('| bb');
        expect(doc).toContain('| Name | Value |');
        expect(doc).toContain('Line below');
    });
});
