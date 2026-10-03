import { browser, expect } from '@wdio/globals';
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
 * Plan C: `tableWidgetMode: 'owned'` under the Neovim RPC backend.
 *
 * The surface is **presentational** here. Neovim owns text and keys, and
 * `key-delegation.ts` already owns them from the parent's `contentDOM` by
 * enclosure, so the child is made non-competing by construction —
 * `contenteditable=false`, never focused, no key router, no document sync —
 * rather than by relying on an event order that is accidental.
 *
 * Every absence assertion here is paired with something that must still
 * happen, because "nothing routed" and "nothing focused the child" are both
 * satisfied by a table that never rendered at all.
 */

interface RpcState {
    connected: boolean;
    pid: number | null;
}

interface NestedStats {
    mounted: number;
    focused: boolean;
    routed: number;
    routerInstalled: boolean;
    doc: string | null;
}

interface OwnedRpcPlugin {
    settings: {
        neovimRpcEnabled: boolean;
        neovimBinaryPath: string;
        neovimConfigPath: string;
        tableWidgetMode: 'native' | 'raw' | 'owned';
    };
    saveSettings(): Promise<void>;
    reloadFeatures(): void;
    getNeovimConnectionState(): RpcState;
    requestNeovim(method: string, args: unknown[]): Promise<unknown>;
    getNestedTableStats(): NestedStats;
}

const spawnedPids = new Set<number>();
const TEST_CONFIG_PATH = resolve('test/fixtures/nvim/init.lua');
const TABLE_DOC = [
    'Line above',
    '',
    '| AA   | BB   |',
    '|------|------|',
    '| cc   | dd   |',
    '| ee   | ff   |',
    '',
    'Line below',
].join('\n');

function pidIsAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

async function setMode(mode: 'native' | 'owned'): Promise<void> {
    await browser.executeObsidian(async ({ app }, next: string) => {
        const plugin = (
            app as unknown as {
                plugins: { plugins: Record<string, OwnedRpcPlugin> };
            }
        ).plugins.plugins['vim-motions'];
        if (!plugin) throw new Error('Vim Motions is not loaded');
        plugin.settings.tableWidgetMode = next as 'native' | 'owned';
        await plugin.saveSettings();
        plugin.reloadFeatures();
    }, mode);
    await browser.pause(900);
}

async function setRpcEnabled(enabled: boolean): Promise<void> {
    await browser.executeObsidian(
        async ({ app }, nextEnabled: boolean, nextConfigPath: string) => {
            const plugin = (
                app as unknown as {
                    plugins: { plugins: Record<string, OwnedRpcPlugin> };
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
                plugins: { plugins: Record<string, OwnedRpcPlugin> };
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
        async ({ app }, m: string, a: unknown[]) => {
            const plugin = (
                app as unknown as {
                    plugins: { plugins: Record<string, OwnedRpcPlugin> };
                }
            ).plugins.plugins['vim-motions'];
            if (!plugin) throw new Error('Vim Motions is not loaded');
            return plugin.requestNeovim(m, a);
        },
        method,
        args,
    );
}

interface Surface {
    error?: string;
    connected: boolean;
    rootCount: number;
    obsidianWidgets: number;
    linesWithPipe: number;
    nested: NestedStats;
    activeIsParentContent: boolean;
    activeInsideNested: boolean;
    childContentEditable: string | null;
    parentHead: number;
    livePreview: boolean;
    sourceMode: boolean;
}

async function surface(): Promise<Surface> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const plugin = (
            app as unknown as {
                plugins: { plugins: Record<string, OwnedRpcPlugin> };
            }
        ).plugins.plugins['vim-motions'];
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        const empty: Surface = {
            connected: false,
            rootCount: -1,
            obsidianWidgets: -1,
            linesWithPipe: -1,
            nested: {
                mounted: -1,
                focused: false,
                routed: -1,
                routerInstalled: false,
                doc: null,
            },
            activeIsParentContent: false,
            activeInsideNested: false,
            childContentEditable: null,
            parentHead: -1,
            livePreview: false,
            sourceMode: false,
        };
        if (!plugin) return { ...empty, error: 'no plugin' };
        if (!view) return { ...empty, error: 'no MarkdownView' };
        const cm = (view.editor as unknown as { cm?: unknown }).cm as
            | {
                  contentDOM: HTMLElement;
                  state: { selection: { main: { head: number } } };
              }
            | undefined;
        if (!cm) return { ...empty, error: 'no EditorView' };

        const nestedHost = view.containerEl.querySelector<HTMLElement>(
            '.vim-motions-table-nested .cm-content',
        );
        const active = document.activeElement as HTMLElement | null;

        return {
            connected: plugin.getNeovimConnectionState().connected,
            rootCount: view.containerEl.querySelectorAll(
                '.vim-motions-table-surface',
            ).length,
            obsidianWidgets:
                view.containerEl.querySelectorAll('.cm-table-widget').length,
            // The nested editor's own `.cm-line` elements are excluded. It is
            // mounted inside the parent's content, so an unscoped count finds
            // the table's four lines there and reads as the parent failing to
            // block-replace them. `table-owned-surface.e2e.ts` gets away with
            // `cm.contentDOM` only because its cursor sits outside the table
            // and no child is mounted.
            linesWithPipe: Array.from(
                cm.contentDOM.querySelectorAll('.cm-line'),
            ).filter(
                (l) =>
                    (l.textContent ?? '').includes('|') &&
                    l.closest('.vim-motions-table-nested') === null,
            ).length,
            nested: plugin.getNestedTableStats(),
            activeIsParentContent: active === cm.contentDOM,
            activeInsideNested:
                active !== null &&
                active.closest('.vim-motions-table-nested') !== null,
            childContentEditable:
                nestedHost?.getAttribute('contenteditable') ?? null,
            parentHead: cm.state.selection.main.head,
            livePreview:
                view.containerEl.querySelector('.is-live-preview') !== null ||
                view.getMode() === 'source',
            sourceMode:
                (
                    view as unknown as {
                        currentMode?: { sourceMode?: boolean };
                    }
                ).currentMode?.sourceMode === true,
        };
    })) as Surface;
}

async function neovimCursor(): Promise<[number, number]> {
    return (await request('nvim_win_get_cursor', [0])) as [number, number];
}

describe('Neovim RPC owned table surface (Plan C)', function () {
    before(function () {
        requireRpcPrerequisites(this);
    });

    this.timeout(240000);

    beforeEach(async () => {
        await setRpcEnabled(false);
        await setMode('native');
        await loadSingleFileWorkspace();
        await ensureLivePreview();
        await setupEditor(TABLE_DOC, { line: 0, ch: 0 });
        // RPC first, then the mode. Order matters and hid a hole: the gate is
        // evaluated when the slot is built, so selecting `owned` *before* the
        // connection came up left `isExternalBackendActive()` false and the
        // old blocker never ran — a restored gate still passed every
        // assertion. This is also the realistic flow: a user with the backend
        // connected then chooses the mode.
        await setRpcEnabled(true);
        await waitForConnected();
        await setMode('owned');
        await browser.pause(900);
    });

    afterEach(async () => {
        await setRpcEnabled(false);
        await setMode('native');
        for (const pid of spawnedPids) {
            if (pidIsAlive(pid)) process.kill(pid, 'SIGKILL');
            spawnedPids.delete(pid);
        }
    });

    it('C1: renders the owned surface while RPC is connected', async () => {
        // Move into the table the way a user does — through Neovim.
        await browser.keys(['j', 'j', 'j', 'j']);
        await browser.pause(900);

        const s = await surface();
        expect(s.error).toBeUndefined();
        // All four in one reading. No single part is sufficient: the root can
        // exist while Obsidian's widget also renders, and "no widget" holds
        // for a note with no table at all.
        expect(s.connected).toBe(true);
        expect(s.rootCount).toBeGreaterThan(0);
        expect(s.obsidianWidgets).toBe(0);
        expect(s.linesWithPipe).toBe(0);
        // And no blocker notice fired, since RPC is no longer a blocker.
        const notices = await getNotices();
        expect(notices.join(' ')).not.toContain('owned table rendering');
    });

    it('C2: the child is inert and never focused', async () => {
        await browser.keys(['j', 'j', 'j', 'j']);
        await browser.pause(900);

        const s = await surface();
        expect(s.nested.mounted).toBe(1);
        // Focus stays on the parent, which is where every RPC path measures.
        expect(s.activeIsParentContent).toBe(true);
        expect(s.activeInsideNested).toBe(false);
        expect(s.nested.focused).toBe(false);
        expect(s.childContentEditable).toBe('false');
        // Asserted directly: an installed-but-starved router is behaviourally
        // identical to an absent one, because the parent's capture handler
        // stops the event before a child listener would run.
        expect(s.nested.routerInstalled).toBe(false);
    });

    it('C2: keys reach Neovim and never the child router', async () => {
        await browser.keys(['j', 'j', 'j', 'j']);
        await browser.pause(900);
        const before = await surface();
        expect(before.nested.mounted).toBe(1);

        await browser.keys(['x', 'x', 'x']);
        await browser.pause(900);

        const after = await surface();
        // The paired half: the document really changed, so "routed stayed 0"
        // cannot be satisfied by nothing happening at all.
        const doc = await getEditorValue();
        expect(doc).not.toBe(TABLE_DOC);
        expect(after.nested.routed).toBe(0);
        expect(after.nested.routerInstalled).toBe(false);
    });

    it('C3: Neovim stays authoritative, and x edits the row it is on', async () => {
        await browser.keys(['j', 'j', 'j', 'j']);
        await browser.pause(900);

        const [rowBefore] = await neovimCursor();
        // Four `j` from line 1 puts Neovim on the first data row. The table
        // being block-replaced in CM6 does not change how Neovim counts
        // lines, which is the point of a presentational surface.
        expect(rowBefore).toBe(5);

        await browser.keys(['x']);
        await browser.pause(900);

        const nvimLines = (await request('nvim_buf_get_lines', [
            0,
            0,
            -1,
            false,
        ])) as string[];
        // Asserted against Neovim's own buffer, which is the authority here.
        // The edit landed on the data row, not on "Line above" — the measured
        // failure this guards against was Neovim reporting row 1 while the
        // user sat in the table.
        expect(nvimLines[0]).toBe('Line above');
        expect(nvimLines[4]?.startsWith('|')).toBe(false);
        expect(nvimLines[2]).toContain('AA');
        expect((await neovimCursor())[0]).toBe(5);
    });

    it('C3: the parent cursor cannot be parked inside the table (limitation)', async () => {
        await browser.keys(['j', 'j', 'j', 'j']);
        await browser.pause(900);

        const s = await surface();
        const [nvimRow] = await neovimCursor();
        const parentRow = (await browser.executeObsidian(
            ({ app, obsidian }, head: number) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                const cm = (view?.editor as unknown as { cm?: unknown })?.cm as
                    | {
                          state: {
                              doc: {
                                  lineAt: (p: number) => { number: number };
                              };
                          };
                      }
                    | undefined;
                return cm?.state.doc.lineAt(head).number ?? -1;
            },
            s.parentHead,
        )) as number;

        // A measured LIMITATION, pinned so it cannot change silently.
        //
        // A block-replaced range cannot host a caret, and under the bundled
        // engine it is the focused child that keeps the parent's parked
        // selection stable. A presentational child never takes focus, so CM6
        // relocates the parent's selection to the start of the replaced range
        // — measured, Neovim on row 5 with the parent's head on row 3.
        //
        // The consequence is that the selection mirror does not show which
        // cell is active under RPC. Neovim's cursor remains authoritative and
        // edits land correctly, which the scenario above asserts. A CM6 ->
        // Neovim cursor push would not fix this: CM6 relocates the selection
        // straight back, and there is no loop guard for that direction.
        expect(nvimRow).toBe(5);
        expect(parentRow).toBeLessThan(nvimRow);
        expect(s.nested.mounted).toBe(1);
    });

    it('CONTROL: the CM6/Neovim table divergence is not owned-specific', async () => {
        // Obsidian's own table editor reformats the CM6 document while
        // Neovim holds the original source, so the two disagree on column
        // widths. That is pre-existing and independent of this surface:
        // measured identically in `native`, which is what this control
        // establishes. Without it the same divergence observed under `owned`
        // would read as a regression introduced by enabling it.
        await setMode('native');
        await browser.pause(900);
        await browser.keys(['j', 'j', 'j', 'j']);
        await browser.pause(900);

        const doc = await getEditorValue();
        const nvimDoc = (
            (await request('nvim_buf_get_lines', [0, 0, -1, false])) as string[]
        ).join('\n');

        expect(doc).not.toBe(nvimDoc);
        // The divergence is only in padding: both describe the same table.
        expect(doc.replace(/[-\s]/g, '')).toBe(nvimDoc.replace(/[-\s]/g, ''));
    });

    it('C3: the cursor is stable across frames, with no push loop', async () => {
        await browser.keys(['j', 'j', 'j', 'j']);
        await browser.pause(900);

        const readings: string[] = [];
        for (let i = 0; i < 3; i++) {
            const [row, col] = await neovimCursor();
            const head = (await surface()).parentHead;
            readings.push(`${row}:${col}:${head}`);
            await browser.pause(250);
        }
        // Identical across three samples: nothing is re-dispatching a cursor.
        expect(new Set(readings).size).toBe(1);
    });
});
