import { browser, expect } from '@wdio/globals';
import {
    ensureLivePreview,
    loadSingleFileWorkspace,
    setPluginSettingAndReload,
    setupEditor,
} from '../helpers';

/**
 * The cursor guard, exercised against **every** table surface.
 *
 * This defect has been fixed four times — #127, #135, #136, #132 — and keeps
 * returning. Two things let it:
 *
 * 1. **The guard was keyed on the wrong question.** It asked whether a table
 *    widget was on screen rather than whether the caret's own table was
 *    rendered as one, so a surface that changes which tables have widgets
 *    breaks it in one direction or the other. Every prior regression spec pins
 *    `tableWidgetMode = 'native'`, so none of them could see it.
 * 2. **Every prior assertion was an absence.** Counted across
 *    `table-cursor-suppression` and `table-cursor-source-mode`: four
 *    `cursorOnTableLine === false` and one `parentCursorVisible === false`,
 *    and not one assertion that a cursor **is** anywhere. A suite built only
 *    from absences is satisfied by no cursor at all, so it cannot distinguish
 *    "suppressed correctly" from "broken everywhere".
 *
 * So this spec is parameterised over every surface and asserts presence as
 * well as absence. A new surface must be added to `SURFACES` — that is the
 * guard, and it is the thing the previous four fixes lacked.
 *
 * The two surfaces expect opposite things inside a table, and that is the
 * point of running both. `native` suppresses the parent's cursor there,
 * because the caret belongs to Obsidian's cell editor or the nav overlay.
 * `reveal` must not: the revealed rows are the parent's own lines and its
 * cursor is the only one, so suppressing it there is the bug.
 */

const SURFACES = ['native', 'reveal'] as const;

const TABLE_DOC = [
    'Line above',
    '',
    '| h1   | h2   |',
    '|------|------|',
    '| aa   | bb   |',
    '',
    'Line below',
].join('\n');

interface CursorReading {
    error?: string;
    /** Visible parent cursor rectangles, outside any table surface. */
    parentCursors: string[];
    parentFocused: boolean;
    /** A table is rendered by one implementation or the other. */
    tableRendered: boolean;
    /** How it is rendered: Obsidian's widget, or revealed editor lines. */
    widgets: number;
    revealedRows: number;
    /** The parent's own cursor offset, to catch an exit that relocates it. */
    head: number;
}

async function read(): Promise<CursorReading> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const blank: CursorReading = {
            parentCursors: [],
            parentFocused: false,
            tableRendered: false,
            widgets: -1,
            revealedRows: -1,
            head: -1,
        };
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return { ...blank, error: 'no MarkdownView' };
        const cm = (view.editor as unknown as { cm?: unknown }).cm as
            | {
                  dom: HTMLElement;
                  hasFocus: boolean;
                  state: { selection: { main: { head: number } } };
              }
            | undefined;
        if (!cm) return { ...blank, error: 'no EditorView' };

        const visible = (el: Element): boolean => {
            const cs = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            return (
                cs.display !== 'none' &&
                cs.visibility !== 'hidden' &&
                r.width > 0 &&
                r.height > 0
            );
        };

        // The fork draws its own block cursor; `.cm-fat-cursor` is it. Only
        // the parent's counts here — one inside Obsidian's widget belongs to
        // a cell editor, not to the document.
        const parentCursors = Array.from(
            cm.dom.querySelectorAll('.cm-fat-cursor'),
        )
            .filter(
                (el) => visible(el) && el.closest('.cm-table-widget') === null,
            )
            .map((el) => {
                const r = el.getBoundingClientRect();
                return `${Math.round(r.width)}x${Math.round(r.height)}`;
            });

        const widgets = Array.from(
            cm.dom.querySelectorAll('.cm-table-widget'),
        ).filter((el) => (el as HTMLElement).offsetParent !== null).length;
        const revealedRows = cm.dom.querySelectorAll(
            '.vim-motions-reveal-row',
        ).length;

        return {
            parentCursors,
            parentFocused: cm.hasFocus,
            tableRendered: widgets + revealedRows > 0,
            widgets,
            revealedRows,
            head: cm.state.selection.main.head,
        };
    })) as CursorReading;
}

/** The document offset `park(line, ch)` targets. */
async function headOf(line: number, ch: number): Promise<number> {
    return (await browser.executeObsidian(
        ({ app, obsidian }, l: number, c: number) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            const cm = (view?.editor as unknown as { cm?: unknown })?.cm as
                | { state: { doc: { line: (n: number) => { from: number } } } }
                | undefined;
            if (!cm) throw new Error('no EditorView');
            return cm.state.doc.line(l).from + c;
        },
        line,
        ch,
    )) as number;
}

async function park(line: number, ch: number): Promise<void> {
    await browser.executeObsidian(
        ({ app, obsidian }, l: number, c: number) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            const cm = (view?.editor as unknown as { cm?: unknown })?.cm as
                | {
                      state: { doc: { line: (n: number) => { from: number } } };
                      dispatch: (s: unknown) => void;
                      focus: () => void;
                  }
                | undefined;
            if (!cm) throw new Error('no EditorView');
            cm.focus();
            cm.dispatch({
                selection: { anchor: cm.state.doc.line(l).from + c },
            });
        },
        line,
        ch,
    );
    await browser.pause(900);
}

// This spec was committed **skipped** because it failed, reproducing three
// defects the existing cursor suite structurally could not see. All three are
// now fixed and it runs; the history is worth keeping, because the shape of
// the mistake recurred four times.
//
// What it recorded, and what each turned out to be:
//
//   owned  PRESENCE  — the parent cursor "non-deterministically" absent: two
//                      identical sequences measured `1` and `0` cursors.
//                      Not non-determinism. The owned surface in isolation is
//                      correct at every step; the `0` was a stale suppression
//                      override leaking out of the preceding `native` test
//                      through the fork's `EditorView`-keyed WeakMap, which
//                      `setPluginSettingAndReload` does not reset.
//   owned  ABSENCE   — the same leak; its precondition is presence.
//   native returns   — real. Entering a table activates table-nav, which
//                      suppresses the cursor, and nav only ever exited from
//                      its own key handling. Anything that moved the caret
//                      without a keystroke left nav active with the caret
//                      outside the table: keys swallowed, cursor suppressed.
//
// The surface after `native` is therefore a **cross-test contamination
// guard** as much as a cursor guard: a suppression override leaking out of the
// `native` scenarios would hide `reveal`'s in-table cursor. The surfaces must
// keep running in one file, `native` first, for it to stay one. The `owned`
// surface that held this position was removed before release.
//
// It also asserts the cursor's position after leaving, not just its presence:
// nav's normal exit relocates the caret via `placeCursorAround`, which is
// right for a keypress and would silently undo a picker jump here.
describe('Cursor guard parity across table surfaces', function () {
    this.timeout(300000);

    before(async () => {
        await loadSingleFileWorkspace();
    });

    after(async () => {
        await setPluginSettingAndReload('tableWidgetMode', 'native');
    });

    for (const surface of SURFACES) {
        describe(`tableWidgetMode: ${surface}`, function () {
            beforeEach(async () => {
                await setPluginSettingAndReload('tableWidgetMode', surface);
                await ensureLivePreview();
                await setupEditor(TABLE_DOC, { line: 0, ch: 0 });
                await browser.pause(800);
            });

            it('renders the table through exactly one implementation', async () => {
                // Establishes which surface is under test, so a mode that
                // silently fell back to the other cannot pass as itself. Both
                // leave an idle table to Obsidian; only `reveal` turns the
                // caret's table into editor lines.
                const r = await read();
                expect(r.error).toBeUndefined();
                expect(r.tableRendered).toBe(true);
                expect(r.widgets).toBeGreaterThan(0);
                expect(r.revealedRows).toBe(0);

                await park(5, 2);
                const inside = await read();
                expect(inside.revealedRows).toBe(surface === 'reveal' ? 3 : 0);
                expect(inside.widgets).toBe(surface === 'reveal' ? 0 : 1);
            });

            it('PRESENCE: a cursor is drawn outside the table', async () => {
                // The assertion every prior fix lacked. Without it, the whole
                // suite is satisfied by a cursor that renders nowhere.
                await park(1, 0);
                const r = await read();
                expect(r.parentFocused).toBe(true);
                expect(r.parentCursors.length).toBe(1);
                // Non-zero extent, so a collapsed 0x0 element cannot pass.
                expect(r.parentCursors[0]).not.toBe('0x0');
            });

            it('inside the table: native suppresses the parent cursor, reveal draws it', async () => {
                // Paired with the presence scenario above. On its own the
                // `native` half passes when the cursor is broken everywhere,
                // and the `reveal` half is the inverse defect: a guard that
                // reads any widget on screen hides the one caret there is.
                await park(1, 0);
                expect((await read()).parentCursors.length).toBe(1);

                await park(5, 2);
                const inside = await read();
                expect(inside.parentCursors.length).toBe(
                    surface === 'reveal' ? 1 : 0,
                );
            });

            it('the cursor returns when the caret leaves the table', async () => {
                await park(5, 2);
                expect((await read()).parentCursors.length).toBe(
                    surface === 'reveal' ? 1 : 0,
                );

                const expectedHead = await headOf(1, 0);
                await park(1, 0);
                const left = await read();
                expect(left.parentCursors.length).toBe(1);
                expect(left.parentCursors[0]).not.toBe('0x0');
                // The caret stays where it was put. Leaving nav mode normally
                // ends in `placeCursorAround`, which is right for a keypress
                // and wrong here: this exit was caused by something else
                // moving the caret — a picker jump, `:42`, a mark — and
                // snapping it back to the table would undo that. Without this
                // the scenario passes whether the exit relocates or not.
                expect(left.head).toBe(expectedHead);
            });
        });
    }
});
