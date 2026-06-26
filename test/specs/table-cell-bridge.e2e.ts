import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { sendVimEscape, setupEditor, PAUSE } from '../helpers';

const TABLE_CONTENT = '| A | B |\n|---|---|\n| 1 | 2 |';

async function getStatusBarMode(): Promise<string | null> {
    return (await browser.executeObsidian(() => {
        const el = document.querySelector('.vim-motions-mode');
        if (!el) return null;
        return el.textContent ?? '';
    })) as string | null;
}

async function clickIntoTableCell(): Promise<boolean> {
    return (await browser.executeObsidian(() => {
        const cell = document.querySelector(
            '.cm-table-widget th .table-cell-wrapper,' +
                '.cm-table-widget td .table-cell-wrapper',
        ) as HTMLElement | null;
        if (!cell) return false;
        cell.click();
        return true;
    })) as boolean;
}

async function focusTableCellContent(): Promise<boolean> {
    return (await browser.executeObsidian(() => {
        const cell = document.querySelector(
            '.cm-table-widget th, .cm-table-widget td',
        ) as HTMLElement | null;
        if (!cell) return false;
        cell.click();
        const cmContent = document.querySelector(
            '.cm-table-widget .cm-content',
        ) as HTMLElement | null;
        if (cmContent) cmContent.focus();
        return true;
    })) as boolean;
}

async function isInsideTableWidget(): Promise<boolean> {
    return (await browser.executeObsidian(() => {
        const active = document.activeElement;
        return !!active?.closest('.cm-table-widget');
    })) as boolean;
}

async function getCellContent(): Promise<string> {
    return (await browser.executeObsidian(() => {
        const cmContent = document.querySelector(
            '.cm-table-widget .cm-content',
        ) as
            | (HTMLElement & {
                  cmTile?: { view: { state: { doc: { toString(): string } } } };
              })
            | null;
        if (!cmContent?.cmTile?.view) return '';
        return cmContent.cmTile.view.state.doc.toString();
    })) as string;
}

async function getCellVimMode(): Promise<string> {
    return (await browser.executeObsidian(() => {
        const cmContent = document.querySelector(
            '.cm-table-widget .cm-content',
        ) as
            | (HTMLElement & {
                  cmTile?: {
                      view: { cm?: { state: { vim?: { mode: string } } } };
                  };
              })
            | null;
        const vim = cmContent?.cmTile?.view?.cm?.state?.vim;
        return vim?.mode ?? 'unknown';
    })) as string;
}

describe('Table cell bridge — Live Preview vim support', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    describe('Status bar in table cells', function () {
        it('should show NORMAL when entering a table cell', async function () {
            await setupEditor(TABLE_CONTENT, { line: 0, ch: 2 });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const clicked = await clickIntoTableCell();
            if (!clicked) {
                this.skip();
                return;
            }
            await browser.pause(PAUSE.EDITOR_SETTLE);
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);

            const modeText = await getStatusBarMode();
            if (modeText === null) {
                this.skip();
                return;
            }
            expect(modeText.toLowerCase()).toContain('normal');
        });

        it('should update status bar on mode transitions in a table cell', async function () {
            await setupEditor(TABLE_CONTENT, { line: 0, ch: 2 });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const clicked = await clickIntoTableCell();
            if (!clicked) {
                this.skip();
                return;
            }
            await browser.pause(PAUSE.EDITOR_SETTLE);
            await sendVimEscape();
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const normalMode = await getStatusBarMode();
            if (normalMode === null) {
                this.skip();
                return;
            }
            expect(normalMode.toLowerCase()).toContain('normal');

            await browser.keys(['v']);
            await browser.pause(PAUSE.EDITOR_SETTLE);
            const visualMode = await getStatusBarMode();
            expect(visualMode!.toLowerCase()).toContain('visual');

            await sendVimEscape();
            await browser.pause(PAUSE.EDITOR_SETTLE);
            const backToNormal = await getStatusBarMode();
            expect(backToNormal!.toLowerCase()).toContain('normal');
        });

        it('should show VISUAL after pressing v in a table cell', async function () {
            await setupEditor(TABLE_CONTENT, { line: 0, ch: 2 });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const clicked = await clickIntoTableCell();
            if (!clicked) {
                this.skip();
                return;
            }
            await browser.pause(PAUSE.EDITOR_SETTLE);
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await browser.keys(['v']);
            await browser.pause(PAUSE.MODE_SWITCH);

            const modeText = await getStatusBarMode();
            if (modeText === null) {
                this.skip();
                return;
            }
            expect(modeText.toLowerCase()).toContain('visual');

            await sendVimEscape();
        });
    });

    describe('Vim operations in table cells', function () {
        it('cell editor should have vim mode CSS class', async function () {
            await setupEditor('| hello world | B |\n|---|---|\n| 1 | 2 |', {
                line: 0,
                ch: 2,
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const clicked = await clickIntoTableCell();
            if (!clicked) {
                this.skip();
                return;
            }
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const hasVimMode = (await browser.executeObsidian(() => {
                const scroller = document.querySelector(
                    '.cm-table-widget .cm-scroller',
                );
                return scroller?.classList.contains('cm-vimMode') ?? false;
            })) as boolean;
            expect(hasVimMode).toBe(true);
        });

        it('cell should have isolated single-line document', async function () {
            await setupEditor(TABLE_CONTENT, { line: 0, ch: 2 });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const clicked = await clickIntoTableCell();
            if (!clicked) {
                this.skip();
                return;
            }
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const content = await getCellContent();
            expect(content).not.toContain('|');
            expect(content.split('\n').length).toBe(1);
        });
    });

    describe('Status bar restores on cell exit', function () {
        it('should restore main editor mode on focus out', async function () {
            await setupEditor(TABLE_CONTENT, { line: 0, ch: 2 });
            await browser.pause(PAUSE.EDITOR_SETTLE);
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);

            const modeBefore = await getStatusBarMode();
            if (modeBefore === null) {
                this.skip();
                return;
            }
            expect(modeBefore.toLowerCase()).toContain('normal');

            const clicked = await clickIntoTableCell();
            if (!clicked) {
                this.skip();
                return;
            }
            await browser.pause(PAUSE.EDITOR_SETTLE);

            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (view) view.editor.focus();
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);

            const modeAfter = await getStatusBarMode();
            expect(modeAfter!.toLowerCase()).toContain('normal');
        });
    });
});
