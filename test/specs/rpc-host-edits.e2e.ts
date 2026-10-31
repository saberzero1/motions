import { browser, expect } from '@wdio/globals';
import { resolve } from 'node:path';
import { ensureLivePreview, getNotices } from '../helpers';
import { requireRpcPrerequisites } from './rpc-prerequisites';
import { killIfAlive } from './rpc-process';

// Edits Obsidian makes to the editor under the Neovim backend. Sync used to
// run only from Neovim's line events into the editor, so such an edit never
// reached Neovim's buffer, and Neovim's next change to the line was applied
// against the old text. Each scenario makes one kind of host edit and checks
// that both sides hold the same note afterwards.

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

const NOTE = 'rpc-host-edits.md';
const spawnedPids = new Set<number>();
const TEST_CONFIG_PATH = resolve('test/fixtures/nvim/init.lua');

async function setRpcEnabled(enabled: boolean): Promise<void> {
    await browser.executeObsidian(
        async ({ app }, nextEnabled: boolean, nextConfigPath: string) => {
            const plugin = (
                app as unknown as {
                    plugins: { plugins: Record<string, RpcPlugin> };
                }
            ).plugins.plugins['vim-motions'];
            if (!plugin) throw new Error('Vim Motions is not loaded');
            plugin.settings.neovimBinaryPath = '';
            plugin.settings.neovimConfigPath = nextConfigPath;
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

/** The whole note on each side, which must agree. */
async function bothSides(): Promise<{ neovim: string; editor: string }> {
    const lines = (await request('nvim_buf_get_lines', [
        0,
        0,
        -1,
        true,
    ])) as string[];
    const editor = (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        return view?.editor.getValue() ?? '';
    })) as string;
    return { neovim: lines.join('\n'), editor };
}

async function waitForBoth(text: string): Promise<void> {
    await browser
        .waitUntil(
            async () => {
                const sides = await bothSides();
                return sides.neovim === text && sides.editor === text;
            },
            { timeout: 5000, interval: 100 },
        )
        .catch(() => undefined);
}

async function syncFailures(): Promise<string[]> {
    return (await getNotices()).filter((notice) =>
        notice.includes('synchronisation failed'),
    );
}

/**
 * Delays every `method` request the plugin sends by `ms`, or restores the
 * client for 0. The document sync and the connection share the client.
 */
async function delayRequests(method: string, ms: number): Promise<void> {
    await browser.executeObsidian(
        ({ app }, name: string, delay: number) => {
            type Client = {
                request(method: string, args: unknown[]): Promise<unknown>;
                vimMotionsRequest?: Client['request'];
            };
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<
                            string,
                            { neovimConnection?: { rpc?: Client | null } }
                        >;
                    };
                }
            ).plugins.plugins['vim-motions'];
            const rpc = plugin?.neovimConnection?.rpc;
            if (!rpc) throw new Error('no Neovim client');
            rpc.vimMotionsRequest ??= rpc.request.bind(rpc);
            const real = rpc.vimMotionsRequest;
            if (delay === 0) {
                rpc.request = real;
                delete rpc.vimMotionsRequest;
                return;
            }
            rpc.request = async (requested, args) => {
                if (requested === name) {
                    await new Promise((resolve) =>
                        window.setTimeout(resolve, delay),
                    );
                }
                return real(requested, args);
            };
        },
        method,
        ms,
    );
}

/**
 * Opens the note with `content`, connects, and waits for Neovim to hold it.
 * The content is set in the editor and saved while disconnected: writing the
 * file alone raced the previous scenario's unsaved editor, which saved over it.
 */
async function openConnected(content: string): Promise<void> {
    await setRpcEnabled(false);
    await browser.executeObsidian(
        async ({ app, obsidian }, path: string, text: string) => {
            const file =
                app.vault.getFileByPath(path) ??
                (await app.vault.create(path, text));
            await app.workspace.getLeaf(false).openFile(file);
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) throw new Error(`${path} did not open`);
            view.editor.setValue(text);
            await view.save();
        },
        NOTE,
        content,
    );
    await ensureLivePreview();
    await setRpcEnabled(true);
    await browser.waitUntil(async () => (await getRpcState()).connected, {
        timeout: 10000,
        interval: 100,
        timeoutMsg: 'Neovim RPC did not connect',
    });
    const pid = (await getRpcState()).pid;
    if (pid !== null) spawnedPids.add(pid);
    await waitForBoth(content);
    const sides = await bothSides();
    if (sides.neovim !== content || sides.editor !== content)
        throw new Error(
            `Setup did not seed the note: ${JSON.stringify(sides)}`,
        );
    await request('nvim_win_set_cursor', [0, [1, 0]]);
}

describe('Neovim RPC host edits', function () {
    before(function () {
        requireRpcPrerequisites(this);
    });

    this.timeout(180000);

    beforeEach(async () => {
        await browser.executeObsidian(({ app }) => {
            (
                app.vault as unknown as {
                    setConfig(key: string, value: unknown): void;
                }
            ).setConfig('propertiesInDocument', 'source');
        });
    });

    afterEach(async () => {
        await setRpcEnabled(false);
        for (const pid of spawnedPids) {
            killIfAlive(pid);
            spawnedPids.delete(pid);
        }
    });

    it('sends an Obsidian command run with :ob on to Neovim', async () => {
        await openConnected('alpha beta');
        await request('nvim_input', [':ob editor:toggle-bold<CR>']);
        await waitForBoth('**alpha** beta');
        expect(await bothSides()).toEqual({
            neovim: '**alpha** beta',
            editor: '**alpha** beta',
        });
    });

    it('sends a checkbox ticked in the editor on to Neovim', async () => {
        await openConnected('- [ ] task\nafter');
        // Off the task line, which Live Preview shows as source. The API
        // call does not move the editor's cursor, so both are moved.
        await request('nvim_win_set_cursor', [0, [2, 0]]);
        await browser.executeObsidian(({ app, obsidian }) => {
            app.workspace
                .getActiveViewOfType(obsidian.MarkdownView)
                ?.editor.setCursor({ line: 1, ch: 0 });
        });
        await browser.waitUntil(
            async () =>
                (await browser.executeObsidian(({ app, obsidian }) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    return !!view?.containerEl.querySelector(
                        '.cm-content .task-list-item-checkbox',
                    );
                })) as boolean,
            { timeout: 5000, interval: 100 },
        );
        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            const box = view?.containerEl.querySelector<HTMLInputElement>(
                '.cm-content .task-list-item-checkbox',
            );
            if (!box) throw new Error('No checkbox rendered');
            box.click();
        });
        await waitForBoth('- [x] task\nafter');
        expect(await bothSides()).toEqual({
            neovim: '- [x] task\nafter',
            editor: '- [x] task\nafter',
        });
    });

    it('sends an edit made through the editor API on to Neovim', async () => {
        await openConnected('alpha beta\nsecond');
        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            view?.editor.replaceRange('NEW ', { line: 0, ch: 0 });
        });
        await waitForBoth('NEW alpha beta\nsecond');
        expect(await bothSides()).toEqual({
            neovim: 'NEW alpha beta\nsecond',
            editor: 'NEW alpha beta\nsecond',
        });
    });

    it('sends a change made to the file outside the editor on to Neovim', async () => {
        await openConnected('alpha beta\nsecond');
        await browser.executeObsidian(async ({ app }, path: string) => {
            const file = app.vault.getFileByPath(path);
            if (file) await app.vault.modify(file, 'alpha beta\nchanged');
        }, NOTE);
        await waitForBoth('alpha beta\nchanged');
        expect(await bothSides()).toEqual({
            neovim: 'alpha beta\nchanged',
            editor: 'alpha beta\nchanged',
        });
    });

    it('keeps a host edit when Neovim then edits the same line', async () => {
        await openConnected('alpha beta');
        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            view?.editor.replaceRange('NEW ', { line: 0, ch: 0 });
        });
        await waitForBoth('NEW alpha beta');
        await request('nvim_input', ['A!<Esc>']);
        await waitForBoth('NEW alpha beta!');
        expect({
            sides: await bothSides(),
            failures: await syncFailures(),
        }).toEqual({
            sides: { neovim: 'NEW alpha beta!', editor: 'NEW alpha beta!' },
            failures: [],
        });
    });

    it('makes a host edit one step in Neovim undo history', async () => {
        await openConnected('alpha beta');
        await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            view?.editor.replaceRange('NEW ', { line: 0, ch: 0 });
        });
        await waitForBoth('NEW alpha beta');
        const edited = await bothSides();
        await request('nvim_input', ['u']);
        await waitForBoth('alpha beta');
        expect({ edited, undone: await bothSides() }).toEqual({
            edited: { neovim: 'NEW alpha beta', editor: 'NEW alpha beta' },
            undone: { neovim: 'alpha beta', editor: 'alpha beta' },
        });
    });

    // An activation reseeds Neovim from a snapshot taken when it starts, so an
    // edit made before it finishes is sent once it has. `:e` activates the
    // note again; delaying one of its requests holds the activation open.
    it('sends a host edit made while the note is being activated', async () => {
        await openConnected('alpha beta');
        await delayRequests('nvim_buf_set_name', 600);
        try {
            await request('nvim_input', [':e<CR>']);
            await browser.pause(200);
            await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                view?.editor.replaceRange('NEW ', { line: 0, ch: 0 });
            });
        } finally {
            await delayRequests('nvim_buf_set_name', 0);
        }
        await waitForBoth('NEW alpha beta');
        expect(await bothSides()).toEqual({
            neovim: 'NEW alpha beta',
            editor: 'NEW alpha beta',
        });
    });
});
