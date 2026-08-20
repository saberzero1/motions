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

    describe('native table mode (Live Preview)', function () {
        before(async function () {
            await setPluginSettingAndReload('enableTableNav', false);
            await setPluginSettingAndReload('tableWidgetMode', 'native');
            await ensureLivePreview();
        });

        after(async function () {
            await destroyTableCell();
            await setPluginSettingAndReload('enableTableNav', true);
            await setPluginSettingAndReload('tableWidgetMode', 'native');
        });

        it('j should navigate through native table without getting stuck (#136)', async function () {
            await destroyTableCell();
            await setupEditor(TABLE_CONTENT, { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await waitForTableWidget();

            for (let i = 0; i < 7; i++) {
                await browser.keys(['j']);
                await browser.pause(200);
            }
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const pos = await getCursorPos();
            expect(pos.line).toBeGreaterThanOrEqual(7);
        });

        it('j should cross cell rows in native table (#136)', async function () {
            await destroyTableCell();
            await setupEditor(TABLE_CONTENT, { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await waitForTableWidget();

            await browser.keys(['j']);
            await browser.pause(200);
            await browser.keys(['j']);
            await browser.pause(WIDGET_SETTLE);

            const cellBefore = await getTableCellInfo();

            if (cellBefore.inTableCell) {
                const rowBefore = cellBefore.cellRow;
                await browser.keys(['j']);
                await browser.pause(WIDGET_SETTLE);
                const cellAfter = await getTableCellInfo();

                if (cellAfter.inTableCell) {
                    expect(cellAfter.cellRow).toBeGreaterThan(rowBefore);
                } else {
                    const pos = await getCursorPos();
                    expect(pos.line).toBeGreaterThan(5);
                }
            } else {
                const pos = await getCursorPos();
                expect(pos.line).toBeGreaterThan(2);
            }
        });

        it('k should move up through native table without getting stuck (#136)', async function () {
            await destroyTableCell();
            await setupEditor(TABLE_CONTENT, { line: 7, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await waitForTableWidget();

            for (let i = 0; i < 7; i++) {
                await browser.keys(['k']);
                await browser.pause(200);
            }
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const pos = await getCursorPos();
            expect(pos.line).toBeLessThanOrEqual(0);
        });

        it('rapid j presses should consistently advance through cells (#136)', async function () {
            this.timeout(30000);
            await destroyTableCell();

            const LARGE_TABLE = [
                'Top',
                '',
                '| A | B |',
                '|---|---|',
                '| r1 | r1 |',
                '| r2 | r2 |',
                '| r3 | r3 |',
                '| r4 | r4 |',
                '| r5 | r5 |',
                '| r6 | r6 |',
                '',
                'Bottom',
            ].join('\n');

            await setupEditor(LARGE_TABLE, { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await waitForTableWidget();

            for (let i = 0; i < 10; i++) {
                await browser.keys(['j']);
                await browser.pause(100);
            }
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const pos = await getCursorPos();
            expect(pos.line).toBeGreaterThanOrEqual(11);
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

        it('j (remapped to gj) should not get stuck in native table (#136)', async function () {
            await destroyTableCell();
            await setupEditor(TABLE_CONTENT, { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await waitForTableWidget();

            const positions: number[] = [];
            for (let i = 0; i < 7; i++) {
                await browser.keys(['j']);
                await browser.pause(200);
                const pos = await getCursorPos();
                positions.push(pos.line);
            }
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const finalPos = await getCursorPos();
            expect(finalPos.line).toBeGreaterThanOrEqual(7);

            for (let i = 1; i < positions.length; i++) {
                expect(positions[i]).toBeGreaterThanOrEqual(positions[i - 1]);
            }
        });

        it('k (remapped to gk) should not get stuck in native table (#136)', async function () {
            await destroyTableCell();
            await setupEditor(TABLE_CONTENT, { line: 7, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await waitForTableWidget();

            const positions: number[] = [];
            for (let i = 0; i < 7; i++) {
                await browser.keys(['k']);
                await browser.pause(200);
                const pos = await getCursorPos();
                positions.push(pos.line);
            }
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const finalPos = await getCursorPos();
            expect(finalPos.line).toBeLessThanOrEqual(0);

            for (let i = 1; i < positions.length; i++) {
                expect(positions[i]).toBeLessThanOrEqual(positions[i - 1]);
            }
        });

        it('rapid j with remapping should advance monotonically through large table (#136)', async function () {
            this.timeout(30000);
            await destroyTableCell();

            const LARGE_TABLE = [
                'Top',
                '',
                '| A | B |',
                '|---|---|',
                '| r1 | r1 |',
                '| r2 | r2 |',
                '| r3 | r3 |',
                '| r4 | r4 |',
                '| r5 | r5 |',
                '| r6 | r6 |',
                '',
                'Bottom',
            ].join('\n');

            await setupEditor(LARGE_TABLE, { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await waitForTableWidget();

            const positions: number[] = [];
            for (let i = 0; i < 11; i++) {
                await browser.keys(['j']);
                await browser.pause(100);
                const pos = await getCursorPos();
                positions.push(pos.line);
            }
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const finalPos = await getCursorPos();
            expect(finalPos.line).toBeGreaterThanOrEqual(11);

            for (let i = 1; i < positions.length; i++) {
                expect(positions[i]).toBeGreaterThanOrEqual(positions[i - 1]);
            }
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
