import { browser, expect } from '@wdio/globals';
import {
    ensureLivePreview,
    getEditorValue,
    loadSingleFileWorkspace,
    setPluginSettingAndReload,
    setupEditor,
} from '../helpers';

// Keys in Obsidian's own table editor with table-nav on, the default (#167).
// Nav holds vim off while it keeps the cell editor hidden but focused, so a
// key its keymap does not own was typed into the cell: `u`, `zz` and `x` left
// `uName`, `uzzName` and `bxb`. And `i` reaches the cell's vim only once the
// editor is up, 150 ms on, so keys typed straight after it ran as normal-mode
// commands: `iq` started recording a macro and typed nothing.

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

interface CellState {
    session: string | null;
    cellText: string | null;
    insert: boolean | null;
}

/** Real keys, apart by `gap` ms: typing speed matters to the second case. */
async function keys(gap: number, ...k: string[]): Promise<void> {
    for (const key of k) {
        await browser.keys([key]);
        if (gap) await browser.pause(gap);
    }
    await browser.pause(500);
}

async function cellState(): Promise<CellState> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        const cell = (
            view as unknown as {
                editMode?: {
                    tableCell?: {
                        cm?: {
                            state: { doc: { toString(): string } };
                            cm?: {
                                state?: { vim?: { insertMode?: boolean } };
                            };
                        };
                    };
                };
            }
        )?.editMode?.tableCell?.cm;
        const debug = (
            window as unknown as {
                CodeMirrorAdapter?: {
                    getTableDebugState?: () => {
                        nav: { state?: string } | null;
                    };
                };
            }
        ).CodeMirrorAdapter?.getTableDebugState?.();
        return {
            session: debug?.nav?.state ?? null,
            cellText: cell ? cell.state.doc.toString() : null,
            insert: cell?.cm?.state?.vim?.insertMode ?? null,
        };
    })) as CellState;
}

/** Clicks a quarter of the way into the second `b` of `bb`. */
async function clickSecondB(): Promise<void> {
    const point = (await browser.execute(() => {
        const cell = document.querySelector(
            '.cm-table-widget tbody tr:nth-child(2) td',
        );
        if (!cell) return null;
        const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const at = (node.textContent ?? '').indexOf('bb');
            if (at < 0) continue;
            const range = document.createRange();
            range.setStart(node, at + 1);
            range.setEnd(node, at + 2);
            const rect = range.getBoundingClientRect();
            return {
                x: Math.round(rect.left + rect.width / 4),
                y: Math.round(rect.top + rect.height / 2),
            };
        }
        return null;
    })) as { x: number; y: number } | null;
    if (!point) throw new Error('no `bb` cell to click');
    await browser
        .action('pointer')
        .move({ x: point.x, y: point.y, origin: 'viewport' })
        .down()
        .up()
        .perform();
    await browser.pause(600);
}

async function enterTable(): Promise<void> {
    await setupEditor(DOC, { line: 0, ch: 0 });
    await keys(120, 'Escape', 'j', 'j');
}

describe('Keys in table-nav reach the cell only through vim (#167)', function () {
    this.timeout(120000);

    before(async function () {
        await loadSingleFileWorkspace();
        await ensureLivePreview();
        await setPluginSettingAndReload('tableWidgetMode', 'native');
    });

    beforeEach(async function () {
        await loadSingleFileWorkspace();
        await ensureLivePreview();
        await browser.pause(300);
    });

    it('a key nav does not use types nothing into the cell', async function () {
        await enterTable();
        const entered = await cellState();
        await keys(120, 'u', 'z', 'z', 'x', ' ', 'Backspace');
        expect({
            entered,
            after: await cellState(),
            row: (await getEditorValue()).split('\n')[2],
        }).toEqual({
            entered: { session: 'nav', cellText: 'Name', insert: false },
            after: { session: 'nav', cellText: 'Name', insert: false },
            row: '| Name | Value |',
        });
    });

    it('after a click in a cell, x types nothing and i inserts at the click', async function () {
        await setupEditor(DOC, { line: 7, ch: 0 });
        await keys(120, 'Escape');
        await clickSecondB();
        const clicked = await cellState();
        await keys(120, 'x');
        const afterX = await cellState();
        await keys(0, 'i', 'Q');
        expect({ clicked, afterX, inserted: await cellState() }).toEqual({
            clicked: { session: 'nav', cellText: 'bb', insert: false },
            afterX: { session: 'nav', cellText: 'bb', insert: false },
            inserted: { session: 'edit', cellText: 'bQb', insert: true },
        });
    });

    // The keys of `iHi` sent together, well inside the editor's 150 ms.
    it('text typed straight after i is inserted', async function () {
        await enterTable();
        await keys(0, 'i', 'H', 'i');
        expect(await cellState()).toEqual({
            session: 'edit',
            cellText: 'HiName',
            insert: true,
        });
    });

    it('i then Escape at once leaves the cell in normal mode', async function () {
        await enterTable();
        await keys(0, 'i', 'H', 'Escape');
        expect(await cellState()).toEqual({
            session: 'edit',
            cellText: 'HName',
            insert: false,
        });
    });
});
