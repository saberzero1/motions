import { afterEach, expect, it, vi } from 'vitest';
import { ChildProcess, spawn } from 'child_process';
import { PassThrough } from 'stream';
import { attach } from 'neovim';
import { NeovimClient } from '../../neovim/client';

vi.mock('child_process', async (importOriginal) => ({
    ...(await importOriginal<typeof import('child_process')>()),
    spawn: vi.fn(),
}));
vi.mock('neovim', () => ({ attach: vi.fn() }));
afterEach(() => vi.restoreAllMocks());

it('coordinate oracle shutdown notifies quit and awaits process close, not an RPC reply', async () => {
    const child = new ChildProcess();
    Object.assign(child, {
        stdout: new PassThrough(),
        stdin: new PassThrough(),
    });
    const kill = vi.spyOn(child, 'kill').mockReturnValue(true);
    const notify = vi.fn();
    const command = vi.fn().mockResolvedValue(undefined);
    vi.mocked(spawn).mockReturnValue(child);
    vi.mocked(attach).mockReturnValue({
        command,
        notify,
    } as unknown as ReturnType<typeof attach>);
    const client = new NeovimClient();
    await client.start();
    let settled = false;
    const stopping = client.stop().then(() => {
        settled = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    const beforeClose = settled;
    child.emit('close', 0, null);
    await stopping;
    expect({
        notifications: notify.mock.calls,
        kills: kill.mock.calls.length,
        beforeClose,
        settled,
    }).toEqual({
        notifications: [['nvim_command', ['qa!']]],
        kills: 0,
        beforeClose: false,
        settled: true,
    });
});
