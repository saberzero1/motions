import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

const PAUSE = { SETTLE: 500, RENDER: 2000, LONG: 3000 } as const;
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

describe('Spike: cell editor introspection', function () {
    before(async function () {
        this.timeout(30000);
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await ensureLivePreview();
    });

    it('should dump tableCell.cell properties and test navigation APIs', async function () {
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

        const info = await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'no view' };
            const editMode = (view as unknown as Record<string, unknown>)
                .editMode as Record<string, unknown>;
            const tc = editMode?.tableCell as Record<string, unknown> | null;
            if (!tc) return { error: 'no tableCell' };

            const cell = tc.cell as Record<string, unknown> | null;
            if (!cell)
                return {
                    error: 'no cell property',
                    tcKeys: Object.getOwnPropertyNames(tc),
                };

            const cellKeys = Object.getOwnPropertyNames(cell).sort();
            const vals: Record<string, string> = {};
            for (const k of cellKeys) {
                const v = cell[k];
                if (v === null) vals[k] = 'null';
                else if (v === undefined) vals[k] = 'undefined';
                else if (typeof v === 'function') vals[k] = 'function';
                else if (typeof v === 'object') vals[k] = 'object';
                else vals[k] = String(v);
            }

            const table = tc.table as Record<string, unknown> | null;
            const tableHasGetCellBelow = table
                ? typeof table.getCellBelow === 'function'
                : false;
            const tableHasGetNextCell = table
                ? typeof table.getNextCell === 'function'
                : false;
            const tableHasSetCellFocus = table
                ? typeof table.setCellFocus === 'function'
                : false;
            const tableHasPlaceCursorAround = table
                ? typeof table.placeCursorAround === 'function'
                : false;

            let cellBelowResult = 'not tested';
            if (table && tableHasGetCellBelow) {
                try {
                    const below = (
                        table.getCellBelow as (c: unknown) => unknown
                    )(cell);
                    if (below) {
                        const b = below as Record<string, unknown>;
                        cellBelowResult = `row=${b.row} col=${b.col} text=${b.text}`;
                    } else {
                        cellBelowResult = 'null';
                    }
                } catch (e) {
                    cellBelowResult = `error: ${(e as Error).message}`;
                }
            }

            return {
                cellKeys,
                vals,
                hasRow: 'row' in cell,
                hasCol: 'col' in cell,
                hasTable: 'table' in cell,
                row: cell.row,
                col: cell.col,
                text: cell.text,
                tableHasGetCellBelow,
                tableHasGetNextCell,
                tableHasSetCellFocus,
                tableHasPlaceCursorAround,
                cellBelowResult,
            };
        });

        console.log('[CELL.CELL INTROSPECT]', JSON.stringify(info, null, 2));
    });

    it('should identify gutter contents in cell editor', async function () {
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

        const gutterInfo = await browser.executeObsidian(
            ({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return { error: 'no view' };
                const editMode = (view as unknown as Record<string, unknown>)
                    .editMode as Record<string, unknown>;
                const tc = editMode?.tableCell as Record<
                    string,
                    unknown
                > | null;
                if (!tc) return { error: 'no tableCell' };

                const cellCm = tc.cm as { dom?: HTMLElement } | null;
                if (!cellCm?.dom) return { error: 'no cell dom' };

                const gutters = cellCm.dom.querySelector('.cm-gutters');
                if (!gutters) return { hasGutter: false, children: [] };

                const children: string[] = [];
                for (let i = 0; i < gutters.children.length; i++) {
                    const child = gutters.children[i];
                    children.push(child.className);
                }

                return {
                    hasGutter: true,
                    childCount: gutters.children.length,
                    children,
                };
            },
        );

        console.log('[GUTTER INTROSPECT]', JSON.stringify(gutterInfo, null, 2));
    });

    it('should probe BOTH main and cell editor cursor state simultaneously', async function () {
        this.timeout(60000);

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
        }, 'Line above\n\n| AA | BB |\n|-----|-----|\n| cc | dd |\n\nLine below');
        await browser.pause(PAUSE.RENDER);

        await browser.keys(['j', 'j']);
        await browser.pause(PAUSE.SETTLE);
        await browser
            .saveScreenshot('/tmp/opencode/cursor-dual-normal.png')
            .catch(() => {});

        const dualNormal = await browser.executeObsidian(
            ({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return { error: 'no view' };
                const editMode = (view as unknown as Record<string, unknown>)
                    .editMode as Record<string, unknown>;

                const mainCm = editMode?.cm as {
                    dom?: HTMLElement;
                    scrollDOM?: HTMLElement;
                    cm?: Record<string, unknown>;
                };
                const mainFatCursors: string[] = [];
                mainCm?.dom
                    ?.querySelectorAll('.cm-fat-cursor')
                    .forEach((el) =>
                        mainFatCursors.push((el as HTMLElement).className),
                    );
                const mainVimLayer = mainCm?.scrollDOM?.querySelector(
                    '.cm-vimCursorLayer',
                ) as HTMLElement | null;
                const mainNativeLayers: Array<{
                    display: string;
                    computedDisplay: string;
                    children: number;
                }> = [];
                mainCm?.scrollDOM
                    ?.querySelectorAll(
                        '.cm-cursorLayer:not(.cm-vimCursorLayer)',
                    )
                    .forEach((el) => {
                        const h = el as HTMLElement;
                        mainNativeLayers.push({
                            display: h.style.display,
                            computedDisplay: getComputedStyle(h).display,
                            children: h.children.length,
                        });
                    });
                const mainVim = (
                    mainCm?.cm?.state as Record<string, unknown> | undefined
                )?.vim as Record<string, unknown> | undefined;
                const mainFocused =
                    mainCm?.dom?.classList.contains('cm-focused') ?? false;
                const mainScrollClasses =
                    (mainCm as { scrollDOM?: HTMLElement }).scrollDOM
                        ?.className ?? '';

                const tc = editMode?.tableCell as Record<
                    string,
                    unknown
                > | null;
                const cellCm = tc?.cm as
                    | {
                          dom?: HTMLElement;
                          scrollDOM?: HTMLElement;
                          cm?: Record<string, unknown>;
                      }
                    | undefined;
                const cellFatCursors: string[] = [];
                cellCm?.dom
                    ?.querySelectorAll('.cm-fat-cursor')
                    .forEach((el) =>
                        cellFatCursors.push((el as HTMLElement).className),
                    );
                const cellVimLayer = cellCm?.scrollDOM?.querySelector(
                    '.cm-vimCursorLayer',
                ) as HTMLElement | null;
                const cellNativeLayers: Array<{
                    display: string;
                    computedDisplay: string;
                    children: number;
                }> = [];
                cellCm?.scrollDOM
                    ?.querySelectorAll(
                        '.cm-cursorLayer:not(.cm-vimCursorLayer)',
                    )
                    .forEach((el) => {
                        const h = el as HTMLElement;
                        cellNativeLayers.push({
                            display: h.style.display,
                            computedDisplay: getComputedStyle(h).display,
                            children: h.children.length,
                        });
                    });
                const cellVim = (
                    cellCm?.cm?.state as Record<string, unknown> | undefined
                )?.vim as Record<string, unknown> | undefined;
                const cellFocused =
                    cellCm?.dom?.classList.contains('cm-focused') ?? false;
                const cellScrollClasses =
                    (cellCm as { scrollDOM?: HTMLElement } | undefined)
                        ?.scrollDOM?.className ?? '';

                return {
                    main: {
                        focused: mainFocused,
                        scrollClasses: mainScrollClasses,
                        mode: mainVim?.insertMode
                            ? 'insert'
                            : mainVim?.visualMode
                              ? 'visual'
                              : 'normal',
                        fatCursors: mainFatCursors,
                        vimLayerDisplay:
                            mainVimLayer?.style.display ?? 'MISSING',
                        vimLayerChildren: mainVimLayer?.children.length ?? 0,
                        nativeLayers: mainNativeLayers,
                    },
                    cell: {
                        focused: cellFocused,
                        scrollClasses: cellScrollClasses,
                        mode: cellVim?.insertMode
                            ? 'insert'
                            : cellVim?.visualMode
                              ? 'visual'
                              : 'normal',
                        fatCursors: cellFatCursors,
                        vimLayerDisplay:
                            cellVimLayer?.style.display ?? 'MISSING',
                        vimLayerChildren: cellVimLayer?.children.length ?? 0,
                        nativeLayers: cellNativeLayers,
                    },
                };
            },
        );
        console.log('[DUAL cell-normal]', JSON.stringify(dualNormal, null, 2));

        const animCheck = await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { error: 'no view' };
            const editMode = (view as unknown as Record<string, unknown>)
                .editMode as Record<string, unknown>;
            const tc = editMode?.tableCell as Record<string, unknown> | null;
            if (!tc) return { error: 'no tableCell' };
            const cellCm = tc.cm as {
                dom?: HTMLElement;
                scrollDOM?: HTMLElement;
            } | null;
            if (!cellCm?.dom) return { error: 'no cell dom' };
            const hasAnimClass = cellCm.dom.classList.contains(
                'vim-motions-animated-cursor',
            );
            const canvas = document.querySelector(
                '.vim-motions-animated-cursor-canvas',
            ) as HTMLCanvasElement | null;

            let canvasHasContent = false;
            if (canvas) {
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    const data = ctx.getImageData(
                        0,
                        0,
                        canvas.width,
                        canvas.height,
                    ).data;
                    for (let i = 3; i < data.length; i += 4) {
                        if (data[i] > 0) {
                            canvasHasContent = true;
                            break;
                        }
                    }
                }
            }

            const cellVimLayer = cellCm.scrollDOM?.querySelector(
                '.cm-vimCursorLayer',
            ) as HTMLElement | null;
            const cellVimLayerDisplay = cellVimLayer
                ? getComputedStyle(cellVimLayer).display
                : 'MISSING';
            const cellFatCursors =
                cellCm.dom.querySelectorAll('.cm-fat-cursor').length;

            const activeElement = document.activeElement;
            const cellContentDOM = cellCm.dom.querySelector('.cm-content');
            const cellHasFocusDOM = cellCm.dom.classList.contains('cm-focused');
            const cellContentIsActive = cellContentDOM === activeElement;
            const cellContentContainsActive =
                cellContentDOM?.contains(activeElement ?? document.body) ??
                false;

            const tickCount =
                (window as unknown as Record<string, unknown>)
                    .__animCursorTickCount ?? 'not set';
            const drawCount =
                (window as unknown as Record<string, unknown>)
                    .__animCursorDrawCount ?? 'not set';
            let coordsResult = 'untested';
            try {
                const cellEditorView = cellCm as unknown as {
                    coordsAtPos?: (
                        pos: number,
                        side?: number,
                    ) => {
                        left: number;
                        right: number;
                        top: number;
                        bottom: number;
                    } | null;
                    state?: { selection?: { main?: { head?: number } } };
                };
                const head = cellEditorView.state?.selection?.main?.head;
                if (typeof head === 'number' && cellEditorView.coordsAtPos) {
                    const coords = cellEditorView.coordsAtPos(head, 1);
                    const pane = (
                        cellCm.scrollDOM as HTMLElement
                    ).getBoundingClientRect();
                    coordsResult = JSON.stringify({
                        coords,
                        pane: {
                            left: Math.round(pane.left),
                            top: Math.round(pane.top),
                            right: Math.round(pane.right),
                            bottom: Math.round(pane.bottom),
                            width: Math.round(pane.width),
                            height: Math.round(pane.height),
                        },
                        head,
                    });
                }
            } catch (e) {
                coordsResult = `error: ${(e as Error).message}`;
            }

            return {
                hasAnimClass,
                canvasExists: !!canvas,
                canvasHasContent,
                cellVimLayerDisplay,
                cellFatCursors,
                cursorSource: canvasHasContent
                    ? 'canvas (animated)'
                    : cellFatCursors > 0
                      ? 'DOM (native vim)'
                      : 'NONE',
                cellHasFocusDOM,
                cellContentIsActive,
                cellContentContainsActive,
                coordsResult,
                tickCount,
                drawCount,
                lastRect:
                    (window as unknown as Record<string, unknown>)
                        .__animCursorLastRect ?? 'not set',
                lastShape:
                    (window as unknown as Record<string, unknown>)
                        .__animCursorLastShape ?? 'not set',
                lastAlpha:
                    (window as unknown as Record<string, unknown>)
                        .__animCursorLastAlpha ?? 'not set',
                lastHasFocus:
                    (window as unknown as Record<string, unknown>)
                        .__animCursorHasFocus ?? 'not set',
            };
        });
        console.log('[ANIM CHECK]', JSON.stringify(animCheck, null, 2));

        const stackingCheck = await browser.executeObsidian(
            ({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return { error: 'no view' };
                const editMode = (view as unknown as Record<string, unknown>)
                    .editMode as Record<string, unknown>;
                const tc = editMode?.tableCell as Record<
                    string,
                    unknown
                > | null;
                if (!tc) return { error: 'no tableCell' };
                const cellCm = tc.cm as {
                    dom?: HTMLElement;
                    scrollDOM?: HTMLElement;
                } | null;
                if (!cellCm?.dom) return { error: 'no dom' };

                const canvas = document.querySelector(
                    '.vim-motions-animated-cursor-canvas',
                ) as HTMLElement | null;
                const canvasZIndex = canvas
                    ? getComputedStyle(canvas).zIndex
                    : 'N/A';
                const canvasParent =
                    canvas?.parentElement?.className?.slice(0, 40) ?? 'N/A';

                const chain: Array<{
                    tag: string;
                    cls: string;
                    zIndex: string;
                    position: string;
                    overflow: string;
                }> = [];
                let el: HTMLElement | null = cellCm.dom;
                while (el && chain.length < 10) {
                    const s = getComputedStyle(el);
                    chain.push({
                        tag: el.tagName,
                        cls: el.className.slice(0, 30),
                        zIndex: s.zIndex,
                        position: s.position,
                        overflow: s.overflow.slice(0, 20),
                    });
                    el = el.parentElement;
                }

                const fullChain: Array<{
                    tag: string;
                    cls: string;
                    zIndex: string;
                    position: string;
                }> = [];
                let el2: HTMLElement | null = cellCm.dom;
                while (el2) {
                    const s2 = getComputedStyle(el2);
                    if (s2.zIndex !== 'auto' || s2.position !== 'static') {
                        fullChain.push({
                            tag: el2.tagName,
                            cls: el2.className.slice(0, 40),
                            zIndex: s2.zIndex,
                            position: s2.position,
                        });
                    }
                    el2 = el2.parentElement;
                }
                return {
                    canvasZIndex,
                    canvasParent,
                    stackingContexts: fullChain,
                };
            },
        );
        console.log('[STACKING]', JSON.stringify(stackingCheck, null, 2));

        await browser.keys(['i']);
        await browser.pause(PAUSE.SETTLE);
        await browser
            .saveScreenshot('/tmp/opencode/cursor-dual-insert.png')
            .catch(() => {});

        const dualInsert = await browser.executeObsidian(
            ({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return { error: 'no view' };
                const editMode = (view as unknown as Record<string, unknown>)
                    .editMode as Record<string, unknown>;

                const mainCm = editMode?.cm as {
                    dom?: HTMLElement;
                    scrollDOM?: HTMLElement;
                    cm?: Record<string, unknown>;
                };
                const mainFatCursors: string[] = [];
                mainCm?.dom
                    ?.querySelectorAll('.cm-fat-cursor')
                    .forEach((el) =>
                        mainFatCursors.push((el as HTMLElement).className),
                    );
                const mainVimLayer = mainCm?.scrollDOM?.querySelector(
                    '.cm-vimCursorLayer',
                ) as HTMLElement | null;
                const mainNativeLayers: Array<{
                    display: string;
                    computedDisplay: string;
                    children: number;
                }> = [];
                mainCm?.scrollDOM
                    ?.querySelectorAll(
                        '.cm-cursorLayer:not(.cm-vimCursorLayer)',
                    )
                    .forEach((el) => {
                        const h = el as HTMLElement;
                        mainNativeLayers.push({
                            display: h.style.display,
                            computedDisplay: getComputedStyle(h).display,
                            children: h.children.length,
                        });
                    });
                const mainVim = (
                    mainCm?.cm?.state as Record<string, unknown> | undefined
                )?.vim as Record<string, unknown> | undefined;
                const mainFocused =
                    mainCm?.dom?.classList.contains('cm-focused') ?? false;

                const tc = editMode?.tableCell as Record<
                    string,
                    unknown
                > | null;
                const cellCm = tc?.cm as
                    | {
                          dom?: HTMLElement;
                          scrollDOM?: HTMLElement;
                          cm?: Record<string, unknown>;
                      }
                    | undefined;
                const cellFatCursors: string[] = [];
                cellCm?.dom
                    ?.querySelectorAll('.cm-fat-cursor')
                    .forEach((el) =>
                        cellFatCursors.push((el as HTMLElement).className),
                    );
                const cellVimLayer = cellCm?.scrollDOM?.querySelector(
                    '.cm-vimCursorLayer',
                ) as HTMLElement | null;
                const cellNativeLayers: Array<{
                    display: string;
                    computedDisplay: string;
                    children: number;
                }> = [];
                cellCm?.scrollDOM
                    ?.querySelectorAll(
                        '.cm-cursorLayer:not(.cm-vimCursorLayer)',
                    )
                    .forEach((el) => {
                        const h = el as HTMLElement;
                        cellNativeLayers.push({
                            display: h.style.display,
                            computedDisplay: getComputedStyle(h).display,
                            children: h.children.length,
                        });
                    });
                const cellVim = (
                    cellCm?.cm?.state as Record<string, unknown> | undefined
                )?.vim as Record<string, unknown> | undefined;
                const cellFocused =
                    cellCm?.dom?.classList.contains('cm-focused') ?? false;

                return {
                    main: {
                        focused: mainFocused,
                        mode: mainVim?.insertMode ? 'insert' : 'normal',
                        fatCursors: mainFatCursors,
                        vimLayerDisplay:
                            mainVimLayer?.style.display ?? 'MISSING',
                        vimLayerChildren: mainVimLayer?.children.length ?? 0,
                        nativeLayers: mainNativeLayers,
                    },
                    cell: {
                        focused: cellFocused,
                        mode: cellVim?.insertMode ? 'insert' : 'normal',
                        fatCursors: cellFatCursors,
                        vimLayerDisplay:
                            cellVimLayer?.style.display ?? 'MISSING',
                        vimLayerChildren: cellVimLayer?.children.length ?? 0,
                        nativeLayers: cellNativeLayers,
                    },
                };
            },
        );
        console.log('[DUAL cell-insert]', JSON.stringify(dualInsert, null, 2));

        const cssCheck = await browser.executeObsidian(() => {
            const mainEditor = document.querySelector(
                '.markdown-source-view .cm-editor',
            ) as HTMLElement | null;
            const tableWidget = mainEditor?.querySelector('.cm-table-widget');
            const cellEditorFocused = tableWidget?.querySelector(
                '.cm-editor.cm-focused',
            );
            const hasMatch = mainEditor
                ? mainEditor.matches(
                      ':has(.cm-table-widget .cm-editor.cm-focused)',
                  )
                : false;
            const vimLayer = mainEditor?.querySelector(
                ':scope > .cm-scroller > .cm-vimCursorLayer',
            ) as HTMLElement | null;
            return {
                mainEditorTag: mainEditor?.tagName ?? 'null',
                tableWidgetFound: !!tableWidget,
                cellEditorFocusedFound: !!cellEditorFocused,
                hasMatchResult: hasMatch,
                vimLayerComputedDisplay: vimLayer
                    ? getComputedStyle(vimLayer).display
                    : 'N/A',
                vimLayerInlineDisplay: vimLayer?.style.display ?? 'N/A',
            };
        });
        console.log('[CSS CHECK]', JSON.stringify(cssCheck, null, 2));

        const allLayers = await browser.executeObsidian(() => {
            const layers = document.querySelectorAll('.cm-cursorLayer');
            const result: Array<{
                cls: string;
                parent: string;
                computed: string;
                children: number;
                fatCursorTexts: string[];
            }> = [];
            layers.forEach((el) => {
                const h = el as HTMLElement;
                const parentClasses = h.parentElement?.className ?? 'none';
                const fatTexts: string[] = [];
                h.querySelectorAll('.cm-fat-cursor').forEach((fc) =>
                    fatTexts.push((fc as HTMLElement).textContent ?? ''),
                );
                result.push({
                    cls: h.className,
                    parent: parentClasses.slice(0, 60),
                    computed: getComputedStyle(h).display,
                    children: h.children.length,
                    fatCursorTexts: fatTexts,
                });
            });
            return result;
        });
        console.log('[ALL CURSOR LAYERS]', JSON.stringify(allLayers, null, 2));

        const suppressionCheck = await browser.executeObsidian(
            ({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return { error: 'no view' };
                const editMode = (view as unknown as Record<string, unknown>)
                    .editMode as Record<string, unknown>;
                const mainCm = editMode?.cm as {
                    dom?: HTMLElement;
                    scrollDOM?: HTMLElement;
                } | null;
                const tc = editMode?.tableCell as Record<
                    string,
                    unknown
                > | null;
                const cellCm = tc?.cm as { dom?: HTMLElement } | undefined;

                const cellEditorDom = cellCm?.dom?.closest('.cm-editor');
                const parentEditorDom =
                    cellEditorDom?.parentElement?.closest('.cm-editor');
                const mainVimLayer = mainCm?.scrollDOM?.querySelector(
                    '.cm-vimCursorLayer',
                ) as HTMLElement | null;

                const parentCmView = parentEditorDom
                    ? (parentEditorDom as { cmView?: { view?: unknown } })
                          .cmView?.view
                    : null;

                const activeEl = document.activeElement;
                const mainContentDOM = mainCm?.dom?.querySelector(
                    ':scope > .cm-scroller > .cm-content',
                ) as HTMLElement | null;

                return {
                    cellDomInTableWidget:
                        cellCm?.dom?.closest('.cm-table-widget') !== null,
                    cellEditorDomFound: !!cellEditorDom,
                    parentEditorDomFound: !!parentEditorDom,
                    parentIsSameAsMain: parentEditorDom === mainCm?.dom,
                    mainVimLayerDisplay: mainVimLayer?.style.display ?? 'N/A',
                    mainVimLayerComputedDisplay: mainVimLayer
                        ? getComputedStyle(mainVimLayer).display
                        : 'N/A',
                    activeElementTag: activeEl?.tagName ?? 'null',
                    activeElementClasses:
                        (activeEl as HTMLElement)?.className?.slice(0, 60) ??
                        'null',
                    mainContentDOMIsActive: mainContentDOM === activeEl,
                    mainContentDOMContainsActive:
                        mainContentDOM?.contains(activeEl ?? document.body) ??
                        false,
                };
            },
        );
        console.log(
            '[SUPPRESSION CHECK]',
            JSON.stringify(suppressionCheck, null, 2),
        );

        const guardCheck = await browser.executeObsidian(
            ({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return { error: 'no view' };
                const editMode = (view as unknown as Record<string, unknown>)
                    .editMode as Record<string, unknown>;
                const tc = editMode?.tableCell as Record<
                    string,
                    unknown
                > | null;
                if (!tc) return { error: 'no tableCell' };
                const cellCm = tc.cm as { dom?: HTMLElement } | null;
                if (!cellCm?.dom) return { error: 'no cell dom' };

                const tableWidget = cellCm.dom.closest('.cm-table-widget');
                const parentEditorDom = tableWidget?.closest('.cm-editor');

                const allEditors = document.querySelectorAll('.cm-editor');
                const editorList: string[] = [];
                allEditors.forEach((el) => {
                    const h = el as HTMLElement;
                    const focused = h.classList.contains('cm-focused');
                    const hasVimLayer =
                        h.querySelector('.cm-vimCursorLayer') !== null;
                    editorList.push(
                        `focused=${focused} vimLayer=${hasVimLayer} tag=${h.tagName} id=${h.id || 'none'}`,
                    );
                });

                return {
                    tableWidgetFound: !!tableWidget,
                    parentEditorDomFound: !!parentEditorDom,
                    parentIsSameAsCell:
                        parentEditorDom ===
                        cellCm.dom.closest(
                            '.cm-editor:not(.cm-table-widget .cm-editor)',
                        ),
                    allEditors: editorList,
                };
            },
        );
        console.log('[GUARD CHECK]', JSON.stringify(guardCheck, null, 2));
    });
});

describe('Spike: BUILTIN vim cell cursor comparison', function () {
    before(async function () {
        this.timeout(30000);
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.disablePlugin('vim-motions');
        await browser.pause(PAUSE.SETTLE);
        await browser.executeObsidian(({ app }) => {
            (
                app.vault as unknown as {
                    setConfig: (k: string, v: unknown) => void;
                }
            ).setConfig('vimMode', true);
        });
        await browser.pause(PAUSE.RENDER);
        await obsidianPage.openFile('Welcome.md');
        await ensureLivePreview();
    });

    after(async function () {
        await browser.executeObsidian(({ app }) => {
            (
                app.vault as unknown as {
                    setConfig: (k: string, v: unknown) => void;
                }
            ).setConfig('vimMode', false);
        });
        await obsidianPage.enablePlugin('vim-motions');
        await browser.pause(PAUSE.SETTLE);
    });

    it('should extract builtin vim AND table cell CSS rules', async function () {
        this.timeout(20000);

        const cssRules = await browser.executeObsidian(() => {
            const results: string[] = [];
            for (let i = 0; i < document.styleSheets.length; i++) {
                try {
                    const sheet = document.styleSheets[i];
                    const rules = sheet.cssRules;
                    for (let j = 0; j < rules.length; j++) {
                        const rule = rules[j];
                        const text = rule.cssText ?? '';
                        if (
                            text.includes('cm-vimMode') ||
                            text.includes('cm-fat-cursor') ||
                            text.includes('cm-vimCursorLayer') ||
                            text.includes('table-cell') ||
                            text.includes('cm-table-widget')
                        ) {
                            results.push(text.slice(0, 300));
                        }
                    }
                } catch {
                    void 0;
                }
            }
            return results;
        });
        console.log('[BUILTIN CSS RULES]');
        for (const r of cssRules as string[]) {
            console.log('  ' + r);
        }
    });

    it('should probe builtin vim cursor in main + cell across modes', async function () {
        this.timeout(60000);

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

        await browser
            .saveScreenshot('/tmp/opencode/builtin-cursor-main-normal.png')
            .catch(() => {});

        await browser.keys(['j', 'j']);
        await browser.pause(PAUSE.SETTLE);
        await browser
            .saveScreenshot('/tmp/opencode/builtin-cursor-cell-normal.png')
            .catch(() => {});

        const builtinCellNormal = await browser.executeObsidian(
            ({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return { error: 'no view' };
                const editMode = (view as unknown as Record<string, unknown>)
                    .editMode as Record<string, unknown>;

                const mainCm = editMode?.cm as {
                    dom?: HTMLElement;
                    scrollDOM?: HTMLElement;
                    cm?: Record<string, unknown>;
                };
                const mainFatCursors: string[] = [];
                mainCm?.dom
                    ?.querySelectorAll('.cm-fat-cursor')
                    .forEach((el) =>
                        mainFatCursors.push((el as HTMLElement).className),
                    );
                const mainVimLayer = mainCm?.scrollDOM?.querySelector(
                    '.cm-vimCursorLayer',
                ) as HTMLElement | null;
                const mainFocused =
                    mainCm?.dom?.classList.contains('cm-focused') ?? false;
                const mainScrollClasses =
                    (mainCm as { scrollDOM?: HTMLElement }).scrollDOM
                        ?.className ?? '';
                const mainVimLayerComputed = mainVimLayer
                    ? getComputedStyle(mainVimLayer).display
                    : 'MISSING';

                const tc = editMode?.tableCell as Record<
                    string,
                    unknown
                > | null;
                const cellCm = tc?.cm as
                    | {
                          dom?: HTMLElement;
                          scrollDOM?: HTMLElement;
                          cm?: Record<string, unknown>;
                      }
                    | undefined;
                const cellFatCursors: string[] = [];
                cellCm?.dom
                    ?.querySelectorAll('.cm-fat-cursor')
                    .forEach((el) =>
                        cellFatCursors.push((el as HTMLElement).className),
                    );
                const cellVimLayer = cellCm?.scrollDOM?.querySelector(
                    '.cm-vimCursorLayer',
                ) as HTMLElement | null;
                const cellFocused =
                    cellCm?.dom?.classList.contains('cm-focused') ?? false;
                const cellScrollClasses =
                    (cellCm as { scrollDOM?: HTMLElement } | undefined)
                        ?.scrollDOM?.className ?? '';

                const cellNativeLayers: Array<{ computedDisplay: string }> = [];
                cellCm?.scrollDOM
                    ?.querySelectorAll(
                        '.cm-cursorLayer:not(.cm-vimCursorLayer)',
                    )
                    .forEach((el) => {
                        cellNativeLayers.push({
                            computedDisplay: getComputedStyle(el as HTMLElement)
                                .display,
                        });
                    });

                return {
                    main: {
                        focused: mainFocused,
                        scrollClasses: mainScrollClasses,
                        fatCursors: mainFatCursors,
                        vimLayerComputed: mainVimLayerComputed,
                        vimLayerChildren: mainVimLayer?.children.length ?? 0,
                    },
                    cell: {
                        focused: cellFocused,
                        scrollClasses: cellScrollClasses,
                        fatCursors: cellFatCursors,
                        vimLayerChildren: cellVimLayer?.children.length ?? 0,
                        nativeLayers: cellNativeLayers,
                    },
                };
            },
        );
        console.log(
            '[BUILTIN DUAL cell-normal]',
            JSON.stringify(builtinCellNormal, null, 2),
        );

        await browser.keys(['i']);
        await browser.pause(PAUSE.SETTLE);
        await browser
            .saveScreenshot('/tmp/opencode/builtin-cursor-cell-insert.png')
            .catch(() => {});

        const builtinCellInsert = await browser.executeObsidian(
            ({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                if (!view) return { error: 'no view' };
                const editMode = (view as unknown as Record<string, unknown>)
                    .editMode as Record<string, unknown>;

                const mainCm = editMode?.cm as {
                    dom?: HTMLElement;
                    scrollDOM?: HTMLElement;
                    cm?: Record<string, unknown>;
                };
                const mainFatCursors: string[] = [];
                mainCm?.dom
                    ?.querySelectorAll('.cm-fat-cursor')
                    .forEach((el) =>
                        mainFatCursors.push((el as HTMLElement).className),
                    );
                const mainVimLayer = mainCm?.scrollDOM?.querySelector(
                    '.cm-vimCursorLayer',
                ) as HTMLElement | null;
                const mainFocused =
                    mainCm?.dom?.classList.contains('cm-focused') ?? false;
                const mainVimLayerComputed = mainVimLayer
                    ? getComputedStyle(mainVimLayer).display
                    : 'MISSING';

                const tc = editMode?.tableCell as Record<
                    string,
                    unknown
                > | null;
                const cellCm = tc?.cm as
                    | {
                          dom?: HTMLElement;
                          scrollDOM?: HTMLElement;
                          cm?: Record<string, unknown>;
                      }
                    | undefined;
                const cellFatCursors: string[] = [];
                cellCm?.dom
                    ?.querySelectorAll('.cm-fat-cursor')
                    .forEach((el) =>
                        cellFatCursors.push((el as HTMLElement).className),
                    );
                const cellVimLayer = cellCm?.scrollDOM?.querySelector(
                    '.cm-vimCursorLayer',
                ) as HTMLElement | null;
                const cellFocused =
                    cellCm?.dom?.classList.contains('cm-focused') ?? false;

                const cellNativeLayers: Array<{ computedDisplay: string }> = [];
                cellCm?.scrollDOM
                    ?.querySelectorAll(
                        '.cm-cursorLayer:not(.cm-vimCursorLayer)',
                    )
                    .forEach((el) => {
                        cellNativeLayers.push({
                            computedDisplay: getComputedStyle(el as HTMLElement)
                                .display,
                        });
                    });

                const cellContentEl = cellCm?.dom?.querySelector(
                    '.cm-content',
                ) as HTMLElement | null;
                const cellCaretColor = cellContentEl
                    ? getComputedStyle(cellContentEl).caretColor
                    : 'N/A';

                const cellLineEl = cellCm?.dom?.querySelector(
                    '.cm-line',
                ) as HTMLElement | null;
                const cellLineCaretColor = cellLineEl
                    ? getComputedStyle(cellLineEl).caretColor
                    : 'N/A';

                return {
                    main: {
                        focused: mainFocused,
                        fatCursors: mainFatCursors,
                        vimLayerComputed: mainVimLayerComputed,
                        vimLayerChildren: mainVimLayer?.children.length ?? 0,
                    },
                    cell: {
                        focused: cellFocused,
                        fatCursors: cellFatCursors,
                        vimLayerChildren: cellVimLayer?.children.length ?? 0,
                        nativeLayers: cellNativeLayers,
                        caretColor: cellCaretColor,
                        lineCaretColor: cellLineCaretColor,
                    },
                };
            },
        );
        console.log(
            '[BUILTIN DUAL cell-insert]',
            JSON.stringify(builtinCellInsert, null, 2),
        );

        await browser.keys(['Escape']);
        await browser.pause(PAUSE.SETTLE);
        await browser
            .saveScreenshot('/tmp/opencode/builtin-cursor-cell-back-normal.png')
            .catch(() => {});
    });
});
