import { describe, it, expect } from 'vitest';
import {
    findSubstringTargets,
    findCharTargets,
} from '../../src/easymotion/targets';

function stubCm(lines: string[]) {
    return {
        getLine: (n: number) => lines[n] ?? '',
        getCursor: () => ({ line: 0, ch: 0 }),
        lastLine: () => lines.length - 1,
        cm6: {
            scrollDOM: { scrollTop: 0, clientHeight: 1000 },
            lineBlockAtHeight: () => ({ from: 0, to: 0 }),
            state: {
                doc: {
                    // Only reliable for single-line stubs; for multi-line,
                    // expand the lineAt logic to map byte offsets to lines.
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
});
