import { browser, expect } from '@wdio/globals';
import { resolve } from 'node:path';
import {
    getCursorPos,
    getEditorValue,
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
    settings: Record<string, unknown>;
    saveSettings(): Promise<void>;
    reloadFeatures(): void;
    getNeovimConnectionState(): RpcState;
    requestNeovim(method: string, args: unknown[]): Promise<unknown>;
    refreshNeovimFeatureBridge(): Promise<void>;
    undoTree: {
        recordEdit(summary: null): void;
    };
}

interface UndoTreeDict {
    seq_cur: number;
    seq_last: number;
    entries: unknown[];
}

interface ByteState {
    cm: number[];
    raw: number[];
}

const TEST_CONFIG_PATH = resolve('test/fixtures/nvim/init.lua');
const FOLD_FIXTURE = [
    '# One',
    'one a',
    'one b',
    '',
    '## Child',
    'child',
    '# Two',
    'two',
].join('\n');

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
            Object.assign(plugin.settings, {
                enableUndoTree: true,
                neovimBinaryPath: '',
                neovimConfigPath: configPath,
                neovimRpcEnabled: next,
            });
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
            timeout: 10000,
            interval: 100,
            timeoutMsg: 'Neovim RPC did not connect',
        });
    } catch {
        const state = await getRpcState();
        throw new Error(
            `Neovim RPC did not connect (${JSON.stringify(state)}): ${(await getNotices()).join(' | ')}`,
        );
    }
    return getRpcState();
}

async function input(keys: string): Promise<void> {
    await pluginRequest('nvim_input', [keys]);
    await pluginRequest('nvim_get_mode', []);
}

async function waitForText(expected: string): Promise<void> {
    await browser.waitUntil(async () => (await getEditorValue()) === expected, {
        timeout: 5000,
        interval: 25,
        timeoutMsg: `CM6 did not reach ${JSON.stringify(expected)}`,
    });
}

async function resetBuffer(content = FOLD_FIXTURE): Promise<void> {
    await pluginRequest('nvim_exec_lua', [
        `vim.api.nvim_input("<Esc>")
vim.api.nvim_buf_set_lines(0, 0, -1, false, ...)
vim.api.nvim_set_option_value("foldmethod", "expr", { win = 0 })
vim.api.nvim_set_option_value("foldexpr", "v:lua.vim_motions_rpc_foldexpr()", { win = 0 })
vim.api.nvim_set_option_value("foldlevel", 99, { win = 0 })
vim.api.nvim_set_option_value("foldenable", true, { win = 0 })
vim.api.nvim_win_set_cursor(0, { 1, 0 })
vim.cmd("silent! normal! zR")
vim.cmd("redraw")`,
        [content.split('\n')],
    ]);
    await waitForText(content);
}

async function foldState(line: number): Promise<{
    closed: number;
    end: number;
    level: number;
}> {
    return (await pluginRequest('nvim_exec_lua', [
        'local line = ...; return { closed = vim.fn.foldclosed(line), end_ = vim.fn.foldclosedend(line), level = vim.fn.foldlevel(line) }',
        [line],
    ]).then((value) => {
        const state = value as {
            closed: number;
            end_: number;
            level: number;
        };
        return { closed: state.closed, end: state.end_, level: state.level };
    })) as { closed: number; end: number; level: number };
}

async function renderedFoldCount(): Promise<number> {
    return browser.executeObsidian(
        () => document.querySelectorAll('.cm-foldPlaceholder').length,
    );
}

async function renderedFoldLineText(): Promise<string | null> {
    return browser.executeObsidian(() => {
        const placeholder = document.querySelector('.cm-foldPlaceholder');
        return placeholder?.closest('.cm-line')?.textContent ?? null;
    });
}

async function waitForRenderedFolds(expected: number): Promise<void> {
    await browser.waitUntil(
        async () => (await renderedFoldCount()) === expected,
        {
            timeout: 5000,
            interval: 25,
            timeoutMsg: `CM6 did not render ${expected} folds`,
        },
    );
}

async function byteState(): Promise<ByteState> {
    return browser.executeObsidian(async ({ app }) => {
        const plugin = (
            app as unknown as {
                plugins: { plugins: Record<string, RpcPlugin> };
            }
        ).plugins.plugins['vim-motions'];
        const value = (
            app as unknown as {
                workspace: {
                    activeEditor?: { editor?: { getValue(): string } };
                };
            }
        ).workspace.activeEditor?.editor?.getValue();
        if (!plugin || value === undefined)
            throw new Error('No RPC plugin or active editor');
        const lines = (await plugin.requestNeovim('nvim_exec_lua', [
            'local out = {}; for _, line in ipairs(vim.api.nvim_buf_get_lines(0, 0, -1, true)) do out[#out + 1] = { string.byte(line, 1, -1) } end; return out',
            [],
        ])) as number[][];
        return {
            cm: Array.from(new TextEncoder().encode(value)),
            raw: lines.flatMap((line, index) =>
                index === lines.length - 1 ? line : [...line, 0x0a],
            ),
        };
    });
}

async function expectBytes(expected: string): Promise<void> {
    await waitForText(expected);
    const state = await byteState();
    const oracle = Array.from(new TextEncoder().encode(expected));
    await expect(state.raw).toEqual(oracle);
    await expect(state.cm).toEqual(oracle);
}

async function undoTree(): Promise<UndoTreeDict> {
    return (await pluginRequest('nvim_call_function', [
        'undotree',
        [],
    ])) as UndoTreeDict;
}

describe('Neovim RPC folds and undo tree', function () {
    before(function () {
        requireRpcPrerequisites(this);
    });

    this.timeout(30000);
    let spawnedPid: number | null = null;

    before(async () => {
        await loadSingleFileWorkspace();
        await setupEditor(FOLD_FIXTURE, { line: 0, ch: 0 });
        await setRpcEnabled(true);
        const state = await waitForConnected();
        spawnedPid = state.pid;
    });

    beforeEach(async () => {
        await browser.executeObsidian(async ({ app }) => {
            for (const leaf of app.workspace.getLeavesOfType('undo-tree'))
                leaf.detach();
            const markdown = app.workspace.getLeavesOfType('markdown')[0];
            if (markdown)
                await app.workspace.setActiveLeaf(markdown, { focus: true });
        });
        await resetBuffer();
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

    it('mirrors zc heading folds into CM6', async () => {
        await input('zc');
        try {
            await waitForRenderedFolds(1);
        } catch {
            throw new Error(
                `fold mirror mismatch: Neovim=${JSON.stringify(await foldState(1))}, CM6=${await renderedFoldCount()}`,
            );
        }
        await expect(await foldState(1)).toEqual({
            closed: 1,
            end: 6,
            level: 1,
        });
        await expect(await renderedFoldLineText()).toMatch(/^# One/u);
    });

    it('tracks zo, zR, and zM redraw state', async () => {
        await input('zc');
        await waitForRenderedFolds(1);
        await input('zo');
        await expect(await foldState(1)).toEqual({
            closed: -1,
            end: -1,
            level: 1,
        });
        await waitForRenderedFolds(0);
        await input('zM');
        await browser.waitUntil(async () => (await renderedFoldCount()) > 0, {
            timeout: 5000,
            interval: 25,
        });
        await input('zR');
        await waitForRenderedFolds(0);
        await expect(await foldState(1)).toEqual({
            closed: -1,
            end: -1,
            level: 1,
        });
    });

    it('keeps zj and ]z cursor motions synchronized', async () => {
        await input('zM');
        await input('zj');
        const afterNext = (await pluginRequest('nvim_win_get_cursor', [0])) as [
            number,
            number,
        ];
        await expect(afterNext).toEqual([7, 0]);
        await expect(await getCursorPos()).toEqual({ line: 6, ch: 0 });
        await input('zR');
        await pluginRequest('nvim_win_set_cursor', [0, [2, 0]]);
        await input(']z');
        const afterEnd = (await pluginRequest('nvim_win_get_cursor', [0])) as [
            number,
            number,
        ];
        await expect(afterEnd).toEqual([6, 0]);
        await expect(await getCursorPos()).toEqual({ line: 5, ch: 0 });
    });

    it('uses Neovim native zf operator folds', async () => {
        await pluginRequest('nvim_set_option_value', [
            'foldmethod',
            'manual',
            { win: 0 },
        ]);
        await input('zfj');
        await waitForRenderedFolds(1);
        await expect(await foldState(1)).toEqual({
            closed: 1,
            end: 2,
            level: 2,
        });
    });

    it('matches raw-byte text through undo and redo', async () => {
        await resetBuffer('alpha🙂\nbeta');
        await input('A one<Esc>');
        await expectBytes('alpha🙂 one\nbeta');
        await input('u');
        await expectBytes('alpha🙂\nbeta');
        await input('<C-r>');
        await expectBytes('alpha🙂 one\nbeta');
    });

    it('uses native chronological g- and g+', async () => {
        await resetBuffer('base');
        await input('A one<Esc>');
        await input('A two<Esc>');
        await expectBytes('base one two');
        await input('g-');
        await expectBytes('base one');
        await input('g+');
        await expectBytes('base one two');
    });

    it('uses native earlier and later commands', async () => {
        await resetBuffer('base');
        await input('A one<Esc>');
        await input('A two<Esc>');
        await input(':earlier 2<CR>');
        await expectBytes('base');
        await input(':later 1<CR>');
        await expectBytes('base one');
    });

    it('renders Neovim undotree data in the host sidebar', async () => {
        await resetBuffer('base');
        await input('A one<Esc>');
        await input('A two<Esc>');
        const nativeTree = await undoTree();
        await browser.executeObsidian(({ app }, count: number) => {
            const plugin = (
                app as unknown as {
                    plugins: { plugins: Record<string, RpcPlugin> };
                }
            ).plugins.plugins['vim-motions'];
            if (!plugin) throw new Error('Vim Motions is not loaded');
            for (let index = 0; index < count; index++)
                plugin.undoTree.recordEdit(null);
        }, nativeTree.seq_last + 5);
        await input(':UndoTreeToggle<CR>');
        await browser.waitUntil(
            async () =>
                browser.executeObsidian(
                    ({ app }) =>
                        app.workspace.getLeavesOfType('undo-tree').length === 1,
                ),
            { timeout: 5000, interval: 25 },
        );
        await browser.waitUntil(
            async () =>
                browser.executeObsidian(
                    () =>
                        document.querySelectorAll(
                            '.vim-motions-undo-node[data-seq]',
                        ).length > 0,
                ),
            { timeout: 5000, interval: 25 },
        );
        const rendered = await browser.executeObsidian(() =>
            Array.from(
                document.querySelectorAll<HTMLElement>(
                    '.vim-motions-undo-node',
                ),
            )
                .map((node) => Number(node.dataset.seq))
                .filter((seq) => seq > 0),
        );
        await expect(rendered.length).toBe(nativeTree.seq_last);
        await expect(rendered).toContain(nativeTree.seq_cur);
    });

    it('refreshes only the three host undo-tree commands', async () => {
        const inventory = async (): Promise<{
            foldMappings: number;
            undoCommands: number;
        }> =>
            (await pluginRequest('nvim_exec_lua', [
                `local commands = vim.api.nvim_get_commands({ builtin = false })
local undo = 0
for _, name in ipairs({ "UndoTreeToggle", "UndoTreeShow", "UndoTreeHide" }) do
    if commands[name] then undo = undo + 1 end
end
local folds = 0
for _, mapping in ipairs(vim.api.nvim_get_keymap("n")) do
    if mapping.desc and mapping.desc:find("vim%-motions%-rpc:mapping:fold") then folds = folds + 1 end
end
return { undoCommands = undo, foldMappings = folds }`,
                [],
            ])) as { foldMappings: number; undoCommands: number };
        const before = await inventory();
        await browser.executeObsidian(async ({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins: { plugins: Record<string, RpcPlugin> };
                }
            ).plugins.plugins['vim-motions'];
            if (!plugin) throw new Error('Vim Motions is not loaded');
            await plugin.refreshNeovimFeatureBridge();
            await plugin.refreshNeovimFeatureBridge();
        });
        const after = await inventory();
        await expect(before).toEqual({ foldMappings: 0, undoCommands: 3 });
        await expect(after).toEqual(before);
    });
});
