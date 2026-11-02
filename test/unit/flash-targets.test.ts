import { describe, it, expect } from 'vitest';
import {
    findSubstringTargets,
    findCharTargets,
    findTillTargets,
} from '../../src/easymotion/targets';
import { findFlashCharacterPositions } from '../../src/flash/character-match';

function stubCm(lines: string[]) {
    const totalLen = lines.reduce((sum, l) => sum + l.length + 1, 0);
    return {
        getLine: (n: number) => lines[n] ?? '',
        getCursor: () => ({ line: 0, ch: 0 }),
        lastLine: () => lines.length - 1,
        cm6: {
            scrollDOM: { scrollTop: 0, clientHeight: 1000 },
            visibleRanges: [{ from: 0, to: Math.max(0, totalLen - 1) }],
            state: {
                doc: {
                    lineAt: (pos: number) => ({
                        number: pos === 0 ? 1 : lines.length,
                    }),
                },
            },
        },
    } as any;
}

describe('findSubstringTargets matchLength', () => {
    it('sets matchLength to pattern length', () => {
        const cm = stubCm(['hello world hello']);
        const targets = findSubstringTargets(cm, 'hello', 'bidirectional');
        expect(targets.length).toBe(2);
        for (const t of targets) {
            expect(t.matchLength).toBe(5);
        }
    });

    it('sets matchLength for single-char pattern', () => {
        const cm = stubCm(['abcabc']);
        const targets = findSubstringTargets(cm, 'a', 'bidirectional');
        for (const t of targets) {
            expect(t.matchLength).toBe(1);
        }
    });

    it('sets matchLength for multi-char pattern', () => {
        const cm = stubCm(['ab cd ab ef ab']);
        const targets = findSubstringTargets(cm, 'ab', 'bidirectional');
        expect(targets.length).toBe(3);
        for (const t of targets) {
            expect(t.matchLength).toBe(2);
        }
    });

    it('returns empty for empty pattern', () => {
        const cm = stubCm(['hello']);
        const targets = findSubstringTargets(cm, '', 'bidirectional');
        expect(targets).toEqual([]);
    });
});

describe('findCharTargets matchLength', () => {
    it('does not set matchLength (defaults to undefined)', () => {
        const cm = stubCm(['abcabc']);
        const targets = findCharTargets(cm, 'a', 'bidirectional');
        for (const t of targets) {
            expect(t.matchLength).toBeUndefined();
        }
    });

    it('matches Chinese characters by pinyin initial only when enabled', () => {
        const cm = stubCm(['x啊安a行']);
        cm.getCursor = () => ({ line: 0, ch: 0 });

        expect(findCharTargets(cm, 'a', 'forward')).toEqual([
            { line: 0, ch: 3 },
        ]);
        expect(
            findCharTargets(cm, 'a', 'forward', (text, target) =>
                findFlashCharacterPositions(text, -1, target, true, true),
            ),
        ).toEqual([
            { line: 0, ch: 1 },
            { line: 0, ch: 2 },
            { line: 0, ch: 3 },
        ]);
    });

    it('keeps UTF-16 columns when scanning past a surrogate pair', () => {
        const cm = stubCm(['x😀啊']);
        cm.getCursor = () => ({ line: 0, ch: 0 });
        expect(
            findCharTargets(cm, 'a', 'forward', (text, target) =>
                findFlashCharacterPositions(text, -1, target, true, true),
            ),
        ).toEqual([{ line: 0, ch: 3 }]);
    });
});

describe('findTillTargets forward column 0', () => {
    it('wraps to previous line end when match is at column 0', () => {
        const cm = stubCm(['hello', 'xworld']);
        cm.getCursor = () => ({ line: 0, ch: 0 });
        const targets = findTillTargets(cm, 'x', 'forward');
        expect(targets.length).toBe(1);
        expect(targets[0]!.line).toBe(0);
        expect(targets[0]!.ch).toBe(4);
    });

    it('excludes match at column 0 of first line', () => {
        const cm = stubCm(['xhello']);
        cm.getCursor = () => ({ line: 0, ch: 0 });
        const targets = findTillTargets(cm, 'x', 'forward');
        expect(targets.length).toBe(0);
    });

    it('returns ch-1 for non-zero column match', () => {
        const cm = stubCm(['abxcd']);
        cm.getCursor = () => ({ line: 0, ch: 0 });
        const targets = findTillTargets(cm, 'x', 'forward');
        expect(targets.length).toBe(1);
        expect(targets[0]!.line).toBe(0);
        expect(targets[0]!.ch).toBe(1);
    });
});
