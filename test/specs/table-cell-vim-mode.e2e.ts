import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    getEditorValue,
    vimKeys,
    sendVimEscape,
    getCursorPos,
    ensureLivePreview,
    ensureSourceMode,
    PAUSE,
} from '../helpers';

const TABLE_CONTENT = '| A | B | C |\n|---|---|---|\n| 1 | 2 | 3 |';
const TABLE_DOC =
    'Line above\n\n| AA | BB |\n|-----|-----|\n| cc | dd |\n\nLine below';

async function hasCellEditor(): Promise<boolean> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return false;
        const editMode = (view as unknown as Record<string, unknown>)
            .editMode as Record<string, unknown> | undefined;
        return (
            editMode?.tableCell !== null && editMode?.tableCell !== undefined
        );
    })) as boolean;
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
}

async function getTableCellInfo(): Promise<{
    inTableCell: boolean;
    cellContent: string;
    cellRow: number;
    cellCol: number;
}> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) {
            return {
                inTableCell: false,
                cellContent: '',
                cellRow: -1,
                cellCol: -1,
            };
        }
        const editMode = (view as unknown as Record<string, unknown>)
            .editMode as Record<string, unknown>;
        const cellEditor = editMode?.tableCell as Record<
            string,
            unknown
        > | null;
        if (!cellEditor) {
            return {
                inTableCell: false,
                cellContent: '',
                cellRow: -1,
                cellCol: -1,
            };
        }
        const cellCm = cellEditor.cm as Record<string, unknown>;
        const cellState = cellCm?.state as Record<string, unknown>;
        const doc = cellState?.doc as { toString: () => string } | undefined;
        return {
            inTableCell: true,
            cellContent: doc?.toString() ?? '',
            cellRow: (cellEditor.row as number) ?? -1,
            cellCol: (cellEditor.col as number) ?? -1,
        };
    })) as {
        inTableCell: boolean;
        cellContent: string;
        cellRow: number;
        cellCol: number;
    };
}

async function getCellContent(): Promise<string> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return '';
        const editMode = (view as unknown as Record<string, unknown>)
            .editMode as Record<string, unknown>;
        const cellEditor = editMode?.tableCell as Record<
            string,
            unknown
        > | null;
        if (!cellEditor) return '';
        const cellCm = cellEditor.cm as Record<string, unknown>;
        const cellState = cellCm?.state as Record<string, unknown>;
        const doc = cellState?.doc as { toString: () => string } | undefined;
        return doc?.toString() ?? '';
    })) as string;
}

async function setupTableDoc(): Promise<void> {
    await sendVimEscape();
    await browser.pause(PAUSE.MODE_SWITCH);
    await browser.keys(['Escape']);
    await browser.pause(PAUSE.MODE_SWITCH);
    await setupEditor(TABLE_DOC, { line: 0, ch: 0 });
    await sendVimEscape();
    await browser.pause(PAUSE.MODE_SWITCH);
    await waitForTableWidget();
}

async function enterTableCell(): Promise<void> {
    await browser.keys(['j', 'j']);
    await browser.pause(500);
}

async function setPluginSettings(
    settings: Record<string, unknown>,
): Promise<void> {
    await browser.executeObsidian(({ app }, s: Record<string, unknown>) => {
        const plugin = (
            app as unknown as {
                plugins: {
                    plugins: Record<
                        string,
                        {
                            settings: Record<string, unknown>;
                            saveSettings: () => Promise<void>;
                            reloadFeatures: () => void;
                        }
                    >;
                };
            }
        ).plugins.plugins['vim-motions'];
        if (!plugin) return;
        for (const [k, v] of Object.entries(s)) {
            plugin.settings[k] = v;
        }
        plugin.saveSettings();
        plugin.reloadFeatures();
    }, settings);
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

describe('ir/ar table row text objects (source mode)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await ensureSourceMode();
    });

    it('dir should delete inner row content between pipes', async function () {
        const value = (await browser.executeObsidian(
            ({ app, obsidian }, content: string) => {
                const Vim = (
                    window as unknown as Record<string, unknown> & {
                        CodeMirrorAdapter?: {
                            Vim?: {
                                handleKey: (
                                    cm: unknown,
                                    key: string,
                                ) => boolean;
                            };
                        };
                    }
                ).CodeMirrorAdapter?.Vim;
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view || !Vim) return '';
                view.editor.setValue(content);
                view.editor.setCursor(0, 5);
                view.editor.focus();
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return '';
                Vim.handleKey(adapter, 'd');
                Vim.handleKey(adapter, 'i');
                Vim.handleKey(adapter, 'r');
                return view.editor.getValue();
            },
            TABLE_CONTENT,
        )) as string;

        const headerLine = value.split('\n')[0] ?? '';
        expect(headerLine.replace(/\s/g, '')).toBe('||');
    });

    it('dar should delete the entire row', async function () {
        const value = (await browser.executeObsidian(
            ({ app, obsidian }, content: string) => {
                const Vim = (
                    window as unknown as Record<string, unknown> & {
                        CodeMirrorAdapter?: {
                            Vim?: {
                                handleKey: (
                                    cm: unknown,
                                    key: string,
                                ) => boolean;
                            };
                        };
                    }
                ).CodeMirrorAdapter?.Vim;
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view || !Vim) return '';
                view.editor.setValue(content);
                view.editor.setCursor(2, 5);
                view.editor.focus();
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return '';
                Vim.handleKey(adapter, 'd');
                Vim.handleKey(adapter, 'a');
                Vim.handleKey(adapter, 'r');
                return view.editor.getValue();
            },
            TABLE_CONTENT,
        )) as string;

        expect(value.split('\n').length).toBe(3);
        expect(value.split('\n')[2]?.trim()).toBe('');
    });

    it('yir should yank inner row content', async function () {
        const yanked = (await browser.executeObsidian(
            ({ app, obsidian }, content: string) => {
                const Vim = (
                    window as unknown as Record<string, unknown> & {
                        CodeMirrorAdapter?: {
                            Vim?: {
                                handleKey: (
                                    cm: unknown,
                                    key: string,
                                ) => boolean;
                                getRegisterController: () => {
                                    registers: Record<
                                        string,
                                        { toString: () => string }
                                    >;
                                };
                            };
                        };
                    }
                ).CodeMirrorAdapter?.Vim;
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view || !Vim) return '';
                view.editor.setValue(content);
                view.editor.setCursor(2, 5);
                view.editor.focus();
                const cm = (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>;
                const adapter = cm?.cm;
                if (!adapter) return '';
                Vim.handleKey(adapter, 'y');
                Vim.handleKey(adapter, 'i');
                Vim.handleKey(adapter, 'r');
                const rc = Vim.getRegisterController();
                return rc.registers['"']?.toString() ?? '';
            },
            TABLE_CONTENT,
        )) as string;
        expect(yanked.trim()).toBe('1 | 2 | 3');
    });

    it('ir should be no-op outside a table line', async function () {
        await setupEditor('Not a table line', { line: 0, ch: 5 });
        await vimKeys('d', 'i', 'r');
        expect(await getEditorValue()).toBe('Not a table line');
    });
});

describe('Native table cell navigation', function () {
    before(async function () {
        this.timeout(30000);
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await ensureLivePreview();
    });

    beforeEach(async function () {
        this.timeout(20000);
        await setupTableDoc();
    });

    it('j should cross from header row to data row (skipping separator)', async function () {
        this.timeout(15000);
        await enterTableCell();
        const before = await getTableCellInfo();
        expect(before.inTableCell).toBe(true);
        expect(before.cellContent.trim()).toBe('AA');

        await browser.keys(['j']);
        await browser.pause(500);

        const after = await getTableCellInfo();
        expect(after.inTableCell).toBe(true);
        expect(after.cellContent.trim()).toBe('cc');
    });

    it('k should cross from data row to header row (skipping separator)', async function () {
        this.timeout(15000);
        await enterTableCell();

        await browser.keys(['j']);
        await browser.pause(500);
        const inData = await getTableCellInfo();
        expect(inData.cellContent.trim()).toBe('cc');

        await browser.keys(['k']);
        await browser.pause(500);

        const after = await getTableCellInfo();
        expect(after.inTableCell).toBe(true);
        expect(after.cellContent.trim()).toBe('AA');
    });

    it('l at cell end should move to next cell', async function () {
        this.timeout(15000);
        await enterTableCell();

        const before = await getTableCellInfo();
        expect(before.cellContent.trim()).toBe('AA');

        await browser.keys(['$']);
        await browser.pause(300);
        await browser.keys(['l']);
        await browser.pause(500);

        const after = await getTableCellInfo();
        expect(after.inTableCell).toBe(true);
        expect(after.cellContent.trim()).toBe('BB');
    });

    it('h at cell start should move to previous cell', async function () {
        this.timeout(15000);
        await enterTableCell();

        await browser.keys(['$']);
        await browser.pause(300);
        await browser.keys(['l']);
        await browser.pause(500);
        const inSecond = await getTableCellInfo();
        expect(inSecond.cellContent.trim()).toBe('BB');

        await browser.keys(['0']);
        await browser.pause(300);
        await browser.keys(['h']);
        await browser.pause(500);

        const after = await getTableCellInfo();
        expect(after.inTableCell).toBe(true);
        expect(after.cellContent.trim()).toBe('AA');
    });

    it('j at last data row should exit table downward', async function () {
        this.timeout(15000);
        await enterTableCell();

        await browser.keys(['j']);
        await browser.pause(500);
        const inData = await getTableCellInfo();
        expect(inData.cellContent.trim()).toBe('cc');

        await browser.keys(['j']);
        await browser.pause(500);

        const after = await getTableCellInfo();
        expect(after.inTableCell).toBe(false);

        const pos = await getCursorPos();
        expect(pos.line).toBeGreaterThanOrEqual(5);
    });

    it('k at header row should exit table upward', async function () {
        this.timeout(15000);
        await enterTableCell();

        const inHeader = await getTableCellInfo();
        expect(inHeader.cellContent.trim()).toBe('AA');

        await browser.keys(['k']);
        await browser.pause(500);

        const after = await getTableCellInfo();
        expect(after.inTableCell).toBe(false);

        const pos = await getCursorPos();
        expect(pos.line).toBeLessThanOrEqual(1);
    });

    it('Escape should stay in cell (not exit)', async function () {
        this.timeout(15000);
        await enterTableCell();
        expect(await hasCellEditor()).toBe(true);

        await browser.keys(['Escape']);
        await browser.pause(500);

        expect(await hasCellEditor()).toBe(true);
    });

    it('dj should not cross cell boundary (operator-pending guard)', async function () {
        this.timeout(15000);
        await enterTableCell();

        const before = await getTableCellInfo();
        expect(before.cellContent.trim()).toBe('AA');

        await browser.keys(['Escape']);
        await browser.pause(PAUSE.MODE_SWITCH);
        await browser.keys(['d', 'j']);
        await browser.pause(500);

        const after = await getTableCellInfo();
        expect(after.inTableCell).toBe(true);
    });
});

describe('Normal j/k outside table works unchanged', function () {
    before(async function () {
        this.timeout(30000);
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await ensureLivePreview();
    });

    it('j/k should move normally when not in a table cell', async function () {
        this.timeout(15000);
        await setupEditor('line one\nline two\nline three', {
            line: 0,
            ch: 0,
        });

        await browser.keys(['j']);
        await browser.pause(300);
        const pos1 = await getCursorPos();
        expect(pos1.line).toBe(1);

        await browser.keys(['j']);
        await browser.pause(300);
        const pos2 = await getCursorPos();
        expect(pos2.line).toBe(2);

        await browser.keys(['k']);
        await browser.pause(300);
        const pos3 = await getCursorPos();
        expect(pos3.line).toBe(1);
    });
});

describe('Settings gating: enableTableNav + tableWidgetMode=native', function () {
    before(async function () {
        this.timeout(30000);
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await ensureLivePreview();
    });

    afterEach(async function () {
        await setPluginSettings({
            enableTableNav: true,
            tableWidgetMode: 'native',
        });
    });

    it('cross-cell navigation should be inactive when enableTableNav=false', async function () {
        this.timeout(20000);
        await setPluginSettings({ enableTableNav: false });
        await setupTableDoc();
        await enterTableCell();

        const before = await getTableCellInfo();
        expect(before.inTableCell).toBe(true);

        await browser.keys(['j']);
        await browser.pause(500);

        const after = await getTableCellInfo();
        expect(after.inTableCell).toBe(true);
        expect(after.cellContent.trim()).toBe(before.cellContent.trim());
    });

    it('cross-cell navigation should be inactive when tableWidgetMode=raw', async function () {
        this.timeout(20000);
        await setPluginSettings({ tableWidgetMode: 'raw' });
        await setupTableDoc();

        const hasVisibleWidget = (await browser.executeObsidian(
            ({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return false;
                const container = (
                    view as unknown as { contentEl: HTMLElement }
                ).contentEl;
                const widgets = container.querySelectorAll('.cm-table-widget');
                for (const w of widgets) {
                    const style = window.getComputedStyle(w);
                    if (style.display !== 'none') return true;
                }
                return false;
            },
        )) as boolean;

        expect(hasVisibleWidget).toBe(false);
    });
});
