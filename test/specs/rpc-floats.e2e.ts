import { browser, expect } from '@wdio/globals';
import fs from 'node:fs';
import { resolve } from 'node:path';
import { getNotices, loadSingleFileWorkspace, setupEditor } from '../helpers';

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

interface FloatOracle {
    win: number;
    buffer: number;
    relative: string;
    row: number;
    column: number;
    width: number;
    height: number;
    zindex: number;
    anchor: string;
    border: unknown;
    originRow: number;
    originColumn: number;
    lines: string[];
    extmarks: unknown[];
}

interface RenderedFloat {
    win: number;
    relative: string;
    row: number;
    column: number;
    zindex: number;
    border: boolean;
    left: number;
    top: number;
    cellWidth: number;
    lineHeight: number;
    lines: string[];
}

const FLASH_FIXTURE = 'test-vault/lua/flash/init.lua';
const TEST_CONFIG_PATH = resolve('test/fixtures/nvim/init.lua');
const FIXTURE = [
    'alpha atlas amber arena',
    'astral anchor apart awake',
    'banana cabana data lava',
    'gamma java mantra panda',
].join('\n');

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
            contentDOM.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key: token === '\u001b' ? 'Escape' : token,
                    bubbles: true,
                    cancelable: true,
                }),
            );
        }
    }, keys);
    await request('nvim_get_mode', []);
}

async function floatOracle(): Promise<FloatOracle[]> {
    return (await request('nvim_exec_lua', [
        `local result = {}
for _, win in ipairs(vim.api.nvim_list_wins()) do
  local config = vim.api.nvim_win_get_config(win)
  if config.relative ~= "" then
    local buf = vim.api.nvim_win_get_buf(win)
    local origin = { 0, 0 }
    if config.relative == "win" then origin = vim.api.nvim_win_get_position(config.win or 0) end
    result[#result + 1] = {
      win = win,
      buffer = buf,
      relative = config.relative,
      row = config.row,
      column = config.col,
      width = config.width,
      height = config.height,
      zindex = config.zindex or 50,
      anchor = config.anchor or "NW",
      border = config.border,
      originRow = origin[1],
      originColumn = origin[2],
      lines = vim.api.nvim_buf_get_lines(buf, 0, -1, false),
      extmarks = vim.api.nvim_buf_get_extmarks(buf, -1, { 0, 0 }, { -1, -1 }, { details = true }),
    }
  end
end
return result`,
        [],
    ])) as FloatOracle[];
}

async function renderedFloats(): Promise<RenderedFloat[]> {
    return browser.executeObsidian(() =>
        [...document.querySelectorAll<HTMLElement>('.vim-motions-rpc-float')]
            .map((element) => ({
                win: Number(element.dataset.win),
                relative: element.dataset.relative ?? '',
                row: Number(element.dataset.row),
                column: Number(element.dataset.column),
                zindex: Number(getComputedStyle(element).zIndex),
                border: element.dataset.border === 'true',
                left: Number.parseFloat(element.style.left),
                top: Number.parseFloat(element.style.top),
                cellWidth: Number(element.dataset.cellWidth),
                lineHeight: Number(element.dataset.lineHeight),
                lines: [
                    ...element.querySelectorAll<HTMLElement>(
                        '.vim-motions-rpc-float-line',
                    ),
                ].map((line) => line.textContent ?? ''),
            }))
            .sort((left, right) => left.win - right.win),
    );
}

async function waitForFloatCount(count: number): Promise<void> {
    await browser.waitUntil(
        async () => (await renderedFloats()).length === count,
        {
            timeout: 5000,
            interval: 50,
            timeoutMsg: `Expected ${count} rendered Neovim floats`,
        },
    );
}

async function closeAllFloats(): Promise<void> {
    await request('nvim_exec_lua', [
        `for _, win in ipairs(vim.api.nvim_list_wins()) do
  if vim.api.nvim_win_get_config(win).relative ~= "" then pcall(vim.api.nvim_win_close, win, true) end
end
vim.cmd("redraw")`,
        [],
    ]);
    await waitForFloatCount(0);
}

async function triggerFlash(): Promise<FloatOracle> {
    await dispatchKeys('sa');
    await browser.waitUntil(async () => (await floatOracle()).length > 0, {
        timeout: 5000,
        interval: 50,
        timeoutMsg: 'flash.nvim opened no floating prompt',
    });
    const oracle = (await floatOracle())[0];
    if (!oracle) throw new Error('flash.nvim float disappeared');
    await waitForFloatCount(1);
    return oracle;
}

describe('Neovim RPC floating windows', function () {
    this.timeout(30000);
    let spawnedPid: number | null = null;

    before(async function () {
        if (!fs.existsSync(FLASH_FIXTURE)) {
            console.warn(
                `SKIP: ${FLASH_FIXTURE} is absent. Run \`bash scripts/fetch-test-plugins.sh\`.`,
            );
            this.skip();
            return;
        }
        await loadSingleFileWorkspace();
        await setupEditor(FIXTURE, { line: 0, ch: 0 });
        await setRpcEnabled(true);
        const state = await waitForConnected();
        spawnedPid = state.pid;
        await request('nvim_exec_lua', [
            `local flash = require("flash")
flash.setup({
  search = { multi_window = false },
  prompt = { win_config = {
    relative = "editor", row = 3, col = 5, width = 20, height = 1,
    border = "single", zindex = 1000,
  } },
})
vim.keymap.set("n", "s", function() flash.jump() end, { silent = true })`,
            [],
        ]);
    });

    beforeEach(async () => {
        if ((await getRpcState()).connected) await closeAllFloats();
    });

    afterEach(async () => {
        if ((await getRpcState()).connected) {
            await dispatchKeys('\u001b');
            await closeAllFloats();
        }
    });

    after(async () => {
        if ((await getRpcState()).connected) await setRpcEnabled(false);
        if (spawnedPid !== null) {
            await browser.waitUntil(async () => !pidIsAlive(spawnedPid!), {
                timeout: 5000,
                interval: 100,
                timeoutMsg: `Neovim PID ${spawnedPid} survived teardown`,
            });
        }
    });

    it('renders flash.nvim prompt content from its floating buffer', async () => {
        const oracle = await triggerFlash();
        const rendered = (await renderedFloats())[0];
        await expect(rendered?.win).toBe(oracle.win);
        await expect(rendered?.lines).toEqual(
            oracle.lines.slice(0, oracle.height),
        );
    });

    it('maps flash.nvim row and column through measured CM6 cell metrics', async () => {
        const oracle = await triggerFlash();
        const rendered = (await renderedFloats())[0];
        if (!rendered) throw new Error('flash.nvim overlay disappeared');
        const expected = await browser.executeObsidian(
            ({ app, obsidian }, float: FloatOracle) => {
                const markdown = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                const view = (
                    markdown?.editor as unknown as {
                        cm?: {
                            dom: HTMLElement;
                            scrollDOM: HTMLElement;
                            state: { selection: { main: { head: number } } };
                            coordsAtPos(position: number): DOMRect | null;
                            defaultCharacterWidth: number;
                            defaultLineHeight: number;
                        };
                    }
                ).cm;
                if (!view) throw new Error('No active CM6 view');
                const viewRect = view.dom.getBoundingClientRect();
                const scrollerRect = view.scrollDOM.getBoundingClientRect();
                const style = getComputedStyle(view.scrollDOM);
                let left =
                    scrollerRect.left -
                    viewRect.left +
                    (Number.parseFloat(style.paddingLeft) || 0);
                let top =
                    scrollerRect.top -
                    viewRect.top +
                    (Number.parseFloat(style.paddingTop) || 0);
                if (float.relative === 'cursor') {
                    const cursor = view.coordsAtPos(
                        view.state.selection.main.head,
                    );
                    if (cursor) {
                        left = cursor.left - viewRect.left;
                        top = cursor.top - viewRect.top;
                    }
                } else if (float.relative === 'win') {
                    left += float.originColumn * view.defaultCharacterWidth;
                    top += float.originRow * view.defaultLineHeight;
                }
                left += float.column * view.defaultCharacterWidth;
                top += float.row * view.defaultLineHeight;
                if (float.anchor.endsWith('E'))
                    left -= float.width * view.defaultCharacterWidth;
                if (float.anchor.startsWith('S'))
                    top -= float.height * view.defaultLineHeight;
                const probe = document.createElement('div');
                probe.style.left = `${left}px`;
                probe.style.top = `${top}px`;
                return {
                    left: Number.parseFloat(probe.style.left),
                    top: Number.parseFloat(probe.style.top),
                    cellWidth: view.defaultCharacterWidth,
                    lineHeight: view.defaultLineHeight,
                };
            },
            oracle,
        );
        await expect(rendered.relative).toBe(oracle.relative);
        await expect(rendered.row).toBe(oracle.row);
        await expect(rendered.column).toBe(oracle.column);
        await expect(rendered.cellWidth).toBeCloseTo(expected.cellWidth, 5);
        await expect(rendered.lineHeight).toBeCloseTo(expected.lineHeight, 5);
        await expect(rendered.left).toBe(expected.left);
        await expect(rendered.top).toBe(expected.top);
    });

    it('stacks multiple floats by Neovim zindex', async () => {
        await request('nvim_exec_lua', [
            `local function open(text, row, zindex)
  local buf = vim.api.nvim_create_buf(false, true)
  vim.api.nvim_buf_set_lines(buf, 0, -1, false, { text })
  vim.api.nvim_open_win(buf, false, {
    relative = "editor", row = row, col = 2, width = 12, height = 1,
    style = "minimal", zindex = zindex,
  })
end
open("lower", 2, 41)
open("upper", 3, 87)
vim.cmd("redraw")`,
            [],
        ]);
        await waitForFloatCount(2);
        const oracle = (await floatOracle()).sort(
            (left, right) => left.zindex - right.zindex,
        );
        const rendered = (await renderedFloats()).sort(
            (left, right) => left.zindex - right.zindex,
        );
        await expect(rendered.map((item) => item.zindex)).toEqual(
            oracle.map((item) => item.zindex),
        );
        await expect(rendered[1]!.zindex).toBeGreaterThan(rendered[0]!.zindex);
    });

    it('removes the flash.nvim overlay when Escape closes the float', async () => {
        await triggerFlash();
        await dispatchKeys('\u001b');
        try {
            await waitForFloatCount(0);
        } catch {
            throw new Error(
                `Float close left ${(await renderedFloats()).length} stale overlay(s)`,
            );
        }
        const windows = (await request('nvim_exec_lua', [
            `local nonfloat = 0
for _, win in ipairs(vim.api.nvim_list_wins()) do
  if vim.api.nvim_win_get_config(win).relative == "" then nonfloat = nonfloat + 1 end
end
return { total = #vim.api.nvim_list_wins(), nonfloat = nonfloat }`,
            [],
        ])) as { total: number; nonfloat: number };
        await expect(windows).toEqual({ total: 1, nonfloat: 1 });
        await expect(await renderedFloats()).toEqual([]);
    });

    it('renders extmarks from a floating buffer inside its overlay', async () => {
        const created = (await request('nvim_exec_lua', [
            `local buf = vim.api.nvim_create_buf(false, true)
vim.api.nvim_buf_set_lines(buf, 0, -1, false, { "float body" })
local ns = vim.api.nvim_create_namespace("vim_motions_float_test")
local id = vim.api.nvim_buf_set_extmark(buf, ns, 0, 6, {
  virt_text = { { "MARK", "Search" } }, virt_text_pos = "overlay", priority = 90,
})
local win = vim.api.nvim_open_win(buf, false, {
  relative = "editor", row = 4, col = 6, width = 12, height = 1,
  style = "minimal", border = "single", zindex = 65,
})
vim.cmd("redraw")
return { win = win, ns = ns, id = id }`,
            [],
        ])) as { win: number; ns: number; id: number };
        await waitForFloatCount(1);
        const extmark = await browser.executeObsidian(() => {
            const overlay = document.querySelector<HTMLElement>(
                '.vim-motions-rpc-float',
            );
            return {
                marks: [
                    ...(overlay?.querySelectorAll<HTMLElement>(
                        '.vim-motions-rpc-float-virt-text',
                    ) ?? []),
                ].map((mark) => ({
                    ns: Number(mark.dataset.nsId),
                    id: Number(mark.dataset.extmarkId),
                    text: mark.textContent ?? '',
                })),
                border: overlay?.dataset.border ?? null,
            };
        });
        await expect(extmark.marks).toContainEqual({
            ns: created.ns,
            id: created.id,
            text: 'MARK',
        });
        await expect(extmark.border).toBe('true');
    });

    it('removes every float overlay when the RPC connection drops', async () => {
        await request('nvim_exec_lua', [
            `local buf = vim.api.nvim_create_buf(false, true)
vim.api.nvim_buf_set_lines(buf, 0, -1, false, { "disconnect float" })
vim.api.nvim_open_win(buf, false, {
  relative = "editor", row = 1, col = 1, width = 16, height = 1,
  style = "minimal", border = "single",
})
vim.cmd("redraw")`,
            [],
        ]);
        await waitForFloatCount(1);
        await setRpcEnabled(false);
        await waitForFloatCount(0);
        await expect(
            await browser.executeObsidian(
                () =>
                    document.querySelectorAll('.vim-motions-rpc-float').length,
            ),
        ).toBe(0);
    });
});
