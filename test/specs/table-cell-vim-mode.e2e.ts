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

async function getCellVimMode(): Promise<string> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return 'unknown';
        const editMode = (view as unknown as Record<string, unknown>)
            .editMode as Record<string, unknown> | undefined;
        const cellEditor = editMode?.tableCell as Record<
            string,
            unknown
        > | null;
        if (!cellEditor) return 'unknown';
        const cellEditorView = cellEditor.cm as
            | Record<string, unknown>
            | undefined;
        const adapter = (
            cellEditorView as { cm?: Record<string, unknown> } | undefined
        )?.cm as Record<string, unknown> | undefined;
        const vimState = (adapter?.state as Record<string, unknown> | undefined)
            ?.vim as Record<string, unknown> | undefined;
        if (!vimState) return 'unknown';
        if (vimState.insertMode) return 'insert';
        if (vimState.visualMode) return 'visual';
        return 'normal';
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

async function hasTableNavHighlight(): Promise<boolean> {
    return (await browser.executeObsidian(() => {
        return document.querySelector('.vim-motions-table-nav-active') !== null;
    })) as boolean;
}

async function getHighlightedCell(): Promise<{
    row: number;
    col: number;
} | null> {
    return (await browser.executeObsidian(() => {
        const active = document.querySelector(
            '.vim-motions-table-nav-active',
        ) as HTMLElement | null;
        if (!active) return null;
        const cell = active.closest('td, th') ?? active;
        const cellEl = cell as HTMLTableCellElement;
        const rowEl = cellEl.closest('tr') as HTMLTableRowElement | null;
        if (!rowEl) return null;
        const tableEl = rowEl.closest('table') as HTMLTableElement | null;
        if (!tableEl) return null;
        const allRows = Array.from(tableEl.rows);
        const rowIndex = allRows.indexOf(rowEl);
        return { row: rowIndex, col: cellEl.cellIndex ?? 0 };
    })) as { row: number; col: number } | null;
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
        const before = await getHighlightedCell();
        expect(before).not.toBeNull();
        expect(before!.row).toBe(0);

        await browser.keys(['j']);
        await browser.pause(300);

        const after = await getHighlightedCell();
        expect(after).not.toBeNull();
        expect(after!.row).toBeGreaterThan(before!.row);
    });

    it('k should cross from data row to header row (skipping separator)', async function () {
        this.timeout(15000);
        await enterTableCell();

        await browser.keys(['j']);
        await browser.pause(300);
        const inData = await getHighlightedCell();
        expect(inData).not.toBeNull();
        expect(inData!.row).toBeGreaterThan(0);

        await browser.keys(['k']);
        await browser.pause(300);

        const after = await getHighlightedCell();
        expect(after).not.toBeNull();
        expect(after!.row).toBe(0);
    });

    it('l should move to next cell', async function () {
        this.timeout(15000);
        await enterTableCell();
        const before = await getHighlightedCell();
        expect(before).not.toBeNull();
        expect(before!.col).toBe(0);

        await browser.keys(['l']);
        await browser.pause(300);

        const after = await getHighlightedCell();
        expect(after).not.toBeNull();
        expect(after!.col).toBe(1);
    });

    it('h should move to previous cell', async function () {
        this.timeout(15000);
        await enterTableCell();

        await browser.keys(['l']);
        await browser.pause(300);
        const inSecond = await getHighlightedCell();
        expect(inSecond).not.toBeNull();
        expect(inSecond!.col).toBe(1);

        await browser.keys(['h']);
        await browser.pause(300);

        const after = await getHighlightedCell();
        expect(after).not.toBeNull();
        expect(after!.col).toBe(0);
    });

    it('j at last data row should exit table downward', async function () {
        this.timeout(15000);
        await enterTableCell();

        await browser.keys(['j']);
        await browser.pause(300);
        expect(await hasTableNavHighlight()).toBe(true);

        await browser.keys(['j']);
        await browser.pause(500);

        expect(await hasTableNavHighlight()).toBe(false);
    });

    it('k at header row should exit table upward', async function () {
        this.timeout(15000);
        await enterTableCell();
        expect(await hasTableNavHighlight()).toBe(true);

        await browser.keys(['k']);
        await browser.pause(500);

        expect(await hasTableNavHighlight()).toBe(false);
    });

    it('Escape in nav mode should exit table', async function () {
        this.timeout(15000);
        await enterTableCell();
        expect(await hasTableNavHighlight()).toBe(true);

        await browser.keys(['Escape']);
        await browser.pause(500);

        expect(await hasTableNavHighlight()).toBe(false);
    });

    it('j back into table after exit should re-activate table-nav', async function () {
        this.timeout(20000);
        await setupTableDoc();
        await enterTableCell();
        expect(await hasTableNavHighlight()).toBe(true);

        await browser.keys(['Escape']);
        await browser.pause(500);
        expect(await hasTableNavHighlight()).toBe(false);

        await browser.keys(['j']);
        await browser.pause(500);

        expect(await hasTableNavHighlight()).toBe(true);
    });

    it('cursor should not snap back after exit and insert mode round-trip', async function () {
        this.timeout(25000);
        await setupTableDoc();
        await enterTableCell();

        await browser.keys(['j']);
        await browser.pause(300);
        await browser.keys(['j']);
        await browser.pause(500);

        expect(await hasTableNavHighlight()).toBe(false);
        const exitPos = await getCursorPos();

        await browser.keys(['i']);
        await browser.pause(300);
        await browser.keys(['Escape']);
        await browser.pause(500);

        const afterEsc = await getCursorPos();
        expect(afterEsc.line).toBe(exitPos.line);
    });

    it('j in cell-editor normal mode should return to table-nav at destination cell', async function () {
        this.timeout(25000);
        await setupTableDoc();
        await enterTableCell();
        expect(await hasTableNavHighlight()).toBe(true);
        const entryCell = await getHighlightedCell();
        expect(entryCell).not.toBeNull();

        await browser.keys(['i']);
        await browser.pause(500);
        expect(await hasCellEditor()).toBe(true);

        await browser.keys(['x']);
        await browser.pause(200);

        await browser.keys(['Escape']);
        await browser.pause(300);

        await browser.keys(['j']);
        await browser.pause(500);

        expect(await hasTableNavHighlight()).toBe(true);
        const afterJ = await getHighlightedCell();
        expect(afterJ).not.toBeNull();
        expect(afterJ!.row).toBeGreaterThan(entryCell!.row);
    });

    it('i should enter cell edit from nav mode', async function () {
        this.timeout(15000);
        await enterTableCell();
        expect(await hasTableNavHighlight()).toBe(true);

        await browser.keys(['i']);
        await browser.pause(500);

        expect(await hasCellEditor()).toBe(true);
        const info = await getTableCellInfo();
        expect(info.cellContent.trim()).toBe('AA');
    });

    it('Escape in cell edit should return to nav mode', async function () {
        this.timeout(15000);
        await enterTableCell();

        await browser.keys(['i']);
        await browser.pause(500);
        expect(await hasCellEditor()).toBe(true);

        await browser.keys(['Escape']);
        await browser.pause(300);
        await browser.keys(['Escape']);
        await browser.pause(300);

        expect(await hasTableNavHighlight()).toBe(true);
    });

    it('single Escape from insert mode should NOT exit to nav (#136)', async function () {
        this.timeout(20000);
        await setupTableDoc();
        await enterTableCell();
        expect(await hasTableNavHighlight()).toBe(true);

        await browser.keys(['i']);
        await browser.pause(800);
        expect(await hasCellEditor()).toBe(true);

        const modeBefore = await getCellVimMode();
        expect(modeBefore).toBe('insert');

        await browser.keys(['Escape']);
        await browser.pause(300);

        const stillHasCell = await hasCellEditor();
        const modeAfter = await getCellVimMode();
        expect(stillHasCell).toBe(true);
        expect(modeAfter).toBe('normal');
        expect(await hasTableNavHighlight()).toBe(false);
    });

    it('Escape after Enter (normal-mode cell entry) should return to nav mode (#136)', async function () {
        this.timeout(20000);
        await setupTableDoc();
        await enterTableCell();
        expect(await hasTableNavHighlight()).toBe(true);

        await browser.keys(['Enter']);
        await browser.pause(800);
        expect(await hasCellEditor()).toBe(true);

        const cellMode = await getCellVimMode();
        expect(cellMode).toBe('normal');

        await browser.keys(['Escape']);
        await browser.pause(500);

        expect(await hasTableNavHighlight()).toBe(true);
    });

    it('cursor in cell normal mode should not span full cell height (#136)', async function () {
        this.timeout(20000);
        await setupTableDoc();
        await enterTableCell();
        expect(await hasTableNavHighlight()).toBe(true);

        await browser.keys(['Enter']);
        await browser.pause(800);
        expect(await hasCellEditor()).toBe(true);

        const dims = (await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return null;
            const editMode = (view as unknown as Record<string, unknown>)
                .editMode as Record<string, unknown> | undefined;
            const cellEditor = editMode?.tableCell as Record<
                string,
                unknown
            > | null;
            if (!cellEditor) return null;
            const cellCm = cellEditor.cm as {
                scrollDOM?: HTMLElement;
                dom?: HTMLElement;
            } | null;
            const scrollDOM = cellCm?.scrollDOM;
            if (!scrollDOM) return null;
            const cursorLayer = scrollDOM.querySelector(
                '.cm-vimCursorLayer',
            ) as HTMLElement | null;
            const cursorEl = scrollDOM.querySelector(
                '.cm-fat-cursor',
            ) as HTMLElement | null;
            const lineEl = scrollDOM.querySelector(
                '.cm-line',
            ) as HTMLElement | null;
            const cellEl = cellEditor.cell as { el?: HTMLElement } | undefined;
            return {
                cursorHeight: cursorEl ? cursorEl.offsetHeight : -1,
                lineHeight: lineEl ? lineEl.offsetHeight : -1,
                cellHeight: cellEl?.el ? cellEl.el.offsetHeight : -1,
                hasCursorLayer: !!cursorLayer,
                cursorLayerDisplay: cursorLayer?.style.display ?? 'N/A',
                cursorLayerChildCount: cursorLayer?.children.length ?? 0,
                hasCursorEl: !!cursorEl,
            };
        })) as {
            cursorHeight: number;
            lineHeight: number;
            cellHeight: number;
            hasCursorLayer: boolean;
            cursorLayerDisplay: string;
            cursorLayerChildCount: number;
            hasCursorEl: boolean;
        } | null;

        expect(dims).not.toBeNull();
        if (dims && dims.hasCursorEl && dims.lineHeight > 0) {
            expect(dims.cursorHeight).toBeLessThanOrEqual(
                dims.lineHeight * 1.5,
            );
        }
        if (
            dims &&
            dims.hasCursorEl &&
            dims.cellHeight > 0 &&
            dims.cellHeight > dims.lineHeight * 2
        ) {
            expect(dims.cursorHeight).toBeLessThan(dims.cellHeight);
        }
    });

    it('j after Enter cell edit should navigate to next row (#136)', async function () {
        this.timeout(25000);
        await setupTableDoc();
        await enterTableCell();
        expect(await hasTableNavHighlight()).toBe(true);
        const entryCell = await getHighlightedCell();
        expect(entryCell).not.toBeNull();

        await browser.keys(['Enter']);
        await browser.pause(800);
        expect(await hasCellEditor()).toBe(true);

        await browser.keys(['Escape']);
        await browser.pause(500);
        expect(await hasTableNavHighlight()).toBe(true);

        await browser.keys(['j']);
        await browser.pause(300);

        const afterJ = await getHighlightedCell();
        expect(afterJ).not.toBeNull();
        expect(afterJ!.row).toBeGreaterThan(entryCell!.row);
    });

    it('dd should delete row in nav mode', async function () {
        this.timeout(20000);
        const multiRowTable =
            'Above\n\n| A | B |\n|---|---|\n| r1a | r1b |\n| r2a | r2b |\n| r3a | r3b |\n\nBelow';
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);
        await browser.keys(['Escape']);
        await browser.pause(PAUSE.MODE_SWITCH);
        await setupEditor(multiRowTable, { line: 0, ch: 0 });
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);
        await waitForTableWidget();

        await enterTableCell();
        await browser.keys(['j']);
        await browser.pause(300);

        const valueBefore = await getEditorValue();
        expect(valueBefore).toContain('r2a');

        await browser.keys(['j']);
        await browser.pause(300);

        await browser.keys(['d']);
        await browser.pause(100);
        await browser.keys(['d']);
        await browser.pause(800);

        const valueAfter = await getEditorValue();
        expect(valueAfter).not.toContain('r2a');
        expect(valueAfter).not.toContain('r2b');
        expect(valueAfter).toContain('r1a');
        expect(valueAfter).toContain('r3a');
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

describe('Table mode combinations', function () {
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

    it('native + enableTableNav=true: table-nav overlay should activate', async function () {
        this.timeout(20000);
        await setPluginSettings({
            enableTableNav: true,
            tableWidgetMode: 'native',
        });
        await setupTableDoc();
        await enterTableCell();

        expect(await hasTableNavHighlight()).toBe(true);
    });

    it('native + enableTableNav=false: cross-cell j should work without nav overlay', async function () {
        this.timeout(20000);
        await setPluginSettings({
            enableTableNav: false,
            tableWidgetMode: 'native',
        });
        await setupTableDoc();
        await enterTableCell();

        expect(await hasTableNavHighlight()).toBe(false);

        const before = await getTableCellInfo();
        expect(before.inTableCell).toBe(true);
        expect(before.cellContent.trim()).toBe('AA');

        await browser.keys(['j']);
        await browser.waitUntil(
            async () => {
                const info = await getTableCellInfo();
                return info.inTableCell && info.cellContent.trim() === 'cc';
            },
            { timeout: 3000, interval: 100 },
        );
    });

    it('native + enableTableNav=false: cross-cell l should work without nav overlay', async function () {
        this.timeout(20000);
        await setPluginSettings({
            enableTableNav: false,
            tableWidgetMode: 'native',
        });
        await setupTableDoc();
        await enterTableCell();

        expect(await hasTableNavHighlight()).toBe(false);

        const before = await getTableCellInfo();
        expect(before.cellContent.trim()).toBe('AA');

        await browser.keys(['$']);
        await browser.pause(300);
        await browser.keys(['l']);
        await browser.waitUntil(
            async () => {
                const info = await getTableCellInfo();
                return info.inTableCell && info.cellContent.trim() === 'BB';
            },
            { timeout: 3000, interval: 100 },
        );
    });

    it('raw mode: table widget should be hidden', async function () {
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
                for (const w of Array.from(widgets)) {
                    const style = window.getComputedStyle(w);
                    if (style.display !== 'none') return true;
                }
                return false;
            },
        )) as boolean;

        expect(hasVisibleWidget).toBe(false);
    });
});
