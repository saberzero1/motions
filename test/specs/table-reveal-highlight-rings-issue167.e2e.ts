import { browser, expect } from '@wdio/globals';
import {
    ensureLivePreview,
    loadSingleFileWorkspace,
    setPluginSettingAndReload,
    setupEditor,
} from '../helpers';

// #167: in a revealed table, `yyp` on a row drew Obsidian's blue search ring
// around the pasted row, and pasting several rows drew one around each. The reveal keeps
// a table as source with one search-match highlight per row, styled so it
// does not show. Two bugs left a second mark on a row, which the stylesheet
// draws as a genuine match nested in ours:
//
// - Obsidian's fold filter returns `[tr, …]` on every edit, which has
//   CodeMirror run transaction extenders twice. Each run added a new row's
//   highlight.
// - A deletion that took a row's start dropped that row from the plugin's
//   record while CodeMirror kept the rest of the mark, so the next filter
//   could not remove it.
//
// Read from Obsidian's own highlight field, not the plugin's record, since
// the record is what went wrong.

const DOC = [
    'Above',
    '',
    '| **col 1** | col 2 |',
    '| --------- | ----- |',
    '| **row 1** | test  |',
    '| **row 2** | test  |',
    '',
    'Below',
].join('\n');

interface Reading {
    /** Every search-match mark in Obsidian's field, as `line:ch-line:ch`. */
    marks: string[];
    /** Lines holding a mark nested in another — what draws the ring. */
    nested: number[];
    /** Lines of the table the plugin has revealed, as `first-last`. */
    tables: string[];
    text: string;
}

async function read(): Promise<Reading> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) throw new Error('no MarkdownView');
        type Value = { spec?: { class?: string } };
        type Cursor = {
            value: Value | null;
            from: number;
            to: number;
            next(): void;
        };
        type DecoSet = { iter(): Cursor };
        const cm = (
            view.editor as unknown as {
                cm: {
                    constructor: { decorations: unknown };
                    state: {
                        doc: {
                            toString(): string;
                            lineAt(p: number): { number: number; from: number };
                        };
                        facet(f: unknown): readonly unknown[];
                    };
                    contentDOM: HTMLElement;
                    posAtDOM(n: Node): number;
                };
            }
        ).cm;
        const doc = cm.state.doc;
        const at = (p: number) => {
            const line = doc.lineAt(p);
            return `${line.number - 1}:${p - line.from}`;
        };
        const marks: string[] = [];
        for (const source of cm.state.facet(cm.constructor.decorations)) {
            const set = (
                typeof source === 'function'
                    ? (source as (v: unknown) => DecoSet)(cm)
                    : source
            ) as DecoSet | null;
            if (!set || typeof set.iter !== 'function') continue;
            for (const it = set.iter(); it.value; it.next()) {
                if (
                    it.value.spec?.class === 'obsidian-search-match-highlight'
                ) {
                    marks.push(`${at(it.from)}-${at(it.to)}`);
                }
            }
        }
        const nested = Array.from(
            cm.contentDOM.querySelectorAll(
                'span.obsidian-search-match-highlight span.obsidian-search-match-highlight',
            ),
        ).map((el) => doc.lineAt(cm.posAtDOM(el)).number - 1);
        const plugin = (
            app as unknown as {
                plugins: {
                    plugins: Record<
                        string,
                        {
                            getTableRevealReport(): {
                                tables: { from: number; to: number }[];
                            };
                        }
                    >;
                };
            }
        ).plugins.plugins['vim-motions'];
        const tables = (plugin?.getTableRevealReport().tables ?? []).map(
            (t) =>
                `${doc.lineAt(t.from).number - 1}-${doc.lineAt(t.to).number - 1}`,
        );
        return { marks, nested, tables, text: doc.toString() };
    })) as Reading;
}

async function keys(...k: string[]): Promise<void> {
    for (const key of k) {
        await browser.keys([key]);
        await browser.pause(90);
    }
    await browser.pause(400);
}

async function startAt(line: number, ch: number): Promise<void> {
    await setupEditor(DOC, { line: 0, ch: 0 });
    await browser.pause(300);
    await keys('Escape');
    await browser.executeObsidian(
        ({ app, obsidian }, l: number, c: number) => {
            app.workspace
                .getActiveViewOfType(obsidian.MarkdownView)
                ?.editor.setCursor({ line: l, ch: c });
        },
        line,
        ch,
    );
    await browser.pause(400);
}

describe('A revealed table draws no search ring after an edit (#167)', function () {
    this.timeout(120000);

    before(async function () {
        await loadSingleFileWorkspace();
        await ensureLivePreview();
        await setPluginSettingAndReload('tableWidgetMode', 'reveal');
    });

    after(async function () {
        await setPluginSettingAndReload('tableWidgetMode', 'auto');
    });

    it('yyp marks the pasted row once', async function () {
        await startAt(4, 3);
        await keys('y', 'y', 'p');
        expect(await read()).toEqual({
            marks: ['2:0-2:21', '3:0-3:21', '4:0-4:21', '5:0-5:21', '6:0-6:21'],
            nested: [],
            tables: ['2-6'],
            text: DOC.replace(
                '| **row 1** | test  |\n',
                '| **row 1** | test  |\n| **row 1** | test  |\n',
            ),
        });
    });

    it('a deletion across a row’s start leaves no mark behind', async function () {
        // `v` from column 5 of row 1 to column 5 of row 2: the deletion takes
        // row 2's start, and the rest of it joins row 1.
        await startAt(4, 5);
        await keys('v', 'j', 'd');
        expect(await read()).toEqual({
            marks: ['2:0-2:21', '3:0-3:21', '4:0-4:20'],
            nested: [],
            tables: ['2-4'],
            text: DOC.replace(
                '| **row 1** | test  |\n| **row 2** | test  |',
                '| **rw 2** | test  |',
            ),
        });
    });

    it('yjP marks both pasted rows once', async function () {
        await startAt(4, 3);
        await keys('y', 'j', 'P');
        expect(await read()).toEqual({
            marks: [
                '2:0-2:21',
                '3:0-3:21',
                '4:0-4:21',
                '5:0-5:21',
                '6:0-6:21',
                '7:0-7:21',
            ],
            nested: [],
            tables: ['2-7'],
            text: DOC.replace(
                '| **row 1** | test  |\n',
                '| **row 1** | test  |\n| **row 2** | test  |\n| **row 1** | test  |\n',
            ),
        });
    });
});
