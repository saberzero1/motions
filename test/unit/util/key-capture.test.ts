/**
 * Phase 1 of `.sisyphus/plans/lifetime-ownership.md`.
 *
 * These pin the property the five converted call sites depend on: the listener
 * and anything acquired with it are released on every exit path, exactly once.
 * The defect being prevented is a listener that outlives an abandoned Promise,
 * which shipped once already in `vim.fn.getcharstr()`.
 */
import { describe, it, expect } from 'vitest';
import {
    captureKeys,
    type KeyCaptureTarget,
} from '../../../src/util/key-capture';

function fakeTarget(): KeyCaptureTarget & {
    listenerCount: number;
    press: (key: string) => void;
} {
    let handler: ((e: KeyboardEvent) => void) | null = null;
    return {
        listenerCount: 0,
        addEventListener(_type, h) {
            handler = h;
            this.listenerCount++;
        },
        removeEventListener() {
            handler = null;
            this.listenerCount--;
        },
        press(key: string) {
            handler?.({ key } as KeyboardEvent);
        },
    };
}

describe('captureKeys', () => {
    it('K1: releases the listener when a key settles the capture', async () => {
        const target = fakeTarget();
        let released = 0;

        const capture = captureKeys<string>({
            onKey: (e, settle) => settle(e.key),
            abortValue: 'aborted',
            release: () => released++,
            target,
        });
        expect(target.listenerCount).toBe(1);

        target.press('x');

        await expect(capture.promise).resolves.toBe('x');
        expect(target.listenerCount).toBe(0);
        expect(released).toBe(1);
    });

    it('K2: releases the listener and the lease on abort', async () => {
        const target = fakeTarget();
        let leaseHeld = false;

        const capture = captureKeys<string | null>({
            onKey: (e, settle) => settle(e.key),
            abortValue: null,
            acquire: () => (leaseHeld = true),
            release: () => (leaseHeld = false),
            target,
        });
        expect(leaseHeld).toBe(true);
        expect(target.listenerCount).toBe(1);

        capture.abort();

        await expect(capture.promise).resolves.toBeNull();
        expect(target.listenerCount).toBe(0);
        expect(leaseHeld).toBe(false);
    });

    it('K3: abort is idempotent and releases exactly once', async () => {
        const target = fakeTarget();
        let released = 0;

        const capture = captureKeys<string | null>({
            onKey: (e, settle) => settle(e.key),
            abortValue: null,
            release: () => released++,
            target,
        });

        capture.abort();
        capture.abort();
        capture.abort();

        await expect(capture.promise).resolves.toBeNull();
        expect(released).toBe(1);
        expect(target.listenerCount).toBe(0);
    });

    it('K3b: a key arriving after abort does not settle or re-release', async () => {
        const target = fakeTarget();
        let released = 0;

        const capture = captureKeys<string | null>({
            onKey: (e, settle) => settle(e.key),
            abortValue: null,
            release: () => released++,
            target,
        });

        capture.abort();
        target.press('x');

        await expect(capture.promise).resolves.toBeNull();
        expect(released).toBe(1);
    });

    it('K4: two captures do not interfere', async () => {
        const first = fakeTarget();
        const second = fakeTarget();

        const a = captureKeys<string | null>({
            onKey: (e, settle) => settle(e.key),
            abortValue: null,
            target: first,
        });
        const b = captureKeys<string | null>({
            onKey: (e, settle) => settle(e.key),
            abortValue: null,
            target: second,
        });

        a.abort();
        second.press('y');

        await expect(a.promise).resolves.toBeNull();
        await expect(b.promise).resolves.toBe('y');
        expect(first.listenerCount).toBe(0);
        expect(second.listenerCount).toBe(0);
    });

    it('K5: lease balance holds across every exit ordering', async () => {
        for (const exit of [
            'key',
            'abort',
            'abort-then-key',
            'key-then-abort',
        ]) {
            const target = fakeTarget();
            let depth = 0;

            const capture = captureKeys<string | null>({
                onKey: (e, settle) => settle(e.key),
                abortValue: null,
                acquire: () => depth++,
                release: () => depth--,
                target,
            });

            if (exit === 'key') target.press('a');
            if (exit === 'abort') capture.abort();
            if (exit === 'abort-then-key') {
                capture.abort();
                target.press('a');
            }
            if (exit === 'key-then-abort') {
                target.press('a');
                capture.abort();
            }

            await capture.promise;
            expect(depth, `exit=${exit}`).toBe(0);
            expect(target.listenerCount, `exit=${exit}`).toBe(0);
        }
    });

    it('ignoring an event keeps the capture open', async () => {
        const target = fakeTarget();

        const capture = captureKeys<string | null>({
            onKey: (e, settle) => {
                if (e.key === 'Enter') settle('done');
            },
            abortValue: null,
            target,
        });

        target.press('a');
        target.press('b');
        expect(target.listenerCount).toBe(1);

        target.press('Enter');
        await expect(capture.promise).resolves.toBe('done');
        expect(target.listenerCount).toBe(0);
    });
});
