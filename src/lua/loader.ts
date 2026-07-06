import { MarkdownView, Notice, Platform, apiVersion } from 'obsidian';
import type { App } from 'obsidian';
import type { VimApi } from '../types/vim-api';
import type { LeaderRegistry } from '../ui/which-key';
import { getCmAdapter } from '../vim/vim-api';
import { createSandboxedState, evalLua } from './engine';
import {
    injectVimApi,
    LuaKeymap,
    LuaKeymapDelete,
    LuaGlobalKeymap,
} from './api';
import type { BufferKeymapManager } from './buffer';
import { AutocmdManager } from './autocmd';
import { injectVimFn } from './fn';
import { injectStdlib } from './stdlib';
import { injectTimers, TimerManager } from './timers';
import { HighlightManager } from './highlight';
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
    globalMaps: LuaGlobalKeymap[];
    globalUnmaps: string[];
    globalWhichKeyLabels: Array<{ key: string; label: string }>;
    globalWhichKeyGroups: Array<{ key: string; label: string }>;
    commandCount: number;
    state: lua_State | null;
    autocmdManager: AutocmdManager | null;
    timerManager: TimerManager | null;
    highlightManager: HighlightManager | null;
}

/**
 * Fallback chain for lua config file resolution (first match wins).
 * The `.obsidian.*` variants are last because they rely on a linter
 * workaround (`app.vault.configDir` concatenation) and Obsidian Sync
 * skips dotfiles.
 */
const LUA_FALLBACK_PATHS: readonly string[] = [
    'init.lua',
    '.init.lua',
    'obsidian.init.lua',
];

function getLuaFallbackPaths(app: App): readonly string[] {
    const dir = app.vault.configDir;
    return [...LUA_FALLBACK_PATHS, `${dir}.init.lua`, 'obsidian.lua'];
}

async function fileExists(app: App, path: string): Promise<boolean> {
    try {
        await app.vault.adapter.read(path);
        return true;
    } catch {
        return false;
    }
}

async function resolveLuaConfigPath(
    app: App,
    customPath?: string,
): Promise<{ path: string; found: boolean }> {
    if (customPath) {
        const exists = await fileExists(app, customPath);
        return { path: customPath, found: exists };
    }
    for (const candidate of getLuaFallbackPaths(app)) {
        if (await fileExists(app, candidate)) {
            return { path: candidate, found: true };
        }
    }
    return { path: LUA_FALLBACK_PATHS[0]!, found: false };
}

export { LUA_FALLBACK_PATHS, getLuaFallbackPaths, resolveLuaConfigPath };

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
    bufferKeymapManager?: BufferKeymapManager,
): Promise<LuaLoadResult> {
    const { path, found } = await resolveLuaConfigPath(app, customPath);
    const doc = app.workspace.containerEl.ownerDocument;
    const highlightManager = new HighlightManager(doc);

    const content = found ? await readLuaFile(app, path) : null;
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
            globalMaps: [],
            globalUnmaps: [],
            globalWhichKeyLabels: [],
            globalWhichKeyGroups: [],
            commandCount: 0,
            state: null,
            autocmdManager: null,
            timerManager: null,
            highlightManager,
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
    const globalMaps: LuaGlobalKeymap[] = [];
    const globalUnmaps: string[] = [];
    const globalWhichKeyLabels: Array<{ key: string; label: string }> = [];
    const globalWhichKeyGroups: Array<{ key: string; label: string }> = [];

    const L = createSandboxedState();
    const autocmdManager = new AutocmdManager(L);
    const { globals } = injectVimApi(L, {
        highlightManager,
        onSettingOverride: (key, value, directive) => {
            commandCount++;
            onSettingOverride?.(key, value, directive);
            if (key === 'updatetime' && typeof value === 'number') {
                autocmdManager.setUpdateTime(value);
            }
        },
        handleExCommand: (command: string) => {
            commandCount++;
            pendingExCommands.push(command);
        },
        getVaultName: () => app.vault.getName(),
        getAppVersion: () => apiVersion,
        getPluginVersion: () => {
            return (
                (
                    app as unknown as {
                        plugins?: {
                            manifests?: Record<string, { version?: string }>;
                        };
                    }
                ).plugins?.manifests?.['vim-motions']?.version ?? ''
            );
        },
        executeCommand: (id: string) => {
            (
                app as unknown as {
                    commands: { executeCommandById: (id: string) => void };
                }
            ).commands.executeCommandById(id);
        },
        listCommands: () => {
            const commands = (
                app as unknown as {
                    commands: {
                        commands: Record<string, { id: string; name: string }>;
                    };
                }
            ).commands.commands;
            return Object.values(commands).map((cmd) => ({
                id: cmd.id,
                name: cmd.name,
            }));
        },
        openFile: (path: string) => {
            void app.workspace.openLinkText(path, '');
        },
        getCurrentFile: () => {
            const file = app.workspace.getActiveFile();
            if (!file) return null;
            return {
                path: file.path,
                name: file.name,
                extension: file.extension,
                basename: file.basename,
            };
        },
        getVaultPath: () => {
            try {
                const adapter = app.vault.adapter as {
                    getBasePath?: () => string;
                };
                return adapter.getBasePath?.() ?? null;
            } catch {
                return null;
            }
        },
        getActiveFilePath: () => app.workspace.getActiveFile()?.path ?? null,
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
        onBufferKeymap: (filePath, map) => {
            commandCount++;
            if (!bufferKeymapManager) {
                console.warn(
                    'Vim Motions: buffer-local keymaps are not available without a buffer manager',
                );
                return;
            }
            bufferKeymapManager.register(filePath, map);
            if (map.desc) {
                commandLabels.push({ key: map.lhs, label: map.desc });
            }
        },
        onKeymapDel: (map) => {
            commandCount++;
            unmaps.push(map);
            mapOperations.push({ type: 'unmap', map });
        },
        onBufferKeymapDel: (filePath, mode, lhs) => {
            commandCount++;
            if (!bufferKeymapManager) {
                console.warn(
                    'Vim Motions: buffer-local keymap deletes are not available without a buffer manager',
                );
                return;
            }
            bufferKeymapManager.unregister(
                filePath,
                mode as LuaKeymap['mode'],
                lhs,
            );
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
        getLineCount: () => {
            const view = app.workspace.getActiveViewOfType(MarkdownView);
            if (!view) return 0;
            return view.editor.lineCount();
        },
        getLines: (start, end) => {
            const view = app.workspace.getActiveViewOfType(MarkdownView);
            if (!view) return [];
            const editor = view.editor;
            const lineCount = editor.lineCount();
            const actualEnd = end === -1 ? lineCount : Math.min(end, lineCount);
            const result: string[] = [];
            for (let i = start; i < actualEnd; i++) {
                result.push(editor.getLine(i));
            }
            return result;
        },
        setLines: (start, end, lines) => {
            const view = app.workspace.getActiveViewOfType(MarkdownView);
            if (!view) return;
            const editor = view.editor;
            const lineCount = editor.lineCount();
            const actualEnd = end === -1 ? lineCount : Math.min(end, lineCount);
            if (lineCount === 0 && actualEnd === 0) {
                editor.replaceRange(lines.join('\n'), { line: 0, ch: 0 });
                return;
            }
            const from = { line: start, ch: 0 };
            const to =
                actualEnd >= lineCount
                    ? {
                          line: lineCount - 1,
                          ch: editor.getLine(lineCount - 1).length,
                      }
                    : { line: actualEnd, ch: 0 };
            const text =
                lines.length === 0
                    ? ''
                    : lines.join('\n') + (actualEnd < lineCount ? '\n' : '');
            editor.replaceRange(text, from, to);
        },
        autocmdManager,
        onGlobalKeymap: (map) => {
            commandCount++;
            globalMaps.push(map);
        },
        onGlobalKeymapDel: (lhs) => {
            commandCount++;
            globalUnmaps.push(lhs);
        },
        onWhichKeyGroupLabel: (key, label, context) => {
            commandCount++;
            if (context === 'global') {
                globalWhichKeyGroups.push({ key, label });
            } else {
                onSettingOverride?.('whichKeyGroupLabel', { key, label });
            }
        },
        onWhichKeyCommandLabel: (key, label, context) => {
            commandCount++;
            if (context === 'global') {
                globalWhichKeyLabels.push({ key, label });
            } else {
                onSettingOverride?.('whichKeyCommandLabel', { key, label });
            }
        },
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
        getLineCount: () => {
            const view = app.workspace.getActiveViewOfType(MarkdownView);
            if (!view) return 0;
            return view.editor.lineCount();
        },
        getLines: (start: number, end: number) => {
            const view = app.workspace.getActiveViewOfType(MarkdownView);
            if (!view) return [];
            const editor = view.editor;
            const lineCount = editor.lineCount();
            const actualEnd = end === -1 ? lineCount : Math.min(end, lineCount);
            const result: string[] = [];
            for (let i = start; i < actualEnd; i++) {
                result.push(editor.getLine(i));
            }
            return result;
        },
        setLines: (start: number, end: number, lines: string[]) => {
            const view = app.workspace.getActiveViewOfType(MarkdownView);
            if (!view) return;
            const editor = view.editor;
            const lineCount = editor.lineCount();
            const actualEnd = end === -1 ? lineCount : Math.min(end, lineCount);
            if (lineCount === 0 && actualEnd === 0) {
                editor.replaceRange(lines.join('\n'), { line: 0, ch: 0 });
                return;
            }
            const from = { line: start, ch: 0 };
            const to =
                actualEnd >= lineCount
                    ? {
                          line: lineCount - 1,
                          ch: editor.getLine(lineCount - 1).length,
                      }
                    : { line: actualEnd, ch: 0 };
            const text =
                lines.length === 0
                    ? ''
                    : lines.join('\n') + (actualEnd < lineCount ? '\n' : '');
            editor.replaceRange(text, from, to);
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

    injectStdlib(L);
    const timerManager = injectTimers(L);

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
        onCursorMoved: (handler, adapter) => {
            const view = app.workspace.getActiveViewOfType(MarkdownView);
            const resolved = adapter ?? (view ? getCmAdapter(view) : null);
            if (!resolved) return undefined;
            const wrappedHandler = () => {
                const currentFile = app.workspace.getActiveFile();
                handler(currentFile?.path ?? '');
            };
            resolved.on('vim-command-done', wrappedHandler);
            return () => resolved.off('vim-command-done', wrappedHandler);
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
            globalMaps: [],
            globalUnmaps: [],
            globalWhichKeyLabels: [],
            globalWhichKeyGroups: [],
            commandCount: 0,
            state: L,
            autocmdManager,
            timerManager,
            highlightManager,
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
        globalMaps,
        globalUnmaps,
        globalWhichKeyLabels,
        globalWhichKeyGroups,
        commandCount,
        state: L,
        autocmdManager,
        timerManager,
        highlightManager,
    };
}
