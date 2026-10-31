import { browser, expect } from '@wdio/globals';
import { resolve } from 'node:path';
import { getNotices, loadTwoFileWorkspace } from '../helpers';
import { requireRpcPrerequisites } from './rpc-prerequisites';

/**
 * The RPC backend mirrors every note into ONE Neovim buffer, created once in
 * NeovimDocumentSync.start() and renamed + reseeded on each activation. Undo
 * history is a property of that buffer, not of the note, so without an
 * explicit reset the history of every previously-open note stays reachable
 * from the next one.
 *
 * These assertions read the vault adapter as well as the editor, because the
 * failure mode is data loss: line events mirror Neovim into CM6, and Obsidian
 * autosaves what CM6 holds.
 */

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

const TEST_CONFIG_PATH = resolve('test/fixtures/nvim/init.lua');
const FIRST_FILE = 'Welcome.md';
const SECOND_FILE = 'Target.md';
const FIRST_BODY = ['AAAA alpha', 'AAAA beta'].join('\n');
const SECOND_BODY = ['BBBB gamma', 'BBBB delta'].join('\n');

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

async function execLua(chunk: string, args: unknown[] = []): Promise<unknown> {
    return pluginRequest('nvim_exec_lua', [chunk, args]);
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

async function activateFile(path: string): Promise<void> {
    await browser.executeObsidian(async ({ app, obsidian }, target: string) => {
        let found: import('obsidian').WorkspaceLeaf | null = null;
        app.workspace.iterateAllLeaves((leaf) => {
            const view = leaf.view;
            if (
                view instanceof obsidian.MarkdownView &&
                view.file?.path === target
            )
                found = leaf;
        });
        if (!found) throw new Error(`No open leaf for ${target}`);
        app.workspace.setActiveLeaf(found, { focus: true });
        await Promise.resolve();
    }, path);
    // Activation is what renames and reseeds the mirror buffer; waiting on the
    // buffer name is what proves it completed rather than guessing with a pause.
    await browser.waitUntil(
        async () =>
            String(await pluginRequest('nvim_buf_get_name', [0])).endsWith(
                path,
            ),
        {
            timeout: 10000,
            interval: 50,
            timeoutMsg: `the mirror buffer to be renamed to ${path}`,
        },
    );
}

async function setActiveBody(body: string): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }, text: string) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) throw new Error('No active MarkdownView');
        view.editor.setValue(text);
        view.editor.setCursor({ line: 0, ch: 0 });
    }, body);
    await browser.waitUntil(async () => (await activeBody()) === body, {
        timeout: 5000,
        interval: 50,
        timeoutMsg: 'editor to accept the fixture body',
    });
}

async function activeBody(): Promise<string> {
    return browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) throw new Error('No active MarkdownView');
        return view.editor.getValue();
    });
}

async function diskBody(path: string): Promise<string> {
    return browser.executeObsidian(
        async ({ app }, target: string) => app.vault.adapter.read(target),
        path,
    );
}

async function neovimBody(): Promise<string> {
    return (await execLua(
        'return table.concat(vim.api.nvim_buf_get_lines(0, 0, -1, false), "\\n")',
    )) as string;
}

describe('Neovim RPC undo isolation between notes', function () {
    this.timeout(180000);
    let spawnedPid: number | null = null;

    before(async function () {
        requireRpcPrerequisites(this);
        await loadTwoFileWorkspace(FIRST_FILE, SECOND_FILE, 'first');
        await setRpcEnabled(true);
        spawnedPid = (await waitForConnected()).pid;
    });

    beforeEach(async () => {
        await activateFile(FIRST_FILE);
        await setActiveBody(FIRST_BODY);
        await activateFile(SECOND_FILE);
        await setActiveBody(SECOND_BODY);
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

    it('starts a freshly activated note with no reachable undo history', async () => {
        await activateFile(FIRST_FILE);
        await activateFile(SECOND_FILE);
        // Reachable history is the entries. seq_last and seq_cur are the
        // highest numbers ever used, which a reseed at undolevels = -1 does
        // not reset: once beforeEach's edits reached Neovim as host edits,
        // they read 2 with no entry left to undo to.
        const undo = (await execLua(
            'local t = vim.fn.undotree() return { entries = #t.entries }',
        )) as { entries: number };
        await expect(undo.entries).toBe(0);
    });

    it('does not empty the note when undo is pressed right after activation', async () => {
        await activateFile(FIRST_FILE);
        await activateFile(SECOND_FILE);
        await execLua(
            'vim.api.nvim_feedkeys(vim.api.nvim_replace_termcodes("uuu", true, false, true), "x", false)',
        );
        await expect(await neovimBody()).toBe(SECOND_BODY);
        await browser.waitUntil(
            async () => (await activeBody()) === SECOND_BODY,
            {
                timeout: 5000,
                interval: 50,
                timeoutMsg: 'CM6 to still hold the second note after undo',
            },
        );
        await expect(await activeBody()).toBe(SECOND_BODY);
    });

    it('never surfaces the previous note text after switching and undoing', async () => {
        await activateFile(FIRST_FILE);
        await execLua(
            'vim.api.nvim_feedkeys(vim.api.nvim_replace_termcodes("oAAAA-typed-edit<Esc>", true, false, true), "x", false)',
        );
        await browser.waitUntil(
            async () => (await activeBody()).includes('AAAA-typed-edit'),
            {
                timeout: 5000,
                interval: 50,
                timeoutMsg: 'the first note to record a typed edit',
            },
        );
        await activateFile(SECOND_FILE);
        await execLua(
            'vim.api.nvim_feedkeys(vim.api.nvim_replace_termcodes("uuuuuu", true, false, true), "x", false)',
        );
        await execLua(
            'vim.api.nvim_feedkeys(vim.api.nvim_replace_termcodes("g-g-g-g-", true, false, true), "x", false)',
        );
        const body = await neovimBody();
        await expect(body).not.toContain('AAAA');
        await expect(body).not.toContain('AAAA-typed-edit');
        await expect(body).toBe(SECOND_BODY);
    });

    it('leaves the second note intact on disk after an undo burst', async () => {
        await activateFile(FIRST_FILE);
        await activateFile(SECOND_FILE);
        await execLua(
            'vim.api.nvim_feedkeys(vim.api.nvim_replace_termcodes("uuu", true, false, true), "x", false)',
        );
        await pluginRequest('nvim_command', ['write']);
        await browser.waitUntil(
            async () => (await diskBody(SECOND_FILE)) === SECOND_BODY,
            {
                timeout: 10000,
                interval: 100,
                timeoutMsg: 'the second note to remain intact on disk',
            },
        );
        await expect(await diskBody(SECOND_FILE)).toBe(SECOND_BODY);
    });

    it('still undoes an edit made within the current note', async () => {
        await execLua(
            'vim.api.nvim_feedkeys(vim.api.nvim_replace_termcodes("oBBBB-local-edit<Esc>", true, false, true), "x", false)',
        );
        await browser.waitUntil(
            async () => (await neovimBody()).includes('BBBB-local-edit'),
            {
                timeout: 5000,
                interval: 50,
                timeoutMsg: 'the local edit to land in the mirror buffer',
            },
        );
        await execLua(
            'vim.api.nvim_feedkeys(vim.api.nvim_replace_termcodes("u", true, false, true), "x", false)',
        );
        // Clearing history at activation must not disable ordinary undo.
        await expect(await neovimBody()).toBe(SECOND_BODY);
    });
});
