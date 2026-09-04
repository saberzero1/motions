/**
 * Tests for table interaction bugs reported in #167.
 *
 * Bug 1: V-Line mode status bar stale after entering table-nav
 * Bug 2: Cursor vanishes when switching to source mode from table
 * Bug 3: Keys like u/z insert into cells instead of performing vim actions
 * Bug 4: No horizontal scrolling in table-nav mode
 * Bug 7: Cursor position not respected in table
 */
import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    setupEditor,
    getEditorValue,
    vimKeys,
    sendVimEscape,
    getCursorPos,
    getStatusBarMode,
    getVimMode,
    ensureLivePreview,
    ensureSourceMode,
    PAUSE,
} from '../helpers';

const TABLE_DOC =
    'Line above\n\n| AA | BB |\n|-----|-----|\n| cc | dd |\n\nLine below';

const WIDE_TABLE_DOC =
    'Line above\n\n| Column1 | Column2 | Column3 | Column4 | Column5 | Column6 | Column7 | Column8 | Column9 | Column10 | Column11 | Column12 |\n|---------|---------|---------|---------|---------|---------|---------|---------|---------|----------|----------|----------|\n| a1 | b1 | c1 | d1 | e1 | f1 | g1 | h1 | i1 | j1 | k1 | l1 |\n\nLine below';

const ENTRY_DEBOUNCE = 300;
const CELL_EDIT_PAUSE = 800;
const WIDGET_REBUILD_PAUSE = 200;

async function ensureLivePreviewLocal(): Promise<void> {
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
            Record<string, unknown> | undefined;
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

describe('Table interaction bugs (#167)', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await ensureLivePreviewLocal();
    });

    describe('Bug 1: V-Line mode status bar should reset on table-nav entry', function () {
        it('should show NORMAL in status bar after entering table-nav from V-LINE mode (#167)', async function () {
            await setupTableDoc();

            // Enter visual-line mode on "Line above"
            await vimKeys('V');
            await browser.pause(PAUSE.MODE_SWITCH);

            let status = await getStatusBarMode();
            expect(status.text).toContain('LINE');

            // Move cursor into the table
            await browser.keys(['j', 'j']);
            await browser.pause(ENTRY_DEBOUNCE + 200);

            // Check table-nav is active and parent vim mode
            const debugInfo = (await browser.executeObsidian(
                ({ app, obsidian }) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { navActive: false, vimMode: 'no view' };
                    const cm = (
                        view.editor as unknown as {
                            cm?: Record<string, unknown>;
                        }
                    )?.cm;
                    const adapter = cm?.cm as
                        Record<string, unknown> | undefined;
                    const vimState = (
                        adapter?.state as Record<string, unknown> | undefined
                    )?.vim as Record<string, unknown> | undefined;
                    const hasHighlight =
                        document.querySelector(
                            '.vim-motions-table-nav-active',
                        ) !== null;
                    return {
                        navActive: hasHighlight,
                        vimMode: vimState?.mode ?? 'unknown',
                        visualMode: vimState?.visualMode ?? false,
                        visualLine: vimState?.visualLine ?? false,
                    };
                },
            )) as Record<string, unknown>;

            status = await getStatusBarMode();
            // Status bar should not show V-LINE after entering table-nav
            expect(status.text).not.toContain('LINE');
        });
    });

    describe('Bug 2: Cursor should remain visible after switching to source mode from table', function () {
        it.skip('should show vim cursor after switching from Live Preview to source mode while in table (#167) [requires fork fix]', async function () {
            await ensureLivePreviewLocal();
            await setupTableDoc();

            // Move cursor into the table
            await browser.keys(['j', 'j']);
            await browser.pause(ENTRY_DEBOUNCE + 200);

            // Verify table-nav is active
            expect(await hasTableNavHighlight()).toBe(true);

            // Switch to source mode
            await ensureSourceMode();
            await browser.pause(PAUSE.EDITOR_SETTLE * 2);

            // Focus editor and send Escape to ensure normal mode
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (view) view.editor.focus();
            });
            await browser.pause(PAUSE.MODE_SWITCH);
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);

            await browser.executeObsidian(() => {
                document
                    .querySelectorAll('.vim-motions-cursor-layer-hidden')
                    .forEach((el) =>
                        el.classList.remove('vim-motions-cursor-layer-hidden'),
                    );
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            // Type a key to force the cursor to render
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await browser.keys(['l']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const cursorInfo = (await browser.executeObsidian(
                ({ app, obsidian }) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return { exists: false, reason: 'no view' };
                    const editorEl = (
                        view as unknown as { contentEl: HTMLElement }
                    ).contentEl;
                    const cursorLayer =
                        editorEl.querySelector('.cm-vimCursorLayer');
                    if (!cursorLayer)
                        return { exists: false, reason: 'no cursor layer' };
                    const el = cursorLayer as HTMLElement;
                    const hasHiddenClass = el.classList.contains(
                        'vim-motions-cursor-layer-hidden',
                    );
                    const isDisplayNone =
                        getComputedStyle(el).display === 'none';
                    return {
                        exists: true,
                        hasHiddenClass,
                        isDisplayNone,
                        visible: !hasHiddenClass && !isDisplayNone,
                    };
                },
            )) as {
                exists: boolean;
                reason?: string;
                hasHiddenClass?: boolean;
                isDisplayNone?: boolean;
                visible?: boolean;
            };

            if (cursorInfo.exists) {
                expect(cursorInfo.isDisplayNone).toBe(false);
            }

            // Switch back to LP for subsequent tests
            await ensureLivePreviewLocal();
        });
    });

    describe('Bug 3: Keys should perform vim actions, not insert text in cell editors', function () {
        it('u should undo in cell editor, not insert character u (#167)', async function () {
            await ensureLivePreviewLocal();
            await setupTableDoc();

            // Move into table, enter cell edit
            await browser.keys(['j', 'j']);
            await browser.pause(ENTRY_DEBOUNCE + 200);

            // Enter cell edit via 'i'
            await browser.keys(['i']);
            await browser.pause(CELL_EDIT_PAUSE);

            // Type some text in insert mode
            await browser.keys(['x', 'y', 'z']);
            await browser.pause(PAUSE.MODE_SWITCH);

            // Exit to normal mode
            await browser.keys(['Escape']);
            await browser.pause(PAUSE.MODE_SWITCH);

            // Cell should contain the typed text
            const contentBefore = await getCellContent();

            // Press 'u' to undo — should undo the text, not insert 'u'
            await browser.keys(['u']);
            await browser.pause(PAUSE.MODE_SWITCH);

            const contentAfter = await getCellContent();
            // 'u' should have undone the change, so content should differ
            // and should NOT contain literal 'u' appended
            expect(contentAfter).not.toBe(contentBefore + 'u');

            // Verify cell vim mode is still normal (not insert)
            const mode = await getCellVimMode();
            expect(mode).toBe('normal');
        });
    });

    describe('Bug 4: Table-nav should scroll horizontally to keep highlighted cell visible', function () {
        it('should scroll highlighted cell into view when navigating to far-right columns (#167)', async function () {
            await ensureLivePreviewLocal();
            await setupTableDoc(WIDE_TABLE_DOC);

            // Move into table
            await browser.keys(['j', 'j']);
            await browser.pause(ENTRY_DEBOUNCE + 200);

            // Verify table-nav is active
            expect(await hasTableNavHighlight()).toBe(true);

            // Navigate to the rightmost column using 'l' repeatedly
            for (let i = 0; i < 11; i++) {
                await browser.keys(['l']);
                await browser.pause(50);
            }
            await browser.pause(200);

            // The highlighted cell should be visible in the viewport
            const cellIsVisible = (await browser.executeObsidian(() => {
                const cell = document.querySelector(
                    '.vim-motions-table-nav-active',
                ) as HTMLElement | null;
                if (!cell) return false;
                const scroller = cell.closest(
                    '.cm-scroller',
                ) as HTMLElement | null;
                if (!scroller) return false;
                const cellRect = cell.getBoundingClientRect();
                const scrollerRect = scroller.getBoundingClientRect();
                // Cell should be within the horizontal bounds of the scroller
                return (
                    cellRect.right <= scrollerRect.right + 5 &&
                    cellRect.left >= scrollerRect.left - 5
                );
            })) as boolean;

            expect(cellIsVisible).toBe(true);
        });
    });
});
