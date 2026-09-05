import type { App } from 'obsidian';
import { MarkdownView } from 'obsidian';
import {
    isCursorSuppressedForView,
    isCursorSuppressed,
    getViewOverrideCount,
    isKeyInterceptActive,
} from '@replit/codemirror-vim';
import { getTableNavSessionSnapshot } from './table-nav-controller';
import { getTableNavState, type TableNavState } from './table-nav-state';
import {
    hasActiveTableCell,
    getActiveTableCellEditorView,
} from './native-table-adapter';
import { getCrossingState } from './table-cell-motions';

const MAX_LOG_ENTRIES = 50;
const eventLog: { ts: number; event: string; detail?: string }[] = [];

export function logTableEvent(event: string, detail?: string): void {
    if (eventLog.length >= MAX_LOG_ENTRIES) eventLog.shift();
    eventLog.push({ ts: Date.now(), event, detail });
}

export function getTableEventLog(): readonly {
    ts: number;
    event: string;
    detail?: string;
}[] {
    return eventLog;
}

export function clearTableEventLog(): void {
    eventLog.length = 0;
}

export interface TableDebugState {
    nav: Record<string, unknown> | null;
    stateField: TableNavState | null;
    modeTracker: {
        statusBarText: string;
        statusBarDataAttr: string;
    };
    cellEditor: {
        hasActiveTableCell: boolean;
        hasCellEditorView: boolean;
    };
    cursorSuppression: {
        globalSuppressed: boolean;
        viewSuppressed: boolean | null;
        viewOverrideCount: number;
    };
    fork: {
        keyInterceptActive: boolean;
    };
    crossing: {
        token: number;
        pendingRaf: boolean;
        hasOverrides: boolean;
    };
    dom: {
        hasTableWidget: boolean;
        hasNavHighlight: boolean;
        hasNavMode: boolean;
        hasCursorLayerHidden: boolean;
        mainCursorLayerHidden: boolean;
        hasCellHidden: boolean;
    };
    scroll: {
        widgetOverflowX: string | null;
        widgetScrollWidth: number | null;
        widgetClientWidth: number | null;
        wrapperOverflowX: string | null;
        wrapperScrollWidth: number | null;
        wrapperClientWidth: number | null;
        wrapperScrollLeft: number | null;
        scrollerScrollLeft: number;
    } | null;
    recentEvents: readonly { ts: number; event: string; detail?: string }[];
}

export function getTableDebugState(app: App): TableDebugState | null {
    const mdView = app.workspace.getActiveViewOfType(MarkdownView);
    if (!mdView) return null;

    const editorView = mdView.editor.cm;
    if (!editorView) return null;

    const contentEl = (mdView as unknown as { contentEl: HTMLElement })
        .contentEl;

    let stateField: TableNavState | null = null;
    try {
        stateField = getTableNavState(editorView.state);
    } catch {
        stateField = null;
    }

    const nav = getTableNavSessionSnapshot(editorView);

    const statusBar = document.querySelector('.vim-motions-mode');
    const statusBarText = (statusBar as HTMLElement)?.textContent ?? '';
    const statusBarDataAttr =
        (statusBar as HTMLElement)?.dataset?.['vimMode'] ?? '';

    const crossing = getCrossingState();

    return {
        nav,
        stateField,
        modeTracker: {
            statusBarText,
            statusBarDataAttr,
        },
        cellEditor: {
            hasActiveTableCell: hasActiveTableCell(app),
            hasCellEditorView: getActiveTableCellEditorView(app) !== null,
        },
        cursorSuppression: {
            globalSuppressed: isCursorSuppressed(),
            viewSuppressed: (() => {
                try {
                    return isCursorSuppressedForView(editorView);
                } catch {
                    return null;
                }
            })(),
            viewOverrideCount: getViewOverrideCount(),
        },
        fork: {
            keyInterceptActive: isKeyInterceptActive(),
        },
        crossing,
        dom: {
            hasTableWidget:
                contentEl.querySelector('.cm-table-widget') !== null,
            hasNavHighlight:
                contentEl.querySelector('.vim-motions-table-nav-active') !==
                null,
            hasNavMode:
                contentEl.querySelector('.vim-motions-table-nav-mode') !== null,
            hasCursorLayerHidden:
                editorView.scrollDOM.querySelector(
                    '.vim-motions-cursor-layer-hidden',
                ) !== null,
            mainCursorLayerHidden: (() => {
                const layers =
                    editorView.scrollDOM.querySelectorAll('.cm-vimCursorLayer');
                for (let i = 0; i < layers.length; i++) {
                    const l = layers[i] as HTMLElement;
                    if (l.closest('.cm-table-widget')) continue;
                    return l.classList.contains(
                        'vim-motions-cursor-layer-hidden',
                    );
                }
                return false;
            })(),
            hasCellHidden:
                contentEl.querySelector(
                    '.vim-motions-table-nav-cell-hidden',
                ) !== null,
        },
        scroll: (() => {
            const widget =
                contentEl.querySelector<HTMLElement>('.cm-table-widget');
            if (!widget) return null;
            const wrapper = widget.querySelector<HTMLElement>('.table-wrapper');
            const widgetStyle = getComputedStyle(widget);
            const wrapperStyle = wrapper ? getComputedStyle(wrapper) : null;
            return {
                widgetOverflowX: widgetStyle.overflowX,
                widgetScrollWidth: widget.scrollWidth,
                widgetClientWidth: widget.clientWidth,
                wrapperOverflowX: wrapperStyle?.overflowX ?? null,
                wrapperScrollWidth: wrapper?.scrollWidth ?? null,
                wrapperClientWidth: wrapper?.clientWidth ?? null,
                wrapperScrollLeft: wrapper?.scrollLeft ?? null,
                scrollerScrollLeft: editorView.scrollDOM.scrollLeft,
            };
        })(),
        recentEvents: getTableEventLog(),
    };
}

export function formatTableDebugState(state: TableDebugState): string {
    const lines: string[] = [];
    lines.push('=== Table Debug State ===');
    lines.push('');

    lines.push('--- Navigation Session ---');
    if (state.nav) {
        for (const [k, v] of Object.entries(state.nav)) {
            lines.push(`  ${k}: ${JSON.stringify(v)}`);
        }
    } else {
        lines.push('  (no session)');
    }
    lines.push('');

    lines.push('--- StateField ---');
    if (state.stateField) {
        lines.push(`  mode: ${state.stateField.mode}`);
        lines.push(
            `  cell: (${state.stateField.row}, ${state.stateField.col})`,
        );
        lines.push(`  tableFrom: ${state.stateField.tableFrom}`);
        lines.push(`  dirty: ${state.stateField.dirty}`);
    } else {
        lines.push('  (no state field)');
    }
    lines.push('');

    lines.push('--- Status Bar ---');
    lines.push(`  text: "${state.modeTracker.statusBarText}"`);
    lines.push(`  data-vim-mode: "${state.modeTracker.statusBarDataAttr}"`);
    lines.push('');

    lines.push('--- Cell Editor ---');
    lines.push(`  hasActiveTableCell: ${state.cellEditor.hasActiveTableCell}`);
    lines.push(`  hasCellEditorView: ${state.cellEditor.hasCellEditorView}`);
    lines.push('');

    lines.push('--- Cursor Suppression ---');
    lines.push(`  global: ${state.cursorSuppression.globalSuppressed}`);
    lines.push(`  view: ${state.cursorSuppression.viewSuppressed}`);
    lines.push(`  overrideCount: ${state.cursorSuppression.viewOverrideCount}`);
    lines.push('');

    lines.push('--- Fork ---');
    lines.push(`  keyInterceptActive: ${state.fork.keyInterceptActive}`);
    lines.push('');

    lines.push('--- Crossing ---');
    lines.push(`  token: ${state.crossing.token}`);
    lines.push(`  pendingRaf: ${state.crossing.pendingRaf}`);
    lines.push(`  hasOverrides: ${state.crossing.hasOverrides}`);
    lines.push('');

    lines.push('--- DOM ---');
    for (const [k, v] of Object.entries(state.dom)) {
        lines.push(`  ${k}: ${v}`);
    }
    lines.push('');

    lines.push('--- Scroll ---');
    if (state.scroll) {
        for (const [k, v] of Object.entries(state.scroll)) {
            lines.push(`  ${k}: ${v}`);
        }
    } else {
        lines.push('  (no table widget)');
    }

    lines.push('');
    lines.push('--- Recent Events ---');
    if (state.recentEvents.length === 0) {
        lines.push('  (none)');
    } else {
        for (const e of state.recentEvents.slice(-15)) {
            const t = new Date(e.ts).toLocaleTimeString();
            lines.push(
                `  [${t}] ${e.event}${e.detail ? ` (${e.detail})` : ''}`,
            );
        }
    }

    return lines.join('\n');
}
