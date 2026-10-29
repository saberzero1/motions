import { readFileSync, statSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { browser, expect } from '@wdio/globals';
import { resolve } from 'node:path';
import {
    getCursorPos,
    getEditorValue,
    getNotices,
    getRegisterContent,
    loadSingleFileWorkspace,
    setupEditor,
    vimHandleKeysSync,
} from '../helpers';
import { requireRpcPrerequisites } from './rpc-prerequisites';
import { killIfAlive } from './rpc-process';

interface RpcState {
    connected: boolean;
    pid: number | null;
}

interface RpcPlugin {
    settings: Record<string, unknown>;
    saveSettings(): Promise<void>;
    reloadFeatures(): void;
    getNeovimConnectionState(): RpcState;
    requestNeovim(method: string, args: unknown[]): Promise<unknown>;
}

interface ParitySnapshot {
    content: string;
    cursor: { line: number; ch: number };
    register?: string | null;
}

interface ParityCase {
    content: string;
    cursor: { line: number; ch: number };
    steps: string[];
    compareRegister?: boolean;
    textwidth?: number;
}

const TEST_CONFIG_PATH = resolve('test/fixtures/nvim/init.lua');
const spawnedPids = new Set<number>();

function nvimExitLogSize(): number {
    try {
        return statSync(NVIM_EXIT_LOG).size;
    } catch {
        return 0;
    }
}

let nvimExitOffset = 0;

function nvimLogPath(): string | undefined {
    for (const candidate of [
        process.env.NVIM_LOG_FILE,
        `${process.env.HOME ?? ''}/.local/state/nvim/log`,
        `${process.env.HOME ?? ''}/.cache/nvim/log`,
    ]) {
        if (!candidate) continue;
        try {
            statSync(candidate);
            return candidate;
        } catch {
            /* try the next location */
        }
    }
    return undefined;
}

function nvimLogSize(): number {
    const path = nvimLogPath();
    if (!path) return 0;
    try {
        return statSync(path).size;
    } catch {
        return 0;
    }
}

let nvimLogOffset = 0;

function pidIsAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
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

// Resolved in Node: the callback below runs in the browser, where node:path
// does not exist. Wiring this inline produced "resolvePath is not defined".
// The wrapper records how Neovim exited, which no channel inside the session
// survives to report.
const NVIM_EXIT_LOG = '/tmp/nvim-exit.log';
const NVIM_WRAPPER =
    process.platform === 'win32'
        ? ''
        : resolvePath('test/fixtures/nvim-exit-wrapper.sh');

async function setRpcEnabled(enabled: boolean, textwidth = 80): Promise<void> {
    await browser.executeObsidian(
        async (
            { app },
            next: boolean,
            configPath: string,
            width: number,
            binaryPath: string,
        ) => {
            const plugin = (
                app as unknown as {
                    plugins: { plugins: Record<string, RpcPlugin> };
                }
            ).plugins.plugins['vim-motions'];
            if (!plugin) throw new Error('Vim Motions is not loaded');
            Object.assign(plugin.settings, {
                enableHardWrap: true,
                enableNavigation: true,
                neovimBinaryPath: binaryPath,
                neovimConfigPath: configPath,
                neovimRpcEnabled: next,
                textwidth: width,
            });
            await plugin.saveSettings();
            plugin.reloadFeatures();
            if (!next) {
                const vim = (
                    window as unknown as {
                        CodeMirrorAdapter?: {
                            Vim?: {
                                setOption(name: string, value: unknown): void;
                            };
                        };
                    }
                ).CodeMirrorAdapter?.Vim;
                vim?.setOption('textwidth', width);
            }
        },
        enabled,
        TEST_CONFIG_PATH,
        textwidth,
        NVIM_WRAPPER,
    );
}

async function waitForRpc(connected: boolean): Promise<void> {
    try {
        await browser.waitUntil(
            async () => (await getRpcState()).connected === connected,
            {
                timeout: 10000,
                interval: 100,
                timeoutMsg: `Neovim RPC did not become ${connected ? 'connected' : 'disconnected'}`,
            },
        );
    } catch {
        throw new Error(
            `Neovim RPC did not become ${connected ? 'connected' : 'disconnected'}: ${(await getNotices()).join(' | ')}`,
        );
    }
    const pid = (await getRpcState()).pid;
    if (connected && pid !== null) spawnedPids.add(pid);
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

async function useSourceProperties(): Promise<void> {
    await browser.executeObsidian(({ app }) => {
        (
            app.vault as unknown as {
                setConfig(key: string, value: unknown): void;
            }
        ).setConfig('propertiesInDocument', 'source');
    });
}

async function forkSnapshots(testCase: ParityCase): Promise<ParitySnapshot[]> {
    await setRpcEnabled(false, testCase.textwidth);
    await waitForRpc(false);
    await setupEditor(testCase.content, testCase.cursor);
    const snapshots: ParitySnapshot[] = [
        {
            content: await getEditorValue(),
            cursor: await getCursorPos(),
        },
    ];
    for (const step of testCase.steps) {
        await vimHandleKeysSync(step, step.includes('h'));
        snapshots.push({
            content: await getEditorValue(),
            cursor: await getCursorPos(),
            register: testCase.compareRegister
                ? ((await getRegisterContent('"'))?.text ?? null)
                : undefined,
        });
    }
    return snapshots;
}

async function rpcSnapshots(testCase: ParityCase): Promise<ParitySnapshot[]> {
    await setupEditor(testCase.content, testCase.cursor);
    await setRpcEnabled(true, testCase.textwidth);
    await waitForRpc(true);
    await request('nvim_input', ['<Esc>']);
    await request('nvim_win_set_cursor', [
        0,
        [testCase.cursor.line + 1, testCase.cursor.ch],
    ]);
    const initialLines = (await request('nvim_buf_get_lines', [
        0,
        0,
        -1,
        false,
    ])) as string[];
    const initialCursor = (await request('nvim_win_get_cursor', [0])) as [
        number,
        number,
    ];
    const snapshots: ParitySnapshot[] = [
        {
            content: initialLines.join('\n'),
            cursor: { line: initialCursor[0] - 1, ch: initialCursor[1] },
        },
    ];
    for (const step of testCase.steps) {
        await request('nvim_input', [step]);
        await request('nvim_get_mode', []);
        const lines = (await request('nvim_buf_get_lines', [
            0,
            0,
            -1,
            false,
        ])) as string[];
        const cursor = (await request('nvim_win_get_cursor', [0])) as [
            number,
            number,
        ];
        const register = testCase.compareRegister
            ? ((await request('nvim_exec_lua', [
                  `return vim.fn.getreg('"')`,
                  [],
              ])) as string)
            : undefined;
        snapshots.push({
            content: lines.join('\n'),
            cursor: { line: cursor[0] - 1, ch: cursor[1] },
            register,
        });
    }
    return snapshots;
}

async function expectParity(testCase: ParityCase): Promise<void> {
    const fork = await forkSnapshots(testCase);
    const rpc = await rpcSnapshots(testCase);
    expect(rpc).toEqual(fork);
}

async function expectOperatorParity(
    testCase: ParityCase,
): Promise<ParitySnapshot> {
    const fork = await forkSnapshots(testCase);
    const rpc = await rpcSnapshots(testCase);
    expect(rpc).toEqual(fork);
    expect({
        forkEmpty: fork.at(-1)?.content === '',
        rpcEmpty: rpc.at(-1)?.content === '',
    }).toEqual({ forkEmpty: false, rpcEmpty: false });
    return rpc.at(-1)!;
}

async function readActiveFile(): Promise<string> {
    return browser.executeObsidian(async ({ app }) => {
        const file = app.workspace.getActiveFile();
        if (!file) throw new Error('No active file');
        app.commands.executeCommandById('editor:save-file');
        return app.vault.adapter.read(file.path);
    });
}

describe('Neovim RPC structural navigation and hard-wrap', function () {
    before(function () {
        requireRpcPrerequisites(this);
    });

    this.timeout(900000);

    beforeEach(async () => {
        await loadSingleFileWorkspace();
        await useSourceProperties();
        await setRpcEnabled(false);
        await waitForRpc(false);
        // NVIM_LOG_FILE is one path per runner, and this spec starts a fresh
        // Neovim for every test, so the file accumulates all of them. Record
        // where this test starts so afterEach reads only its own bytes rather
        // than whatever an earlier test happened to write last.
        nvimLogOffset = nvimLogSize();
        nvimExitOffset = nvimExitLogSize();
        // ChromeDriver reports "Timed out receiving message from renderer:
        // 30.000" and the session dies before any test can report, so the
        // failing test name is never recorded. A thirty-second silence is a
        // blocked main thread; this records what ran long enough to cause it.
        await browser
            .execute(() => {
                const w = window as unknown as {
                    __longTasks?: Array<{ n: string; d: number; t: number }>;
                    __longTaskObserver?: PerformanceObserver;
                };
                w.__longTasks = [];
                w.__longTaskObserver?.disconnect();
                const obs = new PerformanceObserver((list) => {
                    for (const e of list.getEntries()) {
                        w.__longTasks?.push({
                            n: e.name,
                            d: Math.round(e.duration),
                            t: Math.round(e.startTime),
                        });
                    }
                });
                obs.observe({ entryTypes: ['longtask'] });
                w.__longTaskObserver = obs;
            })
            .catch(() => {});
    });

    afterEach(async function () {
        const tasks = await browser
            .execute(() => {
                const w = window as unknown as {
                    __longTasks?: Array<{ n: string; d: number; t: number }>;
                };
                const all = w.__longTasks ?? [];
                // getEditorValue is where the renderer stops answering, and a
                // PerformanceObserver never reports a task that has not
                // finished, so zero long tasks is consistent with being stuck
                // inside one. getValue() walking an oversized document is the
                // obvious candidate, so measure the document rather than infer.
                const view = (
                    window as unknown as {
                        app?: {
                            workspace: {
                                activeEditor?: {
                                    editor?: { getValue(): string };
                                };
                            };
                        };
                    }
                ).app?.workspace?.activeEditor;
                let docLength: number | string = 'n/a';
                try {
                    docLength = view?.editor?.getValue().length ?? -1;
                } catch (e) {
                    docLength = `threw: ${String(e)}`;
                }
                const mem = (
                    performance as unknown as {
                        memory?: { usedJSHeapSize: number };
                    }
                ).memory;
                return {
                    count: all.length,
                    worst: all
                        .slice()
                        .sort((a, b) => b.d - a.d)
                        .slice(0, 3),
                    totalMs: all.reduce((sum, e) => sum + e.d, 0),
                    docLength,
                    heapMiB: mem
                        ? Math.round(mem.usedJSHeapSize / 1048576)
                        : -1,
                    domNodes: document.getElementsByTagName('*').length,
                    cmEditors: document.querySelectorAll('.cm-editor').length,
                    leaves: document.querySelectorAll('.workspace-leaf').length,
                };
            })
            .catch(() => null);
        // Everything above runs in the browser and returns null once the
        // session dies, which is exactly when the evidence is wanted. This
        // runs in Node and survives. The document is 13-32 characters and no
        // long task is ever reported, so getValue() is not slow for any
        // JavaScript reason; the remaining candidate is a native block, and
        // the Neovim child is the native thing these specs add.
        // Why the child exits is the open question, and its own log is the
        // cheapest place to look: a Lua error in the companion, a fatal signal
        // or an orderly quit all read differently there. Only collected when a
        // tracked pid is gone, so healthy runs stay quiet.
        // Collected whenever the test did not pass, not only when a tracked
        // pid is gone: a local reproduction reported an empty pid set at the
        // failing boundary, so keying the capture on a dead pid missed the
        // case it was written for.
        let nvimLog = '';
        const anyDead = [...spawnedPids].some((pid) => !pidIsAlive(pid));
        if (anyDead || this.currentTest?.state !== 'passed') {
            const path = nvimLogPath();
            if (path) {
                try {
                    nvimLog = readFileSync(path, 'utf8')
                        .slice(nvimLogOffset)
                        .slice(-600);
                } catch {
                    /* absent when Neovim logged nothing */
                }
            }
        }
        const nvim = [...spawnedPids].map((pid) => {
            let state = 'unknown';
            try {
                const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
                state = stat.split(') ')[1]?.split(' ')[0] ?? 'unparsed';
            } catch {
                state = 'no-proc';
            }
            return `${pid}:${pidIsAlive(pid) ? 'alive' : 'dead'}:${state}`;
        });
        console.log(
            'RPCTASKS ' +
                JSON.stringify({
                    after: (this.currentTest?.title ?? '?').slice(0, 44),
                    state: this.currentTest?.state,
                    tasks,
                    nvim,
                    nvimLog,
                    // Healthy runs record rc=0. A signalled child reads as
                    // 128+signal, so a crash and an orderly quit are
                    // distinguishable from this one number.
                    nvimExit: (() => {
                        try {
                            return readFileSync(NVIM_EXIT_LOG, 'utf8')
                                .slice(nvimExitOffset)
                                .trim()
                                .slice(-200);
                        } catch {
                            return '';
                        }
                    })(),
                }),
        );
        await setRpcEnabled(false);
        await waitForRpc(false);
        for (const pid of spawnedPids) {
            killIfAlive(pid);
            spawnedPids.delete(pid);
        }
    });

    it('matches heading navigation in both directions across h1-h3', async () => {
        await expectParity({
            content: '# A\nbody\n## B\nbody\n### C\nbody\n# D',
            cursor: { line: 0, ch: 0 },
            steps: [']h', ']h', '[h'],
        });
    });

    it('matches level-specific heading navigation', async () => {
        await expectParity({
            content: '# A\n## B\n### C\n## D\n### E\n# F',
            cursor: { line: 0, ch: 0 },
            steps: [']2', ']3', '[3'],
        });
    });

    it('honours heading motion counts', async () => {
        await expectParity({
            content: '# A\n# B\n## C\n### D\n# E',
            cursor: { line: 0, ch: 0 },
            steps: ['3]h'],
        });
    });

    it('matches operator-pending heading motion edits', async () => {
        const result = await expectOperatorParity({
            content: '# A\nfirst\nsecond\n## B\nthird',
            cursor: { line: 1, ch: 0 },
            steps: ['d]h'],
        });
        await browser.waitUntil(
            async () => (await readActiveFile()) === result.content,
            { timeout: 30000, interval: 100 },
        );
        expect(await readActiveFile()).toBe(result.content);
    });

    it('matches backward operator-pending heading motion edits', async () => {
        await expectOperatorParity({
            content: '# A\nfirst\n## B\nsecond\nthird\n# C',
            cursor: { line: 4, ch: 0 },
            steps: ['d[h'],
        });
    });

    it('matches operator-pending heading yanks and registers', async () => {
        await expectOperatorParity({
            content: '# A\nfirst\nsecond\n## B\nthird',
            cursor: { line: 1, ch: 0 },
            steps: ['y]h'],
            compareRegister: true,
        });
    });

    it('matches operator-pending heading changes', async () => {
        await expectOperatorParity({
            content: '# A\nfirst\nsecond\n## B\nthird',
            cursor: { line: 1, ch: 0 },
            steps: ['c]h'],
        });
    });

    it('matches operator-pending list motion edits', async () => {
        await expectOperatorParity({
            content: '- one\n  continuation\n- two\n- three',
            cursor: { line: 0, ch: 2 },
            steps: ['d]l'],
        });
    });

    it('matches operator-pending link motion edits', async () => {
        await expectOperatorParity({
            content: 'prefix [[One]] middle [two](url) suffix',
            cursor: { line: 0, ch: 0 },
            steps: ['d]n'],
        });
    });

    it('matches counted operator-pending heading motion edits', async () => {
        await expectOperatorParity({
            content: '# A\none\n## B\ntwo\n### C\nthree\n# D',
            cursor: { line: 1, ch: 0 },
            steps: ['d2]h'],
        });
    });

    it('matches navigation across nested list items', async () => {
        await expectParity({
            content:
                '- one\n  - nested one\n  - nested two\n- two\n  - nested three\n- three',
            cursor: { line: 0, ch: 2 },
            steps: [']l', ']l', '[l'],
        });
    });

    it('matches navigation across wikilinks and external links', async () => {
        await expectParity({
            content:
                'start [[One]] and [two](https://example.com)\nnext [[Three]]',
            cursor: { line: 0, ch: 0 },
            steps: [']n', ']n', ']n', '[n'],
        });
    });

    it('matches native gq wrapping at the configured textwidth', async () => {
        await expectParity({
            content:
                '- This list item contains enough words to wrap with a hanging indent while preserving its marker.\n\nThis paragraph also contains enough words to wrap into several lines at the configured width.',
            cursor: { line: 0, ch: 0 },
            steps: ['gqG'],
            textwidth: 40,
        });
    });

    it('matches gw wrapping and cursor preservation', async () => {
        await expectParity({
            content:
                'This paragraph contains enough words to wrap into several lines while keeping the cursor where fork mode keeps it.',
            cursor: { line: 0, ch: 10 },
            steps: ['gwip'],
            textwidth: 40,
        });
    });
});
