import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { withTimeout } from '../../../src/picker/api';

describe('withTimeout', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('cancels the timer when the work resolves first', async () => {
        const clearSpy = vi.spyOn(window, 'clearTimeout');

        await withTimeout(Promise.resolve('done'), 'Source "x" items()');

        expect(clearSpy).toHaveBeenCalledTimes(1);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('cancels the timer when the work rejects first', async () => {
        await expect(
            withTimeout(
                Promise.reject(new Error('boom')),
                'Source "x" items()',
            ),
        ).rejects.toThrow('boom');

        expect(vi.getTimerCount()).toBe(0);
    });

    it('leaves no live timer after many resolved calls', async () => {
        for (let i = 0; i < 25; i++) {
            await withTimeout(Promise.resolve(i), `Source "x" search() ${i}`);
        }

        expect(vi.getTimerCount()).toBe(0);
    });

    it('still rejects with the labelled message when the work never settles', async () => {
        const pending = withTimeout(
            new Promise<string>(() => undefined),
            'Source "slow" items()',
        );
        const advancing = vi.advanceTimersByTimeAsync(5000);

        await expect(pending).rejects.toThrow(
            'Source "slow" items() timed out after 5000ms',
        );
        await advancing;
    });

    it('resolves with the work value', async () => {
        await expect(
            withTimeout(Promise.resolve([1, 2, 3]), 'Source "x" items()'),
        ).resolves.toEqual([1, 2, 3]);
    });
});
