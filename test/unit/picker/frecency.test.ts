import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FrecencyStore } from '../../../src/picker/frecency';

const ONE_HOUR = 60 * 60 * 1000;
const ONE_DAY = 24 * ONE_HOUR;

describe('FrecencyStore', () => {
    let store: FrecencyStore;
    const now = new Date('2025-01-01T00:00:00Z').getTime();

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(now);
        store = new FrecencyStore();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns score 0 for empty store', () => {
        expect(store.getScore('missing')).toBe(0);
    });

    it('recent access scores highest', () => {
        vi.setSystemTime(now - 10 * ONE_DAY);
        store.recordAccess('old');
        vi.setSystemTime(now);
        store.recordAccess('recent');
        expect(store.getScore('recent')).toBeGreaterThan(store.getScore('old'));
    });

    it('older accesses score progressively lower', () => {
        vi.setSystemTime(now - ONE_HOUR);
        store.recordAccess('hour');
        vi.setSystemTime(now - 3 * ONE_DAY);
        store.recordAccess('days');
        vi.setSystemTime(now - 30 * ONE_DAY);
        store.recordAccess('month');
        vi.setSystemTime(now);

        const hourScore = store.getScore('hour');
        const daysScore = store.getScore('days');
        const monthScore = store.getScore('month');

        expect(hourScore).toBeGreaterThan(daysScore);
        expect(daysScore).toBeGreaterThan(monthScore);
    });

    it('multiple accesses increase score', () => {
        store.recordAccess('repeat');
        const firstScore = store.getScore('repeat');
        store.recordAccess('repeat');
        const secondScore = store.getScore('repeat');
        expect(secondScore).toBeGreaterThan(firstScore);
    });

    it('evicts lowest entry after exceeding 1000 entries', () => {
        for (let i = 0; i < 999; i++) {
            store.recordAccess(`high-${i}`);
        }
        vi.setSystemTime(now - 40 * ONE_DAY);
        store.recordAccess('low');
        vi.setSystemTime(now);
        store.recordAccess('new');

        const data = store.serialize();
        expect(Object.keys(data)).toHaveLength(1000);
        expect(data.new).toBeDefined();
        expect(data.low).toBeUndefined();
    });

    it('serialize/deserialize round-trip preserves data', () => {
        store.recordAccess('first');
        vi.setSystemTime(now - ONE_DAY);
        store.recordAccess('second');
        vi.setSystemTime(now);

        const data = store.serialize();
        const restored = new FrecencyStore();
        restored.deserialize(data);
        expect(restored.serialize()).toEqual(data);
    });

    it('prunes timestamps older than 90 days on serialize', () => {
        vi.setSystemTime(now - 100 * ONE_DAY);
        store.recordAccess('stale');
        vi.setSystemTime(now);
        const data = store.serialize();
        expect(data.stale).toBeUndefined();
    });

    it('updates existing entry when accessing same item', () => {
        store.recordAccess('same');
        store.recordAccess('same');
        const data = store.serialize();
        expect(Object.keys(data)).toEqual(['same']);
        expect(data.same?.count).toBe(2);
        expect(data.same?.timestamps).toHaveLength(2);
    });
});
