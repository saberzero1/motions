/**
 * Runs every disposer, isolating failures.
 *
 * A bare `for (const c of cleanups) c()` stops at the first throw: later
 * disposers never run, and neither does whatever follows the loop. In
 * `destroyState` that also skipped `lua_close`, so one bad finalizer leaked the
 * entire Lua state.
 *
 * Disposal continues past a failure and every failure is reported. Silence
 * would leave a half-torn-down subsystem looking identical to a clean one.
 */
export function runCleanups(
    cleanups: Iterable<() => void>,
    context: string,
): void {
    for (const cleanup of cleanups) {
        try {
            cleanup();
        } catch (err) {
            console.error(`Vim Motions: ${context} cleanup failed:`, err);
        }
    }
}
