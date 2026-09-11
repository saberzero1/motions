import { browser, expect } from '@wdio/globals';
import { resolve } from 'node:path';
import { getNotices, loadSingleFileWorkspace, setupEditor } from '../helpers';
import { requireRpcPrerequisites } from './rpc-prerequisites';

interface RpcState {
    connected: boolean;
    pid: number | null;
}

interface RpcPlugin {
    settings: {
        neovimRpcEnabled: boolean;
        neovimBinaryPath: string;
        neovimConfigPath: string;
    };
    saveSettings(): Promise<void>;
    reloadFeatures(): void;
    getNeovimConnectionState(): RpcState;
    requestNeovim(method: string, args: unknown[]): Promise<unknown>;
}

interface WriteSnapshot {
    buffer: string;
    buftype: string;
    cm: string | null;
    disk: string;
    modified: boolean;
    saveCommandCount: number;
}

const TEST_CONFIG_PATH = resolve('test/fixtures/nvim/init.lua');
const TEST_FILE = 'Welcome.md';
const spawnedPids = new Set<number>();

function pidIsAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

async function setRpcEnabled(enabled: boolean): Promise<void> {
    await browser.executeObsidian(
        async ({ app }, nextEnabled: boolean, configPath: string) => {
            const plugin = (
                app as unknown as {
                    plugins: { plugins: Record<string, RpcPlugin> };
                }
            ).plugins.plugins['vim-motions'];
            if (!plugin) throw new Error('Vim Motions is not loaded');
            plugin.settings.neovimBinaryPath = '';
            plugin.settings.neovimConfigPath = configPath;
            plugin.settings.neovimRpcEnabled = nextEnabled;
            await plugin.saveSettings();
            plugin.reloadFeatures();
        },
        enabled,
        TEST_CONFIG_PATH,
    );
}

async function getRpcState(): Promise<RpcState> {
    return (await browser.executeObsidian(({ app }) => {
        const plugin = (
            app as unknown as {
                plugins: { plugins: Record<string, RpcPlugin> };
            }
        ).plugins.plugins['vim-motions'];
        if (!plugin) throw new Error('Vim Motions is not loaded');
        return plugin.getNeovimConnectionState();
    })) as RpcState;
}

async function waitForConnected(): Promise<void> {
    try {
        await browser.waitUntil(async () => (await getRpcState()).connected, {
            timeout: 10000,
            interval: 100,
            timeoutMsg: 'Neovim RPC did not connect',
        });
    } catch {
        throw new Error(
            `Neovim RPC did not connect: ${(await getNotices()).join(' | ')}`,
        );
    }
    const pid = (await getRpcState()).pid;
    if (pid !== null) spawnedPids.add(pid);
}

async function request(method: string, args: unknown[]): Promise<unknown> {
    return browser.executeObsidian(
        async ({ app }, rpcMethod: string, rpcArgs: unknown[]) => {
            const plugin = (
                app as unknown as {
                    plugins: { plugins: Record<string, RpcPlugin> };
                }
            ).plugins.plugins['vim-motions'];
            if (!plugin) throw new Error('Vim Motions is not loaded');
            return plugin.requestNeovim(rpcMethod, rpcArgs);
        },
        method,
        args,
    );
}

async function installSaveCommandSpy(): Promise<void> {
    await browser.executeObsidian(({ app }) => {
        const commands = app.commands as typeof app.commands & {
            vimMotionsOriginalExecute?: typeof app.commands.executeCommandById;
            vimMotionsSaveCommandCount?: number;
        };
        if (!commands.vimMotionsOriginalExecute) {
            commands.vimMotionsOriginalExecute = commands.executeCommandById;
            commands.executeCommandById = function (
                commandId: string,
            ): boolean {
                if (commandId === 'editor:save-file')
                    commands.vimMotionsSaveCommandCount =
                        (commands.vimMotionsSaveCommandCount ?? 0) + 1;
                return commands.vimMotionsOriginalExecute!.call(
                    this,
                    commandId,
                );
            };
        }
        commands.vimMotionsSaveCommandCount = 0;
    });
}

async function removeSaveCommandSpy(): Promise<void> {
    await browser.executeObsidian(({ app }) => {
        const commands = app.commands as typeof app.commands & {
            vimMotionsOriginalExecute?: typeof app.commands.executeCommandById;
            vimMotionsSaveCommandCount?: number;
        };
        if (commands.vimMotionsOriginalExecute)
            commands.executeCommandById = commands.vimMotionsOriginalExecute;
        delete commands.vimMotionsOriginalExecute;
        delete commands.vimMotionsSaveCommandCount;
    });
}

async function replaceLineThroughNeovim(text: string): Promise<void> {
    await browser.keys(['c']);
    await browser.keys(['c']);
    for (const character of text) await browser.keys([character]);
    await browser.keys(['Escape']);
    await request('nvim_get_mode', []);
}

async function getWriteSnapshot(): Promise<WriteSnapshot> {
    return (await browser.executeObsidian(async ({ app }, filePath: string) => {
        const plugin = (
            app as unknown as {
                plugins: { plugins: Record<string, RpcPlugin> };
            }
        ).plugins.plugins['vim-motions'];
        if (!plugin) throw new Error('Vim Motions is not loaded');
        const lines = (await plugin.requestNeovim('nvim_buf_get_lines', [
            0,
            0,
            -1,
            true,
        ])) as string[];
        const modified = await plugin.requestNeovim('nvim_get_option_value', [
            'modified',
            { buf: 0 },
        ]);
        const buftype = await plugin.requestNeovim('nvim_get_option_value', [
            'buftype',
            { buf: 0 },
        ]);
        const commands = app.commands as typeof app.commands & {
            vimMotionsSaveCommandCount?: number;
        };
        return {
            buffer: lines.join('\n'),
            buftype: String(buftype),
            cm: app.workspace.activeEditor?.editor?.getValue() ?? null,
            disk: await app.vault.adapter.read(filePath),
            modified: modified === true,
            saveCommandCount: commands.vimMotionsSaveCommandCount ?? 0,
        };
    }, TEST_FILE)) as WriteSnapshot;
}

describe('Neovim RPC write and read routing', function () {
    before(function () {
        requireRpcPrerequisites(this);
    });

    this.timeout(180000);

    beforeEach(async () => {
        await loadSingleFileWorkspace();
        await setupEditor('original on disk', { line: 0, ch: 0 });
        await browser.executeObsidian(async ({ app }, filePath: string) => {
            await app.vault.adapter.write(filePath, 'original on disk');
            (
                app.vault as unknown as {
                    setConfig(key: string, value: unknown): void;
                }
            ).setConfig('propertiesInDocument', 'source');
        }, TEST_FILE);
        await installSaveCommandSpy();
        await setRpcEnabled(false);
        await setRpcEnabled(true);
        await waitForConnected();
    });

    afterEach(async () => {
        await setRpcEnabled(false);
        await removeSaveCommandSpy();
        for (const pid of spawnedPids) {
            if (pidIsAlive(pid)) process.kill(pid, 'SIGKILL');
            spawnedPids.delete(pid);
        }
    });

    it('routes :w through Obsidian and persists the Neovim edit', async () => {
        await replaceLineThroughNeovim('edited in neovim');
        await request('nvim_command', ['write']);
        await browser.waitUntil(
            async () => {
                const snapshot = await getWriteSnapshot();
                return (
                    snapshot.disk === 'edited in neovim' &&
                    snapshot.saveCommandCount === 1
                );
            },
            { timeout: 5000, interval: 50 },
        );
        expect(await getWriteSnapshot()).toEqual({
            buffer: 'edited in neovim',
            buftype: 'acwrite',
            cm: 'edited in neovim',
            disk: 'edited in neovim',
            modified: false,
            saveCommandCount: 1,
        });
    });

    it('routes a forced write through the host instead of Neovim', async () => {
        await replaceLineThroughNeovim('host-routed edit');
        await request('nvim_command', ['write!']);
        await browser.pause(250);
        const snapshot = await getWriteSnapshot();
        expect({
            buftype: snapshot.buftype,
            disk: snapshot.disk,
            saveCommandCount: snapshot.saveCommandCount,
        }).toEqual({
            buftype: 'acwrite',
            disk: 'host-routed edit',
            saveCommandCount: 1,
        });
    });

    it('routes :e! back to the unsaved Obsidian document', async () => {
        await replaceLineThroughNeovim('unsaved in obsidian');
        await browser.executeObsidian(async ({ app }, filePath: string) => {
            await app.vault.adapter.write(filePath, 'stale on disk');
        }, TEST_FILE);
        await request('nvim_command', ['edit!']);
        await browser.pause(250);
        expect(await getWriteSnapshot()).toEqual({
            buffer: 'unsaved in obsidian',
            buftype: 'acwrite',
            cm: 'unsaved in obsidian',
            disk: 'stale on disk',
            modified: false,
            saveCommandCount: 0,
        });
    });

    it('allows :q after :w without a stale modified flag', async () => {
        await request('nvim_command', ['new']);
        await request('nvim_command', ['wincmd p']);
        await replaceLineThroughNeovim('saved before quit');
        await request('nvim_command', ['write']);
        const modified = await request('nvim_get_option_value', [
            'modified',
            { buf: 0 },
        ]);
        expect(modified).toBe(false);
        await request('nvim_command', ['quit']);
        const windows = await request('nvim_list_wins', []);
        expect(Array.isArray(windows) ? windows.length : -1).toBe(1);
    });
});
