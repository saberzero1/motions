/**
 * Owns a modal key-capture listener and everything acquired alongside it.
 *
 * A listener installed inside a Promise executor is released only on the paths
 * that settle it, and nothing settles an abandoned Promise. That shipped as a
 * real defect in `vim.fn.getcharstr()`, where a dropped await left the capture
 * listener installed and the next keystroke was silently eaten.
 *
 * Every exit path here runs the same teardown exactly once: a key that settles
 * the capture, an explicit `abort()`, or a second `abort()` after either. The
 * caller supplies only the key logic and, optionally, whatever else must be
 * acquired and released with the listener — an overlay, or the global key
 * intercept lease.
 *
 * `src/lua/key-broker.ts` solves the same problem for `getcharstr`, but it also
 * multiplexes several waiters over one listener, which none of these callers
 * need.
 */

/** The part of `Document` this needs, so tests can supply a fake. */
export interface KeyCaptureTarget {
    addEventListener(
        type: 'keydown',
        handler: (e: KeyboardEvent) => void,
        capture: boolean,
    ): void;
    removeEventListener(
        type: 'keydown',
        handler: (e: KeyboardEvent) => void,
        capture: boolean,
    ): void;
}

export interface KeyCaptureHandle<T> {
    promise: Promise<T>;
    /** Settles with `abortValue` and releases. Idempotent. */
    abort: () => void;
}

export interface KeyCaptureOptions<T> {
    /**
     * Receives each keydown plus a `settle` callback. Call `settle` to finish
     * the capture; ignore the event to keep waiting.
     */
    onKey: (e: KeyboardEvent, settle: (value: T) => void) => void;
    /** Resolved when `abort()` is called instead of a key settling the capture. */
    abortValue: T;
    /** Acquired with the listener. */
    acquire?: () => void;
    /** Released with the listener, on every exit path. */
    release?: () => void;
    target?: KeyCaptureTarget;
}

export function captureKeys<T>(
    options: KeyCaptureOptions<T>,
): KeyCaptureHandle<T> {
    const { onKey, abortValue, acquire, release } = options;
    // Annotated, not inferred: the union of `KeyCaptureTarget | Document`
    // would force calls to satisfy both overload sets at once.
    const target: KeyCaptureTarget = options.target ?? activeDocument;

    let settled = false;
    let resolveFn!: (value: T) => void;
    const promise = new Promise<T>((resolve) => {
        resolveFn = resolve;
    });

    const handler = (e: KeyboardEvent): void => {
        onKey(e, finish);
    };

    function finish(value: T): void {
        // The single release point. Guarded because a handler may settle while
        // an abort is already in flight, and because abort() is documented
        // idempotent.
        if (settled) return;
        settled = true;
        target.removeEventListener('keydown', handler, true);
        release?.();
        resolveFn(value);
    }

    acquire?.();
    target.addEventListener('keydown', handler, true);

    return { promise, abort: () => finish(abortValue) };
}
