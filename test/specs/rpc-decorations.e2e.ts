import { browser, expect } from '@wdio/globals';
import fs from 'node:fs';
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
    neovimByteToUtf16(text: string, column: number): number;
}

interface LabelExtmark {
    nsId: number;
    id: number;
    row: number;
    column: number;
    text: string;
    priority: number;
    position: string;
}

interface RenderedLabel extends LabelExtmark {
    offset: number;
}

const FLASH_FIXTURE = 'test-vault/lua/flash/init.lua';
const TEST_CONFIG_PATH = resolve('test/fixtures/nvim/init.lua');
const BRIDGE_SOURCE = 'src/rpc/decorations.ts';
const COMPANION_SOURCE = 'src/rpc/companion.lua';
const FIXTURE = [
    'alpha atlas amber arena',
    'astral anchor apart awake',
    'banana cabana data lava',
    'gamma java mantra panda',
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
        const state = await getRpcState();
        throw new Error(
            `Neovim RPC did not connect (${JSON.stringify(state)}): ${(await getNotices()).join(' | ')}`,
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
            const key = token === '\u001b' ? 'Escape' : token;
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

async function resetFixture(): Promise<void> {
    await pluginRequest('nvim_exec_lua', [
        `local ns = vim.api.nvim_create_namespace("flash")
vim.api.nvim_input("<Esc>")
vim.api.nvim_buf_clear_namespace(0, ns, 0, -1)
vim.api.nvim_buf_set_lines(0, 0, -1, false, ...)
vim.api.nvim_win_set_cursor(0, { 1, 0 })`,
        [FIXTURE.split('\n')],
    ]);
    await pluginRequest('nvim_get_mode', []);
    await browser.waitUntil(
        async () =>
            browser.executeObsidian(({ app, obsidian }, expected: string) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                return view?.editor.getValue() === expected;
            }, FIXTURE),
        { timeout: 5000, interval: 50 },
    );
}

async function labelOracle(): Promise<LabelExtmark[]> {
    return (await pluginRequest('nvim_exec_lua', [
        `local flash_ns = vim.api.nvim_create_namespace("flash")
local marks = vim.api.nvim_buf_get_extmarks(0, -1, { 0, 0 }, { -1, -1 }, { details = true })
local labels = {}
for _, mark in ipairs(marks) do
  local details = mark[4] or {}
  if details.ns_id == flash_ns and details.virt_text then
    local text = ""
    for _, chunk in ipairs(details.virt_text) do text = text .. chunk[1] end
    labels[#labels + 1] = {
      nsId = details.ns_id,
      id = mark[1],
      row = mark[2],
      column = mark[3],
      text = text,
      priority = details.priority or 0,
      position = details.virt_text_pos or "eol",
    }
  end
end
return labels`,
        [],
    ])) as LabelExtmark[];
}

async function renderedLabels(): Promise<RenderedLabel[]> {
    return browser.executeObsidian(() => {
        return [
            ...document.querySelectorAll<HTMLElement>(
                '.vim-motions-rpc-virt-text',
            ),
        ]
            .map((element) => {
                const row = Number(element.dataset.row);
                const column = Number(element.dataset.byteColumn);
                return {
                    nsId: Number(element.dataset.nsId),
                    id: Number(element.dataset.extmarkId),
                    row,
                    column,
                    text: element.textContent ?? '',
                    priority: Number(element.dataset.priority),
                    position: 'overlay',
                    offset: Number(element.dataset.offset),
                };
            })
            .sort((left, right) => left.id - right.id);
    });
}

describe('Neovim RPC decorations', function () {
    this.timeout(20000);
    let spawnedPid: number | null = null;

    before(async function () {
        requireRpcPrerequisites(this, { fixtures: [FLASH_FIXTURE] });
        await loadSingleFileWorkspace();
        await setupEditor(FIXTURE, { line: 0, ch: 0 });
        await setRpcEnabled(true);
        const state = await waitForConnected();
        spawnedPid = state.pid;
        await pluginRequest('nvim_exec_lua', [
            `local flash = require("flash")
flash.setup({
  search = { multi_window = false },
  label = { before = { 0, 0 }, after = false, style = "overlay" },
})
vim.keymap.set("n", "s", function() flash.jump() end, { silent = true })
return true`,
            [],
        ]);
    });

    beforeEach(async () => {
        await resetFixture();
    });

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

    it('renders every flash label from the extmark oracle', async () => {
        await dispatchKeys('sa');
        await browser.waitUntil(async () => (await labelOracle()).length > 5, {
            timeout: 5000,
            interval: 50,
            timeoutMsg: 'flash produced no label extmarks',
        });
        const oracle = (await labelOracle()).sort(
            (left, right) => left.id - right.id,
        );
        try {
            await browser.waitUntil(
                async () => (await renderedLabels()).length === oracle.length,
                {
                    timeout: 5000,
                    interval: 50,
                    timeoutMsg: 'CM6 did not render every flash label extmark',
                },
            );
        } catch {
            throw new Error(
                `CM6 rendered ${(await renderedLabels()).length}/${oracle.length} flash label extmarks`,
            );
        }
        const rendered = await renderedLabels();
        const expected = await browser.executeObsidian(
            ({ app, obsidian }, labels: LabelExtmark[]) => {
                const plugin = (
                    app as unknown as {
                        plugins: { plugins: Record<string, RpcPlugin> };
                    }
                ).plugins.plugins['vim-motions'];
                const markdown = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                const doc = (
                    markdown?.editor as unknown as {
                        cm?: {
                            state?: {
                                doc: {
                                    line(number: number): {
                                        from: number;
                                        text: string;
                                    };
                                };
                            };
                        };
                    }
                ).cm?.state?.doc;
                if (!plugin || !doc) throw new Error('No active CM6 document');
                return labels.map((label) => {
                    const line = doc.line(label.row + 1);
                    return {
                        ...label,
                        offset:
                            line.from +
                            plugin.neovimByteToUtf16(line.text, label.column),
                    };
                });
            },
            oracle,
        );
        await expect(rendered).toEqual(expected);
    });

    it('jumps Neovim and CM6 to the selected label', async () => {
        await dispatchKeys('sa');
        await browser.waitUntil(async () => (await labelOracle()).length > 5, {
            timeout: 5000,
            interval: 50,
        });
        const target = (await labelOracle()).find(
            (label) => label.text.length === 1,
        );
        if (!target) throw new Error('flash produced no selectable label');
        await dispatchKeys(target.text);
        const cursor = (await pluginRequest('nvim_win_get_cursor', [0])) as [
            number,
            number,
        ];
        const cm = await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            return view?.editor.getCursor() ?? null;
        });
        await expect(cursor).toEqual([target.row + 1, target.column]);
        await expect(cm).toEqual({ line: target.row, ch: target.column });
    });

    it('is redraw-driven and buffer-space only', async () => {
        const bridge = fs.readFileSync(BRIDGE_SOURCE, 'utf8');
        const companion = fs.readFileSync(COMPANION_SOURCE, 'utf8');
        await expect(bridge).not.toMatch(/setInterval|setTimeout/u);
        await expect(companion).toContain('nvim_buf_get_extmarks');
        await expect(companion).toMatch(/buf,\s*\n\s*-1,/u);
        await expect(`${bridge}\n${companion}`).not.toContain('grid_line');
    });

    it('has no RPC decorations before flash is triggered', async () => {
        await browser.pause(100);
        await expect(await renderedLabels()).toEqual([]);
        const all = await browser.executeObsidian(
            () =>
                document.querySelectorAll('.vim-motions-rpc-decoration').length,
        );
        await expect(all).toBe(0);
    });
});
