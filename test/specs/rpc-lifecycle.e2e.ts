import { browser, expect } from '@wdio/globals';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
    dismissNotices,
    getNotices,
    getVimMode,
    loadSingleFileWorkspace,
    setupEditor,
} from '../helpers';

interface RpcState {
    connected: boolean;
    pid: number | null;
    apiLevel: number | null;
    binaryPath: string | null;
}

const spawnedPids = new Set<number>();
const TEST_CONFIG_PATH = resolve('test/fixtures/nvim/init.lua');

async function getRpcState(): Promise<RpcState> {
    return (await browser.executeObsidian(({ app }) => {
        const plugin = (
            app as unknown as {
                plugins: {
                    plugins: Record<
                        string,
                        { getNeovimConnectionState(): RpcState }
                    >;
                };
            }
        ).plugins.plugins['vim-motions'];
        if (!plugin) throw new Error('Vim Motions is not loaded');
        return plugin.getNeovimConnectionState();
    })) as RpcState;
}

async function setRpcSettings(
    enabled: boolean,
    binaryPath = '',
): Promise<void> {
    await browser.executeObsidian(
        async (
            { app },
            nextEnabled: boolean,
            nextPath: string,
            nextConfigPath: string,
        ) => {
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<
                            string,
                            {
                                settings: {
                                    neovimRpcEnabled: boolean;
                                    neovimBinaryPath: string;
                                    neovimConfigPath: string;
                                };
                                saveSettings(): Promise<void>;
                                reloadFeatures(): void;
                            }
                        >;
                    };
                }
            ).plugins.plugins['vim-motions'];
            if (!plugin) throw new Error('Vim Motions is not loaded');
            plugin.settings.neovimBinaryPath = nextPath;
            plugin.settings.neovimConfigPath = nextConfigPath;
            plugin.settings.neovimRpcEnabled = nextEnabled;
            await plugin.saveSettings();
            plugin.reloadFeatures();
        },
        enabled,
        binaryPath,
        TEST_CONFIG_PATH,
    );
}

async function waitForConnected(): Promise<RpcState> {
    await browser.waitUntil(async () => (await getRpcState()).connected, {
        timeout: 10000,
        interval: 100,
        timeoutMsg: 'Neovim RPC did not connect',
    });
    const state = await getRpcState();
    if (state.pid !== null) spawnedPids.add(state.pid);
    return state;
}

function pidIsAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

async function waitForPidExit(pid: number): Promise<void> {
    await browser.waitUntil(async () => !pidIsAlive(pid), {
        timeout: 5000,
        interval: 100,
        timeoutMsg: `Neovim PID ${pid} survived teardown`,
    });
}

async function executeVimCommand(command: string): Promise<void> {
    await browser.executeObsidian(({ app }, id: string) => {
        const commands = app as unknown as {
            commands: { executeCommandById(commandId: string): boolean };
        };
        if (!commands.commands.executeCommandById(`vim-motions:${id}`))
            throw new Error(`Command not found: ${id}`);
    }, command);
}

describe('Neovim RPC connection lifecycle', function () {
    this.timeout(20000);

    beforeEach(async () => {
        const loaded = await browser.executeObsidian(({ app }) =>
            Boolean(
                (
                    app as unknown as {
                        plugins: { plugins: Record<string, unknown> };
                    }
                ).plugins.plugins['vim-motions'],
            ),
        );
        if (!loaded) {
            await browser.executeObsidian(async ({ app }) => {
                await (
                    app as unknown as {
                        plugins: { loadPlugin(id: string): Promise<void> };
                    }
                ).plugins.loadPlugin('vim-motions');
            });
        }
        const vimEnabled = await browser.executeObsidian(({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<
                            string,
                            { settings: { vimEnabled: boolean } }
                        >;
                    };
                }
            ).plugins.plugins['vim-motions'];
            return plugin?.settings.vimEnabled ?? false;
        });
        if (!vimEnabled) {
            await browser.pause(600);
            await executeVimCommand('enable-vim-mode');
            await browser.waitUntil(
                async () =>
                    browser.executeObsidian(({ app }) => {
                        const plugin = (
                            app as unknown as {
                                plugins: {
                                    plugins: Record<
                                        string,
                                        { settings: { vimEnabled: boolean } }
                                    >;
                                };
                            }
                        ).plugins.plugins['vim-motions'];
                        return plugin?.settings.vimEnabled ?? false;
                    }),
                { timeout: 5000, interval: 100 },
            );
        }
        await loadSingleFileWorkspace();
        await setupEditor('rpc lifecycle', { line: 0, ch: 0 });
        await browser.executeObsidian(({ app }) => {
            (
                app.vault as unknown as {
                    setConfig(key: string, value: unknown): void;
                }
            ).setConfig('propertiesInDocument', 'source');
        });
        await setRpcSettings(false);
        await dismissNotices();
    });

    afterEach(async () => {
        const loaded = await browser.executeObsidian(({ app }) =>
            Boolean(
                (
                    app as unknown as {
                        plugins: { plugins: Record<string, unknown> };
                    }
                ).plugins.plugins['vim-motions'],
            ),
        );
        if (loaded) await setRpcSettings(false);
        for (const pid of spawnedPids) {
            if (pidIsAlive(pid)) process.kill(pid, 'SIGKILL');
            spawnedPids.delete(pid);
        }
    });

    it('connects to the configured Neovim and reports its API level', async () => {
        await setRpcSettings(true);
        const state = await waitForConnected();
        expect(state.pid).not.toBeNull();
        expect(pidIsAlive(state.pid as number)).toBe(true);
        expect(state.apiLevel).toBeGreaterThanOrEqual(12);
    });

    it('disconnects when the RPC setting is disabled while fork Vim remains active', async () => {
        await setRpcSettings(true);
        const state = await waitForConnected();
        const pid = state.pid as number;
        await setRpcSettings(false);
        await waitForPidExit(pid);
        expect(pidIsAlive(pid)).toBe(false);
        expect(await getVimMode()).toBe('normal');
    });

    it('disconnects and removes the Vim bridge when Vim mode is disabled', async () => {
        await setRpcSettings(true);
        const state = await waitForConnected();
        const pid = state.pid as number;
        await executeVimCommand('disable-vim-mode');
        await waitForPidExit(pid);
        const bridgeInstalled = await browser.executeObsidian(() =>
            Boolean(
                (
                    window as unknown as {
                        CodeMirrorAdapter?: { Vim?: unknown };
                    }
                ).CodeMirrorAdapter?.Vim,
            ),
        );
        expect(pidIsAlive(pid)).toBe(false);
        expect(bridgeInstalled).toBe(false);
    });

    it('recovers after the Neovim child exits unexpectedly', async () => {
        await setRpcSettings(true);
        const first = await waitForConnected();
        const firstPid = first.pid as number;
        await dismissNotices();
        await browser.executeObsidian(() => {
            const target = window as unknown as {
                rpcUnhandledRejections?: string[];
                rpcUnhandledHandler?: (event: PromiseRejectionEvent) => void;
            };
            target.rpcUnhandledRejections = [];
            target.rpcUnhandledHandler = (event) => {
                target.rpcUnhandledRejections?.push(String(event.reason));
            };
            window.addEventListener(
                'unhandledrejection',
                target.rpcUnhandledHandler,
            );
        });
        process.kill(firstPid, 'SIGKILL');
        await waitForPidExit(firstPid);
        await browser.waitUntil(
            async () => (await getRpcState()).connected === false,
            { timeout: 5000, interval: 100 },
        );
        const notices = await getNotices();
        const unhandled = (await browser.executeObsidian(() => {
            const target = window as unknown as {
                rpcUnhandledRejections?: string[];
                rpcUnhandledHandler?: (event: PromiseRejectionEvent) => void;
            };
            if (target.rpcUnhandledHandler)
                window.removeEventListener(
                    'unhandledrejection',
                    target.rpcUnhandledHandler,
                );
            const result = target.rpcUnhandledRejections ?? [];
            delete target.rpcUnhandledHandler;
            delete target.rpcUnhandledRejections;
            return result;
        })) as string[];
        expect(
            notices.some((notice) => notice.includes('exited unexpectedly')),
        ).toBe(true);
        expect(unhandled).toEqual([]);

        await setRpcSettings(false);
        await setRpcSettings(true);
        const second = await waitForConnected();
        expect(second.pid).not.toBe(firstPid);
        expect(pidIsAlive(second.pid as number)).toBe(true);
    });

    it('disconnects when Obsidian unloads the plugin', async () => {
        await setRpcSettings(true);
        const state = await waitForConnected();
        const pid = state.pid as number;
        await browser.executeObsidian(async ({ app }) => {
            await (
                app as unknown as {
                    plugins: { unloadPlugin(id: string): Promise<void> };
                }
            ).plugins.unloadPlugin('vim-motions');
        });
        await waitForPidExit(pid);
        expect(pidIsAlive(pid)).toBe(false);
    });

    it('reports a configured binary that does not exist without leaving a child', async () => {
        const missingPath = join(
            tmpdir(),
            `vim-motions-missing-nvim-${process.pid}`,
        );
        await setRpcSettings(true, missingPath);
        await browser.waitUntil(
            async () =>
                (await getNotices()).some((notice) =>
                    notice.includes(missingPath),
                ),
            { timeout: 5000, interval: 100 },
        );
        const state = await getRpcState();
        expect(
            (await getNotices()).some((notice) => notice.includes(missingPath)),
        ).toBe(true);
        expect(state.connected).toBe(false);
        expect(state.pid).toBeNull();
    });

    it('refuses a Neovim API level below 12', async () => {
        const directory = mkdtempSync(join(tmpdir(), 'vim-motions-old-nvim-'));
        const stubPath = join(directory, 'nvim-old');
        const response = [
            0x94, 0x01, 0x01, 0xc0, 0x92, 0x01, 0x81, 0xa7, 0x76, 0x65, 0x72,
            0x73, 0x69, 0x6f, 0x6e, 0x81, 0xa9, 0x61, 0x70, 0x69, 0x5f, 0x6c,
            0x65, 0x76, 0x65, 0x6c, 0x0b,
        ];
        writeFileSync(
            stubPath,
            `#!/usr/bin/env node\nconst response = Buffer.from(${JSON.stringify(response)});\nlet sent = false;\nprocess.stdin.on('data', () => { if (!sent) { sent = true; process.stdout.write(response); } });\nsetInterval(() => {}, 1000);\n`,
        );
        chmodSync(stubPath, 0o755);
        try {
            await setRpcSettings(true, stubPath);
            await browser.waitUntil(
                async () => {
                    const state = await getRpcState();
                    return (
                        state.connected ||
                        (await getNotices()).some(
                            (notice) =>
                                notice.includes('0.12') &&
                                notice.includes(stubPath),
                        )
                    );
                },
                { timeout: 5000, interval: 100 },
            );
            if (!(await getRpcState()).connected) {
                await browser.waitUntil(
                    async () => (await getRpcState()).pid === null,
                    { timeout: 5000, interval: 100 },
                );
            }
            const state = await getRpcState();
            const notices = await getNotices();
            expect(state.connected).toBe(false);
            expect(
                notices.some(
                    (notice) =>
                        notice.includes('0.12') && notice.includes(stubPath),
                ),
            ).toBe(true);
            expect(state.pid).toBeNull();
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    });
});
