import type { MotionFn, VimPos } from '../types/vim-api';
import { findSubwordBoundaries, findSubwordEnds } from '../util/subword';

const MAX_LINE_LENGTH = 10_000;
const WORD_SEGMENT_RE = /\b\w+\b/g;

function findWordStarts(text: string): number[] {
    const starts: number[] = [];
    let match: RegExpExecArray | null;
    const re = new RegExp(WORD_SEGMENT_RE.source, 'g');
    while ((match = re.exec(text)) !== null) {
        starts.push(match.index);
    }
    return starts;
}

function findWordEnds(text: string): number[] {
    const ends: number[] = [];
    let match: RegExpExecArray | null;
    const re = new RegExp(WORD_SEGMENT_RE.source, 'g');
    while ((match = re.exec(text)) !== null) {
        ends.push(match.index + match[0].length);
    }
    return ends;
}

function getLineStarts(line: string): number[] {
    if (line.length > MAX_LINE_LENGTH) {
        return findWordStarts(line);
    }
    return findSubwordBoundaries(line);
}

function getLineEnds(line: string): number[] {
    if (line.length > MAX_LINE_LENGTH) {
        return findWordEnds(line);
    }
    return findSubwordEnds(line);
}

function firstNonWhitespace(line: string): number | null {
    const idx = line.search(/\S/);
    return idx === -1 ? null : idx;
}

function findForwardStart(
    cm: { getLine(line: number): string; lastLine(): number },
    head: VimPos,
    repeat: number,
): VimPos | null {
    let remaining = repeat;
    const lastLine = cm.lastLine();
    for (let lineNum = head.line; lineNum <= lastLine; lineNum++) {
        const line = cm.getLine(lineNum);
        const starts = getLineStarts(line);
        let candidates = starts;
        if (lineNum === head.line) {
            candidates = starts.filter((pos) => pos > head.ch);
        } else {
            const firstNonWs = firstNonWhitespace(line);
            if (firstNonWs === null) continue;
            candidates = starts.filter((pos) => pos >= firstNonWs);
        }
        if (candidates.length >= remaining) {
            const target = candidates[remaining - 1];
            if (target !== undefined) {
                return { line: lineNum, ch: target };
            }
        }
        remaining -= candidates.length;
    }
    return null;
}

function findBackwardStart(
    cm: { getLine(line: number): string },
    head: VimPos,
    repeat: number,
): VimPos | null {
    let remaining = repeat;
    for (let lineNum = head.line; lineNum >= 0; lineNum--) {
        const line = cm.getLine(lineNum);
        const starts = getLineStarts(line);
        let candidates = starts;
        if (lineNum === head.line) {
            candidates = starts.filter((pos) => pos < head.ch);
        }
        if (candidates.length >= remaining) {
            const index = candidates.length - remaining;
            const target = candidates[index];
            if (target !== undefined) {
                return {
                    line: lineNum,
                    ch: target,
                };
            }
        }
        remaining -= candidates.length;
    }
    return null;
}

function findForwardEnd(
    cm: { getLine(line: number): string; lastLine(): number },
    head: VimPos,
    repeat: number,
): VimPos | null {
    let remaining = repeat;
    const lastLine = cm.lastLine();
    for (let lineNum = head.line; lineNum <= lastLine; lineNum++) {
        const line = cm.getLine(lineNum);
        const ends = getLineEnds(line);
        let candidates = ends;
        if (lineNum === head.line) {
            candidates = ends.filter((end) => end - 1 > head.ch);
        } else {
            const firstNonWs = firstNonWhitespace(line);
            if (firstNonWs === null) continue;
            candidates = ends.filter((end) => end - 1 >= firstNonWs);
        }
        if (candidates.length >= remaining) {
            const target = candidates[remaining - 1];
            if (target !== undefined) {
                return { line: lineNum, ch: target - 1 };
            }
        }
        remaining -= candidates.length;
    }
    return null;
}

function findBackwardEnd(
    cm: { getLine(line: number): string },
    head: VimPos,
    repeat: number,
): VimPos | null {
    let remaining = repeat;
    for (let lineNum = head.line; lineNum >= 0; lineNum--) {
        const line = cm.getLine(lineNum);
        const ends = getLineEnds(line);
        let candidates = ends;
        if (lineNum === head.line) {
            candidates = ends.filter((end) => end - 1 < head.ch);
        }
        if (candidates.length >= remaining) {
            const index = candidates.length - remaining;
            const target = candidates[index];
            if (target !== undefined) {
                return {
                    line: lineNum,
                    ch: target - 1,
                };
            }
        }
        remaining -= candidates.length;
    }
    return null;
}

export const subwordForward: MotionFn = (cm, head, motionArgs) => {
    const repeat = motionArgs.repeat ?? 1;
    const found = findForwardStart(cm, head, repeat);
    return found ?? head;
};

export const subwordBackward: MotionFn = (cm, head, motionArgs) => {
    const repeat = motionArgs.repeat ?? 1;
    const found = findBackwardStart(cm, head, repeat);
    return found ?? head;
};

export const subwordEndForward: MotionFn = (cm, head, motionArgs) => {
    const repeat = motionArgs.repeat ?? 1;
    const found = findForwardEnd(cm, head, repeat);
    return found ?? head;
};

export const subwordEndBackward: MotionFn = (cm, head, motionArgs) => {
    const repeat = motionArgs.repeat ?? 1;
    const found = findBackwardEnd(cm, head, repeat);
    return found ?? head;
};
