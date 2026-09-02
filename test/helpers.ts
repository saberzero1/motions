import { browser } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { readFileSync } from 'fs';
import { type Plugin } from 'vitest/config';

export function wasmBinaryPlugin(): Plugin {
    return {
        name: 'wasm-binary',
        enforce: 'pre',
        load(id: string) {
            if (!id.endsWith('.wasm')) return;
            const bytes = readFileSync(id);
            const base64 = bytes.toString('base64');
            return `
                const b = atob(${JSON.stringify(base64)});
                const u = new Uint8Array(b.length);
                for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
                export default u;
            `;
        },
    };
}

export const PAUSE = {
    KEY_GAP: 30,
    MODE_SWITCH: 50,
    EDITOR_SETTLE: 300,
    OBSIDIAN_LOAD: 500,
} as const;

type EditorResult<T> = { ok: true; value: T } | { ok: false; error: string };

function unwrap<T>(result: EditorResult<T>): T {
    if (!result.ok) throw new Error(result.error);
    return result.value;
}

export async function getEditorValue(): Promise<string> {
    const result = (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) {
            const activeType =
                app.workspace
                    .getActiveViewOfType(
                        (obsidian as Record<string, unknown>)
                            .View as typeof obsidian.MarkdownView,
                    )
                    ?.getViewType() ?? 'none';
            return {
                ok: false as const,
                error: `getEditorValue: no MarkdownView (active: ${activeType})`,
            };
        }
        return { ok: true as const, value: view.editor.getValue() };
    })) as EditorResult<string>;
    return unwrap(result);
}

export async function getSelection(): Promise<string> {
    const result = (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view)
            return {
                ok: false as const,
                error: 'getSelection: no MarkdownView',
            };
        return { ok: true as const, value: view.editor.getSelection() };
    })) as EditorResult<string>;
    return unwrap(result);
}

export async function getCursorLine(): Promise<number> {
    const result = (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view)
            return {
                ok: false as const,
                error: 'getCursorLine: no MarkdownView',
            };
        return { ok: true as const, value: view.editor.getCursor().line };
    })) as EditorResult<number>;
    return unwrap(result);
}

export async function getCursorPos(): Promise<{ line: number; ch: number }> {
    const result = (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view)
            return {
                ok: false as const,
                error: 'getCursorPos: no MarkdownView',
            };
        const cursor = view.editor.getCursor();
        return {
            ok: true as const,
            value: { line: cursor.line, ch: cursor.ch },
        };
    })) as EditorResult<{ line: number; ch: number }>;
    return unwrap(result);
}

export async function getVimMode(): Promise<string> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return 'unknown';
        const editorView = (view.editor as unknown as Record<string, unknown>)
            .cm as Record<string, unknown>;
        if (!editorView) return 'unknown';
        // Built-in vim: editorView.cm.state.vim
        const adapter = editorView.cm as Record<string, unknown> | undefined;
        const vim = (adapter?.state as Record<string, unknown> | undefined)
            ?.vim as Record<string, unknown> | undefined;
        if (vim) {
            if (vim.selectMode) return 'select';
            if (vim.insertMode && vim.virtualReplace) return 'vreplace';
            if (vim.insertMode) return 'insert';
            if (vim.visualMode) return 'visual';
            if (vim.insertModeReturn) return 'insert-normal';
            return 'normal';
        }
        // Bundled vim: editorView is the CM6 EditorView, .cm is the adapter
        const bundledAdapter = (editorView as Record<string, unknown>).cm as
            Record<string, unknown> | undefined;
        if (!bundledAdapter) return 'unknown';
        const bVim = (
            bundledAdapter.state as Record<string, unknown> | undefined
        )?.vim as Record<string, unknown> | undefined;
        if (!bVim) return 'unknown';
        if (bVim.selectMode) return 'select';
        if (bVim.insertMode && bVim.virtualReplace) return 'vreplace';
        if (bVim.insertMode) return 'insert';
        if (bVim.visualMode) return 'visual';
        if (bVim.insertModeReturn) return 'insert-normal';
        return 'normal';
    })) as string;
}

export async function getStatusBarMode(): Promise<{
    text: string;
    dataAttr: string;
}> {
    return (await browser.executeObsidian(() => {
        const el = document.querySelector('.vim-motions-mode');
        return {
            text: (el as HTMLElement)?.textContent ?? '',
            dataAttr: (el as HTMLElement)?.dataset?.vimMode ?? '',
        };
    })) as { text: string; dataAttr: string };
}

export async function getRegisterContent(
    register: string,
): Promise<{ text: string; linewise: boolean } | null> {
    return (await browser.executeObsidian(
        ({ app, obsidian }, registerName: string) => {
            const Vim = (
                window as unknown as {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            getRegisterController: () => {
                                registers: Record<
                                    string,
                                    {
                                        toString: () => string;
                                        linewise: boolean;
                                        keyBuffer: string[];
                                    }
                                >;
                            };
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return null;
            const rc = Vim.getRegisterController();
            const reg = rc.registers[registerName];
            if (!reg) return null;
            const text = reg.toString();
            if (text) return { text, linewise: reg.linewise };
            if (reg.keyBuffer && reg.keyBuffer.length > 0) {
                const joined = reg.keyBuffer.join('\n');
                if (joined) return { text: joined, linewise: reg.linewise };
            }
            return { text: '', linewise: reg.linewise };
        },
        register,
    )) as { text: string; linewise: boolean } | null;
}

export async function setupEditor(
    content: string,
    cursor: { line: number; ch: number },
): Promise<void> {
    const result = (await browser.executeObsidian(
        ({ app, obsidian }, text: string, line: number, ch: number) => {
            let view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
            if (!view) {
                const leaf = app.workspace
                    .getLeavesOfType('markdown')
                    .find((l) => l.view instanceof obsidian.MarkdownView);
                if (leaf) {
                    app.workspace.setActiveLeaf(leaf, { focus: true });
                    view = leaf.view as InstanceType<
                        typeof obsidian.MarkdownView
                    >;
                }
            }
            if (!view) {
                const activeType =
                    app.workspace.getMostRecentLeaf()?.view?.getViewType() ??
                    'none';
                return {
                    ok: false as const,
                    error: `setupEditor: no MarkdownView (active leaf type: ${activeType})`,
                };
            }
            view.editor.setValue(text);
            view.editor.setCursor(line, ch);
            view.editor.focus();
            return { ok: true as const };
        },
        content,
        cursor.line,
        cursor.ch,
    )) as { ok: boolean; error?: string };
    if (!result.ok) throw new Error(result.error);
    await browser
        .waitUntil(
            async () => {
                const val = (await browser.executeObsidian(
                    ({ app, obsidian }) => {
                        const v = app.workspace.getActiveViewOfType(
                            obsidian.MarkdownView,
                        );
                        return v?.editor.getValue() ?? null;
                    },
                )) as string | null;
                return val === content;
            },
            { timeout: 2000, interval: 50 },
        )
        .catch(() => {});
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

export async function sendVimEscape(): Promise<void> {
    await browser.executeObsidian(({ app, obsidian }) => {
        const Vim = (
            window as unknown as {
                CodeMirrorAdapter?: {
                    Vim?: {};
                };
            }
        ).CodeMirrorAdapter?.Vim;
        if (!Vim) return;
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return;
        const cm = (view.editor as unknown as Record<string, unknown>)
            .cm as Record<string, unknown>;
        const adapter = cm?.cm;
        if (!adapter) return;
        Vim.handleKey(adapter, '<Esc>');
    });
}

export async function vimKeys(...keys: string[]): Promise<void> {
    await sendVimEscape();
    await browser.pause(PAUSE.MODE_SWITCH);
    for (const key of keys) {
        await browser.keys([key]);
        await browser.pause(PAUSE.KEY_GAP);
    }
    await browser.pause(PAUSE.EDITOR_SETTLE - PAUSE.KEY_GAP);
}

export async function vimRawKeys(keys: string): Promise<void> {
    await sendVimEscape();
    await browser.pause(PAUSE.MODE_SWITCH);
    for (const ch of keys) {
        const code = ch.charCodeAt(0);
        if (code === 0x1b) {
            await sendVimEscape();
        } else if (code < 0x20) {
            await browser.executeObsidian(
                ({ app, obsidian }, keyStr: string) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    if (!view) return;
                    const cm = (
                        view.editor as unknown as Record<string, unknown>
                    ).cm as Record<string, unknown>;
                    const adapter = cm?.cm as
                        Record<string, unknown> | undefined;
                    if (!adapter) return;
                    const Vim = (
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
                    if (!Vim) return;
                    Vim.handleKey(adapter, keyStr);
                },
                `<C-${String.fromCharCode(code + 0x60)}>`,
            );
        } else if (ch === '\n') {
            await browser.keys(['Enter']);
        } else {
            await browser.keys([ch]);
        }
        await browser.pause(PAUSE.KEY_GAP);
    }
    await browser.pause(PAUSE.EDITOR_SETTLE - PAUSE.KEY_GAP);
}

export async function vimHandleKeys(
    keys: string,
    options?: { useHandleKey?: boolean },
): Promise<void> {
    await sendVimEscape();
    await browser.pause(PAUSE.MODE_SWITCH);
    await browser.executeObsidian(({ app, obsidian }, keyStr: string) => {
        const Vim = (
            window as unknown as Record<string, unknown> & {
                CodeMirrorAdapter?: {
                    Vim?: {
                        handleKey: (cm: unknown, key: string) => boolean;
                    };
                };
            }
        ).CodeMirrorAdapter?.Vim;
        if (!Vim) return;
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return;
        const cm = (
            (view.editor as unknown as Record<string, unknown>).cm as Record<
                string,
                unknown
            >
        )?.cm;
        if (!cm) return;
        for (const ch of keyStr) {
            const code = ch.charCodeAt(0);
            if (code === 0x1b) {
                Vim.handleKey(cm, '<Esc>');
            } else if (code < 0x20) {
                const letter = String.fromCharCode(code + 0x60);
                Vim.handleKey(cm, '<C-' + letter + '>');
            } else {
                Vim.handleKey(cm, ch);
            }
        }
    }, keys);
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

/**
 * Dispatch keys via Vim.handleKey in a single synchronous batch.
 * Sends Escape first (inside the same executeObsidian call) to ensure
 * normal mode.  Avoids timer-based deferral — the full key sequence is
 * resolved synchronously, matching Neovim's key dispatch semantics.
 */
export async function vimHandleKeysSync(
    keys: string,
    waitForTimeout = false,
): Promise<void> {
    const result = await browser.executeObsidian(
        ({ app, obsidian }, keyStr: string) => {
            const Vim = (
                window as unknown as Record<string, unknown> & {
                    CodeMirrorAdapter?: {
                        Vim?: {
                            handleKey: (cm: unknown, key: string) => boolean;
                        };
                    };
                }
            ).CodeMirrorAdapter?.Vim;
            if (!Vim) return;
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view) return;
            const cm = (
                (view.editor as unknown as Record<string, unknown>)
                    .cm as Record<string, unknown>
            )?.cm;
            if (!cm) return;
            Vim.handleKey(cm, '<Esc>');
            const dispatched: string[] = [];
            for (const ch of keyStr) {
                const code = ch.charCodeAt(0);
                if (code === 0x1b) {
                    Vim.handleKey(cm, '<Esc>');
                    dispatched.push('<Esc>');
                } else if (code < 0x20) {
                    const letter = String.fromCharCode(code + 0x60);
                    Vim.handleKey(cm, '<C-' + letter + '>');
                    dispatched.push('<C-' + letter + '>');
                } else {
                    Vim.handleKey(cm, ch);
                    dispatched.push(ch);
                }
            }
            return dispatched;
        },
        keys,
    );
    if (waitForTimeout) {
        await browser.pause(1200);
    }
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

export async function loadSingleFileWorkspace(
    filePath = 'Welcome.md',
): Promise<void> {
    await obsidianPage.loadWorkspaceLayout({
        main: {
            id: 'test-main',
            type: 'split',
            children: [
                {
                    id: 'test-tabs',
                    type: 'tabs',
                    children: [
                        {
                            id: 'test-leaf',
                            type: 'leaf',
                            state: {
                                type: 'markdown',
                                state: { file: filePath, mode: 'source' },
                            },
                        },
                    ],
                },
            ],
            direction: 'vertical',
        },
        active: 'test-leaf',
        lastOpenFiles: [],
    });
    await browser
        .waitUntil(
            async () =>
                (await browser.executeObsidian(({ app, obsidian }) => {
                    const view = app.workspace.getActiveViewOfType(
                        obsidian.MarkdownView,
                    );
                    return !!view;
                })) as boolean,
            { timeout: 5000, interval: 100 },
        )
        .catch(() => {});
    await browser.pause(PAUSE.MODE_SWITCH);
}

export function unsupported(
    description: string,
    reason: string,
    fn: () => Promise<void>,
): void {
    it.skip(`[UNSUPPORTED] ${description} — ${reason}`, fn);
}

export function deviation(
    description: string,
    neovimBehavior: string,
    fn: () => Promise<void>,
): void {
    it(`[DEVIATION] ${description} (Neovim: ${neovimBehavior})`, fn);
}

type PluginRef = {
    settings: Record<string, unknown>;
    reloadFeatures: () => void;
    vimrcLoaded?: boolean;
    luaLoaded?: boolean;
    leaderRegistry?: {
        getBindings: () => Array<{
            key: string;
            command: string;
            source: string;
        }>;
        getLeaderKey: () => string;
    };
    whichKeyOverlay?: unknown;
    loadLuaConfigForTest?: () => Promise<void>;
    isAnyViewComposingForTest?: () => boolean;
};

function getPluginRef(): string {
    return `(app as unknown as {
        plugins: { plugins: Record<string, unknown> };
    }).plugins.plugins['vim-motions']`;
}

export async function loadLuaConfig(content: string): Promise<void> {
    await browser.reloadObsidian({ vault: 'test-vault' });
    await obsidianPage.openFile('Welcome.md');
    await browser.waitUntil(
        async () =>
            (await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins: {
                            plugins: Record<string, PluginRef>;
                        };
                    }
                ).plugins.plugins['vim-motions'];
                return plugin?.vimrcLoaded === true;
            })) as boolean,
        { timeout: 10000, interval: 200 },
    );
    await browser.executeObsidian(async ({ app }, luaContent: string) => {
        const configPath = `${app.vault.configDir}.init.lua`;
        await app.vault.adapter.write(configPath, luaContent);
    }, content);
    await browser.executeObsidian(async ({ app }) => {
        const plugin = (
            app as unknown as {
                plugins: {
                    plugins: Record<string, PluginRef>;
                };
            }
        ).plugins.plugins['vim-motions'];
        await plugin?.loadLuaConfigForTest?.();
    });
    await browser.waitUntil(
        async () =>
            (await browser.executeObsidian(({ app }) => {
                const plugin = (
                    app as unknown as {
                        plugins: {
                            plugins: Record<string, PluginRef>;
                        };
                    }
                ).plugins.plugins['vim-motions'];
                return plugin?.luaLoaded === true;
            })) as boolean,
        { timeout: 10000, interval: 200 },
    );
}

export async function focusEditor(): Promise<void> {
    const result = (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view)
            return {
                ok: false as const,
                error: 'focusEditor: no MarkdownView',
            };
        view.editor.setValue('Hello world\nSecond line\nThird line');
        view.editor.setCursor(0, 0);
        view.editor.focus();
        return { ok: true as const };
    })) as { ok: boolean; error?: string };
    if (!result.ok) throw new Error(result.error);
    await browser.pause(PAUSE.EDITOR_SETTLE);
    await sendVimEscape();
    await browser.pause(PAUSE.MODE_SWITCH * 2);
}

export async function setWhichKeyMode(
    mode: 'off' | 'leader' | 'all',
): Promise<void> {
    await browser.executeObsidian(({ app }, whichKeyMode: string) => {
        const plugin = (
            app as unknown as {
                plugins: {
                    plugins: Record<string, PluginRef>;
                };
            }
        ).plugins.plugins['vim-motions'];
        if (!plugin) return;
        plugin.settings.whichKeyMode = whichKeyMode;
        plugin.reloadFeatures();
    }, mode);
    await browser.pause(PAUSE.OBSIDIAN_LOAD);
}

export async function hasWhichKeyOverlay(): Promise<boolean> {
    return (await browser.executeObsidian(() => {
        return !!document.querySelector('.vim-motions-which-key');
    })) as boolean;
}

export async function waitForWhichKey(timeout = 2000): Promise<void> {
    await browser.waitUntil(
        async () =>
            (await browser.executeObsidian(
                () => !!document.querySelector('.vim-motions-which-key'),
            )) as boolean,
        { timeout, interval: 100 },
    );
}

export async function getWhichKeyTitle(): Promise<string> {
    return (await browser.executeObsidian(() => {
        const el = document.querySelector('.vim-motions-which-key-title');
        return el?.textContent ?? '';
    })) as string;
}

export async function getWhichKeyEntryCount(): Promise<number> {
    return (await browser.executeObsidian(() => {
        return document.querySelectorAll('.vim-motions-which-key-row').length;
    })) as number;
}

export async function getWhichKeyKeys(): Promise<string[]> {
    return (await browser.executeObsidian(() => {
        const els = document.querySelectorAll('.vim-motions-which-key-key');
        return Array.from(els).map((el) => el.textContent ?? '');
    })) as string[];
}

export async function getWhichKeyDescriptions(): Promise<string[]> {
    return (await browser.executeObsidian(() => {
        const els = document.querySelectorAll('.vim-motions-which-key-cmd');
        return Array.from(els).map((el) => el.textContent ?? '');
    })) as string[];
}

export async function getWhichKeyGroups(): Promise<string[]> {
    return (await browser.executeObsidian(() => {
        const els = document.querySelectorAll(
            '.vim-motions-which-key-group .vim-motions-which-key-key',
        );
        return Array.from(els).map((el) => el.textContent ?? '');
    })) as string[];
}

export async function getLeaderBindings(): Promise<
    Array<{ key: string; command: string; source: string }>
> {
    return (await browser.executeObsidian(({ app }) => {
        const plugin = (
            app as unknown as {
                plugins: {
                    plugins: Record<string, PluginRef>;
                };
            }
        ).plugins.plugins['vim-motions'];
        return plugin?.leaderRegistry?.getBindings() ?? [];
    })) as Array<{ key: string; command: string; source: string }>;
}

export async function getLeaderKey(): Promise<string> {
    return (await browser.executeObsidian(({ app }) => {
        const plugin = (
            app as unknown as {
                plugins: {
                    plugins: Record<string, PluginRef>;
                };
            }
        ).plugins.plugins['vim-motions'];
        return plugin?.leaderRegistry?.getLeaderKey() ?? '\\';
    })) as string;
}

export async function getPluginSetting(key: string): Promise<unknown> {
    return browser.executeObsidian(({ app }, settingKey: string) => {
        const plugin = (
            app as unknown as {
                plugins: {
                    plugins: Record<string, PluginRef>;
                };
            }
        ).plugins.plugins['vim-motions'];
        return (plugin?.settings as Record<string, unknown>)?.[settingKey];
    }, key);
}

export async function setPluginSetting(
    key: string,
    value: unknown,
): Promise<void> {
    await browser.executeObsidian(
        async ({ app }, k: string, v: unknown) => {
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<
                            string,
                            {
                                settings: Record<string, unknown>;
                                saveSettings: () => Promise<void>;
                                reloadFeatures?: () => void;
                            }
                        >;
                    };
                }
            ).plugins.plugins['vim-motions'];
            if (!plugin) throw new Error('setPluginSetting: plugin not found');
            plugin.settings[k] = v;
            await plugin.saveSettings();
        },
        key,
        value,
    );
}

export async function setPluginSettingAndReload(
    key: string,
    value: unknown,
): Promise<void> {
    await browser.executeObsidian(
        async ({ app }, k: string, v: unknown) => {
            const plugin = (
                app as unknown as {
                    plugins: {
                        plugins: Record<
                            string,
                            {
                                settings: Record<string, unknown>;
                                saveSettings: () => Promise<void>;
                                reloadFeatures: () => void;
                            }
                        >;
                    };
                }
            ).plugins.plugins['vim-motions'];
            if (!plugin)
                throw new Error('setPluginSettingAndReload: plugin not found');
            plugin.settings[k] = v;
            await plugin.saveSettings();
            plugin.reloadFeatures();
        },
        key,
        value,
    );
    await browser.pause(PAUSE.EDITOR_SETTLE);
}

export async function getNotices(): Promise<string[]> {
    return (await browser.executeObsidian(() => {
        const els = document.querySelectorAll('.notice');
        return Array.from(els).map((el) => el.textContent?.trim() ?? '');
    })) as string[];
}

export async function getVimMotionsNotices(): Promise<string[]> {
    const all = await getNotices();
    return all.filter(
        (n) => n.startsWith('Vim Motions:') || n.includes('not found'),
    );
}

export async function dismissNotices(): Promise<void> {
    await browser.executeObsidian(() => {
        document.querySelectorAll('.notice').forEach((el) => el.remove());
    });
}

export async function isLivePreview(): Promise<boolean> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return false;
        const state = view.getState();
        return state.mode === 'source' && state.source !== true;
    })) as boolean;
}

export async function ensureLivePreview(): Promise<void> {
    const isLP = await isLivePreview();
    if (!isLP) {
        const result = (await browser.executeObsidian(({ app, obsidian }) => {
            const view = app.workspace.getActiveViewOfType(
                obsidian.MarkdownView,
            );
            if (!view)
                return {
                    ok: false as const,
                    error: 'ensureLivePreview: no MarkdownView',
                };
            const state = view.getState();
            state.mode = 'source';
            state.source = false;
            view.setState(state, { history: false });
            return { ok: true as const };
        })) as { ok: boolean; error?: string };
        if (!result.ok) throw new Error(result.error);
        await browser
            .waitUntil(async () => isLivePreview(), {
                timeout: 3000,
                interval: 100,
            })
            .catch(() => {});
        await browser.pause(PAUSE.MODE_SWITCH);
    }
}

export async function isSourceMode(): Promise<boolean> {
    return (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view) return false;
        const state = view.getState();
        return state.mode === 'source' && state.source === true;
    })) as boolean;
}

export async function ensureSourceMode(): Promise<void> {
    const result = (await browser.executeObsidian(({ app, obsidian }) => {
        const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
        if (!view)
            return {
                ok: false as const,
                error: 'ensureSourceMode: no MarkdownView',
            };
        const state = view.getState();
        state.mode = 'source';
        state.source = true;
        view.setState(state, { history: false });
        return { ok: true as const };
    })) as { ok: boolean; error?: string };
    if (!result.ok) throw new Error(result.error);
    await browser
        .waitUntil(async () => isSourceMode(), {
            timeout: 3000,
            interval: 100,
        })
        .catch(() => {});
    await browser.pause(PAUSE.MODE_SWITCH);
}
