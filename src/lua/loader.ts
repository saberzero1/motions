import {
    MarkdownView,
    Notice,
    Platform,
    apiVersion,
    getAllTags,
    parseFrontMatterAliases,
    TFile,
} from 'obsidian';
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
    type VimApiCallbacks,
} from './api';
import type { BufferKeymapManager } from './buffer';
import { AutocmdManager } from './autocmd';
import { injectVimFn } from './fn';
import { injectStdlib } from './stdlib';
import { injectTimers, TimerManager } from './timers';
import { HighlightManager } from './highlight';
import { injectSnippetApi, type LuaSnippetDef } from './snippet-api';
import type { lua_State } from 'fengari';
import type { ImSwitcher } from '../im/im-switcher';
import {
    isAbsolutePath,
    readExternalFile,
    externalFileExists,
} from '../util/external-fs';
import {
    executeCommand as execCmd,
    getCommandRegistry,
} from '../util/commands';
import { getLeafId, isLeafPinned, getViewFilePath } from '../util/leaf';
import { navigateWithJump } from '../workspace/navigate';

export interface LuaLoadResult {
    found: boolean;
    ready: boolean;
    error?: string;
    path: string;
    maps: LuaKeymap[];
    unmaps: LuaKeymapDelete[];
    commandLabels: Array<{
        key: string;
        label: string;
        icon?: string;
        color?: string;
    }>;
    pendingExCommands: string[];
    mapOperations: Array<
        | { type: 'map'; map: LuaKeymap }
        | { type: 'unmap'; map: LuaKeymapDelete }
    >;
    globalMaps: LuaGlobalKeymap[];
    globalUnmaps: string[];
    globalWhichKeyLabels: Array<{
        key: string;
        label: string;
        icon?: string;
        color?: string;
    }>;
    globalWhichKeyGroups: Array<{
        key: string;
        label: string;
        icon?: string;
        color?: string;
    }>;
    surroundPairs: Array<{ trigger: string; open: string; close: string }>;
    leaderBindings: Array<{
        key: string;
        commandId: string;
        desc?: string;
    }>;
    commandCount: number;
    activateRuntimeExHandler?: (handler: (command: string) => void) => void;
    deactivateRuntimeExHandler?: () => void;
    state: lua_State | null;
    autocmdManager: AutocmdManager | null;
    timerManager: TimerManager | null;
    highlightManager: HighlightManager | null;
    luaSnippets: LuaSnippetDef[];
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
    if (isAbsolutePath(path)) {
        return externalFileExists(path);
    }
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
    if (isAbsolutePath(path)) {
        return readExternalFile(path);
    }

    let stat: { size: number } | null = null;
    try {
        stat = await app.vault.adapter.stat(path);
    } catch {
        // stat() failed
    }
    if (!stat) return null;

    try {
        const content = await app.vault.adapter.read(path);
        if (content !== null && content.trim().length > 0) {
            return content;
        }

        if (stat.size === 0) {
            return content;
        }

        const delays = [50, 100, 200, 400];
        for (const delay of delays) {
            await new Promise((r) => window.setTimeout(r, delay));
            const retry = await app.vault.adapter.read(path);
            if (retry !== null && retry.trim().length > 0) {
                return retry;
            }
        }

        console.warn(
            `Vim Motions: init.lua "${path}" has ${stat.size} bytes but read returned empty after retries`,
        );
        return content;
    } catch {
        return null;
    }
}

export interface LoadInitLuaOptions {
    leaderRegistry?: LeaderRegistry;
    onSettingOverride?: (
        key: string,
        value: unknown,
        directive?: string,
    ) => void;
    customPath?: string;
    bufferKeymapManager?: BufferKeymapManager;
    openPicker?: (source: string, opts?: { query?: string }) => void;
    oilCallbacks?: Pick<
        VimApiCallbacks,
        | 'oilOpen'
        | 'oilClose'
        | 'oilParent'
        | 'oilRoot'
        | 'oilRefresh'
        | 'oilToggleHidden'
        | 'oilCycleSort'
        | 'oilYankPath'
        | 'oilReveal'
        | 'oilOpenEntry'
    >;
    onPickerKeymapChange?: (keymap: Record<string, string[]>) => void;
    globalRegistry?: {
        addMapping: (
            keys: string,
            action:
                | { type: 'obcommand'; commandId: string }
                | { type: 'ex'; command: string },
            opts: {
                source: 'default' | 'user';
                gate: 'standard' | 'hint' | 'structural';
            },
        ) => void;
        removeMapping: (keys: string) => boolean;
        setLabel: (keys: string, label: string) => void;
    };
    imSwitcher?: ImSwitcher | null;
}

export async function loadInitLua(
    app: App,
    vim: VimApi,
    options: LoadInitLuaOptions = {},
): Promise<LuaLoadResult> {
    const {
        leaderRegistry,
        onSettingOverride,
        customPath,
        bufferKeymapManager,
        openPicker,
        oilCallbacks,
        onPickerKeymapChange,
        globalRegistry,
        imSwitcher,
    } = options;
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
            surroundPairs: [],
            leaderBindings: [],
            commandCount: 0,
            luaSnippets: [],
            state: null,
            autocmdManager: null,
            timerManager: null,
            highlightManager,
        };
    }

    let commandCount = 0;
    const maps: LuaKeymap[] = [];
    const unmaps: LuaKeymapDelete[] = [];
    const commandLabels: Array<{
        key: string;
        label: string;
        icon?: string;
        color?: string;
    }> = [];
    const pendingExCommands: string[] = [];
    const mapOperations: Array<
        | { type: 'map'; map: LuaKeymap }
        | { type: 'unmap'; map: LuaKeymapDelete }
    > = [];
    const globalMaps: LuaGlobalKeymap[] = [];
    const globalUnmaps: string[] = [];
    const globalWhichKeyLabels: Array<{
        key: string;
        label: string;
        icon?: string;
        color?: string;
    }> = [];
    const globalWhichKeyGroups: Array<{
        key: string;
        label: string;
        icon?: string;
        color?: string;
    }> = [];
    const surroundPairs: Array<{
        trigger: string;
        open: string;
        close: string;
    }> = [];
    const leaderBindings: Array<{
        key: string;
        commandId: string;
        desc?: string;
    }> = [];

    let runtimeExHandler: ((command: string) => void) | null = null;

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
            if (runtimeExHandler) {
                runtimeExHandler(command);
            } else {
                pendingExCommands.push(command);
            }
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
        openPicker: (source, opts) => {
            openPicker?.(source, opts);
        },
        executeCommand: (id: string) => {
            execCmd(app, id);
        },
        getActiveLeafInfo: () => {
            const leaf = app.workspace.getMostRecentLeaf();
            if (!leaf?.view) return null;
            return {
                id: getLeafId(leaf),
                type:
                    (
                        leaf.view as unknown as { getViewType?: () => string }
                    ).getViewType?.() ?? 'empty',
                pinned: isLeafPinned(leaf),
                filePath: app.workspace.getActiveFile()?.path ?? null,
            };
        },
        listLeaves: () => {
            const result: Array<{
                id: string;
                type: string;
                pinned: boolean;
                filePath: string | null;
            }> = [];
            const rootSplit = app.workspace.rootSplit;
            app.workspace.iterateAllLeaves((leaf) => {
                if (leaf.getRoot() === rootSplit) {
                    const view = leaf.view;
                    result.push({
                        id: getLeafId(leaf),
                        type:
                            (
                                view as unknown as {
                                    getViewType?: () => string;
                                }
                            ).getViewType?.() ?? 'empty',
                        pinned: isLeafPinned(leaf),
                        filePath: getViewFilePath(view),
                    });
                }
            });
            return result;
        },
        isMarkdownView: () => {
            return app.workspace.getActiveViewOfType(MarkdownView) !== null;
        },
        listCommands: () => {
            const commands = getCommandRegistry(app);
            return Object.values(commands).map((cmd) => ({
                id: cmd.id,
                name: cmd.name,
            }));
        },
        openFile: (path: string) => {
            void navigateWithJump(app, path, '');
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
        ...oilCallbacks,
        onPickerKeymapChange,
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
        setOption: (name, value) => {
            try {
                vim.setOption(name, value);
            } catch {
                return;
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
            if (globalRegistry) {
                const normalized = map.lhs.replace(/ /g, '<Space>');
                let action:
                    | { type: 'obcommand'; commandId: string }
                    | { type: 'ex'; command: string };
                if (map.rhs.startsWith(':obcommand ')) {
                    action = {
                        type: 'obcommand',
                        commandId: map.rhs.slice(':obcommand '.length).trim(),
                    };
                } else if (map.rhs.startsWith(':')) {
                    action = { type: 'ex', command: map.rhs.slice(1).trim() };
                } else {
                    return;
                }
                globalRegistry.addMapping(normalized, action, {
                    source: 'user',
                    gate: 'standard',
                });
                if (map.desc) globalRegistry.setLabel(normalized, map.desc);
            }
        },
        onGlobalKeymapDel: (lhs) => {
            commandCount++;
            globalUnmaps.push(lhs);
            if (globalRegistry) {
                globalRegistry.removeMapping(lhs.replace(/ /g, '<Space>'));
            }
        },
        onWhichKeyGroupLabel: (key, label, context, icon, color) => {
            commandCount++;
            if (context === 'global') {
                globalWhichKeyGroups.push({ key, label, icon, color });
            } else {
                onSettingOverride?.('whichKeyGroupLabel', {
                    key,
                    label,
                    icon,
                    color,
                });
            }
        },
        onWhichKeyCommandLabel: (key, label, context, icon, color) => {
            commandCount++;
            if (context === 'global') {
                globalWhichKeyLabels.push({ key, label, icon, color });
            } else {
                onSettingOverride?.('whichKeyCommandLabel', {
                    key,
                    label,
                    icon,
                    color,
                });
            }
        },
        getModePrompt: (_key) => {
            return undefined;
        },
        onCursorConfig: (shapes) => {
            commandCount++;
            onSettingOverride?.('cursorShapes', shapes);
        },
        onModePromptConfig: (prompts) => {
            commandCount++;
            for (const [mode, value] of Object.entries(prompts)) {
                onSettingOverride?.(
                    `modePrompts.${mode}`,
                    value,
                    `vim.obsidian.modeprompt.set({${mode} = ${JSON.stringify(value)}})`,
                );
            }
        },
        onSurroundPair: (trigger, open, close) => {
            commandCount++;
            surroundPairs.push({ trigger, open, close });
        },
        onSurroundPairDel: (trigger) => {
            commandCount++;
            const idx = surroundPairs.findIndex((p) => p.trigger === trigger);
            if (idx !== -1) surroundPairs.splice(idx, 1);
        },
        onLeaderBinding: (key, commandId, desc) => {
            commandCount++;
            leaderBindings.push({ key, commandId, desc });
        },
        onLeaderBindingDel: (key) => {
            commandCount++;
            const idx = leaderBindings.findIndex((b) => b.key === key);
            if (idx !== -1) leaderBindings.splice(idx, 1);
        },
        focusDirection: (direction: string) => {
            const commandMap: Record<string, string> = {
                left: 'editor:focus-left',
                right: 'editor:focus-right',
                top: 'editor:focus-top',
                bottom: 'editor:focus-bottom',
            };
            const commandId = commandMap[direction];
            if (commandId) {
                execCmd(app, commandId);
            }
        },
        closeActiveLeaf: () => {
            execCmd(app, 'workspace:close');
        },
        splitDirection: (direction: string) => {
            execCmd(app, `workspace:split-${direction}`);
        },
        getLeafForFile: (path: string) => {
            let found: {
                id: string;
                type: string;
                pinned: boolean;
                filePath: string | null;
            } | null = null;
            app.workspace.iterateAllLeaves((leaf) => {
                if (found) return;
                const view = leaf.view;
                const viewFile = getViewFilePath(view);
                if (viewFile === path) {
                    found = {
                        id: getLeafId(leaf),
                        type:
                            (
                                view as unknown as {
                                    getViewType?: () => string;
                                }
                            ).getViewType?.() ?? 'empty',
                        pinned: isLeafPinned(leaf),
                        filePath: viewFile,
                    };
                }
            });
            return found;
        },
        fsFiles: (pattern?: string) => {
            const files = app.vault.getMarkdownFiles().map((f) => f.path);
            if (!pattern) return files;
            const regex = new RegExp(
                pattern
                    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
                    .replace(/\*/g, '.*')
                    .replace(/\?/g, '.'),
            );
            return files.filter((f) => regex.test(f));
        },
        fsAllFiles: () => {
            return app.vault.getFiles().map((f) => f.path);
        },
        fsFolders: () => {
            return app.vault.getAllFolders().map((f) => f.path);
        },
        fsExists: (path: string) => {
            return app.vault.getAbstractFileByPath(path) !== null;
        },
        fsStat: (path?: string) => {
            const filePath = path ?? app.workspace.getActiveFile()?.path;
            if (!filePath) return null;
            const file = app.vault.getAbstractFileByPath(filePath);
            if (!file || !(file instanceof TFile)) return null;
            return {
                ctime: file.stat.ctime,
                mtime: file.stat.mtime,
                size: file.stat.size,
            };
        },
        fsCreate: (path: string, content?: string) => {
            const configDir = app.vault.configDir;
            if (path.startsWith(configDir)) return;
            void app.vault.create(path, content ?? '');
        },
        fsWrite: (path: string | undefined, content: string) => {
            const filePath = path ?? app.workspace.getActiveFile()?.path;
            if (!filePath) return;
            const configDir = app.vault.configDir;
            if (filePath.startsWith(configDir)) return;
            const file = app.vault.getAbstractFileByPath(filePath);
            if (!file || !(file instanceof TFile)) return;
            void app.vault.modify(file, content);
        },
        fsAppend: (path: string | undefined, content: string) => {
            const filePath = path ?? app.workspace.getActiveFile()?.path;
            if (!filePath) return;
            const configDir = app.vault.configDir;
            if (filePath.startsWith(configDir)) return;
            const file = app.vault.getAbstractFileByPath(filePath);
            if (!file || !(file instanceof TFile)) return;
            void app.vault.append(file, content);
        },
        fsRename: (path: string | undefined, newPath: string) => {
            const filePath = path ?? app.workspace.getActiveFile()?.path;
            if (!filePath) return;
            const configDir = app.vault.configDir;
            if (filePath.startsWith(configDir)) return;
            if (newPath.startsWith(configDir)) return;
            const file = app.vault.getAbstractFileByPath(filePath);
            if (!file || !(file instanceof TFile)) return;
            void app.fileManager.renameFile(file, newPath);
        },
        fsMove: (path: string | undefined, dest: string) => {
            const filePath = path ?? app.workspace.getActiveFile()?.path;
            if (!filePath) return;
            const configDir = app.vault.configDir;
            if (filePath.startsWith(configDir)) return;
            if (dest.startsWith(configDir)) return;
            const file = app.vault.getAbstractFileByPath(filePath);
            if (!file || !(file instanceof TFile)) return;
            const destAbstract = app.vault.getAbstractFileByPath(dest);
            let newPath = dest;
            if (destAbstract && 'children' in destAbstract) {
                newPath = dest.replace(/\/+$/, '') + '/' + file.name;
            }
            void app.fileManager.renameFile(file, newPath);
        },
        fsTrash: (path?: string) => {
            const filePath = path ?? app.workspace.getActiveFile()?.path;
            if (!filePath) return;
            const configDir = app.vault.configDir;
            if (filePath.startsWith(configDir)) return;
            const file = app.vault.getAbstractFileByPath(filePath);
            if (!file || !(file instanceof TFile)) return;
            void app.fileManager.trashFile(file);
        },
        getFileFrontmatter: (path?: string) => {
            const filePath = path ?? app.workspace.getActiveFile()?.path;
            if (!filePath) return null;
            const file = app.vault.getAbstractFileByPath(filePath);
            if (!file || !(file instanceof TFile)) return null;
            const cache = app.metadataCache.getFileCache(file);
            if (!cache?.frontmatter) return null;
            const fm = { ...cache.frontmatter };
            delete fm.position;
            return fm;
        },
        getFileTags: (path?: string) => {
            const filePath = path ?? app.workspace.getActiveFile()?.path;
            if (!filePath) return [];
            const file = app.vault.getAbstractFileByPath(filePath);
            if (!file || !(file instanceof TFile)) return [];
            const cache = app.metadataCache.getFileCache(file);
            if (!cache) return [];
            return getAllTags(cache) ?? [];
        },
        getFileLinks: (path?: string) => {
            const filePath = path ?? app.workspace.getActiveFile()?.path;
            if (!filePath) return [];
            const file = app.vault.getAbstractFileByPath(filePath);
            if (!file || !(file instanceof TFile)) return [];
            const cache = app.metadataCache.getFileCache(file);
            if (!cache?.links) return [];
            return cache.links.map((l) => ({
                link: l.link,
                display: l.displayText ?? l.link,
                original: l.original,
            }));
        },
        getFileBacklinks: (path?: string) => {
            const filePath = path ?? app.workspace.getActiveFile()?.path;
            if (!filePath) return [];
            const resolved = app.metadataCache.resolvedLinks;
            const sources: string[] = [];
            for (const [source, targets] of Object.entries(resolved)) {
                if (filePath in targets) {
                    sources.push(source);
                }
            }
            return sources;
        },
        getFileHeadings: (path?: string) => {
            const filePath = path ?? app.workspace.getActiveFile()?.path;
            if (!filePath) return [];
            const file = app.vault.getAbstractFileByPath(filePath);
            if (!file || !(file instanceof TFile)) return [];
            const cache = app.metadataCache.getFileCache(file);
            if (!cache?.headings) return [];
            return cache.headings.map((h) => ({
                heading: h.heading,
                level: h.level,
            }));
        },
        getFileEmbeds: (path?: string) => {
            const filePath = path ?? app.workspace.getActiveFile()?.path;
            if (!filePath) return [];
            const file = app.vault.getAbstractFileByPath(filePath);
            if (!file || !(file instanceof TFile)) return [];
            const cache = app.metadataCache.getFileCache(file);
            if (!cache?.embeds) return [];
            return cache.embeds.map((e) => ({
                link: e.link,
                display: e.displayText ?? e.link,
            }));
        },
        getFileAliases: (path?: string) => {
            const filePath = path ?? app.workspace.getActiveFile()?.path;
            if (!filePath) return [];
            const file = app.vault.getAbstractFileByPath(filePath);
            if (!file || !(file instanceof TFile)) return [];
            const cache = app.metadataCache.getFileCache(file);
            if (!cache?.frontmatter) return [];
            return parseFrontMatterAliases(cache.frontmatter) ?? [];
        },
        getFileTasks: (path?: string) => {
            const filePath = path ?? app.workspace.getActiveFile()?.path;
            if (!filePath) return [];
            const file = app.vault.getAbstractFileByPath(filePath);
            if (!file || !(file instanceof TFile)) return [];
            const cache = app.metadataCache.getFileCache(file);
            if (!cache?.listItems) return [];
            return cache.listItems
                .filter((item) => item.task !== undefined)
                .map((item) => ({
                    text: '',
                    status: item.task ?? ' ',
                    line: item.position.start.line + 1,
                }));
        },
        getFileLists: (path?: string) => {
            const filePath = path ?? app.workspace.getActiveFile()?.path;
            if (!filePath) return [];
            const file = app.vault.getAbstractFileByPath(filePath);
            if (!file || !(file instanceof TFile)) return [];
            const cache = app.metadataCache.getFileCache(file);
            if (!cache?.listItems) return [];
            return cache.listItems.map((item) => ({
                text: '',
                line: item.position.start.line + 1,
                indent: item.position.start.col,
            }));
        },
        getSelection: () => {
            const view = app.workspace.getActiveViewOfType(MarkdownView);
            if (!view) return null;
            const sel = view.editor.getSelection();
            return sel || null;
        },
        getCursorPosition: () => {
            const view = app.workspace.getActiveViewOfType(MarkdownView);
            if (!view) return null;
            const cursor = view.editor.getCursor();
            return { line: cursor.line + 1, col: cursor.ch + 1 };
        },
        setCursorPosition: (line: number, col: number) => {
            const view = app.workspace.getActiveViewOfType(MarkdownView);
            if (!view) return;
            view.editor.setCursor(line - 1, col - 1);
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
        imGet: () => imSwitcher?.lastKnownIm ?? null,
        imSet: (id: string) => {
            void imSwitcher?.set(id);
        },
        imSave: () => {
            const leafId = autocmdManager.currentLeafId ?? '';
            imSwitcher?.save(leafId);
        },
        imRestore: () => {
            const leafId = autocmdManager.currentLeafId ?? '';
            imSwitcher?.restore(leafId);
        },
        imGetEnabled: () => imSwitcher?.config.enabled ?? false,
        imSetEnabled: (_value: boolean) => {
            console.warn(
                'Vim Motions: vim.obsidian.im.enabled setter is not wired to settings yet.',
            );
        },
        imGetAuto: () => imSwitcher?.config.autoWire ?? true,
        imSetAuto: (value: boolean) => {
            imSwitcher?.setAutoWire(value);
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
    const luaSnippets = injectSnippetApi(L);

    const result = evalLua(L, content);
    const initialFilePath = app.workspace.getActiveFile()?.path ?? null;
    autocmdManager.activate(
        {
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
                resolved.on(
                    'vim-yank',
                    handler as (...args: unknown[]) => void,
                );
                return () =>
                    resolved.off(
                        'vim-yank',
                        handler as (...args: unknown[]) => void,
                    );
            },
            onDialog: (handler, adapter) => {
                const view = app.workspace.getActiveViewOfType(MarkdownView);
                const resolved = adapter ?? (view ? getCmAdapter(view) : null);
                if (!resolved) return undefined;
                resolved.on('dialog', handler);
                return () => resolved.off('dialog', handler);
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
        },
        initialFilePath,
    );
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
            surroundPairs: [],
            leaderBindings: [],
            commandCount: 0,
            luaSnippets,
            state: L,
            autocmdManager,
            timerManager,
            highlightManager,
            activateRuntimeExHandler: (handler) => {
                runtimeExHandler = handler;
            },
            deactivateRuntimeExHandler: () => {
                runtimeExHandler = null;
            },
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
        surroundPairs,
        leaderBindings,
        commandCount,
        luaSnippets,
        state: L,
        autocmdManager,
        timerManager,
        highlightManager,
        activateRuntimeExHandler: (handler) => {
            runtimeExHandler = handler;
        },
        deactivateRuntimeExHandler: () => {
            runtimeExHandler = null;
        },
    };
}
