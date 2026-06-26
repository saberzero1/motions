import type { App } from 'obsidian';
import type {
    ActionFn,
    CmAdapter,
    ExCommandFn,
    MotionFn,
} from '../types/vim-api';
import type { VimRegistration } from '../vim/registration';
import type { LeaderRegistry } from '../ui/which-key';

const TABLE_RE = /^\s*\|/;
const SEPARATOR_RE = /^\s*\|[\s:]*-+[\s:|-]*\|\s*$/;

function isInsideTableWidget(cm: CmAdapter): boolean {
    return !!cm.cm6?.dom?.closest('.cm-table-widget');
}

function synthesizeTab(cm: CmAdapter, shift: boolean): void {
    const el = cm.cm6?.contentDOM;
    if (!el) return;
    // Defer: Tab destroys the current cell editor, so vim must finish
    // processing the current motion before we trigger the cell switch.
    setTimeout(() => {
        el.dispatchEvent(
            new KeyboardEvent('keydown', {
                key: 'Tab',
                code: 'Tab',
                shiftKey: shift,
                bubbles: true,
                cancelable: true,
            }),
        );
    }, 0);
}

function isTableLine(text: string): boolean {
    return TABLE_RE.test(text);
}

function isSeparatorLine(text: string): boolean {
    return SEPARATOR_RE.test(text);
}

function findCellBoundaries(line: string): number[] {
    const positions: number[] = [];
    for (let i = 0; i < line.length; i++) {
        if (line[i] === '|') positions.push(i);
    }
    return positions;
}

function findNextCellStart(line: string, cursorCh: number): number | null {
    const pipes = findCellBoundaries(line);
    for (const pos of pipes) {
        if (pos > cursorCh) {
            const afterPipe = pos + 1;
            if (afterPipe < line.length && line[afterPipe] !== undefined) {
                const trimmed = line.substring(afterPipe).search(/\S/);
                return trimmed >= 0 ? afterPipe + trimmed : afterPipe;
            }
            return null;
        }
    }
    return null;
}

function findPrevCellStart(line: string, cursorCh: number): number | null {
    const pipes = findCellBoundaries(line);
    for (let i = pipes.length - 1; i >= 0; i--) {
        const pos = pipes[i];
        if (pos === undefined) continue;
        if (pos < cursorCh) {
            const prevPipe = i > 0 ? pipes[i - 1] : undefined;
            if (prevPipe !== undefined) {
                const afterPipe = prevPipe + 1;
                const trimmed = line.substring(afterPipe).search(/\S/);
                return trimmed >= 0 ? afterPipe + trimmed : afterPipe;
            }
            return null;
        }
    }
    return null;
}

export const tableNextCellMotion: MotionFn = (cm, head) => {
    if (isInsideTableWidget(cm)) {
        synthesizeTab(cm, false);
        return head;
    }

    const lineText = cm.getLine(head.line);
    if (!isTableLine(lineText)) return null;

    const nextOnLine = findNextCellStart(lineText, head.ch);
    if (nextOnLine !== null) {
        const lastPipe = lineText.lastIndexOf('|');
        if (nextOnLine < lastPipe) {
            return { line: head.line, ch: nextOnLine };
        }
    }

    const lastLine = cm.lastLine();
    for (let line = head.line + 1; line <= lastLine; line++) {
        const text = cm.getLine(line);
        if (!isTableLine(text)) return null;
        if (isSeparatorLine(text)) continue;
        const firstPipe = text.indexOf('|');
        if (firstPipe === -1) return null;
        const afterPipe = firstPipe + 1;
        const trimmed = text.substring(afterPipe).search(/\S/);
        return { line, ch: trimmed >= 0 ? afterPipe + trimmed : afterPipe };
    }

    return null;
};

export const tablePrevCellMotion: MotionFn = (cm, head) => {
    if (isInsideTableWidget(cm)) {
        synthesizeTab(cm, true);
        return head;
    }

    const lineText = cm.getLine(head.line);
    if (!isTableLine(lineText)) return null;

    const prevOnLine = findPrevCellStart(lineText, head.ch);
    if (prevOnLine !== null) {
        return { line: head.line, ch: prevOnLine };
    }

    const firstLine = cm.firstLine();
    for (let line = head.line - 1; line >= firstLine; line--) {
        const text = cm.getLine(line);
        if (!isTableLine(text)) return null;
        if (isSeparatorLine(text)) continue;
        const lastPipe = text.lastIndexOf('|');
        if (lastPipe <= 0) return null;
        const secondLast = text.lastIndexOf('|', lastPipe - 1);
        if (secondLast === -1) return null;
        const afterPipe = secondLast + 1;
        const trimmed = text.substring(afterPipe).search(/\S/);
        return { line, ch: trimmed >= 0 ? afterPipe + trimmed : afterPipe };
    }

    return null;
};

function navigateToAdjacentRow(cm: CmAdapter, direction: 1 | -1): void {
    if (!isInsideTableWidget(cm)) return;
    const widget = cm.cm6.dom.closest('.cm-table-widget');
    if (!widget) return;
    const cmEditor = widget.querySelector('.cm-editor');
    const cell = cmEditor?.closest('th, td') as HTMLTableCellElement | null;
    if (!cell) return;
    const row = cell.parentElement as HTMLTableRowElement | null;
    if (!row) return;
    const table = row.closest('table');
    if (!table) return;
    const allRows = Array.from(
        table.querySelectorAll<HTMLTableRowElement>('tr'),
    );
    const rowIndex = allRows.indexOf(row);
    if (direction === 1 && rowIndex >= allRows.length - 1) return;
    if (direction === -1 && rowIndex <= 0) return;
    const numCols = row.cells.length;
    if (numCols === 0) return;
    const shift = direction === -1;

    let remaining = numCols;
    // Defer first Tab so vim finishes processing the current action.
    setTimeout(function sendTab() {
        if (remaining <= 0) return;
        remaining--;
        const el = widget.querySelector('.cm-content') as HTMLElement | null;
        if (!el) return;
        el.dispatchEvent(
            new KeyboardEvent('keydown', {
                key: 'Tab',
                code: 'Tab',
                shiftKey: shift,
                bubbles: true,
                cancelable: true,
            }),
        );
        if (remaining > 0) setTimeout(sendTab, 10);
    }, 0);
}

export const tableNextRowAction: ActionFn = (cm) => {
    navigateToAdjacentRow(cm, 1);
};

export const tablePrevRowAction: ActionFn = (cm) => {
    navigateToAdjacentRow(cm, -1);
};

function executeCommand(app: App, commandId: string): void {
    (
        app as unknown as {
            commands: { executeCommandById: (id: string) => void };
        }
    ).commands.executeCommandById(commandId);
}

function createTableCommandAction(app: App, commandId: string): ActionFn {
    return () => executeCommand(app, commandId);
}

function createTableCommandEx(app: App, commandId: string): ExCommandFn {
    return () => executeCommand(app, commandId);
}

const TABLE_COMMANDS: Array<{
    action: string;
    commandId: string;
    exName: string;
    exShort: string;
    leaderKey?: string;
    leaderDesc: string;
}> = [
    {
        action: 'tableRowBefore',
        commandId: 'editor:table-row-before',
        exName: 'tablerowbefore',
        exShort: 'tablerowb',
        leaderKey: 'tO',
        leaderDesc: 'Table: add row above',
    },
    {
        action: 'tableRowAfter',
        commandId: 'editor:table-row-after',
        exName: 'tablerowafter',
        exShort: 'tablerowa',
        leaderKey: 'to',
        leaderDesc: 'Table: add row below',
    },
    {
        action: 'tableRowUp',
        commandId: 'editor:table-row-up',
        exName: 'tablerowup',
        exShort: 'tablerowu',
        leaderKey: 'tK',
        leaderDesc: 'Table: move row up',
    },
    {
        action: 'tableRowDown',
        commandId: 'editor:table-row-down',
        exName: 'tablerowdown',
        exShort: 'tablerowd',
        leaderKey: 'tJ',
        leaderDesc: 'Table: move row down',
    },
    {
        action: 'tableRowDelete',
        commandId: 'editor:table-row-delete',
        exName: 'tablerowdelete',
        exShort: 'tablerowde',
        leaderKey: 'tdd',
        leaderDesc: 'Table: delete row',
    },
    {
        action: 'tableColBefore',
        commandId: 'editor:table-col-before',
        exName: 'tablecolbefore',
        exShort: 'tablecolb',
        leaderKey: 'tiH',
        leaderDesc: 'Table: add column left',
    },
    {
        action: 'tableColAfter',
        commandId: 'editor:table-col-after',
        exName: 'tablecolafter',
        exShort: 'tablecola',
        leaderKey: 'tiL',
        leaderDesc: 'Table: add column right',
    },
    {
        action: 'tableColLeft',
        commandId: 'editor:table-col-left',
        exName: 'tablecolleft',
        exShort: 'tablecoll',
        leaderKey: 'tH',
        leaderDesc: 'Table: move column left',
    },
    {
        action: 'tableColRight',
        commandId: 'editor:table-col-right',
        exName: 'tablecolright',
        exShort: 'tablecolr',
        leaderKey: 'tL',
        leaderDesc: 'Table: move column right',
    },
    {
        action: 'tableColDelete',
        commandId: 'editor:table-col-delete',
        exName: 'tablecoldelete',
        exShort: 'tablecold',
        leaderKey: 'tdc',
        leaderDesc: 'Table: delete column',
    },
    {
        action: 'tableAlignLeft',
        commandId: 'editor:table-col-align-left',
        exName: 'tablealignleft',
        exShort: 'tablealignl',
        leaderDesc: 'Table: align left',
    },
    {
        action: 'tableAlignCenter',
        commandId: 'editor:table-col-align-center',
        exName: 'tablealigncenter',
        exShort: 'tablealignc',
        leaderDesc: 'Table: align center',
    },
    {
        action: 'tableAlignRight',
        commandId: 'editor:table-col-align-right',
        exName: 'tablealignright',
        exShort: 'tablealignr',
        leaderDesc: 'Table: align right',
    },
    {
        action: 'tableInsert',
        commandId: 'editor:insert-table',
        exName: 'tableinsert',
        exShort: 'tablei',
        leaderKey: 'tm',
        leaderDesc: 'Table: insert table',
    },
];

export function registerTableActions(
    reg: VimRegistration,
    app: App,
    leaderRegistry?: LeaderRegistry,
): void {
    reg.defineAction('tableNextRow', tableNextRowAction);
    reg.mapCommand(']r', 'action', 'tableNextRow', {});
    reg.defineAction('tablePrevRow', tablePrevRowAction);
    reg.mapCommand('[r', 'action', 'tablePrevRow', {});

    const leaderKey = leaderRegistry?.getLeaderKey() ?? '\\';

    for (const cmd of TABLE_COMMANDS) {
        reg.defineAction(
            cmd.action,
            createTableCommandAction(app, cmd.commandId),
        );
        reg.defineEx(
            cmd.exName,
            cmd.exShort,
            createTableCommandEx(app, cmd.commandId),
        );

        if (cmd.leaderKey && leaderRegistry) {
            const lhs = leaderKey + cmd.leaderKey;
            reg.mapCommand(lhs, 'action', cmd.action, {});
            leaderRegistry.addBinding(lhs, cmd.leaderDesc, 'builtin');
        }
    }
}
