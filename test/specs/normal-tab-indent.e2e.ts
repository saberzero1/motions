import { $, $$, browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    getCursorPos,
    getEditorValue,
    getVimMode,
    ensureLivePreview,
    ensureSourceMode,
    setPluginSetting,
    setPluginSettingAndReload,
    sendVimEscape,
    loadLuaConfig,
    vimHandleKeys,
    PAUSE,
} from '../helpers';

/**
 * #237: normal-mode `<Tab>` is `<C-i>` (Vim and Neovim), and `set tabindent`
 * makes it `>>` and `<S-Tab>` `<<`. Real keys throughout: with the option
 * off, `<S-Tab>` is handed back to Obsidian's editor keymap, which is the
 * path these tests exist to cover.
 */

const TABLE = [
    'Line above',
    '',
    '| One   | Two  |',
    '| ----- | ---- |',
    '| Three | Four |',
    '| Five  | Six  |',
    '',
    'Line below',
].join('\n');

async function press(...keys: string[][]): Promise<void> {
    for (const k of keys) {
        await browser.keys(k);
        await browser.pause(PAUSE.KEY_GAP);
    }
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

async function shiftTab(): Promise<void> {
    await browser.keys(['Shift', 'Tab']);
    await browser.keys(['Shift']);
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

async function cellInfo(): Promise<{ row: number; col: number } | null> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(
            obsidian.MarkdownView,
        ) as unknown as {
            editMode?: { tableCell?: { cell?: { row: number; col: number } } };
        } | null;
        const cell = view?.editMode?.tableCell?.cell;
        return cell ? { row: cell.row, col: cell.col } : null;
    })) as { row: number; col: number } | null;
}

async function destroyCell(): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(
            obsidian.MarkdownView,
        ) as unknown as {
            editMode?: { tableCell?: unknown; destroyTableCell?: () => void };
        } | null;
        if (view?.editMode?.tableCell) view.editMode.destroyTableCell?.();
    });
    await browser.pause(PAUSE.MODE_SWITCH);
}

/** Click the second row's second cell of a native table and return its cell. */
async function openSecondCell(): Promise<{ row: number; col: number } | null> {
    await destroyCell();
    await setupEditor(TABLE, { line: 0, ch: 0 });
    await sendVimEscape();
    await browser.waitUntil(
        async () => await $('.cm-table-widget td').isExisting(),
        { timeout: 6000, interval: 100 },
    );
    await browser.pause(500);
    const cells = await $$('.cm-table-widget td').getElements();
    await cells[1]?.click();
    await browser.pause(PAUSE.EDITOR_SETTLE);
    await sendVimEscape();
    return cellInfo();
}

describe('Normal-mode Tab and Shift-Tab (#237)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await ensureSourceMode();
    });

    afterEach(async function () {
        await browser.keys(['Shift']);
        await sendVimEscape();
    });

    describe('tabindent off (the default)', function () {
        before(async function () {
            await setPluginSetting('normalTabIndent', false);
        });

        it('Tab walks forward through the jump list and indents nothing', async function () {
            await setupEditor('- a\n- b\n- c', { line: 0, ch: 0 });
            await vimHandleKeys('G');
            await vimHandleKeys('\x0f'); // <C-o>
            await press(['Tab']);
            expect({
                line: (await getCursorPos()).line,
                text: await getEditorValue(),
            }).toEqual({ line: 2, text: '- a\n- b\n- c' });
        });

        it('Shift-Tab still outdents through Obsidian, as before', async function () {
            await setupEditor('- a\n\t- b\n- c', { line: 1, ch: 3 });
            await sendVimEscape();
            await shiftTab();
            expect(await getEditorValue()).toBe('- a\n- b\n- c');
            expect(await getVimMode()).toBe('normal');
        });
    });

    describe('tabindent on', function () {
        before(async function () {
            await setPluginSetting('normalTabIndent', true);
        });
        after(async function () {
            await setPluginSetting('normalTabIndent', false);
        });

        it('Tab indents the line as >> does', async function () {
            await setupEditor('- a\n- b\n- c', { line: 1, ch: 2 });
            await sendVimEscape();
            await press(['Tab']);
            expect(await getEditorValue()).toBe('- a\n\t- b\n- c');
            expect(await getVimMode()).toBe('normal');
        });

        // Obsidian's own Shift-Tab gives the same text on one line, so the
        // count is what shows this is <<: Obsidian outdents only the line.
        it('Shift-Tab outdents as << does, count included', async function () {
            await setupEditor('- a\n\t- b\n\t- c\n- d', { line: 1, ch: 3 });
            await sendVimEscape();
            await press(['2']);
            await shiftTab();
            expect(await getEditorValue()).toBe('- a\n- b\n- c\n- d');
        });

        it('a count indents that many lines, and . repeats it', async function () {
            await setupEditor('- a\n- b\n- c\n- d', { line: 1, ch: 2 });
            await sendVimEscape();
            await press(['2'], ['Tab']);
            expect(await getEditorValue()).toBe('- a\n\t- b\n\t- c\n- d');
            await press(['.']);
            expect(await getEditorValue()).toBe('- a\n\t\t- b\n\t\t- c\n- d');
        });

        it('Ctrl+I still walks forward through the jump list', async function () {
            await setupEditor('- a\n- b\n- c', { line: 0, ch: 0 });
            await vimHandleKeys('G');
            await vimHandleKeys('\x0f'); // <C-o>
            await vimHandleKeys('\t'); // <C-i>
            expect({
                line: (await getCursorPos()).line,
                text: await getEditorValue(),
            }).toEqual({ line: 2, text: '- a\n- b\n- c' });
        });

        it('set through Lua as vim.opt.tabindent', async function () {
            await setPluginSetting('normalTabIndent', false);
            await loadLuaConfig('vim.opt.tabindent = true\n');
            await ensureSourceMode();
            await setupEditor('plain', { line: 0, ch: 2 });
            await sendVimEscape();
            await press(['Tab']);
            expect(await getEditorValue()).toBe('\tplain');
            await loadLuaConfig('');
            await setPluginSetting('normalTabIndent', true);
        });
    });

    describe('in a native table cell', function () {
        before(async function () {
            await setPluginSettingAndReload('enableTableNav', false);
            await setPluginSettingAndReload('tableWidgetMode', 'native');
            await ensureLivePreview();
        });
        after(async function () {
            await destroyCell();
            await setPluginSetting('normalTabIndent', false);
            await setPluginSettingAndReload('enableTableNav', true);
            await setPluginSettingAndReload('tableWidgetMode', 'auto');
            await ensureSourceMode();
        });

        for (const on of [false, true]) {
            it(`Tab and Shift-Tab move between cells with tabindent ${on ? 'on' : 'off'}`, async function () {
                await setPluginSetting('normalTabIndent', on);
                const start = await openSecondCell();
                await press(['Tab']);
                await browser.pause(300);
                const afterTab = await cellInfo();
                await shiftTab();
                await browser.pause(300);
                const afterShiftTab = await cellInfo();
                await destroyCell();
                expect({ start, afterTab, afterShiftTab }).toEqual({
                    start: { row: 1, col: 1 },
                    afterTab: { row: 2, col: 0 },
                    afterShiftTab: { row: 1, col: 1 },
                });
                expect(await getEditorValue()).toBe(TABLE);
            });
        }
    });
});
