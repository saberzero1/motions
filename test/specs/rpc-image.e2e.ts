import { browser, expect } from '@wdio/globals';
import { resolve } from 'node:path';
import {
    ensureLivePreview,
    getNotices,
    loadSingleFileWorkspace,
    setupEditor,
} from '../helpers';
import { requireRpcPrerequisites } from './rpc-prerequisites';
import { killIfAlive } from './rpc-process';

// :image under the Neovim backend (#218). Obsidian resizes the image in the
// editor, and the edit has to reach Neovim's buffer too: synchronisation
// otherwise runs only from Neovim to the editor, so the buffer kept the old
// text and its next line event would have overwritten the resize.

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

const IMAGE = 'rpc-image-pic.png';
const EMBED = `![[${IMAGE}]]`;
const DOC = `alpha\n${EMBED}\nomega`;
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

async function waitForConnected(): Promise<void> {
    try {
        await browser.waitUntil(async () => (await getRpcState()).connected, {
            timeout: 10000,
            interval: 100,
        });
    } catch {
        throw new Error(
            `Neovim RPC did not connect: ${(await getNotices()).join(' | ')}`,
        );
    }
    const pid = (await getRpcState()).pid;
    if (pid !== null) spawnedPids.add(pid);
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

/** Neovim's line 2 and the editor's, which must agree. */
async function embedLines(): Promise<{ neovim: string; editor: string }> {
    const lines = (await request('nvim_buf_get_lines', [
        0,
        0,
        -1,
        true,
    ])) as string[];
    const editor = (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        return view?.editor.getLine(1) ?? '';
    })) as string;
    return { neovim: lines[1] ?? '', editor };
}

async function waitForEmbed(line: string): Promise<void> {
    await browser
        .waitUntil(
            async () => {
                const lines = await embedLines();
                return lines.neovim === line && lines.editor === line;
            },
            { timeout: 5000, interval: 100 },
        )
        .catch(() => undefined);
}

describe('Neovim RPC :image', function () {
    before(async function () {
        requireRpcPrerequisites(this);
        await browser.executeObsidian(async ({ app }, path: string) => {
            if (app.vault.getAbstractFileByPath(path)) return;
            const canvas = document.createElement('canvas');
            canvas.width = 300;
            canvas.height = 150;
            const context = canvas.getContext('2d');
            if (context) {
                context.fillStyle = '#36c';
                context.fillRect(0, 0, 300, 150);
            }
            const blob = await new Promise<Blob | null>((done) =>
                canvas.toBlob(done, 'image/png'),
            );
            if (!blob) throw new Error('Could not draw the test image');
            await app.vault.createBinary(path, await blob.arrayBuffer());
        }, IMAGE);
    });

    this.timeout(180000);

    beforeEach(async () => {
        await loadSingleFileWorkspace();
        await setupEditor(DOC, { line: 0, ch: 0 });
        await ensureLivePreview();
        await browser.executeObsidian(({ app }) => {
            (
                app.vault as unknown as {
                    setConfig(key: string, value: unknown): void;
                }
            ).setConfig('propertiesInDocument', 'source');
        });
        await setRpcEnabled(false);
        await setRpcEnabled(true);
        await waitForConnected();
        await browser.waitUntil(
            async () =>
                (
                    (await request('nvim_buf_get_lines', [0, 0, -1, true])) as
                        string[] | null
                )?.[1] === EMBED,
            { timeout: 5000, interval: 100 },
        );
        await request('nvim_win_set_cursor', [0, [2, 0]]);
    });

    afterEach(async () => {
        await setRpcEnabled(false);
        for (const pid of spawnedPids) {
            killIfAlive(pid);
            spawnedPids.delete(pid);
        }
    });

    it('resizes the image under the cursor in the editor and in Neovim', async () => {
        await request('nvim_input', [':image grow<CR>']);
        await waitForEmbed(`![[${IMAGE}|325]]`);
        expect(await embedLines()).toEqual({
            neovim: `![[${IMAGE}|325]]`,
            editor: `![[${IMAGE}|325]]`,
        });
    });

    it('takes a count as an argument, which Neovim forwards', async () => {
        await request('nvim_input', [':image grow 2<CR>']);
        await waitForEmbed(`![[${IMAGE}|350]]`);
        expect(await embedLines()).toEqual({
            neovim: `![[${IMAGE}|350]]`,
            editor: `![[${IMAGE}|350]]`,
        });
    });

    it('is one step in Neovim undo history', async () => {
        await request('nvim_input', [':image grow<CR>']);
        await waitForEmbed(`![[${IMAGE}|325]]`);
        const grown = await embedLines();
        await request('nvim_input', ['u']);
        await waitForEmbed(EMBED);
        expect({ grown, undone: await embedLines() }).toEqual({
            grown: {
                neovim: `![[${IMAGE}|325]]`,
                editor: `![[${IMAGE}|325]]`,
            },
            undone: { neovim: EMBED, editor: EMBED },
        });
    });

    it('survives a later Neovim edit on the same line', async () => {
        await request('nvim_input', [':image grow<CR>']);
        await waitForEmbed(`![[${IMAGE}|325]]`);
        await request('nvim_input', ['A!<Esc>']);
        await waitForEmbed(`![[${IMAGE}|325]]!`);
        expect({
            lines: await embedLines(),
            notices: (await getNotices()).filter((notice) =>
                notice.includes('synchronisation failed'),
            ),
        }).toEqual({
            lines: {
                neovim: `![[${IMAGE}|325]]!`,
                editor: `![[${IMAGE}|325]]!`,
            },
            notices: [],
        });
    });
});
