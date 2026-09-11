import { browser, expect } from '@wdio/globals';
import { resolve } from 'node:path';
import {
    getCursorPos,
    getEditorValue,
    getNotices,
    getWorkspaceSnapshot,
    loadSingleFileWorkspace,
    setupEditor,
} from '../helpers';
import { requireRpcPrerequisites } from './rpc-prerequisites';

interface RpcState {
    connected: boolean;
    pid: number | null;
}

interface RpcPlugin {
    settings: Record<string, unknown>;
    saveSettings(): Promise<void>;
    reloadFeatures(): void;
    getNeovimConnectionState(): RpcState;
    requestNeovim(method: string, args: unknown[]): Promise<unknown>;
    refreshNeovimFeatureBridge(): Promise<void>;
    harpoonStore: {
        load(items: unknown[]): void;
        add(path: string, row: number, col: number): void;
        getAll(): Array<{
            index: number;
            item: { filePath: string; row: number; col: number };
        }>;
    };
    jumpList: {
        clear(): void;
        deserialize(entries: RpcLocation[]): void;
    };
}

interface RpcLocation {
    filePath: string;
    line: number;
    ch: number;
}

interface BridgeInventory {
    abbreviations: number;
    commands: number;
    leaderMappings: number;
    mappings: number;
}

const BRIDGE_COMMANDS = [
    'Oil',
    'Sidebar',
    'Focuspaneleft',
    'Focuspanedown',
    'Focuspaneup',
    'Focuspaneright',
    'Splitvertical',
    'Splithorizontal',
    'Closetab',
    'Closeothertabs',
    'Nexttab',
    'Prevtab',
    'Gototab',
    'Buffers',
    'Ls',
    'Files',
    'Commands',
    'Headings',
    'Outline',
    'Tags',
    'Recent',
    'Resume',
    'Livegrep',
    'Backlinks',
    'Grep',
    'Picker',
    'Registers',
    'Marks',
    'Delmarks',
    'Jumps',
    'HarpoonAdd',
    'HarpoonRemove',
    'Harpoon',
    'HarpoonSelect',
    'HarpoonNext',
    'HarpoonPrev',
];
const BRIDGE_ABBREVIATIONS = [
    'sidebar',
    'focuspaneleft',
    'focuspanedown',
    'focuspaneup',
    'focuspaneright',
    'splitvertical',
    'splithorizontal',
    'closetab',
    'closeothertabs',
    'nexttab',
    'prevtab',
    'gototab',
    'buffers',
    'ls',
    'files',
    'commands',
    'headings',
    'outline',
    'tags',
    'recent',
    'resume',
    'livegrep',
    'backlinks',
    'grep',
    'registers',
    'marks',
    'delmarks',
    'jumps',
];
const BRIDGE_LEADER_MAPPINGS = [
    'pickerFiles',
    'pickerGrep',
    'pickerBuffers',
    'pickerHeadings',
    'pickerOutline',
    'pickerBacklinks',
    'pickerTags',
    'pickerRecent',
    'pickerMarks',
    'pickerRegisters',
    'pickerResume',
    'harpoonAdd',
    'harpoonRemove',
    'harpoonToggle',
    'harpoonPicker',
    'harpoonNext',
    'harpoonPrevious',
    'harpoonSelect1',
    'harpoonSelect2',
    'harpoonSelect3',
    'harpoonSelect4',
    'harpoonSelect5',
    'harpoonSelect6',
    'harpoonSelect7',
    'harpoonSelect8',
    'harpoonSelect9',
];

const TEST_CONFIG_PATH = resolve('test/fixtures/nvim/init.lua');
const RPC_NOTES = [
    { path: 'RpcBridgeA.md', content: 'alpha\nfile A cursor' },
    { path: 'RpcBridgeB.md', content: 'beta\nfile B cursor' },
    { path: 'RpcBridgeC.md', content: 'gamma\nfile C cursor' },
] as const;
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
            Object.assign(plugin.settings, {
                enableHarpoon: true,
                enableNavigation: true,
                enableWorkspaceNav: true,
                neovimBinaryPath: '',
                neovimConfigPath: configPath,
                neovimRpcEnabled: nextEnabled,
                oilExplorer: true,
                picker: true,
                pickerLeaderMappings: true,
            });
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

async function input(keys: string): Promise<void> {
    await request('nvim_input', [keys]);
}

async function getActiveFile(): Promise<string | null> {
    return (await browser.executeObsidian(
        ({ app }) => app.workspace.getActiveFile()?.path ?? null,
    )) as string | null;
}

async function getActiveViewType(): Promise<string> {
    return (await browser.executeObsidian(({ app }) => {
        return app.workspace.getMostRecentLeaf()?.view.getViewType() ?? 'none';
    })) as string;
}

async function prepareRpcNotes(): Promise<void> {
    await browser.executeObsidian(async ({ app }, notes) => {
        for (const note of notes) {
            const existing = app.vault.getFileByPath(note.path);
            if (existing) {
                await app.vault.modify(existing, note.content);
            } else {
                await app.vault.create(note.path, note.content);
            }
        }
    }, RPC_NOTES);
}

async function removeRpcNotes(): Promise<void> {
    await browser.executeObsidian(
        async ({ app }, paths: string[]) => {
            for (const path of paths) {
                const file = app.vault.getFileByPath(path);
                if (file) await app.vault.delete(file);
            }
        },
        RPC_NOTES.map((note) => note.path),
    );
}

async function openRpcNote(
    path: string,
    cursor: { line: number; ch: number },
): Promise<void> {
    await browser.executeObsidian(
        async ({ app, obsidian }, filePath: string, nextCursor) => {
            const file = app.vault.getFileByPath(filePath);
            if (!file) throw new Error(`${filePath} is absent`);
            const leaf = app.workspace.getLeaf(false);
            await leaf.openFile(file);
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            view?.editor.setCursor(nextCursor);
            view?.editor.focus();
        },
        path,
        cursor,
    );
    await browser.waitUntil(
        async () =>
            (await getActiveFile()) === path &&
            (await getCursorPos()).line === cursor.line &&
            (await getCursorPos()).ch === cursor.ch,
        { timeout: 5000, interval: 100 },
    );
    await waitForMirror(path);
}

async function seedHarpoon(
    items: Array<{
        filePath: string;
        row: number;
        col: number;
    } | null>,
): Promise<void> {
    await browser.executeObsidian(({ app }, pins) => {
        const plugin = (
            app as unknown as {
                plugins: { plugins: Record<string, RpcPlugin> };
            }
        ).plugins.plugins['vim-motions'];
        if (!plugin) throw new Error('Vim Motions is not loaded');
        plugin.harpoonStore.load(pins);
    }, items);
}

async function getHarpoonSlots(): Promise<
    Array<{ index: number; filePath: string }>
> {
    return (await browser.executeObsidian(({ app }) => {
        const plugin = (
            app as unknown as {
                plugins: { plugins: Record<string, RpcPlugin> };
            }
        ).plugins.plugins['vim-motions'];
        if (!plugin) throw new Error('Vim Motions is not loaded');
        return plugin.harpoonStore
            .getAll()
            .map(({ index, item }) => ({ index, filePath: item.filePath }));
    })) as Array<{ index: number; filePath: string }>;
}

async function seedJumpList(entries: RpcLocation[]): Promise<void> {
    await browser.executeObsidian(({ app }, nextEntries) => {
        const plugin = (
            app as unknown as {
                plugins: { plugins: Record<string, RpcPlugin> };
            }
        ).plugins.plugins['vim-motions'];
        if (!plugin) throw new Error('Vim Motions is not loaded');
        plugin.jumpList.deserialize(nextEntries);
    }, entries);
}

async function waitForRpcLocation(
    path: string,
    cursor: { line: number; ch: number },
): Promise<void> {
    try {
        await browser.waitUntil(
            async () => {
                if ((await getActiveFile()) !== path) return false;
                const position = await getCursorPos();
                return (
                    position.line === cursor.line && position.ch === cursor.ch
                );
            },
            { timeout: 5000, interval: 100 },
        );
    } catch {
        throw new Error(
            `RPC location did not settle: ${JSON.stringify({
                activeFile: await getActiveFile(),
                expected: { path, cursor },
                hostCursor: await getCursorPos(),
                neovimCursor: await request('nvim_win_get_cursor', [0]),
                notices: await getNotices(),
            })}`,
        );
    }
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

async function getMarkSnapshot(): Promise<{
    gutter: string[];
    marks: string[];
}> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return { gutter: [], marks: [] };
        const editor = view.editor as unknown as {
            cm?: {
                cm?: { state?: { vim?: { marks?: Record<string, unknown> } } };
                dom?: HTMLElement;
            };
        };
        const adapter = editor.cm?.cm;
        const dom = editor.cm?.dom;
        return {
            gutter: dom
                ? Array.from(
                      dom.querySelectorAll('.vim-motions-sign-marker'),
                  ).map((element) => element.textContent ?? '')
                : [],
            marks: Object.keys(adapter?.state?.vim?.marks ?? {}),
        };
    })) as { gutter: string[]; marks: string[] };
}

async function setHostMark(name: string): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }, markName: string) => {
        const plugin = (
            app as unknown as {
                plugins: { plugins: Record<string, RpcPlugin> };
            }
        ).plugins.plugins['vim-motions'] as RpcPlugin & {
            triggerMarkGutterRefresh(): void;
        };
        const Vim = window.CodeMirrorAdapter?.Vim;
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        const editor = view?.editor as unknown as {
            cm?: { cm?: unknown };
        };
        const adapter = editor?.cm?.cm;
        if (!plugin || !Vim || !adapter)
            throw new Error('Vim mark unavailable');
        Vim.handleKey(adapter as never, 'm');
        Vim.handleKey(adapter as never, markName);
        plugin.triggerMarkGutterRefresh();
    }, name);
    await browser.waitUntil(
        async () => {
            const snapshot = await getMarkSnapshot();
            return (
                snapshot.marks.includes(name) &&
                snapshot.gutter.some((label) => label.includes(name))
            );
        },
        { timeout: 5000, interval: 100 },
    );
}

async function closeInfoModalInstance(): Promise<void> {
    await browser.keys(['Escape']);
    await browser.waitUntil(
        async () =>
            !(await browser.$('.vim-motions-info-modal-title').isExisting()),
        { timeout: 5000, interval: 100 },
    );
}

async function bridgeInventory(): Promise<BridgeInventory> {
    const mappings = (await request('nvim_get_keymap', ['n'])) as Array<{
        desc?: string;
    }>;
    const commands = (await request('nvim_get_commands', [
        { builtin: false },
    ])) as Record<string, { definition?: string }>;
    const abbreviations = (await request('nvim_exec2', [
        'silent cnoreabbrev',
        { output: true },
    ])) as { output?: string };
    return {
        abbreviations: BRIDGE_ABBREVIATIONS.filter((name) =>
            abbreviations.output?.includes(name),
        ).length,
        commands: Object.keys(commands).filter((name) =>
            BRIDGE_COMMANDS.includes(name),
        ).length,
        leaderMappings: mappings.filter((mapping) =>
            BRIDGE_LEADER_MAPPINGS.map(
                (name) => `vim-motions-rpc:mapping:${name}`,
            ).includes(mapping.desc ?? ''),
        ).length,
        mappings: mappings.filter((mapping) =>
            mapping.desc?.startsWith('vim-motions-rpc:'),
        ).length,
    };
}

async function createThreeTabs(): Promise<string[]> {
    return (await browser.executeObsidian(async ({ app }) => {
        const file = app.vault.getFileByPath('Target.md');
        if (!file) throw new Error('Target.md is absent');
        const first = app.workspace.getMostRecentLeaf();
        if (!first) throw new Error('No active leaf');
        const second = app.workspace.getLeaf('tab');
        await second.openFile(file);
        const third = app.workspace.getLeaf('tab');
        await third.openFile(file);
        const ids = [first, second, third].map(
            (leaf) => (leaf as unknown as { id: string }).id,
        );
        app.workspace.setActiveLeaf(first, { focus: true });
        return ids;
    })) as string[];
}

async function setActiveLeaf(id: string): Promise<void> {
    await browser.executeObsidian(({ app }, leafId: string) => {
        app.workspace.iterateAllLeaves((leaf) => {
            if ((leaf as unknown as { id?: string }).id === leafId) {
                app.workspace.setActiveLeaf(leaf, { focus: true });
            }
        });
    }, id);
}

async function waitForMirror(path: string): Promise<void> {
    await browser.waitUntil(
        async () => {
            const name = (await request('nvim_buf_get_name', [0])) as string;
            return name.endsWith(`/${path}`);
        },
        { timeout: 5000, interval: 100 },
    );
}

async function installLeafObserver(): Promise<void> {
    await browser.executeObsidian(({ app }) => {
        const workspace = app.workspace as typeof app.workspace & {
            vimMotionsLeafActions?: number;
            vimMotionsLeafObserver?: Parameters<typeof app.workspace.offref>[0];
        };
        if (workspace.vimMotionsLeafObserver) {
            app.workspace.offref(workspace.vimMotionsLeafObserver);
        }
        workspace.vimMotionsLeafActions = 0;
        workspace.vimMotionsLeafObserver = app.workspace.on(
            'active-leaf-change',
            () => {
                workspace.vimMotionsLeafActions =
                    (workspace.vimMotionsLeafActions ?? 0) + 1;
            },
        );
    });
}

async function removeLeafObserver(): Promise<void> {
    await browser.executeObsidian(({ app }) => {
        const workspace = app.workspace as typeof app.workspace & {
            vimMotionsLeafActions?: number;
            vimMotionsLeafObserver?: Parameters<typeof app.workspace.offref>[0];
        };
        if (workspace.vimMotionsLeafObserver) {
            app.workspace.offref(workspace.vimMotionsLeafObserver);
        }
        delete workspace.vimMotionsLeafObserver;
        delete workspace.vimMotionsLeafActions;
    });
}

async function leafObserverActions(): Promise<number> {
    return (await browser.executeObsidian(({ app }) => {
        return (
            app.workspace as typeof app.workspace & {
                vimMotionsLeafActions?: number;
            }
        ).vimMotionsLeafActions;
    })) as number;
}

async function closePickerInstance(): Promise<void> {
    const inputElement = browser.$('.vim-motions-picker-input');
    if (await inputElement.isExisting()) {
        await inputElement.click();
        await browser.keys(['Escape']);
        await browser.waitUntil(
            async () =>
                !(await browser
                    .$('.vim-motions-prompt-modal-container')
                    .isExisting()),
            { timeout: 5000, interval: 100 },
        );
    }
}

interface PickerObservation {
    query: string;
    source: string;
}

async function installPickerObserver(): Promise<void> {
    await browser.executeObsidian(({ app }) => {
        const workspace = app.workspace as typeof app.workspace & {
            vimMotionsPickerObservation?: PickerObservation | null;
            vimMotionsPickerObserver?: MutationObserver;
        };
        workspace.vimMotionsPickerObserver?.disconnect();
        workspace.vimMotionsPickerObservation = null;
        const capture = () => {
            const modal = document.querySelector(
                '.vim-motions-prompt-modal-container',
            );
            const source = modal?.querySelector(
                '.vim-motions-picker-title',
            )?.textContent;
            const input = modal?.querySelector('.vim-motions-picker-input');
            if (!source || !(input instanceof HTMLInputElement)) return;
            workspace.vimMotionsPickerObservation = {
                query: input.value,
                source,
            };
        };
        workspace.vimMotionsPickerObserver = new MutationObserver(capture);
        workspace.vimMotionsPickerObserver.observe(document.body, {
            childList: true,
            subtree: true,
        });
        capture();
    });
}

async function removePickerObserver(): Promise<void> {
    await browser.executeObsidian(({ app }) => {
        const workspace = app.workspace as typeof app.workspace & {
            vimMotionsPickerObservation?: PickerObservation | null;
            vimMotionsPickerObserver?: MutationObserver;
        };
        workspace.vimMotionsPickerObserver?.disconnect();
        delete workspace.vimMotionsPickerObserver;
        delete workspace.vimMotionsPickerObservation;
    });
}

async function waitForPicker(): Promise<PickerObservation> {
    await browser.waitUntil(
        async () =>
            (await browser.executeObsidian(({ app }) => {
                return (
                    app.workspace as typeof app.workspace & {
                        vimMotionsPickerObservation?: PickerObservation | null;
                    }
                ).vimMotionsPickerObservation;
            })) !== null,
        { timeout: 5000, interval: 100 },
    );
    const observation = (await browser.executeObsidian(({ app }) => {
        return (
            app.workspace as typeof app.workspace & {
                vimMotionsPickerObservation?: PickerObservation | null;
            }
        ).vimMotionsPickerObservation;
    })) as PickerObservation | null;
    if (!observation) throw new Error('Picker observer captured no action');
    return observation;
}

async function installSidebarObserver(): Promise<void> {
    await browser.executeObsidian(({ app }) => {
        const commands = app.commands as typeof app.commands & {
            vimMotionsBridgeOriginal?: typeof app.commands.executeCommandById;
            vimMotionsSidebarActions?: number;
        };
        if (!commands.vimMotionsBridgeOriginal) {
            commands.vimMotionsBridgeOriginal = commands.executeCommandById;
            commands.executeCommandById = function (id: string): boolean {
                if (id === 'app:toggle-left-sidebar') {
                    commands.vimMotionsSidebarActions =
                        (commands.vimMotionsSidebarActions ?? 0) + 1;
                }
                return commands.vimMotionsBridgeOriginal!.call(this, id);
            };
        }
        commands.vimMotionsSidebarActions = 0;
    });
}

async function removeSidebarObserver(): Promise<void> {
    await browser.executeObsidian(({ app }) => {
        const commands = app.commands as typeof app.commands & {
            vimMotionsBridgeOriginal?: typeof app.commands.executeCommandById;
            vimMotionsSidebarActions?: number;
        };
        if (commands.vimMotionsBridgeOriginal) {
            commands.executeCommandById = commands.vimMotionsBridgeOriginal;
        }
        delete commands.vimMotionsBridgeOriginal;
        delete commands.vimMotionsSidebarActions;
    });
}

async function sidebarSnapshot(): Promise<{
    actions: number;
    collapsed: boolean;
}> {
    return (await browser.executeObsidian(({ app }) => {
        const commands = app.commands as typeof app.commands & {
            vimMotionsSidebarActions?: number;
        };
        const workspace = app.workspace as typeof app.workspace & {
            leftSplit: { collapsed: boolean };
        };
        return {
            actions: commands.vimMotionsSidebarActions ?? 0,
            collapsed: workspace.leftSplit.collapsed,
        };
    })) as { actions: number; collapsed: boolean };
}

describe('Neovim RPC Obsidian feature bridge', function () {
    before(function () {
        requireRpcPrerequisites(this);
    });

    this.timeout(300000);

    beforeEach(async () => {
        await setRpcEnabled(false);
        await loadSingleFileWorkspace('Welcome.md');
        await setupEditor('sidebar\n\n# Next heading\nbody', {
            line: 0,
            ch: 0,
        });
        await browser.executeObsidian(({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins: { plugins: Record<string, RpcPlugin> };
                }
            ).plugins.plugins['vim-motions'];
            if (!plugin) throw new Error('Vim Motions is not loaded');
            plugin.harpoonStore.load([]);
            plugin.jumpList.clear();
            (
                app.vault as unknown as {
                    setConfig(key: string, value: unknown): void;
                }
            ).setConfig('propertiesInDocument', 'source');
        });
        await setRpcEnabled(true);
        await waitForConnected();
    });

    afterEach(async () => {
        await closePickerInstance();
        await removePickerObserver();
        await removeSidebarObserver();
        await removeLeafObserver();
        await setRpcEnabled(false);
        await loadSingleFileWorkspace('Welcome.md');
        await removeRpcNotes();
        for (const pid of spawnedPids) {
            if (pidIsAlive(pid)) process.kill(pid, 'SIGKILL');
            spawnedPids.delete(pid);
        }
    });

    it('lets the picker modal handle selection and re-seeds Neovim with the selected file', async () => {
        const targetContent = (await browser.executeObsidian(
            async ({ app }) => {
                const target = app.vault.getFileByPath('Target.md');
                if (!target) throw new Error('Target.md is absent');
                return app.vault.cachedRead(target);
            },
        )) as string;
        await input('\\ff');
        const modal = browser.$('.vim-motions-prompt-modal-container');
        await modal.waitForExist({ timeout: 5000 });
        expect(await modal.isExisting()).toBe(true);

        const pickerInput = browser.$('.vim-motions-picker-input');
        await pickerInput.setValue('Target');
        await browser.waitUntil(
            async () =>
                (await browser.executeObsidian(
                    () =>
                        document.querySelectorAll('.vim-motions-picker-item')
                            .length,
                )) === 1,
            { timeout: 5000, interval: 100 },
        );
        await pickerInput.click();
        await browser.keys(['Enter']);
        try {
            await browser.waitUntil(
                async () => {
                    if ((await getActiveFile()) !== 'Target.md') return false;
                    const name = (await request(
                        'nvim_buf_get_name',
                        [0],
                    )) as string;
                    const lines = (await request('nvim_buf_get_lines', [
                        0,
                        0,
                        -1,
                        true,
                    ])) as string[];
                    return (
                        name.endsWith('/Target.md') &&
                        lines.join('\n') === targetContent
                    );
                },
                {
                    timeout: 5000,
                    interval: 100,
                },
            );
        } catch {
            throw new Error(
                `Picker re-seed failed: ${JSON.stringify({
                    activeFile: await getActiveFile(),
                    neovimFile: await request('nvim_buf_get_name', [0]),
                    neovimText: (
                        (await request('nvim_buf_get_lines', [
                            0,
                            0,
                            -1,
                            true,
                        ])) as string[]
                    ).join('\n'),
                })}`,
            );
        }
        expect({
            activeFile: await getActiveFile(),
            neovimText: (
                (await request('nvim_buf_get_lines', [
                    0,
                    0,
                    -1,
                    true,
                ])) as string[]
            ).join('\n'),
        }).toEqual({ activeFile: 'Target.md', neovimText: targetContent });
    });

    it('opens every Batch 2 leader picker on its expected source', async () => {
        const cases = [
            ['\\fg', 'Livegrep'],
            ['\\fb', 'Buffers'],
            ['\\fh', 'Headings'],
            ['\\fo', 'Outline'],
            ['\\fk', 'Backlinks'],
            ['\\ft', 'Tags'],
            ['\\fr', 'Recent'],
            ['\\fm', 'Marks'],
            ['\\fR', 'Registers'],
            ['\\fp', 'Registers'],
        ] as const;
        const observed: PickerObservation[] = [];
        for (const [keys, source] of cases) {
            await installPickerObserver();
            await input(keys);
            observed.push(await waitForPicker());
            await removePickerObserver();
            await closePickerInstance();
            expect(observed.at(-1)?.source).toBe(source);
        }
        expect(observed.map((item) => item.source)).toEqual(
            cases.map(([, source]) => source),
        );
    });

    it('routes lowercase buffers to the buffers picker', async () => {
        await installPickerObserver();
        await input(':buffers<CR>');
        expect(await waitForPicker()).toEqual({ query: '', source: 'Buffers' });
    });

    it('forwards the grep query string to the grep picker', async () => {
        await installPickerObserver();
        await input(':grep foo<CR>');
        expect(await waitForPicker()).toEqual({ query: 'foo', source: 'Grep' });
    });

    it('routes Picker source arguments to the requested picker', async () => {
        await installPickerObserver();
        await input(':Picker headings<CR>');
        expect(await waitForPicker()).toEqual({
            query: '',
            source: 'Headings',
        });
    });

    it('does not expand buffers inside a substitution or open a picker', async () => {
        await request('nvim_buf_set_lines', [0, 0, -1, true, ['buffers']]);
        await installPickerObserver();
        await input(':%s/buffers/x/<CR>');
        await request('nvim_get_mode', []);
        const lines = (await request('nvim_buf_get_lines', [
            0,
            0,
            -1,
            true,
        ])) as string[];
        const observation = await browser.executeObsidian(({ app }) => {
            return (
                app.workspace as typeof app.workspace & {
                    vimMotionsPickerObservation?: PickerObservation | null;
                }
            ).vimMotionsPickerObservation;
        });
        expect({ picker: observation, text: lines.join('\n') }).toEqual({
            picker: null,
            text: 'x',
        });
    });

    it('opens Oil through Neovim and opens the selected entry', async () => {
        await input(':Oil<CR>');
        await browser.waitUntil(
            async () => (await getActiveViewType()) === 'oil-explorer',
            { timeout: 5000, interval: 100 },
        );
        expect(await getActiveViewType()).toBe('oil-explorer');

        await browser.executeObsidian(({ app }) => {
            const view = app.workspace.getMostRecentLeaf()?.view as unknown as {
                getBufferContent(): string;
                getEditorView(): {
                    dispatch(spec: { selection: { anchor: number } }): void;
                    focus(): void;
                    state: {
                        doc: {
                            line(number: number): { from: number };
                        };
                    };
                };
            };
            const lines = view.getBufferContent().split('\n');
            const index = lines.findIndex((line) => line.includes('Target.md'));
            if (index < 0) throw new Error('Target.md is absent from Oil');
            const editor = view.getEditorView();
            editor.dispatch({
                selection: { anchor: editor.state.doc.line(index + 1).from },
            });
            editor.focus();
        });
        await browser.keys(['Enter']);
        await browser.waitUntil(
            async () => (await getActiveFile()) === 'Target.md',
            {
                timeout: 5000,
                interval: 100,
            },
        );
        expect(await getActiveFile()).toBe('Target.md');
    });

    it('returns to Harpoon slot one at its stored cursor', async () => {
        await browser.keys(['j', 'j', 'l', 'l']);
        await browser.waitUntil(
            async () => {
                const cursor = await getCursorPos();
                return cursor.line === 2 && cursor.ch === 2;
            },
            { timeout: 5000, interval: 100 },
        );
        await browser.executeObsidian(async ({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins: { plugins: Record<string, RpcPlugin> };
                }
            ).plugins.plugins['vim-motions'];
            if (!plugin) throw new Error('Vim Motions is not loaded');
            plugin.harpoonStore.add('Welcome.md', 2, 2);
            const target = app.vault.getFileByPath('Target.md');
            if (!target) throw new Error('Target.md is absent');
            await app.workspace.getLeaf('tab').openFile(target);
        });
        await browser.waitUntil(
            async () => (await getActiveFile()) === 'Target.md',
            {
                timeout: 5000,
                interval: 100,
            },
        );

        await input('\\1');
        await browser.waitUntil(
            async () => (await getActiveFile()) === 'Welcome.md',
            {
                timeout: 5000,
                interval: 100,
            },
        );
        try {
            await browser.waitUntil(
                async () => {
                    const cursor = await getCursorPos();
                    return cursor.line === 2 && cursor.ch === 2;
                },
                { timeout: 5000, interval: 100 },
            );
        } catch {
            const pin = await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins: { plugins: Record<string, RpcPlugin> };
                    }
                ).plugins.plugins['vim-motions'];
                return (
                    plugin?.harpoonStore as unknown as {
                        get(index: number): unknown;
                    }
                ).get(0);
            });
            throw new Error(
                `Harpoon cursor did not restore: ${JSON.stringify({ cursor: await getCursorPos(), pin })}`,
            );
        }
        expect(await getCursorPos()).toEqual({ line: 2, ch: 2 });
    });

    it('creates exactly one leaf through the generated vertical-split mapping', async () => {
        const before = await getWorkspaceSnapshot();
        await input('<C-w>v');
        await browser.waitUntil(
            async () =>
                (await getWorkspaceSnapshot()).markdownLeafCount ===
                before.markdownLeafCount + 1,
            { timeout: 5000, interval: 100 },
        );
        expect((await getWorkspaceSnapshot()).markdownLeafCount).toBe(
            before.markdownLeafCount + 1,
        );
    });

    it('creates exactly one leaf through the generated horizontal-split mapping', async () => {
        const before = await getWorkspaceSnapshot();
        await input('<C-w>s');
        await browser.waitUntil(
            async () =>
                (await getWorkspaceSnapshot()).markdownLeafCount ===
                before.markdownLeafCount + 1,
            { timeout: 5000, interval: 100 },
        );
        expect((await getWorkspaceSnapshot()).markdownLeafCount).toBe(
            before.markdownLeafCount + 1,
        );
    });

    it('focuses the expected pane in all four directions', async () => {
        const result = await browser.executeObsidian(async ({ app }) => {
            const original = app.workspace.getMostRecentLeaf();
            if (!original) throw new Error('No active leaf');
            app.commands.executeCommandById('workspace:split-vertical');
            await new Promise((resolvePromise) =>
                window.setTimeout(resolvePromise, 100),
            );
            const vertical = app.workspace
                .getLeavesOfType('markdown')
                .map((leaf) => ({
                    id: (leaf as unknown as { id: string }).id,
                    left: leaf.containerEl.getBoundingClientRect().left,
                }))
                .sort((a, b) => a.left - b.left);
            return vertical;
        });
        const vertical = result as Array<{ id: string; left: number }>;
        const left = vertical[0]?.id;
        const right = vertical.at(-1)?.id;
        if (!left || !right || left === right) {
            throw new Error(
                `Invalid vertical layout: ${JSON.stringify(vertical)}`,
            );
        }
        await setActiveLeaf(right);
        await input('<C-w>h');
        await browser.waitUntil(
            async () => (await getWorkspaceSnapshot()).activeLeafId === left,
            { timeout: 5000, interval: 100 },
        );
        await input('<C-w>l');
        await browser.waitUntil(
            async () => (await getWorkspaceSnapshot()).activeLeafId === right,
            { timeout: 5000, interval: 100 },
        );

        const horizontal = (await browser.executeObsidian(async ({ app }) => {
            const active = app.workspace.getMostRecentLeaf();
            app.workspace.iterateAllLeaves((leaf) => {
                if (leaf !== active) leaf.detach();
            });
            app.commands.executeCommandById('workspace:split-horizontal');
            await new Promise((resolvePromise) =>
                window.setTimeout(resolvePromise, 100),
            );
            return app.workspace
                .getLeavesOfType('markdown')
                .map((leaf) => ({
                    id: (leaf as unknown as { id: string }).id,
                    top: leaf.containerEl.getBoundingClientRect().top,
                }))
                .sort((a, b) => a.top - b.top);
        })) as Array<{ id: string; top: number }>;
        const top = horizontal[0]?.id;
        const bottom = horizontal.at(-1)?.id;
        if (!top || !bottom || top === bottom) {
            throw new Error(
                `Invalid horizontal layout: ${JSON.stringify(horizontal)}`,
            );
        }
        await setActiveLeaf(bottom);
        await input('<C-w>k');
        await browser.waitUntil(
            async () => (await getWorkspaceSnapshot()).activeLeafId === top,
            { timeout: 5000, interval: 100 },
        );
        await input('<C-w>j');
        await browser.waitUntil(
            async () => (await getWorkspaceSnapshot()).activeLeafId === bottom,
            { timeout: 5000, interval: 100 },
        );
        expect((await getWorkspaceSnapshot()).activeLeafId).toBe(bottom);
    });

    it('forwards the count from 3gt and lands on tab three', async () => {
        const tabs = await createThreeTabs();
        await waitForMirror('Welcome.md');
        await installLeafObserver();
        await input('3gt');
        await browser.waitUntil(async () => (await leafObserverActions()) > 0, {
            timeout: 5000,
            interval: 100,
        });
        expect((await getWorkspaceSnapshot()).activeLeafId).toBe(tabs[2]);
    });

    it('routes gototab with its target argument', async () => {
        const tabs = await createThreeTabs();
        await installLeafObserver();
        await input(':gototab 2<CR>');
        await browser.waitUntil(
            async () =>
                (await getWorkspaceSnapshot()).activeLeafId === tabs[1] &&
                (await leafObserverActions()) > 0,
            { timeout: 5000, interval: 100 },
        );
        expect((await getWorkspaceSnapshot()).activeLeafId).toBe(tabs[1]);
    });

    it('routes lowercase nexttab through Neovim', async () => {
        const tabs = await createThreeTabs();
        await installLeafObserver();
        await input(':nexttab<CR>');
        await browser.waitUntil(
            async () =>
                (await getWorkspaceSnapshot()).activeLeafId === tabs[1] &&
                (await leafObserverActions()) > 0,
            { timeout: 5000, interval: 100 },
        );
        expect((await getWorkspaceSnapshot()).activeLeafId).toBe(tabs[1]);
    });

    it('does not expand nexttab inside a substitution or change tabs', async () => {
        const tabs = await createThreeTabs();
        await waitForMirror('Welcome.md');
        await request('nvim_buf_set_lines', [0, 0, -1, true, ['nexttab']]);
        await input(':%s/nexttab/x/<CR>');
        await request('nvim_get_mode', []);
        const lines = (await request('nvim_buf_get_lines', [
            0,
            0,
            -1,
            true,
        ])) as string[];
        expect({
            activeLeafId: (await getWorkspaceSnapshot()).activeLeafId,
            text: lines.join('\n'),
        }).toEqual({ activeLeafId: tabs[0], text: 'x' });
    });

    it('opens the wikilink under the cursor through gotoDefinition', async () => {
        await request('nvim_buf_set_lines', [0, 0, -1, true, ['[[Target]]']]);
        await request('nvim_win_set_cursor', [0, [1, 2]]);
        await browser.waitUntil(
            async () => (await getEditorValue()) === '[[Target]]',
            { timeout: 5000, interval: 100 },
        );
        await input('gd');
        await browser.waitUntil(
            async () => (await getActiveFile()) === 'Target.md',
            { timeout: 5000, interval: 100 },
        );
        expect(await getActiveFile()).toBe('Target.md');
    });

    it('moves the cursor to the next heading through the generated mapping', async () => {
        await input(']h');
        await browser.waitUntil(async () => (await getCursorPos()).line === 2, {
            timeout: 5000,
            interval: 100,
        });
        expect(await getCursorPos()).toEqual({ line: 2, ch: 0 });
    });

    it('routes the lowercase sidebar ex command to observable host state', async () => {
        await installSidebarObserver();
        const before = await sidebarSnapshot();
        await input(':sidebar left<CR>');
        await browser.waitUntil(
            async () => (await sidebarSnapshot()).actions === 1,
            { timeout: 5000, interval: 100 },
        );
        const after = await sidebarSnapshot();
        expect(after).toEqual({ actions: 1, collapsed: !before.collapsed });
    });

    it('does not expand a lowercase command abbreviation inside a substitution', async () => {
        await installSidebarObserver();
        await input(':%s/sidebar/x/<CR>');
        await browser.waitUntil(
            async () => {
                const lines = (await request('nvim_buf_get_lines', [
                    0,
                    0,
                    1,
                    true,
                ])) as string[];
                return lines[0] === 'x';
            },
            { timeout: 5000, interval: 100 },
        );
        const firstLine = (await request('nvim_buf_get_lines', [
            0,
            0,
            1,
            true,
        ])) as string[];
        expect({
            firstLine: firstLine[0],
            sidebarActions: (await sidebarSnapshot()).actions,
        }).toEqual({
            firstLine: 'x',
            sidebarActions: 0,
        });
    });

    it('opens Harpoon slot two at its stored file and cursor', async () => {
        await prepareRpcNotes();
        await seedHarpoon([
            null,
            { filePath: RPC_NOTES[0].path, row: 1, col: 6 },
        ]);
        await openRpcNote(RPC_NOTES[1].path, { line: 0, ch: 1 });
        await installLeafObserver();
        await input('\\2');
        await waitForRpcLocation(RPC_NOTES[0].path, { line: 1, ch: 6 });
        expect({
            cursor: await getCursorPos(),
            file: await getActiveFile(),
            hostActions: await leafObserverActions(),
        }).toEqual({
            cursor: { line: 1, ch: 6 },
            file: RPC_NOTES[0].path,
            hostActions: 1,
        });
    });

    it('forwards the HarpoonSelect slot argument', async () => {
        await prepareRpcNotes();
        await seedHarpoon([
            { filePath: RPC_NOTES[1].path, row: 0, col: 1 },
            { filePath: RPC_NOTES[0].path, row: 1, col: 7 },
        ]);
        await openRpcNote(RPC_NOTES[2].path, { line: 0, ch: 2 });
        await installLeafObserver();
        await input(':HarpoonSelect 2<CR>');
        await waitForRpcLocation(RPC_NOTES[0].path, { line: 1, ch: 7 });
        expect({
            cursor: await getCursorPos(),
            file: await getActiveFile(),
            hostActions: await leafObserverActions(),
        }).toEqual({
            cursor: { line: 1, ch: 7 },
            file: RPC_NOTES[0].path,
            hostActions: 1,
        });
    });

    it('distinguishes current-file and explicit-slot HarpoonRemove', async () => {
        await prepareRpcNotes();
        await seedHarpoon([
            { filePath: RPC_NOTES[0].path, row: 0, col: 0 },
            { filePath: RPC_NOTES[1].path, row: 0, col: 0 },
            { filePath: RPC_NOTES[2].path, row: 0, col: 0 },
        ]);
        await openRpcNote(RPC_NOTES[1].path, { line: 0, ch: 0 });
        await input(':HarpoonRemove<CR>');
        await browser.waitUntil(
            async () => (await getHarpoonSlots()).length === 2,
            { timeout: 5000, interval: 100 },
        );
        const afterCurrent = await getHarpoonSlots();
        await input(':HarpoonRemove 1<CR>');
        await browser.waitUntil(
            async () => (await getHarpoonSlots()).length === 1,
            { timeout: 5000, interval: 100 },
        );
        expect({
            afterCurrent,
            afterExplicit: await getHarpoonSlots(),
        }).toEqual({
            afterCurrent: [
                { index: 0, filePath: RPC_NOTES[0].path },
                { index: 2, filePath: RPC_NOTES[2].path },
            ],
            afterExplicit: [{ index: 2, filePath: RPC_NOTES[2].path }],
        });
    });

    it('cycles Harpoon next and previous across stored file cursors', async () => {
        await prepareRpcNotes();
        await seedHarpoon([
            { filePath: RPC_NOTES[0].path, row: 1, col: 2 },
            { filePath: RPC_NOTES[1].path, row: 1, col: 3 },
            { filePath: RPC_NOTES[2].path, row: 1, col: 4 },
        ]);
        await openRpcNote(RPC_NOTES[0].path, { line: 0, ch: 0 });
        const observations: Array<{
            file: string | null;
            cursor: { line: number; ch: number };
        }> = [];
        for (const [keys, path, cursor] of [
            ['\\hn', RPC_NOTES[1].path, { line: 1, ch: 3 }],
            ['\\hn', RPC_NOTES[2].path, { line: 1, ch: 4 }],
            ['\\hN', RPC_NOTES[1].path, { line: 1, ch: 3 }],
        ] as const) {
            await input(keys);
            await waitForRpcLocation(path, cursor);
            observations.push({
                file: await getActiveFile(),
                cursor: await getCursorPos(),
            });
        }
        expect(observations).toEqual([
            {
                file: RPC_NOTES[1].path,
                cursor: { line: 1, ch: 3 },
            },
            {
                file: RPC_NOTES[2].path,
                cursor: { line: 1, ch: 4 },
            },
            {
                file: RPC_NOTES[1].path,
                cursor: { line: 1, ch: 3 },
            },
        ]);
    });

    it('uses the host jumplist for two cross-note older jumps', async () => {
        await prepareRpcNotes();
        await openRpcNote(RPC_NOTES[2].path, { line: 1, ch: 4 });
        await seedJumpList([
            { filePath: RPC_NOTES[0].path, line: 1, ch: 2 },
            { filePath: RPC_NOTES[1].path, line: 1, ch: 3 },
            { filePath: RPC_NOTES[2].path, line: 1, ch: 4 },
        ]);
        const observations: Array<{
            file: string | null;
            cursor: { line: number; ch: number };
            neovimText: string;
        }> = [];
        for (const [path, cursor, text] of [
            [RPC_NOTES[1].path, { line: 1, ch: 3 }, RPC_NOTES[1].content],
            [RPC_NOTES[0].path, { line: 1, ch: 2 }, RPC_NOTES[0].content],
        ] as const) {
            await input('<C-o>');
            await waitForRpcLocation(path, cursor);
            await waitForMirror(path);
            observations.push({
                file: await getActiveFile(),
                cursor: await getCursorPos(),
                neovimText: await getNeovimText(),
            });
            expect(observations.at(-1)).toEqual({
                file: path,
                cursor,
                neovimText: text,
            });
        }
        expect(observations.map(({ file }) => file)).toEqual([
            RPC_NOTES[1].path,
            RPC_NOTES[0].path,
        ]);
    });

    it('forwards the count from 2<C-o> to the host jumplist', async () => {
        await prepareRpcNotes();
        await openRpcNote(RPC_NOTES[2].path, { line: 1, ch: 4 });
        await seedJumpList([
            { filePath: RPC_NOTES[0].path, line: 1, ch: 2 },
            { filePath: RPC_NOTES[1].path, line: 1, ch: 3 },
            { filePath: RPC_NOTES[2].path, line: 1, ch: 4 },
        ]);
        await input('2<C-o>');
        await waitForRpcLocation(RPC_NOTES[0].path, { line: 1, ch: 2 });
        await waitForMirror(RPC_NOTES[0].path);
        expect({
            cursor: await getCursorPos(),
            file: await getActiveFile(),
            neovimText: await getNeovimText(),
        }).toEqual({
            cursor: { line: 1, ch: 2 },
            file: RPC_NOTES[0].path,
            neovimText: RPC_NOTES[0].content,
        });
    });

    it('shows the cross-note jump list through lowercase jumps', async () => {
        await prepareRpcNotes();
        await seedJumpList([
            { filePath: RPC_NOTES[0].path, line: 1, ch: 2 },
            { filePath: RPC_NOTES[1].path, line: 1, ch: 3 },
        ]);
        await input(':jumps<CR>');
        const title = browser.$('.vim-motions-info-modal-title');
        await title.waitForExist({ timeout: 5000 });
        const modalText = await browser.$('.modal-container').getText();
        expect({
            hasA: modalText.includes(RPC_NOTES[0].path),
            hasB: modalText.includes(RPC_NOTES[1].path),
            title: await title.getText(),
        }).toEqual({ hasA: true, hasB: true, title: 'Jumps' });
        await closeInfoModalInstance();
    });

    it('removes a mark and refreshes the sign-column gutter', async () => {
        await setHostMark('a');
        await input(':delmarks a<CR>');
        try {
            await browser.waitUntil(
                async () => {
                    const snapshot = await getMarkSnapshot();
                    return (
                        !snapshot.marks.includes('a') &&
                        !snapshot.gutter.some((label) => label.includes('a'))
                    );
                },
                { timeout: 5000, interval: 100 },
            );
        } catch {
            throw new Error(
                `Mark gutter did not refresh: ${JSON.stringify(await getMarkSnapshot())}`,
            );
        }
        expect(await getMarkSnapshot()).toEqual({ gutter: [], marks: [] });
    });

    it('does not expand marks inside a substitution or open a picker', async () => {
        await request('nvim_buf_set_lines', [0, 0, -1, true, ['marks']]);
        await installPickerObserver();
        await input(':%s/marks/x/<CR>');
        await request('nvim_get_mode', []);
        const observation = await browser.executeObsidian(({ app }) => {
            return (
                app.workspace as typeof app.workspace & {
                    vimMotionsPickerObservation?: PickerObservation | null;
                }
            ).vimMotionsPickerObservation;
        });
        expect({ picker: observation, text: await getNeovimText() }).toEqual({
            picker: null,
            text: 'x',
        });
    });

    it('replaces generated entries rather than duplicating them on bridge refresh', async () => {
        const before = await bridgeInventory();
        const refreshError = await browser.executeObsidian(async ({ app }) => {
            const plugin = (
                app as unknown as {
                    plugins: { plugins: Record<string, RpcPlugin> };
                }
            ).plugins.plugins['vim-motions'];
            if (!plugin) throw new Error('Vim Motions is not loaded');
            (
                plugin as unknown as {
                    registration: { unregisterLeaderBindings(): void };
                }
            ).registration.unregisterLeaderBindings();
            try {
                await plugin.refreshNeovimFeatureBridge();
                return null;
            } catch (error) {
                return error instanceof Error ? error.message : String(error);
            }
        });
        const after = await bridgeInventory();
        const leavesBeforeAction = (await getWorkspaceSnapshot())
            .markdownLeafCount;
        await input('<C-w>v');
        await browser.waitUntil(
            async () =>
                (await getWorkspaceSnapshot()).markdownLeafCount >
                leavesBeforeAction,
            { timeout: 5000, interval: 100 },
        );
        const createdLeaves =
            (await getWorkspaceSnapshot()).markdownLeafCount -
            leavesBeforeAction;
        expect({
            createdLeaves,
            entriesPresent:
                after.abbreviations > 0 &&
                after.commands > 0 &&
                after.mappings > 0,
            inventoryStable:
                before.abbreviations === BRIDGE_ABBREVIATIONS.length &&
                before.commands === BRIDGE_COMMANDS.length &&
                before.leaderMappings === BRIDGE_LEADER_MAPPINGS.length &&
                after.abbreviations === before.abbreviations &&
                after.commands === before.commands &&
                after.leaderMappings === 0 &&
                after.mappings === before.mappings - before.leaderMappings,
            refreshError,
        }).toEqual({
            createdLeaves: 1,
            entriesPresent: true,
            inventoryStable: true,
            refreshError: null,
        });
    });
});
