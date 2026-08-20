import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    getCursorPos,
    ensureLivePreview,
    setPluginSettingAndReload,
    sendVimEscape,
    loadLuaConfig,
    PAUSE,
} from '../helpers';

/**
 * Issue #136: Moving in a table pretty much impossible when enableTableNav=false
 *
 * Two scenarios:
 * 1. enableTableNav=false, tableWidgetMode='native': cursor jumps back when
 *    navigating up/down, preventing movement through the table.
 * 2. enableTableNav=false, tableWidgetMode='raw': j/k/arrow keys don't work
 *    at all inside the table.
 *
 * Root cause (revised): applyTableCellMotions() overrides moveByLines,
 * moveByCharacters, and moveByDisplayLines globally when tableWidgetMode
 * is 'native', regardless of enableTableNav. When enableTableNav=false,
 * the overridden motions still intercept j/k (and gj/gk) inside native
 * table cells, calling scheduleCrossing() which races with Obsidian's
 * native cell focus management — producing cursor bounce-back. Users
 * with j→gj / k→gk remappings (common vimrc pattern) are especially
 * affected because the remapping routes through moveByDisplayLines,
 * which is also overridden.
 *
 * Fix: gate applyTableCellMotions on enableTableNav so the motion
 * overrides are not installed when table nav is disabled.
 */

const TABLE_CONTENT = [
    'Line above',
    '',
    '| One   | Two  |',
    '| ----- | ---- |',
    '| Three | Four |',
    '| Five  | Six  |',
    '',
    'Line below',
].join('\n');

const TABLE_CURSOR = { line: 4, ch: 3 };
const WIDGET_SETTLE = 500;

async function destroyTableCell(): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return;
        const editMode = (view as unknown as Record<string, unknown>)
            .editMode as Record<string, unknown> | undefined;
        if (
            editMode?.tableCell &&
            typeof editMode.destroyTableCell === 'function'
        ) {
            (editMode.destroyTableCell as () => void)();
        }
    });
    await browser.pause(PAUSE.MODE_SWITCH);
}

async function waitForTableWidget(): Promise<void> {
    await browser.waitUntil(
        async () =>
            (await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return false;
                const container = (
                    view as unknown as { contentEl: HTMLElement }
                ).contentEl;
                return container.querySelector('.cm-table-widget') !== null;
            })) as boolean,
        { timeout: 6000, interval: 100 },
    );
    await browser.pause(WIDGET_SETTLE);
}

async function getTableCellInfo(): Promise<{
    inTableCell: boolean;
    cellRow: number;
    cellCol: number;
}> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return { inTableCell: false, cellRow: -1, cellCol: -1 };
        const editMode = (view as unknown as Record<string, unknown>)
            .editMode as Record<string, unknown>;
        const cellEditor = editMode?.tableCell as Record<
            string,
            unknown
        > | null;
        if (!cellEditor)
            return { inTableCell: false, cellRow: -1, cellCol: -1 };
        return {
            inTableCell: true,
            cellRow: (cellEditor.cell as Record<string, unknown>)
                ?.row as number,
            cellCol: (cellEditor.cell as Record<string, unknown>)
                ?.col as number,
        };
    })) as { inTableCell: boolean; cellRow: number; cellCol: number };
}

describe('Table movement with enableTableNav=false (#136)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    describe('raw table mode (Live Preview)', function () {
        before(async function () {
            await setPluginSettingAndReload('enableTableNav', false);
            await setPluginSettingAndReload('tableWidgetMode', 'raw');
            await ensureLivePreview();
        });

        after(async function () {
            await setPluginSettingAndReload('enableTableNav', true);
            await setPluginSettingAndReload('tableWidgetMode', 'native');
        });

        it('j should move cursor down one line in raw table (#136)', async function () {
            await setupEditor(TABLE_CONTENT, TABLE_CURSOR);
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);

            const before = await getCursorPos();
            expect(before.line).toBe(4);

            await browser.keys(['j']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const after = await getCursorPos();
            expect(after.line).toBe(5);
        });

        it('k should move cursor up one line in raw table (#136)', async function () {
            await setupEditor(TABLE_CONTENT, { line: 5, ch: 3 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);

            const before = await getCursorPos();
            expect(before.line).toBe(5);

            await browser.keys(['k']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const after = await getCursorPos();
            expect(after.line).toBe(4);
        });

        it('j should exit table and reach line below (#136)', async function () {
            await setupEditor(TABLE_CONTENT, { line: 5, ch: 3 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);

            await browser.keys(['j']);
            await browser.pause(PAUSE.KEY_GAP);
            await browser.keys(['j']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const after = await getCursorPos();
            expect(after.line).toBe(7);
        });
    });

    describe('native table mode with j→gj remapping (#136)', function () {
        before(async function () {
            await loadLuaConfig(
                'vim.keymap.set("n", "j", "gj")\n' +
                    'vim.keymap.set("n", "gj", "j")\n' +
                    'vim.keymap.set("n", "k", "gk")\n' +
                    'vim.keymap.set("n", "gk", "k")\n',
            );
            await setPluginSettingAndReload('enableTableNav', false);
            await setPluginSettingAndReload('tableWidgetMode', 'native');
            await ensureLivePreview();
        });

        after(async function () {
            await destroyTableCell();
            await setPluginSettingAndReload('enableTableNav', true);
            await setPluginSettingAndReload('tableWidgetMode', 'native');
        });

        it('no table-nav overlay should activate (#136)', async function () {
            await destroyTableCell();
            await setupEditor(TABLE_CONTENT, { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await waitForTableWidget();

            const hasHighlight = await browser.executeObsidian(
                ({ app, obsidian }) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return false;
                    return (
                        (
                            view as unknown as { contentEl: HTMLElement }
                        ).contentEl.querySelector(
                            '.vim-motions-table-nav-active',
                        ) !== null
                    );
                },
            );
            expect(hasHighlight).toBe(false);
        });
    });

    describe('raw table mode with j→gj remapping (#136)', function () {
        before(async function () {
            await loadLuaConfig(
                'vim.keymap.set("n", "j", "gj")\n' +
                    'vim.keymap.set("n", "gj", "j")\n' +
                    'vim.keymap.set("n", "k", "gk")\n' +
                    'vim.keymap.set("n", "gk", "k")\n',
            );
            await setPluginSettingAndReload('enableTableNav', false);
            await setPluginSettingAndReload('tableWidgetMode', 'raw');
            await ensureLivePreview();
        });

        after(async function () {
            await setPluginSettingAndReload('enableTableNav', true);
            await setPluginSettingAndReload('tableWidgetMode', 'native');
        });

        it('j (remapped to gj) should move down in raw table (#136)', async function () {
            await setupEditor(TABLE_CONTENT, TABLE_CURSOR);
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);

            const before = await getCursorPos();
            expect(before.line).toBe(4);

            await browser.keys(['j']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const after = await getCursorPos();
            expect(after.line).toBe(5);
        });

        it('k (remapped to gk) should move up in raw table (#136)', async function () {
            await setupEditor(TABLE_CONTENT, { line: 5, ch: 3 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);

            const before = await getCursorPos();
            expect(before.line).toBe(5);

            await browser.keys(['k']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const after = await getCursorPos();
            expect(after.line).toBe(4);
        });
    });
});
