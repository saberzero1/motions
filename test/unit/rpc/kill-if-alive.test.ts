import { afterEach, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { killIfAlive } from '../../specs/rpc-process';

// The RPC specs' cleanup used to read `if (pidIsAlive(pid)) process.kill(pid,
// 'SIGKILL')`. Neovim is already shutting down by then, because the hook has
// just disabled the backend, so it can exit between the check and the kill;
// the kill then throws `kill ESRCH` and fails the hook. That is how
// rpc-editor-options failed macOS shard 21 of run 40923997811 after all three
// of its tests had passed. A process that is already gone is exactly the state
// the cleanup wants, so that one error must be treated as success.

const children: ChildProcess[] = [];

function spawnNode(script: string): ChildProcess {
    const child = spawn(process.execPath, ['-e', script], { stdio: 'ignore' });
    children.push(child);
    return child;
}

function exitOf(
    child: ChildProcess,
    timeoutMs: number,
): Promise<
    { code: number | null; signal: ChildProcess['signalCode'] } | 'running'
> {
    return new Promise((resolve) => {
        if (child.exitCode !== null || child.signalCode !== null) {
            resolve({ code: child.exitCode, signal: child.signalCode });
            return;
        }
        const timer = setTimeout(() => resolve('running'), timeoutMs);
        child.once('exit', (code, signal) => {
            clearTimeout(timer);
            resolve({ code, signal });
        });
    });
}

afterEach(() => {
    for (const child of children.splice(0)) {
        if (child.exitCode === null && child.signalCode === null) child.kill();
    }
});

describe('killIfAlive', () => {
    it('treats a process that has already exited as killed', async () => {
        const child = spawnNode('');
        // Node emits 'exit' only after reaping the child, so its pid is gone.
        expect(await exitOf(child, 2_000)).toEqual({ code: 0, signal: null });
        expect(() => killIfAlive(child.pid!)).not.toThrow();
    });

    it('kills a process that is still running', async () => {
        const child = spawnNode('setInterval(() => {}, 1000)');
        killIfAlive(child.pid!);
        // Shorter than vitest's 5 s test timeout, so a process that survives
        // fails this assertion rather than timing the test out.
        expect(await exitOf(child, 2_000)).toEqual({
            code: null,
            signal: 'SIGKILL',
        });
    });

    it('still reports a failure other than the process being gone', () => {
        expect(() => killIfAlive(Number.NaN)).toThrow(
            expect.objectContaining({ code: 'ERR_INVALID_ARG_TYPE' }),
        );
    });
});
