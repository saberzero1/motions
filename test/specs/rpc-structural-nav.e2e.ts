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

async function setRpcEnabled(enabled: boolean, textwidth = 80): Promise<void> {
    await browser.executeObsidian(
        async ({ app }, next: boolean, configPath: string, width: number) => {
            const plugin = (
                app as unknown as {
                    plugins: { plugins: Record<string, RpcPlugin> };
                }
            ).plugins.plugins['vim-motions'];
            if (!plugin) throw new Error('Vim Motions is not loaded');
            Object.assign(plugin.settings, {
                enableHardWrap: true,
                enableNavigation: true,
                neovimBinaryPath: '',
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
    this.timeout(900000);

    beforeEach(async () => {
        await loadSingleFileWorkspace();
        await useSourceProperties();
        await setRpcEnabled(false);
        await waitForRpc(false);
    });

    afterEach(async () => {
        await setRpcEnabled(false);
        await waitForRpc(false);
        for (const pid of spawnedPids) {
            if (pidIsAlive(pid)) process.kill(pid, 'SIGKILL');
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
            steps: [']h2', ']h3', '[h3'],
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
