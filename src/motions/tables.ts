import type { App } from 'obsidian';
import type {
    ActionFn,
    CmAdapter,
    ExCommandFn,
    MotionFn,
} from '../types/vim-api';
import type { VimRegistration } from '../vim/registration';
import type { LeaderRegistry } from '../ui/which-key';
import { executeCommand } from '../util/commands';
import { findUnescapedPipes, realignTableLines } from '../vim/table-utils';
import { canRealignTable } from '../vim/table-operations';
import {
    deleteColumn,
    deleteRow,
    insertColumn,
    insertRow,
    moveColumn,
    moveRow,
} from '../vim/table/structural';

const TABLE_RE = /^\s*\|/;
const SEPARATOR_RE = /^\s*\|[\s:]*-+[\s:|-]*\|\s*$/;

function isTableLine(text: string): boolean {
    return TABLE_RE.test(text);
}

export function isSeparatorLine(text: string): boolean {
    return SEPARATOR_RE.test(text);
}

export function findCellBoundaries(line: string): number[] {
    return findUnescapedPipes(line);
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

function getPipeIndex(line: string, ch: number): number {
    const pipes = findCellBoundaries(line);
    let idx = 0;
    for (const pos of pipes) {
        if (pos >= ch) break;
        idx++;
    }
    return idx;
}

function getCellStartAtPipeIndex(line: string, pipeIdx: number): number {
    const pipes = findCellBoundaries(line);
    const leftPipe = pipes[pipeIdx - 1];
    if (leftPipe === undefined) return 0;
    const afterPipe = leftPipe + 1;
    const trimmed = line.substring(afterPipe).search(/\S/);
    return trimmed >= 0 ? afterPipe + trimmed : afterPipe;
}

function tableVerticalMotion(
    cm: CmAdapter,
    head: { line: number; ch: number },
    direction: 1 | -1,
): { line: number; ch: number } | null {
    const lineText = cm.getLine(head.line);
    if (!isTableLine(lineText)) return null;

    const pipeIdx = getPipeIndex(lineText, head.ch);
    const bound = direction === 1 ? cm.lastLine() : cm.firstLine();

    for (
        let line = head.line + direction;
        direction === 1 ? line <= bound : line >= bound;
        line += direction
    ) {
        const text = cm.getLine(line);
        if (!isTableLine(text)) return null;
        if (isSeparatorLine(text)) continue;
        return { line, ch: getCellStartAtPipeIndex(text, pipeIdx) };
    }

    return null;
}

export const tableNextRowMotion: MotionFn = (cm, head) =>
    tableVerticalMotion(cm, head, 1);

export const tablePrevRowMotion: MotionFn = (cm, head) =>
    tableVerticalMotion(cm, head, -1);

function findTableBounds(
    cm: { getLine(n: number): string; firstLine(): number; lastLine(): number },
    cursorLine: number,
): { start: number; end: number } | null {
    const lineText = cm.getLine(cursorLine);
    if (!isTableLine(lineText)) return null;

    let start = cursorLine;
    while (start > cm.firstLine() && isTableLine(cm.getLine(start - 1))) {
        start--;
    }

    let end = cursorLine;
    while (end < cm.lastLine() && isTableLine(cm.getLine(end + 1))) {
        end++;
    }

    return { start, end };
}

export function realignTable(cm: CmAdapter): void {
    // Insert mode and composition are both unsafe: see `canRealignTable`.
    if (!canRealignTable(cm.cm6)) return;
    const cursor = cm.getCursor();
    const bounds = findTableBounds(cm, cursor.line);
    if (!bounds) return;

    const lines: string[] = [];
    for (let line = bounds.start; line <= bounds.end; line++) {
        lines.push(cm.getLine(line));
    }

    const newLines = realignTableLines(lines);
    const newText = newLines.join('\n');
    if (newText === lines.join('\n')) return;

    const from = { line: bounds.start, ch: 0 };
    const lastLineText = cm.getLine(bounds.end);
    const to = { line: bounds.end, ch: lastLineText.length };
    cm.replaceRange(newText, from, to);

    const newCursorLine = Math.min(
        cursor.line,
        bounds.start + newLines.length - 1,
    );
    cm.setCursor(newCursorLine, cursor.ch);
}

export const tableRealignAction: ActionFn = (cm) => {
    realignTable(cm);
};

export const tableRealignEx: ExCommandFn = (cm) => {
    realignTable(cm);
};

/**
 * The text-based equivalent of each Obsidian table command, by command id.
 *
 * Those commands drive Obsidian's private `TableEditor` through the table
 * widget, which `tableWidgetMode: 'owned'` removes — so in owned mode they are
 * **inert**. Measured with the cursor in a table: ten of them leave the
 * document byte-identical in owned while changing it correctly in native.
 * Only `:tablerealign` worked in both, because it alone was already text-based.
 *
 * Rather than register a second set of commands, each falls back here when the
 * widget is absent, so the same `:tablerowafter`, the same action name and the
 * same `<leader>` binding work in both modes.
 */
const TEXT_FALLBACKS: Record<
    string,
    (lines: string[], row: number, col: number) => string[]
> = {
    'editor:table-row-before': (l, r) => insertRow(l, r, 'before'),
    'editor:table-row-after': (l, r) => insertRow(l, r, 'after'),
    'editor:table-row-up': (l, r) => moveRow(l, r, 'up'),
    'editor:table-row-down': (l, r) => moveRow(l, r, 'down'),
    'editor:table-row-delete': (l, r) => deleteRow(l, r),
    'editor:table-col-before': (l, _r, c) => insertColumn(l, c, 'before'),
    'editor:table-col-after': (l, _r, c) => insertColumn(l, c, 'after'),
    'editor:table-col-left': (l, _r, c) => moveColumn(l, c, 'left'),
    'editor:table-col-right': (l, _r, c) => moveColumn(l, c, 'right'),
    'editor:table-col-delete': (l, _r, c) => deleteColumn(l, c),
};

/**
 * Runs the text fallback for `commandId`, returning whether it applied.
 *
 * Deliberately keyed on the **widget's absence** rather than on the setting:
 * the setting can say `owned` while a per-view gate — Source mode, a blocked
 * surface — leaves Obsidian's widget in place, and there the native command is
 * the right one. Asking the DOM answers the question that actually matters.
 */
function runTextFallback(cm: CmAdapter, commandId: string): boolean {
    const fallback = TEXT_FALLBACKS[commandId];
    if (!fallback) return false;
    const view = cm.cm6;
    if (view.dom.querySelector('.cm-table-widget')) return false;

    const cursor = cm.getCursor();
    const bounds = findTableBounds(cm, cursor.line);
    if (!bounds) return false;

    const lines: string[] = [];
    for (let line = bounds.start; line <= bounds.end; line++) {
        lines.push(cm.getLine(line));
    }
    const col = findCellBoundaries(cm.getLine(cursor.line)).filter(
        (b) => b <= cursor.ch,
    ).length;
    const next = fallback(
        lines,
        cursor.line - bounds.start,
        Math.max(0, col - 1),
    );
    if (next === lines || next.join('\n') === lines.join('\n')) return true;

    const from = view.state.doc.line(bounds.start + 1).from;
    const to = view.state.doc.line(bounds.end + 1).to;
    view.dispatch({ changes: { from, to, insert: next.join('\n') } });
    return true;
}

function createTableCommandAction(app: App, commandId: string): ActionFn {
    return (cm) => {
        if (runTextFallback(cm, commandId)) return;
        executeCommand(app, commandId);
    };
}

function createTableCommandEx(app: App, commandId: string): ExCommandFn {
    return (cm) => {
        if (runTextFallback(cm, commandId)) return;
        executeCommand(app, commandId);
    };
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

    reg.defineAction('tableRealign', tableRealignAction);
    reg.defineEx('tablerealign', 'tablerea', tableRealignEx);

    if (leaderRegistry) {
        const lhs = leaderKey + 'tr';
        reg.mapCommand(lhs, 'action', 'tableRealign', {});
        leaderRegistry.addBinding(lhs, 'Table: realign', 'builtin');
        leaderRegistry.addGroupLabel('t', 'Table', true, 'table', 'blue');
    }
}
