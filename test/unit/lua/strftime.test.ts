import { describe, it, expect } from 'vitest';
import { strftime } from '../../../src/lua/strftime';

describe('strftime', () => {
    it('should format common specifiers', () => {
        const date = new Date(2024, 0, 2, 3, 4, 5);
        expect(strftime('%Y-%m-%d', date)).toBe('2024-01-02');
        expect(strftime('%H:%M:%S', date)).toBe('03:04:05');
        expect(strftime('%%', date)).toBe('%');
        expect(strftime('%A', date)).toBe('Tuesday');
        expect(strftime('%B', date)).toBe('January');
        expect(strftime('%I %p', date)).toBe('03 AM');
        expect(strftime('%j', date)).toBe('002');
        expect(strftime('%u', date)).toBe('2');
        expect(strftime('%w', date)).toBe('2');
        expect(strftime('%d', date)).toBe('02');
        expect(strftime('%s', date)).toBe(
            String(Math.floor(date.getTime() / 1000)),
        );
    });
});
