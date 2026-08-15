/**
 * Spike: validate architectural assumptions for table-nav DOM overlay.
 *
 * Tests:
 * 1. editTableCell can be monkey-patched via around() to no-op
 * 2. TableEditor reference survives cell editor destruction
 * 3. destroyTableCell() timing (sync DOM removal before next paint)
 * 4. cell.el is accessible and highlightable via getCellAt()
 * 5. setCellFocus() works after patch disarm cycle
 *
 * Run with:
 *   npx wdio run ./wdio.conf.mts --spec test/specs/spikes/spike-table-nav-overlay.e2e.ts
 */
import { browser } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

const PAUSE = { SETTLE: 500, RENDER: 2000 } as const;
const TABLE_DOC =
    'Line above\n\n| AA | BB |\n|-----|-----|\n| cc | dd |\n\nLine below';

async function ensureLivePreview(): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return;
        const state = view.getState();
        state.mode = 'source';
        state.source = false;
        view.setState(state, { history: false });
    });
    await browser.pause(PAUSE.SETTLE * 2);
}

async function setupDoc(): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }, content: string) => {
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
        view.editor.setValue(content);
        view.editor.setCursor(0, 0);
        view.editor.focus();
    }, TABLE_DOC);
    await browser.pause(PAUSE.RENDER);
}

describe('Spike: table-nav overlay architectural validation', function () {
    before(async function () {
        this.timeout(30000);
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await ensureLivePreview();
    });

    it('should validate editTableCell is patchable via around()', async function () {
        this.timeout(30000);
        await setupDoc();

        // Enter table to create a cell editor
        await browser.keys(['j', 'j']);
        await browser.pause(PAUSE.SETTLE);

        const result = await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'no view' };
            const editMode = (view as unknown as Record<string, unknown>)
                .editMode as Record<string, unknown>;

            // Check editTableCell exists and is a function
            const hasEditTableCell =
                typeof editMode.editTableCell === 'function';
            const hasDestroyTableCell =
                typeof editMode.destroyTableCell === 'function';

            // Check if we can read the property descriptor
            const descriptor = Object.getOwnPropertyDescriptor(
                editMode,
                'editTableCell',
            );
            const hasOwnProperty = Object.prototype.hasOwnProperty.call(
                editMode,
                'editTableCell',
            );

            // Check the prototype chain
            const proto = Object.getPrototypeOf(editMode);
            const protoHasMethod = proto
                ? typeof proto.editTableCell === 'function'
                : false;

            // Test wrapping: save original, replace with no-op, verify, restore
            let patchWorked = false;
            if (hasEditTableCell) {
                const original = editMode.editTableCell as (
                    ...args: unknown[]
                ) => unknown;
                let called = false;
                editMode.editTableCell = ((...args: unknown[]) => {
                    called = true;
                    return original.apply(editMode, args);
                }) as typeof editMode.editTableCell;

                // The wrapper is in place; try triggering (we won't actually
                // trigger it here, just verify the replacement worked)
                patchWorked = editMode.editTableCell !== original;

                // Restore
                editMode.editTableCell = original;
            }

            return {
                hasEditTableCell,
                hasDestroyTableCell,
                hasOwnProperty,
                descriptorConfigurable: descriptor?.configurable ?? 'N/A',
                descriptorWritable: descriptor?.writable ?? 'N/A',
                protoHasMethod,
                patchWorked,
            };
        });

        console.log('[PATCH VALIDATION]', JSON.stringify(result, null, 2));
    });

    it('should capture TableEditor reference and survive destroyTableCell', async function () {
        this.timeout(30000);
        await setupDoc();

        // Enter table to create cell editor
        await browser.keys(['j', 'j']);
        await browser.pause(PAUSE.SETTLE);

        const result = await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'no view' };
            const editMode = (view as unknown as Record<string, unknown>)
                .editMode as Record<string, unknown>;
            const tc = editMode?.tableCell as Record<string, unknown> | null;
            if (!tc) return { error: 'no tableCell — not in cell editor' };

            // Capture TableEditor reference
            const table = tc.table as Record<string, unknown>;
            const hasContainerEl = table?.containerEl instanceof HTMLElement;
            const hasTableEl = table?.tableEl instanceof HTMLTableElement;
            const hasGetCellAt = typeof table?.getCellAt === 'function';
            const hasInsertRow = typeof table?.insertRow === 'function';
            const hasRemoveRow = typeof table?.removeRow === 'function';
            const hasMoveRow = typeof table?.moveRow === 'function';
            const hasRows = Array.isArray(table?.rows);
            const rowCount = hasRows ? (table.rows as unknown[]).length : -1;

            // Store reference in window for cross-call survival check
            (window as unknown as Record<string, unknown>).__spikeTableRef =
                table;
            (window as unknown as Record<string, unknown>).__spikeContainerEl =
                table?.containerEl;

            // Destroy the cell editor
            if (typeof editMode.destroyTableCell === 'function') {
                (editMode.destroyTableCell as () => void)();
            }

            // Check if table reference is still usable after destroy
            const tableAfterDestroy = (
                window as unknown as Record<string, unknown>
            ).__spikeTableRef as Record<string, unknown>;
            const stillHasGetCellAt =
                typeof tableAfterDestroy?.getCellAt === 'function';
            const stillHasRows = Array.isArray(tableAfterDestroy?.rows);
            const rowCountAfter = stillHasRows
                ? (tableAfterDestroy.rows as unknown[]).length
                : -1;

            // Check containerEl is still connected
            const containerEl = (window as unknown as Record<string, unknown>)
                .__spikeContainerEl as HTMLElement | null;
            const containerStillConnected = containerEl?.isConnected ?? false;

            // Check if getCellAt still works
            let cellAtResult = 'not tested';
            if (stillHasGetCellAt) {
                try {
                    const cell = (
                        tableAfterDestroy.getCellAt as (
                            r: number,
                            c: number,
                        ) => unknown
                    )(0, 0);
                    if (cell) {
                        const c = cell as Record<string, unknown>;
                        cellAtResult = `row=${c.row} col=${c.col} text=${c.text} elConnected=${(c.el as HTMLElement)?.isConnected}`;
                    } else {
                        cellAtResult = 'null';
                    }
                } catch (e) {
                    cellAtResult = `error: ${(e as Error).message}`;
                }
            }

            // Verify editMode.tableCell is now null
            const tableCellAfterDestroy = editMode.tableCell;

            return {
                hasContainerEl,
                hasTableEl,
                hasGetCellAt,
                hasInsertRow,
                hasRemoveRow,
                hasMoveRow,
                rowCount,
                stillHasGetCellAt,
                stillHasRows,
                rowCountAfter,
                containerStillConnected,
                cellAtResult,
                tableCellIsNull: tableCellAfterDestroy === null,
            };
        });

        console.log('[REGISTRY SURVIVAL]', JSON.stringify(result, null, 2));
    });

    it('should measure destroyTableCell timing (flicker test)', async function () {
        this.timeout(30000);
        await setupDoc();

        // Enter table
        await browser.keys(['j', 'j']);
        await browser.pause(PAUSE.SETTLE);

        const result = await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'no view' };
            const editMode = (view as unknown as Record<string, unknown>)
                .editMode as Record<string, unknown>;
            const tc = editMode?.tableCell as Record<string, unknown> | null;
            if (!tc) return { error: 'no tableCell' };

            // Record cell editor DOM presence before destroy
            const cellCm = tc.cm as { dom?: HTMLElement } | null;
            const cellDomBefore = cellCm?.dom?.isConnected ?? false;
            const cellEditorBefore =
                document.querySelector('.cm-table-widget .cm-editor') !== null;

            // Destroy and immediately check DOM
            const t0 = performance.now();
            if (typeof editMode.destroyTableCell === 'function') {
                (editMode.destroyTableCell as () => void)();
            }
            const t1 = performance.now();

            // Check DOM immediately after destroy (before any async work)
            const cellDomAfter = cellCm?.dom?.isConnected ?? false;
            const cellEditorAfter =
                document.querySelector('.cm-table-widget .cm-editor') !== null;
            const tableCellNull = editMode.tableCell === null;

            return {
                cellDomBefore,
                cellEditorBefore,
                cellDomAfter,
                cellEditorAfter,
                tableCellNull,
                destroyTimeMs: Math.round((t1 - t0) * 100) / 100,
                note: cellDomAfter
                    ? 'DOM still connected after destroy — potential flicker'
                    : 'DOM removed synchronously — no flicker',
            };
        });

        console.log('[DESTROY TIMING]', JSON.stringify(result, null, 2));
    });

    it('should validate cell.el highlighting via getCellAt', async function () {
        this.timeout(30000);
        await setupDoc();

        // Enter table
        await browser.keys(['j', 'j']);
        await browser.pause(PAUSE.SETTLE);

        const result = await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'no view' };
            const editMode = (view as unknown as Record<string, unknown>)
                .editMode as Record<string, unknown>;
            const tc = editMode?.tableCell as Record<string, unknown> | null;
            if (!tc) return { error: 'no tableCell' };

            const table = tc.table as Record<string, unknown>;

            // Test getCellAt for each cell
            const cells: Array<{
                row: number;
                col: number;
                text: string;
                hasEl: boolean;
                elTag: string;
                elConnected: boolean;
            }> = [];

            const rows = table.rows as unknown[];
            for (let r = 0; r < rows.length; r++) {
                const row = rows[r] as { length: number; [i: number]: unknown };
                for (let c = 0; c < row.length; c++) {
                    const cell = (
                        table.getCellAt as (
                            r: number,
                            c: number,
                        ) => Record<string, unknown> | null
                    )(r, c);
                    if (cell) {
                        const el = cell.el as HTMLElement | null;
                        cells.push({
                            row: cell.row as number,
                            col: cell.col as number,
                            text: cell.text as string,
                            hasEl: el !== null,
                            elTag: el?.tagName ?? 'null',
                            elConnected: el?.isConnected ?? false,
                        });

                        // Test CSS class application
                        if (el) {
                            el.classList.add('vim-motions-table-nav-active');
                            const hasClass = el.classList.contains(
                                'vim-motions-table-nav-active',
                            );
                            el.classList.remove('vim-motions-table-nav-active');
                            if (!hasClass) {
                                return {
                                    error: `CSS class not applied to cell (${r},${c})`,
                                };
                            }
                        }
                    }
                }
            }

            return { cells };
        });

        console.log('[CELL HIGHLIGHT]', JSON.stringify(result, null, 2));
    });

    it('should validate setCellFocus works after patch disarm cycle', async function () {
        this.timeout(30000);
        await setupDoc();

        // Enter table
        await browser.keys(['j', 'j']);
        await browser.pause(PAUSE.SETTLE);

        const result = await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'no view' };
            const editMode = (view as unknown as Record<string, unknown>)
                .editMode as Record<string, unknown>;
            const tc = editMode?.tableCell as Record<string, unknown> | null;
            if (!tc) return { error: 'no tableCell' };

            const table = tc.table as Record<string, unknown>;

            // Step 1: Capture table reference
            const capturedTable = table;

            // Step 2: Destroy cell editor
            (editMode.destroyTableCell as () => void)();
            const afterDestroy1 = editMode.tableCell === null;

            // Step 3: Arm patch (make editTableCell a no-op)
            const original = editMode.editTableCell as (
                ...args: unknown[]
            ) => unknown;
            let patchActive = true;
            editMode.editTableCell = ((...args: unknown[]) => {
                if (patchActive) return; // no-op when armed
                return original.apply(editMode, args);
            }) as typeof editMode.editTableCell;

            // Step 4: Disarm patch
            patchActive = false;

            // Step 5: Call setCellFocus to open cell editor at (0, 1)
            let setCellFocusWorked = false;
            try {
                (capturedTable.setCellFocus as (r: number, c: number) => void)(
                    0,
                    1,
                );
                setCellFocusWorked = true;
            } catch (e) {
                return {
                    error: `setCellFocus failed: ${(e as Error).message}`,
                };
            }

            // Step 6: Verify cell editor opened at correct position
            const tc2 = editMode.tableCell as Record<string, unknown> | null;
            const cellEditorOpened = tc2 !== null;
            let cellRow = -1;
            let cellCol = -1;
            if (tc2) {
                const cell2 = tc2.cell as Record<string, unknown>;
                cellRow = cell2?.row as number;
                cellCol = cell2?.col as number;
            }

            // Restore original
            editMode.editTableCell = original;

            return {
                afterDestroy1,
                setCellFocusWorked,
                cellEditorOpened,
                cellRow,
                cellCol,
                expectedRow: 0,
                expectedCol: 1,
                positionCorrect: cellRow === 0 && cellCol === 1,
            };
        });

        console.log('[PATCH CYCLE]', JSON.stringify(result, null, 2));
    });

    it('should validate getEditModeForView pattern via editorInfoField', async function () {
        this.timeout(15000);
        await setupDoc();

        const result = await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'no view' };

            // Method 1: existing getEditMode via getActiveViewOfType
            const editMode1 = (view as unknown as Record<string, unknown>)
                .editMode as Record<string, unknown> | undefined;
            const has1 =
                editMode1 !== undefined &&
                typeof editMode1.editTableCell === 'function';

            // Method 2: via editorInfoField from EditorView
            const editorView = (
                view.editor as unknown as { cm?: Record<string, unknown> }
            ).cm as Record<string, unknown> | undefined;
            let has2 = false;
            let sameInstance = false;

            if (editorView) {
                try {
                    // Access the editorInfoField from the EditorView's state
                    const req = (
                        window as unknown as {
                            require?: (m: string) => unknown;
                        }
                    ).require;
                    if (req) {
                        const obsModule = req('obsidian') as Record<
                            string,
                            unknown
                        >;
                        const infoField = obsModule.editorInfoField as unknown;
                        if (infoField) {
                            const state = editorView.state as Record<
                                string,
                                unknown
                            >;
                            if (
                                state &&
                                typeof (state as { field?: unknown }).field ===
                                    'function'
                            ) {
                                const info = (
                                    state as {
                                        field: (f: unknown) => unknown;
                                    }
                                ).field(infoField) as Record<string, unknown>;
                                // info should have .app or lead to the MarkdownView
                                const infoApp = info?.app;
                                const hasApp = infoApp !== undefined;

                                // Get the MarkdownView from the info
                                // The editorInfoField returns the MarkdownView itself
                                // or an object with an editor property
                                const infoEditor = info?.editor;
                                const infoView = info;

                                // Try to get editMode from the resolved view
                                const resolvedEditMode = (
                                    infoView as Record<string, unknown>
                                )?.editMode as
                                    | Record<string, unknown>
                                    | undefined;
                                has2 =
                                    resolvedEditMode !== undefined &&
                                    typeof resolvedEditMode.editTableCell ===
                                        'function';
                                sameInstance = resolvedEditMode === editMode1;
                            }
                        }
                    }
                } catch (e) {
                    return {
                        error: `editorInfoField access failed: ${(e as Error).message}`,
                    };
                }
            }

            return {
                method1Works: has1,
                method2Works: has2,
                sameInstance,
                note: sameInstance
                    ? 'Both methods resolve to the same editMode — view-local access works'
                    : 'Different instances — investigate further',
            };
        });

        console.log('[VIEW-LOCAL ACCESS]', JSON.stringify(result, null, 2));
    });
});
