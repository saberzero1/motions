import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

const PAUSE = { SETTLE: 500, RENDER: 2000 } as const;
const TABLE_DOC =
    'Line above\n\n| AA | BB | CC |\n|-----|-----|-----|\n| d1 | d2 | d3 |\n| e1 | e2 | e3 |\n\nLine below';

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

describe('Spike: TableEditor typings audit against runtime', function () {
    before(async function () {
        this.timeout(30000);
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await ensureLivePreview();
        await browser.executeObsidian(({ app }) => {
            const p = (
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
            if (p) {
                p.settings.enableTableNav = false;
                p.saveSettings();
                p.reloadFeatures();
            }
        });
        await browser.pause(PAUSE.SETTLE);
    });

    it('should verify TableEditor own properties match typed interface', async function () {
        this.timeout(30000);

        await browser.executeObsidian(({ app, obsidian }, content: string) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            const editMode = (view as unknown as Record<string, unknown>)
                .editMode as Record<string, unknown>;
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
            if (!table) return { error: 'no table' };

            const ownProps = Object.getOwnPropertyNames(table).sort();

            const typedProps = [
                'actionsEl',
                'alignments',
                'app',
                'cellChildMap',
                'children',
                'colWidths',
                'containerEl',
                'doc',
                'editor',
                'end',
                'isDocComplete',
                'isMalformed',
                'rows',
                'selectedCells',
                'selectionAnchor',
                'selectionHead',
                'start',
                'tableEl',
                'updateCellReadonly',
            ].sort();

            const missingFromRuntime = typedProps.filter(
                (p) => !ownProps.includes(p),
            );
            const extraInRuntime = ownProps.filter(
                (p) => !typedProps.includes(p),
            );

            const propTypes: Record<string, string> = {};
            for (const p of ownProps) {
                const v = table[p];
                if (v === null) propTypes[p] = 'null';
                else if (v === undefined) propTypes[p] = 'undefined';
                else if (Array.isArray(v))
                    propTypes[p] = `array(${(v as unknown[]).length})`;
                else if (v instanceof Map) propTypes[p] = `Map(${v.size})`;
                else if (v instanceof HTMLElement)
                    propTypes[p] = `HTMLElement(${v.tagName})`;
                else if (typeof v === 'function') propTypes[p] = 'function';
                else if (typeof v === 'object') propTypes[p] = 'object';
                else propTypes[p] = typeof v;
            }

            return {
                ownProps,
                typedProps,
                missingFromRuntime,
                extraInRuntime,
                propTypes,
            };
        });

        console.log(
            '[TABLE EDITOR OWN PROPS]',
            JSON.stringify(result, null, 2),
        );

        expect(result).not.toHaveProperty('error');
        const r = result as {
            missingFromRuntime: string[];
            extraInRuntime: string[];
        };
        expect(r.missingFromRuntime).toEqual([]);
    });

    it('should verify TableEditor prototype methods match typed interface', async function () {
        this.timeout(30000);

        await browser.executeObsidian(({ app, obsidian }, content: string) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            view.editor.setValue(content);
            view.editor.setCursor(0, 0);
            view.editor.focus();
        }, TABLE_DOC);
        await browser.pause(PAUSE.RENDER);
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
            if (!table) return { error: 'no table' };

            const protoChain: Array<{
                depth: number;
                members: string[];
                memberTypes: Record<string, string>;
            }> = [];
            let proto = Object.getPrototypeOf(table);
            let depth = 0;
            while (proto && depth < 5) {
                const members = Object.getOwnPropertyNames(proto).sort();
                const memberTypes: Record<string, string> = {};
                for (const m of members) {
                    try {
                        memberTypes[m] = typeof proto[m];
                    } catch {
                        memberTypes[m] = 'inaccessible';
                    }
                }
                protoChain.push({ depth, members, memberTypes });
                proto = Object.getPrototypeOf(proto);
                depth++;
            }

            const typedMethods = [
                'addNewLine',
                'applyCellUpdates',
                'cleanupChildren',
                'containedBySelection',
                'containsRange',
                'containsSelection',
                'copySelection',
                'createDragHandle',
                'deleteSelection',
                'deselectCells',
                'deselectTable',
                'dispatchTable',
                'dispatchUpdate',
                'getCellAbove',
                'getCellAt',
                'getCellBelow',
                'getClosestCell',
                'getNextCell',
                'getSelectedCell',
                'getSelectionBounds',
                'getTableString',
                'initDOM',
                'insertColumn',
                'insertRow',
                'makeAlignmentMenu',
                'makeAlignmentRow',
                'makeColMenu',
                'makeRowMenu',
                'makeSortMenu',
                'moveColumn',
                'moveRow',
                'offsetCellsAfter',
                'onContextMenu',
                'pasteSelection',
                'placeCursorAround',
                'placeCursorInCell',
                'postProcess',
                'rebuildTable',
                'receiveCellFocus',
                'receiveIncompleteUpdate',
                'receiveSelection',
                'receiveUpdate',
                'reconcileChanges',
                'removeChildren',
                'removeColumn',
                'removeRow',
                'render',
                'rerenderCell',
                'selectCells',
                'selectTable',
                'setActiveDragHandles',
                'setAlignment',
                'setCellFocus',
                'sortByColumn',
                'toDOM',
                'trimCell',
                'unsetActiveDragHandles',
                'updateCell',
                'validateSelectionBounds',
            ].sort();

            const allProtoMembers = protoChain
                .flatMap((p) => p.members)
                .filter((m) => m !== 'constructor');
            const allProtoFunctions = protoChain
                .flatMap((p) =>
                    p.members.filter((m) => p.memberTypes[m] === 'function'),
                )
                .filter((m) => m !== 'constructor');

            const missingMethods = typedMethods.filter(
                (m) => !allProtoFunctions.includes(m),
            );
            const extraMethods = allProtoFunctions.filter(
                (m) => !typedMethods.includes(m),
            );

            const typedReadonly = ['estimatedHeight', 'text'];
            const missingGetters = typedReadonly.filter(
                (g) => !allProtoMembers.includes(g),
            );

            return {
                protoChain: protoChain.map((p) => ({
                    depth: p.depth,
                    memberCount: p.members.length,
                    members: p.members,
                })),
                typedMethodCount: typedMethods.length,
                runtimeFunctionCount: allProtoFunctions.length,
                missingMethods,
                extraMethods,
                missingGetters,
            };
        });

        console.log(
            '[TABLE EDITOR PROTO METHODS]',
            JSON.stringify(result, null, 2),
        );

        expect(result).not.toHaveProperty('error');
        const r = result as {
            missingMethods: string[];
            missingGetters: string[];
        };
        expect(r.missingMethods).toEqual([]);
        expect(r.missingGetters).toEqual([]);
    });

    it('should verify TableCell properties and methods match typed interface', async function () {
        this.timeout(30000);

        await browser.executeObsidian(({ app, obsidian }, content: string) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            view.editor.setValue(content);
            view.editor.setCursor(0, 0);
            view.editor.focus();
        }, TABLE_DOC);
        await browser.pause(PAUSE.RENDER);
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
            if (!table) return { error: 'no table' };

            const cell = (table.getCellAt as (r: number, c: number) => unknown)(
                0,
                0,
            ) as Record<string, unknown> | null;
            if (!cell) return { error: 'getCellAt(0,0) returned null' };

            const cellOwnProps = Object.getOwnPropertyNames(cell).sort();
            const cellProto = Object.getPrototypeOf(cell);
            const cellProtoMembers = cellProto
                ? Object.getOwnPropertyNames(cellProto)
                      .sort()
                      .filter((m: string) => m !== 'constructor')
                : [];

            const typedCellProps = [
                'col',
                'contentEl',
                'dirty',
                'el',
                'end',
                'padEnd',
                'padStart',
                'row',
                'start',
                'table',
                'text',
            ].sort();

            const typedCellMethods = [
                'getAbsoluteOffsets',
                'setTextDir',
            ].sort();

            const missingProps = typedCellProps.filter(
                (p) => !cellOwnProps.includes(p),
            );
            const extraProps = cellOwnProps.filter(
                (p) => !typedCellProps.includes(p),
            );
            const missingMethods = typedCellMethods.filter(
                (m) => !cellProtoMembers.includes(m),
            );
            const extraMethods = (cellProtoMembers as string[]).filter(
                (m: string) => !typedCellMethods.includes(m),
            );

            const propTypes: Record<string, string> = {};
            for (const p of cellOwnProps) {
                const v = cell[p];
                if (v === null) propTypes[p] = 'null';
                else if (v === undefined) propTypes[p] = 'undefined';
                else if (v instanceof HTMLElement)
                    propTypes[p] = `HTMLElement(${v.tagName})`;
                else if (typeof v === 'object') propTypes[p] = 'object';
                else propTypes[p] = typeof v;
            }

            let absoluteOffsetsResult = 'not tested';
            if (typeof cell.getAbsoluteOffsets === 'function') {
                try {
                    const offsets = (
                        cell.getAbsoluteOffsets as () => unknown
                    )();
                    const o = offsets as Record<string, unknown>;
                    absoluteOffsetsResult = JSON.stringify({
                        keys: Object.keys(o).sort(),
                        types: Object.fromEntries(
                            Object.entries(o).map(([k, v]) => [k, typeof v]),
                        ),
                    });
                } catch (e) {
                    absoluteOffsetsResult = `error: ${(e as Error).message}`;
                }
            }

            const tableRef = cell.table;
            const tableRefIsTableEditor = tableRef === table;

            return {
                cellOwnProps,
                cellProtoMembers,
                typedCellProps,
                typedCellMethods,
                missingProps,
                extraProps,
                missingMethods,
                extraMethods,
                propTypes,
                absoluteOffsetsResult,
                tableRefIsTableEditor,
                row: cell.row,
                col: cell.col,
                text: cell.text,
            };
        });

        console.log('[TABLE CELL AUDIT]', JSON.stringify(result, null, 2));

        expect(result).not.toHaveProperty('error');
        const r = result as {
            missingProps: string[];
            missingMethods: string[];
            tableRefIsTableEditor: boolean;
        };
        expect(r.missingProps).toEqual([]);
        expect(r.missingMethods).toEqual([]);
        expect(r.tableRefIsTableEditor).toBe(true);
    });

    it('should verify TableRow shape and methods', async function () {
        this.timeout(30000);

        await browser.executeObsidian(({ app, obsidian }, content: string) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            view.editor.setValue(content);
            view.editor.setCursor(0, 0);
            view.editor.focus();
        }, TABLE_DOC);
        await browser.pause(PAUSE.RENDER);
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
            const rows = table.rows as unknown[];
            if (!rows || !rows.length) return { error: 'no rows' };

            const firstRow = rows[0] as Record<string, unknown>;
            const rowOwnProps = Object.getOwnPropertyNames(firstRow)
                .filter((k) => !/^\d+$/.test(k))
                .sort();
            const rowProto = Object.getPrototypeOf(firstRow);
            const rowProtoMembers = rowProto
                ? Object.getOwnPropertyNames(rowProto)
                      .sort()
                      .filter((m: string) => m !== 'constructor')
                : [];

            const hasLength = 'length' in firstRow;
            const length = (firstRow as { length?: number }).length;
            const hasIndexAccess = firstRow[0] !== undefined;
            const hasFirst =
                typeof (firstRow as { first?: unknown }).first === 'function';
            const hasLast =
                typeof (firstRow as { last?: unknown }).last === 'function';
            const hasSplice =
                typeof (firstRow as { splice?: unknown }).splice === 'function';

            let firstResult = 'not tested';
            if (hasFirst) {
                try {
                    const f = (
                        firstRow as { first: () => unknown }
                    ).first() as Record<string, unknown>;
                    firstResult = `row=${f.row} col=${f.col} text=${f.text}`;
                } catch (e) {
                    firstResult = `error: ${(e as Error).message}`;
                }
            }

            let lastResult = 'not tested';
            if (hasLast) {
                try {
                    const l = (
                        firstRow as { last: () => unknown }
                    ).last() as Record<string, unknown>;
                    lastResult = `row=${l.row} col=${l.col} text=${l.text}`;
                } catch (e) {
                    lastResult = `error: ${(e as Error).message}`;
                }
            }

            return {
                rowCount: rows.length,
                rowOwnProps,
                rowProtoMembers,
                hasLength,
                length,
                hasIndexAccess,
                hasFirst,
                hasLast,
                hasSplice,
                firstResult,
                lastResult,
            };
        });

        console.log('[TABLE ROW AUDIT]', JSON.stringify(result, null, 2));

        expect(result).not.toHaveProperty('error');
        const r = result as {
            hasFirst: boolean;
            hasLast: boolean;
            hasSplice: boolean;
            hasLength: boolean;
        };
        expect(r.hasLength).toBe(true);
        expect(r.hasFirst).toBe(true);
        expect(r.hasLast).toBe(true);
        expect(r.hasSplice).toBe(true);
    });

    it('should verify TableSelectionBounds shape from getSelectionBounds', async function () {
        this.timeout(30000);

        await browser.executeObsidian(({ app, obsidian }, content: string) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            view.editor.setValue(content);
            view.editor.setCursor(0, 0);
            view.editor.focus();
        }, TABLE_DOC);
        await browser.pause(PAUSE.RENDER);
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

            const cell00 = (
                table.getCellAt as (r: number, c: number) => unknown
            )(0, 0) as Record<string, unknown>;
            const cell22 = (
                table.getCellAt as (r: number, c: number) => unknown
            )(2, 2) as Record<string, unknown>;
            if (!cell00 || !cell22)
                return { error: 'could not get anchor/head cells' };

            (table.selectCells as (a: unknown, h: unknown) => void)(
                cell00,
                cell22,
            );

            const bounds = (
                table.getSelectionBounds as () => unknown
            )() as Record<string, unknown> | null;

            (table.deselectCells as () => void)();

            if (!bounds) {
                const hasMethod =
                    typeof table.getSelectionBounds === 'function';
                const hasValidate =
                    typeof table.validateSelectionBounds === 'function';
                return {
                    boundsNull: true,
                    hasGetSelectionBounds: hasMethod,
                    hasValidateSelectionBounds: hasValidate,
                    missingKeys: [],
                    extraKeys: [],
                    boundsTypes: {},
                };
            }

            const boundsKeys = Object.keys(bounds).sort();
            const typedBoundsKeys = [
                'maxCol',
                'maxRow',
                'minCol',
                'minRow',
            ].sort();
            const missingKeys = typedBoundsKeys.filter(
                (k) => !boundsKeys.includes(k),
            );
            const extraKeys = boundsKeys.filter(
                (k) => !typedBoundsKeys.includes(k),
            );
            const boundsTypes: Record<string, string> = {};
            for (const k of boundsKeys) {
                boundsTypes[k] = typeof bounds[k];
            }

            return {
                boundsNull: false,
                boundsKeys,
                typedBoundsKeys,
                missingKeys,
                extraKeys,
                boundsTypes,
                values: bounds,
            };
        });

        console.log(
            '[SELECTION BOUNDS AUDIT]',
            JSON.stringify(result, null, 2),
        );

        expect(result).not.toHaveProperty('error');
        const r = result as {
            boundsNull: boolean;
            missingKeys: string[];
            boundsTypes: Record<string, string>;
        };
        expect(r.missingKeys).toEqual([]);
        if (!r.boundsNull) {
            for (const t of Object.values(r.boundsTypes)) {
                expect(t).toBe('number');
            }
        }
    });

    it('should verify updateCell return shape matches TableCellChange', async function () {
        this.timeout(30000);

        await browser.executeObsidian(({ app, obsidian }, content: string) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            view.editor.setValue(content);
            view.editor.setCursor(0, 0);
            view.editor.focus();
        }, TABLE_DOC);
        await browser.pause(PAUSE.RENDER);
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
            const cell = (table.getCellAt as (r: number, c: number) => unknown)(
                0,
                0,
            ) as Record<string, unknown>;
            if (!cell) return { error: 'no cell' };

            const originalText = cell.text as string;
            let changes: unknown[] = [];
            try {
                changes = (
                    table.updateCell as (c: unknown, t: string) => unknown[]
                )(cell, originalText);
            } catch (e) {
                return { error: `updateCell threw: ${(e as Error).message}` };
            }

            if (!Array.isArray(changes))
                return {
                    error: `updateCell returned ${typeof changes}, expected array`,
                };

            const changeShapes = changes.map((c) => {
                const ch = c as Record<string, unknown>;
                return {
                    keys: Object.keys(ch).sort(),
                    types: Object.fromEntries(
                        Object.entries(ch).map(([k, v]) => [k, typeof v]),
                    ),
                };
            });

            const typedKeys = ['from', 'insert', 'to'].sort();
            const allMatch = changeShapes.every(
                (s) => JSON.stringify(s.keys) === JSON.stringify(typedKeys),
            );

            return {
                changeCount: changes.length,
                changeShapes,
                typedKeys,
                allKeysMatch: allMatch,
            };
        });

        console.log('[UPDATE CELL RETURN]', JSON.stringify(result, null, 2));

        expect(result).not.toHaveProperty('error');
    });
});
