import { MarkdownView, Notice, Platform, apiVersion } from 'obsidian';
import type { App } from 'obsidian';
import type { VimApi } from '../types/vim-api';
import type { LeaderRegistry } from '../ui/which-key';
import { getCmAdapter } from '../vim/vim-api';
import { createSandboxedState, evalLua } from './engine';
import { injectVimApi, LuaKeymap, LuaKeymapDelete } from './api';
import { AutocmdManager } from './autocmd';
import { injectVimFn } from './fn';
import type { lua_State } from 'fengari';

export interface LuaLoadResult {
    found: boolean;
    ready: boolean;
    error?: string;
    path: string;
    maps: LuaKeymap[];
    unmaps: LuaKeymapDelete[];
    commandLabels: Array<{ key: string; label: string }>;
    pendingExCommands: string[];
    mapOperations: Array<
        | { type: 'map'; map: LuaKeymap }
        | { type: 'unmap'; map: LuaKeymapDelete }
    >;
    commandCount: number;
    state: lua_State | null;
    autocmdManager: AutocmdManager | null;
}

function getLuaConfigPath(app: App, customPath?: string): string {
    if (customPath) return customPath;
    return `${app.vault.configDir}.init.lua`;
}

async function readLuaFile(app: App, path: string): Promise<string | null> {
    try {
        return await app.vault.adapter.read(path);
    } catch {
        return null;
    }
}

export async function loadInitLua(
    app: App,
    vim: VimApi,
    leaderRegistry?: LeaderRegistry,
    onSettingOverride?: (
        key: string,
        value: unknown,
        directive?: string,
    ) => void,
    customPath?: string,
): Promise<LuaLoadResult> {
    const path = getLuaConfigPath(app, customPath);

    const content = await readLuaFile(app, path);
    if (content === null) {
        return {
            found: false,
            ready: true,
            path,
            maps: [],
            unmaps: [],
            commandLabels: [],
            pendingExCommands: [],
            mapOperations: [],
            commandCount: 0,
            state: null,
            autocmdManager: null,
        };
    }

    let commandCount = 0;
    const maps: LuaKeymap[] = [];
    const unmaps: LuaKeymapDelete[] = [];
    const commandLabels: Array<{ key: string; label: string }> = [];
    const pendingExCommands: string[] = [];
    const mapOperations: Array<
        | { type: 'map'; map: LuaKeymap }
        | { type: 'unmap'; map: LuaKeymapDelete }
    > = [];

    const L = createSandboxedState();
    const autocmdManager = new AutocmdManager(L);
    const { globals } = injectVimApi(L, {
        onSettingOverride: (key, value, directive) => {
            commandCount++;
            onSettingOverride?.(key, value, directive);
        },
        handleExCommand: (command: string) => {
            commandCount++;
            pendingExCommands.push(command);
        },
        getVaultName: () => app.vault.getName(),
        showNotice: (msg) => {
            new Notice(msg);
        },
        onKeymap: (map) => {
            commandCount++;
            maps.push(map);
            mapOperations.push({ type: 'map', map });
            if (map.desc) {
                commandLabels.push({ key: map.lhs, label: map.desc });
            }
        },
        onKeymapDel: (map) => {
            commandCount++;
            unmaps.push(map);
            mapOperations.push({ type: 'unmap', map });
        },
        defineExCommand: (name, callback) => {
            commandCount++;
            vim.defineEx(name, '', (_cm, params) => {
                callback(params.argString?.trim() ?? '');
            });
        },
        getLeaderKey: () => leaderRegistry?.getLeaderKey() ?? '\\',
        setLeaderKey: (key) => leaderRegistry?.setLeaderKey(key),
        getOption: (name) => {
            try {
                return vim.getOption(name);
            } catch {
                return undefined;
            }
        },
        autocmdManager,
    });

    injectVimFn(L, {
        getActiveFilePath: () => app.workspace.getActiveFile()?.path ?? null,
        fileExists: (path) => app.vault.getAbstractFileByPath(path) !== null,
        getVaultFiles: () => app.vault.getFiles().map((file) => file.path),
        isDirectory: (path) => {
            const normalized = path.replace(/\/+$/, '');
            const configDir = app.vault.configDir.replace(/\/+$/, '');
            if (normalized === configDir) return true;
            const abstract = app.vault.getAbstractFileByPath(path);
            return abstract !== null && 'children' in abstract;
        },
        getMode: () => {
            const view = app.workspace.getActiveViewOfType(MarkdownView);
            if (!view) return 'n';
            const cm = getCmAdapter(view);
            if (!cm) return 'n';
            const cmState = (
                cm as {
                    state?: {
                        vim?: {
                            insertMode?: boolean;
                            visualMode?: boolean;
                            visualLine?: boolean;
                            visualBlock?: boolean;
                        };
                    };
                }
            ).state;
            const vimState = cmState?.vim;
            if (!vimState) return 'n';
            if (vimState.insertMode) return 'i';
            if (vimState.visualMode) {
                if (vimState.visualLine) return 'V';
                if (vimState.visualBlock) return '\x16';
                return 'v';
            }
            return 'n';
        },
        getCursorLine: () => {
            const view = app.workspace.getActiveViewOfType(MarkdownView);
            if (!view) return 0;
            const cm = getCmAdapter(view);
            if (!cm) return 0;
            const cursor = cm.getCursor();
            return cursor.line + 1;
        },
        getCursorCol: () => {
            const view = app.workspace.getActiveViewOfType(MarkdownView);
            if (!view) return 0;
            const cm = getCmAdapter(view);
            if (!cm) return 0;
            const cursor = cm.getCursor();
            return cursor.ch + 1;
        },
        getLine: (line: number) => {
            const view = app.workspace.getActiveViewOfType(MarkdownView);
            if (!view) return null;
            const cm = getCmAdapter(view);
            if (!cm) return null;
            try {
                return cm.getLine(line);
            } catch {
                return null;
            }
        },
        getPlatform: () => ({
            isMacOS: Platform.isMacOS,
            isLinux: Platform.isLinux,
            isWin: Platform.isWin,
            isMobile: Platform.isMobile,
            isIosApp: Platform.isIosApp,
            isAndroidApp: Platform.isAndroidApp,
        }),
        getObsidianVersion: () => apiVersion,
        getGlobal: (name) => globals.get(name),
        getOption: (name) => {
            try {
                return vim.getOption(name);
            } catch {
                return undefined;
            }
        },
    });

    const result = evalLua(L, content);
    autocmdManager.activate({
        onModeChange: (handler, adapter) => {
            const view = app.workspace.getActiveViewOfType(MarkdownView);
            const resolved = adapter ?? (view ? getCmAdapter(view) : null);
            if (!resolved) return undefined;
            resolved.on('vim-mode-change', handler);
            return () =>
                resolved.off(
                    'vim-mode-change',
                    handler as (...args: unknown[]) => void,
                );
        },
        onYank: (handler, adapter) => {
            const view = app.workspace.getActiveViewOfType(MarkdownView);
            const resolved = adapter ?? (view ? getCmAdapter(view) : null);
            if (!resolved) return undefined;
            resolved.on('vim-yank', handler as (...args: unknown[]) => void);
            return () =>
                resolved.off(
                    'vim-yank',
                    handler as (...args: unknown[]) => void,
                );
        },
        onFileOpen: (handler) => {
            const ref = app.workspace.on('file-open', handler);
            return () => app.workspace.offref(ref);
        },
        onFocusGained: (handler) => {
            const doc = app.workspace.containerEl.ownerDocument;
            const win = doc.defaultView ?? window;
            const onFocus = () => handler();
            const onVisible = () => {
                if (doc.visibilityState === 'visible') handler();
            };
            win.addEventListener('focus', onFocus);
            doc.addEventListener('visibilitychange', onVisible);
            return () => {
                win.removeEventListener('focus', onFocus);
                doc.removeEventListener('visibilitychange', onVisible);
            };
        },
        onFocusLost: (handler) => {
            const doc = app.workspace.containerEl.ownerDocument;
            const win = doc.defaultView ?? window;
            const onBlur = () => handler();
            const onHidden = () => {
                if (doc.visibilityState === 'hidden') handler();
            };
            win.addEventListener('blur', onBlur);
            doc.addEventListener('visibilitychange', onHidden);
            return () => {
                win.removeEventListener('blur', onBlur);
                doc.removeEventListener('visibilitychange', onHidden);
            };
        },
    });
    if (!result.ok) {
        return {
            found: true,
            ready: true,
            error: result.error,
            path,
            maps: [],
            unmaps: [],
            commandLabels: [],
            pendingExCommands: [],
            mapOperations: [],
            commandCount: 0,
            state: L,
            autocmdManager,
        };
    }

    return {
        found: true,
        ready: true,
        path,
        maps,
        unmaps,
        commandLabels,
        pendingExCommands,
        mapOperations,
        commandCount,
        state: L,
        autocmdManager,
    };
}
