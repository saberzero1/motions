/**
 * Single owner of the key-capture listener used by `vim.fn.getcharstr` and
 * `vim.fn.getchar`.
 *
 * Each call previously installed its own capture-phase listener and its own
 * intercept flag, which produced two defects:
 *
 * - One keypress resolved *every* pending waiter, because all listeners saw
 *   the same event.
 * - A waiter abandoned by the coroutine runner's timeout never ran its
 *   cleanup, so the listener stayed installed and key interception stayed on
 *   until some later key arrived — silently swallowing it.
 *
 * The broker holds at most one listener and one intercept lease for any number
 * of waiters, delivers each key to exactly one of them in FIFO order, and
 * releases both as soon as the last waiter leaves by any route: resolution,
 * abort, or teardown.
 */

export interface KeyBrokerHost {
    /**
     * Installs a key listener and returns a function that removes it. The
     * handler receives the key, or `null` for a cancelling keypress.
     */
    listen(handler: (key: string | null) => void): () => void;
    setInterceptActive(active: boolean): void;
}

interface Waiter {
    resolve: (key: string | null) => void;
}

export interface KeyWait {
    promise: Promise<string | null>;
    /** Removes this waiter and resolves it with `null`. Idempotent. */
    abort: () => void;
}

export class KeyBroker {
    private readonly host: KeyBrokerHost;
    private waiters: Waiter[] = [];
    private removeListener: (() => void) | null = null;

    constructor(host: KeyBrokerHost) {
        this.host = host;
    }

    get pendingCount(): number {
        return this.waiters.length;
    }

    get isListening(): boolean {
        return this.removeListener !== null;
    }

    wait(): KeyWait {
        let resolveFn!: (key: string | null) => void;
        const promise = new Promise<string | null>((resolve) => {
            resolveFn = resolve;
        });
        const waiter: Waiter = { resolve: resolveFn };
        this.waiters.push(waiter);
        this.startListening();
        return { promise, abort: () => this.settle(waiter, null) };
    }

    /** Resolves every pending waiter with `null` and releases the listener. */
    abortAll(): void {
        for (const waiter of [...this.waiters]) {
            this.settle(waiter, null);
        }
    }

    private startListening(): void {
        if (this.removeListener) return;
        this.host.setInterceptActive(true);
        this.removeListener = this.host.listen((key) => {
            const next = this.waiters[0];
            // FIFO, one waiter per key. Every waiter resolving from a single
            // press is the defect this replaces.
            if (next) this.settle(next, key);
        });
    }

    private settle(waiter: Waiter, key: string | null): void {
        const index = this.waiters.indexOf(waiter);
        if (index === -1) return;
        this.waiters.splice(index, 1);
        waiter.resolve(key);
        this.stopIfIdle();
    }

    private stopIfIdle(): void {
        if (this.waiters.length > 0) return;
        this.removeListener?.();
        this.removeListener = null;
        this.host.setInterceptActive(false);
    }
}
