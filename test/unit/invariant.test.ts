import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
    invariant,
    devAssert,
    getViolations,
    clearViolations,
} from '../../src/util/invariant';

describe('invariant()', () => {
    beforeEach(() => {
        clearViolations();
        vi.restoreAllMocks();
    });

    it('is a no-op when condition is truthy', () => {
        invariant(true, 'should not fire');
        expect(getViolations()).toHaveLength(0);
    });

    it('records a violation when condition is falsy', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        invariant(false, 'test violation');
        const violations = getViolations();
        expect(violations).toHaveLength(1);
        expect(violations[0]?.message).toBe('test violation');
        spy.mockRestore();
    });

    it('logs to console.error on violation', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        invariant(false, 'error log test');
        expect(spy).toHaveBeenCalledWith('[invariant] error log test');
        spy.mockRestore();
    });

    it('caps violations at MAX_VIOLATIONS (200)', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        for (let i = 0; i < 210; i++) {
            invariant(false, `violation ${i}`);
        }
        expect(getViolations()).toHaveLength(200);
        spy.mockRestore();
    });

    it('includes stack trace in dev mode', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        invariant(false, 'stack test');
        const violations = getViolations();
        expect(violations[0]?.stack).toBeDefined();
        expect(violations[0]?.stack).toContain('invariant.test.ts');
        spy.mockRestore();
    });

    it('rate-limits Notice creation (5s cooldown)', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.useFakeTimers();

        invariant(false, 'first');
        invariant(false, 'second within cooldown');

        const violations = getViolations();
        expect(violations).toHaveLength(2);

        vi.useRealTimers();
        spy.mockRestore();
    });
});

describe('devAssert()', () => {
    beforeEach(() => {
        clearViolations();
        vi.restoreAllMocks();
    });

    it('is a no-op when condition is truthy', () => {
        devAssert(true, 'should not fire');
        expect(getViolations()).toHaveLength(0);
    });

    it('records a violation with [dev] prefix when condition is falsy', () => {
        const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        devAssert(false, 'dev test');
        const violations = getViolations();
        expect(violations).toHaveLength(1);
        expect(violations[0]?.message).toBe('[dev] dev test');
        spy.mockRestore();
    });

    it('uses console.warn not console.error', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const errorSpy = vi
            .spyOn(console, 'error')
            .mockImplementation(() => {});
        devAssert(false, 'warn test');
        expect(warnSpy).toHaveBeenCalledWith('[devAssert] warn test');
        expect(errorSpy).not.toHaveBeenCalled();
        warnSpy.mockRestore();
        errorSpy.mockRestore();
    });

    it('includes stack trace', () => {
        const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        devAssert(false, 'stack test');
        const violations = getViolations();
        expect(violations[0]?.stack).toBeDefined();
        spy.mockRestore();
    });
});

describe('getViolations()', () => {
    beforeEach(() => {
        clearViolations();
    });

    it('returns a shallow copy (mutations do not affect internal array)', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        invariant(false, 'copy test');
        const copy = getViolations() as unknown as { message: string }[];
        expect(copy).toHaveLength(1);

        copy.length = 0;
        expect(getViolations()).toHaveLength(1);
        spy.mockRestore();
    });
});

describe('clearViolations()', () => {
    beforeEach(() => {
        clearViolations();
    });

    it('empties the violations array', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        invariant(false, 'to be cleared');
        expect(getViolations()).toHaveLength(1);
        clearViolations();
        expect(getViolations()).toHaveLength(0);
        spy.mockRestore();
    });
});
