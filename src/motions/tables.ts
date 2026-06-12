import type { MotionFn } from '../types/vim-api';

const TABLE_RE = /^\s*\|/;
const SEPARATOR_RE = /^\s*\|[\s:]*-+[\s:|-]*\|\s*$/;

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
