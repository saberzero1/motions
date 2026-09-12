import { browser, expect } from '@wdio/globals';
import { resolve } from 'node:path';
import { getNotices, loadSingleFileWorkspace, setupEditor } from '../helpers';
import { requireRpcPrerequisites } from './rpc-prerequisites';

interface RpcState {
    connected: boolean;
    pid: number | null;
    mode: string | null;
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

interface CmdlineSnapshot {
    overlayCount: number;
    levelCount: number;
    text: string;
    levelText: string;
    caretOffset: number | null;
    position: string;
    backgroundColor: string;
    caretBorderWidth: string;
}

const TEST_CONFIG_PATH = resolve('test/fixtures/nvim/init.lua');
const BASIC_FIXTURE = 'alpha beta alpha gamma';

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

async function dispatchKeys(...sequences: string[]): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }, tokens: string[]) => {
        const markdown = app.workspace.getActiveViewOfType(
            obsidian.MarkdownView,
        );
        const contentDOM = (
            markdown?.editor as unknown as { cm?: { contentDOM?: HTMLElement } }
        )?.cm?.contentDOM;
        if (!contentDOM) throw new Error('No active editor contentDOM');
        const KeyboardEventConstructor =
            contentDOM.ownerDocument.defaultView?.KeyboardEvent;
        if (!KeyboardEventConstructor)
            throw new Error('No KeyboardEvent constructor');
        contentDOM.focus();
        for (const token of tokens) {
            const parts = token.startsWith('<') ? [token] : Array.from(token);
            for (const part of parts) {
                const key =
                    part === '<Esc>'
                        ? 'Escape'
                        : part === '<CR>'
                          ? 'Enter'
                          : part === '<Left>'
                            ? 'ArrowLeft'
                            : part === '<C-r>'
                              ? 'r'
                              : part;
                contentDOM.dispatchEvent(
                    new KeyboardEventConstructor('keydown', {
                        key,
                        ctrlKey: part === '<C-r>',
                        bubbles: true,
                        cancelable: true,
                    }),
                );
            }
        }
    }, sequences);
    if ((await getRpcState()).connected)
        await pluginRequest('nvim_get_mode', []);
}

async function snapshot(level = 1): Promise<CmdlineSnapshot> {
    return browser.executeObsidian((_context, targetLevel: number) => {
        const overlay = document.querySelector<HTMLElement>(
            '.vim-motions-rpc-cmdline',
        );
        const row = document.querySelector<HTMLElement>(
            `.vim-motions-rpc-cmdline-level[data-level="${targetLevel}"]`,
        );
        const caret = row?.querySelector<HTMLElement>(
            '.vim-motions-rpc-cmdline-caret',
        );
        const overlayStyle = overlay ? getComputedStyle(overlay) : null;
        const caretStyle = caret ? getComputedStyle(caret) : null;
        const caretOffset = row?.dataset.caretOffset;
        return {
            overlayCount: document.querySelectorAll('.vim-motions-rpc-cmdline')
                .length,
            levelCount: document.querySelectorAll(
                '.vim-motions-rpc-cmdline-level',
            ).length,
            text: overlay?.textContent ?? '',
            levelText: row?.textContent ?? '',
            caretOffset: caretOffset === undefined ? null : Number(caretOffset),
            position: overlayStyle?.position ?? '',
            backgroundColor: overlayStyle?.backgroundColor ?? '',
            caretBorderWidth: caretStyle?.borderLeftWidth ?? '',
        };
    }, level);
}

async function waitForCmdline(
    predicate: (value: CmdlineSnapshot) => boolean,
    timeoutMsg: string,
    level = 1,
): Promise<CmdlineSnapshot> {
    await browser.waitUntil(async () => predicate(await snapshot(level)), {
        timeout: 5000,
        interval: 25,
        timeoutMsg,
    });
    return snapshot(level);
}

async function waitForMode(mode: string, timeoutMsg: string): Promise<void> {
    await browser.waitUntil(async () => (await getRpcState()).mode === mode, {
        timeout: 5000,
        interval: 25,
        timeoutMsg,
    });
}

async function resetFixture(): Promise<void> {
    await dispatchKeys('<Esc>');
    await waitForMode('n', 'normal mode was not restored before fixture reset');
    if ((await snapshot()).overlayCount !== 0) {
        await setRpcEnabled(false);
        await browser.waitUntil(async () => !(await getRpcState()).connected, {
            timeout: 5000,
            interval: 50,
            timeoutMsg: 'RPC did not disconnect while clearing stale test UI',
        });
        await setRpcEnabled(true);
        await waitForConnected();
    }
    await browser.waitUntil(async () => (await snapshot()).overlayCount === 0, {
        timeout: 5000,
        interval: 25,
        timeoutMsg: 'RPC command-line UI remained before fixture reset',
    });
    await pluginRequest('nvim_buf_set_lines', [
        0,
        0,
        -1,
        true,
        BASIC_FIXTURE.split('\n'),
    ]);
    await pluginRequest('nvim_win_set_cursor', [0, [1, 0]]);
}

async function scheduleLua(source: string): Promise<void> {
    await pluginRequest('nvim_exec_lua', [
        `vim.schedule(function() ${source} end)`,
        [],
    ]);
}

async function luaResult(name: string): Promise<unknown> {
    return pluginRequest('nvim_exec_lua', [`return _G.${name}`, []]);
}

describe('Neovim RPC command line', function () {
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
        if ((await getRpcState()).connected) await dispatchKeys('<Esc>');
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

    it('renders the ex command-line prefix with visible styling', async () => {
        await dispatchKeys(':');
        const state = await waitForCmdline(
            (value) =>
                value.levelText === ':' &&
                value.position === 'absolute' &&
                value.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
                value.caretBorderWidth !== '0px',
            'a visibly styled RPC command line showing ":"',
        );
        await expect(state.overlayCount).toBe(1);
        await expect(state.levelText).toBe(':');
        await expect(state.position).toBe('absolute');
        await expect(state.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
        await expect(state.caretBorderWidth).not.toBe('0px');
    });

    it('renders typed command text with the caret at the end', async () => {
        await dispatchKeys(':set number');
        const state = await waitForCmdline(
            (value) =>
                value.levelText === ':set number' && value.caretOffset === 10,
            'the complete ":set number" command with its caret at offset 10',
        );
        await expect(state.levelText).toBe(':set number');
        await expect(state.caretOffset).toBe(10);
    });

    it('hides the command line on Escape and returns to normal mode', async () => {
        await dispatchKeys(':abc');
        await waitForCmdline(
            (value) => value.levelText === ':abc',
            'the ":abc" command line before cancellation',
        );
        await dispatchKeys('<Esc>');
        await browser.waitUntil(
            async () =>
                (await snapshot()).overlayCount === 0 &&
                (await getRpcState()).mode === 'n',
            {
                timeout: 5000,
                interval: 25,
                timeoutMsg:
                    'Escape to hide the RPC command line and restore normal mode',
            },
        );
        await expect((await snapshot()).overlayCount).toBe(0);
        await expect((await getRpcState()).mode).toBe('n');
    });

    it('tracks an ASCII caret position reported by Neovim', async () => {
        await dispatchKeys(':', '<Left>', '<Left>');
        const state = await waitForCmdline(
            (value) => value.levelText === ':' && value.caretOffset === 0,
            'the ASCII command-line caret at Neovim offset 0',
        );
        const commandPosition = await pluginRequest('nvim_exec_lua', [
            'return vim.fn.getcmdpos() - 1',
            [],
        ]);
        await expect(commandPosition).toBe(0);
        await expect(state.caretOffset).toBe(commandPosition);
    });

    it('converts a multibyte byte position to the UTF-16 caret offset', async () => {
        await dispatchKeys(':你é');
        const state = await waitForCmdline(
            (value) => value.levelText === ':你é' && value.caretOffset === 3,
            'the multibyte command-line caret at UTF-16 offset 3',
        );
        const commandPosition = await pluginRequest('nvim_exec_lua', [
            'return { vim.fn.getcmdline(), vim.fn.getcmdpos() - 1 }',
            [],
        ]);
        await expect(commandPosition).toEqual(['你é', 6]);
        await expect(state.caretOffset).toBe(3);
        await expect(state.caretOffset).not.toBe(6);
    });

    it('renders the search first character instead of hardcoding a colon', async () => {
        await dispatchKeys('/alpha');
        const state = await waitForCmdline(
            (value) => value.levelText === '/alpha',
            'the search command line showing "/alpha"',
        );
        await expect(state.levelText).toBe('/alpha');
        await expect(state.levelText.startsWith(':')).toBe(false);
    });

    it('renders vim.ui.input prompts and returns typed input', async () => {
        await scheduleLua(
            '_G.__m8b_input = "pending"; vim.ui.input({ prompt = "Name: " }, function(value) _G.__m8b_input = value or "nil" end)',
        );
        await waitForCmdline(
            (value) => value.text.includes('Name: '),
            'the vim.ui.input "Name: " prompt',
        );
        await dispatchKeys('bob', '<CR>');
        await browser.waitUntil(
            async () =>
                (await luaResult('__m8b_input')) === 'bob' &&
                (await snapshot()).overlayCount === 0,
            {
                timeout: 5000,
                interval: 25,
                timeoutMsg:
                    'vim.ui.input to return "bob" and hide its command line',
            },
        );
        await expect(await luaResult('__m8b_input')).toBe('bob');
        await expect((await snapshot()).overlayCount).toBe(0);
    });

    it('renders vim.ui.select choices and returns the selected item', async () => {
        await scheduleLua(
            '_G.__m8b_select = "pending"; vim.ui.select({ "one", "two" }, {}, function(value) _G.__m8b_select = value or "nil" end)',
        );
        const state = await waitForCmdline(
            (value) => value.text.includes('one') && value.text.includes('two'),
            'the vim.ui.select confirmation message containing both choices',
        );
        await expect(state.text).toContain('one');
        await expect(state.text).toContain('two');
        await dispatchKeys('2', '<CR>');
        await browser.waitUntil(
            async () => (await luaResult('__m8b_select')) === 'two',
            {
                timeout: 5000,
                interval: 25,
                timeoutMsg: 'vim.ui.select to return "two"',
            },
        );
        await expect(await luaResult('__m8b_select')).toBe('two');
    });

    it('cancels vim.ui.select without leaving a command line behind', async () => {
        await scheduleLua(
            '_G.__m8b_cancel = "pending"; vim.ui.select({ "one", "two" }, {}, function(value) _G.__m8b_cancel = value or "nil" end)',
        );
        await waitForCmdline(
            (value) => value.text.includes('one'),
            'the cancellable vim.ui.select command line',
        );
        await dispatchKeys('<Esc>');
        await browser.waitUntil(
            async () =>
                (await luaResult('__m8b_cancel')) === 'nil' &&
                (await getRpcState()).mode === 'n' &&
                (await snapshot()).overlayCount === 0,
            {
                timeout: 5000,
                interval: 25,
                timeoutMsg:
                    'vim.ui.select cancellation to return nil, restore normal mode, and hide the overlay',
            },
        );
        await expect(await luaResult('__m8b_cancel')).toBe('nil');
        await expect((await getRpcState()).mode).toBe('n');
        await expect((await snapshot()).overlayCount).toBe(0);
    });

    it('preserves the outer command line when a nested level hides', async () => {
        await dispatchKeys(':', '<C-r>', '=');
        const nested = await waitForCmdline(
            (value) => value.text.includes('='),
            'the nested expression-register command line',
        );
        await dispatchKeys('<Esc>');
        const outer = await waitForCmdline(
            (value) =>
                value.overlayCount === 1 &&
                value.levelCount === 1 &&
                value.levelText === ':',
            'the outer command line to remain after level 2 hid',
        );
        await expect(nested.levelCount).toBe(2);
        await expect(nested.text).toContain('=');
        await expect(outer.levelCount).toBe(1);
        await expect(outer.levelText).toBe(':');
    });

    it('leaves the bundled fork command line unchanged when RPC is off', async () => {
        await setRpcEnabled(false);
        await browser.waitUntil(
            async () =>
                !(await getRpcState()).connected &&
                (await snapshot()).overlayCount === 0,
            {
                timeout: 5000,
                interval: 50,
                timeoutMsg: 'RPC to disconnect and remove its command line',
            },
        );
        await dispatchKeys(':');
        await browser.waitUntil(
            async () =>
                browser.executeObsidian(() => {
                    const input = document.querySelector<HTMLInputElement>(
                        '.cm-vim-panel input',
                    );
                    return (
                        input !== null &&
                        getComputedStyle(input).display !== 'none'
                    );
                }),
            {
                timeout: 5000,
                interval: 25,
                timeoutMsg: 'the bundled fork command-line input to appear',
            },
        );
        const state = await browser.executeObsidian(() => {
            const input = document.querySelector<HTMLInputElement>(
                '.cm-vim-panel input',
            );
            return {
                count: document.querySelectorAll('.cm-vim-panel input').length,
                display: input ? getComputedStyle(input).display : 'missing',
            };
        });
        await expect(state.count).toBe(1);
        await expect(state.display).not.toBe('none');
    });
});
