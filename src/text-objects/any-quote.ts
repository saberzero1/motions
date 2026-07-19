import type { MotionFn, VimPos } from '../types/vim-api';
import { adjustRangeForVisualMode } from './delimiter';

const createPos = (line: number, ch: number): VimPos => ({ line, ch });

interface QuotePair {
    start: number;
    end: number;
}

const isEscaped = (text: string, index: number): boolean => {
    let count = 0;
    for (let i = index - 1; i >= 0; i--) {
        if (text[i] !== '\\') break;
        count += 1;
    }
    return count % 2 === 1;
};

const findQuotePairs = (lineText: string, quote: string): QuotePair[] => {
    const positions: number[] = [];
    for (let i = 0; i < lineText.length; i++) {
        if (lineText[i] === quote && !isEscaped(lineText, i)) {
            positions.push(i);
        }
    }
    const pairs: QuotePair[] = [];
    for (let i = 0; i < positions.length - 1; i += 2) {
        const start = positions[i];
        const end = positions[i + 1];
        if (start === undefined || end === undefined) continue;
        pairs.push({ start, end });
    }
    return pairs;
};

const findBestPair = (pairs: QuotePair[], cursor: number): QuotePair | null => {
    let best: QuotePair | null = null;
    for (const pair of pairs) {
        if (cursor >= pair.start && cursor <= pair.end) {
            if (!best || pair.end - pair.start < best.end - best.start) {
                best = pair;
            }
        }
    }
    return best;
};

const findNextPair = (pairs: QuotePair[], cursor: number): QuotePair | null => {
    let next: QuotePair | null = null;
    for (const pair of pairs) {
        if (pair.start > cursor) {
            if (!next || pair.start < next.start) {
                next = pair;
            } else if (pair.start === next.start) {
                if (pair.end - pair.start < next.end - next.start) {
                    next = pair;
                }
            }
        }
    }
    return next;
};

const collectPairs = (lineText: string): QuotePair[] => [
    ...findQuotePairs(lineText, '"'),
    ...findQuotePairs(lineText, "'"),
    ...findQuotePairs(lineText, '`'),
];

export const anyQuoteInnerTextObject: MotionFn = (cm, head, _ma, vim) => {
    const lineText = cm.getLine(head.line);
    const cursor = Math.max(0, Math.min(head.ch, lineText.length));
    const pairs = collectPairs(lineText);
    const best = findBestPair(pairs, cursor) ?? findNextPair(pairs, cursor);
    if (!best) return null;

    const innerStart = best.start + 1;
    const innerEnd = best.end;
    if (innerStart >= innerEnd) return null;

    return adjustRangeForVisualMode(
        [createPos(head.line, innerStart), createPos(head.line, innerEnd)],
        vim,
    );
};

export const anyQuoteAroundTextObject: MotionFn = (cm, head, _ma, vim) => {
    const lineText = cm.getLine(head.line);
    const cursor = Math.max(0, Math.min(head.ch, lineText.length));
    const pairs = collectPairs(lineText);
    const best = findBestPair(pairs, cursor) ?? findNextPair(pairs, cursor);
    if (!best) return null;

    return adjustRangeForVisualMode(
        [createPos(head.line, best.start), createPos(head.line, best.end + 1)],
        vim,
    );
};
