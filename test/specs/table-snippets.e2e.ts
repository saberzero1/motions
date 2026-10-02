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
 * Plan D: snippets inside the owned table surface.
 *
 * The plan's premise — that expansion already worked and only tabstop
 * navigation was broken — was measured false. On the shipped code `wla<Tab>`
 * in a cell left the literal prefix `| wlaaa   | 11    |` and opened no
 * session at all, because the router's insert-mode branch leaves Tab native to
 * a nested editor that has no snippet extension. Expansion and navigation are
 * therefore both covered here.
 *
 * Every scenario asserts the parent's selection **range and text** plus the
 * full document. A `selectionMoved` boolean cannot tell "moved to the right
 * field" from "moved anywhere", and a substring match cannot see a stray
 * column or an added line.
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

/** The bundled `wla` snippet is `[[${1:page}|${2:alias}]]$0`. */
const EXPANDED_DOC = TABLE_DOC.replace('| aa', '| [[page|alias]]aa');

interface Report {
    error?: string;
    doc: string;
    parentFrom: number;
    parentTo: number;
    parentSel: string;
    childSel: string;
    sessionActive: boolean;
    sessionField: number;
    mounted: number;
    nestedFocused: boolean;
}

interface SnippetPlugin {
    getNestedTableStats(): {
        mounted: number;
        focused: boolean;
        selectedText: string;
    };
    getSnippetSessionReport(): {
        active: boolean;
        field: number;
        ranges: number;
    };
}

async function report(): Promise<Report> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const empty: Report = {
            doc: '',
            parentFrom: -1,
            parentTo: -1,
            parentSel: '',
            childSel: '',
            sessionActive: false,
            sessionField: -2,
            mounted: -1,
            nestedFocused: false,
        };
        const plugin = (
            app as unknown as {
                plugins: { plugins: Record<string, SnippetPlugin> };
            }
        ).plugins.plugins['vim-motions'];
        if (!plugin) return { ...empty, error: 'no plugin' };
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return { ...empty, error: 'no MarkdownView' };
        const cm = (view.editor as unknown as { cm?: unknown }).cm as
            | {
                  state: {
                      doc: { toString: () => string };
                      selection: { main: { from: number; to: number } };
                      sliceDoc: (a: number, b: number) => string;
                  };
              }
            | undefined;
        if (!cm) return { ...empty, error: 'no EditorView' };

        const stats = plugin.getNestedTableStats();
        const session = plugin.getSnippetSessionReport();
        const main = cm.state.selection.main;
        return {
            doc: cm.state.doc.toString(),
            parentFrom: main.from,
            parentTo: main.to,
            parentSel: cm.state.sliceDoc(main.from, main.to),
            childSel: stats.selectedText,
            sessionActive: session.active,
            sessionField: session.field,
            mounted: stats.mounted,
            nestedFocused: stats.focused,
        };
    })) as Report;
}

async function enterCell(line = 5): Promise<void> {
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
    await browser.pause(800);
}

async function expand(prefix: string): Promise<void> {
    await browser.keys(['i']);
    await browser.pause(300);
    await browser.keys(prefix.split(''));
    await browser.pause(300);
    await browser.keys(['Tab']);
    await browser.pause(800);
}

async function registerRepeatedSnippet(): Promise<void> {
    await browser.executeObsidian(({ app }) => {
        const plugin = (
            app as unknown as {
                plugins: {
                    plugins: Record<
                        string,
                        {
                            snippetRegistry?: {
                                loadFile: (
                                    f: Record<
                                        string,
                                        { prefix: string; body: string }
                                    >,
                                    s: string,
                                ) => void;
                            };
                        }
                    >;
                };
            }
        ).plugins.plugins['vim-motions'];
        if (!plugin?.snippetRegistry) throw new Error('no snippetRegistry');
        plugin.snippetRegistry.loadFile(
            {
                'Repeated Tabstop': {
                    prefix: 'zrep',
                    body: '${1:a}--${1:a}$0',
                },
            },
            'user',
        );
    });
}

async function openOwnedTable(): Promise<void> {
    await setPluginSettingAndReload('tableWidgetMode', 'owned');
    await ensureLivePreview();
    await setupEditor(TABLE_DOC, { line: 0, ch: 0 });
    await browser.pause(800);
}

describe('Table snippets (Plan D)', function () {
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

    it('expands a snippet in a cell and selects the first tabstop', async () => {
        await enterCell();
        const before = await report();
        expect(before.error).toBeUndefined();
        expect(before.mounted).toBe(1);
        expect(before.nestedFocused).toBe(true);
        expect(before.sessionActive).toBe(false);

        await expand('wla');
        const after = await report();

        // The body landed in the cell, on one line, and nothing else moved.
        expect(after.doc).toBe(EXPANDED_DOC);
        expect(after.doc.split('\n').length).toBe(TABLE_DOC.split('\n').length);
        // The first tabstop is selected — the range, not merely "non-empty".
        expect(after.parentSel).toBe('page');
        expect(after.parentTo - after.parentFrom).toBe(4);
        expect(after.sessionActive).toBe(true);
        expect(after.sessionField).toBe(0);
    });

    it('Tab moves to the next tabstop and Shift-Tab moves back', async () => {
        await enterCell();
        await expand('wla');
        expect((await report()).parentSel).toBe('page');

        await browser.keys(['Tab']);
        await browser.pause(700);
        const next = await report();
        expect(next.parentSel).toBe('alias');
        expect(next.sessionField).toBe(1);
        // Navigation must not edit the document, and must not insert a tab.
        expect(next.doc).toBe(EXPANDED_DOC);
        expect(next.doc).not.toContain('\t');

        await browser.keys(['Shift', 'Tab', 'NULL']);
        await browser.pause(700);
        const back = await report();
        expect(back.parentSel).toBe('page');
        expect(back.sessionField).toBe(0);
        expect(back.doc).toBe(EXPANDED_DOC);
    });

    it('shows the active tabstop inside the cell', async () => {
        await enterCell();
        await expand('wla');

        // The nested editor is the focused view, so its selection is what the
        // user sees. Measured empty before the mirror kept non-empty ranges,
        // which left the tabstop invisible in the cell.
        const first = await report();
        expect(first.childSel).toBe('page');

        await browser.keys(['Tab']);
        await browser.pause(700);
        expect((await report()).childSel).toBe('alias');
    });

    it('control: the same snippet outside a table', async () => {
        await setupEditor('plain line', { line: 0, ch: 0 });
        await browser.pause(500);
        await expand('wla');

        const after = await report();
        expect(after.mounted).toBe(0);
        expect(after.doc).toBe('[[page|alias]]plain line');
        expect(after.parentSel).toBe('page');

        await browser.keys(['Tab']);
        await browser.pause(700);
        const next = await report();
        expect(next.parentSel).toBe('alias');
        expect(next.sessionField).toBe(1);
    });

    it('Escape ends the session and leaves insert mode in one press', async () => {
        await enterCell();
        await expand('wla');
        expect((await report()).sessionActive).toBe(true);
        expect(await getVimMode()).toBe('insert');

        await browser.keys(['Escape']);
        await browser.pause(700);

        const after = await report();
        expect(await getVimMode()).toBe('normal');
        expect(after.sessionActive).toBe(false);

        // The measured failure shape for a mis-routed Escape: the parent stays
        // in insert mode and the following u is typed in as literal text.
        await browser.keys(['u']);
        await browser.pause(700);
        const undone = await getEditorValue();
        expect(undone).not.toContain('u[[');
        expect(undone).not.toContain('| u');
        expect(undone).not.toContain('[[page|alias]]');
    });

    it('a repeated tabstop updates every occurrence', async () => {
        // Linked mirrors: `${1:a}--${1:a}` makes both occurrences follow the
        // typed text, in a cell as everywhere else.
        //
        // This pinned a GAP until Plan E1.5 mirrored every selection range.
        // CodeMirror represents linked tabstops as multiple ranges, so the
        // mirror that previously kept only `.main` gave the child one range
        // and typing updated one occupancy — measured `z--a`. Flipping this
        // assertion to `z--z` is the instruction the gap version carried.
        await registerRepeatedSnippet();

        await enterCell();
        await expand('zrep');
        const expanded = await report();
        expect(expanded.doc).toBe(TABLE_DOC.replace('| aa', '| a--aaa'));
        expect(expanded.parentSel).toBe('a');
        // The field is selected in the cell, so typing replaces it rather
        // than inserting beside it.
        expect(expanded.childSel).toBe('a');

        await browser.keys(['z']);
        await browser.pause(800);
        const typed = await report();
        expect(typed.doc).toBe(TABLE_DOC.replace('| aa', '| z--zaa'));
    });

    it('control: a repeated tabstop outside a table does mirror', async () => {
        // Separate scenario rather than a tail on the one above: the in-cell
        // half ends inside insert mode with a session open, and continuing
        // there was measured typing the control's own keys in as literal text
        // (`\tizrepzplain`). `beforeEach` is what gives this a clean editor.
        await registerRepeatedSnippet();
        await setupEditor('plain', { line: 0, ch: 0 });
        await browser.pause(500);
        await expand('zrep');
        expect((await report()).parentSel).toBe('a');

        await browser.keys(['z']);
        await browser.pause(800);
        expect((await report()).doc).toBe('z--zplain');
    });

    it('an unmatched Tab writes nothing into the table', async () => {
        await enterCell();
        // `zzqq` matches no snippet. Delivering the raw key to the parent's
        // whole keymap stack was measured letting Obsidian's indent handler
        // claim it and write a literal tab before the row, breaking the table
        // (`\t| iznlaa   | 11    |`). An unmatched Tab must do nothing.
        await expand('zzqq');

        const after = await report();
        expect(after.doc).toBe(TABLE_DOC.replace('| aa', '| zzqqaa'));
        expect(after.doc).not.toContain('\t');
        expect(after.sessionActive).toBe(false);
        // The row still has exactly two columns.
        const row = after.doc
            .split('\n')
            .find((l) => l.includes('zzqq')) as string;
        expect((row.match(/\|/g) ?? []).length).toBe(3);
    });
});
