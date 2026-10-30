/**
 * Phase 1 of `.sisyphus/plans/lifetime-ownership.md`.
 *
 * These pin the property the five converted call sites depend on: the listener
 * and anything acquired with it are released on every exit path, exactly once.
 * The defect being prevented is a listener that outlives an abandoned Promise,
 * which shipped once already in `vim.fn.getcharstr()`.
 */
import { afterEach, describe, it, expect } from 'vitest';
import {
    captureKeys,
    holdObsidianKeymap,
    setCaptureKeymap,
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

/**
 * A capture also holds Obsidian's keymap, so its hotkeys cannot take keys the
 * capture is waiting for: with Delete paragraph on Ctrl+D, flash, EasyMotion
 * and getcharstr all lost the key and a paragraph with it.
 */
describe("holding Obsidian's keymap", () => {
    function fakeKeymap(): {
        pushScope(scope: unknown): void;
        popScope(scope: unknown): void;
        stack: unknown[];
        pops: number;
    } {
        return {
            stack: [],
            pops: 0,
            pushScope(scope) {
                this.stack.push(scope);
            },
            popScope(scope) {
                this.pops++;
                this.stack = this.stack.filter((s) => s !== scope);
            },
        };
    }

    afterEach(() => setCaptureKeymap(null));

    it('pushes a parentless scope for the capture and pops it when a key settles it', async () => {
        const keymap = fakeKeymap();
        setCaptureKeymap(keymap as never);
        const target = fakeTarget();

        const capture = captureKeys<string>({
            onKey: (e, settle) => settle(e.key),
            abortValue: 'aborted',
            target,
        });
        const held = keymap.stack.slice();
        target.press('x');
        await capture.promise;

        expect(held).toHaveLength(1);
        expect((held[0] as { parent?: unknown }).parent).toBeUndefined();
        expect(keymap.stack).toEqual([]);
        expect(keymap.pops).toBe(1);
    });

    it('pops exactly once across abort, a second abort and a late key', async () => {
        const keymap = fakeKeymap();
        setCaptureKeymap(keymap as never);
        const target = fakeTarget();

        const capture = captureKeys<string>({
            onKey: (e, settle) => settle(e.key),
            abortValue: 'aborted',
            target,
        });
        capture.abort();
        capture.abort();
        target.press('x');
        await capture.promise;

        expect(keymap.stack).toEqual([]);
        expect(keymap.pops).toBe(1);
    });

    it('lets the getcharstr broker hold it the same way', () => {
        const keymap = fakeKeymap();
        setCaptureKeymap(keymap as never);

        const release = holdObsidianKeymap();
        const held = keymap.stack.length;
        release();
        release();

        expect(held).toBe(1);
        expect(keymap.pops).toBe(1);
    });

    it('does nothing before the plugin has set a keymap', () => {
        const release = holdObsidianKeymap();

        expect(() => release()).not.toThrow();
    });
});
