/**
 * Force-kills a Neovim process a spec spawned, if it is still running.
 *
 * There is deliberately no liveness check first. Cleanup runs after the spec
 * has disabled the backend, so Neovim is already shutting down and can exit
 * between a check and the kill, which then throws `kill ESRCH` and fails the
 * hook. A process that is already gone is the state cleanup wants, so ESRCH is
 * success; anything else is still reported.
 */
export function killIfAlive(pid: number): void {
    try {
        process.kill(pid, 'SIGKILL');
    } catch (error) {
        if ((error as { code?: unknown }).code !== 'ESRCH') throw error;
    }
}
