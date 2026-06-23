import type { CmAdapter, VimApi } from '../types/vim-api';
import type { Target, VisibleRange } from './types';

export type Direction = 'forward' | 'backward' | 'bidirectional';

export function getVisibleRange(cm: CmAdapter): VisibleRange {
    const view = cm.cm6;
    if (!view) return { fromLine: 0, toLine: cm.lastLine() };
    const top = view.lineBlockAtHeight(view.scrollDOM.scrollTop);
    const bottom = view.lineBlockAtHeight(
        view.scrollDOM.scrollTop + view.scrollDOM.clientHeight,
    );
    const fromLine = view.state.doc.lineAt(top.from).number - 1;
    const toLine = view.state.doc.lineAt(bottom.to).number - 1;
    return { fromLine, toLine };
}

function isForward(
    target: Target,
    cursorLine: number,
    cursorCh: number,
): boolean {
    return (
        target.line > cursorLine ||
        (target.line === cursorLine && target.ch > cursorCh)
    );
}

function filterByDirection(
    targets: Target[],
    cm: CmAdapter,
    direction: Direction,
): Target[] {
    if (direction === 'bidirectional') {
        const cursor = cm.getCursor();
        return [...targets].sort((a, b) => {
            const distA =
                Math.abs(a.line - cursor.line) * 10000 +
                Math.abs(a.ch - cursor.ch);
            const distB =
                Math.abs(b.line - cursor.line) * 10000 +
                Math.abs(b.ch - cursor.ch);
            return distA - distB;
        });
    }

    const cursor = cm.getCursor();
    if (direction === 'forward') {
        return targets.filter((t) => isForward(t, cursor.line, cursor.ch));
    }

    // backward — also reverse so closest to cursor gets first label
    return targets
        .filter((t) => !isForward(t, cursor.line, cursor.ch))
        .reverse();
}

function collectRegexTargets(
    cm: CmAdapter,
    regex: RegExp,
    fromLine: number,
    toLine: number,
): Target[] {
    const targets: Target[] = [];
    for (let line = fromLine; line <= toLine; line++) {
        const text = cm.getLine(line);
        regex.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(text)) !== null) {
            targets.push({ line, ch: match.index });
        }
    }
    return targets;
}

const WORD_START_RE = /\b\w/g;
const BIG_WORD_START_RE = /(?<=\s|^)\S/g;

export function findWordStartTargets(
    cm: CmAdapter,
    direction: Direction,
    bigWord: boolean,
): Target[] {
    const { fromLine, toLine } = getVisibleRange(cm);
    const re = bigWord ? BIG_WORD_START_RE : WORD_START_RE;
    const raw = collectRegexTargets(cm, re, fromLine, toLine);
    return filterByDirection(raw, cm, direction);
}

const WORD_CHARS_RE = /\w+/g;
const BIG_WORD_CHARS_RE = /\S+/g;

export function findWordEndTargets(
    cm: CmAdapter,
    direction: Direction,
    bigWord: boolean,
): Target[] {
    const { fromLine, toLine } = getVisibleRange(cm);
    const re = bigWord ? BIG_WORD_CHARS_RE : WORD_CHARS_RE;
    const targets: Target[] = [];
    for (let line = fromLine; line <= toLine; line++) {
        const text = cm.getLine(line);
        re.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = re.exec(text)) !== null) {
            targets.push({ line, ch: match.index + match[0].length - 1 });
        }
    }
    return filterByDirection(targets, cm, direction);
}

export function findCharTargets(
    cm: CmAdapter,
    char: string,
    direction: Direction,
): Target[] {
    const { fromLine, toLine } = getVisibleRange(cm);
    const targets: Target[] = [];
    for (let line = fromLine; line <= toLine; line++) {
        const text = cm.getLine(line);
        let idx = 0;
        while (idx < text.length) {
            const found = text.indexOf(char, idx);
            if (found === -1) break;
            targets.push({ line, ch: found });
            idx = found + 1;
        }
    }
    return filterByDirection(targets, cm, direction);
}

export function findTillTargets(
    cm: CmAdapter,
    char: string,
    direction: Direction,
): Target[] {
    const charTargets = findCharTargets(cm, char, direction);
    return charTargets
        .map((t) => {
            if (direction === 'backward') {
                return { line: t.line, ch: t.ch + 1 };
            }
            if (direction === 'forward') {
                return t.ch > 0 ? { line: t.line, ch: t.ch - 1 } : null;
            }
            return t;
        })
        .filter((t): t is Target => t !== null);
}

export function findLineTargets(cm: CmAdapter, direction: Direction): Target[] {
    const { fromLine, toLine } = getVisibleRange(cm);
    const targets: Target[] = [];
    for (let line = fromLine; line <= toLine; line++) {
        const text = cm.getLine(line);
        if (text.trim().length === 0) continue;
        const firstNonBlank = text.search(/\S/);
        targets.push({ line, ch: Math.max(0, firstNonBlank) });
    }
    return filterByDirection(targets, cm, direction);
}

export function findSearchTargets(
    cm: CmAdapter,
    direction: Direction,
    vim: VimApi,
): Target[] {
    const globalState = vim.getVimGlobalState_();
    const query = globalState.query as
        | { source: string; flags: string }
        | undefined;
    if (!query?.source) return [];

    const { fromLine, toLine } = getVisibleRange(cm);
    let re: RegExp;
    try {
        re = new RegExp(query.source, 'g' + (query.flags ?? ''));
    } catch {
        return [];
    }
    const raw = collectRegexTargets(cm, re, fromLine, toLine);
    return filterByDirection(raw, cm, direction);
}
