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
import { findUnescapedPipes, splitCellsEscapeAware } from '../vim/table-utils';

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

type ColumnAlignment = 'left' | 'center' | 'right' | 'none';

function parseSeparatorAlignments(line: string): ColumnAlignment[] {
    const cells = splitCellsEscapeAware(line);
    return cells.map((cell) => {
        const trimmed = cell.trim();
        const leftColon = trimmed.startsWith(':');
        const rightColon = trimmed.endsWith(':');
        if (leftColon && rightColon) return 'center';
        if (rightColon) return 'right';
        if (leftColon) return 'left';
        return 'none';
    });
}

function buildSeparatorCell(width: number, alignment: ColumnAlignment): string {
    const dashes = '-'.repeat(Math.max(width, 3));
    switch (alignment) {
        case 'left':
            return `:${dashes.slice(1)}`;
        case 'right':
            return `${dashes.slice(1)}:`;
        case 'center':
            return `:${dashes.slice(2)}:`;
        default:
            return dashes;
    }
}

function splitTableCells(line: string): string[] {
    return splitCellsEscapeAware(line);
}

export function realignTable(cm: CmAdapter): void {
    const cursor = cm.getCursor();
    const bounds = findTableBounds(cm, cursor.line);
    if (!bounds) return;

    const rows: string[][] = [];
    let separatorIdx = -1;
    let alignments: ColumnAlignment[] = [];

    for (let line = bounds.start; line <= bounds.end; line++) {
        const text = cm.getLine(line);
        if (isSeparatorLine(text)) {
            separatorIdx = line - bounds.start;
            alignments = parseSeparatorAlignments(text);
            rows.push([]);
        } else {
            rows.push(splitTableCells(text).map((c) => c.trim()));
        }
    }

    const colCount = Math.max(...rows.map((r) => r.length));
    if (colCount <= 0) return;

    const colWidths: number[] = Array.from({ length: colCount }, () => 3);
    for (const row of rows) {
        for (let col = 0; col < row.length; col++) {
            const cell = row[col];
            if (cell !== undefined && cell.length > (colWidths[col] ?? 0)) {
                colWidths[col] = cell.length;
            }
        }
    }

    while (alignments.length < colCount) {
        alignments.push('none');
    }

    const newLines: string[] = [];
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (row === undefined) continue;

        if (i === separatorIdx) {
            const sepCells = colWidths.map((w, col) =>
                buildSeparatorCell(w, alignments[col] ?? 'none'),
            );
            newLines.push(`| ${sepCells.join(' | ')} |`);
            continue;
        }

        const paddedCells = colWidths.map((w, col) => {
            const content = row[col] ?? '';
            return content.padEnd(w);
        });
        newLines.push(`| ${paddedCells.join(' | ')} |`);
    }

    const from = { line: bounds.start, ch: 0 };
    const lastLineText = cm.getLine(bounds.end);
    const to = { line: bounds.end, ch: lastLineText.length };
    cm.replaceRange(newLines.join('\n'), from, to);

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
