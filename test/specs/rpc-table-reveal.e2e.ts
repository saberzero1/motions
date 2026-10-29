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
 * `tableWidgetMode: 'reveal'` under the Neovim RPC backend.
 *
 * Nothing about the surface is RPC-specific, and that is what this spec
 * establishes. A revealed table is ordinary lines of the buffer Neovim already
 * mirrors, so the two limitations `rpc-table-owned.e2e.ts` pins for `owned` —
 * a parent caret that cannot follow Neovim into the table, and Neovim's own
 * rendering never appearing inside it — should both be absent. Each is
 * asserted against Neovim's own state, which is the authority under RPC.
 */

interface RpcState {
    connected: boolean;
    pid: number | null;
}

interface RevealRpcPlugin {
    settings: {
        neovimRpcEnabled: boolean;
        neovimBinaryPath: string;
        neovimConfigPath: string;
        tableWidgetMode: 'native' | 'raw' | 'owned' | 'reveal';
    };
    saveSettings(): Promise<void>;
    reloadFeatures(): void;
    getNeovimConnectionState(): RpcState;
    requestNeovim(method: string, args: unknown[]): Promise<unknown>;
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
const MARK_TEXT = 'reveal-probe-mark';

function pidIsAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

async function setMode(mode: 'native' | 'reveal'): Promise<void> {
    await browser.executeObsidian(async ({ app }, next: string) => {
        const plugin = (
            app as unknown as {
                plugins: { plugins: Record<string, RevealRpcPlugin> };
            }
        ).plugins.plugins['vim-motions'];
        if (!plugin) throw new Error('Vim Motions is not loaded');
        plugin.settings.tableWidgetMode = next as 'native' | 'reveal';
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
                    plugins: { plugins: Record<string, RevealRpcPlugin> };
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
                plugins: { plugins: Record<string, RevealRpcPlugin> };
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
                    plugins: { plugins: Record<string, RevealRpcPlugin> };
                }
            ).plugins.plugins['vim-motions'];
            if (!plugin) throw new Error('Vim Motions is not loaded');
            return plugin.requestNeovim(m, a);
        },
        method,
        args,
    );
}

async function neovimCursor(): Promise<[number, number]> {
    return (await request('nvim_win_get_cursor', [0])) as [number, number];
}

async function neovimLines(): Promise<string[]> {
    return (await request('nvim_buf_get_lines', [0, 0, -1, false])) as string[];
}

interface Surface {
    error?: string;
    widgets: number;
    revealedRows: number;
    parentRow: number;
    tableCell: boolean;
    marksInRevealedRow: number;
}

async function surface(): Promise<Surface> {
    return (await browser.executeObsidian(
        ({ app, obsidian }, markText: string) => {
            const empty: Surface = {
                widgets: -1,
                revealedRows: -1,
                parentRow: -1,
                tableCell: false,
                marksInRevealedRow: -1,
            };
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return { ...empty, error: 'no MarkdownView' };
            const cm = (view.editor as unknown as { cm?: unknown }).cm as
                | {
                      dom: HTMLElement;
                      contentDOM: HTMLElement;
                      state: {
                          selection: { main: { head: number } };
                          doc: { lineAt: (p: number) => { number: number } };
                      };
                  }
                | undefined;
            if (!cm) return { ...empty, error: 'no EditorView' };
            const marks = Array.from(
                cm.contentDOM.querySelectorAll<HTMLElement>(
                    '.vim-motions-rpc-virt-text',
                ),
            ).filter(
                (el) =>
                    (el.textContent ?? '').includes(markText) &&
                    el.closest('.vim-motions-reveal-row') !== null,
            );
            return {
                widgets: cm.dom.querySelectorAll('.cm-table-widget').length,
                revealedRows: cm.contentDOM.querySelectorAll(
                    '.vim-motions-reveal-row',
                ).length,
                parentRow: cm.state.doc.lineAt(cm.state.selection.main.head)
                    .number,
                tableCell: !!(
                    view as unknown as { editMode?: { tableCell?: unknown } }
                ).editMode?.tableCell,
                marksInRevealedRow: marks.length,
            };
        },
        MARK_TEXT,
    )) as Surface;
}

describe('Neovim RPC table reveal surface', function () {
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
        await setRpcEnabled(true);
        await waitForConnected();
        await setMode('reveal');
        await browser.pause(600);
    });

    afterEach(async () => {
        await setRpcEnabled(false);
        await setMode('native');
        for (const pid of spawnedPids) {
            if (pidIsAlive(pid)) process.kill(pid, 'SIGKILL');
            spawnedPids.delete(pid);
        }
    });

    it('R1: reveals the table Neovim moves into, with the CM6 caret on Neovim’s row', async () => {
        const before = await surface();
        await browser.keys(['j', 'j', 'j', 'j']);
        await browser.pause(900);
        const s = await surface();
        const [nvimRow] = await neovimCursor();

        expect(before.widgets).toBe(1);
        expect(nvimRow).toBe(5);
        expect(s.error).toBeUndefined();
        expect(s.widgets).toBe(0);
        expect(s.revealedRows).toBe(4);
        expect(s.tableCell).toBe(false);
        // Under `owned` this reads row 3 while Neovim is on row 5, because a
        // block-replaced range cannot host the caret. Here there is no
        // replaced range.
        expect(s.parentRow).toBe(nvimRow);
    });

    it('R2: x edits the row Neovim is on, in both documents', async () => {
        await browser.keys(['j', 'j', 'j', 'j']);
        await browser.pause(900);
        await browser.keys(['x']);
        await browser.pause(900);

        const lines = await neovimLines();
        expect(lines[0]).toBe('Line above');
        expect(lines[2]).toBe('| AA   | BB   |');
        expect(lines[4]).toBe(' cc   | dd   |');
        expect((await getEditorValue()).split('\n')[4]).toBe(' cc   | dd   |');
        expect((await surface()).widgets).toBe(0);
    });

    it('R3: hands the table back to Obsidian when Neovim leaves it', async () => {
        await browser.keys(['j', 'j', 'j', 'j']);
        await browser.pause(900);
        expect((await surface()).widgets).toBe(0);
        await browser.keys(['j', 'j', 'j']);
        await browser.pause(900);
        const s = await surface();
        expect((await neovimCursor())[0]).toBe(8);
        expect(s.widgets).toBe(1);
        expect(s.revealedRows).toBe(0);
    });

    it('R4: renders Neovim’s own extmark inside the revealed table', async () => {
        await browser.keys(['j', 'j', 'j', 'j']);
        await browser.pause(900);
        await request('nvim_exec_lua', [
            `local text = ...
local ns = vim.api.nvim_create_namespace('vim_motions_reveal_probe')
vim.api.nvim_buf_clear_namespace(0, ns, 0, -1)
vim.api.nvim_buf_set_extmark(0, ns, 4, 0, {
  virt_text = { { text, 'Comment' } },
  virt_text_pos = 'eol',
})
vim.cmd('redraw')`,
            [MARK_TEXT],
        ]);
        await browser
            .waitUntil(async () => (await surface()).marksInRevealedRow > 0, {
                timeout: 5000,
                interval: 100,
            })
            .catch(() => undefined);
        const s = await surface();
        expect(s.widgets).toBe(0);
        expect(s.marksInRevealedRow).toBe(1);
    });
});
