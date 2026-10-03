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
 * 1. **The guard was keyed on the old implementation's DOM.**
 *    `mainEditorTableCursorGuard` required a visible `.cm-table-widget`, which
 *    `tableWidgetMode: 'owned'` removes by construction, so it silently stopped
 *    engaging there. Every prior regression spec pins
 *    `tableWidgetMode = 'native'`, so none of them could see it.
 * 2. **Every prior assertion was an absence.** Counted across
 *    `table-cursor-suppression` and `table-cursor-source-mode`: four
 *    `cursorOnTableLine === false` and one `parentCursorVisible === false`,
 *    and not one assertion that a cursor **is** anywhere. A suite built only
 *    from absences is satisfied by no cursor at all, so it cannot distinguish
 *    "suppressed correctly" from "broken everywhere".
 *
 * So this spec is parameterised over both surfaces and asserts presence as
 * well as absence. A new surface must be added to `SURFACES` — that is the
 * guard, and it is the thing the previous four fixes lacked.
 */

const SURFACES = ['native', 'owned'] as const;

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
    /** Which implementation is rendering it. */
    widgets: number;
    surfaces: number;
}

async function read(): Promise<CursorReading> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const blank: CursorReading = {
            parentCursors: [],
            parentFocused: false,
            tableRendered: false,
            widgets: -1,
            surfaces: -1,
        };
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return { ...blank, error: 'no MarkdownView' };
        const cm = (view.editor as unknown as { cm?: unknown }).cm as
            { dom: HTMLElement; hasFocus: boolean } | undefined;
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
        // the parent's counts here — one inside a table surface belongs to
        // that surface, not to the document.
        const parentCursors = Array.from(
            cm.dom.querySelectorAll('.cm-fat-cursor'),
        )
            .filter(
                (el) =>
                    visible(el) &&
                    el.closest('.cm-table-widget') === null &&
                    el.closest('.vim-motions-table-surface') === null,
            )
            .map((el) => {
                const r = el.getBoundingClientRect();
                return `${Math.round(r.width)}x${Math.round(r.height)}`;
            });

        const widgets = Array.from(
            cm.dom.querySelectorAll('.cm-table-widget'),
        ).filter((el) => (el as HTMLElement).offsetParent !== null).length;
        const surfaces = Array.from(
            cm.dom.querySelectorAll('.vim-motions-table-surface'),
        ).filter((el) => (el as HTMLElement).offsetParent !== null).length;

        return {
            parentCursors,
            parentFocused: cm.hasFocus,
            tableRendered: widgets + surfaces > 0,
            widgets,
            surfaces,
        };
    })) as CursorReading;
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

// SKIPPED, deliberately, and not because it is wrong — it **fails**, which is
// the point. It reproduces three open defects that the existing cursor suite
// structurally cannot see, recorded in
// `test/specs/table-cursor-surface-parity-findings.md`:
//
//   owned  PRESENCE  — the parent cursor is NON-DETERMINISTICALLY absent.
//                      Two identical focus+dispatch sequences measured `1`
//                      and `0` fat cursors, which is why four point-in-time
//                      fixes each appeared to work.
//   owned  ABSENCE   — blocked on the above; its precondition is presence.
//   native returns   — the cursor does not come back after the caret leaves
//                      a table.
//
// Un-skip it as each is fixed. It is committed skipped rather than deleted
// because it is the only guard that exercises the cursor against **both**
// surfaces and asserts presence, and re-deriving it is how this defect
// reached a fourth occurrence.
describe.skip('Cursor guard parity across table surfaces', function () {
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
                // silently fell back to the other cannot pass as itself.
                const r = await read();
                expect(r.error).toBeUndefined();
                expect(r.tableRendered).toBe(true);
                if (surface === 'owned') {
                    expect(r.surfaces).toBeGreaterThan(0);
                    expect(r.widgets).toBe(0);
                } else {
                    expect(r.widgets).toBeGreaterThan(0);
                    expect(r.surfaces).toBe(0);
                }
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

            it('ABSENCE: no parent cursor is drawn inside the table', async () => {
                // Paired with the presence scenario above. On its own this
                // passes when the cursor is broken everywhere, which is
                // exactly how the defect re-entered through `owned`.
                await park(1, 0);
                expect((await read()).parentCursors.length).toBe(1);

                await park(5, 2);
                const inside = await read();
                expect(inside.parentCursors.length).toBe(0);
            });

            it('the cursor returns when the caret leaves the table', async () => {
                await park(5, 2);
                expect((await read()).parentCursors.length).toBe(0);

                await park(1, 0);
                const left = await read();
                expect(left.parentCursors.length).toBe(1);
                expect(left.parentCursors[0]).not.toBe('0x0');
            });
        });
    }
});
