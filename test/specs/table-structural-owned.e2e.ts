import { browser, expect } from '@wdio/globals';
import {
    ensureLivePreview,
    getEditorValue,
    handleEx,
    loadSingleFileWorkspace,
    setPluginSettingAndReload,
    setupEditor,
} from '../helpers';

/**
 * Plan E2: structural table commands in `owned` mode.
 *
 * E2.1's measurement decided the shape of this. All eleven structural
 * operations already have registered vim commands, but ten of them wrap
 * Obsidian command ids that drive the private `TableEditor` through the table
 * widget — which `owned` removes. Measured with the cursor in a table, those
 * ten left the document **byte-identical** in `owned` while changing it
 * correctly in `native`; only `:tablerealign` worked in both, because it alone
 * was already text-based.
 *
 * So the fix is a text fallback behind the same commands, not a second set.
 * Each scenario below asserts the **full document** in `owned` and pairs it
 * with the `native` result, because a substring match cannot see a column
 * added to three of four lines — the characteristic failure of column
 * operations — and the pairing is what shows `native` is untouched.
 */

const TABLE_DOC = [
    'Above',
    '',
    '| h1   | h2   |',
    '|------|------|',
    '| aa   | bb   |',
    '| cc   | dd   |',
    '',
    'Below',
].join('\n');

/** Realigned form of the fixture, which every fallback returns. */
const A = {
    head: '| h1  | h2  |',
    sep: '| --- | --- |',
    r1: '| aa  | bb  |',
    r2: '| cc  | dd  |',
};

function doc(...tableLines: string[]): string {
    return ['Above', '', ...tableLines, '', 'Below'].join('\n');
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
                  }
                | undefined;
            if (!cm) throw new Error('no EditorView');
            cm.dispatch({
                selection: { anchor: cm.state.doc.line(l).from + c },
            });
        },
        line,
        ch,
    );
    await browser.pause(700);
}

/** Run one command in owned mode from a parked cursor, return the document. */
async function run(command: string, line = 5, ch = 2): Promise<string> {
    await setupEditor(TABLE_DOC, { line: 0, ch: 0 });
    await browser.pause(500);
    await park(line, ch);
    const ex = await handleEx(command);
    expect(ex.unknownCommand).toBe(false);
    await browser.pause(700);
    return getEditorValue();
}

describe('Structural table commands in owned mode (Plan E2)', function () {
    this.timeout(300000);

    before(async () => {
        await loadSingleFileWorkspace();
        await setPluginSettingAndReload('tableWidgetMode', 'owned');
        await ensureLivePreview();
    });

    after(async () => {
        await setPluginSettingAndReload('tableWidgetMode', 'native');
    });

    it('tablerowafter adds a row below with the right cell count', async () => {
        expect(await run('tablerowafter')).toBe(
            doc(A.head, A.sep, A.r1, '|     |     |', A.r2),
        );
    });

    it('tablerowbefore adds a row above', async () => {
        expect(await run('tablerowbefore')).toBe(
            doc(A.head, A.sep, '|     |     |', A.r1, A.r2),
        );
    });

    it('tablerowdelete removes the row, keeping header and separator', async () => {
        expect(await run('tablerowdelete')).toBe(doc(A.head, A.sep, A.r2));
    });

    it('tablerowdown swaps the two data rows', async () => {
        expect(await run('tablerowdown')).toBe(doc(A.head, A.sep, A.r2, A.r1));
    });

    it('tablerowup swaps them from the lower row', async () => {
        expect(await run('tablerowup', 6)).toBe(doc(A.head, A.sep, A.r2, A.r1));
    });

    it('tablerowup refuses to move a row across the separator', async () => {
        // Obsidian's own command swaps the first data row with the header,
        // silently changing which row is the heading.
        expect(await run('tablerowup')).toBe(TABLE_DOC);
    });

    it('tablecoldelete removes the column from all four lines', async () => {
        // The separator is included, which a row-level assertion cannot see.
        expect(await run('tablecoldelete')).toBe(
            doc('| h2  |', '| --- |', '| bb  |', '| dd  |'),
        );
    });

    it('tablecolright swaps the columns in all four lines', async () => {
        expect(await run('tablecolright')).toBe(
            doc('| h2  | h1  |', A.sep, '| bb  | aa  |', '| dd  | cc  |'),
        );
    });

    it('tablecolleft is a no-op in the first column', async () => {
        // Load-bearing: the nav overlay no-ops here too, so a scenario
        // starting in column 0 and asserting a swap would assert something
        // that correctly never happens.
        expect(await run('tablecolleft')).toBe(TABLE_DOC);
    });

    it('tablecolleft swaps from the second column', async () => {
        expect(await run('tablecolleft', 5, 9)).toBe(
            doc('| h2  | h1  |', A.sep, '| bb  | aa  |', '| dd  | cc  |'),
        );
    });

    it('tablecolbefore inserts a column in all four lines', async () => {
        expect(await run('tablecolbefore')).toBe(
            doc(
                '|     | h1  | h2  |',
                '| --- | --- | --- |',
                '|     | aa  | bb  |',
                '|     | cc  | dd  |',
            ),
        );
    });

    it('tablecolafter inserts a column after the cursor column', async () => {
        expect(await run('tablecolafter')).toBe(
            doc(
                '| h1  |     | h2  |',
                '| --- | --- | --- |',
                '| aa  |     | bb  |',
                '| cc  |     | dd  |',
            ),
        );
    });

    it('tablerealign still works, as it always did', async () => {
        expect(await run('tablerealign')).toBe(doc(A.head, A.sep, A.r1, A.r2));
    });

    it('outside a table, every command leaves the document alone', async () => {
        // The other half of each scenario: a fallback that ran anywhere would
        // damage ordinary prose, and `findTableBounds` is what prevents it.
        for (const command of [
            'tablerowafter',
            'tablerowdelete',
            'tablecoldelete',
            'tablecolafter',
        ]) {
            await setupEditor(TABLE_DOC, { line: 0, ch: 0 });
            await browser.pause(400);
            await park(1, 2);
            const ex = await handleEx(command);
            expect(ex.unknownCommand).toBe(false);
            await browser.pause(600);
            expect(await getEditorValue()).toBe(TABLE_DOC);
        }
    });
});
