import { browser, expect } from '@wdio/globals';
import { resolve } from 'node:path';
import { Key } from 'webdriverio';
import { getNotices, loadSingleFileWorkspace, setupEditor } from '../helpers';
import { requireRpcPrerequisites } from './rpc-prerequisites';

interface RpcState {
    connected: boolean;
    pid: number | null;
}

interface KeyDelegationState {
    active: boolean;
    handlerAttached: boolean;
    keyInterceptActive: boolean;
}

interface RpcPlugin {
    settings: Record<string, unknown>;
    saveSettings(): Promise<void>;
    reloadFeatures(): void;
    getNeovimConnectionState(): RpcState;
    getNeovimKeyDelegationState(): KeyDelegationState;
    requestNeovim(method: string, args: unknown[]): Promise<unknown>;
    oilManager: {
        openOil(path: string): Promise<void>;
        closeOil(): void;
    };
}

interface OilSnapshot {
    activeFile: string | null;
    activeViewType: string;
    content: string;
    dirPath: string | null;
    leafCount: number;
    markdownLeafCount: number;
    oilLeafCount: number;
}

const TEST_CONFIG_PATH = resolve('test/fixtures/nvim/init.lua');
const FLASH_FIXTURE = 'test-vault/lua/flash/init.lua';
const FIXTURE_DIR = 'rpc-oil-fixture';
const SENTINEL = 'rpc oil sentinel\nsecond line';
const spawnedPids = new Set<number>();

function pidIsAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

async function getPluginState(): Promise<RpcState> {
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

async function setRpcEnabled(enabled: boolean): Promise<void> {
    await browser.executeObsidian(
        async ({ app }, nextEnabled: boolean, configPath: string) => {
            const plugin = (
                app as unknown as {
                    plugins: { plugins: Record<string, RpcPlugin> };
                }
            ).plugins.plugins['vim-motions'];
            if (!plugin) throw new Error('Vim Motions is not loaded');
            Object.assign(plugin.settings, {
                neovimBinaryPath: '',
                neovimConfigPath: configPath,
                neovimRpcEnabled: nextEnabled,
                oilDefaultSort: 'name',
                oilExplorer: true,
                oilShowHiddenFiles: false,
            });
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
            async () => (await getPluginState()).connected,
            {
                timeout: 10000,
                interval: 100,
            },
        );
    } catch {
        throw new Error(
            `Neovim RPC did not connect: ${(await getNotices()).join(' | ')}`,
        );
    }
    const pid = (await getPluginState()).pid;
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

async function prepareFixture(): Promise<void> {
    await browser.executeObsidian(async ({ app }, dir: string) => {
        const old = app.vault.getAbstractFileByPath(dir);
        if (old) await app.vault.delete(old, true);
        await app.vault.createFolder(dir);
        await app.vault.create(`${dir}/alpha-short.md`, 'a');
        await app.vault.create(`${dir}/zeta-long.md`, 'zeta content');
        await app.vault.create(`${dir}/.hidden.md`, 'hidden');
        await app.vault.createFolder(`${dir}/subdir`);
        await app.vault.create(`${dir}/subdir/inner.md`, 'inner');
    }, FIXTURE_DIR);
}

async function removeFixture(): Promise<void> {
    await browser.executeObsidian(async ({ app }, dir: string) => {
        const fixture = app.vault.getAbstractFileByPath(dir);
        if (fixture) await app.vault.delete(fixture, true);
    }, FIXTURE_DIR);
}

async function openOil(
    path = FIXTURE_DIR,
    entryName = 'alpha-short.md',
): Promise<void> {
    await browser.executeObsidian(async ({ app }, dir: string) => {
        const plugin = (
            app as unknown as {
                plugins: { plugins: Record<string, RpcPlugin> };
            }
        ).plugins.plugins['vim-motions'];
        if (!plugin) throw new Error('Vim Motions is not loaded');
        await plugin.oilManager.openOil(dir);
    }, path);
    await browser.waitUntil(
        async () => (await getOilSnapshot()).activeViewType === 'oil-explorer',
        { timeout: 5000, interval: 100 },
    );
    await browser.waitUntil(
        async () => !(await getKeyDelegationState()).keyInterceptActive,
        { timeout: 5000, interval: 100 },
    );
    await focusOilEntry(entryName);
}

async function getOilSnapshot(): Promise<OilSnapshot> {
    return (await browser.executeObsidian(({ app }) => {
        const active = app.workspace.getMostRecentLeaf()?.view as unknown as {
            getBufferContent?: () => string;
            getDirPath?: () => string;
            getViewType?: () => string;
        };
        let leafCount = 0;
        let markdownLeafCount = 0;
        let oilLeafCount = 0;
        app.workspace.iterateAllLeaves((leaf) => {
            leafCount++;
            const type = leaf.view.getViewType();
            if (type === 'markdown') markdownLeafCount++;
            if (type === 'oil-explorer') oilLeafCount++;
        });
        return {
            activeFile: app.workspace.getActiveFile()?.path ?? null,
            activeViewType: active?.getViewType?.() ?? 'none',
            content: active?.getBufferContent?.() ?? '',
            dirPath: active?.getDirPath?.() ?? null,
            leafCount,
            markdownLeafCount,
            oilLeafCount,
        };
    })) as OilSnapshot;
}

async function focusOilEntry(name: string): Promise<void> {
    await browser.executeObsidian(({ app }, entryName: string) => {
        const view = app.workspace.getMostRecentLeaf()?.view as unknown as {
            getBufferContent(): string;
            getEditorView(): {
                dispatch(spec: { selection: { anchor: number } }): void;
                focus(): void;
                state: { doc: { line(number: number): { from: number } } };
            };
        };
        const index = view
            .getBufferContent()
            .split('\n')
            .findIndex((line) => line.endsWith(` ${entryName}`));
        if (index < 0) throw new Error(`${entryName} is absent from Oil`);
        const editor = view.getEditorView();
        editor.dispatch({
            selection: { anchor: editor.state.doc.line(index + 1).from },
        });
        editor.focus();
    }, name);
}

async function getKeyDelegationState(): Promise<KeyDelegationState> {
    return (await browser.executeObsidian(({ app }) => {
        const plugin = (
            app as unknown as {
                plugins: { plugins: Record<string, RpcPlugin> };
            }
        ).plugins.plugins['vim-motions'];
        if (!plugin) throw new Error('Vim Motions is not loaded');
        return plugin.getNeovimKeyDelegationState();
    })) as KeyDelegationState;
}

async function getNeovimText(): Promise<string> {
    const lines = (await request('nvim_buf_get_lines', [
        0,
        0,
        -1,
        true,
    ])) as string[];
    return lines.join('\n');
}

async function getUnnamedRegister(): Promise<string> {
    return (await browser.executeObsidian(() => {
        const vim = (
            window as unknown as {
                CodeMirrorAdapter?: {
                    Vim?: {
                        getRegisterController(): {
                            registers: Record<string, { toString(): string }>;
                        };
                    };
                };
            }
        ).CodeMirrorAdapter?.Vim;
        return vim?.getRegisterController().registers['"']?.toString() ?? '';
    })) as string;
}

async function waitForMarkdown(path = 'Welcome.md'): Promise<void> {
    await browser.waitUntil(
        async () => {
            const state = await getOilSnapshot();
            return (
                state.activeViewType === 'markdown' && state.activeFile === path
            );
        },
        { timeout: 5000, interval: 100 },
    );
}

describe('Neovim RPC Oil isolation', function () {
    before(function () {
        requireRpcPrerequisites(this, { fixtures: [FLASH_FIXTURE] });
    });

    this.timeout(300000);

    beforeEach(async () => {
        await setRpcEnabled(false);
        await loadSingleFileWorkspace('Welcome.md');
        await setupEditor(SENTINEL, { line: 0, ch: 0 });
        await prepareFixture();
        await setRpcEnabled(true);
        await waitForConnected();
        await browser.waitUntil(
            async () => (await getNeovimText()) === SENTINEL,
            {
                timeout: 5000,
                interval: 100,
            },
        );
    });

    afterEach(async () => {
        const closeButton = browser.$('.modal-close-button');
        if (await closeButton.isExisting()) await closeButton.click();
        await browser.executeObsidian(({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins: { plugins: Record<string, RpcPlugin> };
                }
            ).plugins.plugins['vim-motions'];
            plugin?.oilManager.closeOil();
        });
        await setRpcEnabled(false);
        await loadSingleFileWorkspace('Welcome.md');
        await removeFixture();
        for (const pid of spawnedPids) {
            if (pidIsAlive(pid)) process.kill(pid, 'SIGKILL');
            spawnedPids.delete(pid);
        }
    });

    it('isolates Oil DOM keys from Neovim and restores Markdown interception after q', async () => {
        await openOil();
        const oilState = await getKeyDelegationState();
        await browser.keys(['x']);
        await browser.keys(['q']);
        await browser.pause(500);
        const afterClose = await getOilSnapshot();
        const markdownState = await getKeyDelegationState();
        expect({
            activeFile: afterClose.activeFile,
            activeViewType: afterClose.activeViewType,
            markdownState,
            neovimText: await getNeovimText(),
            oilState,
        }).toEqual({
            activeFile: 'Welcome.md',
            activeViewType: 'markdown',
            markdownState: {
                active: true,
                handlerAttached: true,
                keyInterceptActive: true,
            },
            neovimText: SENTINEL,
            oilState: {
                active: true,
                handlerAttached: false,
                keyInterceptActive: false,
            },
        });
    });

    it('opens the selected entry with Enter', async () => {
        await openOil();
        await browser.keys([Key.Enter]);
        await waitForMarkdown(`${FIXTURE_DIR}/alpha-short.md`);
        expect((await getOilSnapshot()).activeFile).toBe(
            `${FIXTURE_DIR}/alpha-short.md`,
        );
    });

    it('navigates to the parent directory with -', async () => {
        await openOil(`${FIXTURE_DIR}/subdir`, 'inner.md');
        await browser.keys(['-']);
        await browser.waitUntil(
            async () => (await getOilSnapshot()).dirPath === FIXTURE_DIR,
            { timeout: 5000, interval: 100 },
        );
        expect((await getOilSnapshot()).dirPath).toBe(FIXTURE_DIR);
    });

    it('navigates to the vault root with ~', async () => {
        await openOil(`${FIXTURE_DIR}/subdir`, 'inner.md');
        await browser.keys(['~']);
        await browser.waitUntil(
            async () => (await getOilSnapshot()).dirPath === '',
            { timeout: 5000, interval: 100 },
        );
        expect((await getOilSnapshot()).dirPath).toBe('');
    });

    it('refreshes the Oil buffer with Ctrl-L', async () => {
        await openOil();
        await browser.executeObsidian(({ app }) => {
            const view = app.workspace.getMostRecentLeaf()?.view as unknown as {
                setEditorContent(content: string): void;
                getEditorView(): { focus(): void };
            };
            view.setEditorContent('stale');
            view.getEditorView().focus();
        });
        await browser.keys([Key.Control, 'l']);
        await browser.waitUntil(
            async () =>
                (await getOilSnapshot()).content.includes('alpha-short.md'),
            { timeout: 5000, interval: 100 },
        );
        expect((await getOilSnapshot()).content).not.toContain('stale');
    });

    it('closes Oil with Ctrl-C', async () => {
        await openOil();
        await browser.keys([Key.Control, 'c']);
        await waitForMarkdown();
        expect((await getOilSnapshot()).activeViewType).toBe('markdown');
    });

    it('opens the selected entry in a new tab with Ctrl-T', async () => {
        await openOil();
        const before = await getOilSnapshot();
        await browser.keys([Key.Control, 't']);
        await waitForMarkdown(`${FIXTURE_DIR}/alpha-short.md`);
        const after = await getOilSnapshot();
        expect({
            activeFile: after.activeFile,
            leafDelta: after.leafCount - before.leafCount,
            oilLeafCount: after.oilLeafCount,
        }).toEqual({
            activeFile: `${FIXTURE_DIR}/alpha-short.md`,
            leafDelta: 1,
            oilLeafCount: 1,
        });
    });

    it('opens the selected entry in a vertical split with Ctrl-S', async () => {
        await openOil();
        const before = await getOilSnapshot();
        await browser.keys([Key.Control, 's']);
        await waitForMarkdown(`${FIXTURE_DIR}/alpha-short.md`);
        const after = await getOilSnapshot();
        expect({
            leafDelta: after.leafCount - before.leafCount,
            oilLeafCount: after.oilLeafCount,
        }).toEqual({ leafDelta: 1, oilLeafCount: 1 });
    });

    it('opens the selected entry in a horizontal split with Ctrl-H', async () => {
        await openOil();
        const before = await getOilSnapshot();
        await browser.keys([Key.Control, 'h']);
        await waitForMarkdown(`${FIXTURE_DIR}/alpha-short.md`);
        const after = await getOilSnapshot();
        expect({
            leafDelta: after.leafCount - before.leafCount,
            oilLeafCount: after.oilLeafCount,
        }).toEqual({ leafDelta: 1, oilLeafCount: 1 });
    });

    it.skip('skips gx because opening the selected entry shells out to the OS');

    it('toggles hidden-file visibility with g.', async () => {
        await openOil();
        expect((await getOilSnapshot()).content).not.toContain('.hidden.md');
        await browser.keys(['g', '.']);
        await browser.pause(1500);
        expect({
            content: (await getOilSnapshot()).content,
            notices: await getNotices(),
        }).toEqual({
            content: expect.stringContaining('.hidden.md'),
            notices: expect.arrayContaining(['Oil: hidden files shown']),
        });
        await browser.keys(['g', '.']);
        await browser.pause(1500);
        expect((await getOilSnapshot()).content).not.toContain('.hidden.md');
    });

    it('cycles from name sorting to size sorting with gs', async () => {
        await openOil();
        await browser.keys(['g', 's']);
        await browser.pause(1200);
        await browser.keys(['g', 's']);
        await browser.waitUntil(
            async () => {
                const content = (await getOilSnapshot()).content;
                return (
                    content.indexOf('zeta-long.md') <
                    content.indexOf('alpha-short.md')
                );
            },
            { timeout: 5000, interval: 100 },
        );
        const content = (await getOilSnapshot()).content;
        expect(content.indexOf('zeta-long.md')).toBeLessThan(
            content.indexOf('alpha-short.md'),
        );
    });

    it('yanks the selected path into the unnamed register with y.', async () => {
        await openOil();
        await browser.keys(['y', '.']);
        await browser.pause(500);
        expect(await getUnnamedRegister()).toBe(
            `${FIXTURE_DIR}/alpha-short.md`,
        );
    });

    it.skip(
        'skips gf because revealing the selected entry shells out to the OS',
    );

    it('opens Oil help with g?', async () => {
        await openOil();
        await browser.keys(['g', '?']);
        const title = browser.$('.vim-motions-info-modal-title');
        await title.waitForExist({ timeout: 5000 });
        expect(await title.getText()).toBe('Oil keybindings');
    });

    it('opens a preview leaf with Ctrl-P', async () => {
        await openOil();
        const before = await getOilSnapshot();
        await browser.keys([Key.Control, 'p']);
        await browser.waitUntil(
            async () =>
                (await getOilSnapshot()).leafCount === before.leafCount + 1,
            { timeout: 5000, interval: 100 },
        );
        const after = await getOilSnapshot();
        expect({
            leafDelta: after.leafCount - before.leafCount,
            markdownLeafCount: after.markdownLeafCount,
            oilLeafCount: after.oilLeafCount,
        }).toEqual({ leafDelta: 1, markdownLeafCount: 1, oilLeafCount: 1 });
    });
});
