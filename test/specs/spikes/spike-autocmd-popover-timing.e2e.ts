/**
 * Spike: Autocmd events in popover editors and timing analysis
 *
 * Investigates two hypotheses for the user's "only works in main editor" report:
 *
 * 1. Popover editors (hover-preview click-in) do NOT trigger active-leaf-change,
 *    so LeafEnter/BufEnter autocmds never fire for them.
 *
 * 2. The timing chain for autocmd → IME switch stacks multiple delays:
 *    LeafEnter debounce (50ms) + vim.schedule (0ms) + IME debounce (50ms)
 *    = ~100ms minimum before IME binary starts. On weaker hardware with a
 *    slow binary, the perceived mode may appear stuck.
 *
 * Also tests whether the page-preview popover creates a separate leaf or
 * is a non-leaf DOM overlay (which would explain missing events entirely).
 */

import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';

import {
    loadLuaConfig,
    PAUSE,
    sendVimEscape,
    getPluginSetting,
    setPluginSetting,
    setupEditor,
} from '../../helpers';

async function focusLeaf(leafId: string): Promise<boolean> {
    return (await browser.executeObsidian(({ app }, id: string) => {
        let targetLeaf: unknown = null;
        app.workspace.iterateAllLeaves((leaf: unknown) => {
            const l = leaf as { id?: string };
            if (l.id === id) targetLeaf = leaf;
        });
        if (!targetLeaf) return false;
        app.workspace.setActiveLeaf(
            targetLeaf as Parameters<typeof app.workspace.setActiveLeaf>[0],
            { focus: true },
        );
        return true;
    }, leafId)) as boolean;
}

async function getLeafSnapshot(): Promise<
    Array<{ id: string; type: string; file: string | null }>
> {
    return (await browser.executeObsidian(({ app }) => {
        const leaves: Array<{
            id: string;
            type: string;
            file: string | null;
        }> = [];
        app.workspace.iterateAllLeaves((leaf: unknown) => {
            const l = leaf as {
                id?: string;
                view?: { getViewType?: () => string; file?: { path?: string } };
            };
            leaves.push({
                id: l.id ?? 'unknown',
                type: l.view?.getViewType?.() ?? 'unknown',
                file: l.view?.file?.path ?? null,
            });
        });
        return leaves;
    })) as Array<{ id: string; type: string; file: string | null }>;
}

async function triggerHoverPopover(): Promise<{
    popoverFound: boolean;
    hasEditor: boolean;
    leafCountBefore: number;
    leafCountAfter: number;
}> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const leafCountBefore =
            app.workspace.getLeavesOfType('markdown').length;

        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) {
            return {
                popoverFound: false,
                hasEditor: false,
                leafCountBefore,
                leafCountAfter: leafCountBefore,
            };
        }

        const linkEl = view.containerEl.querySelector(
            '.cm-hmd-internal-link, .cm-underline',
        );
        if (!linkEl) {
            return {
                popoverFound: false,
                hasEditor: false,
                leafCountBefore,
                leafCountAfter: leafCountBefore,
            };
        }

        app.workspace.trigger('hover-link', {
            event: new MouseEvent('mouseover'),
            source: 'preview',
            hoverParent: view,
            targetEl: linkEl,
            linktext: 'Target',
            sourcePath: view.file?.path ?? '',
        });

        return {
            popoverFound: true,
            hasEditor: false,
            leafCountBefore,
            leafCountAfter: app.workspace.getLeavesOfType('markdown').length,
        };
    })) as {
        popoverFound: boolean;
        hasEditor: boolean;
        leafCountBefore: number;
        leafCountAfter: number;
    };
}

async function checkPopoverState(): Promise<{
    popoverExists: boolean;
    popoverHasEditor: boolean;
    popoverLeafId: string | null;
    totalLeafCount: number;
}> {
    return (await browser.executeObsidian(({ app }) => {
        const popoverEl = document.querySelector('.hover-popover');
        const popoverEditor = popoverEl?.querySelector('.cm-editor');
        const totalLeafCount = app.workspace.getLeavesOfType('markdown').length;

        let popoverLeafId: string | null = null;
        if (popoverEl) {
            app.workspace.iterateAllLeaves((leaf: unknown) => {
                const l = leaf as {
                    id?: string;
                    view?: { containerEl?: HTMLElement };
                };
                if (
                    l.view?.containerEl &&
                    popoverEl.contains(l.view.containerEl)
                ) {
                    popoverLeafId = l.id ?? null;
                }
            });
        }

        return {
            popoverExists: !!popoverEl,
            popoverHasEditor: !!popoverEditor,
            popoverLeafId,
            totalLeafCount,
        };
    })) as {
        popoverExists: boolean;
        popoverHasEditor: boolean;
        popoverLeafId: string | null;
        totalLeafCount: number;
    };
}

describe('Spike: Popover editors and autocmd timing', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
    });

    afterEach(async function () {
        await sendVimEscape();
        await browser.pause(PAUSE.MODE_SWITCH);
    });

    describe('Popover editor discovery', function () {
        it('should have a link in Welcome.md to hover over', async function () {
            const hasLink = await browser.executeObsidian(
                ({ app, obsidian }) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return false;
                    const linkEl = view.containerEl.querySelector(
                        '.cm-hmd-internal-link, .cm-underline, .internal-link',
                    );
                    return !!linkEl;
                },
            );
            console.log(`[spike] Welcome.md has internal link: ${hasLink}`);
        });

        it('should detect whether hover popover creates a new leaf', async function () {
            const beforeLeaves = await getLeafSnapshot();
            console.log(
                `[spike] Leaves before hover: ${JSON.stringify(beforeLeaves.map((l) => l.id))}`,
            );

            const result = await triggerHoverPopover();
            console.log(
                `[spike] Hover trigger result: ${JSON.stringify(result)}`,
            );

            await browser.pause(1000);

            const popoverState = await checkPopoverState();
            console.log(
                `[spike] Popover state: ${JSON.stringify(popoverState)}`,
            );

            const afterLeaves = await getLeafSnapshot();
            console.log(
                `[spike] Leaves after hover: ${JSON.stringify(afterLeaves.map((l) => l.id))}`,
            );

            const newLeaves = afterLeaves.filter(
                (a) => !beforeLeaves.some((b) => b.id === a.id),
            );
            console.log(
                `[spike] New leaves from popover: ${JSON.stringify(newLeaves)}`,
            );
        });

        it('should check if active-leaf-change fires for popover', async function () {
            await loadLuaConfig(
                'vim.g.__leaf_change_count = 0\n' +
                    'vim.api.nvim_create_autocmd("LeafEnter", {\n' +
                    '    callback = function(ev)\n' +
                    '        vim.g.__leaf_change_count = vim.g.__leaf_change_count + 1\n' +
                    '        vim.cmd("set scrolloff=" .. tostring(vim.g.__leaf_change_count))\n' +
                    '    end\n' +
                    '})\n',
            );
            await setPluginSetting('scrolloffLines', 0);

            const beforeScrolloff = await getPluginSetting('scrolloffLines');
            console.log(
                `[spike] scrolloff before popover hover: ${beforeScrolloff}`,
            );

            await triggerHoverPopover();
            await browser.pause(1000);

            const afterScrolloff = await getPluginSetting('scrolloffLines');
            console.log(
                `[spike] scrolloff after popover hover: ${afterScrolloff}`,
            );
            console.log(
                `[spike] LeafEnter fired for popover: ${(afterScrolloff as number) > (beforeScrolloff as number)}`,
            );
        });
    });

    describe('Timing chain analysis', function () {
        it('should measure time from leaf switch to autocmd callback execution', async function () {
            await loadLuaConfig(
                'vim.api.nvim_create_autocmd("LeafEnter", {\n' +
                    '    callback = function(ev)\n' +
                    '        vim.cmd("set scrolloff=99")\n' +
                    '    end\n' +
                    '})\n',
            );

            await obsidianPage.loadWorkspaceLayout({
                main: {
                    id: 'split-root',
                    type: 'split',
                    direction: 'vertical',
                    children: [
                        {
                            id: 'left-tabs',
                            type: 'tabs',
                            children: [
                                {
                                    id: 'left-leaf',
                                    type: 'leaf',
                                    state: {
                                        type: 'markdown',
                                        state: {
                                            file: 'Welcome.md',
                                            mode: 'source',
                                        },
                                    },
                                },
                            ],
                        },
                        {
                            id: 'right-tabs',
                            type: 'tabs',
                            children: [
                                {
                                    id: 'right-leaf',
                                    type: 'leaf',
                                    state: {
                                        type: 'markdown',
                                        state: {
                                            file: 'Target.md',
                                            mode: 'source',
                                        },
                                    },
                                },
                            ],
                        },
                    ],
                },
                active: 'left-leaf',
                lastOpenFiles: [],
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);
            await setPluginSetting('scrolloffLines', 0);

            const startTime = Date.now();
            await focusLeaf('right-leaf');

            await browser.waitUntil(
                async () => {
                    const val = await getPluginSetting('scrolloffLines');
                    return val === 99;
                },
                { timeout: 2000, interval: 10 },
            );
            const elapsed = Date.now() - startTime;
            console.log(
                `[spike] Time from leaf switch to LeafEnter callback: ${elapsed}ms`,
            );
            console.log(
                `[spike] (includes 50ms LeafEnter debounce + IPC overhead)`,
            );
        });

        it('should measure time from leaf switch through vim.schedule to vim.cmd', async function () {
            await loadLuaConfig(
                'vim.api.nvim_create_autocmd("LeafEnter", {\n' +
                    '    callback = function(ev)\n' +
                    '        vim.schedule(function()\n' +
                    '            vim.cmd("set scrolloff=88")\n' +
                    '        end)\n' +
                    '    end\n' +
                    '})\n',
            );

            await obsidianPage.loadWorkspaceLayout({
                main: {
                    id: 'split-root',
                    type: 'split',
                    direction: 'vertical',
                    children: [
                        {
                            id: 'left-tabs',
                            type: 'tabs',
                            children: [
                                {
                                    id: 'left-leaf',
                                    type: 'leaf',
                                    state: {
                                        type: 'markdown',
                                        state: {
                                            file: 'Welcome.md',
                                            mode: 'source',
                                        },
                                    },
                                },
                            ],
                        },
                        {
                            id: 'right-tabs',
                            type: 'tabs',
                            children: [
                                {
                                    id: 'right-leaf',
                                    type: 'leaf',
                                    state: {
                                        type: 'markdown',
                                        state: {
                                            file: 'Target.md',
                                            mode: 'source',
                                        },
                                    },
                                },
                            ],
                        },
                    ],
                },
                active: 'left-leaf',
                lastOpenFiles: [],
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);
            await setPluginSetting('scrolloffLines', 0);

            const startTime = Date.now();
            await focusLeaf('right-leaf');

            await browser.waitUntil(
                async () => {
                    const val = await getPluginSetting('scrolloffLines');
                    return val === 88;
                },
                { timeout: 2000, interval: 10 },
            );
            const elapsed = Date.now() - startTime;
            console.log(
                `[spike] Time from leaf switch through vim.schedule to vim.cmd: ${elapsed}ms`,
            );
            console.log(
                `[spike] (includes 50ms LeafEnter debounce + vim.schedule(setTimeout(0)) + IPC)`,
            );
        });

        it('should measure the full user pattern: LeafEnter → vim.schedule → startinsert → mode settle', async function () {
            await loadLuaConfig(
                'vim.api.nvim_create_autocmd("LeafEnter", {\n' +
                    '    callback = function(ev)\n' +
                    '        if ev.data and ev.data.type and ev.data.type ~= "markdown" then\n' +
                    '            return\n' +
                    '        end\n' +
                    '        vim.schedule(function()\n' +
                    '            if vim.obsidian.mode() == "i" then\n' +
                    '                return\n' +
                    '            end\n' +
                    '            vim.cmd("startinsert")\n' +
                    '        end)\n' +
                    '    end\n' +
                    '})\n' +
                    'vim.api.nvim_create_autocmd("InsertEnter", {\n' +
                    '    callback = function()\n' +
                    '        vim.cmd("set scrolloff=77")\n' +
                    '    end\n' +
                    '})\n',
            );

            await obsidianPage.loadWorkspaceLayout({
                main: {
                    id: 'split-root',
                    type: 'split',
                    direction: 'vertical',
                    children: [
                        {
                            id: 'left-tabs',
                            type: 'tabs',
                            children: [
                                {
                                    id: 'left-leaf',
                                    type: 'leaf',
                                    state: {
                                        type: 'markdown',
                                        state: {
                                            file: 'Welcome.md',
                                            mode: 'source',
                                        },
                                    },
                                },
                            ],
                        },
                        {
                            id: 'right-tabs',
                            type: 'tabs',
                            children: [
                                {
                                    id: 'right-leaf',
                                    type: 'leaf',
                                    state: {
                                        type: 'markdown',
                                        state: {
                                            file: 'Target.md',
                                            mode: 'source',
                                        },
                                    },
                                },
                            ],
                        },
                    ],
                },
                active: 'left-leaf',
                lastOpenFiles: [],
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);
            await setPluginSetting('scrolloffLines', 0);

            const startTime = Date.now();
            await focusLeaf('right-leaf');

            await browser.waitUntil(
                async () => {
                    const val = await getPluginSetting('scrolloffLines');
                    return val === 77;
                },
                { timeout: 3000, interval: 10 },
            );
            const elapsed = Date.now() - startTime;
            console.log(
                `[spike] Full chain: leaf switch → LeafEnter(50ms debounce) → vim.schedule(0ms) → startinsert → InsertEnter: ${elapsed}ms`,
            );
            console.log(
                `[spike] On the user's hardware, add IME binary execution time (50ms debounce + binary ~50-200ms)`,
            );
            console.log(
                `[spike] Total estimated user latency: ${elapsed + 100}ms to ${elapsed + 250}ms`,
            );
        });
    });

    describe('Simulated slow hardware', function () {
        it('should test if autocmd pattern survives with extra delay after leaf switch', async function () {
            await loadLuaConfig(
                'vim.api.nvim_create_autocmd("LeafEnter", {\n' +
                    '    callback = function(ev)\n' +
                    '        if ev.data and ev.data.type and ev.data.type ~= "markdown" then\n' +
                    '            return\n' +
                    '        end\n' +
                    '        vim.schedule(function()\n' +
                    '            if vim.obsidian.mode() == "i" then\n' +
                    '                return\n' +
                    '            end\n' +
                    '            vim.cmd("startinsert")\n' +
                    '        end)\n' +
                    '    end\n' +
                    '})\n',
            );

            await obsidianPage.loadWorkspaceLayout({
                main: {
                    id: 'split-root',
                    type: 'split',
                    direction: 'vertical',
                    children: [
                        {
                            id: 'left-tabs',
                            type: 'tabs',
                            children: [
                                {
                                    id: 'left-leaf',
                                    type: 'leaf',
                                    state: {
                                        type: 'markdown',
                                        state: {
                                            file: 'Welcome.md',
                                            mode: 'source',
                                        },
                                    },
                                },
                            ],
                        },
                        {
                            id: 'right-tabs',
                            type: 'tabs',
                            children: [
                                {
                                    id: 'right-leaf',
                                    type: 'leaf',
                                    state: {
                                        type: 'markdown',
                                        state: {
                                            file: 'Target.md',
                                            mode: 'source',
                                        },
                                    },
                                },
                            ],
                        },
                    ],
                },
                active: 'left-leaf',
                lastOpenFiles: [],
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);

            await focusLeaf('right-leaf');
            await browser.pause(500);

            const mode = await browser.executeObsidian(({ app }) => {
                let targetLeaf: unknown = null;
                app.workspace.iterateAllLeaves((leaf: unknown) => {
                    const l = leaf as { id?: string };
                    if (l.id === 'right-leaf') targetLeaf = leaf;
                });
                if (!targetLeaf) return 'not-found';
                const view = (targetLeaf as { view?: unknown }).view;
                if (!view) return 'no-view';
                const editor = (view as { editor?: unknown }).editor;
                if (!editor) return 'no-editor';
                const editorView = (editor as { cm?: unknown }).cm as
                    Record<string, unknown> | undefined;
                if (!editorView) return 'no-cm';
                const adapter = editorView.cm as
                    Record<string, unknown> | undefined;
                if (!adapter) return 'no-adapter';
                const vim = (
                    adapter.state as Record<string, unknown> | undefined
                )?.vim as Record<string, unknown> | undefined;
                if (!vim) return 'no-vim-state';
                if (vim.insertMode) return 'insert';
                if (vim.visualMode) return 'visual';
                return 'normal';
            });

            console.log(
                `[spike] Mode after 500ms settle (simulating slow hardware): ${mode}`,
            );
            expect(mode).toBe('insert');
        });
    });

    describe('Workspace event discovery for non-leaf editors', function () {
        it('should instrument all workspace events and detect which fire on leaf switch', async function () {
            const events = await browser.executeObsidian(({ app }) => {
                const log: string[] = [];
                const refs: unknown[] = [];

                const tracked = [
                    'active-leaf-change',
                    'file-open',
                    'layout-change',
                    'resize',
                    'editor-change',
                    'editor-menu',
                    'editor-paste',
                    'editor-drop',
                    'window-open',
                    'window-close',
                    'css-change',
                ] as const;

                for (const name of tracked) {
                    const ref = app.workspace.on(
                        name as Parameters<typeof app.workspace.on>[0],
                        (...args: unknown[]) => {
                            const detail =
                                name === 'active-leaf-change'
                                    ? `leaf=${(args[0] as { id?: string })?.id ?? 'null'}`
                                    : name === 'file-open'
                                      ? `file=${(args[0] as { path?: string })?.path ?? 'null'}`
                                      : name === 'editor-change'
                                        ? `hasEditor=true`
                                        : '';
                            log.push(`${name}(${detail})`);
                        },
                    );
                    refs.push(ref);
                }

                (window as unknown as Record<string, unknown>).__eventLog = log;
                (window as unknown as Record<string, unknown>).__eventRefs =
                    refs;
                return true;
            });
            expect(events).toBe(true);

            await obsidianPage.loadWorkspaceLayout({
                main: {
                    id: 'split-root',
                    type: 'split',
                    direction: 'vertical',
                    children: [
                        {
                            id: 'left-tabs',
                            type: 'tabs',
                            children: [
                                {
                                    id: 'left-leaf',
                                    type: 'leaf',
                                    state: {
                                        type: 'markdown',
                                        state: {
                                            file: 'Welcome.md',
                                            mode: 'source',
                                        },
                                    },
                                },
                            ],
                        },
                        {
                            id: 'right-tabs',
                            type: 'tabs',
                            children: [
                                {
                                    id: 'right-leaf',
                                    type: 'leaf',
                                    state: {
                                        type: 'markdown',
                                        state: {
                                            file: 'Target.md',
                                            mode: 'source',
                                        },
                                    },
                                },
                            ],
                        },
                    ],
                },
                active: 'left-leaf',
                lastOpenFiles: [],
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            await browser.executeObsidian(() => {
                (
                    (window as unknown as Record<string, unknown>)
                        .__eventLog as string[]
                ).length = 0;
            });

            await focusLeaf('right-leaf');
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const leafSwitchEvents = (await browser.executeObsidian(() => {
                return [
                    ...((window as unknown as Record<string, unknown>)
                        .__eventLog as string[]),
                ];
            })) as string[];

            console.log(
                `[spike] Events fired on leaf switch: ${JSON.stringify(leafSwitchEvents)}`,
            );

            await browser.executeObsidian(({ app }) => {
                const refs = (window as unknown as Record<string, unknown>)
                    .__eventRefs as unknown[];
                for (const ref of refs) {
                    app.workspace.offref(
                        ref as ReturnType<typeof app.workspace.on>,
                    );
                }
                delete (window as unknown as Record<string, unknown>)
                    .__eventLog;
                delete (window as unknown as Record<string, unknown>)
                    .__eventRefs;
            });

            expect(leafSwitchEvents.length).toBeGreaterThan(0);
        });

        it('should detect which events fire when typing in the active editor', async function () {
            const events = await browser.executeObsidian(({ app }) => {
                const log: string[] = [];
                const refs: unknown[] = [];

                const tracked = [
                    'active-leaf-change',
                    'file-open',
                    'layout-change',
                    'resize',
                    'editor-change',
                ] as const;

                for (const name of tracked) {
                    const ref = app.workspace.on(
                        name as Parameters<typeof app.workspace.on>[0],
                        (...args: unknown[]) => {
                            const detail =
                                name === 'editor-change'
                                    ? `info_type=${typeof args[1] === 'object' && args[1] !== null && 'getViewType' in (args[1] as Record<string, unknown>) ? 'MarkdownView' : 'MarkdownFileInfo'}`
                                    : '';
                            log.push(`${name}(${detail})`);
                        },
                    );
                    refs.push(ref);
                }

                (window as unknown as Record<string, unknown>).__eventLog = log;
                (window as unknown as Record<string, unknown>).__eventRefs =
                    refs;
                return true;
            });
            expect(events).toBe(true);

            await setupEditor('hello world', { line: 0, ch: 0 });
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);

            await browser.executeObsidian(() => {
                (
                    (window as unknown as Record<string, unknown>)
                        .__eventLog as string[]
                ).length = 0;
            });

            await browser.keys(['i']);
            await browser.pause(PAUSE.MODE_SWITCH);
            await browser.keys(['x']);
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const typingEvents = (await browser.executeObsidian(() => {
                return [
                    ...((window as unknown as Record<string, unknown>)
                        .__eventLog as string[]),
                ];
            })) as string[];

            console.log(
                `[spike] Events fired on typing: ${JSON.stringify(typingEvents)}`,
            );

            await browser.executeObsidian(({ app }) => {
                const refs = (window as unknown as Record<string, unknown>)
                    .__eventRefs as unknown[];
                for (const ref of refs) {
                    app.workspace.offref(
                        ref as ReturnType<typeof app.workspace.on>,
                    );
                }
                delete (window as unknown as Record<string, unknown>)
                    .__eventLog;
                delete (window as unknown as Record<string, unknown>)
                    .__eventRefs;
            });
        });

        it('should detect which events fire for hover-link trigger', async function () {
            const events = await browser.executeObsidian(({ app }) => {
                const log: string[] = [];
                const refs: unknown[] = [];

                const tracked = [
                    'active-leaf-change',
                    'file-open',
                    'layout-change',
                    'resize',
                    'editor-change',
                    'window-open',
                ] as const;

                for (const name of tracked) {
                    const ref = app.workspace.on(
                        name as Parameters<typeof app.workspace.on>[0],
                        (...args: unknown[]) => {
                            const detail =
                                name === 'file-open'
                                    ? `file=${(args[0] as { path?: string })?.path ?? 'null'}`
                                    : name === 'active-leaf-change'
                                      ? `leaf=${(args[0] as { id?: string })?.id ?? 'null'}`
                                      : '';
                            log.push(`${name}(${detail})`);
                        },
                    );
                    refs.push(ref);
                }

                (window as unknown as Record<string, unknown>).__eventLog = log;
                (window as unknown as Record<string, unknown>).__eventRefs =
                    refs;
                return true;
            });
            expect(events).toBe(true);

            await browser.executeObsidian(() => {
                (
                    (window as unknown as Record<string, unknown>)
                        .__eventLog as string[]
                ).length = 0;
            });

            await triggerHoverPopover();
            await browser.pause(1000);

            const hoverEvents = (await browser.executeObsidian(() => {
                return [
                    ...((window as unknown as Record<string, unknown>)
                        .__eventLog as string[]),
                ];
            })) as string[];

            console.log(
                `[spike] Events fired on hover-link: ${JSON.stringify(hoverEvents)}`,
            );

            await browser.executeObsidian(({ app }) => {
                const refs = (window as unknown as Record<string, unknown>)
                    .__eventRefs as unknown[];
                for (const ref of refs) {
                    app.workspace.offref(
                        ref as ReturnType<typeof app.workspace.on>,
                    );
                }
                delete (window as unknown as Record<string, unknown>)
                    .__eventLog;
                delete (window as unknown as Record<string, unknown>)
                    .__eventRefs;
            });
        });

        it('should detect CM-level events via adapter on non-active editors', async function () {
            await obsidianPage.loadWorkspaceLayout({
                main: {
                    id: 'split-root',
                    type: 'split',
                    direction: 'vertical',
                    children: [
                        {
                            id: 'left-tabs',
                            type: 'tabs',
                            children: [
                                {
                                    id: 'left-leaf',
                                    type: 'leaf',
                                    state: {
                                        type: 'markdown',
                                        state: {
                                            file: 'Welcome.md',
                                            mode: 'source',
                                        },
                                    },
                                },
                            ],
                        },
                        {
                            id: 'right-tabs',
                            type: 'tabs',
                            children: [
                                {
                                    id: 'right-leaf',
                                    type: 'leaf',
                                    state: {
                                        type: 'markdown',
                                        state: {
                                            file: 'Target.md',
                                            mode: 'source',
                                        },
                                    },
                                },
                            ],
                        },
                    ],
                },
                active: 'left-leaf',
                lastOpenFiles: [],
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const adapterEvents = await browser.executeObsidian(({ app }) => {
                const results: Record<string, string[]> = {};

                app.workspace.iterateAllLeaves((leaf: unknown) => {
                    const l = leaf as {
                        id?: string;
                        view?: {
                            editor?: { cm?: { cm?: Record<string, unknown> } };
                        };
                    };
                    const id = l.id ?? 'unknown';
                    const adapter = l.view?.editor?.cm?.cm as
                        | { on?: (event: string, handler: () => void) => void }
                        | undefined;

                    if (adapter?.on) {
                        results[id] = ['adapter-found'];
                        const vimState = (
                            adapter as { state?: { vim?: unknown } }
                        ).state?.vim;
                        if (vimState) {
                            results[id].push('vim-state-present');
                        }
                    } else {
                        results[id] = ['no-adapter'];
                    }
                });

                return results;
            });

            console.log(
                `[spike] Adapter state per leaf: ${JSON.stringify(adapterEvents)}`,
            );

            for (const [leafId, states] of Object.entries(adapterEvents)) {
                console.log(`[spike]   ${leafId}: ${states.join(', ')}`);
            }
        });

        it('should check if vim-mode-change fires on non-active leaf adapter', async function () {
            await obsidianPage.loadWorkspaceLayout({
                main: {
                    id: 'split-root',
                    type: 'split',
                    direction: 'vertical',
                    children: [
                        {
                            id: 'left-tabs',
                            type: 'tabs',
                            children: [
                                {
                                    id: 'left-leaf',
                                    type: 'leaf',
                                    state: {
                                        type: 'markdown',
                                        state: {
                                            file: 'Welcome.md',
                                            mode: 'source',
                                        },
                                    },
                                },
                            ],
                        },
                        {
                            id: 'right-tabs',
                            type: 'tabs',
                            children: [
                                {
                                    id: 'right-leaf',
                                    type: 'leaf',
                                    state: {
                                        type: 'markdown',
                                        state: {
                                            file: 'Target.md',
                                            mode: 'source',
                                        },
                                    },
                                },
                            ],
                        },
                    ],
                },
                active: 'left-leaf',
                lastOpenFiles: [],
            });
            await browser.pause(PAUSE.EDITOR_SETTLE);

            const result = await browser.executeObsidian(({ app }) => {
                const modeChanges: string[] = [];

                app.workspace.iterateAllLeaves((leaf: unknown) => {
                    const l = leaf as {
                        id?: string;
                        view?: {
                            editor?: { cm?: { cm?: Record<string, unknown> } };
                        };
                    };
                    const id = l.id ?? 'unknown';
                    const adapter = l.view?.editor?.cm?.cm as
                        | {
                              on?: (
                                  event: string,
                                  handler: (...args: unknown[]) => void,
                              ) => void;
                          }
                        | undefined;

                    if (adapter?.on) {
                        adapter.on('vim-mode-change', (mode: unknown) => {
                            const m = mode as {
                                mode?: string;
                                subMode?: string;
                            };
                            modeChanges.push(
                                `${id}:${m.mode ?? '?'}/${m.subMode ?? ''}`,
                            );
                        });
                    }
                });

                (window as unknown as Record<string, unknown>).__modeChanges =
                    modeChanges;
                return true;
            });
            expect(result).toBe(true);

            await focusLeaf('right-leaf');
            await browser.pause(PAUSE.EDITOR_SETTLE);
            await sendVimEscape();
            await browser.pause(PAUSE.MODE_SWITCH);

            const Vim = 'CodeMirrorAdapter';
            await browser.executeObsidian(({ app }, leafId: string) => {
                let targetLeaf: unknown = null;
                app.workspace.iterateAllLeaves((leaf: unknown) => {
                    const l = leaf as { id?: string };
                    if (l.id === leafId) targetLeaf = leaf;
                });
                if (!targetLeaf) return;
                const view = (targetLeaf as { view?: unknown }).view;
                if (!view) return;
                const editor = (view as { editor?: unknown }).editor;
                if (!editor) return;
                const editorView = (editor as { cm?: unknown }).cm as
                    Record<string, unknown> | undefined;
                if (!editorView) return;
                const VimApi = (
                    window as unknown as {
                        CodeMirrorAdapter?: {
                            Vim?: {
                                handleKey: (
                                    cm: unknown,
                                    key: string,
                                ) => boolean;
                            };
                        };
                    }
                ).CodeMirrorAdapter?.Vim;
                if (!VimApi) return;
                VimApi.handleKey(editorView.cm, 'i');
            }, 'right-leaf');
            await browser.pause(PAUSE.MODE_SWITCH);

            const modeChanges = (await browser.executeObsidian(() => {
                const changes = [
                    ...((window as unknown as Record<string, unknown>)
                        .__modeChanges as string[]),
                ];
                delete (window as unknown as Record<string, unknown>)
                    .__modeChanges;
                return changes;
            })) as string[];

            console.log(
                `[spike] vim-mode-change events across leaves: ${JSON.stringify(modeChanges)}`,
            );
        });
    });
});
