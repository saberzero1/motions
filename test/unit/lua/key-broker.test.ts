/**
 * D1 and D2 of `.sisyphus/plans/async-keymap-callbacks.md`.
 *
 * D1: an abandoned waiter left the capture listener installed and key
 * interception on, so the editor silently swallowed a later keystroke.
 * D2: one keypress resolved every pending waiter.
 */
import { describe, it, expect } from 'vitest';
import { KeyBroker, type KeyBrokerHost } from '../../../src/lua/key-broker';

function fakeHost(): KeyBrokerHost & {
    listenerCount: number;
    intercept: boolean;
    press: (key: string | null) => void;
} {
    let handler: ((key: string | null) => void) | null = null;
    const host = {
        listenerCount: 0,
        intercept: false,
        listen(next: (key: string | null) => void) {
            handler = next;
            host.listenerCount++;
            return () => {
                handler = null;
                host.listenerCount--;
            };
        },
        setInterceptActive(active: boolean) {
            host.intercept = active;
        },
        press(key: string | null) {
            handler?.(key);
        },
    };
    return host;
}

describe('KeyBroker', () => {
    it('P2a-i: one keypress resolves exactly one waiter', async () => {
        const host = fakeHost();
        const broker = new KeyBroker(host);

        const first = broker.wait();
        const second = broker.wait();
        expect(host.listenerCount).toBe(1);

        host.press('x');

        await expect(first.promise).resolves.toBe('x');
        expect(broker.pendingCount).toBe(1);

        host.press('y');
        await expect(second.promise).resolves.toBe('y');
        expect(broker.pendingCount).toBe(0);
    });

    it('P2a-ii: aborting releases both the listener and the intercept lease', async () => {
        const host = fakeHost();
        const broker = new KeyBroker(host);

        const wait = broker.wait();
        expect(host.listenerCount).toBe(1);
        expect(host.intercept).toBe(true);

        wait.abort();

        await expect(wait.promise).resolves.toBeNull();
        expect(host.listenerCount).toBe(0);
        expect(host.intercept).toBe(false);
    });

    it('holds one listener regardless of waiter count', () => {
        const host = fakeHost();
        const broker = new KeyBroker(host);

        broker.wait();
        broker.wait();
        broker.wait();

        expect(host.listenerCount).toBe(1);
        expect(broker.pendingCount).toBe(3);
    });

    it('keeps listening while other waiters remain', async () => {
        const host = fakeHost();
        const broker = new KeyBroker(host);

        const first = broker.wait();
        broker.wait();

        first.abort();
        await expect(first.promise).resolves.toBeNull();

        expect(host.listenerCount).toBe(1);
        expect(host.intercept).toBe(true);
    });

    it('a cancelling keypress resolves null without stranding the lease', async () => {
        const host = fakeHost();
        const broker = new KeyBroker(host);

        const wait = broker.wait();
        host.press(null);

        await expect(wait.promise).resolves.toBeNull();
        expect(host.listenerCount).toBe(0);
        expect(host.intercept).toBe(false);
    });

    it('abort is idempotent and does not disturb other waiters', async () => {
        const host = fakeHost();
        const broker = new KeyBroker(host);

        const first = broker.wait();
        const second = broker.wait();

        first.abort();
        first.abort();

        expect(broker.pendingCount).toBe(1);
        host.press('z');
        await expect(second.promise).resolves.toBe('z');
    });

    it('abortAll drains every waiter and releases the lease', async () => {
        const host = fakeHost();
        const broker = new KeyBroker(host);

        const first = broker.wait();
        const second = broker.wait();

        broker.abortAll();

        await expect(first.promise).resolves.toBeNull();
        await expect(second.promise).resolves.toBeNull();
        expect(broker.pendingCount).toBe(0);
        expect(host.listenerCount).toBe(0);
        expect(host.intercept).toBe(false);
    });

    it('re-installs the listener for a waiter arriving after idle', () => {
        const host = fakeHost();
        const broker = new KeyBroker(host);

        broker.wait().abort();
        expect(host.listenerCount).toBe(0);

        broker.wait();
        expect(host.listenerCount).toBe(1);
        expect(host.intercept).toBe(true);
    });
});
