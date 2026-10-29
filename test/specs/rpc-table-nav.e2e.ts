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

// `canActivate()` gates the table-nav overlay on `forkAvailable`, which is
// `!isBuiltinVimEnabled(app)` -- that Obsidian's own vim is off, not that the
// bundled engine is the one driving keys. Under RPC it is therefore true, so
// the overlay activates while Neovim also owns every keystroke. These
// scenarios measure what that combination actually does.

interface RpcState {
    connected: boolean;
    pid: number | null;
}

interface RpcPlugin {
    settings: {
        neovimRpcEnabled: boolean;
        neovimBinaryPath: string;
        neovimConfigPath: string;
        enableTableNav: boolean;
        tableWidgetMode: 'native' | 'raw';
    };
    saveSettings(): Promise<void>;
    reloadFeatures(): void;
    getNeovimConnectionState(): RpcState;
    requestNeovim(method: string, args: unknown[]): Promise<unknown>;
}

const spawnedPids = new Set<number>();
const TEST_CONFIG_PATH = resolve('test/fixtures/nvim/init.lua');
const TABLE_DOC =
    'Line above\n\n| AA | BB |\n|-----|-----|\n| cc | dd |\n\nLine below';

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

async function navModeActive(): Promise<boolean> {
    return (await browser.executeObsidian(
        () => document.querySelector('.vim-motions-table-nav-mode') !== null,
    )) as boolean;
}

async function highlightedCell(): Promise<{
    row: number;
    col: number;
} | null> {
    return (await browser.executeObsidian(() => {
        const active = document.querySelector(
            '.vim-motions-table-nav-active',
        ) as HTMLElement | null;
        if (!active) return null;
        const cellEl = (active.closest('td, th') ??
            active) as HTMLTableCellElement;
        const rowEl = cellEl.closest('tr');
        const tableEl = rowEl?.closest('table');
        if (!rowEl || !tableEl) return null;
        return {
            row: Array.from(tableEl.rows).indexOf(rowEl),
            col: cellEl.cellIndex ?? 0,
        };
    })) as { row: number; col: number } | null;
}

async function neovimCursorRow(): Promise<number> {
    const cursor = (await request('nvim_win_get_cursor', [0])) as number[];
    return cursor[0] ?? -1;
}

async function neovimLines(): Promise<string[]> {
    return (await request('nvim_buf_get_lines', [0, 0, -1, true])) as string[];
}

describe('Neovim RPC table navigation', function () {
    before(function () {
        requireRpcPrerequisites(this);
    });

    this.timeout(180000);

    beforeEach(async () => {
        await setRpcEnabled(false);
        await loadSingleFileWorkspace();
        await ensureLivePreview();
        await setupEditor(TABLE_DOC, { line: 0, ch: 0 });
        await setRpcEnabled(true);
        await waitForConnected();
    });

    afterEach(async () => {
        await setRpcEnabled(false);
        for (const pid of spawnedPids) {
            killIfAlive(pid);
            spawnedPids.delete(pid);
        }
    });

    // Positive control for the two absence assertions below: the same probe
    // must report movement when a key really does reach Neovim, otherwise
    // "Neovim did not move" would hold for any implementation.
    it('moves the Neovim cursor for the same key outside the table', async () => {
        const rowBefore = await neovimCursorRow();
        expect(await navModeActive()).toBe(false);
        await browser.keys(['j']);
        await browser.pause(600);
        expect(await neovimCursorRow()).toBeGreaterThan(rowBefore);
    });

    it('does not let one key drive both the table overlay and Neovim', async () => {
        await browser.keys(['j', 'j']);
        await browser.pause(600);

        const entered = await navModeActive();
        const rowBefore = await neovimCursorRow();
        const linesBefore = await neovimLines();
        const cellBefore = await highlightedCell();

        await browser.keys(['l']);
        await browser.pause(600);

        const rowAfter = await neovimCursorRow();
        const linesAfter = await neovimLines();
        const cellAfter = await highlightedCell();

        expect({
            entered,
            navigated:
                cellBefore !== null &&
                cellAfter !== null &&
                cellAfter.col === cellBefore.col + 1,
            neovimCursorMoved: rowAfter !== rowBefore,
            textChanged: linesBefore.join('\n') !== linesAfter.join('\n'),
        }).toEqual({
            entered: true,
            navigated: true,
            neovimCursorMoved: false,
            textChanged: false,
        });
    });
});
