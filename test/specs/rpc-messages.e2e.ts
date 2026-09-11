import { browser, expect } from '@wdio/globals';
import { resolve } from 'node:path';
import {
    dismissNotices,
    getNotices,
    loadSingleFileWorkspace,
    setupEditor,
} from '../helpers';
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

interface LatencyHarness {
    arm(): void;
    snapshot(): number[];
    stop(): void;
}

type HarnessWindow = Window & { __m8LatencyHarness?: LatencyHarness };

const TEST_CONFIG_PATH = resolve('test/fixtures/nvim/init.lua');
const BASIC_FIXTURE = 'alpha beta alpha gamma';
const LARGE_FIXTURE = Array.from(
    { length: 2000 },
    (_, index) => `line ${index} alpha beta gamma`,
).join('\n');

function pidIsAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

async function pluginRequest(
    method: string,
    args: unknown[],
): Promise<unknown> {
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

async function setRpcEnabled(enabled: boolean): Promise<void> {
    await browser.executeObsidian(
        async ({ app }, next: boolean, configPath: string) => {
            const plugin = (
                app as unknown as {
                    plugins: { plugins: Record<string, RpcPlugin> };
                }
            ).plugins.plugins['vim-motions'];
            if (!plugin) throw new Error('Vim Motions is not loaded');
            plugin.settings.neovimBinaryPath = '';
            plugin.settings.neovimConfigPath = configPath;
            plugin.settings.neovimRpcEnabled = next;
            await plugin.saveSettings();
            plugin.reloadFeatures();
        },
        enabled,
        TEST_CONFIG_PATH,
    );
}

async function getRpcState(): Promise<RpcState> {
    return browser.executeObsidian(({ app }) => {
        const plugin = (
            app as unknown as {
                plugins: { plugins: Record<string, RpcPlugin> };
            }
        ).plugins.plugins['vim-motions'];
        if (!plugin) throw new Error('Vim Motions is not loaded');
        return plugin.getNeovimConnectionState();
    });
}

async function waitForConnected(): Promise<RpcState> {
    try {
        await browser.waitUntil(async () => (await getRpcState()).connected, {
            timeout: 11000,
            interval: 100,
            timeoutMsg: 'Neovim RPC did not connect',
        });
    } catch {
        throw new Error(
            `Neovim RPC did not connect: ${(await getNotices()).join(' | ')}`,
        );
    }
    return getRpcState();
}

async function dispatchKeys(keys: string): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }, sequence: string) => {
        const markdown = app.workspace.getActiveViewOfType(
            obsidian.MarkdownView,
        );
        const contentDOM = (
            markdown?.editor as unknown as { cm?: { contentDOM?: HTMLElement } }
        )?.cm?.contentDOM;
        if (!contentDOM) throw new Error('No active editor contentDOM');
        contentDOM.focus();
        for (const token of sequence) {
            const key =
                token === '\u001b'
                    ? 'Escape'
                    : token === '\r'
                      ? 'Enter'
                      : token;
            contentDOM.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key,
                    bubbles: true,
                    cancelable: true,
                }),
            );
        }
    }, keys);
    await pluginRequest('nvim_get_mode', []);
}

async function resetFixture(content = BASIC_FIXTURE): Promise<void> {
    await dispatchKeys('\u001b');
    await pluginRequest('nvim_buf_set_lines', [
        0,
        0,
        -1,
        true,
        content.split('\n'),
    ]);
    await pluginRequest('nvim_win_set_cursor', [0, [1, 0]]);
    await pluginRequest('nvim_get_mode', []);
    await browser.waitUntil(
        async () =>
            browser.executeObsidian(({ app, obsidian }, expected: string) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                return view?.editor.getValue() === expected;
            }, content),
        { timeout: 5000, interval: 50 },
    );
    await dismissNotices();
}

async function waitForNotice(text: string): Promise<void> {
    await browser.waitUntil(
        async () =>
            (await getNotices()).some((notice) => notice.includes(text)),
        {
            timeout: 2000,
            interval: 25,
            timeoutMsg: `No Notice contained ${JSON.stringify(text)}`,
        },
    );
}

function percentile95(values: number[]): number {
    const sorted = [...values].sort((left, right) => left - right);
    return sorted[Math.ceil(sorted.length * 0.95) - 1]!;
}

async function installLatencyHarness(): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }) => {
        const markdown = app.workspace.getActiveViewOfType(
            obsidian.MarkdownView,
        );
        const view = (
            markdown?.editor as unknown as {
                cm?: {
                    contentDOM: HTMLElement;
                    dispatch(spec: unknown): void;
                };
            }
        )?.cm;
        if (!view) throw new Error('No active CM6 EditorView');
        const { StateEffect } = require('@codemirror/state') as {
            StateEffect: { appendConfig: { of(value: unknown): unknown } };
        };
        const { EditorView } = require('@codemirror/view') as {
            EditorView: {
                updateListener: {
                    of(
                        listener: (update: {
                            docChanged: boolean;
                            selectionSet: boolean;
                        }) => void,
                    ): unknown;
                };
            };
        };
        let start: number | null = null;
        let active = true;
        const samples: number[] = [];
        const onKeydown = (event: KeyboardEvent): void => {
            if (
                !active ||
                start !== null ||
                !(event.target instanceof Node) ||
                !view.contentDOM.contains(event.target)
            )
                return;
            start = performance.now();
        };
        window.addEventListener('keydown', onKeydown, true);
        view.dispatch({
            effects: StateEffect.appendConfig.of(
                EditorView.updateListener.of((update) => {
                    if (
                        !active ||
                        start === null ||
                        (!update.docChanged && !update.selectionSet)
                    )
                        return;
                    const started = start;
                    start = null;
                    requestAnimationFrame(() =>
                        samples.push(performance.now() - started),
                    );
                }),
            ),
        });
        (window as HarnessWindow).__m8LatencyHarness = {
            arm() {
                if (start !== null) throw new Error('Latency sample overlap');
            },
            snapshot: () => [...samples],
            stop() {
                active = false;
                window.removeEventListener('keydown', onKeydown, true);
                delete (window as HarnessWindow).__m8LatencyHarness;
            },
        };
    });
}

async function runLatencyCondition(condition: string): Promise<number> {
    await resetFixture(LARGE_FIXTURE);
    await dispatchKeys('i');
    await installLatencyHarness();
    try {
        for (let index = 0; index < 200; index += 1) {
            await browser.execute(() => {
                const harness = (window as HarnessWindow).__m8LatencyHarness;
                if (!harness) throw new Error('Latency harness is absent');
                harness.arm();
            });
            await dispatchKeys('x');
            await browser.waitUntil(
                async () =>
                    browser.execute(
                        (expected: number) =>
                            ((
                                window as HarnessWindow
                            ).__m8LatencyHarness?.snapshot().length ?? 0) >=
                            expected,
                        index + 1,
                    ),
                { timeout: 5000, interval: 5 },
            );
        }
        const samples = await browser.execute(() => {
            const harness = (window as HarnessWindow).__m8LatencyHarness;
            if (!harness) throw new Error('Latency harness is absent');
            return harness.snapshot();
        });
        const p95 = percentile95(samples);
        console.log(
            `RPC_LATENCY_CONDITION ${JSON.stringify({ condition, samples: samples.length, p95 })}`,
        );
        return p95;
    } finally {
        await dispatchKeys('\u001b');
        await browser.execute(() =>
            (window as HarnessWindow).__m8LatencyHarness?.stop(),
        );
    }
}

async function removeRedrawListener(): Promise<void> {
    await browser.executeObsidian(({ app }) => {
        const plugin = (
            app as unknown as {
                plugins: {
                    plugins: Record<
                        string,
                        {
                            neovimConnection?: {
                                redrawDispatcher?: { dispose(): void };
                            };
                        }
                    >;
                };
            }
        ).plugins.plugins['vim-motions'];
        const dispatcher = plugin?.neovimConnection?.redrawDispatcher;
        if (!dispatcher) throw new Error('Redraw dispatcher is unavailable');
        dispatcher.dispose();
    });
}

describe('Neovim RPC messages', function () {
    this.timeout(120000);
    let spawnedPid: number | null = null;

    before(async function () {
        requireRpcPrerequisites(this);
        await loadSingleFileWorkspace();
        await setupEditor(BASIC_FIXTURE, { line: 0, ch: 0 });
        await setRpcEnabled(true);
        const state = await waitForConnected();
        spawnedPid = state.pid;
    });

    beforeEach(async () => resetFixture());

    afterEach(async () => {
        if ((await getRpcState()).connected) await dispatchKeys('\u001b');
    });

    after(async () => {
        await setRpcEnabled(false);
        if (spawnedPid !== null) {
            await browser.waitUntil(async () => !pidIsAlive(spawnedPid!), {
                timeout: 5000,
                interval: 100,
                timeoutMsg: `Neovim PID ${spawnedPid} survived teardown`,
            });
        }
    });

    it('shows informational vim.notify output in an Obsidian Notice', async () => {
        await pluginRequest('nvim_exec_lua', [
            'vim.notify("hello", vim.log.levels.INFO)',
            [],
        ]);
        await waitForNotice('hello');
        await expect(await getNotices()).toContain('hello');
    });

    it('styles errors and retains them in Neovim message history', async () => {
        await pluginRequest('nvim_exec_lua', [
            'vim.notify("bad", vim.log.levels.ERROR)',
            [],
        ]);
        await waitForNotice('bad');
        const state = await browser.executeObsidian(() => ({
            errorNotices: document.querySelectorAll(
                '.vim-motions-rpc-notice-error',
            ).length,
            errorBorder: (() => {
                const el = document.querySelector(
                    '.vim-motions-rpc-notice-error',
                );
                return el
                    ? getComputedStyle(el).borderLeftWidth
                    : 'no-error-notice';
            })(),
        }));
        const history = await pluginRequest('nvim_exec_lua', [
            'return vim.fn.execute("messages")',
            [],
        ]);
        await expect(state.errorNotices).toBeGreaterThan(0);
        await expect(state.errorBorder).toBe('4px');
        await expect(history).toContain('bad');
    });

    it('shows Lua errors entered through real editor keys', async () => {
        await dispatchKeys(':lua error("m8-error")\r');
        await waitForNotice('m8-error');
        const notices = await getNotices();
        await expect(
            notices.some((notice) => notice.includes('m8-error')),
        ).toBe(true);
        await expect(notices.join('\n')).not.toContain('[object Object]');
        await expect(notices).not.toContain('nil');
    });

    it('ignores undo messages while applying the undo in CM6', async () => {
        await dispatchKeys('iX\u001b');
        await dismissNotices();
        await dispatchKeys('u');
        const editorValue = async () =>
            browser.executeObsidian(({ app, obsidian }) =>
                app.workspace
                    .getActiveViewOfType(obsidian.MarkdownView)
                    ?.editor.getValue(),
            );
        await browser.waitUntil(
            async () => (await editorValue()) === BASIC_FIXTURE,
            {
                timeout: 5000,
                interval: 50,
                timeoutMsg: 'the undo never reached CM6',
            },
        );
        await expect(await editorValue()).toBe(BASIC_FIXTURE);
        await expect(await getNotices()).toEqual([]);
    });

    it('ignores search counts while moving to the next match', async () => {
        await dispatchKeys('/alpha\r');
        const cursorPos = async () =>
            browser.executeObsidian(({ app, obsidian }) =>
                app.workspace
                    .getActiveViewOfType(obsidian.MarkdownView)
                    ?.editor.getCursor(),
            );
        await browser.waitUntil(
            async () => {
                const at = await cursorPos();
                return at?.line === 0 && at?.ch === 11;
            },
            {
                timeout: 5000,
                interval: 50,
                timeoutMsg: 'the search never moved the cursor to 0:11',
            },
        );
        await expect(await cursorPos()).toEqual({ line: 0, ch: 11 });
        await expect(await getNotices()).toEqual([]);
    });

    it('shows one Notice for one echoed message', async () => {
        await dispatchKeys(':echo "x"\r');
        await waitForNotice('x');
        await expect(
            (await getNotices()).filter((notice) => notice === 'x'),
        ).toHaveLength(1);
    });

    it('rate-limits rapidly repeated identical messages', async () => {
        await pluginRequest('nvim_exec_lua', [
            'for _ = 1, 20 do vim.notify("m8-repeat") end',
            [],
        ]);
        await waitForNotice('m8-repeat');
        await browser.pause(100);
        await expect(
            (await getNotices()).filter((notice) => notice === 'm8-repeat'),
        ).toHaveLength(1);
    });

    it('keeps 200-key p95 within budget while cheaply ignoring grid events', async () => {
        const attachedP95 = await runLatencyCondition('redraw-listener');
        await removeRedrawListener();
        const detachedP95 = await runLatencyCondition('listener-removed');
        await expect(attachedP95).toBeLessThanOrEqual(61.2);
        await expect(attachedP95 - detachedP95).toBeLessThanOrEqual(5);
    });
});
