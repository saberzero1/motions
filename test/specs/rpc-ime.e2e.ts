import { browser, expect } from '@wdio/globals';
import { resolve } from 'node:path';
import {
    getNotices,
    loadSingleFileWorkspace,
    loadTwoFileWorkspace,
    setupEditor,
} from '../helpers';

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

interface CdpSession {
    send(method: string, params?: unknown): Promise<unknown>;
}

const TEST_CONFIG_PATH = resolve('test/fixtures/nvim/init.lua');
const spawnedPids = new Set<number>();

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

async function createCdpSession(): Promise<CdpSession> {
    const puppeteer = await (
        browser as unknown as {
            getPuppeteer(): Promise<{ pages(): Promise<unknown[]> }>;
        }
    ).getPuppeteer();
    const pages = await puppeteer.pages();
    const page = pages[0] as {
        target(): { createCDPSession(): Promise<CdpSession> };
    };
    return page.target().createCDPSession();
}

async function dispatchKeys(sequence: string): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }, keys: string) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        const contentDOM = (
            view?.editor as unknown as { cm?: { contentDOM?: HTMLElement } }
        )?.cm?.contentDOM;
        if (!contentDOM) throw new Error('No active editor contentDOM');
        contentDOM.focus();
        const names: Record<string, string> = { Esc: 'Escape' };
        for (const token of keys.match(/<[^>]+>|[\s\S]/gu) ?? []) {
            const key = token.startsWith('<')
                ? (names[token.slice(1, -1)] ?? token.slice(1, -1))
                : token;
            const target = document.activeElement ?? contentDOM;
            target.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key,
                    bubbles: true,
                    cancelable: true,
                }),
            );
        }
    }, sequence);
    await request('nvim_get_mode', []);
}

async function resetBuffer(lines: string[]): Promise<void> {
    await request('nvim_input', ['<Esc>']);
    await request('nvim_buf_set_lines', [0, 0, -1, true, lines]);
    await request('nvim_win_set_cursor', [0, [1, 0]]);
}

async function startComposition(
    session: CdpSession,
    preedit: string,
): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        const editor = (
            view?.editor as unknown as { cm?: { dom?: HTMLElement } }
        )?.cm?.dom;
        const input = editor?.querySelector<HTMLInputElement>(
            '.vim-motions-rpc-ime-input',
        );
        if (!input) throw new Error('No RPC IME input target');
        input.focus({ preventScroll: true });
    });
    await session.send('Input.imeSetComposition', {
        text: preedit,
        selectionStart: Array.from(preedit).length,
        selectionEnd: Array.from(preedit).length,
    });
}

async function isCompositionOwnerFocused(): Promise<boolean> {
    return browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        const editor = (
            view?.editor as unknown as { cm?: { dom?: HTMLElement } }
        )?.cm?.dom;
        return editor?.ownerDocument.activeElement?.classList.contains(
            'vim-motions-rpc-ime-input',
        );
    });
}

async function commitComposition(
    session: CdpSession,
    text: string,
): Promise<void> {
    await session.send('Input.insertText', { text });
    await request('nvim_get_mode', []);
}

async function cancelComposition(session: CdpSession): Promise<void> {
    await session.send('Input.imeSetComposition', {
        text: '',
        selectionStart: 0,
        selectionEnd: 0,
    });
}

async function snapshot(): Promise<{
    lines: string[];
    mode: string;
    cm: string;
    compositionOwner: boolean;
}> {
    const [lines, mode, host] = await Promise.all([
        request('nvim_buf_get_lines', [0, 0, -1, true]),
        request('nvim_get_mode', []),
        browser.executeObsidian(({ app }) => ({
            cm: app.workspace.activeEditor?.editor?.getValue() ?? '',
            compositionOwner: document.activeElement?.classList.contains(
                'vim-motions-rpc-ime-input',
            ),
        })),
    ]);
    return {
        lines: lines as string[],
        mode: String((mode as { mode: string }).mode),
        cm: host.cm,
        compositionOwner: host.compositionOwner,
    };
}

async function rawByteComparison(): Promise<{ cm: number[]; raw: number[] }> {
    return browser.executeObsidian(async ({ app }) => {
        const plugin = (
            app as unknown as {
                plugins: { plugins: Record<string, RpcPlugin> };
            }
        ).plugins.plugins['vim-motions'];
        if (!plugin) throw new Error('Vim Motions is not loaded');
        const rawLines = (await plugin.requestNeovim('nvim_exec_lua', [
            'local out = {}; for _, line in ipairs(vim.api.nvim_buf_get_lines(0, 0, -1, true)) do out[#out + 1] = {string.byte(line, 1, -1)} end; return out',
            [],
        ])) as number[][];
        const value = app.workspace.activeEditor?.editor?.getValue();
        if (value === undefined) throw new Error('No active editor');
        return {
            cm: Array.from(new TextEncoder().encode(value)),
            raw: rawLines.flatMap((line, index) =>
                index === rawLines.length - 1 ? line : [...line, 0x0a],
            ),
        };
    });
}

describe('Neovim RPC IME composition', function () {
    this.timeout(180000);

    beforeEach(async () => {
        await loadSingleFileWorkspace();
        await setupEditor('rpc ime', { line: 0, ch: 0 });
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
    });

    afterEach(async () => {
        await setRpcEnabled(false);
        for (const pid of spawnedPids) {
            if (pidIsAlive(pid)) process.kill(pid, 'SIGKILL');
            spawnedPids.delete(pid);
        }
    });

    it('commits composed text through Neovim and keeps CM6 byte-exact', async () => {
        const session = await createCdpSession();
        await resetBuffer(['alpha', 'beta']);
        await dispatchKeys('i');
        await startComposition(session, 'にほんご');
        expect(await isCompositionOwnerFocused()).toBe(true);
        await commitComposition(session, '日本語');
        await dispatchKeys('<Esc>');
        const result = await snapshot();
        expect(result).toEqual({
            lines: ['日本語alpha', 'beta'],
            mode: 'n',
            cm: '日本語alpha\nbeta',
            compositionOwner: false,
        });
        const bytes = await rawByteComparison();
        expect(bytes.cm).toEqual(bytes.raw);
    });

    it('dot-repeats the completed composed insert on the next line', async () => {
        const session = await createCdpSession();
        await resetBuffer(['alpha', 'beta']);
        await dispatchKeys('i');
        await startComposition(session, 'にほんご');
        await commitComposition(session, '日本語');
        await dispatchKeys('<Esc>j0.');
        const result = await snapshot();
        expect(result.lines).toEqual(['日本語alpha', '日本語beta']);
        expect(result.cm).toBe('日本語alpha\n日本語beta');
        const bytes = await rawByteComparison();
        expect(bytes.cm).toEqual(bytes.raw);
    });

    it('cancels preedit without committing partial text', async () => {
        const session = await createCdpSession();
        await resetBuffer(['alpha']);
        await dispatchKeys('i');
        await startComposition(session, 'にほ');
        await cancelComposition(session);
        await dispatchKeys('<Esc>');
        const result = await snapshot();
        expect(result).toEqual({
            lines: ['alpha'],
            mode: 'n',
            cm: 'alpha',
            compositionOwner: false,
        });
    });

    it('does not forward ordinary keys while composition is active', async () => {
        const session = await createCdpSession();
        await resetBuffer(['alpha']);
        await dispatchKeys('i');
        await startComposition(session, 'にほ');
        await browser.keys(['x']);
        await cancelComposition(session);
        await dispatchKeys('<Esc>');
        const result = await snapshot();
        expect(result.lines).toEqual(['alpha']);
        expect(result.cm).toBe('alpha');
    });

    it('cancels composition on note switch without leaking text', async () => {
        const firstPath = 'Welcome.md';
        const secondPath = 'Target.md';
        await setRpcEnabled(false);
        await browser.executeObsidian(
            async ({ app }, first: string, second: string) => {
                const firstFile = app.vault.getFileByPath(first);
                const secondFile = app.vault.getFileByPath(second);
                if (!firstFile || !secondFile)
                    throw new Error('IME note fixtures are missing');
                await app.vault.modify(firstFile, 'first alpha');
                await app.vault.modify(secondFile, 'second beta');
            },
            firstPath,
            secondPath,
        );
        await loadTwoFileWorkspace(firstPath, secondPath, 'first');
        await setupEditor('first alpha', { line: 0, ch: 0 });
        await setRpcEnabled(true);
        await waitForConnected();
        const session = await createCdpSession();
        await dispatchKeys('i');
        await startComposition(session, 'にほんご');
        await browser.executeObsidian(({ app }, targetPath: string) => {
            const leaf = app.workspace
                .getLeavesOfType('markdown')
                .find(
                    (candidate) =>
                        candidate.view.getState()?.file === targetPath,
                );
            if (!leaf) throw new Error(`No leaf for ${targetPath}`);
            app.workspace.setActiveLeaf(leaf, { focus: true });
        }, secondPath);
        await browser.waitUntil(
            async () =>
                browser.executeObsidian(
                    ({ app }, targetPath: string) =>
                        app.workspace.getActiveFile()?.path === targetPath,
                    secondPath,
                ),
            { timeout: 5000, interval: 50 },
        );
        await request('nvim_get_mode', []);
        const result = await snapshot();
        const documents = await browser.executeObsidian(
            async ({ app }, first: string, second: string) => {
                const byPath = Object.fromEntries(
                    app.workspace.getLeavesOfType('markdown').map((leaf) => {
                        const path = leaf.view.getState()?.file as string;
                        const editor = (
                            leaf.view as unknown as {
                                editor?: { getValue(): string };
                            }
                        ).editor;
                        return [path, editor?.getValue() ?? null];
                    }),
                );
                return {
                    first: byPath[first],
                    second: byPath[second],
                    secondDisk: await app.vault.adapter.read(second),
                };
            },
            firstPath,
            secondPath,
        );
        expect(result.lines).toEqual(['second beta']);
        expect(result.cm).toBe('second beta');
        expect(documents).toEqual({
            first: 'first alpha',
            second: 'second beta',
            secondDisk: 'second beta',
        });
    });
});
