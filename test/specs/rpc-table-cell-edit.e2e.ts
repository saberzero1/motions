import { browser, expect } from '@wdio/globals';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    ensureLivePreview,
    getEditorValue,
    getNotices,
    loadSingleFileWorkspace,
    setupEditor,
} from '../helpers';
import { requireRpcPrerequisites } from './rpc-prerequisites';

/**
 * TEMPORARY measurement for the issue-#167 redesign: what RPC actually does
 * when Obsidian's per-cell table editor is open.
 *
 * `rpc-table-nav.e2e.ts` deliberately stops at the nav overlay and never
 * opens a cell editor, so this is unmeasured territory. It matters because
 * RPC installs its keydown capture listener on the PARENT Markdown
 * `contentDOM`, which encloses the table widget and therefore encloses the
 * cell editor's DOM -- while `NeovimDocumentSync` mirrors only the parent
 * EditorView and never sees the cell editor at all.
 *
 * Every reading is taken from Neovim itself or from the Obsidian document,
 * never from a plugin flag about its own state.
 */

const TEST_CONFIG_PATH = resolve('test/fixtures/nvim/init.lua');
const OUT_DIR = resolve('.omo/table-probe');

const TABLE_DOC = [
    'Line above',
    '',
    '| Name | Value |',
    '|------|-------|',
    '| aa   | 11    |',
    '',
    'Line below',
].join('\n');

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

const results: Record<string, unknown> = {};

function record(name: string, data: unknown): void {
    results[name] = data;
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(
        resolve(OUT_DIR, 'rpc-cell-edit.json'),
        JSON.stringify(results, null, 2),
        'utf8',
    );
}

async function setRpcEnabled(enabled: boolean): Promise<void> {
    await browser.executeObsidian(
        async ({ app }, nextEnabled: boolean, configPath: string) => {
            const plugin = (
                app as unknown as {
                    plugins: { plugins: Record<string, RpcPlugin> };
                }
            ).plugins.plugins['vim-motions'];
            if (!plugin) throw new Error('Vim Motions is not loaded');
            plugin.settings.neovimBinaryPath = '';
            plugin.settings.neovimConfigPath = configPath;
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
            timeout: 15000,
            interval: 100,
        });
    } catch {
        throw new Error(
            `Neovim RPC did not connect: ${(await getNotices()).join(' | ')}`,
        );
    }
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

async function neovimLines(): Promise<string[]> {
    return (await request('nvim_buf_get_lines', [0, 0, -1, true])) as string[];
}

/**
 * Ask Neovim a trivial question with the deadline INSIDE the page.
 *
 * A hung RPC request otherwise fails the whole spec with a WebDriver script
 * timeout and records nothing, which is how the first run of this file lost
 * its third measurement.
 */
async function rpcResponds(): Promise<{
    responded: boolean;
    mode: string | null;
    detail: string | null;
}> {
    return (await browser.executeObsidian(async ({ app }) => {
        const plugin = (
            app as unknown as {
                plugins: { plugins: Record<string, RpcPlugin> };
            }
        ).plugins.plugins['vim-motions'];
        if (!plugin)
            return { responded: false, mode: null, detail: 'no plugin' };
        let timer: number | undefined;
        const deadline = new Promise<'timeout'>((resolve) => {
            timer = window.setTimeout(() => resolve('timeout'), 3000);
        });
        try {
            const answer = await Promise.race([
                plugin
                    .requestNeovim('nvim_get_mode', [])
                    .then((m) => ({ ok: true as const, m })),
                deadline,
            ]);
            if (answer === 'timeout')
                return { responded: false, mode: null, detail: 'timeout' };
            const modeValue = (answer.m as { mode?: string } | null)?.mode;
            return {
                responded: true,
                mode: modeValue ?? null,
                detail: null,
            };
        } catch (e) {
            return { responded: false, mode: null, detail: String(e) };
        } finally {
            if (timer !== undefined) window.clearTimeout(timer);
        }
    })) as { responded: boolean; mode: string | null; detail: string | null };
}

/** Like `rpcResponds`, but with a caller-chosen deadline and elapsed time. */
async function rpcRespondsWithin(deadlineMs: number): Promise<{
    responded: boolean;
    mode: string | null;
    elapsedMs: number;
    deadlineMs: number;
}> {
    return (await browser.executeObsidian(async ({ app }, budget: number) => {
        const plugin = (
            app as unknown as {
                plugins: { plugins: Record<string, RpcPlugin> };
            }
        ).plugins.plugins['vim-motions'];
        const started = Date.now();
        if (!plugin)
            return {
                responded: false,
                mode: null,
                elapsedMs: 0,
                deadlineMs: budget,
            };
        let timer: number | undefined;
        const deadline = new Promise<'timeout'>((r) => {
            timer = window.setTimeout(() => r('timeout'), budget);
        });
        try {
            const answer = await Promise.race([
                plugin
                    .requestNeovim('nvim_get_mode', [])
                    .then((m) => ({ ok: true as const, m })),
                deadline,
            ]);
            const elapsedMs = Date.now() - started;
            if (answer === 'timeout')
                return {
                    responded: false,
                    mode: null,
                    elapsedMs,
                    deadlineMs: budget,
                };
            return {
                responded: true,
                mode: (answer.m as { mode?: string } | null)?.mode ?? null,
                elapsedMs,
                deadlineMs: budget,
            };
        } catch {
            return {
                responded: false,
                mode: null,
                elapsedMs: Date.now() - started,
                deadlineMs: budget,
            };
        } finally {
            if (timer !== undefined) window.clearTimeout(timer);
        }
    }, deadlineMs)) as {
        responded: boolean;
        mode: string | null;
        elapsedMs: number;
        deadlineMs: number;
    };
}

interface CellSnapshot {
    cellEditorOpen: boolean;
    cellDocText: string | null;
    navModeActive: boolean;
    nestedEditorCount: number;
}

async function cellSnapshot(): Promise<CellSnapshot> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        const editMode = (view as unknown as { editMode?: unknown })
            ?.editMode as Record<string, unknown> | undefined;
        const tableCell = editMode?.tableCell as
            | { cm?: { state?: { doc?: { toString(): string } } } }
            | null
            | undefined;
        return {
            cellEditorOpen: tableCell != null,
            cellDocText: tableCell?.cm?.state?.doc?.toString() ?? null,
            navModeActive:
                document.querySelector('.vim-motions-table-nav-mode') !== null,
            nestedEditorCount: document.querySelectorAll(
                '.cm-table-widget .cm-editor',
            ).length,
        };
    })) as CellSnapshot;
}

describe('Neovim RPC with a table cell editor open (issue #167)', function () {
    before(function () {
        requireRpcPrerequisites(this);
    });

    this.timeout(240000);

    beforeEach(async () => {
        await setRpcEnabled(false);
        await loadSingleFileWorkspace();
        await ensureLivePreview();
        await setupEditor(TABLE_DOC, { line: 0, ch: 0 });
        await setRpcEnabled(true);
        await waitForConnected();
        await browser.pause(600);
    });

    after(async () => {
        await setRpcEnabled(false);
    });

    it('positive control: a key outside the table reaches Neovim', async () => {
        const before = (await request('nvim_win_get_cursor', [0])) as number[];
        await browser.keys(['j']);
        await browser.pause(400);
        const after = (await request('nvim_win_get_cursor', [0])) as number[];
        record('control', { before, after });

        // Without this, every later "Neovim did not change" reading could
        // simply mean the probe was never live.
        expect(after[0]).not.toBe(before[0]);
    });

    it('measures where typed text goes while a cell editor is open', async () => {
        // Reach the table the way a user does, then open a cell editor
        // through the nav overlay.
        await browser.keys(['j', 'j']);
        await browser.pause(500);
        const enteredNav = await cellSnapshot();

        await browser.keys(['i']);
        await browser.pause(700);
        const afterI = await cellSnapshot();

        const docBeforeType = await getEditorValue();
        const nvimBeforeType = await neovimLines();

        await browser.keys(['Q', 'W']);
        await browser.pause(700);

        const afterType = await cellSnapshot();
        const docAfterType = await getEditorValue();
        const nvimAfterType = await neovimLines();

        record('cell-typing', {
            enteredNav,
            afterI,
            docBeforeType,
            nvimBeforeType,
            afterType,
            docAfterType,
            nvimAfterType,
            obsidianDocChanged: docAfterType !== docBeforeType,
            neovimChanged:
                nvimAfterType.join('\n') !== nvimBeforeType.join('\n'),
            agree: docAfterType === nvimAfterType.join('\n'),
        });

        // The premise of the measurement: Neovim and Obsidian agreed before
        // anything was typed. If they already disagreed, divergence after
        // typing would prove nothing about cell editing.
        expect(nvimBeforeType.join('\n')).toBe(docBeforeType);
    });

    it('measures whether the RPC pipeline still responds after a cell edit', async () => {
        const healthBefore = await rpcResponds();

        await browser.keys(['j', 'j']);
        await browser.pause(500);
        const healthInNav = await rpcResponds();

        await browser.keys(['i']);
        await browser.pause(700);
        const healthInCell = await rpcResponds();

        await browser.keys(['Z']);
        await browser.pause(700);
        const healthAfterKey = await rpcResponds();

        await browser.keys(['Escape']);
        await browser.pause(400);
        await browser.keys(['Escape']);
        await browser.pause(700);
        const healthAfterExit = await rpcResponds();

        record('pipeline-health', {
            healthBefore,
            healthInNav,
            healthInCell,
            healthAfterKey,
            healthAfterExit,
        });

        // Positive control in the same run: the pipeline answered before the
        // table was ever entered, so a later non-answer is the table's doing
        // and not a connection that was never alive.
        expect(healthBefore.responded).toBe(true);
    });

    it('measures whether the pipeline RECOVERS, with a deadline past the 30s RPC timeout', async () => {
        const healthBefore = await rpcResponds();

        await browser.keys(['j', 'j']);
        await browser.pause(500);
        await browser.keys(['i']);
        await browser.pause(700);
        await browser.keys(['Z']);
        await browser.pause(500);

        const shortProbe = await rpcResponds();
        const longProbe = await rpcRespondsWithin(45000);

        const doc = await getEditorValue();

        record('recovery', {
            healthBefore,
            shortProbe,
            longProbe,
            doc,
            recoveredEventually: longProbe.responded,
            elapsedMs: longProbe.elapsedMs,
        });

        // `MsgpackRpcClient` uses REQUEST_TIMEOUT_MS = 30000, so a 3s probe
        // cannot tell a permanent wedge from a pending request. This scenario
        // exists to retire that ambiguity, so the long probe must have been
        // given more than 30s to answer in.
        expect(healthBefore.responded).toBe(true);
        expect(longProbe.deadlineMs).toBeGreaterThan(30000);
    });
});
