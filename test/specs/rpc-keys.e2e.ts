import { browser, expect } from '@wdio/globals';
import { resolve } from 'node:path';
import { NeovimClient } from '../neovim/client';
import {
    ensureLivePreview,
    getNotices,
    loadSingleFileWorkspace,
    setupEditor,
} from '../helpers';
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

interface NeovimSnapshot {
    content: string;
    cursor: [number, number];
    mode: string;
    register: string;
    registerType: string;
    cmCursor: { line: number; ch: number };
}

interface FrontmatterPosition {
    nvim: [number, number];
    cm: { line: number; ch: number };
    coordinates: { left: number; top: number } | null;
}

interface KeyCase {
    content: string;
    sequence: string;
}

const spawnedPids = new Set<number>();
const TEST_CONFIG_PATH = resolve('test/fixtures/nvim/init.lua');
const FRONTMATTER = [
    '---',
    'title: rpc frontmatter',
    'tags: [rpc, m2c]',
    'kind: test',
    '---',
].join('\n');
const FRONTMATTER_FIXTURE = `${FRONTMATTER}\nbody one\nbody two\nbody three`;
const FIRST_BODY_LINE = 6;

function pidIsAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
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
            timeout: 10000,
            interval: 100,
            timeoutMsg: 'Neovim RPC did not connect',
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

async function dispatchDomKeys(sequence: string): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }, keys: string) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        const contentDOM = (
            view?.editor as unknown as { cm?: { contentDOM?: HTMLElement } }
        )?.cm?.contentDOM;
        if (!contentDOM) throw new Error('No active editor contentDOM');
        contentDOM.focus();
        const tokens = keys.match(/<[^>]+>|[\s\S]/gu) ?? [];
        for (const token of tokens) {
            let key = token;
            let ctrlKey = false;
            let altKey = false;
            let shiftKey = false;
            if (token.startsWith('<') && token.endsWith('>')) {
                const parts = token.slice(1, -1).split('-');
                key = parts.pop() ?? '';
                ctrlKey = parts.includes('C');
                altKey = parts.includes('A');
                shiftKey = parts.includes('S');
                const names: Record<string, string> = {
                    BS: 'Backspace',
                    CR: 'Enter',
                    Esc: 'Escape',
                    Space: ' ',
                    Tab: 'Tab',
                };
                key = names[key] ?? key;
            }
            contentDOM.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key,
                    ctrlKey,
                    altKey,
                    shiftKey,
                    bubbles: true,
                    cancelable: true,
                }),
            );
        }
    }, sequence);
    await request('nvim_get_mode', []);
}

async function resetBuffer(content: string): Promise<void> {
    await request('nvim_input', ['<Esc>']);
    await request('nvim_get_mode', []);
    await request('nvim_buf_set_lines', [0, 0, -1, true, content.split('\n')]);
    await request('nvim_win_set_cursor', [0, [1, 0]]);
}

async function rawByteComparison(): Promise<{ cm: number[]; raw: number[] }> {
    return (await browser.executeObsidian(async ({ app }) => {
        const plugin = (
            app as unknown as {
                plugins: { plugins: Record<string, RpcPlugin> };
                workspace: {
                    activeEditor?: { editor?: { getValue(): string } };
                };
            }
        ).plugins.plugins['vim-motions'];
        if (!plugin) throw new Error('Vim Motions is not loaded');
        await plugin.requestNeovim('nvim_get_mode', []);
        const rawLines = (await plugin.requestNeovim('nvim_exec_lua', [
            'local out = {}; for _, line in ipairs(vim.api.nvim_buf_get_lines(0, 0, -1, true)) do out[#out + 1] = {string.byte(line, 1, -1)} end; return out',
            [],
        ])) as number[][];
        const value = (
            app as unknown as {
                workspace: {
                    activeEditor?: { editor?: { getValue(): string } };
                };
            }
        ).workspace.activeEditor?.editor?.getValue();
        if (value === undefined) throw new Error('No active editor');
        return {
            cm: Array.from(new TextEncoder().encode(value)),
            raw: rawLines.flatMap((line, index) =>
                index === rawLines.length - 1 ? line : [...line, 0x0a],
            ),
        };
    })) as { cm: number[]; raw: number[] };
}

async function bridgedSnapshot(): Promise<NeovimSnapshot> {
    const [lines, cursor, mode, register] = await Promise.all([
        request('nvim_buf_get_lines', [0, 0, -1, true]),
        request('nvim_win_get_cursor', [0]),
        request('nvim_get_mode', []),
        request('nvim_exec_lua', [
            'return {vim.fn.getreg([["]]), vim.fn.getregtype([["]])}',
            [],
        ]),
    ]);
    const registerValues = register as string[];
    const cmCursor = (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        const cm = (view?.editor as unknown as { cm?: { state?: any } })?.cm;
        if (!cm?.state) throw new Error('No active CM6 editor');
        const head = cm.state.selection.main.head as number;
        const line = cm.state.doc.lineAt(head);
        return { line: line.number, ch: head - line.from };
    })) as { line: number; ch: number };
    return {
        content: (lines as string[]).join('\n'),
        cursor: cursor as [number, number],
        mode: String((mode as { mode: string }).mode),
        register: registerValues[0] ?? '',
        registerType: registerValues[1] ?? '',
        cmCursor,
    };
}

async function setPropertiesMode(mode: 'visible' | 'source'): Promise<void> {
    await browser.executeObsidian(({ app }, value: string) => {
        (
            app.vault as unknown as {
                setConfig(key: string, nextValue: unknown): void;
            }
        ).setConfig('propertiesInDocument', value);
    }, mode);
    await browser.pause(300);
}

async function reconnectInPropertiesMode(
    mode: 'visible' | 'source',
): Promise<void> {
    await setRpcEnabled(false);
    await setPropertiesMode(mode);
    await setRpcEnabled(true);
    await waitForConnected();
}

async function readActiveFile(): Promise<string> {
    return (await browser.executeObsidian(async ({ app }) => {
        const file = app.workspace.getActiveFile();
        if (!file) throw new Error('No active file');
        return app.vault.adapter.read(file.path);
    })) as string;
}

async function measureFrontmatterWalk(
    steps: number,
): Promise<FrontmatterPosition[]> {
    await resetBuffer(FRONTMATTER_FIXTURE);
    await request('nvim_win_set_cursor', [0, [8, 0]]);
    const positions: FrontmatterPosition[] = [];
    for (let step = 0; step < steps; step++) {
        await dispatchDomKeys('k');
        const nvim = (await request('nvim_win_get_cursor', [0])) as [
            number,
            number,
        ];
        const cmPosition = (await browser.executeObsidian(
            ({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                const cm = (
                    view?.editor as unknown as {
                        cm?: {
                            state?: any;
                            coordsAtPos?(position: number): DOMRect | null;
                        };
                    }
                )?.cm;
                if (!cm?.state) throw new Error('No active CM6 editor');
                const head = cm.state.selection.main.head as number;
                const line = cm.state.doc.lineAt(head);
                const coordinates = cm.coordsAtPos?.(head) ?? null;
                return {
                    cm: { line: line.number, ch: head - line.from },
                    coordinates: coordinates
                        ? { left: coordinates.left, top: coordinates.top }
                        : null,
                };
            },
        )) as Omit<FrontmatterPosition, 'nvim'>;
        positions.push({ nvim, ...cmPosition });
    }
    return positions;
}

function buildKeyCases(): KeyCase[] {
    const variants = ['ascii', '界', '𝄞', 'e\u0301', '混合𝄞e\u0301'];
    const templates = [
        (text: string) => `i${text}<Esc>`,
        (text: string) => `A${text}<Esc>`,
        () => 'dw',
        (text: string) => `ciw${text}<Esc>`,
        () => 'vllx',
        () => '2w3x',
        (text: string) => `ciw${text}<Esc>w.`,
        () => 'xu<C-r>',
        (text: string) => `qqi${text}<Esc>q@q`,
        () => 'yyP',
    ];
    return Array.from({ length: 210 }, (_, index) => ({
        content: 'alpha beta gamma\néclair 𝄞界 e\u0301\nmacro target',
        sequence: templates[index % templates.length]!(
            `${variants[index % variants.length]}${index}`,
        ),
    }));
}

describe('Neovim RPC key delegation', function () {
    before(function () {
        requireRpcPrerequisites(this);
    });

    this.timeout(900000);

    beforeEach(async () => {
        await loadSingleFileWorkspace();
        await setupEditor('rpc keys', { line: 0, ch: 0 });
        await setPropertiesMode('source');
        await setRpcEnabled(false);
        await setRpcEnabled(true);
        await waitForConnected();
    });

    afterEach(async () => {
        await setRpcEnabled(false);
        for (const pid of spawnedPids) {
            if (pidIsAlive(pid)) process.kill(pid, 'SIGKILL');
            spawnedPids.delete(pid);
        }
    });

    it('keeps CM6 byte-exact after 210 delegated DOM key sequences', async () => {
        const cases = buildKeyCases();
        for (const keyCase of cases) {
            await resetBuffer(keyCase.content);
            await dispatchDomKeys(keyCase.sequence);
            const comparison = await rawByteComparison();
            expect(comparison.cm).toEqual(comparison.raw);
        }
        expect(cases).toHaveLength(210);
    });

    it('matches headless Neovim for ciwfoo<Esc>w.', async () => {
        const initial = 'one two three';
        const oracle = new NeovimClient();
        await oracle.start();
        try {
            await oracle.setContent(initial);
            await oracle.setCursor(0, 0);
            await oracle.input('ciwfoo\x1bw.');
            await resetBuffer(initial);
            await dispatchDomKeys('ciwfoo<Esc>w.');
            const snapshot = await bridgedSnapshot();
            expect(snapshot.content).toBe(await oracle.getContent());
        } finally {
            await oracle.stop();
        }
    });

    it('does not perturb buffer, cursor, mode, or unnamed register', async () => {
        const initial = 'one two three\n界 e\u0301 𝄞';
        const sequence = 'ciwfoo<Esc>w.';
        const oracle = new NeovimClient();
        await oracle.start();
        try {
            await oracle.setContent(initial);
            await oracle.setCursor(0, 0);
            await oracle.input('ciwfoo\x1bw.');
            await resetBuffer(initial);
            await dispatchDomKeys(sequence);
            const snapshot = await bridgedSnapshot();
            expect(snapshot).toEqual({
                content: await oracle.getContent(),
                cursor: [
                    (await oracle.getCursor()).line + 1,
                    (await oracle.getCursor()).ch,
                ],
                mode: await oracle.getRawMode(),
                register: await oracle.getRegister('"'),
                registerType: await oracle.getRegisterType('"'),
                cmCursor: {
                    line: (await oracle.getCursor()).line + 1,
                    ch: (await oracle.getCursor()).ch,
                },
            });
        } finally {
            await oracle.stop();
        }
    });

    it('inserts a printable character exactly once through Neovim', async () => {
        await resetBuffer('seed');
        await browser.keys(['i']);
        await browser.keys(['x']);
        await browser.keys(['Escape']);
        await request('nvim_get_mode', []);
        const comparison = await rawByteComparison();
        expect(new TextDecoder().decode(new Uint8Array(comparison.cm))).toBe(
            'xseed',
        );
        expect(comparison.cm).toEqual(comparison.raw);
    });

    it('connects with rendered properties visible', async () => {
        await ensureLivePreview();
        await reconnectInPropertiesMode('visible');
        expect((await getRpcState()).connected).toBe(true);
    });

    it('keeps repeated upward motion out of rendered frontmatter', async () => {
        await ensureLivePreview();
        await reconnectInPropertiesMode('visible');
        const positions = await measureFrontmatterWalk(6);
        expect(positions.map(({ nvim }) => nvim[0])).toEqual([
            7, 6, 6, 6, 6, 6,
        ]);
        expect(positions.map(({ cm }) => cm.line)).toEqual([7, 6, 6, 6, 6, 6]);
    });

    it('deletes the first body line without changing frontmatter', async () => {
        await ensureLivePreview();
        await reconnectInPropertiesMode('visible');
        await resetBuffer(FRONTMATTER_FIXTURE);
        await request('nvim_win_set_cursor', [0, [8, 0]]);
        await dispatchDomKeys('gg');
        await dispatchDomKeys('dd');
        const snapshot = await bridgedSnapshot();
        await browser.waitUntil(
            async () => (await readActiveFile()) === snapshot.content,
            {
                timeout: 10000,
                interval: 100,
                timeoutMsg: 'Obsidian did not persist the RPC body deletion',
            },
        );
        const disk = await readActiveFile();
        expect(disk.split('\n').slice(0, 5).join('\n')).toBe(FRONTMATTER);
        expect(snapshot.content.split('\n').slice(0, 5).join('\n')).toBe(
            FRONTMATTER,
        );
        expect(snapshot.content).toBe(`${FRONTMATTER}\nbody two\nbody three`);
        const comparison = await rawByteComparison();
        expect(new TextDecoder().decode(new Uint8Array(comparison.cm))).toBe(
            snapshot.content,
        );
        expect(comparison.cm).toEqual(comparison.raw);
    });

    it('resolves gg to the first body line with rendered properties', async () => {
        await ensureLivePreview();
        await reconnectInPropertiesMode('visible');
        await resetBuffer(FRONTMATTER_FIXTURE);
        await request('nvim_win_set_cursor', [0, [8, 0]]);
        await dispatchDomKeys('gg');
        const snapshot = await bridgedSnapshot();
        expect(snapshot.cursor).toEqual([FIRST_BODY_LINE, 0]);
        expect(snapshot.cmCursor).toEqual({ line: FIRST_BODY_LINE, ch: 0 });
    });

    it('keeps source-rendered frontmatter fully navigable', async () => {
        await ensureLivePreview();
        await reconnectInPropertiesMode('source');
        const positions = await measureFrontmatterWalk(6);
        const rows = positions.map(({ nvim }) => nvim[0]);
        if (rows.join(',') !== '7,6,5,4,3,2') {
            // Fails on macOS only, where it cannot be reproduced locally. The
            // walk stalls at the first body line, so the cursor never enters
            // frontmatter -- the fork only skips its frontmatter interception
            // while the host reports properties-as-source. Report what that
            // decision is actually based on, so the next CI run separates a
            // mis-read properties mode from a fold or live-preview problem.
            const state = await browser.executeObsidian(({ app, obsidian }) => {
                const view = app.workspace.getActiveViewOfType(
                    obsidian.MarkdownView,
                );
                const vault = app.vault as unknown as {
                    getConfig(key: string): unknown;
                };
                return {
                    propertiesInDocument: vault.getConfig(
                        'propertiesInDocument',
                    ),
                    mode: view?.getMode?.() ?? null,
                    metadataContainers: document.querySelectorAll(
                        '.metadata-container',
                    ).length,
                };
            });
            throw new Error(
                `frontmatter walk stalled: ${JSON.stringify({
                    rows,
                    cmRows: positions.map(({ cm }) => cm.line),
                    state,
                })}`,
            );
        }
        expect(positions.map(({ nvim }) => nvim[0])).toEqual([
            7, 6, 5, 4, 3, 2,
        ]);
        expect(positions.map(({ cm }) => cm.line)).toEqual([7, 6, 5, 4, 3, 2]);
        expect(
            new Set(positions.map(({ coordinates }) => coordinates?.top)).size,
        ).toBe(6);
    });

    it('mirrors API frontmatter edits while the fold stays closed', async () => {
        await ensureLivePreview();
        await reconnectInPropertiesMode('visible');
        await resetBuffer(FRONTMATTER_FIXTURE);
        await request('nvim_buf_set_lines', [
            0,
            1,
            2,
            true,
            ['title: changed through RPC'],
        ]);
        await request('nvim_get_mode', []);
        const snapshot = await bridgedSnapshot();
        const expected = FRONTMATTER_FIXTURE.replace(
            'title: rpc frontmatter',
            'title: changed through RPC',
        );
        expect(snapshot.content).toBe(expected);
        const comparison = await rawByteComparison();
        expect(new TextDecoder().decode(new Uint8Array(comparison.cm))).toBe(
            expected,
        );
        expect(comparison.cm).toEqual(comparison.raw);
        expect(snapshot.content.split('\n')).toHaveLength(8);
    });
});
