import { browser, expect } from '@wdio/globals';
import {
    ensureLivePreview,
    ensureSourceMode,
    getCursorPos,
    getEditorValue,
    getRegisterContent,
    getVimMode,
    handleEx,
    loadSingleFileWorkspace,
    setPluginSettingAndReload,
    setupEditor,
} from '../helpers';

/**
 * Editing assists in a revealed table: insert-mode `Tab`/`Shift-Tab` between
 * cells, and the opt-in `tableAutoRealign`, which realigns an edited table
 * when insert mode ends.
 *
 * Keys go through the real DOM, because `Tab` is a CodeMirror keymap binding
 * that `Vim.handleKey` never reaches. Each scenario asserts the document as
 * well as the caret, since a caret that moved while the document also gained
 * a tab character looks right from the caret alone.
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

interface Surface {
    widgets: number;
    tableCell: boolean;
}

async function surface(): Promise<Surface> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        const cm = (view?.editor as unknown as { cm?: { dom: HTMLElement } })
            ?.cm;
        return {
            widgets: cm
                ? cm.dom.querySelectorAll('.cm-table-widget').length
                : -1,
            tableCell: !!(
                view as unknown as { editMode?: { tableCell?: unknown } }
            )?.editMode?.tableCell,
        };
    })) as Surface;
}

async function keys(...k: string[]): Promise<void> {
    for (const key of k) {
        await browser.keys([key]);
        await browser.pause(80);
    }
    await browser.pause(300);
}

async function shiftTab(): Promise<void> {
    await browser.keys(['Shift', 'Tab', 'NULL']);
    await browser.pause(300);
}

async function typeText(text: string): Promise<void> {
    for (const ch of text) {
        await browser.keys([ch]);
        await browser.pause(40);
    }
    await browser.pause(200);
}

/** Puts the caret on line `line`, column `ch`, by moving there with vim. */
async function moveTo(line: number, ch: number): Promise<void> {
    await keys('Escape');
    await browser.keys(['g', 'g']);
    for (let i = 0; i < line; i++) await browser.keys(['j']);
    await browser.keys(['0']);
    for (let i = 0; i < ch; i++) await browser.keys(['l']);
    await browser.pause(400);
}

async function setAutoRealign(on: boolean): Promise<void> {
    await setPluginSettingAndReload('tableAutoRealign', on);
}

interface ColumnStatus {
    text: string | null;
    mismatched: boolean;
    activeColumn: string[];
}

async function columnStatus(): Promise<ColumnStatus> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const el = document.querySelector<HTMLElement>(
            '.status-bar-item.vim-motions-table-column',
        );
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        const cm = (view?.editor as unknown as { cm?: { dom: HTMLElement } })
            ?.cm;
        const cells = cm
            ? Array.from(
                  cm.dom.querySelectorAll(
                      '.vim-motions-reveal-cell.is-active-column',
                  ),
              ).map((c) => (c.textContent ?? '').trim())
            : [];
        const shown = !!el && el.style.display !== 'none';
        return {
            text: shown ? (el?.textContent ?? '') : null,
            mismatched: !!el?.classList.contains('is-mismatched'),
            activeColumn: cells,
        };
    })) as ColumnStatus;
}

describe('Table reveal editing assists', function () {
    this.timeout(240000);

    before(async function () {
        await loadSingleFileWorkspace();
        await ensureLivePreview();
        await setPluginSettingAndReload('tableWidgetMode', 'reveal');
    });

    beforeEach(async function () {
        await loadSingleFileWorkspace();
        await ensureLivePreview();
        await setAutoRealign(false);
        await setupEditor(DOC, { line: 0, ch: 0 });
        await browser.pause(400);
    });

    after(async function () {
        await setAutoRealign(false);
        await setPluginSettingAndReload('tableWidgetMode', 'native');
    });

    describe('Tab and Shift-Tab in insert mode', function () {
        it('moves to the start of the next cell, then wraps past the separator', async function () {
            await moveTo(4, 2);
            await keys('i');
            await keys('Tab');
            const second = await getCursorPos();
            await keys('Tab');
            const nextRow = await getCursorPos();

            expect(second).toEqual({ line: 4, ch: 9 });
            expect(nextRow).toEqual({ line: 5, ch: 2 });
            expect(await getVimMode()).toBe('insert');
            expect(await getEditorValue()).toBe(DOC);
            const s = await surface();
            expect(s.widgets).toBe(0);
            expect(s.tableCell).toBe(false);
        });

        it('moves back with Shift-Tab, skipping the separator into the header', async function () {
            await moveTo(4, 9);
            await keys('i');
            await shiftTab();
            const first = await getCursorPos();
            await shiftTab();
            const header = await getCursorPos();
            await moveTo(2, 2);
            await keys('i');
            await shiftTab();
            const stays = await getCursorPos();

            expect(first).toEqual({ line: 4, ch: 2 });
            expect(header).toEqual({ line: 2, ch: 9 });
            // The first cell has nowhere to go back to.
            expect(stays).toEqual({ line: 2, ch: 2 });
            expect(await getEditorValue()).toBe(DOC);
        });

        it('adds an empty row from the last cell and types into it', async function () {
            await moveTo(5, 9);
            await keys('i');
            await keys('Tab');
            const pos = await getCursorPos();
            await typeText('cc');
            const lines = (await getEditorValue()).split('\n');

            expect(pos).toEqual({ line: 6, ch: 2 });
            expect(lines[5]).toBe('| bb   | 22    |');
            expect(lines[6]).toBe('| cc     |       |');
            expect(lines[7]).toBe('');
            expect(lines[8]).toBe('Below the table here');
            expect((await surface()).widgets).toBe(0);
        });

        it('does not move between cells in normal mode', async function () {
            await moveTo(4, 2);
            await keys('Tab');
            // Normal-mode `<Tab>` is `<C-i>`, as in Vim, so it may walk the
            // jump list (`moveTo` leaves a `gg` behind); that is covered in
            // `jump-list.e2e.ts`. Before it was mapped it reached Obsidian,
            // which indented the row to `\t| aa   | 11    |`, and an unguarded
            // cell handler puts the caret at column 9 of row 4.
            const pos = await getCursorPos();
            expect(pos).not.toEqual({ line: 4, ch: 9 });
            expect(await getEditorValue()).toBe(DOC);
            expect(await getVimMode()).toBe('normal');
        });

        it('leaves Tab alone outside a table', async function () {
            await moveTo(7, 0);
            await keys('i');
            await keys('Tab');
            const line = (await getEditorValue()).split('\n')[7] ?? '';
            expect(line).not.toBe('Below the table here');
            expect(line.endsWith('Below the table here')).toBe(true);
            expect((await getCursorPos()).line).toBe(7);
        });
    });

    describe('tableAutoRealign', function () {
        it('realigns the edited table when insert mode ends, keeping the caret on its character', async function () {
            await setAutoRealign(true);
            await setupEditor(DOC, { line: 0, ch: 0 });
            await browser.pause(400);
            await moveTo(4, 3);
            await keys('a');
            await typeText('xxxx');
            await keys('Escape');
            await browser.pause(300);

            expect((await getEditorValue()).split('\n').slice(2, 6)).toEqual([
                '| Name   | Value |',
                '| ------ | ----- |',
                '| aaxxxx | 11    |',
                '| bb     | 22    |',
            ]);
            expect(await getCursorPos()).toEqual({ line: 4, ch: 7 });
            expect(await getVimMode()).toBe('normal');
        });

        it('keeps the caret on its character when an earlier column widens', async function () {
            await setAutoRealign(true);
            await setupEditor(DOC, { line: 0, ch: 0 });
            await browser.pause(400);
            await moveTo(4, 3);
            await keys('a');
            await typeText('xxxx');
            await keys('Tab');
            await typeText('z');
            await keys('Escape');
            await browser.pause(300);

            // Before the realign the caret sat on `z` at column 13 of
            // `| aaxxxx   | z11    |`; the realigned row puts `z` at 11.
            const row = (await getEditorValue()).split('\n')[4] ?? '';
            const pos = await getCursorPos();
            expect(row).toBe('| aaxxxx | z11   |');
            expect(pos).toEqual({ line: 4, ch: 11 });
            expect(row[pos.ch]).toBe('z');
        });

        it('takes back the edit and the realign with one u', async function () {
            await setAutoRealign(true);
            await setupEditor(DOC, { line: 0, ch: 0 });
            await browser.pause(400);
            await moveTo(4, 3);
            await keys('a');
            await typeText('xxxx');
            await keys('Escape');
            await browser.pause(300);
            const realigned = await getEditorValue();
            await keys('u');

            expect(realigned).not.toBe(DOC);
            expect(await getEditorValue()).toBe(DOC);
        });

        it('leaves the table as typed when the setting is off', async function () {
            await moveTo(4, 3);
            await keys('a');
            await typeText('xxxx');
            await keys('Escape');
            await browser.pause(300);

            const lines = (await getEditorValue()).split('\n');
            expect(lines[2]).toBe('| Name | Value |');
            expect(lines[4]).toBe('| aaxxxx   | 11    |');
        });

        it('does not rebuild a table whose row is still being typed', async function () {
            await setAutoRealign(true);
            await setupEditor(DOC, { line: 0, ch: 0 });
            await browser.pause(400);
            await moveTo(5, 0);
            await keys('A');
            await typeText(' extra');
            await keys('Escape');
            await browser.pause(300);

            // Realigning would drop `extra`, which has no closing pipe.
            const lines = (await getEditorValue()).split('\n');
            expect(lines[4]).toBe('| aa   | 11    |');
            expect(lines[5]).toBe('| bb   | 22    | extra');
        });

        it('realigns after a change that only deletes', async function () {
            await setAutoRealign(true);
            await setupEditor(DOC, { line: 0, ch: 0 });
            await browser.pause(400);
            await moveTo(2, 2);
            await keys('c', 'w');
            await keys('Escape');
            await browser.pause(300);

            expect((await getEditorValue()).split('\n').slice(2, 6)).toEqual([
                '|     | Value |',
                '| --- | ----- |',
                '| aa  | 11    |',
                '| bb  | 22    |',
            ]);
        });

        it('keeps the blockquote markers of a quoted table', async function () {
            await setAutoRealign(true);
            await ensureSourceMode();
            await setupEditor(
                ['Top', '', '> | a | b |', '> |---|---|', '> | 1 | 2 |'].join(
                    '\n',
                ),
                { line: 0, ch: 0 },
            );
            await browser.pause(400);
            await moveTo(4, 4);
            await keys('a');
            await typeText('234');
            await keys('Escape');
            await browser.pause(300);

            expect((await getEditorValue()).split('\n').slice(2)).toEqual([
                '> | a    | b   |',
                '> | ---- | --- |',
                '> | 1234 | 2   |',
            ]);
            await ensureLivePreview();
        });
    });

    describe('existing cell motions and text objects', function () {
        it('moves between cells with ]| and [| and between rows with ]r and [r', async function () {
            await moveTo(4, 2);
            await keys(']', '|');
            const next = await getCursorPos();
            await keys(']', '|');
            const wrapped = await getCursorPos();
            await keys('[', '|');
            const back = await getCursorPos();
            await keys(']', 'r');
            const down = await getCursorPos();
            await keys('[', 'r', '[', 'r');
            const header = await getCursorPos();

            expect(next).toEqual({ line: 4, ch: 9 });
            expect(wrapped).toEqual({ line: 5, ch: 2 });
            expect(back).toEqual({ line: 4, ch: 9 });
            expect(down).toEqual({ line: 5, ch: 9 });
            // `[r` skips the separator on its way to the header.
            expect(header).toEqual({ line: 2, ch: 9 });
            expect((await surface()).widgets).toBe(0);
        });

        it('operates on a cell with i| and a|', async function () {
            await moveTo(4, 2);
            await keys('y', 'i', '|');
            const yanked = await getRegisterContent('"');
            await keys('d', 'i', '|');
            const inner = (await getEditorValue()).split('\n')[4];
            await keys('u');
            await moveTo(4, 2);
            await keys('d', 'a', '|');
            const around = (await getEditorValue()).split('\n')[4];

            expect(yanked?.text).toBe(' aa   ');
            expect(inner).toBe('|| 11    |');
            expect(around).toBe('| 11    |');
        });
    });

    describe('typing a pipe', function () {
        it('escapes a pipe typed inside a wikilink', async function () {
            await setupEditor(
                DOC.replace('| aa   | 11    |', '| [[page]] | 11 |'),
                { line: 0, ch: 0 },
            );
            await browser.pause(400);
            // On `e` of `page`, so `a` appends inside the brackets.
            await moveTo(4, 7);
            await keys('a');
            await typeText('|alias');
            await keys('Escape');

            expect((await getEditorValue()).split('\n')[4]).toBe(
                '| [[page\\|alias]] | 11 |',
            );
        });

        it('leaves a pipe typed outside a wikilink as a delimiter', async function () {
            await moveTo(4, 3);
            await keys('a');
            await typeText('|z');
            await keys('Escape');

            expect((await getEditorValue()).split('\n')[4]).toBe(
                '| aa|z   | 11    |',
            );
        });

        it('turns || under a header into its separator', async function () {
            await setupEditor('Intro\n\n| Name | Value |', {
                line: 0,
                ch: 0,
            });
            await browser.pause(400);
            await moveTo(2, 0);
            await keys('A', 'Enter');
            await typeText('||');
            const lines = (await getEditorValue()).split('\n');
            const pos = await getCursorPos();
            await keys('Escape');

            expect(lines[3]).toBe('| ---- | ----- |');
            // At the end of the new separator line.
            expect(pos).toEqual({ line: 3, ch: 16 });
            expect((await surface()).widgets).toBe(0);
        });

        it('keeps || as a row of a table that already has a separator', async function () {
            await moveTo(5, 0);
            await keys('o');
            await typeText('||');
            await keys('Escape');

            expect((await getEditorValue()).split('\n')[6]).toBe('||');
        });
    });

    describe('column awareness', function () {
        it('shows the column in the status bar and highlights it', async function () {
            await moveTo(4, 9);
            const second = await columnStatus();
            await moveTo(2, 2);
            const first = await columnStatus();
            await moveTo(7, 0);
            const outside = await columnStatus();

            expect(second.text).toBe('Col 2/2 · Value');
            expect(second.mismatched).toBe(false);
            expect(second.activeColumn).toEqual(['Value', '11', '22']);
            expect(first.text).toBe('Col 1/2 · Name');
            expect(first.activeColumn).toEqual(['Name', 'aa', 'bb']);
            expect(outside.text).toBeNull();
            expect(outside.activeColumn).toEqual([]);
        });

        it('warns when the row has a different number of cells from the header', async function () {
            await setupEditor(
                DOC.replace('| bb   | 22    |', '| bb   | 22    | 33 |'),
                { line: 0, ch: 0 },
            );
            await browser.pause(400);
            await moveTo(5, 2);
            const status = await columnStatus();

            expect(status.text).toBe('Col 1/2 · Name · row has 3 cells');
            expect(status.mismatched).toBe(true);
        });
    });

    describe('column alignment commands', function () {
        it('right-aligns the column with <leader>tar and realigns it', async function () {
            await moveTo(4, 9);
            await keys('\\', 't', 'a', 'r');
            await browser.pause(300);

            expect((await getEditorValue()).split('\n').slice(2, 6)).toEqual([
                '| Name | Value |',
                '| ---- | ----: |',
                '| aa   |    11 |',
                '| bb   |    22 |',
            ]);
        });

        it('centres a column with :tablealigncenter', async function () {
            await moveTo(4, 2);
            const ex = await handleEx('tablealigncenter');
            await browser.pause(300);

            expect(ex.unknownCommand).toBe(false);
            expect((await getEditorValue()).split('\n').slice(2, 6)).toEqual([
                '| Name | Value |',
                '| :--: | ----- |',
                '|  aa  | 11    |',
                '|  bb  | 22    |',
            ]);
        });
    });
});
