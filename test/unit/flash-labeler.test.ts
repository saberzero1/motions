import { describe, expect, it } from 'vitest';
import { assignFlashLabels, FlashLabeler } from '../../src/flash/labeler';
import type { Target } from '../../src/easymotion/types';

function target(line: number, ch: number): Target {
    return { line, ch };
}

describe('Flash labeler — assignFlashLabels', () => {
    it('returns empty for empty targets', () => {
        expect(assignFlashLabels([], 'abcdef', 0, 0)).toEqual([]);
    });

    it('returns empty for empty label chars', () => {
        expect(assignFlashLabels([target(0, 5)], '', 0, 0)).toEqual([]);
    });

    it('assigns single-char labels when targets <= keys', () => {
        const targets = [target(0, 5), target(0, 10)];
        const result = assignFlashLabels(targets, 'abcdef', 0, 0);
        expect(result).toHaveLength(2);
        expect(result[0]?.label).toHaveLength(1);
        expect(result[1]?.label).toHaveLength(1);
    });

    it('assigns unique labels', () => {
        const targets = [target(0, 2), target(0, 5), target(0, 8)];
        const result = assignFlashLabels(targets, 'abc', 0, 0);
        const labels = result.map((r) => r.label);
        expect(new Set(labels).size).toBe(labels.length);
    });

    it('sorts by distance from cursor — nearest gets first label', () => {
        const targets = [target(0, 10), target(0, 2), target(0, 5)];
        const result = assignFlashLabels(targets, 'abc', 0, 3);
        expect(result[0]?.ch).toBe(2);
        expect(result[0]?.label).toBe('a');
    });

    it('uses 2-char labels when targets > keys', () => {
        const targets = Array.from({ length: 10 }, (_, i) => target(0, i * 3));
        const result = assignFlashLabels(targets, 'abcdef', 0, 0);
        expect(result).toHaveLength(10);
        const twoCharLabels = result.filter((r) => r.label.length === 2);
        expect(twoCharLabels.length).toBeGreaterThan(0);
    });

    it('weighs line distance more than column distance', () => {
        const targets = [target(5, 0), target(0, 50)];
        const result = assignFlashLabels(targets, 'ab', 0, 0);
        expect(result[0]?.line).toBe(0);
    });

    it('handles single target', () => {
        const result = assignFlashLabels([target(0, 5)], 'abcdef', 0, 0);
        expect(result).toHaveLength(1);
        expect(result[0]?.label).toBe('a');
    });
});

describe('Flash labeler — FlashLabeler class', () => {
    it('reuses labels for the same positions across calls', () => {
        const labeler = new FlashLabeler();
        const targets = [target(0, 5), target(0, 10)];
        const first = labeler.assign(targets, 'abcdef', 0, 0);
        const labelMap = new Map(
            first.map((t) => [`${t.line}:${t.ch}`, t.label]),
        );

        const second = labeler.assign(targets, 'abcdef', 0, 0);
        for (const t of second) {
            const prev = labelMap.get(`${t.line}:${t.ch}`);
            if (prev) {
                expect(t.label).toBe(prev);
            }
        }
    });

    it('clears reuse state on reset', () => {
        const labeler = new FlashLabeler();
        labeler.assign([target(0, 5)], 'abcdef', 0, 0);
        labeler.reset('xyz');
        const result = labeler.assign([target(0, 5)], 'xyz', 0, 0);
        expect(result[0]?.label).toBe('x');
    });

    it('skips characters in skipChars set', () => {
        const labeler = new FlashLabeler();
        const targets = [target(0, 5), target(0, 10)];
        const result = labeler.assign(targets, 'abcdef', 0, 0, new Set(['a']));
        const labels = result.map((r) => r.label);
        expect(labels.every((l) => !l.includes('a'))).toBe(true);
    });
});
