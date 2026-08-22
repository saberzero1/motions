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

describe('Spike: deep audit of TableCell extra methods and TableRow backing', function () {
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

    it('should introspect all 7 extra TableCell prototype methods', async function () {
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

            const cell = (table.getCellAt as (r: number, c: number) => unknown)(
                0,
                0,
            ) as Record<string, unknown> | null;
            if (!cell) return { error: 'getCellAt(0,0) returned null' };

            const methods: Record<
                string,
                {
                    exists: boolean;
                    arity: number;
                    result?: string;
                    error?: string;
                }
            > = {};

            const extraMethodNames = [
                'getLength',
                'getTextWithPadding',
                'handleMobileCaretDrag',
                'init',
                'lockDimensions',
                'scrollIntoView',
                'updateWidth',
            ];

            for (const name of extraMethodNames) {
                const fn = (cell as Record<string, unknown>)[name];
                if (typeof fn !== 'function') {
                    methods[name] = { exists: false, arity: -1 };
                    continue;
                }
                methods[name] = {
                    exists: true,
                    arity: (fn as Function).length,
                };
            }

            // Safe calls — read-only methods
            try {
                const len = (cell as { getLength: () => unknown }).getLength();
                methods['getLength'].result =
                    `${typeof len}: ${JSON.stringify(len)}`;
            } catch (e) {
                methods['getLength'].error = (e as Error).message;
            }

            try {
                const padded = (
                    cell as { getTextWithPadding: () => unknown }
                ).getTextWithPadding();
                methods['getTextWithPadding'].result =
                    `${typeof padded}: ${JSON.stringify(padded)}`;
            } catch (e) {
                methods['getTextWithPadding'].error = (e as Error).message;
            }

            // Check init — look at what it expects by examining function source
            const initSrc = (cell as { init: Function }).init
                .toString()
                .slice(0, 200);
            methods['init'].result = `source: ${initSrc}`;

            // lockDimensions — likely DOM-related, try calling
            try {
                const lockResult = (
                    cell as { lockDimensions: () => unknown }
                ).lockDimensions();
                methods['lockDimensions'].result =
                    `${typeof lockResult}: ${JSON.stringify(lockResult)}`;
            } catch (e) {
                methods['lockDimensions'].error = (e as Error).message;
            }

            // scrollIntoView — likely void, try calling
            try {
                const scrollResult = (
                    cell as { scrollIntoView: () => unknown }
                ).scrollIntoView();
                methods['scrollIntoView'].result =
                    `${typeof scrollResult}: ${JSON.stringify(scrollResult)}`;
            } catch (e) {
                methods['scrollIntoView'].error = (e as Error).message;
            }

            // updateWidth — look at source
            const updateWidthSrc = (
                cell as { updateWidth: Function }
            ).updateWidth
                .toString()
                .slice(0, 200);
            methods['updateWidth'].result = `source: ${updateWidthSrc}`;

            // handleMobileCaretDrag — look at arity and source
            const handleDragSrc = (
                cell as { handleMobileCaretDrag: Function }
            ).handleMobileCaretDrag
                .toString()
                .slice(0, 200);
            methods['handleMobileCaretDrag'].result =
                `source: ${handleDragSrc}`;

            // Also check: does the prototype chain suggest these are defined
            // at the same level as getAbsoluteOffsets/setTextDir?
            const proto = Object.getPrototypeOf(cell);
            const protoMembers = proto
                ? Object.getOwnPropertyNames(proto).sort()
                : [];
            const proto2 = proto ? Object.getPrototypeOf(proto) : null;
            const proto2Members = proto2
                ? Object.getOwnPropertyNames(proto2).sort()
                : [];

            return {
                methods,
                cellProtoMembers: protoMembers,
                cellProto2Members: proto2Members,
                cellProtoConstructorName:
                    proto?.constructor?.name ?? 'anonymous',
                cellProto2ConstructorName:
                    proto2?.constructor?.name ?? 'anonymous',
            };
        });

        console.log(
            '[TABLE CELL EXTRA METHODS]',
            JSON.stringify(result, null, 2),
        );

        expect(result).not.toHaveProperty('error');
    });

    it('should introspect TableRow prototype chain and determine backing type', async function () {
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

            // Is it a real Array?
            const isArray = Array.isArray(firstRow);

            // Constructor chain
            const constructorName = firstRow.constructor?.name ?? 'anonymous';

            // Prototype chain
            const protoChain: Array<{
                depth: number;
                constructorName: string;
                isArrayProto: boolean;
                members: string[];
            }> = [];
            let proto = Object.getPrototypeOf(firstRow);
            let depth = 0;
            while (proto && depth < 5) {
                const members = Object.getOwnPropertyNames(proto).sort();
                protoChain.push({
                    depth,
                    constructorName: proto.constructor?.name ?? 'anonymous',
                    isArrayProto: proto === Array.prototype,
                    members,
                });
                proto = Object.getPrototypeOf(proto);
                depth++;
            }

            // Check if first() and last() come from Array.prototype or are custom
            const firstFromArrayProto =
                (firstRow as { first?: Function }).first ===
                (Array.prototype as unknown as { first?: Function }).first;
            const lastFromArrayProto =
                (firstRow as { last?: Function }).last ===
                (Array.prototype as unknown as { last?: Function }).last;
            const spliceFromArrayProto =
                (firstRow as { splice?: Function }).splice ===
                Array.prototype.splice;

            // Check instance tests
            const instanceOfArray = firstRow instanceof Array;

            // Check own properties vs inherited
            const ownProps = Object.getOwnPropertyNames(firstRow).sort();
            const ownPropDescriptors: Record<
                string,
                {
                    writable?: boolean;
                    enumerable?: boolean;
                    configurable?: boolean;
                    isAccessor: boolean;
                }
            > = {};
            for (const p of ownProps) {
                const desc = Object.getOwnPropertyDescriptor(firstRow, p);
                if (desc) {
                    ownPropDescriptors[p] = {
                        writable: desc.writable,
                        enumerable: desc.enumerable,
                        configurable: desc.configurable,
                        isAccessor: 'get' in desc || 'set' in desc,
                    };
                }
            }

            // Check indexed access with numeric keys
            const numericKeys = Object.getOwnPropertyNames(firstRow).filter(
                (k) => /^\d+$/.test(k),
            );
            const cellAtIndex0 = firstRow[0] as
                | Record<string, unknown>
                | undefined;
            const cellAtIndex0IsCell = cellAtIndex0
                ? typeof cellAtIndex0.row === 'number' &&
                  typeof cellAtIndex0.col === 'number'
                : false;

            // Does it have Symbol.iterator?
            const hasIterator =
                Symbol.iterator in (firstRow as Record<symbol, unknown>);

            return {
                isArray,
                instanceOfArray,
                constructorName,
                protoChain,
                firstFromArrayProto,
                lastFromArrayProto,
                spliceFromArrayProto,
                ownProps,
                ownPropDescriptors,
                numericKeyCount: numericKeys.length,
                cellAtIndex0IsCell,
                hasIterator,
            };
        });

        console.log('[TABLE ROW DEEP AUDIT]', JSON.stringify(result, null, 2));

        expect(result).not.toHaveProperty('error');
        const r = result as { isArray: boolean; instanceOfArray: boolean };
        console.log(
            `Row is Array: ${r.isArray}, instanceof Array: ${r.instanceOfArray}`,
        );
    });

    it('should introspect TableEditor clear() method', async function () {
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

            const hasClear = typeof table.clear === 'function';
            const clearArity = hasClear ? (table.clear as Function).length : -1;
            const clearSrc = hasClear
                ? (table.clear as Function).toString().slice(0, 300)
                : 'N/A';

            // Where does clear live in the proto chain?
            let clearProtoDepth = -1;
            let proto = Object.getPrototypeOf(table);
            let depth = 0;
            while (proto && depth < 5) {
                if (Object.getOwnPropertyNames(proto).includes('clear')) {
                    clearProtoDepth = depth;
                    break;
                }
                proto = Object.getPrototypeOf(proto);
                depth++;
            }

            return {
                hasClear,
                clearArity,
                clearProtoDepth,
                clearSrc,
            };
        });

        console.log('[TABLE EDITOR CLEAR]', JSON.stringify(result, null, 2));

        expect(result).not.toHaveProperty('error');
    });
});
