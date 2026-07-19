import { describe, it, expect } from 'vitest';
import { DIAL_RULES } from '../../src/actions/dial-rules';
import { tryDial } from '../../src/actions/dial';

const [
    checkboxRule,
    booleanRule,
    hexColorRule,
    dateRule,
    cssValueRule,
    integerRule,
] = DIAL_RULES;

describe('dial-rules', () => {
    describe('checkbox (DIAL_RULES[0])', () => {
        it('toggles unchecked to checked', () => {
            const match = checkboxRule.find('- [ ] task', 3);
            expect(match).not.toBeNull();
            expect(checkboxRule.apply(match!, 1, 1)).toBe('[x]');
        });

        it('toggles checked to unchecked with dir +1', () => {
            const match = checkboxRule.find('- [x] task', 3);
            expect(match).not.toBeNull();
            expect(checkboxRule.apply(match!, 1, 1)).toBe('[ ]');
        });

        it('toggles checked to unchecked with dir -1', () => {
            const match = checkboxRule.find('- [x] task', 3);
            expect(match).not.toBeNull();
            expect(checkboxRule.apply(match!, -1, 1)).toBe('[ ]');
        });

        it('returns null when no checkbox present', () => {
            const match = checkboxRule.find('no checkbox', 3);
            expect(match).toBeNull();
        });

        it('matches second checkbox when cursor is on it', () => {
            const match = checkboxRule.find('- [ ] first [ ] second', 13);
            expect(match).not.toBeNull();
            expect(match!.start).toBe(12);
            expect(checkboxRule.apply(match!, 1, 1)).toBe('[x]');
        });
    });

    describe('boolean (DIAL_RULES[1])', () => {
        it('toggles true to false', () => {
            const match = booleanRule.find('enabled: true', 10);
            expect(match).not.toBeNull();
            expect(booleanRule.apply(match!, 1, 1)).toBe('false');
        });

        it('toggles false to true', () => {
            const match = booleanRule.find('enabled: false', 10);
            expect(match).not.toBeNull();
            expect(booleanRule.apply(match!, 1, 1)).toBe('true');
        });

        it('toggles on to off', () => {
            const match = booleanRule.find('mode: on', 6);
            expect(match).not.toBeNull();
            expect(booleanRule.apply(match!, 1, 1)).toBe('off');
        });

        it('toggles Yes to No (title case)', () => {
            const match = booleanRule.find('active: Yes', 9);
            expect(match).not.toBeNull();
            expect(booleanRule.apply(match!, 1, 1)).toBe('No');
        });

        it('toggles TRUE to FALSE (upper case)', () => {
            const match = booleanRule.find('FLAG: TRUE', 6);
            expect(match).not.toBeNull();
            expect(booleanRule.apply(match!, 1, 1)).toBe('FALSE');
        });
    });

    describe('hex color (DIAL_RULES[2])', () => {
        it('increments G component', () => {
            const match = hexColorRule.find('color: #ff0000', 10);
            expect(match).not.toBeNull();
            expect(hexColorRule.apply(match!, 1, 1)).toBe('#ff0100');
        });

        it('increments B component', () => {
            const match = hexColorRule.find('color: #ff0000', 12);
            expect(match).not.toBeNull();
            expect(hexColorRule.apply(match!, 1, 1)).toBe('#ff0001');
        });

        it('clamps at 255 (white)', () => {
            const match = hexColorRule.find('color: #ffffff', 8);
            expect(match).not.toBeNull();
            expect(hexColorRule.apply(match!, 1, 1)).toBe('#ffffff');
        });

        it('clamps at 0 (black)', () => {
            const match = hexColorRule.find('color: #000000', 8);
            expect(match).not.toBeNull();
            expect(hexColorRule.apply(match!, -1, 1)).toBe('#000000');
        });
    });

    describe('date (DIAL_RULES[3])', () => {
        it('increments year', () => {
            const match = dateRule.find('date: 2024-01-15', 8);
            expect(match).not.toBeNull();
            expect(dateRule.apply(match!, 1, 1)).toBe('2025-01-15');
        });

        it('increments month', () => {
            const match = dateRule.find('date: 2024-01-15', 12);
            expect(match).not.toBeNull();
            expect(dateRule.apply(match!, 1, 1)).toBe('2024-02-15');
        });

        it('increments day', () => {
            const match = dateRule.find('date: 2024-01-15', 15);
            expect(match).not.toBeNull();
            expect(dateRule.apply(match!, 1, 1)).toBe('2024-01-16');
        });

        it('rolls over month boundary', () => {
            const match = dateRule.find('date: 2024-01-31', 15);
            expect(match).not.toBeNull();
            expect(dateRule.apply(match!, 1, 1)).toBe('2024-02-01');
        });

        it('rolls back across month with leap year', () => {
            const match = dateRule.find('date: 2024-03-01', 15);
            expect(match).not.toBeNull();
            expect(dateRule.apply(match!, -1, 1)).toBe('2024-02-29');
        });
    });

    describe('css value (DIAL_RULES[4])', () => {
        it('increments px value', () => {
            const match = cssValueRule.find('margin: 10px', 9);
            expect(match).not.toBeNull();
            expect(cssValueRule.apply(match!, 1, 1)).toBe('11px');
        });

        it('increments decimal em value', () => {
            const match = cssValueRule.find('font-size: 1.5em', 12);
            expect(match).not.toBeNull();
            expect(cssValueRule.apply(match!, 1, 1)).toBe('2.5em');
        });

        it('decrements rem value with count', () => {
            const match = cssValueRule.find('width: 100rem', 8);
            expect(match).not.toBeNull();
            expect(cssValueRule.apply(match!, -1, 5)).toBe('95rem');
        });
    });

    describe('integer (DIAL_RULES[5])', () => {
        it('increments by 1', () => {
            const match = integerRule.find('count = 5', 8);
            expect(match).not.toBeNull();
            expect(integerRule.apply(match!, 1, 1)).toBe('6');
        });

        it('decrements by 1', () => {
            const match = integerRule.find('count = 5', 8);
            expect(match).not.toBeNull();
            expect(integerRule.apply(match!, -1, 1)).toBe('4');
        });

        it('increments by count', () => {
            const match = integerRule.find('count = 5', 8);
            expect(match).not.toBeNull();
            expect(integerRule.apply(match!, 1, 10)).toBe('15');
        });

        it('handles negative numbers', () => {
            const match = integerRule.find('val = -3', 6);
            expect(match).not.toBeNull();
            expect(integerRule.apply(match!, 1, 1)).toBe('-2');
        });
    });
});

describe('priority (via tryDial)', () => {
    it('checkbox wins over integer', () => {
        const result = tryDial('- [ ] 42', 3, 1, 1);
        expect(result).not.toBeNull();
        expect(result!.newText).toBe('[x]');
    });

    it('boolean wins over integer', () => {
        const result = tryDial('true 42', 1, 1, 1);
        expect(result).not.toBeNull();
        expect(result!.newText).toBe('false');
    });

    it('returns null for no match', () => {
        const result = tryDial('no match', 5, 1, 1);
        expect(result).toBeNull();
    });
});

describe('tryDial integration', () => {
    it('returns correct replacement info for integer', () => {
        const result = tryDial('x = 5', 4, 1, 1);
        expect(result).toEqual({
            newText: '6',
            start: 4,
            end: 5,
            cursorPos: 4,
        });
    });

    it('returns null when nothing matches', () => {
        const result = tryDial('no match here', 5, 1, 1);
        expect(result).toBeNull();
    });
});
