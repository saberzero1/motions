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
 * PLAN A STEP 1 — diagnosis of A1.
 *
 * The defect as first measured: with Obsidian's table cell editor open, one
 * character key stops the RPC pipeline answering. The mechanism was never
 * identified, and the first write-up blamed a `prepareKeyInput()` chain that
 * source refutes.
 *
 * Reading the code produced a different hypothesis that the original probe
 * cannot exclude, because it never ran the matching control: the keys that
 * probe pressed were `Q` and `Z`. In Neovim `Q` enters **Ex mode** and `Z` is
 * an **incomplete prefix** (`ZZ`/`ZQ`), so both legitimately leave Neovim
 * waiting for more input. `nvim_get_mode` is a fast API and answers while
 * Neovim is blocked, but `nvim_win_get_cursor` -- which `syncState` awaits
 * immediately afterwards (`src/rpc/key-delegation.ts:216`) -- is not.
 *
 * This spec separates the two explanations by crossing one factor against the
 * other:
 *
 *            | benign key (`x`) | blocking key (`Q`)
 *   ---------+------------------+--------------------
 *   outside  |      B1          |        B2
 *   in cell  |      B3          |        B4
 *
 * If B2 wedges, the defect is not table-specific and A1 is misframed.
 * If B3 is healthy and B4 wedges, the trigger is the key, not the cell editor.
 * If B3 wedges, the cell editor is implicated on its own.
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
        resolve(OUT_DIR, 'a1-diagnosis.json'),
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

async function waitForConnected(): Promise<void> {
    try {
        await browser.waitUntil(
            async () =>
                (
                    (await browser.executeObsidian(({ app }) => {
                        const plugin = (
                            app as unknown as {
                                plugins: {
                                    plugins: Record<string, RpcPlugin>;
                                };
                            }
                        ).plugins.plugins['vim-motions'];
                        return plugin?.getNeovimConnectionState();
                    })) as RpcState
                )?.connected === true,
            { timeout: 15000, interval: 100 },
        );
    } catch {
        throw new Error(
            `Neovim RPC did not connect: ${(await getNotices()).join(' | ')}`,
        );
    }
}

/**
 * Probe both a FAST and a non-fast Neovim API, with the deadline in-page.
 *
 * `nvim_get_mode` answers while Neovim is blocked; `nvim_win_get_cursor` does
 * not. Divergence between the two is the signature of "Neovim is waiting for
 * input" as opposed to "the transport is broken".
 */
async function probe(deadlineMs: number): Promise<{
    fastResponded: boolean;
    fastMode: string | null;
    fastBlocking: boolean | null;
    slowResponded: boolean;
    elapsedMs: number;
}> {
    return (await browser.executeObsidian(async ({ app }, budget: number) => {
        const plugin = (
            app as unknown as {
                plugins: { plugins: Record<string, RpcPlugin> };
            }
        ).plugins.plugins['vim-motions'];
        const started = Date.now();
        const blank = {
            fastResponded: false,
            fastMode: null,
            fastBlocking: null,
            slowResponded: false,
            elapsedMs: 0,
        };
        if (!plugin) return blank;

        const race = async <T>(p: Promise<T>): Promise<T | 'timeout'> => {
            let timer: number | undefined;
            const deadline = new Promise<'timeout'>((r) => {
                timer = window.setTimeout(() => r('timeout'), budget);
            });
            try {
                return await Promise.race([p, deadline]);
            } finally {
                if (timer !== undefined) window.clearTimeout(timer);
            }
        };

        let fastMode: string | null = null;
        let fastBlocking: boolean | null = null;
        let fastResponded = false;
        try {
            const m = await race(plugin.requestNeovim('nvim_get_mode', []));
            if (m !== 'timeout') {
                fastResponded = true;
                const mv = m as { mode?: string; blocking?: boolean };
                fastMode = mv.mode ?? null;
                fastBlocking = mv.blocking ?? null;
            }
        } catch {
            fastResponded = false;
        }

        let slowResponded = false;
        try {
            const c = await race(
                plugin.requestNeovim('nvim_win_get_cursor', [0]),
            );
            slowResponded = c !== 'timeout';
        } catch {
            slowResponded = false;
        }

        return {
            fastResponded,
            fastMode,
            fastBlocking,
            slowResponded,
            elapsedMs: Date.now() - started,
        };
    }, deadlineMs)) as {
        fastResponded: boolean;
        fastMode: string | null;
        fastBlocking: boolean | null;
        slowResponded: boolean;
        elapsedMs: number;
    };
}

async function navModeActive(): Promise<boolean> {
    return (await browser.executeObsidian(
        () => document.querySelector('.vim-motions-table-nav-mode') !== null,
    )) as boolean;
}

async function focusIsInCellEditor(): Promise<boolean> {
    return (await browser.executeObsidian(() => {
        const active = document.activeElement;
        return (
            active instanceof Element &&
            active.closest('.cm-table-widget') !== null
        );
    })) as boolean;
}

/**
 * Measure renderer liveness and timer lag from inside the page.
 *
 * Distinguishes "the RPC transport is broken" from "the renderer thread is
 * blocked": a synchronous livelock would stop the msgpack `onData` callback
 * running, so no response could ever be processed, and every pending request
 * would appear hung for reasons that have nothing to do with Neovim.
 */
async function rendererResponsive(): Promise<{
    alive: boolean;
    timerLagMs: number;
}> {
    return (await browser.executeObsidian(async () => {
        const started = Date.now();
        await new Promise<void>((r) => window.setTimeout(r, 50));
        return { alive: true, timerLagMs: Date.now() - started - 50 };
    })) as { alive: boolean; timerLagMs: number };
}

/**
 * Read the authoritative RPC connection state.
 *
 * `isExternalBackendActive()` is set only while connected and cleared at
 * teardown (`src/rpc/neovim-connection.ts:322,367,647`), so `connected:
 * false` means the fix's guard takes the bundled-engine branch and is inert.
 */
async function externalBackendState(): Promise<{
    connected: boolean;
    pid: number | null;
}> {
    return (await browser.executeObsidian(({ app }) => {
        const plugin = (
            app as unknown as {
                plugins: { plugins: Record<string, RpcPlugin> };
            }
        ).plugins.plugins['vim-motions'];
        return (
            plugin?.getNeovimConnectionState() ?? {
                connected: false,
                pid: null,
            }
        );
    })) as { connected: boolean; pid: number | null };
}

async function cellEditorOpen(): Promise<boolean> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        const editMode = (view as unknown as { editMode?: unknown })
            ?.editMode as Record<string, unknown> | undefined;
        return editMode?.tableCell != null;
    })) as boolean;
}

/** Drive the cursor into the table so Obsidian opens its cell editor. */
async function enterCell(): Promise<boolean> {
    await browser.keys(['j', 'j']);
    await browser.pause(700);
    return cellEditorOpen();
}

describe('A1 diagnosis: what actually wedges the RPC pipeline', function () {
    before(function () {
        requireRpcPrerequisites(this);
    });

    this.timeout(300000);

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

    it('B1: benign key OUTSIDE the table', async () => {
        const before = await probe(4000);
        await browser.keys(['x']);
        await browser.pause(600);
        const after = await probe(4000);
        const doc = await getEditorValue();
        record('B1-benign-outside', { before, after, doc });

        expect(before.fastResponded).toBe(true);
        expect(before.slowResponded).toBe(true);
    });

    it('B2: CONTROL - blocking key (Q, Ex mode) OUTSIDE the table', async () => {
        const before = await probe(4000);
        await browser.keys(['Q']);
        await browser.pause(600);
        const after = await probe(4000);
        const doc = await getEditorValue();
        record('B2-blocking-outside', { before, after, doc });

        // This is the control that decides whether A1 is table-specific at
        // all. The precondition is only that the pipeline was healthy first.
        expect(before.fastResponded).toBe(true);
        expect(before.slowResponded).toBe(true);
    });

    it('B3: benign key with the CELL EDITOR open', async () => {
        const opened = await enterCell();
        const before = await probe(4000);
        await browser.keys(['x']);
        await browser.pause(600);
        const after = await probe(4000);
        const doc = await getEditorValue();
        record('B3-benign-in-cell', { opened, before, after, doc });

        // Precondition: Obsidian really did open a cell editor, otherwise
        // this scenario is a duplicate of B1.
        expect(opened).toBe(true);
        expect(before.fastResponded).toBe(true);
    });

    it('B4: blocking key (Q) with the CELL EDITOR open', async () => {
        const opened = await enterCell();
        const before = await probe(4000);
        await browser.keys(['Q']);
        await browser.pause(600);
        const after = await probe(4000);
        const doc = await getEditorValue();
        record('B4-blocking-in-cell', { opened, before, after, doc });

        expect(opened).toBe(true);
        expect(before.fastResponded).toBe(true);
    });

    it('B6: replicates the original sequence exactly - j j i then a key', async () => {
        const opened = await enterCell();
        // `i` is the ingredient B3/B4 lacked: in nav mode it dismisses the
        // overlay, moves DOM focus INTO Obsidian's cell editor and puts the
        // cell's own vim into insert mode. The original probe pressed it.
        await browser.keys(['i']);
        await browser.pause(800);
        const afterI = await probe(4000);
        const navActive = await navModeActive();
        const focusInCell = await focusIsInCellEditor();

        await browser.keys(['Z']);
        await browser.pause(800);
        const afterKey = await probe(4000);
        const rendererAlive = await rendererResponsive();
        const notices = await getNotices();
        const doc = await getEditorValue();

        record('B6-original-sequence', {
            opened,
            afterI,
            navActive,
            focusInCell,
            afterKey,
            rendererAlive,
            notices,
            doc,
        });

        expect(opened).toBe(true);
        // The pipeline must have been healthy after `i`, or the wedge cannot
        // be attributed to the key that followed it.
        expect(afterI.fastResponded).toBe(true);
        expect(afterI.slowResponded).toBe(true);
    });

    it('B7: same sequence with a benign key instead of Z', async () => {
        const opened = await enterCell();
        await browser.keys(['i']);
        await browser.pause(800);
        const afterI = await probe(4000);
        const focusInCell = await focusIsInCellEditor();

        await browser.keys(['x']);
        await browser.pause(800);
        const afterKey = await probe(4000);
        const rendererAlive = await rendererResponsive();
        const doc = await getEditorValue();

        record('B7-original-sequence-benign', {
            opened,
            afterI,
            focusInCell,
            afterKey,
            rendererAlive,
            doc,
        });

        expect(opened).toBe(true);
        expect(afterI.fastResponded).toBe(true);
    });

    it('B8: DECISIVE CONTROL - the prefix key Z OUTSIDE any table', async () => {
        const before = await probe(4000);
        await browser.keys(['Z']);
        await browser.pause(800);
        const after = await probe(4000);
        const rendererAlive = await rendererResponsive();
        const inTable = await cellEditorOpen();
        const doc = await getEditorValue();

        record('B8-prefix-outside-table', {
            before,
            after,
            rendererAlive,
            inTable,
            doc,
        });

        // If this wedges too, A1 is not a table defect at all but a general
        // RPC one: an incomplete-prefix key stalls the channel wherever it is
        // pressed. The preconditions are that the pipeline was healthy and no
        // cell editor was involved.
        expect(before.fastResponded).toBe(true);
        expect(before.slowResponded).toBe(true);
        expect(inTable).toBe(false);
    });

    it('B9: does completing or cancelling the prefix recover the pipeline?', async () => {
        const before = await probe(4000);
        await browser.keys(['Z']);
        await browser.pause(600);
        const wedgedByPrefix = await probe(4000);

        await browser.keys(['Escape']);
        await browser.pause(1200);
        const afterEscKey = await probe(8000);

        record('B9-prefix-recovery', {
            before,
            wedgedByPrefix,
            afterEscKey,
            recovered: afterEscKey.fastResponded && afterEscKey.slowResponded,
        });

        expect(before.fastResponded).toBe(true);
    });

    it('B10: can a REAL Escape cancel a pending Neovim command while a cell editor is open?', async () => {
        const opened = await enterCell();
        await browser.keys(['i']);
        await browser.pause(700);
        const focusInCell = await focusIsInCellEditor();
        const healthy = await probe(4000);

        await browser.keys(['Z']);
        await browser.pause(700);
        const wedged = await probe(4000);

        await browser.keys(['Escape']);
        await browser.pause(1500);
        const afterFirstEsc = await probe(6000);

        await browser.keys(['Escape']);
        await browser.pause(1500);
        const afterSecondEsc = await probe(6000);

        record('B10-esc-blocked-by-cell-editor', {
            opened,
            focusInCell,
            healthy,
            wedged,
            afterFirstEsc,
            afterSecondEsc,
            recoveredAfterFirst:
                afterFirstEsc.fastResponded && afterFirstEsc.slowResponded,
            recoveredAfterSecond:
                afterSecondEsc.fastResponded && afterSecondEsc.slowResponded,
        });

        // B9 established that a real Escape recovers the pipeline when no cell
        // editor is open. The preconditions here are that a cell editor IS
        // open with focus, and that the prefix key did stall the channel --
        // otherwise there is nothing for Escape to fail to cancel.
        expect(opened).toBe(true);
        expect(focusInCell).toBe(true);
        expect(healthy.fastResponded).toBe(true);
    });

    it('B11: ACCEPTANCE - Escape cancels a pending Neovim command with the cell editor open', async () => {
        const opened = await enterCell();
        await browser.keys(['i']);
        await browser.pause(700);
        const focusInCell = await focusIsInCellEditor();
        const healthy = await probe(4000);

        await browser.keys(['Z']);
        await browser.pause(700);
        const stalled = await probe(4000);

        await browser.keys(['Escape']);
        await browser.pause(1500);
        // Deadline must exceed REQUEST_TIMEOUT_MS = 30000
        // (src/rpc/msgpack-rpc.ts:21), or a request still pending from the
        // stall satisfies the assertion without anything having recovered.
        const recovered = await probe(35000);

        record('B11-acceptance-esc-cancels', {
            opened,
            focusInCell,
            healthy,
            stalled,
            recovered,
        });

        expect(opened).toBe(true);
        expect(focusInCell).toBe(true);
        expect(healthy.fastResponded).toBe(true);
        // The stall must have happened, or Escape had nothing to cancel.
        expect(stalled.fastResponded).toBe(false);
        expect(recovered.fastResponded).toBe(true);
        expect(recovered.slowResponded).toBe(true);
    });

    it('B12: REGRESSION - with RPC disconnected, Escape still returns the overlay to nav mode', async () => {
        // A full reload, not just a settings toggle: `reloadFeatures()` alone
        // leaves the previous scenario's nav session state behind, including
        // the 500 ms EXIT_COOLDOWN_MS that blocks re-entry.
        await setRpcEnabled(false);
        await loadSingleFileWorkspace();
        await ensureLivePreview();
        await setupEditor(TABLE_DOC, { line: 0, ch: 0 });
        await browser.pause(900);

        // Whether the fix's own guard is inert here. If RPC teardown left a
        // stale external mode, the guard would wrongly take the RPC branch
        // and this scenario would be measuring the fix rather than the
        // pre-existing bundled-engine behaviour.
        const backendState = await externalBackendState();

        const opened = await enterCell();
        // `opened` only proves OBSIDIAN opened a cell editor, which it does
        // from cursor position alone. The overlay engaging is the actual
        // precondition, and conflating the two is what made the first version
        // of this scenario fail on its outcome instead of its setup.
        const navBefore = await navModeActive();

        await browser.keys(['i']);
        await browser.pause(700);
        const inCellBefore = await cellEditorOpen();
        const navDuringEdit = await navModeActive();

        // Two Escapes, per the documented transition in
        // `.omo/plans/cross-note-jumplist-and-table-vim-modality.md` D5:
        // `cell-edit(insert) -> cell-edit(normal)` then
        // `cell-edit(normal) -> table-nav`. The first version of this
        // scenario pressed one and failed on shipped, intended behaviour.
        await browser.keys(['Escape']);
        await browser.pause(900);
        const navAfterFirstEsc = await navModeActive();

        await browser.keys(['Escape']);
        await browser.pause(900);
        const navAfterSecondEsc = await navModeActive();
        const doc = await getEditorValue();

        record('B12-regression-rpc-off', {
            backendState,
            opened,
            navBefore,
            inCellBefore,
            navDuringEdit,
            navAfterFirstEsc,
            navAfterSecondEsc,
            doc,
        });

        expect(backendState.connected).toBe(false);

        // The capture exists for the bundled engine, where 73 cases across
        // table-nav-mode and table-cell-vim-mode assert these semantics. The
        // fix must be inert when RPC is not connected.
        expect(opened).toBe(true);
        expect(navBefore).toBe(true);
        expect(inCellBefore).toBe(true);
        expect(navAfterFirstEsc).toBe(false);
        expect(navAfterSecondEsc).toBe(true);
        expect(doc).toBe(TABLE_DOC);
    });

    it('B5: does an explicit <Esc> via nvim_input recover a wedged pipeline?', async () => {
        await enterCell();
        await browser.keys(['i']);
        await browser.pause(700);
        await browser.keys(['Z']);
        await browser.pause(600);
        const wedged = await probe(4000);

        await browser.executeObsidian(async ({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins: { plugins: Record<string, RpcPlugin> };
                }
            ).plugins.plugins['vim-motions'];
            try {
                await plugin?.requestNeovim('nvim_input', ['<Esc>']);
            } catch {
                // a rejected recovery attempt is itself the measurement
            }
        });
        await browser.pause(1500);
        const recovered = await probe(8000);

        record('B5-esc-recovery', { wedged, recovered });

        expect(typeof wedged.fastResponded).toBe('boolean');
    });
});
