import { browser, expect } from '@wdio/globals';
import { resolve } from 'node:path';
import {
    getEditorValue,
    getNotices,
    loadSingleFileWorkspace,
    setupEditor,
} from '../helpers';
import { requireRpcPrerequisites } from './rpc-prerequisites';
import { killIfAlive } from './rpc-process';

// Plugin settings whose behaviour Neovim can provide natively are projected
// onto the mirror buffer rather than reimplemented, the way `textwidth`
// already is. These scenarios assert the resulting Neovim behaviour, not that
// the option was written -- an option set to the wrong value is still set.

interface RpcState {
    connected: boolean;
    pid: number | null;
}

interface RpcPlugin {
    settings: {
        neovimRpcEnabled: boolean;
        neovimBinaryPath: string;
        neovimConfigPath: string;
        listContinuationOnOpen: boolean;
        yankHighlightMode: 'off' | 'solid' | 'fade';
        yankHighlightDuration: number;
    };
    saveSettings(): Promise<void>;
    reloadFeatures(): void;
    getNeovimConnectionState(): RpcState;
    requestNeovim(method: string, args: unknown[]): Promise<unknown>;
}

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

async function applyOptionSettings(settings: {
    listContinuation: boolean;
    yankMode: 'off' | 'solid';
    yankDuration: number;
}): Promise<void> {
    await browser.executeObsidian(
        async (
            { app },
            listContinuation: boolean,
            yankMode: 'off' | 'solid',
            yankDuration: number,
        ) => {
            const plugin = (
                app as unknown as {
                    plugins: { plugins: Record<string, RpcPlugin> };
                }
            ).plugins.plugins['vim-motions'];
            if (!plugin) throw new Error('Vim Motions is not loaded');
            plugin.settings.listContinuationOnOpen = listContinuation;
            plugin.settings.yankHighlightMode = yankMode;
            plugin.settings.yankHighlightDuration = yankDuration;
            await plugin.saveSettings();
            plugin.reloadFeatures();
        },
        settings.listContinuation,
        settings.yankMode,
        settings.yankDuration,
    );
}

async function setVaultIndent(useTab: boolean, tabSize: number): Promise<void> {
    await browser.executeObsidian(
        ({ app }, nextUseTab: boolean, nextTabSize: number) => {
            const vault = app.vault as unknown as {
                setConfig(key: string, value: unknown): void;
            };
            vault.setConfig('useTab', nextUseTab);
            vault.setConfig('tabSize', nextTabSize);
        },
        useTab,
        tabSize,
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

// Real keydowns on the editor, not nvim_input: these scenarios claim
// user-facing behaviour, and nvim_input bypasses key delegation entirely.
async function dispatchKeys(keys: string): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }, sequence: string) => {
        const markdown = app.workspace.getActiveViewOfType(
            obsidian.MarkdownView,
        );
        const contentDOM = (
            markdown?.editor as unknown as { cm?: { contentDOM?: HTMLElement } }
        )?.cm?.contentDOM;
        if (!contentDOM) throw new Error('No active editor contentDOM');
        contentDOM.focus();
        for (const token of sequence) {
            contentDOM.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key: token === '\u001b' ? 'Escape' : token,
                    bubbles: true,
                    cancelable: true,
                }),
            );
        }
    }, keys);
    await request('nvim_get_mode', []);
}

async function bufferLines(): Promise<string[]> {
    return (await request('nvim_buf_get_lines', [0, 0, -1, true])) as string[];
}

async function yankHighlightCount(): Promise<number> {
    return (await browser.executeObsidian(
        () => document.querySelectorAll('.vim-motions-yank-highlight').length,
    )) as number;
}

async function yankHighlightText(): Promise<string> {
    return (await browser.executeObsidian(() =>
        Array.from(document.querySelectorAll('.vim-motions-yank-highlight'))
            .map((element) => element.textContent ?? '')
            .join(''),
    )) as string;
}

describe('Neovim RPC editor options', function () {
    before(function () {
        requireRpcPrerequisites(this);
    });

    this.timeout(180000);

    beforeEach(async () => {
        await loadSingleFileWorkspace();
        await setupEditor('- item one', { line: 0, ch: 0 });
        await browser.executeObsidian(({ app }) => {
            (
                app.vault as unknown as {
                    setConfig(key: string, value: unknown): void;
                }
            ).setConfig('propertiesInDocument', 'source');
        });
        await setVaultIndent(true, 4);
        await setRpcEnabled(false);
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

    it('continues a bullet list on o when the setting is enabled', async () => {
        await applyOptionSettings({
            listContinuation: true,
            yankMode: 'off',
            yankDuration: 200,
        });
        await dispatchKeys('Gohello\u001b');
        await browser.waitUntil(
            async () => (await bufferLines()).length === 2,
            { timeout: 5000, interval: 100 },
        );
        expect(await bufferLines()).toEqual(['- item one', '- hello']);
        await browser.waitUntil(
            async () => (await getEditorValue()) === '- item one\n- hello',
            { timeout: 5000, interval: 100 },
        );
    });

    it('leaves the stock behaviour when the setting is disabled', async () => {
        await applyOptionSettings({
            listContinuation: false,
            yankMode: 'off',
            yankDuration: 200,
        });
        await dispatchKeys('Gohello\u001b');
        await browser.waitUntil(
            async () => (await bufferLines()).length === 2,
            { timeout: 5000, interval: 100 },
        );
        expect(await bufferLines()).toEqual(['- item one', 'hello']);
    });

    // Vim rebuilds a continued line's indent from its column count rather than
    // copying the bytes, so `expandtab`/`tabstop` decide the style. Both
    // directions are asserted because either one alone passes under a
    // hardcoded setting -- measured: expandtab=false turns `    - ` into a tab.
    it('keeps tab indentation on o when the vault indents with tabs', async () => {
        await setVaultIndent(true, 4);
        await applyOptionSettings({
            listContinuation: true,
            yankMode: 'off',
            yankDuration: 200,
        });
        await request('nvim_buf_set_lines', [
            0,
            0,
            -1,
            true,
            ['- Topic', '\t- Sub'],
        ]);
        await request('nvim_win_set_cursor', [0, [2, 0]]);
        await dispatchKeys('oX\u001b');
        await browser.waitUntil(
            async () => (await bufferLines()).length === 3,
            { timeout: 5000, interval: 100 },
        );
        expect(await bufferLines()).toEqual(['- Topic', '\t- Sub', '\t- X']);
        await browser.waitUntil(
            async () => (await getEditorValue()) === '- Topic\n\t- Sub\n\t- X',
            { timeout: 5000, interval: 100 },
        );
    });

    it('keeps space indentation on o when the vault indents with spaces', async () => {
        await setVaultIndent(false, 4);
        await applyOptionSettings({
            listContinuation: true,
            yankMode: 'off',
            yankDuration: 200,
        });
        await request('nvim_buf_set_lines', [
            0,
            0,
            -1,
            true,
            ['- Topic', '    - Sub'],
        ]);
        await request('nvim_win_set_cursor', [0, [2, 0]]);
        await dispatchKeys('oX\u001b');
        await browser.waitUntil(
            async () => (await bufferLines()).length === 3,
            { timeout: 5000, interval: 100 },
        );
        expect(await bufferLines()).toEqual([
            '- Topic',
            '    - Sub',
            '    - X',
        ]);
    });

    it('renders a yank highlight over the yanked text', async () => {
        await applyOptionSettings({
            listContinuation: false,
            yankMode: 'solid',
            yankDuration: 5000,
        });
        expect(await yankHighlightCount()).toBe(0);
        await dispatchKeys('yy');
        await browser.waitUntil(async () => (await yankHighlightCount()) > 0, {
            timeout: 5000,
            interval: 100,
            timeoutMsg: 'the yank never produced a highlight',
        });
        expect(await yankHighlightText()).toBe('- item one');
    });

    it('renders no yank highlight when the mode is off', async () => {
        await applyOptionSettings({
            listContinuation: false,
            yankMode: 'off',
            yankDuration: 5000,
        });
        await dispatchKeys('yy');
        await request('nvim_get_mode', []);
        await browser.pause(500);
        expect(await yankHighlightCount()).toBe(0);
    });

    // The mirror is one reused buffer renamed on every activation, and the
    // ftplugin re-runs each time, so the options have to be reapplied rather
    // than set once at connect.
    it('reapplies the options after an activation reseeds the buffer', async () => {
        await applyOptionSettings({
            listContinuation: true,
            yankMode: 'off',
            yankDuration: 200,
        });
        await loadSingleFileWorkspace('Target.md');
        await browser.waitUntil(
            async () =>
                ((await request('nvim_buf_get_name', [0])) as string).endsWith(
                    'Target.md',
                ),
            {
                timeout: 5000,
                interval: 100,
                timeoutMsg: 'Neovim never reseeded from the activated note',
            },
        );
        await request('nvim_buf_set_lines', [0, 0, -1, true, ['- reseeded']]);
        await dispatchKeys('Gohello\u001b');
        await browser.waitUntil(
            async () => (await bufferLines()).length === 2,
            { timeout: 5000, interval: 100 },
        );
        expect(await bufferLines()).toEqual(['- reseeded', '- hello']);
    });
});
