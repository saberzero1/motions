import { browser, expect } from '@wdio/globals';
import {
    ensureSourceMode,
    loadSingleFileWorkspace,
    setupEditor,
    vimKeys,
} from '../helpers';

// A visual-line selection reaches the editor's own selection (#231). It used
// to be held back: the editor was given a bare cursor at column 0 of the head
// line, so `EditorState.selection` and the adapter's `listSelections()` showed
// anchor and head at one point while only Obsidian's patched `Editor` methods
// knew the range, and anything else that read the selection saw nothing.

const DOC = ['alpha beta', 'second line here', 'third'].join('\n');

interface Pos {
    line: number;
    ch: number;
}

interface Reading {
    /** `EditorState.selection.main`, as positions. */
    state: { anchor: Pos; head: Pos };
    /** The CM5 adapter's `listSelections()`, as the issue reads it. */
    adapter: { anchor: Pos; head: Pos };
    /** Obsidian's `Editor.getSelection()`. */
    text: string;
    /** The column the drawn cursor sits over, or null when none is drawn. */
    drawnAt: Pos | null;
}

async function read(): Promise<Reading> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) throw new Error('no MarkdownView');
        const editor = view.editor;
        const cmView = (
            editor as unknown as {
                cm: {
                    state: {
                        selection: { main: { anchor: number; head: number } };
                    };
                    posAtCoords(c: { x: number; y: number }): number | null;
                    cm: {
                        listSelections(): { anchor: Pos; head: Pos }[];
                    };
                    dom: HTMLElement;
                };
            }
        ).cm;
        const main = cmView.state.selection.main;
        const pos = (o: number) => {
            const p = editor.offsetToPos(o);
            return { line: p.line, ch: p.ch };
        };
        const first = cmView.cm.listSelections()[0];
        if (!first) throw new Error('no selections');
        const cursor = cmView.dom.querySelector(
            '.cm-vimCursorLayer .cm-fat-cursor.cm-cursor-primary',
        );
        let drawnAt: Pos | null = null;
        if (cursor) {
            const r = cursor.getBoundingClientRect();
            const at = cmView.posAtCoords({
                x: r.left + r.width / 2,
                y: r.top + r.height / 2,
            });
            if (at !== null) drawnAt = pos(at);
        }
        return {
            state: { anchor: pos(main.anchor), head: pos(main.head) },
            adapter: {
                anchor: { line: first.anchor.line, ch: first.anchor.ch },
                head: { line: first.head.line, ch: first.head.ch },
            },
            text: editor.getSelection(),
            drawnAt,
        };
    })) as Reading;
}

describe('Visual-line selection reaches the editor (#231)', function () {
    this.timeout(90000);

    beforeEach(async function () {
        await loadSingleFileWorkspace();
        await ensureSourceMode();
    });

    it('V selects the whole line in the editor state', async function () {
        await setupEditor(DOC, { line: 0, ch: 6 });
        await vimKeys('V');
        expect(await read()).toEqual({
            state: { anchor: { line: 0, ch: 0 }, head: { line: 0, ch: 10 } },
            adapter: { anchor: { line: 0, ch: 0 }, head: { line: 0, ch: 10 } },
            text: 'alpha beta',
            drawnAt: { line: 0, ch: 6 },
        });
    });

    it('Vj covers both lines, with the cursor kept at its column', async function () {
        await setupEditor(DOC, { line: 0, ch: 6 });
        await vimKeys('V', 'j');
        expect(await read()).toEqual({
            state: { anchor: { line: 0, ch: 0 }, head: { line: 1, ch: 16 } },
            adapter: { anchor: { line: 0, ch: 0 }, head: { line: 1, ch: 16 } },
            text: 'alpha beta\nsecond line here',
            drawnAt: { line: 1, ch: 6 },
        });
    });

    // Upwards, the head is the top line's start and the anchor the bottom
    // line's end, as CodeMirror's own selections run.
    it('Vk runs backwards, and the cursor holds a short line', async function () {
        await setupEditor(DOC, { line: 1, ch: 12 });
        await vimKeys('V', 'j');
        const down = await read();
        await vimKeys('V', 'k');
        expect({ down: down.drawnAt, up: await read() }).toEqual({
            // `third` is five long, so column 12 is drawn on its last letter.
            down: { line: 2, ch: 4 },
            // Escape leaves the cursor on the last letter of `third` and forgets
            // column 12, so `k` lands on column 4: Neovim 0.12.5 reports `2 5 V`.
            up: {
                state: {
                    anchor: { line: 2, ch: 5 },
                    head: { line: 1, ch: 0 },
                },
                adapter: {
                    anchor: { line: 2, ch: 5 },
                    head: { line: 1, ch: 0 },
                },
                text: 'second line here\nthird',
                drawnAt: { line: 1, ch: 4 },
            },
        });
    });

    it('Escape collapses the selection again', async function () {
        await setupEditor(DOC, { line: 0, ch: 6 });
        await vimKeys('V', 'j');
        await browser.keys(['Escape']);
        await browser.pause(200);
        const after = await read();
        expect({ text: after.text, state: after.state }).toEqual({
            text: '',
            state: { anchor: { line: 1, ch: 6 }, head: { line: 1, ch: 6 } },
        });
    });
});
