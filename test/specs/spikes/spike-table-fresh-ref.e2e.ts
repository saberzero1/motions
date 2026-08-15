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

describe('Spike: fresh table reference acquisition', function () {
    before(async function () {
        this.timeout(30000);
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await ensureLivePreview();
    });

    it('should enumerate ALL properties on widget DOM element', async function () {
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

        const result = await browser.executeObsidian(() => {
            const widgetEl = document.querySelector(
                '.cm-table-widget',
            ) as HTMLElement | null;
            if (!widgetEl) return { error: 'no widget' };

            const ownKeys = Object.getOwnPropertyNames(widgetEl)
                .filter((k) => !k.startsWith('__') && k !== 'style')
                .slice(0, 30);

            const allKeys: string[] = [];
            for (const key in widgetEl) {
                if (key.startsWith('on') || key.startsWith('__')) continue;
                const val = (widgetEl as Record<string, unknown>)[key];
                if (
                    val !== null &&
                    val !== undefined &&
                    typeof val === 'object'
                ) {
                    const obj = val as Record<string, unknown>;
                    const hasTableMethods =
                        typeof obj.getCellAt === 'function' ||
                        typeof obj.insertRow === 'function' ||
                        typeof obj.receiveCellFocus === 'function';
                    if (hasTableMethods) {
                        allKeys.push(`${key}: HAS TABLE METHODS`);
                    }
                }
            }

            const parentEl = widgetEl.parentElement;
            const parentKeys: string[] = [];
            if (parentEl) {
                for (const key in parentEl) {
                    if (key.startsWith('on') || key.startsWith('__')) continue;
                    const val = (parentEl as Record<string, unknown>)[key];
                    if (
                        val !== null &&
                        val !== undefined &&
                        typeof val === 'object'
                    ) {
                        const obj = val as Record<string, unknown>;
                        if (
                            typeof obj.widget === 'object' &&
                            obj.widget !== null
                        ) {
                            const w = obj.widget as Record<string, unknown>;
                            if (typeof w.getCellAt === 'function') {
                                parentKeys.push(`${key}.widget: HAS getCellAt`);
                            }
                        }
                    }
                }
            }

            const grandParentEl = parentEl?.parentElement;
            const gpKeys: string[] = [];
            if (grandParentEl) {
                for (const key of Object.getOwnPropertyNames(grandParentEl)) {
                    const val = (grandParentEl as Record<string, unknown>)[key];
                    if (
                        val !== null &&
                        val !== undefined &&
                        typeof val === 'object'
                    ) {
                        const obj = val as Record<string, unknown>;
                        if (
                            obj.widget &&
                            typeof (obj.widget as Record<string, unknown>)
                                .getCellAt === 'function'
                        ) {
                            gpKeys.push(`${key}.widget: HAS getCellAt`);
                        }
                    }
                }
            }

            const cmTile = (widgetEl as Record<string, unknown>).cmTile;
            let cmTileInfo = 'not found';
            let cmTileWidget: unknown = null;
            if (cmTile && typeof cmTile === 'object') {
                const tile = cmTile as Record<string, unknown>;
                const tileKeys = Object.getOwnPropertyNames(tile).slice(0, 20);
                cmTileInfo = JSON.stringify(tileKeys);
                if (tile.widget) {
                    cmTileWidget = tile.widget;
                    const w = tile.widget as Record<string, unknown>;
                    const wKeys = Object.getOwnPropertyNames(w).slice(0, 15);
                    const hasCellAt = typeof w.getCellAt === 'function';
                    const hasInsertRow = typeof w.insertRow === 'function';
                    const hasRows = Array.isArray(w.rows);
                    cmTileInfo += ` | widget keys: ${JSON.stringify(wKeys)} | getCellAt=${hasCellAt} insertRow=${hasInsertRow} rows=${hasRows}`;
                }
            }

            return { ownKeys, allKeys, parentKeys, gpKeys, cmTileInfo };
        });

        console.log('[WIDGET PROPS]', JSON.stringify(result, null, 2));
    });

    it('should discover table editor from CM6 view internals', async function () {
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

        const result = await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'no view' };
            const editorView = (
                view.editor as unknown as { cm?: Record<string, unknown> }
            ).cm as Record<string, unknown> | undefined;
            if (!editorView) return { error: 'no editorView' };

            const widgetEl = document.querySelector(
                '.cm-table-widget',
            ) as HTMLElement | null;
            if (!widgetEl) return { error: 'no widget' };

            let pos = -1;
            try {
                pos = (
                    editorView as unknown as {
                        posAtDOM: (node: Node, offset: number) => number;
                    }
                ).posAtDOM(widgetEl, 0);
            } catch {
                void 0;
            }

            const docChildren = (
                editorView as unknown as { docView?: { children?: unknown[] } }
            ).docView?.children;
            const docChildCount = Array.isArray(docChildren)
                ? docChildren.length
                : -1;

            let widgetFromDocView: unknown = null;
            if (Array.isArray(docChildren)) {
                for (const child of docChildren) {
                    const c = child as Record<string, unknown>;
                    if (c.widget && typeof c.widget === 'object') {
                        const w = c.widget as Record<string, unknown>;
                        if (
                            typeof w.getCellAt === 'function' ||
                            typeof w.insertRow === 'function'
                        ) {
                            widgetFromDocView = w;
                            break;
                        }
                    }
                    if (c.children && Array.isArray(c.children)) {
                        for (const grandchild of c.children as Record<
                            string,
                            unknown
                        >[]) {
                            if (
                                grandchild.widget &&
                                typeof grandchild.widget === 'object'
                            ) {
                                const w = grandchild.widget as Record<
                                    string,
                                    unknown
                                >;
                                if (
                                    typeof w.getCellAt === 'function' ||
                                    typeof w.insertRow === 'function'
                                ) {
                                    widgetFromDocView = w;
                                    break;
                                }
                            }
                        }
                        if (widgetFromDocView) break;
                    }
                }
            }

            const foundViaDocView = widgetFromDocView !== null;
            let docViewWidgetInsertRow = false;
            let docViewWidgetGetCellAt = false;
            if (widgetFromDocView) {
                const w = widgetFromDocView as Record<string, unknown>;
                docViewWidgetInsertRow = typeof w.insertRow === 'function';
                docViewWidgetGetCellAt = typeof w.getCellAt === 'function';
            }

            return {
                posAtDOM: pos,
                docChildCount,
                foundViaDocView,
                docViewWidgetInsertRow,
                docViewWidgetGetCellAt,
            };
        });

        console.log('[DOCVIEW DISCOVERY]', JSON.stringify(result, null, 2));
    });

    it('should discover how to get ObsidianTableEditor from widget DOM', async function () {
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
            const containerEl = table.containerEl as HTMLElement;

            const widgetEl = document.querySelector(
                '.cm-table-widget',
            ) as HTMLElement | null;
            if (!widgetEl) return { error: 'no widget' };

            const cmViewProp = (
                widgetEl as unknown as { cmView?: { widget?: unknown } }
            ).cmView;
            const hasCmView = cmViewProp !== undefined;
            let widgetObj: unknown = null;
            if (cmViewProp?.widget) {
                widgetObj = cmViewProp.widget;
            }

            const widgetIsTable = widgetObj === table;
            const widgetKeys = widgetObj
                ? Object.getOwnPropertyNames(widgetObj).sort().slice(0, 20)
                : [];

            const protoKeys: string[] = [];
            if (widgetObj) {
                let proto = Object.getPrototypeOf(widgetObj);
                let depth = 0;
                while (proto && depth < 4) {
                    protoKeys.push(
                        `[${depth}]: ${Object.getOwnPropertyNames(proto).sort().slice(0, 15).join(', ')}`,
                    );
                    proto = Object.getPrototypeOf(proto);
                    depth++;
                }
            }

            const widgetHasInsertRow = widgetObj
                ? typeof (widgetObj as Record<string, unknown>).insertRow ===
                  'function'
                : false;
            const widgetHasGetCellAt = widgetObj
                ? typeof (widgetObj as Record<string, unknown>).getCellAt ===
                  'function'
                : false;
            const widgetHasReceiveCellFocus = widgetObj
                ? typeof (widgetObj as Record<string, unknown>)
                      .receiveCellFocus === 'function'
                : false;

            return {
                hasCmView,
                widgetIsTable,
                widgetKeys,
                protoKeys,
                widgetHasInsertRow,
                widgetHasGetCellAt,
                widgetHasReceiveCellFocus,
                containerElIsWidget: containerEl === widgetEl,
                containerElParentIsWidget:
                    containerEl.parentElement === widgetEl,
            };
        });

        console.log('[WIDGET DISCOVERY]', JSON.stringify(result, null, 2));
    });

    it('should verify cmTile.widget provides fresh table ref after cell editor destroy', async function () {
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
            if (!editMode?.tableCell)
                return { error: 'no tableCell before destroy' };

            const tableViaEditMode = (
                editMode.tableCell as Record<string, unknown>
            ).table;

            (editMode.destroyTableCell as () => void)();

            const afterDestroyTableCell = editMode.tableCell;

            const widgetEl = document.querySelector(
                '.cm-table-widget',
            ) as HTMLElement | null;
            if (!widgetEl) return { error: 'no widget after destroy' };

            const cmTile = (widgetEl as unknown as Record<string, unknown>)
                .cmTile as Record<string, unknown> | undefined;
            const tileWidget = cmTile?.widget as
                | Record<string, unknown>
                | undefined;

            const hasCellAt = typeof tileWidget?.getCellAt === 'function';
            const hasInsertRow = typeof tileWidget?.insertRow === 'function';
            const hasReceiveCellFocus =
                typeof tileWidget?.receiveCellFocus === 'function';
            const hasSetCellFocus =
                typeof tileWidget?.setCellFocus === 'function';
            const hasPlaceCursorAround =
                typeof tileWidget?.placeCursorAround === 'function';
            const rowCount = Array.isArray(tileWidget?.rows)
                ? (tileWidget!.rows as unknown[]).length
                : -1;

            const isSameAsEditModeRef = tileWidget === tableViaEditMode;

            let getCellResult = 'not tested';
            if (tileWidget && hasCellAt) {
                try {
                    const cell = (
                        tileWidget.getCellAt as (
                            r: number,
                            c: number,
                        ) => unknown
                    )(0, 0);
                    if (cell) {
                        const c = cell as Record<string, unknown>;
                        getCellResult = `row=${c.row} col=${c.col} text=${c.text} elConnected=${(c.el as HTMLElement)?.isConnected}`;
                    } else {
                        getCellResult = 'null';
                    }
                } catch (e) {
                    getCellResult = `error: ${(e as Error).message}`;
                }
            }

            let receiveFocusResult = 'not tested';
            if (tileWidget && hasReceiveCellFocus) {
                try {
                    const cellEditor = (
                        tileWidget.receiveCellFocus as (
                            r: number,
                            c: number,
                        ) => unknown
                    )(0, 1);
                    receiveFocusResult = cellEditor ? 'success' : 'null';
                    const afterFocus = editMode.tableCell;
                    receiveFocusResult += ` | tableCell=${afterFocus !== null ? 'set' : 'null'}`;
                } catch (e) {
                    receiveFocusResult = `error: ${(e as Error).message}`;
                }
            }

            return {
                afterDestroyIsNull: afterDestroyTableCell === null,
                widgetStillExists: true,
                isSameAsEditModeRef,
                hasCellAt,
                hasInsertRow,
                hasReceiveCellFocus,
                hasSetCellFocus,
                hasPlaceCursorAround,
                rowCount,
                getCellResult,
                receiveFocusResult,
            };
        });

        console.log('[CMTILE FRESH REF]', JSON.stringify(result, null, 2));
    });

    it('should test getting fresh table ref after destroying and recreating cell editor', async function () {
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
            const tc1 = editMode?.tableCell as Record<string, unknown> | null;
            if (!tc1) return { error: 'no initial tableCell' };

            const table1 = tc1.table as Record<string, unknown>;
            const table1Id = String(table1);

            (editMode.destroyTableCell as () => void)();
            const afterDestroy = editMode.tableCell;

            const widgetEl = document.querySelector(
                '.cm-table-widget',
            ) as HTMLElement | null;
            if (!widgetEl) return { error: 'no widget after destroy' };

            const cmView = (
                widgetEl as unknown as { cmView?: { widget?: unknown } }
            ).cmView;
            const widgetObj = cmView?.widget as Record<string, unknown> | null;
            const widgetHasInsertRow = widgetObj
                ? typeof widgetObj.insertRow === 'function'
                : false;

            let freshTableFromWidget: Record<string, unknown> | null = null;
            let freshTableInsertRow = false;
            let freshTableGetCellAt = false;
            let freshTableRowCount = -1;

            if (widgetObj && widgetHasInsertRow) {
                freshTableFromWidget = widgetObj;
                freshTableInsertRow = typeof widgetObj.insertRow === 'function';
                freshTableGetCellAt = typeof widgetObj.getCellAt === 'function';
                freshTableRowCount = Array.isArray(widgetObj.rows)
                    ? (widgetObj.rows as unknown[]).length
                    : -1;
            }

            let getCellResult = 'not tested';
            if (freshTableFromWidget && freshTableGetCellAt) {
                try {
                    const cell = (
                        freshTableFromWidget.getCellAt as (
                            r: number,
                            c: number,
                        ) => unknown
                    )(0, 0);
                    if (cell) {
                        const c = cell as Record<string, unknown>;
                        getCellResult = `row=${c.row} col=${c.col} text=${c.text} elConnected=${(c.el as HTMLElement)?.isConnected}`;
                    } else {
                        getCellResult = 'null';
                    }
                } catch (e) {
                    getCellResult = `error: ${(e as Error).message}`;
                }
            }

            return {
                afterDestroyIsNull: afterDestroy === null,
                widgetStillExists: widgetEl !== null,
                widgetHasInsertRow,
                freshTableInsertRow,
                freshTableGetCellAt,
                freshTableRowCount,
                getCellResult,
                isSameAsOriginal: freshTableFromWidget === table1,
            };
        });

        console.log('[FRESH REF]', JSON.stringify(result, null, 2));
    });
});
