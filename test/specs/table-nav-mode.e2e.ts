import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    getEditorValue,
    sendVimEscape,
    getCursorPos,
    getVimMode,
    ensureSourceMode,
    PAUSE,
} from '../helpers';

const TABLE_DOC =
    'Line above\n\n| AA | BB |\n|-----|-----|\n| cc | dd |\n\nLine below';
const TABLE_3COL =
    'Above\n\n| A | B | C |\n|---|---|---|\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |\n\nBelow';
const TABLE_SINGLE_ROW = '| H1 | H2 |\n|----|----|  \n| x  | y  |';
const TABLE_HEADER_ONLY = '| H1 | H2 |\n|----|----|\n';
const TWO_TABLES =
    'Top\n\n| T1A | T1B |\n|-----|-----|\n| t1  | t1  |\n\nMiddle\n\n| T2A | T2B |\n|-----|-----|\n| t2  | t2  |';
const TABLE_AT_END = 'Some text\n\n| A | B |\n|---|---|\n| 1 | 2 |';
const TABLE_4ROW =
    'Top\n\n| H1 | H2 |\n|-----|-----|\n| r1 | r1b |\n| r2 | r2b |\n| r3 | r3b |\n| r4 | r4b |\n\nBottom';

const ENTRY_DEBOUNCE = 300;
const CELL_EDIT_PAUSE = 800;
const STRUCTURAL_PAUSE = 100;
const WIDGET_REBUILD_PAUSE = 200;

async function ensureLivePreview(): Promise<void> {
    const isLP = (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return false;
        const state = view.getState();
        return state.mode === 'source' && state.source !== true;
    })) as boolean;
    if (!isLP) {
        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            const state = view.getState();
            state.mode = 'source';
            state.source = false;
            view.setState(state, { history: false });
        });
        await browser.pause(PAUSE.EDITOR_SETTLE * 2);
    }
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

async function setupTableDoc(content = TABLE_DOC): Promise<void> {
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
    await sendVimEscape();
    await browser.pause(PAUSE.MODE_SWITCH);
    await browser.keys(['Escape']);
    await browser.pause(PAUSE.MODE_SWITCH);
    await browser.keys(['Escape']);
    await browser.pause(PAUSE.MODE_SWITCH);
    await browser.keys(['Escape']);
    await browser.pause(PAUSE.MODE_SWITCH);
    await setupEditor(content, { line: 0, ch: 0 });
    await sendVimEscape();
    await browser.pause(PAUSE.MODE_SWITCH);
    await waitForTableWidget();
    await browser.pause(WIDGET_REBUILD_PAUSE);
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
        if (vimState.selectMode) return 'select';
        if (vimState.insertMode && vimState.virtualReplace) return 'vreplace';
        if (vimState.insertMode) return 'insert';
        if (vimState.visualMode) return 'visual';
        if (vimState.insertModeReturn) return 'insert-normal';
        return 'normal';
    })) as string;
}

async function enterTableNav(): Promise<void> {
    await browser.keys(['j', 'j']);
    await browser.pause(ENTRY_DEBOUNCE);
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

describe.skip('Table-nav diagnostics (debug aids, not CI tests)', function () {
    before(async function () {
        this.timeout(30000);
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    it.skip('[DIAGNOSTIC] should dump cell.el DOM info and focus state during table-nav', async function () {
        this.timeout(20000);
        await ensureLivePreview();
        await setPluginSettings({
            enableTableNav: true,
            tableWidgetMode: 'native',
        });
        await setupTableDoc();
        await enterTableNav();

        const debug = await browser.executeObsidian(() => {
            const g = globalThis as Record<string, unknown>;
            return {
                debug3: g.__tableNavDebug3 ?? 'not set',
                exitReason: g.__tableNavExitReason ?? 'not called',
                scopeHandlerCalled: g.__scopeHandlerCalled ?? 'not set',
                scopeHandlerLastKey: g.__scopeHandlerLastKey ?? 'not set',
            };
        });
        console.log('[DEBUG pre-key]', JSON.stringify(debug, null, 2));

        await browser.keys(['l']);
        await browser.pause(200);

        const debug2 = await browser.executeObsidian(() => {
            const g = globalThis as Record<string, unknown>;
            return {
                scopeHandlerCalled: g.__scopeHandlerCalled ?? 'not set',
                scopeHandlerLastKey: g.__scopeHandlerLastKey ?? 'not set',
                hasHighlight:
                    document.querySelector('.vim-motions-table-nav-active') !==
                    null,
            };
        });
        console.log('[DEBUG post-key]', JSON.stringify(debug2, null, 2));

        const diag = await browser.executeObsidian(({ app, obsidian }) => {
            const activeEl = document.activeElement;
            const activeTag = activeEl?.tagName ?? 'null';
            const activeClass =
                (activeEl as HTMLElement)?.className?.slice(0, 80) ?? 'null';

            const highlight = document.querySelector(
                '.vim-motions-table-nav-active',
            ) as HTMLElement | null;
            const highlightTag = highlight?.tagName ?? 'null';
            const highlightClass = highlight?.className?.slice(0, 80) ?? 'null';
            const highlightParentTag =
                highlight?.parentElement?.tagName ?? 'null';
            const highlightParentClass =
                highlight?.parentElement?.className?.slice(0, 80) ?? 'null';
            const closestTd = highlight?.closest('td, th');
            const closestTdTag = closestTd?.tagName ?? 'null';

            const navModeEl = document.querySelector(
                '.vim-motions-table-nav-mode',
            );
            const navModeTag = navModeEl?.tagName ?? 'null';

            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            const editMode = view
                ? ((view as unknown as Record<string, unknown>)
                      .editMode as Record<string, unknown>)
                : null;
            const tableCellIsNull = editMode?.tableCell === null;

            const contentDOM = (
                editMode?.cm as { contentDOM?: HTMLElement } | undefined
            )?.contentDOM;
            const contentDOMHasFocus = contentDOM
                ? contentDOM.contains(activeEl)
                : false;
            const mainEditorFocused =
                contentDOM
                    ?.closest('.cm-editor')
                    ?.classList.contains('cm-focused') ?? false;

            return {
                activeTag,
                activeClass,
                highlightTag,
                highlightClass,
                highlightParentTag,
                highlightParentClass,
                closestTdTag,
                navModeTag,
                tableCellIsNull,
                contentDOMHasFocus,
                mainEditorFocused,
            };
        });

        console.log('[TABLE-NAV DIAG]', JSON.stringify(diag, null, 2));
    });

    it.skip('[DIAGNOSTIC] should check if cell editor survives effect dispatch', async function () {
        this.timeout(20000);
        await ensureLivePreview();
        await setPluginSettings({ enableTableNav: false });
        await setupTableDoc();
        await browser.keys(['j', 'j']);
        await browser.pause(500);

        const result = await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'no view' };
            const editMode = (view as unknown as Record<string, unknown>)
                .editMode as Record<string, unknown>;
            const hasCell1 = editMode?.tableCell != null;

            const editorView = (
                view.editor as unknown as {
                    cm?: {
                        dispatch?: Function;
                        state?: Record<string, unknown>;
                    };
                }
            ).cm;
            if (editorView?.dispatch) {
                (editorView.dispatch as Function)({});
            }

            const hasCell2 = editMode?.tableCell != null;

            return { hasCell1, hasCell2, survived: hasCell1 && hasCell2 };
        });

        console.log('[CELL SURVIVAL]', JSON.stringify(result));
    });

    it.skip('[DIAGNOSTIC] should verify key handler intercepts real browser keys', async function () {
        this.timeout(20000);
        await ensureLivePreview();
        await setupTableDoc();
        await enterTableNav();

        const beforeL = await getHighlightedCell();
        console.log('[BEFORE L]', JSON.stringify(beforeL));

        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            const editorView = (
                view.editor as unknown as { cm?: { focus?: () => void } }
            ).cm;
            editorView?.focus?.();
        });
        await browser.pause(100);

        await browser.keys(['l']);
        await browser.pause(300);

        const exitReason = await browser.executeObsidian(() => {
            return (
                (globalThis as Record<string, unknown>).__tableNavExitReason ??
                'not called'
            );
        });
        console.log('[EXIT REASON]', exitReason);

        const afterLState = await browser.executeObsidian(
            ({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return { error: 'no view' };
                const editMode = (view as unknown as Record<string, unknown>)
                    .editMode as Record<string, unknown>;
                const hasHighlight =
                    document.querySelector('.vim-motions-table-nav-active') !==
                    null;
                const hasNavMode =
                    document.querySelector('.vim-motions-table-nav-mode') !==
                    null;
                const tableCellNull =
                    editMode?.tableCell === null ||
                    editMode?.tableCell === undefined;
                const allHighlights = document.querySelectorAll(
                    '.vim-motions-table-nav-active',
                ).length;
                const activeEl = document.activeElement?.tagName ?? 'null';
                const editorValue = view.editor.getValue().slice(0, 100);
                return {
                    hasHighlight,
                    hasNavMode,
                    tableCellNull,
                    allHighlights,
                    activeEl,
                    editorValue,
                };
            },
        );
        console.log('[AFTER L state]', JSON.stringify(afterLState, null, 2));

        const afterL = await getHighlightedCell();
        console.log('[AFTER L cell]', JSON.stringify(afterL));

        const hasHighlightAfterL = await hasTableNavHighlight();
        console.log('[HAS HIGHLIGHT after L]', hasHighlightAfterL);

        await setupTableDoc();
        await enterTableNav();
        const beforeX = await getHighlightedCell();
        console.log('[BEFORE x]', JSON.stringify(beforeX));

        await browser.keys(['x']);
        await browser.pause(300);

        const afterX = await getHighlightedCell();
        console.log('[AFTER x unhandled key]', JSON.stringify(afterX));

        const hasHighlightAfterX = await hasTableNavHighlight();
        console.log('[HAS HIGHLIGHT after x]', hasHighlightAfterX);
    });
});

describe('Table-nav mode entry and exit', function () {
    before(async function () {
        this.timeout(30000);
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await setPluginSettings({
            enableTableNav: true,
            tableWidgetMode: 'native',
        });
    });

    it('should enter table-nav when cursor moves into table', async function () {
        this.timeout(15000);
        await ensureLivePreview();
        await setPluginSettings({
            enableTableNav: true,
            tableWidgetMode: 'native',
        });
        await setupTableDoc();
        await enterTableNav();
        expect(await hasTableNavHighlight()).toBe(true);
    });

    it('should highlight header cell on entry from above', async function () {
        this.timeout(15000);
        await ensureLivePreview();
        await setupTableDoc();
        await enterTableNav();
        const cell = await getHighlightedCell();
        expect(cell).not.toBeNull();
        expect(cell?.row).toBe(0);
        expect(cell?.col).toBe(0);
    });

    it('should exit table-nav on Escape', async function () {
        this.timeout(15000);
        await ensureLivePreview();
        await setupTableDoc();
        await enterTableNav();
        expect(await hasTableNavHighlight()).toBe(true);
        await browser.keys(['Escape']);
        await browser.pause(PAUSE.EDITOR_SETTLE);
        expect(await hasTableNavHighlight()).toBe(false);
    });

    it('should not enter table-nav in source mode', async function () {
        this.timeout(15000);
        await ensureSourceMode();
        await setupEditor(TABLE_DOC, { line: 0, ch: 0 });
        await enterTableNav();
        expect(await hasTableNavHighlight()).toBe(false);
        await ensureLivePreview();
    });

    it('should not enter table-nav when enableTableNav is false', async function () {
        this.timeout(15000);
        await ensureLivePreview();
        await setPluginSettings({ enableTableNav: false });
        await setupTableDoc();
        await enterTableNav();
        expect(await hasTableNavHighlight()).toBe(false);
    });

    it('header-only table should not enter table-nav', async function () {
        this.timeout(15000);
        await ensureLivePreview();
        await setupTableDoc(TABLE_HEADER_ONLY);
        await enterTableNav();
        expect(await hasTableNavHighlight()).toBe(false);
    });
});

describe('Table-nav cell navigation', function () {
    before(async function () {
        this.timeout(30000);
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await ensureLivePreview();
        await setPluginSettings({
            enableTableNav: true,
            tableWidgetMode: 'native',
        });
    });

    it('h/l should move highlight between columns', async function () {
        this.timeout(15000);
        await setupTableDoc();
        await enterTableNav();
        await browser.keys(['l']);
        await browser.pause(CELL_EDIT_PAUSE);
        const afterL = await getHighlightedCell();
        expect(afterL?.col).toBe(1);
        await browser.keys(['h']);
        await browser.pause(CELL_EDIT_PAUSE);
        const afterH = await getHighlightedCell();
        expect(afterH?.col).toBe(0);
    });

    it('j/k should move highlight between data rows', async function () {
        this.timeout(15000);
        await setupTableDoc(TABLE_3COL);
        await enterTableNav();
        const initial = await getHighlightedCell();
        expect(initial?.row).toBe(0);
        await browser.keys(['j']);
        await browser.pause(CELL_EDIT_PAUSE);
        const afterJ = await getHighlightedCell();
        expect(afterJ).not.toBeNull();
        expect(afterJ!.row).toBeGreaterThan(0);
        await browser.keys(['k']);
        await browser.pause(CELL_EDIT_PAUSE);
        const afterK = await getHighlightedCell();
        expect(afterK?.row).toBe(0);
    });

    it('j at last data row should exit table downward', async function () {
        this.timeout(15000);
        await setupTableDoc();
        await enterTableNav();
        await browser.keys(['j']);
        await browser.pause(CELL_EDIT_PAUSE);
        expect(await hasTableNavHighlight()).toBe(true);
        await browser.keys(['j']);
        await browser.pause(PAUSE.EDITOR_SETTLE * 3);
        expect(await hasTableNavHighlight()).toBe(false);
    });

    it('k at header row should exit table upward', async function () {
        this.timeout(15000);
        await setupTableDoc();
        await enterTableNav();
        const initial = await getHighlightedCell();
        expect(initial?.row).toBe(0);
        await browser.keys(['k']);
        await browser.pause(CELL_EDIT_PAUSE);
        expect(await hasTableNavHighlight()).toBe(false);
    });

    it('h at column 0 should stay', async function () {
        this.timeout(15000);
        await setupTableDoc();
        await enterTableNav();
        await browser.keys(['h']);
        await browser.pause(CELL_EDIT_PAUSE);
        const cell = await getHighlightedCell();
        expect(cell?.col).toBe(0);
    });

    it('l at last column should stay', async function () {
        this.timeout(15000);
        await setupTableDoc();
        await enterTableNav();
        await browser.keys(['l']);
        await browser.pause(CELL_EDIT_PAUSE);
        await browser.keys(['l']);
        await browser.pause(CELL_EDIT_PAUSE);
        const cell = await getHighlightedCell();
        expect(cell?.col).toBe(1);
    });
});

describe('Table-nav to cell-edit transitions', function () {
    before(async function () {
        this.timeout(30000);
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await ensureLivePreview();
        await setPluginSettings({
            enableTableNav: true,
            tableWidgetMode: 'native',
        });
    });

    it('i should enter cell editor in insert mode', async function () {
        this.timeout(15000);
        await setupTableDoc();
        await enterTableNav();
        await browser.keys(['i']);
        await browser.pause(CELL_EDIT_PAUSE);
        const debugInfo = await browser.executeObsidian(() => {
            const g = globalThis as Record<string, unknown>;
            return {
                enterDebug: g.__enterCellEditDebug ?? 'not set',
                editResult: g.__editResult ?? 'not set',
            };
        });
        console.log('[CELL EDIT DEBUG]', JSON.stringify(debugInfo, null, 2));
        expect(await hasCellEditor()).toBe(true);
        expect(await getCellVimMode()).toBe('insert');
    });

    it('a should enter cell editor in append mode', async function () {
        this.timeout(15000);
        await setupTableDoc();
        await enterTableNav();
        await browser.keys(['a']);
        await browser.pause(CELL_EDIT_PAUSE);
        expect(await hasCellEditor()).toBe(true);
        await browser.keys(['Z']);
        await browser.keys(['Escape']);
        await browser.pause(PAUSE.MODE_SWITCH);
        const value = await getEditorValue();
        expect(value).toMatch(/\|\s*AAZ\s*\|/);
    });

    it('c should change cell content', async function () {
        this.timeout(15000);
        await setupTableDoc();
        await enterTableNav();
        await browser.keys(['c']);
        await browser.pause(CELL_EDIT_PAUSE);
        expect(await hasCellEditor()).toBe(true);
        await browser.keys(['Z', 'Z']);
        await browser.keys(['Escape']);
        await browser.pause(PAUSE.MODE_SWITCH);
        const value = await getEditorValue();
        expect(value).toMatch(/\|\s*ZZ\s*\|/);
    });

    it('s should substitute cell content', async function () {
        this.timeout(15000);
        await setupTableDoc();
        await enterTableNav();
        await browser.keys(['s']);
        await browser.pause(CELL_EDIT_PAUSE);
        expect(await hasCellEditor()).toBe(true);
        await browser.keys(['Y', 'Y']);
        await browser.keys(['Escape']);
        await browser.pause(PAUSE.MODE_SWITCH);
        const value = await getEditorValue();
        expect(value).toMatch(/\|\s*YY\s*\|/);
    });

    it('Enter should enter cell editor in normal mode', async function () {
        this.timeout(15000);
        await setupTableDoc();
        await enterTableNav();
        await browser.keys(['Enter']);
        await browser.pause(CELL_EDIT_PAUSE);
        expect(await hasCellEditor()).toBe(true);
        expect(await getVimMode()).toBe('normal');
    });

    it('cell editor should open and close properly', async function () {
        this.timeout(15000);
        await setupTableDoc();
        await enterTableNav();
        expect(await hasTableNavHighlight()).toBe(true);
        await browser.keys(['Enter']);
        await browser.pause(CELL_EDIT_PAUSE);
        expect(await hasCellEditor()).toBe(true);
        expect(await hasTableNavHighlight()).toBe(false);
    });

    it('edits should persist after cell-edit exit', async function () {
        this.timeout(15000);
        await setupTableDoc();
        await enterTableNav();
        await browser.keys(['j']);
        await browser.pause(CELL_EDIT_PAUSE);
        await browser.keys(['i']);
        await browser.pause(CELL_EDIT_PAUSE * 2);
        const cellInfo = await getTableCellInfo();
        console.log('[CROSS-CELL]', JSON.stringify(cellInfo));
        if (!cellInfo.inTableCell) {
            console.log('[CROSS-CELL] no cell editor after cross-cell click');
        }
        await browser.keys(['Z', 'Z']);
        await browser.keys(['Escape']);
        await browser.pause(PAUSE.MODE_SWITCH);
        await browser.keys(['Escape']);
        await browser.pause(CELL_EDIT_PAUSE);
        const value = await getEditorValue();
        expect(value).toMatch(/\|\s*ZZcc\s*\|/);
    });
});

describe('Table-nav structural commands', function () {
    before(async function () {
        this.timeout(30000);
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await ensureLivePreview();
        await setPluginSettings({
            enableTableNav: true,
            tableWidgetMode: 'native',
        });
    });

    it('o should add row below', async function () {
        this.timeout(20000);
        await setupTableDoc(TABLE_3COL);
        await enterTableNav();
        await browser.keys(['o']);
        await browser.pause(STRUCTURAL_PAUSE);
        const addRowDebug = await browser.executeObsidian(() => {
            return (
                (globalThis as Record<string, unknown>).__addRowDebug ??
                'not set'
            );
        });
        console.log('[ADD ROW DEBUG]', JSON.stringify(addRowDebug));
        const value = await getEditorValue();
        const lines = value
            .split('\n')
            .filter((line) => line.trimStart().startsWith('|'));
        expect(lines.length).toBe(5);
    });

    it('O should add row above', async function () {
        this.timeout(20000);
        await setupTableDoc(TABLE_3COL);
        await enterTableNav();
        await browser.keys(['j']);
        await browser.pause(CELL_EDIT_PAUSE);
        await browser.keys(['O']);
        await browser.pause(STRUCTURAL_PAUSE);
        const value = await getEditorValue();
        const lines = value
            .split('\n')
            .filter((line) => line.trimStart().startsWith('|'));
        expect(lines.length).toBe(5);
    });

    it('dd should delete current row', async function () {
        this.timeout(20000);
        await setupTableDoc(TABLE_3COL);
        await enterTableNav();
        await browser.keys(['j']);
        await browser.pause(CELL_EDIT_PAUSE);
        await browser.keys(['d']);
        await browser.pause(PAUSE.KEY_GAP);
        await browser.keys(['d']);
        await browser.pause(STRUCTURAL_PAUSE);
        const value = await getEditorValue();
        const lines = value
            .split('\n')
            .filter((line) => line.trimStart().startsWith('|'));
        expect(lines.length).toBe(3);
    });

    it('dd should not delete last data row', async function () {
        this.timeout(20000);
        await setupTableDoc(TABLE_SINGLE_ROW);
        await enterTableNav();
        await browser.keys(['d']);
        await browser.pause(PAUSE.KEY_GAP);
        await browser.keys(['d']);
        await browser.pause(STRUCTURAL_PAUSE);
        const value = await getEditorValue();
        const lines = value
            .split('\n')
            .filter((line) => line.trimStart().startsWith('|'));
        expect(lines.length).toBe(3);
    });

    it('J should move row down', async function () {
        this.timeout(20000);
        await setupTableDoc(TABLE_3COL);
        await enterTableNav();
        await browser.keys(['j']);
        await browser.pause(CELL_EDIT_PAUSE);
        await browser.keys(['J']);
        await browser.pause(STRUCTURAL_PAUSE);
        const value = await getEditorValue();
        const tableLines = value
            .split('\n')
            .filter((line) => line.trimStart().startsWith('|'));
        expect(tableLines[2]).toMatch(/\|\s*4\s*\|\s*5\s*\|\s*6\s*\|/);
        expect(tableLines[3]).toMatch(/\|\s*1\s*\|\s*2\s*\|\s*3\s*\|/);
    });

    it('K should move row up', async function () {
        this.timeout(20000);
        await setupTableDoc(TABLE_3COL);
        await enterTableNav();
        await browser.keys(['j', 'j']);
        await browser.pause(CELL_EDIT_PAUSE);
        await browser.keys(['K']);
        await browser.pause(STRUCTURAL_PAUSE);
        const value = await getEditorValue();
        const tableLines = value
            .split('\n')
            .filter((line) => line.trimStart().startsWith('|'));
        expect(tableLines[2]).toMatch(/\|\s*4\s*\|\s*5\s*\|\s*6\s*\|/);
        expect(tableLines[3]).toMatch(/\|\s*1\s*\|\s*2\s*\|\s*3\s*\|/);
    });

    it('= should realign table', async function () {
        this.timeout(20000);
        await setupTableDoc(TABLE_3COL);
        await enterTableNav();
        await browser.keys(['=']);
        await browser.pause(STRUCTURAL_PAUSE);
        const after = await getEditorValue();
        const lines = after
            .split('\n')
            .filter((line) => line.trimStart().startsWith('|'));
        const lengths = new Set(lines.map((line) => line.length));
        expect(lengths.size).toBeLessThanOrEqual(2);
    });
});

/**
 * Helper to read the cursor position inside the active cell editor.
 * Returns { line, ch } (0-indexed) or null if no cell editor is open.
 */
async function getCellCursorPos(): Promise<{
    line: number;
    ch: number;
} | null> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return null;
        const editMode = (view as unknown as Record<string, unknown>)
            .editMode as Record<string, unknown> | undefined;
        const cellEditor = editMode?.tableCell as Record<
            string,
            unknown
        > | null;
        if (!cellEditor) return null;
        const cellCm = cellEditor.cm as Record<string, unknown>;
        const cellState = cellCm?.state as Record<string, unknown>;
        const sel = (cellState?.selection as Record<string, unknown>)?.main as
            | Record<string, unknown>
            | undefined;
        if (!sel || typeof sel.head !== 'number') return null;
        const doc = cellState?.doc as
            | { lineAt?: (pos: number) => { number: number; from: number } }
            | undefined;
        if (!doc?.lineAt) return null;
        const lineInfo = doc.lineAt(sel.head as number);
        return {
            line: lineInfo.number - 1,
            ch: (sel.head as number) - lineInfo.from,
        };
    })) as { line: number; ch: number } | null;
}

const TABLE_WIDE_CELLS =
    'Above\n\n| Hello | World |\n|-------|-------|\n| abcde | fghij |\n\nBelow';

describe('Cell-edit hjkl should stay in cell when cursor is not at boundary (issue #131)', function () {
    before(async function () {
        this.timeout(30000);
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await ensureLivePreview();
        await setPluginSettings({
            enableTableNav: true,
            tableWidgetMode: 'native',
        });
    });

    it('l in cell-edit normal mode should move cursor right when not at end of cell', async function () {
        this.timeout(20000);
        await setupTableDoc(TABLE_WIDE_CELLS);
        await enterTableNav();

        // Enter cell edit in normal mode (cursor at start of "Hello")
        await browser.keys(['Enter']);
        await browser.pause(CELL_EDIT_PAUSE);
        expect(await hasCellEditor()).toBe(true);

        const cellInfo = await getTableCellInfo();
        expect(cellInfo.cellContent.trim()).toBe('Hello');

        // Cursor should be at position 0; pressing l should stay in cell
        const before = await getCellCursorPos();
        expect(before).not.toBeNull();
        expect(before!.ch).toBe(0);

        await browser.keys(['l']);
        await browser.pause(CELL_EDIT_PAUSE);

        // Should still be in cell edit mode, cursor moved right
        expect(await hasCellEditor()).toBe(true);
        expect(await hasTableNavHighlight()).toBe(false);
        const after = await getCellCursorPos();
        expect(after).not.toBeNull();
        expect(after!.ch).toBe(1);
    });

    it('h in cell-edit normal mode should move cursor left when not at start of cell', async function () {
        this.timeout(20000);
        await setupTableDoc(TABLE_WIDE_CELLS);
        await enterTableNav();

        // Enter cell edit in normal mode and move cursor to middle
        await browser.keys(['Enter']);
        await browser.pause(CELL_EDIT_PAUSE);
        expect(await hasCellEditor()).toBe(true);

        // Move cursor to position 2 using ll
        await browser.keys(['l', 'l']);
        await browser.pause(CELL_EDIT_PAUSE);
        const mid = await getCellCursorPos();
        expect(mid).not.toBeNull();
        expect(mid!.ch).toBe(2);

        // Now h should move left within cell, not exit
        await browser.keys(['h']);
        await browser.pause(CELL_EDIT_PAUSE);

        expect(await hasCellEditor()).toBe(true);
        expect(await hasTableNavHighlight()).toBe(false);
        const after = await getCellCursorPos();
        expect(after).not.toBeNull();
        expect(after!.ch).toBe(1);
    });

    it('l at end of cell should exit to table-nav', async function () {
        this.timeout(20000);
        await setupTableDoc(TABLE_WIDE_CELLS);
        await enterTableNav();

        // Enter cell edit via insert mode, then Escape to normal mode
        await browser.keys(['i']);
        await browser.pause(CELL_EDIT_PAUSE);
        expect(await hasCellEditor()).toBe(true);
        await browser.keys(['Escape']);
        await browser.pause(CELL_EDIT_PAUSE);
        expect(await getCellVimMode()).toBe('normal');

        // Move cursor to end of cell content with $
        await browser.keys(['$']);
        await browser.pause(CELL_EDIT_PAUSE);

        const atEnd = await getCellCursorPos();
        expect(atEnd).not.toBeNull();

        // l at end should exit to nav and navigate right
        await browser.keys(['l']);
        await browser.pause(CELL_EDIT_PAUSE);

        expect(await hasTableNavHighlight()).toBe(true);
        const cell = await getHighlightedCell();
        expect(cell).not.toBeNull();
        expect(cell!.col).toBe(1);
    });

    it('h at start of cell should exit to table-nav', async function () {
        this.timeout(20000);
        await setupTableDoc(TABLE_WIDE_CELLS);
        await enterTableNav();

        // Navigate to second column, enter via insert mode, Escape to normal
        await browser.keys(['l']);
        await browser.pause(CELL_EDIT_PAUSE);
        await browser.keys(['i']);
        await browser.pause(CELL_EDIT_PAUSE);
        expect(await hasCellEditor()).toBe(true);
        await browser.keys(['Escape']);
        await browser.pause(CELL_EDIT_PAUSE);
        expect(await getCellVimMode()).toBe('normal');

        // Move cursor to start of cell with 0
        await browser.keys(['0']);
        await browser.pause(CELL_EDIT_PAUSE);

        // Cursor is at start of cell (ch=0), h should exit to nav
        const atStart = await getCellCursorPos();
        expect(atStart).not.toBeNull();
        expect(atStart!.ch).toBe(0);

        await browser.keys(['h']);
        await browser.pause(CELL_EDIT_PAUSE);

        expect(await hasTableNavHighlight()).toBe(true);
        const cell = await getHighlightedCell();
        expect(cell).not.toBeNull();
        expect(cell!.col).toBe(0);
    });

    it('insert mode → Escape → l should move cursor within cell, not navigate', async function () {
        this.timeout(20000);
        await setupTableDoc(TABLE_WIDE_CELLS);
        await enterTableNav();

        // Enter cell edit in insert mode
        await browser.keys(['i']);
        await browser.pause(CELL_EDIT_PAUSE);
        expect(await hasCellEditor()).toBe(true);
        expect(await getCellVimMode()).toBe('insert');

        // Type something to move cursor into the middle of the cell
        await browser.keys(['X']);
        await browser.pause(100);

        // Escape to normal mode
        await browser.keys(['Escape']);
        await browser.pause(CELL_EDIT_PAUSE);
        expect(await getCellVimMode()).toBe('normal');

        // l should move cursor right within cell, not exit
        await browser.keys(['l']);
        await browser.pause(CELL_EDIT_PAUSE);

        expect(await hasCellEditor()).toBe(true);
        expect(await hasTableNavHighlight()).toBe(false);
    });
});

describe('Table-nav edge cases', function () {
    before(async function () {
        this.timeout(30000);
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await ensureLivePreview();
        await setPluginSettings({
            enableTableNav: true,
            tableWidgetMode: 'native',
        });
    });

    it('should handle multi-table documents', async function () {
        this.timeout(20000);
        await setupTableDoc(TWO_TABLES);
        await enterTableNav();
        await browser.keys(['Enter']);
        await browser.pause(CELL_EDIT_PAUSE);
        const first = await getTableCellInfo();
        expect(first.inTableCell).toBe(true);
    });

    it('table at end of document should allow j exit', async function () {
        this.timeout(20000);
        await setupTableDoc(TABLE_AT_END);
        await enterTableNav();
        await browser.keys(['j']);
        await browser.pause(CELL_EDIT_PAUSE);
        await browser.keys(['j']);
        await browser.pause(PAUSE.EDITOR_SETTLE * 3);
        expect(await hasTableNavHighlight()).toBe(false);
    });

    it('modifier combos should not be swallowed', async function () {
        this.timeout(20000);
        await setupTableDoc(TABLE_3COL);
        await enterTableNav();
        expect(await hasTableNavHighlight()).toBe(true);
        await browser.keys(['j']);
        await browser.pause(CELL_EDIT_PAUSE);
        expect(await hasTableNavHighlight()).toBe(true);
    });

    describe('count prefix navigation', function () {
        it('3j should move down 3 rows in table-nav', async function () {
            this.timeout(20000);
            await setupTableDoc(TABLE_4ROW);
            await enterTableNav();
            const initial = await getHighlightedCell();
            expect(initial).not.toBeNull();
            expect(initial!.row).toBe(0);

            await browser.keys(['3']);
            await browser.pause(200);
            await browser.keys(['j']);
            await browser.pause(CELL_EDIT_PAUSE);

            const after = await getHighlightedCell();
            expect(after).not.toBeNull();
            expect(after!.row).toBe(3);
        });

        it('2l should move right 2 columns in table-nav', async function () {
            this.timeout(20000);
            await setupTableDoc(TABLE_3COL);
            await enterTableNav();
            const initial = await getHighlightedCell();
            expect(initial).not.toBeNull();
            expect(initial!.col).toBe(0);

            await browser.keys(['2']);
            await browser.pause(50);
            await browser.keys(['l']);
            await browser.pause(CELL_EDIT_PAUSE);

            const after = await getHighlightedCell();
            expect(after).not.toBeNull();
            expect(after!.col).toBe(2);
        });
    });
});
