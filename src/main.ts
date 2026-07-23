import { MarkdownView, Notice, Platform, Plugin, apiVersion } from 'obsidian';
import {
    DEFAULT_SETTINGS,
    CommandLabel,
    GroupLabel,
    VimMotionsSettings,
    VimMotionsSettingTab,
} from './settings';

import { registerEasyMotion } from './easymotion/register';
import { registerFlash } from './flash/register';
import { enableFlashSearch } from './flash/search-mode';
import {
    registerNavigationMotions,
    registerTableMotions,
    registerTableActions,
    registerBufferNavigation,
    registerSubwordMotions,
} from './motions/register';
import {
    registerOperators,
    registerReplaceWithRegister,
} from './operators/register';
import { createSmartOpenLineAction } from './actions/open-line';
import { registerDial } from './actions/register-dial';
import { registerTextObjects } from './text-objects/register';
import { createAsymmetricPairTextObject } from './text-objects/pair-util';
import { VimModeTracker } from './vim/mode-tracker';
import { ScrolloffManager, createScrolloffExtension } from './vim/scrolloff';
import {
    loadVimrc,
    applyVimrcMaps,
    applyVimrcCommands,
    applyPendingExCommands,
    readAndParseVimrcFile,
} from './vimrc/loader';
import type { VimrcLoadResult } from './vimrc/loader';
import { registerExCommands, registerObCommand } from './workspace/commands';
import { registerWorkspaceNavigation } from './workspace/navigation';
import { YankRingManager, registerYankRing } from './vim/yank-ring';
import { GlobalKeyHandler } from './workspace/global-key-handler';
import {
    GlobalMappingRegistry,
    normalizeKeyString,
} from './workspace/global-mapping-registry';
import type { DeferredGlobalMap } from './vimrc/loader';
import {
    registerDefaultGlobalMappings,
    createJumpListWalkOverride,
} from './workspace/global-defaults';
import { GlobalWhichKeyOverlay } from './ui/global-which-key';
import { getVimApi, getCmAdapter } from './vim/vim-api';
import {
    createBundledVimExtension,
    installVimBridge,
    uninstallVimBridge,
    isBundledVimActive,
} from './vim/bundled-vim';
import { ExCommandSuggest } from './ui/ex-suggest';
import { createHintActions } from './ui/hint-mode';
import {
    LeaderRegistry,
    WhichKeyOverlay,
    normalizeVimKey,
} from './ui/which-key';
import type { WhichKeyLabelInfo } from './ui/which-key';
import { InsertEscapeHandler } from './vim/insert-escape';
import { registerVimOptions } from './vim/options';
import { KNOWN_SET_OPTIONS } from './vimrc/loader';
import { VimRegistration } from './vim/registration';
import {
    ChangeList,
    createOlderChangeMotion,
    createNewerChangeMotion,
} from './vim/changelist';
import { UndoTree, type SerializedUndoTree } from './vim/undo-tree';
import {
    UndoTreeView,
    UNDO_TREE_VIEW_TYPE,
    createUndoTreeViewFactory,
} from './vim/undo-tree-view';
import { JumpList } from './vim/jumplist';
import { VimInfoModal } from './ui/vim-info-modal';
import { installTableWidgetSuppressor } from './vim/table-widget-suppressor';
import {
    tableRenderField,
    setTableRenderEnabled,
} from './vim/table-render-widget';
import { createTableFormatOnExitExtension } from './vim/table-format-on-exit';
import {
    tableEmbeddedField,
    setEmbeddedModeEnabled,
    setTableEmbeddedMode,
} from './vim/table-embedded-editor';
import {
    setCellEditorCursorShapes,
    destroyCellEditorCursorSheet,
} from './vim/table-cell-editor';
import { EditorView } from '@codemirror/view';
import { ChangeSet, Transaction } from '@codemirror/state';
import {
    yankHighlightExtension,
    showYankHighlight,
} from './vim/yank-highlight';
import { foldSyncExtension, setFoldAwareNavigation } from './vim/fold-sync';
import { foldLevelExtension } from './fold/fold-level';
import { markdownFoldProvider } from './fold/provider';
import { FoldPersistenceStore } from './fold/persistence';
import { foldPlaceholderExtension } from './fold/placeholder';
import {
    createMarkGutterExtension,
    reconfigureMarkGutter,
    signColumnFieldExtension,
    scheduleMarkGutterRefresh,
    cancelMarkGutterRefresh,
} from './vim/mark-gutter';
import type { PersistedMarkEntry } from './vim/mark-gutter';
import {
    createLineNumberExtension,
    createLineNumberSecondaryExtension,
    reconfigureLineNumbers,
    setNumberwidth,
} from './vim/line-number-gutter';
import {
    createStatusColumnExtension,
    reconfigureStatusColumn,
    type StatusColumnSettings,
} from './vim/statuscolumn';
import {
    createCursorlineExtension,
    reconfigureCursorline,
} from './vim/cursorline';
import {
    createFoldColumnExtension,
    reconfigureFoldColumn,
} from './vim/fold-column';
import { MarkStore } from './vim/mark-store';
import { HarpoonStore } from './vim/harpoon-store';
import { navigateToHarpoonPin } from './vim/harpoon-nav';
import { createHarpoonSource } from './picker/sources/harpoon';
import type { VimYankEvent, CmAdapter } from './types/vim-api';

import { installVisualLineCommandFix } from './vim/visual-line-command-fix';
import { linewiseWidgetHighlightExtension } from './vim/linewise-widget-highlight';
import { createAnimatedCursorExtension } from './vim/animated-cursor/controller';
import {
    setAnimatedCursorConfig,
    setCursorShapes,
} from './vim/animated-cursor/config';
import { destroyAnimatedCursorManager } from './vim/animated-cursor/manager';
import { setCursorSuppressed } from '@replit/codemirror-vim';
import { loadInitLua } from './lua/loader';
import { BufferKeymapManager, VimMapUnmap } from './lua/buffer';
import type { LuaLoadResult } from './lua/loader';
import { createSandboxedState, destroyState, evalLua } from './lua/engine';
import { injectVimApi } from './lua/api';
import { injectVimFn } from './lua/fn';
import { AutocmdManager } from './lua/autocmd';
import {
    migrateConfigModeSettings,
    migrateSigncolumnSettings,
} from './settings-migration';
import type { lua_State } from 'fengari';
import { pickerRegistry } from './picker/registry';
import type { PickerSource } from './picker/types';
import { createMatcher } from './picker/matcher';
import type { ManagedMatcher } from './picker/matcher';
import { FrecencyStore } from './picker/frecency';
import { getLastSession, PickerModal } from './picker/picker';
import { createFilesSource } from './picker/sources/files';
import { createBuffersSource } from './picker/sources/buffers';
import { createCommandsSource } from './picker/sources/commands';
import { createGrepSource } from './picker/sources/grep';
import { createLiveGrepSource } from './picker/sources/live-grep';
import {
    createHeadingsSource,
    createOutlineSource,
} from './picker/sources/headings';
import { createBacklinksSource } from './picker/sources/backlinks';
import { createTagsSource } from './picker/sources/tags';
import { createRecentSource, trackRecentFile } from './picker/sources/recent';
import { createMarksSource } from './picker/sources/marks';
import {
    VimBufferMarkProvider,
    SpecialMarkProvider,
    GlobalMarkProvider,
} from './picker/sources/mark-providers';
import { createRegistersSource } from './picker/sources/registers';
import { createPickersSource } from './picker/sources/pickers';
import { installPickerAPI, uninstallPickerAPI } from './picker/api';
import type { PickerAPI } from './picker/api';
import {
    createOmnisearchSource,
    isOmnisearchAvailable,
} from './picker/sources/omnisearch';
import { createTasksSource, isTasksAvailable } from './picker/sources/tasks';
import {
    createDataviewSource,
    isDataviewAvailable,
} from './picker/sources/dataview';
import { OilCache } from './oil/cache';
import { OilKeybindingManager } from './oil/keybindings';
import { OilManager } from './oil/manager';
import { OilView, createOilViewFactory } from './oil/oil-view';
import { TextareaVimManager } from './vim/textarea-vim-manager';
import { ImSwitcher } from './im/im-switcher';
import { parseImArgs } from './im/im-process';
import {
    createCompositionTrackerExtension,
    isAnyViewComposing,
} from './im/composition-tracker';
import {
    createImModeWatcherExtension,
    setImModeCallbacks,
    clearImModeCallbacks,
} from './im/im-mode-watcher';
import { expandTilde } from './util/external-fs';
import { getLeafId } from './util/leaf';
import { getEditorView } from './util/editor';
import { isBuiltinVimEnabled } from './util/vault';
import { autocompletion } from './snippets/autocomplete-types';
import { loadSnippets, loadSnippetsSync } from './snippets/loader';
import { createSnippetCompletionSource } from './snippets/completion-source';
import { createSnippetTabKeymap } from './snippets/tab-expand';
import { registerSnippetCommands } from './snippets/commands';
import { createSnippetsPickerSource } from './snippets/picker-source';
import type { SnippetRegistry } from './snippets/registry';
import type { PreprocessContext } from './snippets/types';
import {
    createDynamicSnippetPlugin,
    getActiveDynamicContext,
    setActiveDynamicContext,
} from './snippets/dynamic-bridge';
import { snippetState } from './snippets/autocomplete-types';
import { setJumpListInstance } from './workspace/navigate';

const MAX_PERSISTED_UNDO_TREES = 50;

export default class VimMotionsPlugin extends Plugin {
    settings!: VimMotionsSettings;
    registration: VimRegistration | null = null;
    leaderRegistry: LeaderRegistry | null = null;
    changeList: ChangeList = new ChangeList();
    undoTree: UndoTree = new UndoTree();
    jumpList: JumpList = new JumpList();
    modeTracker: VimModeTracker | null = null;
    scrolloffManager: ScrolloffManager | null = null;
    insertEscapeHandler: InsertEscapeHandler | null = null;
    whichKeyOverlay: WhichKeyOverlay | null = null;
    private flashSearchCleanup: (() => void) | null = null;
    private uninstallTableSuppressor: (() => void) | null = null;
    private uninstallVisualLineFix: (() => void) | null = null;
    private yankHighlightCleanup: (() => void) | null = null;
    private markGutterCleanup: (() => void) | null = null;
    markStore: MarkStore = new MarkStore();
    harpoonStore: HarpoonStore = new HarpoonStore();
    private yankRingManager: YankRingManager = new YankRingManager();
    private yankRingCommandDoneCleanup: (() => void) | null = null;
    foldStore: FoldPersistenceStore = new FoldPersistenceStore();
    private markSaveDirty = false;
    private harpoonSaveDirty = false;
    private foldPersistDirty = false;
    private jumpListSaveDirty = false;
    private undoTreeSaveDirty = false;
    private undoTreeDirtyPaths: Set<string> = new Set();
    private undoTreeMap: Map<string, UndoTree> = new Map();
    private activeUndoFilePath: string | null = null;
    private previousLeafId: string | null = null;
    private previousFoldFile: string | null = null;
    exSuggest: ExCommandSuggest | null = null;
    private globalKeyHandler: GlobalKeyHandler | null = null;
    private textareaVimManager: TextareaVimManager | null = null;
    private globalRegistry: GlobalMappingRegistry | null = null;
    private globalWhichKeyOverlay: GlobalWhichKeyOverlay | null = null;
    private vimrcGlobalMaps: DeferredGlobalMap[] = [];
    private vimrcGlobalUnmaps: string[] = [];
    private vimrcGlobalWhichKeyLabels: Array<{
        key: string;
        label: string;
        icon?: string;
        color?: string;
    }> = [];
    private vimrcGlobalWhichKeyGroups: Array<{
        key: string;
        label: string;
        icon?: string;
        color?: string;
    }> = [];
    private luaGlobalMaps: import('./lua/api').LuaGlobalKeymap[] = [];
    private luaGlobalUnmaps: string[] = [];
    private luaGlobalWhichKeyLabels: Array<{
        key: string;
        label: string;
        icon?: string;
        color?: string;
    }> = [];
    private luaGlobalWhichKeyGroups: Array<{
        key: string;
        label: string;
        icon?: string;
        color?: string;
    }> = [];
    private hintWindowCleanups: Array<() => void> = [];
    private hintWindowDocs = new Set<Document>();
    private initializing = true;
    private vimrcLoading = false;
    private vimrcMaps: VimrcLoadResult['maps'] = [];
    vimrcOverrides: Map<string, string> = new Map();
    preVimrcSettings!: VimMotionsSettings;
    vimrcGroupLabels: GroupLabel[] = [];
    vimrcCommandLabels: CommandLabel[] = [];
    vimrcLoaded = false;
    vimrcRetried = false;
    vimrcCommandCount = 0;
    private pendingVimrcExCommands: string[] = [];
    private vimrcMapKeys: Set<string> = new Set();
    private vimrcWatchPath: string | null = null;
    private luaLoading = false;
    private luaMapOperations: LuaLoadResult['mapOperations'] = [];
    luaOverrides: Map<string, string> = new Map();
    luaGroupLabels: GroupLabel[] = [];
    luaCommandLabels: CommandLabel[] = [];
    luaLoaded = false;
    luaCommandCount = 0;
    private luaState: lua_State | null = null;
    private luaActionNames = new Set<string>();
    private luaPendingExCommands: string[] = [];
    private luaActionCounter = 0;
    private luaDeactivateRuntimeEx: (() => void) | null = null;
    private bufferKeymapManager: BufferKeymapManager | null = null;
    private autocmdManager: AutocmdManager | null = null;
    private openPicker:
        | ((
              source: string,
              opts?: { query?: string; resumeSelectedId?: string },
          ) => void)
        | null = null;
    private timerManager: import('./lua/timers').TimerManager | null = null;
    private highlightManager:
        | import('./lua/highlight').HighlightManager
        | null = null;
    private frecencyStore: FrecencyStore | null = null;
    private frecencySaveTimer: number | null = null;
    private matcher: ManagedMatcher | null = null;
    pickerAPI: PickerAPI | null = null;
    private oilKeybindingManager: OilKeybindingManager | null = null;
    private oilManager: OilManager | null = null;
    private snippetRegistry: SnippetRegistry | null = null;
    private luaSnippetDefs: import('./lua/snippet-api').LuaSnippetDef[] = [];
    private luaTextObjectSpecs: Array<{
        keys: string;
        spec: {
            open: string;
            close: string;
            multiline: boolean;
            inner: boolean;
        };
    }> = [];
    private imSwitcher: ImSwitcher | null = null;

    private getSnippetPreprocessContext(): PreprocessContext {
        const activeFile = this.app.workspace.getActiveFile();
        return {
            filePath: activeFile?.path ?? '',
            clipboard: '',
            selectedText: '',
        };
    }

    get vimrcEnabled(): boolean {
        return (
            this.settings.configMode === 'lua-vimrc' ||
            this.settings.configMode === 'vimrc'
        );
    }

    get luaConfigEnabled(): boolean {
        return (
            this.settings.configMode === 'lua-vimrc' ||
            this.settings.configMode === 'lua'
        );
    }

    executeLuaForTest(code: string): void {
        if (!this.luaState) {
            const vim = getVimApi();
            if (!vim) return;
            this.luaState = createSandboxedState();
            const autocmdManager = new AutocmdManager(this.luaState);
            const { globals } = injectVimApi(this.luaState, {
                onSettingOverride: () => {},
                handleExCommand: () => {},
                getVaultName: () => this.app.vault.getName(),
                showNotice: () => {},
                defineExCommand: (name, callback) => {
                    vim.defineEx(name, '', (_cm, params) => {
                        callback(params.argString?.trim() ?? '');
                    });
                },
                onKeymap: (map) => {
                    if (map.rhs) {
                        if (map.noremap) {
                            vim.noremap(map.lhs, map.rhs, map.mode);
                        } else {
                            vim.map(map.lhs, map.rhs, map.mode);
                        }
                    }
                },
                onKeymapDel: (map) => {
                    try {
                        vim.unmap(map.lhs, map.mode);
                    } catch {
                        /* intentional: skip missing map */
                    }
                },
                getLeaderKey: () => this.leaderRegistry?.getLeaderKey() ?? '\\',
                setLeaderKey: (key) => this.leaderRegistry?.setLeaderKey(key),
                autocmdManager,
            });
            injectVimFn(this.luaState, {
                getActiveFilePath: () =>
                    this.app.workspace.getActiveFile()?.path ?? null,
                fileExists: (path) =>
                    this.app.vault.getAbstractFileByPath(path) !== null,
                getVaultFiles: () => [],
                isDirectory: () => false,
                getMode: () => 'n',
                getCursorLine: () => 0,
                getCursorCol: () => 0,
                getLine: () => null,
                getLineCount: () => {
                    const view =
                        this.app.workspace.getActiveViewOfType(MarkdownView);
                    if (!view) return 0;
                    return view.editor.lineCount();
                },
                getLines: (start: number, end: number) => {
                    const view =
                        this.app.workspace.getActiveViewOfType(MarkdownView);
                    if (!view) return [];
                    const editor = view.editor;
                    const lineCount = editor.lineCount();
                    const actualEnd =
                        end === -1 ? lineCount : Math.min(end, lineCount);
                    const result: string[] = [];
                    for (let i = start; i < actualEnd; i++) {
                        result.push(editor.getLine(i));
                    }
                    return result;
                },
                setLines: (start: number, end: number, lines: string[]) => {
                    const view =
                        this.app.workspace.getActiveViewOfType(MarkdownView);
                    if (!view) return;
                    const editor = view.editor;
                    const lineCount = editor.lineCount();
                    const actualEnd =
                        end === -1 ? lineCount : Math.min(end, lineCount);
                    if (lineCount === 0 && actualEnd === 0) {
                        editor.replaceRange(lines.join('\n'), {
                            line: 0,
                            ch: 0,
                        });
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
                            : lines.join('\n') +
                              (actualEnd < lineCount ? '\n' : '');
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
                getUndoTree: this.settings.enableUndoTree
                    ? () => this.undoTree.toNeovimDict()
                    : undefined,
            });
            this.autocmdManager = autocmdManager;
        }
        evalLua(this.luaState, code);
    }

    private onLuaSettingOverrideRef:
        | ((key: string, value: unknown, directive?: string) => void)
        | null = null;
    private vimRef: import('./types/vim-api').VimApi | null = null;

    isAnyViewComposingForTest(): boolean {
        return isAnyViewComposing();
    }

    async loadLuaConfigForTest(): Promise<void> {
        if (!this.vimRef || !this.onLuaSettingOverrideRef) return;
        this.settings.configMode = 'lua-vimrc';
        this.luaLoaded = false;
        this.luaLoading = false;
        this.timerManager?.destroyAll();
        this.timerManager = null;
        this.autocmdManager?.clearUngrouped();
        this.autocmdManager?.clearAll();
        this.autocmdManager = null;
        this.highlightManager?.destroy();
        this.highlightManager = null;
        if (this.luaState) {
            destroyState(this.luaState);
            this.luaState = null;
        }
        this.luaActionNames.clear();
        this.luaActionCounter = 0;
        await this.loadLuaConfigInternal(
            this.vimRef,
            this.onLuaSettingOverrideRef,
        );
    }

    async onload() {
        await this.loadSettings();
        this.activeUndoFilePath =
            this.app.workspace.getActiveFile()?.path ?? null;
        if (this.settings.enableUndoTree) {
            this.activateUndoTreeForFile(this.activeUndoFilePath);
        }
        this.jumpList = new JumpList(() => {
            this.jumpListSaveDirty = true;
        });
        this.jumpList.deserialize(this.settings.persistedJumpList ?? []);
        setJumpListInstance(this.jumpList);
        this.markStore.load(this.settings.persistedMarks ?? []);
        this.harpoonStore.load(this.settings.harpoonPins ?? []);
        this.foldStore.load(
            (this.settings as unknown as Record<string, unknown>)
                .persistedFolds as
                | Record<
                      string,
                      { ranges: { from: number; to: number }[]; ts: number }
                  >
                | undefined,
        );

        if (this.settings.imEnabled && Platform.isDesktop) {
            const resolvedBinary = expandTilde(this.settings.imBinaryPath);
            this.imSwitcher = new ImSwitcher({
                enabled: true,
                autoWire: true,
                defaultNormalIm: this.settings.imDefaultNormalIm,
                restoreBehavior: this.settings.imRestoreBehavior,
                defaultInsertIm: this.settings.imDefaultInsertIm,
                obtainConfig: {
                    binary: resolvedBinary,
                    args: parseImArgs(this.settings.imObtainArgs),
                    timeoutMs: 5000,
                },
                switchConfig: {
                    binary: resolvedBinary,
                    args: parseImArgs(this.settings.imSwitchArgs),
                    timeoutMs: 5000,
                },
            });
            if (this.settings.persistedImState) {
                this.imSwitcher.loadPersistedState(
                    this.settings.persistedImState,
                );
            }
            this.imSwitcher.primeCache();
            setImModeCallbacks(
                (viewId) => this.imSwitcher?.onInsertEnter(viewId),
                (viewId) => this.imSwitcher?.onInsertLeave(viewId),
                (viewId) => this.imSwitcher?.cleanupView(viewId),
            );
        }

        // --- Mobile gate ---
        // Always register settings tab and toggle command so users can
        // enable/disable the plugin on mobile without a desktop round-trip.
        this.addSettingTab(new VimMotionsSettingTab(this.app, this));
        this.addCommand({
            id: 'toggle-enable-on-mobile',
            name: 'Toggle enable on mobile',
            callback: async () => {
                this.settings.enableOnMobile = !this.settings.enableOnMobile;
                await this.saveSettings();
                new Notice(
                    `Vim Motions on mobile: ${this.settings.enableOnMobile ? 'enabled' : 'disabled'}. Reload Obsidian to apply.`,
                );
            },
        });
        if (Platform.isMobile && !this.settings.enableOnMobile) {
            return;
        }

        const oilCache = new OilCache();
        this.oilManager = new OilManager(this.app, oilCache, this.settings);
        this.oilManager.install(this);
        this.oilKeybindingManager = new OilKeybindingManager(
            this.app,
            this.oilManager,
        );
        this.registerView(
            OilView.VIEW_TYPE,
            createOilViewFactory(this.oilManager, oilCache, this.settings),
        );
        this.registerView(
            UndoTreeView.VIEW_TYPE,
            createUndoTreeViewFactory(
                () => this.undoTree,
                (seq) => {
                    this.undoTree.navigateToSeq(seq);
                },
            ),
        );

        const builtinVimOn = isBuiltinVimEnabled(this.app);

        if (!builtinVimOn) {
            installVimBridge();
            this.registerEditorExtension(
                createBundledVimExtension(this.settings.cursorShapes),
            );
        }

        const vim = getVimApi();
        if (!vim) {
            new Notice('Vim Motions: could not initialise Vim layer.');
            return;
        }

        this.vimrcOverrides = new Map();
        this.luaOverrides = new Map();
        this.preVimrcSettings = { ...this.settings };
        this.vimrcGroupLabels = [];
        this.vimrcCommandLabels = [];
        this.luaGroupLabels = [];
        this.luaCommandLabels = [];
        const applySettingOverride = (
            key: string,
            value: unknown,
            directive: string | undefined,
            overrides: Map<string, string>,
            groupLabels: GroupLabel[],
            commandLabels: CommandLabel[],
        ) => {
            let applied = false;
            if (key === 'cursorShapes') {
                Object.assign(
                    this.settings.cursorShapes,
                    value as Partial<typeof this.settings.cursorShapes>,
                );
                overrides.set(key, directive ?? 'set guicursor');
                applied = true;
            } else if (key === 'updatetime') {
                if (typeof value === 'number') {
                    this.autocmdManager?.setUpdateTime(value);
                    overrides.set(key, directive ?? `set updatetime=${value}`);
                    applied = true;
                }
            } else if (
                key === 'number' ||
                key === 'relativenumber' ||
                key === 'numberwidth' ||
                key === 'linenumbermode'
            ) {
                (this.settings as unknown as Record<string, unknown>)[key] =
                    value;
                overrides.set(key, directive ?? `set ${key}`);
                applied = true;
                if (key === 'numberwidth' && typeof value === 'number') {
                    setNumberwidth(value);
                }
                if (
                    !this.initializing &&
                    !this.vimrcLoading &&
                    !this.luaLoading
                ) {
                    this.reconfigureLineNumberGutter();
                }
            } else if (key === 'cursorline' || key === 'cursorlineopt') {
                (this.settings as unknown as Record<string, unknown>)[key] =
                    value;
                overrides.set(key, directive ?? `set ${key}`);
                applied = true;
                if (
                    !this.initializing &&
                    !this.vimrcLoading &&
                    !this.luaLoading
                ) {
                    this.reconfigureCursorlineHighlight();
                }
            } else if (key === 'signcolumn') {
                (this.settings as unknown as Record<string, unknown>)[key] =
                    value;
                overrides.set(
                    key,
                    directive ?? `set signcolumn=${String(value)}`,
                );
                applied = true;
                if (
                    !this.initializing &&
                    !this.vimrcLoading &&
                    !this.luaLoading
                ) {
                    this.reconfigureSignColumnGutter();
                }
            } else if (key === 'statuscolumn') {
                (this.settings as unknown as Record<string, unknown>)[key] =
                    value;
                overrides.set(
                    key,
                    directive ?? `set statuscolumn=${String(value)}`,
                );
                applied = true;
                if (
                    !this.initializing &&
                    !this.vimrcLoading &&
                    !this.luaLoading
                ) {
                    this.reconfigureStatusColumnGutter();
                }
            } else if (key === 'foldcolumn') {
                (this.settings as unknown as Record<string, unknown>)[key] =
                    value;
                overrides.set(key, directive ?? `set ${key}`);
                applied = true;
                if (
                    !this.initializing &&
                    !this.vimrcLoading &&
                    !this.luaLoading
                ) {
                    this.reconfigureFoldColumnGutter();
                }
            } else if (key.startsWith('modePrompts.')) {
                const mode = key.replace(
                    'modePrompts.',
                    '',
                ) as keyof VimMotionsSettings['modePrompts'];
                if (typeof value === 'string') {
                    this.settings.modePrompts[mode] = value;
                    overrides.set(
                        key,
                        directive ?? `let g:mode_prompt_${mode} = ${value}`,
                    );
                    applied = true;
                }
            } else if (key === 'whichKeyGroupLabel') {
                const entry = value as GroupLabel;
                if (entry?.key && entry.label) {
                    groupLabels.push(entry);
                    overrides.set(
                        `whichKeyGroupLabel:${entry.key}`,
                        directive ??
                            `whichkeygroup ${entry.key} ${entry.label}`,
                    );
                    applied = true;
                }
            } else if (key === 'whichKeyCommandLabel') {
                const entry = value as CommandLabel;
                if (entry?.key && entry.label) {
                    commandLabels.push(entry);
                    overrides.set(
                        `whichKeyCommandLabel:${entry.key}`,
                        directive ??
                            `whichkeylabel ${entry.key} ${entry.label}`,
                    );
                    applied = true;
                }
            } else if (key in this.settings) {
                (this.settings as unknown as Record<string, unknown>)[key] =
                    value;
                overrides.set(key, directive ?? `set ${key}`);
                applied = true;
            }

            if (
                applied &&
                !this.initializing &&
                !this.vimrcLoading &&
                !this.luaLoading
            ) {
                this.reloadFeatures();
            }
        };

        const onSettingOverride = (
            key: string,
            value: unknown,
            directive?: string,
        ) => {
            applySettingOverride(
                key,
                value,
                directive,
                this.vimrcOverrides,
                this.vimrcGroupLabels,
                this.vimrcCommandLabels,
            );
        };

        const onLuaSettingOverride = (
            key: string,
            value: unknown,
            directive?: string,
        ) => {
            applySettingOverride(
                key,
                value,
                directive,
                this.luaOverrides,
                this.luaGroupLabels,
                this.luaCommandLabels,
            );
        };

        this.vimRef = vim;
        this.onLuaSettingOverrideRef = onLuaSettingOverride;

        // --- Vim API setup ---
        // resetKeymap() is a fork-only method; guard against the built-in
        // Vim API which does not expose it.
        if (typeof vim.resetKeymap === 'function') {
            vim.resetKeymap();
        }
        registerVimOptions(vim, onSettingOverride);
        for (const [key, savedValue] of Object.entries({
            clipboard: this.settings.clipboard,
            textwidth:
                this.settings.textwidth !== 80
                    ? this.settings.textwidth
                    : undefined,
        })) {
            if (savedValue === undefined || savedValue === '') continue;
            const spec = KNOWN_SET_OPTIONS[key];
            if (spec?.type === 'sideEffect') {
                spec.apply(
                    savedValue,
                    (sKey, sValue, sDirective) => {
                        onSettingOverride(sKey, sValue, sDirective);
                        try {
                            vim.setOption(key, sValue);
                        } catch {
                            return;
                        }
                    },
                    `setting ${key}`,
                );
            }
        }
        this.registration = new VimRegistration(vim);

        this.matcher?.dispose();
        this.matcher = createMatcher(this.settings.pickerMatcherEngine);
        const matcher = this.matcher;
        const buildRipgrepConfig = () =>
            this.settings.ripgrepEnabled
                ? {
                      binary: this.settings.ripgrepBinaryPath,
                      args: this.settings.ripgrepArgs
                          .trim()
                          .split(/\s+/)
                          .filter(Boolean),
                      timeoutMs: 10_000,
                      mode: this.settings.grepMode,
                  }
                : undefined;
        pickerRegistry.register(createFilesSource(), true);
        pickerRegistry.register(createBuffersSource(), true);
        pickerRegistry.register(createCommandsSource(), true);
        pickerRegistry.register(createHeadingsSource(), true);
        pickerRegistry.register(createOutlineSource(), true);
        pickerRegistry.register(createBacklinksSource(), true);
        pickerRegistry.register(
            createTagsSource(matcher, () => this.settings.pickerKeymap),
            true,
        );
        pickerRegistry.register(createRecentSource(), true);
        pickerRegistry.register(
            createMarksSource([
                new VimBufferMarkProvider(),
                new SpecialMarkProvider(),
                new GlobalMarkProvider(this.markStore),
            ]),
            true,
        );
        if (this.settings.enableHarpoon) {
            pickerRegistry.register(
                createHarpoonSource(this.harpoonStore),
                true,
            );
        }
        pickerRegistry.register(createRegistersSource(vim), true);
        pickerRegistry.register(
            createLiveGrepSource(buildRipgrepConfig()),
            true,
        );
        const frecencyStore = new FrecencyStore();
        if (this.settings.frecencyData) {
            try {
                frecencyStore.deserialize(this.settings.frecencyData);
            } catch {
                frecencyStore.clear();
            }
        }
        this.frecencyStore = frecencyStore;
        const scheduleFrecencySave = () => {
            if (this.frecencySaveTimer) {
                window.clearTimeout(this.frecencySaveTimer);
            }
            this.frecencySaveTimer = window.setTimeout(() => {
                this.frecencySaveTimer = null;
                this.settings.frecencyData = frecencyStore.serialize();
                void this.saveSettings();
            }, 30000);
        };
        this.openPicker = (source, opts) => {
            const km = this.settings.pickerKeymap;
            if (source === 'resume') {
                const lastSession = getLastSession();
                if (!lastSession) {
                    new Notice('No previous picker to resume');
                    return;
                }
                if (lastSession.source === 'grep') {
                    const query = lastSession.query.trim();
                    if (!query) {
                        new Notice('No previous picker to resume');
                        return;
                    }
                    const grepSource = createGrepSource(
                        query,
                        buildRipgrepConfig(),
                    );
                    PickerModal.open(
                        this.app,
                        grepSource,
                        matcher,
                        {
                            source: lastSession.source,
                            query,
                            resumeSelectedId: lastSession.selectedId,
                            onFrecencyUpdate: scheduleFrecencySave,
                        },
                        frecencyStore,
                        km,
                    );
                    return;
                }
                const pickerSource = pickerRegistry.get(lastSession.source);
                if (!pickerSource) {
                    new Notice(
                        `Picker source not found: ${lastSession.source}`,
                    );
                    return;
                }
                PickerModal.open(
                    this.app,
                    pickerSource,
                    matcher,
                    {
                        source: lastSession.source,
                        query: lastSession.query,
                        resumeSelectedId: lastSession.selectedId,
                        onFrecencyUpdate: scheduleFrecencySave,
                    },
                    frecencyStore,
                    km,
                );
                return;
            }
            if (source === 'grep') {
                const query = opts?.query?.trim();
                if (!query) {
                    const liveSource = pickerRegistry.get('livegrep');
                    if (liveSource) {
                        PickerModal.open(
                            this.app,
                            liveSource,
                            matcher,
                            {
                                source: 'livegrep',
                                onFrecencyUpdate: scheduleFrecencySave,
                            },
                            frecencyStore,
                            km,
                        );
                    }
                    return;
                }
                const grepSource = createGrepSource(
                    query,
                    buildRipgrepConfig(),
                );
                PickerModal.open(
                    this.app,
                    grepSource,
                    matcher,
                    {
                        source,
                        query,
                        onFrecencyUpdate: scheduleFrecencySave,
                    },
                    frecencyStore,
                    km,
                );
                return;
            }
            const pickerSource = pickerRegistry.get(source);
            if (!pickerSource) {
                new Notice(`Picker source not found: ${source}`);
                return;
            }
            PickerModal.open(
                this.app,
                pickerSource,
                matcher,
                {
                    source,
                    query: opts?.query,
                    resumeSelectedId: opts?.resumeSelectedId,
                    onFrecencyUpdate: scheduleFrecencySave,
                },
                frecencyStore,
                km,
            );
        };

        pickerRegistry.register(
            createPickersSource(
                () => this.leaderRegistry?.getBindings() ?? [],
                () => this.leaderRegistry?.getLeaderKey() ?? '\\',
                (s) => this.openPicker?.(s),
            ),
            true,
        );

        this.pickerAPI = installPickerAPI();
        (this as unknown as Record<string, unknown>).api = this.pickerAPI;
        this.register(() => {
            uninstallPickerAPI();
            this.pickerAPI = null;
        });
        this.app.workspace.trigger('vim-motions:picker-ready');

        this.app.workspace.onLayoutReady(() => {
            this.registerBundledIntegrations();
            // Trigger vimrc/lua loading early when layout is ready,
            // rather than waiting for the first active-leaf-change event.
            // This fires the same active-leaf-change handler below.
            if (this.vimrcEnabled && !this.vimrcLoaded && !this.vimrcLoading) {
                const leaf = this.app.workspace.getMostRecentLeaf();
                if (leaf) {
                    this.app.workspace.trigger('active-leaf-change', leaf);
                }
            }
        });

        this.registerEvent(
            this.app.workspace.on('active-leaf-change', (leaf) => {
                const view =
                    this.app.workspace.getActiveViewOfType(MarkdownView);
                const adapter = view ? getCmAdapter(view) : null;
                const leafInfo = leaf
                    ? {
                          type:
                              (
                                  leaf.view as unknown as {
                                      getViewType?: () => string;
                                  }
                              ).getViewType?.() ?? 'empty',
                          id: getLeafId(leaf),
                          filePath:
                              this.app.workspace.getActiveFile()?.path ?? null,
                      }
                    : undefined;
                this.autocmdManager?.onActiveLeafChange(adapter, leafInfo);
                const activeFile = this.app.workspace.getActiveFile();
                const filePath = activeFile?.path ?? null;
                if (activeFile?.extension === 'md') {
                    trackRecentFile(activeFile.path);
                }
                this.bufferKeymapManager?.switchBuffer(filePath);
                this.oilKeybindingManager?.onActiveLeafChange();
                this.yankRingManager.cancel();
                this.yankRingCommandDoneCleanup?.();
                this.yankRingCommandDoneCleanup = null;
                if (adapter && this.settings.enableYankRing) {
                    this.yankRingManager.setAdapter(adapter);
                    const keypressHandler = (key: string) =>
                        this.yankRingManager.onKeypress(key);
                    const commandDoneHandler = () =>
                        this.yankRingManager.onCommandDone();
                    adapter.on('vim-keypress', keypressHandler);
                    adapter.on('vim-command-done', commandDoneHandler);
                    this.yankRingCommandDoneCleanup = () => {
                        adapter.off(
                            'vim-keypress',
                            keypressHandler as (...args: unknown[]) => void,
                        );
                        adapter.off('vim-command-done', commandDoneHandler);
                    };
                }
                if (filePath) {
                    this.autocmdManager?.fireFileType(filePath);
                }
            }),
        );

        this.registerEvent(
            this.app.workspace.on('file-open', (file) => {
                if (!this.settings.enableUndoTree) return;
                const filePath = file?.path ?? null;
                this.activateUndoTreeForFile(filePath);
                this.activeUndoFilePath = filePath;
            }),
        );

        this.registerEvent(
            this.app.workspace.on('active-leaf-change', () => {
                if (!this.settings.enableUndoTree) return;
                const activePath =
                    this.app.workspace.getActiveFile()?.path ?? null;
                if (
                    this.activeUndoFilePath &&
                    this.activeUndoFilePath !== activePath
                ) {
                    this.persistUndoTreeForFile(this.activeUndoFilePath);
                }
                this.activeUndoFilePath = activePath;
                this.activateUndoTreeForFile(activePath);
            }),
        );

        if (this.imSwitcher) {
            this.registerEvent(
                this.app.workspace.on('active-leaf-change', (leaf) => {
                    const leafId = leaf ? getLeafId(leaf) : '';
                    this.imSwitcher?.onLeafChange(leafId);
                }),
            );
        }

        this.registerEvent(
            this.app.workspace.on('active-leaf-change', (newLeaf) => {
                if (!this.settings.enableHarpoon) return;
                if (this.previousLeafId) {
                    this.app.workspace.iterateAllLeaves((leaf) => {
                        const leafId = getLeafId(leaf);
                        if (
                            leafId === this.previousLeafId &&
                            leaf.view instanceof MarkdownView &&
                            leaf.view.file
                        ) {
                            const view = leaf.view;
                            const filePath = view.file!.path;
                            if (this.harpoonStore.getByPath(filePath)) {
                                const cursor = view.editor.getCursor();
                                this.harpoonStore.updateCursor(
                                    filePath,
                                    cursor.line,
                                    cursor.ch,
                                );
                                this.harpoonSaveDirty = true;
                            }
                        }
                    });
                }
                this.previousLeafId = newLeaf
                    ? ((newLeaf as unknown as { id?: string }).id ?? null)
                    : null;
            }),
        );

        this.registerEvent(
            this.app.workspace.on('active-leaf-change', () => {
                this.attachYankHighlight();
                this.attachMarkGutter();
            }),
        );
        this.attachYankHighlight();
        this.attachMarkGutter();

        this.registerEvent(
            this.app.workspace.on('active-leaf-change', (newLeaf) => {
                if (!this.settings.foldPersistence) return;
                if (this.previousFoldFile) {
                    const mdView =
                        this.app.workspace.getActiveViewOfType(MarkdownView);
                    if (mdView?.file?.path === this.previousFoldFile) {
                        const ev = getEditorView(mdView);
                        if (ev) {
                            this.foldStore.capture(this.previousFoldFile, ev);
                            this.foldPersistDirty = true;
                        }
                    }
                }
                if (
                    newLeaf?.view instanceof MarkdownView &&
                    newLeaf.view.file
                ) {
                    const filePath = newLeaf.view.file.path;
                    this.previousFoldFile = filePath;
                    const ev = getEditorView(newLeaf.view);
                    if (ev) {
                        window.setTimeout(() => {
                            this.foldStore.restore(filePath, ev);
                        }, 100);
                    }
                } else {
                    this.previousFoldFile = null;
                }
            }),
        );

        this.registerEvent(
            this.app.vault.on('rename', (file, oldPath) => {
                this.harpoonStore.renamePath(oldPath, file.path);
                this.harpoonSaveDirty = true;
                this.foldStore.renamePath(oldPath, file.path);
                this.foldPersistDirty = true;
                this.markStore.renamePath(oldPath, file.path);
                this.markSaveDirty = true;
                this.jumpList.handleRename(oldPath, file.path);
                this.jumpListSaveDirty = true;
                const undoTree = this.undoTreeMap.get(oldPath);
                if (undoTree) {
                    this.undoTreeMap.delete(oldPath);
                    this.undoTreeMap.set(file.path, undoTree);
                }
                if (this.undoTreeDirtyPaths.has(oldPath)) {
                    this.undoTreeDirtyPaths.delete(oldPath);
                    this.undoTreeDirtyPaths.add(file.path);
                }
                if (this.activeUndoFilePath === oldPath) {
                    this.activeUndoFilePath = file.path;
                }
                if (this.settings.undoFile) {
                    const persisted = this.settings.persistedUndoTrees;
                    const data = persisted[oldPath];
                    if (data !== undefined) {
                        const next = { ...persisted };
                        delete next[oldPath];
                        next[file.path] = data;
                        this.settings.persistedUndoTrees =
                            this.capPersistedUndoTrees(next);
                        this.undoTreeSaveDirty = true;
                    }
                }
            }),
        );
        this.registerEvent(
            this.app.vault.on('delete', (file) => {
                this.harpoonStore.removeByPath(file.path);
                this.harpoonSaveDirty = true;
                this.foldStore.removePath(file.path);
                this.foldPersistDirty = true;
                this.markStore.removeByPath(file.path);
                this.markSaveDirty = true;
                this.jumpList.handleDelete(file.path);
                this.jumpListSaveDirty = true;
                this.undoTreeMap.delete(file.path);
                this.undoTreeDirtyPaths.delete(file.path);
                if (this.settings.undoFile) {
                    const persisted = this.settings.persistedUndoTrees;
                    if (persisted[file.path]) {
                        const next = { ...persisted };
                        delete next[file.path];
                        this.settings.persistedUndoTrees = next;
                        this.undoTreeSaveDirty = true;
                    }
                }
            }),
        );

        // --- Leader key resolution ---
        this.leaderRegistry = new LeaderRegistry();
        if (this.vimrcEnabled) {
            this.registerEvent(
                this.app.workspace.on('active-leaf-change', async () => {
                    this.resetVimInputStateOnPaneSwitch(vim);

                    if (this.vimrcLoaded) {
                        applyVimrcMaps(vim, this.vimrcMaps);
                        this.applyLuaPendingExCommands(vim);
                        if (this.pendingVimrcExCommands.length > 0) {
                            const view =
                                this.app.workspace.getActiveViewOfType(
                                    MarkdownView,
                                );
                            const cm = view ? getCmAdapter(view) : null;
                            if (cm) {
                                applyPendingExCommands(
                                    vim,
                                    cm,
                                    this.pendingVimrcExCommands,
                                );
                                this.pendingVimrcExCommands = [];
                            }
                        }
                        return;
                    }
                    if (this.vimrcLoading) return;
                    this.vimrcLoading = true;
                    try {
                        const customVimrcPath =
                            this.settings.vimrcPath || undefined;
                        const vimrcResult = await loadVimrc(
                            this.app,
                            vim,
                            this.leaderRegistry ?? undefined,
                            onSettingOverride,
                            customVimrcPath,
                        );
                        this.vimrcCommandCount = vimrcResult.commandCount;
                        this.pendingVimrcExCommands =
                            vimrcResult.pendingExCommands ?? [];
                        const vimrcFound = vimrcResult.found;
                        if (
                            !vimrcFound &&
                            this.settings.configMode === 'vimrc'
                        ) {
                            // Error-like: user chose vimrc-only but file is missing — always show.
                            new Notice(
                                `Vim Motions: vimrc not found (searched ${vimrcResult.path}).`,
                            );
                        } else if (
                            vimrcFound &&
                            this.settings.showConfigNotifications
                        ) {
                            if (vimrcResult.commandCount === 0) {
                                new Notice(
                                    `Vim Motions: ${vimrcResult.path} loaded but contained no commands.`,
                                );
                            } else {
                                new Notice(
                                    `Vim Motions: loaded ${vimrcResult.commandCount} command${vimrcResult.commandCount === 1 ? '' : 's'} from ${vimrcResult.path}.`,
                                );
                            }
                        }
                        this.vimrcMaps = vimrcResult.maps;
                        this.vimrcMapKeys = new Set(
                            vimrcResult.maps.map((m) => m.lhs),
                        );
                        this.vimrcWatchPath = vimrcFound
                            ? vimrcResult.path
                            : null;
                        this.vimrcGlobalMaps = vimrcResult.globalMaps;
                        this.vimrcGlobalUnmaps = vimrcResult.globalUnmaps;
                        this.vimrcGlobalWhichKeyLabels =
                            vimrcResult.globalWhichKeyLabels;
                        this.vimrcGlobalWhichKeyGroups =
                            vimrcResult.globalWhichKeyGroups;
                        applyVimrcMaps(vim, this.vimrcMaps);
                        this.applyGlobalMaps();
                        if (this.registration && this.leaderRegistry) {
                            this.registration.unmapDefaultBinding(
                                this.leaderRegistry.getLeaderKey(),
                            );
                        }
                        this.reregisterLeaderFeatures();
                        this.rebuildWhichKey();
                        this.vimrcLoaded = true;
                        this.reloadFeatures();
                        const luaResult = await this.loadLuaConfigInternal(
                            vim,
                            onLuaSettingOverride,
                        );
                        if (
                            this.settings.configMode === 'lua-vimrc' &&
                            !vimrcFound &&
                            !luaResult?.found &&
                            this.settings.showConfigNotifications
                        ) {
                            new Notice(
                                `Vim Motions: no config files found (searched ${vimrcResult.path}, ${luaResult?.path ?? 'init.lua'}).`,
                            );
                        }
                    } catch (e) {
                        console.warn(
                            'Vim Motions: vimrc loading failed, will retry on next leaf change',
                            e,
                        );
                    } finally {
                        this.vimrcLoading = false;
                    }
                }),
            );

            this.registerEvent(
                this.app.vault.on('modify', async (file) => {
                    if (
                        !this.vimrcLoaded ||
                        !this.vimrcWatchPath ||
                        file.path !== this.vimrcWatchPath
                    )
                        return;
                    await this.softReloadVimrc(vim, onSettingOverride);
                }),
            );
        }

        if (!this.vimrcEnabled) {
            this.registerEvent(
                this.app.workspace.on('active-leaf-change', async () => {
                    if (this.luaLoaded) {
                        this.applyLuaMaps(vim);
                        this.applyLuaPendingExCommands(vim);
                        return;
                    }
                    await this.loadLuaConfigInternal(vim, onLuaSettingOverride);
                }),
            );
        }

        // --- Core ex command (needed by leader bindings) ---
        registerObCommand(this.registration, this.app, {
            openPicker: this.openPicker ?? undefined,
            isPickerEnabled: () => this.settings.picker,
        });

        // --- Action overrides (unconditional, setting checked at runtime) ---
        this.registration.defineActionOverride(
            'newLineAndEnterInsertMode',
            (original) =>
                createSmartOpenLineAction(
                    original,
                    () => this.settings.listContinuationOnOpen,
                ),
        );

        this.registration.defineActionOverride('jumpListWalk', (original) =>
            createJumpListWalkOverride(original, this.app, this.jumpList),
        );

        // --- Feature registrations ---
        if (this.settings.enableTextObjects) {
            registerTextObjects(
                this.registration,
                this.settings.multilineScanLimit,
            );
        }
        if (this.settings.enableNavigation) {
            registerNavigationMotions(this.registration);
            registerBufferNavigation(this.registration, this.app);
        }
        if (this.settings.enableTableNav) {
            registerTableMotions(this.registration);
            this.registration.beginLeaderScope();
            registerTableActions(
                this.registration,
                this.app,
                this.leaderRegistry ?? undefined,
            );
            this.registration.endLeaderScope();
        }
        if (this.settings.enableHardWrap) {
            registerOperators(this.registration);
        }
        if (this.settings.enableReplaceWithRegister) {
            registerReplaceWithRegister(this.registration);
        }
        if (this.settings.enableDial) {
            registerDial(this.registration);
        }
        if (this.settings.enableSubwordMotions) {
            registerSubwordMotions(this.registration);
        }
        if (this.settings.enableWorkspaceNav) {
            registerWorkspaceNavigation(
                this.registration,
                this.app,
                this.leaderRegistry,
                this.settings.enableReplaceWithRegister,
            );
            registerExCommands(
                this.registration,
                this.app,
                vim,
                this.globalRegistry ?? undefined,
                this.autocmdManager ?? undefined,
                this.settings.oilExplorer
                    ? (this.oilManager ?? undefined)
                    : undefined,
                {
                    openPicker: this.openPicker ?? undefined,
                    isPickerEnabled: () => this.settings.picker,
                },
                this.triggerMarkGutterRefresh,
                this.jumpList,
                this.settings.enableUndoTree ? this.undoTree : undefined,
                this.settings.enableUndoTree
                    ? this.navigateUndoTreeTo.bind(this)
                    : undefined,
            );
        }
        this.registerHarpoonExCommands();
        this.registerImExCommands();

        if (this.settings.enableSnippets) {
            if (this.registration) {
                registerSnippetCommands(
                    this.registration,
                    this.app,
                    () => this.snippetRegistry,
                    () => this.getSnippetPreprocessContext(),
                    () => this.openPicker ?? undefined,
                );
            }
            if (this.settings.picker) {
                pickerRegistry.register(
                    createSnippetsPickerSource(
                        () => this.snippetRegistry,
                        () => this.getSnippetPreprocessContext(),
                    ),
                    true,
                );
            }
            this.snippetRegistry = loadSnippetsSync(
                { snippetBundled: this.settings.snippetBundled },
                this.luaSnippetDefs,
                this.luaState ?? undefined,
            );
            if (this.settings.snippetDirectory) {
                void loadSnippets(
                    this.app,
                    {
                        snippetBundled: this.settings.snippetBundled,
                        snippetDirectory: this.settings.snippetDirectory,
                    },
                    this.luaSnippetDefs,
                    this.luaState ?? undefined,
                )
                    .then(({ registry, errors }) => {
                        this.snippetRegistry = registry;
                        if (errors.length > 0) {
                            new Notice(
                                `Snippet errors:\n${errors.map((e) => `${e.file}: ${e.error}`).join('\n')}`,
                            );
                        }
                    })
                    .catch((err: unknown) => {
                        console.error(
                            'Vim Motions: snippet loading failed:',
                            err,
                        );
                    });
            }
        } else {
            this.snippetRegistry = null;
        }

        this.addCommand({
            id: 'picker-files',
            name: 'Picker: Find files',
            callback: () => this.openPicker?.('files'),
        });
        this.addCommand({
            id: 'picker-buffers',
            name: 'Picker: Switch buffer',
            callback: () => this.openPicker?.('buffers'),
        });
        this.addCommand({
            id: 'picker-actions',
            name: 'Picker: Run action',
            callback: () => this.openPicker?.('commands'),
        });
        this.addCommand({
            id: 'picker-headings',
            name: 'Picker: Search headings',
            callback: () => this.openPicker?.('headings'),
        });
        this.addCommand({
            id: 'picker-outline',
            name: 'Picker: Document outline',
            callback: () => this.openPicker?.('outline'),
        });
        this.addCommand({
            id: 'picker-backlinks',
            name: 'Picker: Backlinks',
            callback: () => this.openPicker?.('backlinks'),
        });
        this.addCommand({
            id: 'picker-tags',
            name: 'Picker: Search tags',
            callback: () => this.openPicker?.('tags'),
        });
        this.addCommand({
            id: 'picker-recent',
            name: 'Picker: Recent files',
            callback: () => this.openPicker?.('recent'),
        });
        this.addCommand({
            id: 'picker-marks',
            name: 'Picker: Jump to mark',
            callback: () => this.openPicker?.('marks'),
        });
        this.addCommand({
            id: 'picker-registers',
            name: 'Picker: Registers',
            callback: () => this.openPicker?.('registers'),
        });
        this.addCommand({
            id: 'picker-resume',
            name: 'Picker: Resume last picker',
            callback: () => this.openPicker?.('resume'),
        });
        this.addCommand({
            id: 'picker-livegrep',
            name: 'Picker: Live grep',
            callback: () => this.openPicker?.('livegrep'),
        });
        this.addCommand({
            id: 'picker-pickers',
            name: 'Picker: All pickers',
            callback: () => this.openPicker?.('pickers'),
        });
        if (this.settings.enableHarpoon) {
            this.addCommand({
                id: 'harpoon-add',
                name: 'Harpoon: Pin current file',
                callback: () => {
                    const file = this.app.workspace.getActiveFile();
                    if (!file) {
                        new Notice('No file to pin');
                        return;
                    }
                    const view =
                        this.app.workspace.getActiveViewOfType(MarkdownView);
                    const cursor = view?.editor.getCursor();
                    const idx = this.harpoonStore.add(
                        file.path,
                        cursor?.line ?? 0,
                        cursor?.ch ?? 0,
                    );
                    const existing = this.harpoonStore.getByPath(file.path);
                    if (existing && existing.index === idx) {
                        new Notice(`Pinned to slot ${idx + 1}`);
                    }
                    this.harpoonSaveDirty = true;
                },
            });
            this.addCommand({
                id: 'harpoon-toggle',
                name: 'Harpoon: Toggle pin',
                callback: () => {
                    const file = this.app.workspace.getActiveFile();
                    if (!file) {
                        new Notice('No file to pin');
                        return;
                    }
                    const view =
                        this.app.workspace.getActiveViewOfType(MarkdownView);
                    const cursor = view?.editor.getCursor();
                    const added = this.harpoonStore.toggle(
                        file.path,
                        cursor?.line ?? 0,
                        cursor?.ch ?? 0,
                    );
                    new Notice(
                        added
                            ? `Pinned to slot ${this.harpoonStore.getByPath(file.path)!.index + 1}`
                            : 'Unpinned',
                    );
                    this.harpoonSaveDirty = true;
                },
            });
            this.addCommand({
                id: 'harpoon-remove',
                name: 'Harpoon: Remove current file',
                callback: () => {
                    const file = this.app.workspace.getActiveFile();
                    if (!file) return;
                    this.harpoonStore.removeByPath(file.path);
                    new Notice('Unpinned');
                    this.harpoonSaveDirty = true;
                },
            });
            this.addCommand({
                id: 'harpoon-picker',
                name: 'Harpoon: Open pin list',
                callback: () => this.openPicker?.('harpoon'),
            });
            for (let i = 1; i <= 9; i++) {
                this.addCommand({
                    id: `harpoon-select-${i}`,
                    name: `Harpoon: Go to pin ${i}`,
                    callback: () => {
                        const item = this.harpoonStore.get(i - 1);
                        if (item) void navigateToHarpoonPin(this.app, item);
                    },
                });
            }
            this.addCommand({
                id: 'harpoon-next',
                name: 'Harpoon: Next pin',
                callback: () => {
                    const item = this.harpoonStore.selectNext();
                    if (item) void navigateToHarpoonPin(this.app, item);
                },
            });
            this.addCommand({
                id: 'harpoon-prev',
                name: 'Harpoon: Previous pin',
                callback: () => {
                    const item = this.harpoonStore.selectPrev();
                    if (item) void navigateToHarpoonPin(this.app, item);
                },
            });
        }
        if (!Platform.isMobile && vim) {
            registerFlash(this.registration, this.app, this.settings, vim);
            this.flashSearchCleanup?.();
            this.flashSearchCleanup = enableFlashSearch(
                this.app,
                this.settings,
            );
        }
        this.registration.beginLeaderScope();
        if (this.settings.enableEasyMotion && !Platform.isMobile) {
            registerEasyMotion(
                this.registration,
                this.app,
                this.settings.easyMotionLabels,
                this.leaderRegistry,
                () => this.settings.easyMotionDimming,
                () => this.settings.labelFontSize,
                () => this.settings.labelMatchFontSize,
            );
        }
        if (this.settings.enableHintMode && !Platform.isMobile) {
            this.registerHintActions(this.registration, this.leaderRegistry);
            this.addCommand({
                id: 'show-hint-labels',
                name: 'Show hint labels',
                callback: () => this.hintActions?.activate(),
            });
            this.addCommand({
                id: 'hint-open-new-pane',
                name: 'Hint: open in new pane',
                callback: () => this.hintActions?.openNew(),
            });
            this.addCommand({
                id: 'hint-yank',
                name: 'Hint: yank link or text',
                callback: () => this.hintActions?.yank(),
            });
            this.addCommand({
                id: 'hint-close',
                name: 'Hint: close tab or pane',
                callback: () => this.hintActions?.close(),
            });
            this.setupHintModeWindows();
        }
        this.registration.endLeaderScope();

        this.registration.beginLeaderScope();
        if (this.settings.pickerLeaderMappings && this.leaderRegistry) {
            this.registerPickerLeaderMappings();
        }
        this.registerHarpoonLeaderMappings();
        this.registration.endLeaderScope();

        // --- Neovim default remaps (always on, use map so user vimrc noremap can override) ---
        this.registration.map('Y', 'y$', 'normal');
        this.registration.map('Q', '@@', 'normal');

        // --- Changelist (g; / g,) ---
        this.registration.defineMotion(
            'changeListOlder',
            createOlderChangeMotion(this.changeList),
        );
        this.registration.mapCommand('g;', 'motion', 'changeListOlder', {});
        this.registration.defineMotion(
            'changeListNewer',
            createNewerChangeMotion(this.changeList),
        );
        this.registration.mapCommand('g,', 'motion', 'changeListNewer', {});

        // --- Undo tree (g+ / g-) ---
        if (this.settings.enableUndoTree) {
            const undoTreeRef = this.undoTree;
            this.registration.defineAction('undoTreeOlder', () => {
                const beforeSeq = undoTreeRef.getCurrentSeq();
                const node = undoTreeRef.navigateOlder();
                if (!node) return;
                this.navigateUndoTreeTo(beforeSeq, node.seq);
            });
            this.registration.mapCommand('g-', 'action', 'undoTreeOlder', {});

            this.registration.defineAction('undoTreeNewer', () => {
                const beforeSeq = undoTreeRef.getCurrentSeq();
                const node = undoTreeRef.navigateNewer();
                if (!node) return;
                this.navigateUndoTreeTo(beforeSeq, node.seq);
            });
            this.registration.mapCommand('g+', 'action', 'undoTreeNewer', {});

            this.addCommand({
                id: 'undo-tree-toggle',
                name: 'Toggle undo tree sidebar',
                callback: () => this.toggleUndoTreeView(),
            });

            this.addCommand({
                id: 'undo-tree-show',
                name: 'Show undo tree sidebar',
                callback: async () => {
                    const leaves =
                        this.app.workspace.getLeavesOfType(UNDO_TREE_VIEW_TYPE);
                    if (leaves.length > 0) return;
                    const leaf =
                        this.settings.undoTreePosition === 'left'
                            ? this.app.workspace.getLeftLeaf(false)
                            : this.app.workspace.getRightLeaf(false);
                    if (leaf) {
                        await leaf.setViewState({
                            type: UNDO_TREE_VIEW_TYPE,
                            active: true,
                        });
                        await this.app.workspace.revealLeaf(leaf);
                    }
                },
            });

            this.addCommand({
                id: 'undo-tree-hide',
                name: 'Hide undo tree sidebar',
                callback: () => {
                    for (const leaf of this.app.workspace.getLeavesOfType(
                        UNDO_TREE_VIEW_TYPE,
                    )) {
                        leaf.detach();
                    }
                },
            });
        }

        const changeList = this.changeList;
        this.registerEditorExtension(
            EditorView.updateListener.of((update) => {
                if (!update.docChanged) return;
                const pos = update.state.selection.main.head;
                const doc = update.state.doc;
                const line = doc.lineAt(pos);
                changeList.recordChange(line.number - 1, pos - line.from);
            }),
        );

        if (this.settings.enableUndoTree) {
            const refreshViews = () => this.refreshUndoTreeViews();
            this.registerEditorExtension(
                EditorView.updateListener.of((update) => {
                    if (!update.docChanged) return;

                    const undoTree = this.undoTree;
                    if (undoTree.isNavigating()) return;

                    for (const tr of update.transactions) {
                        const isUndo = tr.isUserEvent('undo');
                        const isRedo = tr.isUserEvent('redo');

                        if (isUndo) {
                            undoTree.undo();
                            this.markUndoTreeDirty();
                            refreshViews();
                            return;
                        }
                        if (isRedo) {
                            undoTree.redo();
                            this.markUndoTreeDirty();
                            refreshViews();
                            return;
                        }
                    }

                    let changes = ChangeSet.empty(update.startState.doc.length);
                    for (const tr of update.transactions) {
                        if (tr.docChanged) {
                            changes = changes.compose(tr.changes);
                        }
                    }
                    const inverse = changes.invert(update.startState.doc);

                    let inserted = 0;
                    let deleted = 0;
                    changes.iterChanges((_fromA, _toA, _fromB, _toB, ins) => {
                        inserted += ins.length;
                    });
                    changes.iterChanges((fromA, toA) => {
                        deleted += toA - fromA;
                    });

                    undoTree.recordEdit(
                        { inserted, deleted },
                        changes,
                        inverse,
                    );
                    this.markUndoTreeDirty();
                    refreshViews();
                }),
            );
        }

        // --- :changes command (needs ChangeList instance) ---
        const cl = this.changeList;
        this.registration.defineEx('changes', 'cha', () => {
            const entries = cl.getEntries();
            const idx = cl.getIndex();
            const rows = entries.map((pos, i) => [
                i === idx ? '>' : ' ',
                String(i),
                String(pos.line + 1),
                String(pos.ch),
            ]);
            new VimInfoModal(
                this.app,
                'Changes',
                [
                    { header: '' },
                    { header: '#' },
                    { header: 'Line' },
                    { header: 'Col' },
                ],
                rows,
            ).open();
        });

        // --- Status bar and scrolloff ---
        if (this.settings.enableStatusBar) {
            this.modeTracker = new VimModeTracker(this, {
                chordDisplay: this.settings.enableChordDisplay,
                powerline: this.settings.enablePowerline,
                modePrompts: this.settings.modePrompts,
            });
            this.modeTracker.attach(this.app);
        }
        this.scrolloffManager = new ScrolloffManager(this);
        this.scrolloffManager.setup(this.settings.scrolloffLines);
        this.registerEditorExtension(createScrolloffExtension());

        if (this.settings.enableWorkspaceNav && !Platform.isMobile) {
            this.globalRegistry = new GlobalMappingRegistry();
            registerDefaultGlobalMappings(
                this.globalRegistry,
                this.app,
                this.hintActions,
                this.openPicker ?? undefined,
                this.settings.oilExplorer
                    ? (this.oilManager ?? undefined)
                    : undefined,
            );
            this.globalKeyHandler = new GlobalKeyHandler(
                this.app,
                this.settings,
                this.modeTracker,
                this.globalRegistry,
            );
            this.globalKeyHandler.openPicker = this.openPicker ?? undefined;
            this.globalKeyHandler.install();
            this.rebuildGlobalWhichKey();
        }

        if (this.settings.enableVimTextareas && !Platform.isMobile) {
            this.textareaVimManager = new TextareaVimManager(
                this.app,
                this.settings.cursorShapes,
            );
            this.textareaVimManager.install();
            this.register(() => {
                this.textareaVimManager?.destroy();
                this.textareaVimManager = null;
            });
        }

        // --- Leader bindings from settings UI ---
        this.registration.beginLeaderScope();
        this.applySettingsLeaderBindings(
            this.registration,
            this.leaderRegistry,
        );
        this.registration.endLeaderScope();

        // --- Insert escape handler ---
        this.insertEscapeHandler = new InsertEscapeHandler(this.app, vim);
        this.insertEscapeHandler.attach();

        // --- Ex command suggest ---
        this.rebuildExSuggest();

        // --- Which-key overlay ---
        this.rebuildWhichKey();

        if (this.settings.tableWidgetMode !== 'off') {
            this.uninstallTableSuppressor = installTableWidgetSuppressor(
                this.app,
                this.settings.tableWidgetMode,
            );
        }

        const isEmbedded = this.settings.tableWidgetMode === 'embedded';
        setTableRenderEnabled(
            this.settings.tableWidgetMode === 'cursor' || isEmbedded,
        );
        this.registerEditorExtension(tableRenderField);

        setEmbeddedModeEnabled(isEmbedded);
        setTableEmbeddedMode(isEmbedded);
        setCellEditorCursorShapes(this.settings.cursorShapes);
        this.registerEditorExtension(tableEmbeddedField);

        if (this.settings.enableTableNav) {
            this.registerEditorExtension(
                createTableFormatOnExitExtension(this.app),
            );
        }

        this.registerEditorExtension(yankHighlightExtension());
        this.registerEditorExtension(createCompositionTrackerExtension());
        this.registerEditorExtension(createImModeWatcherExtension());
        this.registerEditorExtension(foldSyncExtension());
        setFoldAwareNavigation(this.settings.foldAwareNavigation);
        this.registerEditorExtension(foldLevelExtension());
        this.registerEditorExtension(markdownFoldProvider());
        this.registerEditorExtension(foldPlaceholderExtension());
        this.registerEditorExtension(signColumnFieldExtension());
        this.registerEditorExtension(
            createMarkGutterExtension(this.settings.signcolumn),
        );
        this.registerEditorExtension(
            createStatusColumnExtension(
                this.settings.statuscolumn,
                this.getStatusColumnSettings(),
            ),
        );

        if (this.settings.enableSnippets) {
            const triggerMode = this.settings.snippetTriggerMode;
            if (triggerMode === 'completion' || triggerMode === 'both') {
                this.registerEditorExtension(
                    autocompletion({
                        override: [
                            createSnippetCompletionSource(
                                () => this.snippetRegistry,
                                () => this.getSnippetPreprocessContext(),
                            ),
                        ],
                        activateOnTyping: true,
                        defaultKeymap: false,
                    }),
                );
            }
            if (triggerMode === 'tab' || triggerMode === 'both') {
                this.registerEditorExtension(
                    createSnippetTabKeymap(
                        () => this.snippetRegistry,
                        () => this.getSnippetPreprocessContext(),
                        () => {
                            const mdView =
                                this.app.workspace.getActiveViewOfType(
                                    MarkdownView,
                                );
                            if (!mdView) return false;
                            const adapter = getCmAdapter(mdView);
                            if (!adapter) return false;
                            const vimState = adapter.state.vim as
                                | Record<string, unknown>
                                | undefined;
                            return !!vimState?.insertMode;
                        },
                        () => this.settings.enableSnippets,
                    ),
                );
            }
            this.registerEditorExtension(
                createDynamicSnippetPlugin(() => getActiveDynamicContext()),
            );
            this.registerEditorExtension(
                EditorView.updateListener.of((update) => {
                    const prev = update.startState.field(snippetState, false);
                    const curr = update.state.field(snippetState, false);
                    if (prev && !curr) {
                        setActiveDynamicContext(null);
                    }
                }),
            );
        }

        this.registerEditorExtension(
            createLineNumberExtension(
                this.settings.number,
                this.settings.relativenumber,
                this.settings.linenumbermode,
            ),
        );
        this.registerEditorExtension(
            createLineNumberSecondaryExtension(
                this.settings.number,
                this.settings.relativenumber,
                this.settings.linenumbermode,
            ),
        );
        if (this.settings.number || this.settings.relativenumber) {
            activeDocument.body.classList.add(
                'vim-motions-line-numbers-active',
            );
        }
        setNumberwidth(this.settings.numberwidth);
        this.registerEditorExtension(
            createCursorlineExtension(
                this.settings.cursorline,
                this.settings.cursorlineopt,
            ),
        );
        setCursorShapes(
            this.settings.cursorShapes as unknown as Record<string, string>,
        );
        setCursorSuppressed(this.settings.animatedCursor);
        if (this.settings.animatedCursor) {
            setAnimatedCursorConfig({
                enabled: true,
                smoothCursor: this.settings.smoothCursor,
                smoothness: this.settings.cursorSmoothness,
                smearTrail: this.settings.smearTrail,
                stiffness: this.settings.smearStiffness,
                trailingStiffness: this.settings.smearTrailingStiffness,
                damping: this.settings.smearDamping,
                maxLength: this.settings.smearMaxLength,
            });
            this.registerEditorExtension(createAnimatedCursorExtension());
        } else {
            setAnimatedCursorConfig({ enabled: false });
        }
        this.registerEditorExtension(
            createFoldColumnExtension(this.settings.foldcolumn),
        );

        this.uninstallVisualLineFix = installVisualLineCommandFix(this.app);
        this.registerEditorExtension(linewiseWidgetHighlightExtension());

        this.registerInterval(
            window.setInterval(() => {
                if (this.markSaveDirty) {
                    this.markSaveDirty = false;
                    this.settings.persistedMarks = this.markStore.save();
                    void this.saveSettings();
                }
            }, 30_000),
        );
        this.registerInterval(
            window.setInterval(() => {
                if (this.harpoonSaveDirty) {
                    this.harpoonSaveDirty = false;
                    this.settings.harpoonPins = this.harpoonStore.save();
                    void this.saveSettings();
                }
            }, 30_000),
        );
        this.registerInterval(
            window.setInterval(() => {
                if (this.jumpListSaveDirty) {
                    this.jumpListSaveDirty = false;
                    this.settings.persistedJumpList = this.jumpList.serialize();
                    void this.saveSettings();
                }
            }, 30_000),
        );
        this.registerInterval(
            window.setInterval(() => {
                if (!this.settings.undoFile) return;
                if (this.undoTreeSaveDirty) {
                    this.persistDirtyUndoTrees();
                    void this.saveSettings();
                }
            }, 30_000),
        );
        this.registerInterval(
            window.setInterval(() => {
                if (this.imSwitcher) {
                    this.settings.persistedImState =
                        this.imSwitcher.getPersistedState();
                    void this.saveSettings();
                }
            }, 30_000),
        );
        this.registerInterval(
            window.setInterval(() => {
                if (this.foldPersistDirty) {
                    this.foldPersistDirty = false;
                    (
                        this.settings as unknown as Record<string, unknown>
                    ).persistedFolds = this.foldStore.save();
                    void this.saveSettings();
                }
            }, 30_000),
        );

        this.app.workspace.trigger('parse-style-settings');
        this.initializing = false;
    }

    reloadFeatures(): void {
        if (this.autocmdManager?.isFiring()) {
            this.autocmdManager.deferReload();
            return;
        }
        this.attachYankHighlight();
        this.modeTracker?.destroy();
        this.modeTracker = null;
        this.hintActions = null;
        this.registration?.unregisterAll();
        this.leaderRegistry?.clearBuiltinBindings();

        const vim = getVimApi();
        if (!vim) return;

        if (typeof vim.resetKeymap === 'function') {
            vim.resetKeymap();
        }
        this.registration = new VimRegistration(vim);

        // :ob must be re-registered unconditionally (unregisterAll noops it)
        registerObCommand(this.registration, this.app, {
            openPicker: this.openPicker ?? undefined,
            isPickerEnabled: () => this.settings.picker,
        });

        this.registration.defineActionOverride(
            'newLineAndEnterInsertMode',
            (original) =>
                createSmartOpenLineAction(
                    original,
                    () => this.settings.listContinuationOnOpen,
                ),
        );

        if (this.jumpList) {
            this.registration.defineActionOverride('jumpListWalk', (original) =>
                createJumpListWalkOverride(original, this.app, this.jumpList),
            );
        }

        if (this.leaderRegistry) {
            this.registration.unmapDefaultBinding(
                this.leaderRegistry.getLeaderKey(),
            );
        }

        if (this.settings.enableTextObjects) {
            registerTextObjects(
                this.registration,
                this.settings.multilineScanLimit,
            );
        }
        if (this.settings.enableNavigation) {
            registerNavigationMotions(this.registration);
            registerBufferNavigation(this.registration, this.app);
        }
        if (this.settings.enableTableNav) {
            registerTableMotions(this.registration);
            this.registration.beginLeaderScope();
            registerTableActions(
                this.registration,
                this.app,
                this.leaderRegistry ?? undefined,
            );
            this.registration.endLeaderScope();
        }
        if (this.settings.enableHardWrap) {
            registerOperators(this.registration);
        }
        if (this.settings.enableReplaceWithRegister) {
            registerReplaceWithRegister(this.registration);
        }
        if (this.settings.enableDial) {
            registerDial(this.registration);
        }
        if (this.settings.enableSubwordMotions) {
            registerSubwordMotions(this.registration);
        }
        if (this.settings.enableWorkspaceNav && this.leaderRegistry) {
            registerWorkspaceNavigation(
                this.registration,
                this.app,
                this.leaderRegistry,
                this.settings.enableReplaceWithRegister,
            );
            registerExCommands(
                this.registration,
                this.app,
                vim,
                this.globalRegistry ?? undefined,
                this.autocmdManager ?? undefined,
                this.settings.oilExplorer
                    ? (this.oilManager ?? undefined)
                    : undefined,
                {
                    openPicker: this.openPicker ?? undefined,
                    isPickerEnabled: () => this.settings.picker,
                },
                this.triggerMarkGutterRefresh,
                this.jumpList,
                this.settings.enableUndoTree ? this.undoTree : undefined,
                this.settings.enableUndoTree
                    ? this.navigateUndoTreeTo.bind(this)
                    : undefined,
            );
        }
        if (this.settings.enableYankRing && this.registration) {
            registerYankRing(this.registration, vim, this.yankRingManager);
        }
        this.registerHarpoonExCommands();
        this.registerImExCommands();
        if (!Platform.isMobile) {
            registerFlash(this.registration, this.app, this.settings, vim);
            this.flashSearchCleanup?.();
            this.flashSearchCleanup = enableFlashSearch(
                this.app,
                this.settings,
            );
        }
        this.registration.beginLeaderScope();
        if (
            this.settings.enableEasyMotion &&
            this.leaderRegistry &&
            !Platform.isMobile
        ) {
            registerEasyMotion(
                this.registration,
                this.app,
                this.settings.easyMotionLabels,
                this.leaderRegistry,
                () => this.settings.easyMotionDimming,
                () => this.settings.labelFontSize,
                () => this.settings.labelMatchFontSize,
            );
        }

        if (
            this.settings.enableHintMode &&
            this.leaderRegistry &&
            !Platform.isMobile
        ) {
            this.registerHintActions(this.registration, this.leaderRegistry);
        }
        this.registration.endLeaderScope();
        this.registration.beginLeaderScope();
        if (this.settings.pickerLeaderMappings && this.leaderRegistry) {
            this.registerPickerLeaderMappings();
        }
        this.registerHarpoonLeaderMappings();
        this.registration.endLeaderScope();
        this.registration.map('Y', 'y$', 'normal');
        this.registration.map('Q', '@@', 'normal');

        this.registration.defineMotion(
            'changeListOlder',
            createOlderChangeMotion(this.changeList),
        );
        this.registration.mapCommand('g;', 'motion', 'changeListOlder', {});
        this.registration.defineMotion(
            'changeListNewer',
            createNewerChangeMotion(this.changeList),
        );
        this.registration.mapCommand('g,', 'motion', 'changeListNewer', {});

        if (this.settings.enableUndoTree) {
            const undoTreeRef = this.undoTree;
            this.registration.defineAction('undoTreeOlder', () => {
                const beforeSeq = undoTreeRef.getCurrentSeq();
                const node = undoTreeRef.navigateOlder();
                if (!node) return;
                this.navigateUndoTreeTo(beforeSeq, node.seq);
            });
            this.registration.mapCommand('g-', 'action', 'undoTreeOlder', {});

            this.registration.defineAction('undoTreeNewer', () => {
                const beforeSeq = undoTreeRef.getCurrentSeq();
                const node = undoTreeRef.navigateNewer();
                if (!node) return;
                this.navigateUndoTreeTo(beforeSeq, node.seq);
            });
            this.registration.mapCommand('g+', 'action', 'undoTreeNewer', {});
        }

        if (this.settings.enableStatusBar) {
            this.modeTracker = new VimModeTracker(this, {
                chordDisplay: this.settings.enableChordDisplay,
                powerline: this.settings.enablePowerline,
                modePrompts: this.settings.modePrompts,
            });
            this.modeTracker.attach(this.app);
        }

        this.globalWhichKeyOverlay?.destroy();
        this.globalWhichKeyOverlay = null;
        this.globalKeyHandler?.destroy();
        this.globalKeyHandler = null;
        this.globalRegistry = null;
        if (this.settings.enableWorkspaceNav && !Platform.isMobile) {
            this.globalRegistry = new GlobalMappingRegistry();
            registerDefaultGlobalMappings(
                this.globalRegistry,
                this.app,
                this.hintActions,
                this.openPicker ?? undefined,
                this.settings.oilExplorer
                    ? (this.oilManager ?? undefined)
                    : undefined,
            );
            this.applyGlobalMaps();
            this.globalKeyHandler = new GlobalKeyHandler(
                this.app,
                this.settings,
                this.modeTracker,
                this.globalRegistry,
            );
            this.globalKeyHandler.openPicker = this.openPicker ?? undefined;
            this.globalKeyHandler.install();
            this.rebuildGlobalWhichKey();
        }

        this.textareaVimManager?.destroy();
        this.textareaVimManager = null;
        if (this.settings.enableVimTextareas && !Platform.isMobile) {
            this.textareaVimManager = new TextareaVimManager(
                this.app,
                this.settings.cursorShapes,
            );
            this.textareaVimManager.install();
            this.register(() => {
                this.textareaVimManager?.destroy();
                this.textareaVimManager = null;
            });
        }

        this.scrolloffManager?.setup(this.settings.scrolloffLines);
        setFoldAwareNavigation(this.settings.foldAwareNavigation);

        if (isBundledVimActive()) {
            const mdView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (mdView) {
                const adapter = getCmAdapter(mdView);
                if (adapter) {
                    const vimState = adapter.state.vim as
                        | Record<string, unknown>
                        | undefined;
                    if (vimState) {
                        vimState.cursorShapes = {
                            ...this.settings.cursorShapes,
                        };
                    }
                }
            }
        }

        this.rebuildExSuggest();
        this.rebuildWhichKey();

        this.uninstallTableSuppressor?.();
        this.uninstallTableSuppressor = null;
        if (this.settings.tableWidgetMode !== 'off') {
            this.uninstallTableSuppressor = installTableWidgetSuppressor(
                this.app,
                this.settings.tableWidgetMode,
            );
        }
        const isEmbedded = this.settings.tableWidgetMode === 'embedded';
        setTableRenderEnabled(
            this.settings.tableWidgetMode === 'cursor' || isEmbedded,
        );
        setEmbeddedModeEnabled(isEmbedded);
        setTableEmbeddedMode(isEmbedded);
        setCellEditorCursorShapes(this.settings.cursorShapes);
        if (this.pickerAPI) {
            this.registerBundledIntegrations();
        }
    }

    private rebuildExSuggest(): void {
        this.exSuggest?.destroy();
        this.exSuggest = null;

        const editorContainerEl = (
            this.app as unknown as { workspace: { containerEl: HTMLElement } }
        ).workspace.containerEl;
        if (editorContainerEl && this.registration) {
            this.exSuggest = new ExCommandSuggest(
                this.registration.getExCommandNames(),
            );
            this.exSuggest.attach(editorContainerEl);
        }
    }

    private rebuildWhichKey(): void {
        this.whichKeyOverlay?.destroy();
        this.whichKeyOverlay = null;

        if (!this.leaderRegistry) return;

        const leaderKey = this.leaderRegistry.getLeaderKey();
        const bindings = this.leaderRegistry.getBindings();
        const mode = this.settings.whichKeyMode;
        const generalMode = mode === 'all';

        if (mode === 'off') return;
        if (!generalMode && bindings.length === 0) return;

        const registryLabels = this.leaderRegistry.getGroupLabels();
        const groupLabels = new Map<string, WhichKeyLabelInfo>();
        for (const [key, label] of registryLabels) {
            groupLabels.set(normalizeVimKey(leaderKey + key), label);
        }
        for (const entry of this.settings.whichKeyGroupLabels) {
            if (entry.key && entry.label) {
                const expandedKey = normalizeVimKey(
                    entry.key.trim().replace(/<leader>/gi, leaderKey),
                );
                groupLabels.set(expandedKey, {
                    label: entry.label,
                    icon: entry.icon,
                    color: entry.color,
                });
            }
        }
        for (const entry of this.vimrcGroupLabels) {
            if (entry.key && entry.label) {
                groupLabels.set(normalizeVimKey(entry.key), {
                    label: entry.label,
                    icon: entry.icon,
                    color: entry.color,
                });
            }
        }
        for (const entry of this.luaGroupLabels) {
            if (entry.key && entry.label) {
                groupLabels.set(normalizeVimKey(entry.key), {
                    label: entry.label,
                    icon: entry.icon,
                    color: entry.color,
                });
            }
        }

        const commandLabels = new Map<string, WhichKeyLabelInfo>();
        for (const entry of this.settings.whichKeyCommandLabels) {
            if (entry.key && entry.label) {
                const expandedKey = normalizeVimKey(
                    entry.key.trim().replace(/<leader>/gi, leaderKey),
                );
                commandLabels.set(expandedKey, {
                    label: entry.label,
                    icon: entry.icon,
                    color: entry.color,
                });
            }
        }
        for (const entry of this.vimrcCommandLabels) {
            if (entry.key && entry.label) {
                commandLabels.set(normalizeVimKey(entry.key), {
                    label: entry.label,
                    icon: entry.icon,
                    color: entry.color,
                });
            }
        }
        for (const entry of this.luaCommandLabels) {
            if (entry.key && entry.label) {
                commandLabels.set(normalizeVimKey(entry.key), {
                    label: entry.label,
                    icon: entry.icon,
                    color: entry.color,
                });
            }
        }
        for (const entry of this.oilKeybindingManager?.getCommandLabels() ??
            []) {
            if (entry.key && entry.label) {
                commandLabels.set(normalizeVimKey(entry.key), {
                    label: entry.label,
                });
            }
        }

        const builtinCommandLabels: Array<[string, WhichKeyLabelInfo]> = [
            ['g;', { label: 'Older change' }],
            ['g,', { label: 'Newer change' }],
            ['g-', { label: 'Older undo state' }],
            ['g+', { label: 'Newer undo state' }],
        ];
        for (const [key, info] of builtinCommandLabels) {
            const normalized = normalizeVimKey(key);
            if (!commandLabels.has(normalized)) {
                commandLabels.set(normalized, info);
            }
        }

        this.whichKeyOverlay = new WhichKeyOverlay(
            this.app,
            leaderKey,
            bindings,
            generalMode,
            this.settings.whichKeyGrouping === 'grouped',
            groupLabels,
            commandLabels,
            this.settings.whichKeyIcons,
            this.settings.whichKeyDelay,
            this.settings.whichKeySortOrder,
        );
        this.whichKeyOverlay.attach();
    }

    private reregisterLeaderFeatures(): void {
        if (!this.registration || !this.leaderRegistry) return;
        this.registration.unregisterLeaderBindings();
        this.leaderRegistry.clearBuiltinBindings();
        this.registration.unmapDefaultBinding(
            this.leaderRegistry.getLeaderKey(),
        );
        this.registration.beginLeaderScope();
        if (this.settings.enableTableNav) {
            registerTableActions(
                this.registration,
                this.app,
                this.leaderRegistry,
            );
        }
        if (this.settings.enableEasyMotion && !Platform.isMobile) {
            registerEasyMotion(
                this.registration,
                this.app,
                this.settings.easyMotionLabels,
                this.leaderRegistry,
                () => this.settings.easyMotionDimming,
                () => this.settings.labelFontSize,
                () => this.settings.labelMatchFontSize,
            );
        }
        if (this.settings.enableHintMode && !Platform.isMobile) {
            this.registerHintActions(this.registration, this.leaderRegistry);
        }
        this.registerHarpoonLeaderMappings();
        this.applySettingsLeaderBindings(
            this.registration,
            this.leaderRegistry,
        );
        this.registration.endLeaderScope();
    }

    private hintActions: {
        activate: (count?: number) => void;
        openNew: (count?: number) => void;
        yank: (count?: number) => void;
        close: (count?: number) => void;
    } | null = null;

    private registerHintActions(
        reg: VimRegistration,
        leaderRegistry: LeaderRegistry,
    ): void {
        this.hintActions = createHintActions(
            this.app,
            this.settings.hintModeLabels,
            () => this.settings.labelFontSize,
        );
        reg.defineAction('hintMode', () => {
            this.hintActions?.activate();
        });
        reg.defineEx('hintactivate', 'hinta', () => {
            this.hintActions?.activate();
        });
        reg.defineEx('hintopennew', 'hinto', () => {
            this.hintActions?.openNew();
        });
        reg.defineEx('hintyank', 'hinty', () => {
            this.hintActions?.yank();
        });
        reg.defineEx('hintclose', 'hintc', () => {
            this.hintActions?.close();
        });
        const leader = leaderRegistry.getLeaderKey();
        const hintKeys = leader + leader + 'h';
        reg.mapCommand(hintKeys, 'action', 'hintMode', {});
        leaderRegistry.addBinding(hintKeys, 'Hint mode', 'builtin');
    }

    private registerPickerLeaderMappings(): void {
        if (!this.registration || !this.leaderRegistry) return;
        const leader = this.leaderRegistry.getLeaderKey();
        this.registration.unmapDefaultBinding(leader);

        this.registration.defineAction('pickerGrep', () => {
            this.openPicker?.('livegrep');
        });
        this.registration.mapCommand(leader + 'fg', 'action', 'pickerGrep', {});
        this.leaderRegistry.addBinding(leader + 'fg', 'grep', 'builtin');

        const sources = [
            ['ff', 'pickerFiles', 'files'],
            ['fb', 'pickerBuffers', 'buffers'],
            ['fh', 'pickerHeadings', 'headings'],
            ['fo', 'pickerOutline', 'outline'],
            ['fk', 'pickerBacklinks', 'backlinks'],
            ['ft', 'pickerTags', 'tags'],
            ['fr', 'pickerRecent', 'recent'],
            ['fm', 'pickerMarks', 'marks'],
            ['fR', 'pickerRegisters', 'registers'],
            ['fp', 'pickerResume', 'resume'],
        ] as const;

        for (const [suffix, actionName, sourceName] of sources) {
            this.registration.defineAction(actionName, () => {
                this.openPicker?.(sourceName);
            });
            this.registration.mapCommand(
                leader + suffix,
                'action',
                actionName,
                {},
            );
            this.leaderRegistry.addBinding(
                leader + suffix,
                sourceName,
                'builtin',
            );
        }
        this.leaderRegistry.addGroupLabel('f', 'Find', true, 'search', 'green');
        if (this.settings.enableReplaceWithRegister) {
            this.leaderRegistry.addGroupLabel(
                'r',
                'Notes',
                true,
                'file-text',
                'purple',
            );
        }
    }

    registerBundledIntegrations(): void {
        const wanted = (
            setting: boolean,
            available: boolean,
            name: string,
            create: () => PickerSource,
        ) => {
            if (setting && available) {
                if (!pickerRegistry.has(name)) {
                    pickerRegistry.register(create(), true);
                }
            } else {
                if (pickerRegistry.has(name)) {
                    pickerRegistry.unregister(name);
                }
            }
        };

        wanted(
            this.settings.pickerOmnisearch,
            isOmnisearchAvailable(),
            'omnisearch',
            createOmnisearchSource,
        );
        wanted(
            this.settings.pickerTasks,
            isTasksAvailable(this.app),
            'tasks',
            createTasksSource,
        );
        wanted(
            this.settings.pickerDataview,
            isDataviewAvailable(this.app),
            'dataview',
            createDataviewSource,
        );
    }

    private registerHarpoonExCommands(): void {
        if (!this.settings.enableHarpoon || !this.registration) return;
        const vim = getVimApi();
        if (!vim) return;
        vim.defineEx('HarpoonAdd', 'HarpoonA', () => {
            const file = this.app.workspace.getActiveFile();
            if (!file) {
                new Notice('No file to pin');
                return;
            }
            const view = this.app.workspace.getActiveViewOfType(MarkdownView);
            const cursor = view?.editor.getCursor();
            this.harpoonStore.add(
                file.path,
                cursor?.line ?? 0,
                cursor?.ch ?? 0,
            );
            this.harpoonSaveDirty = true;
        });
        vim.defineEx('HarpoonRemove', 'HarpoonR', (_cm, params) => {
            const arg = (params.argString ?? '').trim();
            if (arg) {
                const n = parseInt(arg, 10);
                if (!isNaN(n) && n >= 1) this.harpoonStore.remove(n - 1);
            } else {
                const file = this.app.workspace.getActiveFile();
                if (file) this.harpoonStore.removeByPath(file.path);
            }
            this.harpoonSaveDirty = true;
        });
        vim.defineEx('Harpoon', 'Harpoon', () => {
            this.openPicker?.('harpoon');
        });
        vim.defineEx('HarpoonSelect', 'HarpoonS', (_cm, params) => {
            const n = parseInt((params.argString ?? '').trim(), 10);
            if (!isNaN(n) && n >= 1) {
                const item = this.harpoonStore.get(n - 1);
                if (item) void navigateToHarpoonPin(this.app, item);
            }
        });
        vim.defineEx('HarpoonNext', 'HarpoonN', () => {
            const item = this.harpoonStore.selectNext();
            if (item) void navigateToHarpoonPin(this.app, item);
        });
        vim.defineEx('HarpoonPrev', 'HarpoonP', () => {
            const item = this.harpoonStore.selectPrev();
            if (item) void navigateToHarpoonPin(this.app, item);
        });
    }

    private async softReloadVimrc(
        vim: import('./types/vim-api').VimApi,
        onSettingOverride: (
            key: string,
            value: unknown,
            directive?: string,
        ) => void,
    ): Promise<void> {
        const path = this.vimrcWatchPath;
        if (!path) return;

        const parsed = await readAndParseVimrcFile(this.app, path);
        if (!parsed.found || parsed.commands.length === 0) return;

        for (const key of this.vimrcMapKeys) {
            try {
                vim.unmap(key, 'normal');
            } catch {
                /* may not exist */
            }
        }
        this.vimrcMapKeys.clear();

        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        const cm = view ? getCmAdapter(view) : null;
        const leaderKey = this.leaderRegistry?.getLeaderKey() ?? '\\';

        const result = applyVimrcCommands(
            parsed.commands,
            vim,
            cm,
            leaderKey,
            this.leaderRegistry ?? undefined,
            onSettingOverride,
        );

        this.vimrcMaps = result.deferredMaps;
        this.vimrcMapKeys = new Set(result.deferredMaps.map((m) => m.lhs));
        this.vimrcCommandCount = result.commandCount;
        applyVimrcMaps(vim, this.vimrcMaps);

        if (result.pendingExCommands.length > 0 && cm) {
            applyPendingExCommands(vim, cm, result.pendingExCommands);
        }

        this.vimrcGlobalMaps = result.deferredGlobalMaps;
        this.vimrcGlobalWhichKeyLabels = result.globalWhichKeyLabels;
        this.vimrcGlobalWhichKeyGroups = result.globalWhichKeyGroups;
        this.applyGlobalMaps();
        this.reregisterLeaderFeatures();
        this.rebuildWhichKey();

        if (this.settings.showConfigNotifications) {
            new Notice(
                `Vim Motions: reloaded ${result.commandCount} command${result.commandCount === 1 ? '' : 's'} from ${path}.`,
            );
        }
    }

    private registerImExCommands(): void {
        const vim = getVimApi();
        if (!vim) return;

        vim.defineEx('IMToggle', 'IMT', () => {
            this.settings.imEnabled = !this.settings.imEnabled;
            void this.saveSettings();
            this.reloadFeatures();
            new Notice(
                `Input method switching: ${this.settings.imEnabled ? 'enabled' : 'disabled'}`,
            );
        });

        vim.defineEx('IMStatus', 'IMS', () => {
            if (!this.imSwitcher) {
                new Notice('Input method switching is not enabled.');
                return;
            }
            void this.imSwitcher.get().then((imId) => {
                new Notice(
                    imId
                        ? `Current IM: ${imId}`
                        : 'Could not query input method.',
                );
            });
        });
    }

    private registerHarpoonLeaderMappings(): void {
        if (
            !this.leaderRegistry ||
            !this.registration ||
            !this.settings.enableHarpoon
        )
            return;
        const leader = this.leaderRegistry.getLeaderKey();

        const actions: [string, string, () => void][] = [
            [
                'ha',
                'harpoonAdd',
                () => {
                    const file = this.app.workspace.getActiveFile();
                    if (!file) {
                        new Notice('No file to pin');
                        return;
                    }
                    const view =
                        this.app.workspace.getActiveViewOfType(MarkdownView);
                    const cursor = view?.editor.getCursor();
                    const idx = this.harpoonStore.add(
                        file.path,
                        cursor?.line ?? 0,
                        cursor?.ch ?? 0,
                    );
                    new Notice(`Pinned to slot ${idx + 1}`);
                    this.harpoonSaveDirty = true;
                },
            ],
            [
                'hr',
                'harpoonRemove',
                () => {
                    const file = this.app.workspace.getActiveFile();
                    if (!file) return;
                    this.harpoonStore.removeByPath(file.path);
                    new Notice('Unpinned');
                    this.harpoonSaveDirty = true;
                },
            ],
            [
                'ht',
                'harpoonToggle',
                () => {
                    const file = this.app.workspace.getActiveFile();
                    if (!file) {
                        new Notice('No file to pin');
                        return;
                    }
                    const view =
                        this.app.workspace.getActiveViewOfType(MarkdownView);
                    const cursor = view?.editor.getCursor();
                    const added = this.harpoonStore.toggle(
                        file.path,
                        cursor?.line ?? 0,
                        cursor?.ch ?? 0,
                    );
                    if (added) {
                        const entry = this.harpoonStore.getByPath(file.path);
                        new Notice(`Pinned to slot ${(entry?.index ?? 0) + 1}`);
                    } else {
                        new Notice('Unpinned');
                    }
                    this.harpoonSaveDirty = true;
                },
            ],
            [
                'hp',
                'harpoonPicker',
                () => {
                    this.openPicker?.('harpoon');
                },
            ],
            [
                'hn',
                'harpoonNext',
                () => {
                    const item = this.harpoonStore.selectNext();
                    if (item) void navigateToHarpoonPin(this.app, item);
                },
            ],
            [
                'hN',
                'harpoonPrevious',
                () => {
                    const item = this.harpoonStore.selectPrev();
                    if (item) void navigateToHarpoonPin(this.app, item);
                },
            ],
        ];

        for (const [suffix, actionName, callback] of actions) {
            this.registration.defineAction(actionName, callback);
            this.registration.mapCommand(
                leader + suffix,
                'action',
                actionName,
                {},
            );
            this.leaderRegistry.addBinding(
                leader + suffix,
                actionName,
                'builtin',
            );
        }

        for (let i = 1; i <= 9; i++) {
            const actionName = `harpoonSelect${i}`;
            this.registration.defineAction(actionName, () => {
                const item = this.harpoonStore.get(i - 1);
                if (item) void navigateToHarpoonPin(this.app, item);
            });
            this.registration.mapCommand(
                leader + `${i}`,
                'action',
                actionName,
                {},
            );
            this.leaderRegistry.addBinding(
                leader + `${i}`,
                `pin ${i}`,
                'builtin',
            );
        }

        this.leaderRegistry.addGroupLabel(
            'h',
            'Harpoon',
            true,
            'anchor',
            'orange',
        );
    }

    private parseHotkey(serialized: string): {
        key: string;
        ctrl: boolean;
        shift: boolean;
        alt: boolean;
        meta: boolean;
    } | null {
        if (!serialized) return null;
        const colonIdx = serialized.indexOf(':');
        if (colonIdx === -1) return null;
        const modPart = serialized.slice(0, colonIdx);
        const key = serialized.slice(colonIdx + 1);
        if (!key) return null;
        const mods = new Set(modPart.split(',').filter(Boolean));
        return {
            key,
            ctrl: mods.has('ctrl'),
            shift: mods.has('shift'),
            alt: mods.has('alt'),
            meta: mods.has('meta'),
        };
    }

    private setupHintModeOnWindow(doc: Document): void {
        if (!this.hintActions) return;
        if (this.hintWindowDocs.has(doc)) return;
        this.hintWindowDocs.add(doc);

        const handler = (e: KeyboardEvent) => {
            const parsed = this.parseHotkey(this.settings.hintModeHotkey);
            if (!parsed) return;

            const eventKey = e.key === 'Unidentified' ? e.code : e.key;
            if (
                eventKey === parsed.key &&
                e.ctrlKey === parsed.ctrl &&
                e.shiftKey === parsed.shift &&
                e.altKey === parsed.alt &&
                e.metaKey === parsed.meta
            ) {
                e.preventDefault();
                e.stopPropagation();
                this.hintActions?.activate();
            }
        };
        doc.addEventListener('keydown', handler, true);
        this.hintWindowCleanups.push(() => {
            doc.removeEventListener('keydown', handler, true);
        });
    }

    private setupHintModeWindows(): void {
        this.cleanupHintModeWindows();
        const mainDoc = this.app.workspace.containerEl.ownerDocument;
        this.setupHintModeOnWindow(mainDoc);
        this.registerEvent(
            this.app.workspace.on('window-open', (_workspaceWindow, win) => {
                this.setupHintModeOnWindow(win.document);
            }),
        );
    }

    private cleanupHintModeWindows(): void {
        for (const cleanup of this.hintWindowCleanups) cleanup();
        this.hintWindowCleanups = [];
        this.hintWindowDocs.clear();
    }

    private applySettingsLeaderBindings(
        reg: VimRegistration,
        leaderRegistry: LeaderRegistry,
    ): void {
        const leaderKey = leaderRegistry.getLeaderKey();
        for (const binding of this.settings.leaderBindings) {
            if (!binding.key || !binding.commandId) continue;
            const lhs = leaderKey + binding.key;
            reg.map(lhs, ':ob ' + binding.commandId);
            leaderRegistry.addBinding(lhs, ':ob ' + binding.commandId);
        }
    }

    private applyGlobalMaps(): void {
        if (!this.globalRegistry) return;
        for (const gm of this.vimrcGlobalMaps) {
            const lhs = normalizeKeyString(gm.lhs);
            let action: import('./workspace/global-mapping-registry').GlobalMapAction;
            if (gm.rhs.startsWith(':obcommand ')) {
                action = {
                    type: 'obcommand',
                    commandId: gm.rhs.slice(':obcommand '.length).trim(),
                };
            } else if (gm.rhs.startsWith(':')) {
                action = { type: 'ex', command: gm.rhs.slice(1).trim() };
            } else {
                console.warn(`Vim Motions: invalid gmap rhs: ${gm.rhs}`);
                continue;
            }
            this.globalRegistry.addMapping(lhs, action, {
                source: 'user',
                gate: 'standard',
            });
        }
        for (const key of this.vimrcGlobalUnmaps) {
            this.globalRegistry.removeMapping(normalizeKeyString(key));
        }
        for (const entry of this.vimrcGlobalWhichKeyLabels) {
            this.globalRegistry.setLabel(
                normalizeKeyString(entry.key),
                entry.label,
            );
        }
        for (const entry of this.vimrcGlobalWhichKeyGroups) {
            this.globalRegistry.setGroupLabel(
                normalizeKeyString(entry.key),
                entry.label,
                entry.icon,
                entry.color,
            );
        }
        for (const gm of this.luaGlobalMaps) {
            const lhs = normalizeKeyString(gm.lhs);
            let action: import('./workspace/global-mapping-registry').GlobalMapAction;
            if (gm.rhs.startsWith(':obcommand ')) {
                action = {
                    type: 'obcommand',
                    commandId: gm.rhs.slice(':obcommand '.length).trim(),
                };
            } else if (gm.rhs.startsWith(':')) {
                action = { type: 'ex', command: gm.rhs.slice(1).trim() };
            } else {
                continue;
            }
            this.globalRegistry.addMapping(lhs, action, {
                source: 'user',
                gate: 'standard',
            });
            if (gm.desc) {
                this.globalRegistry.setLabel(lhs, gm.desc);
            }
        }
        for (const key of this.luaGlobalUnmaps) {
            this.globalRegistry.removeMapping(normalizeKeyString(key));
        }
        for (const entry of this.luaGlobalWhichKeyLabels) {
            this.globalRegistry.setLabel(
                normalizeKeyString(entry.key),
                entry.label,
            );
        }
        for (const entry of this.luaGlobalWhichKeyGroups) {
            this.globalRegistry.setGroupLabel(
                normalizeKeyString(entry.key),
                entry.label,
                entry.icon,
                entry.color,
            );
        }
    }

    private async loadLuaConfigInternal(
        vim: import('./types/vim-api').VimApi,
        onLuaSettingOverride: (
            key: string,
            value: unknown,
            directive?: string,
        ) => void,
    ): Promise<LuaLoadResult | null> {
        if (!this.luaConfigEnabled) return null;
        if (this.luaLoaded || this.luaLoading) return null;
        this.luaLoading = true;
        this.luaTextObjectSpecs = [];
        this.luaGroupLabels = [];
        this.luaCommandLabels = [];
        this.luaGlobalMaps = [];
        this.luaGlobalUnmaps = [];
        this.luaGlobalWhichKeyLabels = [];
        this.luaGlobalWhichKeyGroups = [];
        if (!this.bufferKeymapManager) {
            this.bufferKeymapManager = new BufferKeymapManager();
        }
        const vimEngine: VimMapUnmap = {
            map: (mode, lhs, rhs, options) => {
                if (options?.noremap) {
                    vim.noremap(lhs, rhs, mode);
                } else {
                    vim.map(lhs, rhs, mode);
                }
            },
            unmap: (lhs, mode) => {
                vim.unmap(lhs, mode);
            },
        };
        this.bufferKeymapManager.setVimEngine(vimEngine);
        this.bufferKeymapManager.setFnMapper((map) => {
            if (!map.callback) return false;
            const actionName =
                (
                    map as LuaLoadResult['maps'][number] & {
                        actionName?: string;
                    }
                ).actionName ?? `lua-buffer-action-${this.luaActionCounter++}`;
            (
                map as LuaLoadResult['maps'][number] & {
                    actionName?: string;
                }
            ).actionName = actionName;
            if (!this.luaActionNames.has(actionName)) {
                this.registration?.defineAction(actionName, map.callback);
                this.registration?.mapCommand(
                    map.lhs,
                    'action',
                    actionName,
                    undefined,
                    map.mode ? { context: map.mode } : undefined,
                );
                this.luaActionNames.add(actionName);
            } else {
                vim.mapCommand(
                    map.lhs,
                    'action',
                    actionName,
                    undefined,
                    map.mode ? { context: map.mode } : undefined,
                );
            }
            return true;
        });
        const customLuaPath = this.settings.luaConfigPath || undefined;
        const oilMgr = this.oilManager;
        const oilCallbacks = {
            oilOpen: (path: string) => {
                if (!oilMgr) return;
                void oilMgr.openOil(path);
            },
            oilClose: () => {
                const leaf = this.app.workspace.getMostRecentLeaf();
                if (!leaf) return;
                const view = leaf.view;
                if (oilMgr?.isOilView(view)) {
                    const previousFile = view.getPreviousFile();
                    const file = previousFile
                        ? this.app.vault.getAbstractFileByPath(previousFile)
                        : null;
                    if (file) {
                        void leaf.openFile(file as import('obsidian').TFile);
                        return;
                    }
                }
                leaf.detach();
            },
            oilParent: () => void oilMgr?.navigateToParent(),
            oilRoot: () => void oilMgr?.navigateToDirectory(''),
            oilRefresh: () => void oilMgr?.refreshActiveOilView(),
            oilToggleHidden: () => {
                oilMgr?.toggleHidden();
                void oilMgr?.refreshActiveOilView();
            },
            oilCycleSort: () => {
                oilMgr?.cycleSortKey();
                void oilMgr?.refreshActiveOilView();
            },
            oilYankPath: () => oilMgr?.yankPathAtCursor(),
            oilReveal: () => oilMgr?.revealAtCursor(),
            oilOpenEntry: () => oilMgr?.openEntryAtCursor(),
        };
        const luaResult = await loadInitLua(this.app, vim, {
            leaderRegistry: this.leaderRegistry ?? undefined,
            onSettingOverride: onLuaSettingOverride,
            customPath: customLuaPath,
            bufferKeymapManager: this.bufferKeymapManager,
            openPicker: this.openPicker ?? undefined,
            getUndoTree: this.settings.enableUndoTree
                ? () => this.undoTree.toNeovimDict()
                : undefined,
            oilCallbacks,
            onPickerKeymapChange: (keymap) => {
                const s = this.settings.pickerKeymap;
                Object.assign(s, keymap);
            },
            onTextObjectAdd: (keys, spec) => {
                this.luaTextObjectSpecs.push({ keys, spec });
                if (!this.registration) return;
                this.registerLuaTextObject(keys, spec);
            },
            onTextObjectDel: (keys) => {
                const vimApi = getVimApi();
                if (vimApi && typeof vimApi.removeMapCommand === 'function') {
                    vimApi.removeMapCommand(keys);
                }
            },
            globalRegistry: this.globalRegistry ?? undefined,
            imSwitcher: this.imSwitcher,
        });

        this.luaCommandCount = luaResult.commandCount;
        if (!luaResult.found) {
            this.luaLoaded = true;
            this.luaLoading = false;
            if (this.settings.configMode === 'lua') {
                // Error-like: user chose lua-only but file is missing — always show.
                new Notice(
                    `Vim Motions: init.lua not found (searched ${luaResult.path}).`,
                );
            }
            return luaResult;
        } else if (luaResult.error) {
            // Errors always show regardless of suppress setting.
            new Notice(
                `Vim Motions: error loading ${luaResult.path}: ${luaResult.error}`,
            );
        } else if (this.settings.showConfigNotifications) {
            if (luaResult.commandCount === 0) {
                new Notice(
                    `Vim Motions: ${luaResult.path} loaded but contained no commands.`,
                );
            } else {
                new Notice(
                    `Vim Motions: loaded ${luaResult.commandCount} command${luaResult.commandCount === 1 ? '' : 's'} from ${luaResult.path}.`,
                );
            }
        }

        this.luaMapOperations = luaResult.mapOperations;
        this.luaPendingExCommands = luaResult.pendingExCommands;
        this.luaCommandLabels = [
            ...this.luaCommandLabels,
            ...luaResult.commandLabels,
        ];
        this.luaGlobalMaps = luaResult.globalMaps;
        this.luaGlobalUnmaps = luaResult.globalUnmaps;
        this.luaGlobalWhichKeyLabels = luaResult.globalWhichKeyLabels;
        this.luaGlobalWhichKeyGroups = luaResult.globalWhichKeyGroups;
        if (luaResult.state) {
            this.luaState = luaResult.state;
        }
        this.timerManager?.destroyAll();
        this.timerManager = luaResult.timerManager;
        this.autocmdManager = luaResult.autocmdManager;

        this.oilKeybindingManager?.setAutocmdManager(
            this.autocmdManager ?? null,
        );
        this.highlightManager?.destroy();
        this.highlightManager = luaResult.highlightManager;
        this.autocmdManager?.setReloadCallback(() => this.reloadFeatures());
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        const adapter = view ? getCmAdapter(view) : null;
        this.autocmdManager?.onActiveLeafChange(adapter);
        const filePath = this.app.workspace.getActiveFile()?.path ?? null;
        this.bufferKeymapManager?.switchBuffer(filePath);

        this.applyLuaSurroundPairs(vim, luaResult.surroundPairs);
        this.applyLuaPendingExCommands(vim);

        // Activate runtime vim.cmd() execution — after this point,
        // vim.cmd() from Lua callbacks (keymaps, autocmds, timers)
        // executes immediately instead of queuing.
        this.luaDeactivateRuntimeEx?.();
        luaResult.activateRuntimeExHandler?.((command: string) => {
            const rtView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (!rtView) {
                console.warn(
                    'Vim Motions: vim.cmd() called with no active editor — command skipped:',
                    command,
                );
                return;
            }
            const rtCm = getCmAdapter(rtView);
            if (!rtCm) return;
            try {
                vim.handleEx(rtCm, command);
            } catch (e) {
                console.error('Vim Motions: vim.cmd() runtime error:', e);
            }
        });
        this.luaDeactivateRuntimeEx =
            luaResult.deactivateRuntimeExHandler ?? null;

        // Register Lua leader bindings in LeaderRegistry
        if (this.leaderRegistry && luaResult.leaderBindings.length > 0) {
            const leaderKey = this.leaderRegistry.getLeaderKey();
            for (const b of luaResult.leaderBindings) {
                this.leaderRegistry.addBinding(
                    leaderKey + b.key,
                    b.desc ?? b.commandId,
                );
            }
        }

        this.reregisterLeaderFeatures();
        this.rebuildWhichKey();
        this.luaSnippetDefs = luaResult.luaSnippets ?? [];
        if (this.settings.enableSnippets && this.luaSnippetDefs.length > 0) {
            this.snippetRegistry = loadSnippetsSync(
                { snippetBundled: this.settings.snippetBundled },
                this.luaSnippetDefs,
                this.luaState ?? undefined,
            );
        }
        this.luaLoaded = true;
        this.luaLoading = false;
        this.reloadFeatures();
        this.reregisterLuaTextObjects();
        this.applyLuaMaps(vim);
        this.autocmdManager?.fireInitialBufEnter();
        return luaResult;
    }

    private applyLuaPendingExCommands(
        vim: import('./types/vim-api').VimApi,
    ): void {
        if (this.luaPendingExCommands.length === 0) return;
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;
        const cm = getCmAdapter(view);
        if (!cm) return;
        for (const command of this.luaPendingExCommands) {
            try {
                vim.handleEx(cm, command);
            } catch {
                /* intentional: skip invalid ex commands */
            }
        }
        this.luaPendingExCommands = [];
    }

    private registeredSurroundTriggers: string[] = [];

    private applyLuaSurroundPairs(
        vim: import('./types/vim-api').VimApi,
        pairs: Array<{ trigger: string; open: string; close: string }>,
    ): void {
        if (pairs.length === 0) return;
        if (typeof vim.registerSurroundPair !== 'function') {
            new Notice(
                'Vim Motions: custom surround pairs require fork mode. Disable built-in Vim in settings \u2192 editor \u2192 Vim key bindings.',
            );
            return;
        }
        for (const trigger of this.registeredSurroundTriggers) {
            try {
                vim.unregisterSurroundPair?.(trigger);
            } catch {
                /* intentional: skip if not registered */
            }
        }
        this.registeredSurroundTriggers = [];
        for (const pair of pairs) {
            try {
                vim.registerSurroundPair(pair.trigger, pair.open, pair.close);
                this.registeredSurroundTriggers.push(pair.trigger);
            } catch (e) {
                new Notice(
                    `Vim Motions: surround pair "${pair.trigger}" error: ${e instanceof Error ? e.message : String(e)}`,
                );
            }
        }
    }

    private registerLuaTextObject(
        keys: string,
        spec: {
            open: string;
            close: string;
            multiline: boolean;
            inner: boolean;
        },
    ): void {
        if (!this.registration) return;
        const motionName = `luaTextObj_${keys}`;
        const motionFn = createAsymmetricPairTextObject(
            spec.open,
            spec.close,
            spec.multiline,
            spec.inner,
            this.settings.multilineScanLimit,
        );
        this.registration.defineMotion(motionName, motionFn);
        this.registration.mapCommand(keys, 'motion', motionName, {
            textObjectInner: spec.inner,
        });
    }

    private reregisterLuaTextObjects(): void {
        for (const { keys, spec } of this.luaTextObjectSpecs) {
            this.registerLuaTextObject(keys, spec);
        }
    }

    private applyLuaMaps(vim: import('./types/vim-api').VimApi): void {
        for (const op of this.luaMapOperations) {
            if (op.type === 'unmap') {
                try {
                    vim.unmap(op.map.lhs, op.map.mode);
                } catch {
                    /* intentional: skip missing map */
                }
                continue;
            }

            const map = op.map;
            if (map.isFn && map.callback) {
                const actionName =
                    (
                        map as LuaLoadResult['maps'][number] & {
                            actionName?: string;
                        }
                    ).actionName ?? `lua-action-${this.luaActionCounter++}`;
                (
                    map as LuaLoadResult['maps'][number] & {
                        actionName?: string;
                    }
                ).actionName = actionName;
                if (!this.luaActionNames.has(actionName)) {
                    this.registration?.defineAction(actionName, map.callback);
                    this.registration?.mapCommand(
                        map.lhs,
                        'action',
                        actionName,
                        undefined,
                        map.mode ? { context: map.mode } : undefined,
                    );
                    this.luaActionNames.add(actionName);
                } else {
                    vim.mapCommand(
                        map.lhs,
                        'action',
                        actionName,
                        undefined,
                        map.mode ? { context: map.mode } : undefined,
                    );
                }
                continue;
            }

            if (!map.rhs) continue;
            try {
                if (map.noremap) {
                    vim.noremap(map.lhs, map.rhs, map.mode);
                } else {
                    vim.map(map.lhs, map.rhs, map.mode);
                }
            } catch {
                /* intentional: skip malformed mapping */
            }
        }
    }

    private rebuildGlobalWhichKey(): void {
        this.globalWhichKeyOverlay?.destroy();
        this.globalWhichKeyOverlay = null;

        if (!this.globalKeyHandler || !this.globalRegistry) return;

        const mode = this.settings.whichKeyMode;
        if (mode === 'off') return;

        const leaderKey = this.leaderRegistry?.getLeaderKey() ?? '\\';
        const generalMode = mode === 'all';

        const commandLabels = new Map<string, WhichKeyLabelInfo>();
        for (const entry of this.vimrcGlobalWhichKeyLabels) {
            commandLabels.set(normalizeKeyString(entry.key), {
                label: entry.label,
                icon: entry.icon,
                color: entry.color,
            });
        }
        for (const entry of this.luaGlobalWhichKeyLabels) {
            commandLabels.set(normalizeKeyString(entry.key), {
                label: entry.label,
                icon: entry.icon,
                color: entry.color,
            });
        }

        const groupLabels = new Map<string, WhichKeyLabelInfo>();
        for (const entry of this.vimrcGlobalWhichKeyGroups) {
            groupLabels.set(normalizeKeyString(entry.key), {
                label: entry.label,
                icon: entry.icon,
                color: entry.color,
            });
        }
        for (const entry of this.luaGlobalWhichKeyGroups) {
            groupLabels.set(normalizeKeyString(entry.key), {
                label: entry.label,
                icon: entry.icon,
                color: entry.color,
            });
        }
        for (const [prefix, label] of this.globalRegistry.getGroupLabels()) {
            groupLabels.set(prefix, label);
        }

        this.globalWhichKeyOverlay = new GlobalWhichKeyOverlay(
            this.app,
            generalMode ? 'all' : 'leader',
            leaderKey,
            commandLabels,
            groupLabels,
            this.settings.whichKeyIcons,
            this.settings.whichKeyDelay,
            this.settings.whichKeySortOrder,
        );
        this.globalWhichKeyOverlay.attach(this.globalKeyHandler);
    }

    private resetVimInputStateOnPaneSwitch(
        vimApi: import('./types/vim-api').VimApi,
    ): void {
        this.app.workspace.iterateAllLeaves((leaf) => {
            const view = leaf.view;
            if (view.getViewType() !== 'markdown') return;
            const cm = getCmAdapter(view as MarkdownView);
            if (!cm?.state?.vim) return;
            const vimState = cm.state.vim;
            const bufferLen = vimState.inputState?.keyBuffer?.length ?? 0;
            if (bufferLen > 0 && !vimState.insertMode) {
                if (typeof vimApi.clearInputState === 'function') {
                    vimApi.clearInputState(cm, 'pane-switch');
                }
                if (vimState.status) vimState.status = '';
            }
        });
    }

    private attachYankHighlight(): void {
        this.yankHighlightCleanup?.();
        this.yankHighlightCleanup = null;

        if (this.settings.yankHighlightMode === 'off') return;

        const mdView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!mdView) return;
        const adapter = getCmAdapter(mdView);
        if (!adapter) return;

        const handler = (event: VimYankEvent) => {
            if (event.operator !== 'y') return;

            const editorView = getEditorView(mdView);
            if (!editorView) return;

            const state = editorView.state;
            const sel = state.selection.main;

            let ranges: { from: number; to: number }[];
            if (event.regType === 'V') {
                const fromLine = state.doc.lineAt(sel.from);
                ranges = [{ from: fromLine.from, to: sel.to }];
            } else if (event.regType === '\x16') {
                // Blockwise: deferred to v2
                return;
            } else {
                ranges = [{ from: sel.from, to: sel.to }];
            }

            showYankHighlight(
                editorView,
                ranges,
                this.settings.yankHighlightDuration,
                this.settings.yankHighlightMode as 'solid' | 'fade',
            );
        };

        adapter.on('vim-yank', handler as (...args: unknown[]) => void);
        this.yankHighlightCleanup = () => {
            adapter.off('vim-yank', handler as (...args: unknown[]) => void);
        };
    }

    private triggerMarkGutterRefresh = (): void => {
        const mdView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!mdView) return;
        const adapter = getCmAdapter(mdView);
        if (!adapter) return;
        scheduleMarkGutterRefresh(
            adapter.cm6,
            adapter,
            this.getPersistedMarksForFile(mdView.file?.path),
        );
    };

    private getPersistedMarksForFile(
        filePath: string | undefined,
    ): PersistedMarkEntry[] | undefined {
        if (!filePath) return undefined;
        const all = this.markStore.getAll();
        const matching = all.filter((m) => m.filePath === filePath);
        return matching.length > 0
            ? matching.map((m) => ({ name: m.name, line: m.line }))
            : undefined;
    }

    private attachMarkGutter(): void {
        this.markGutterCleanup?.();
        this.markGutterCleanup = null;

        const mdView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!mdView) return;
        const adapter = getCmAdapter(mdView);
        if (!adapter) return;

        const editorView = adapter.cm6;
        const filePath = mdView.file?.path;

        const handler = () => {
            if (this.settings.signcolumn !== 'no') {
                scheduleMarkGutterRefresh(
                    editorView,
                    adapter,
                    this.getPersistedMarksForFile(filePath),
                );
            }
            if (filePath) {
                this.checkGlobalMarkChanges(adapter, filePath);
            }
        };

        adapter.on('vim-command-done', handler);
        this.markGutterCleanup = () => {
            adapter.off('vim-command-done', handler);
            cancelMarkGutterRefresh(editorView);
        };

        if (this.settings.signcolumn !== 'no') {
            scheduleMarkGutterRefresh(
                editorView,
                adapter,
                this.getPersistedMarksForFile(filePath),
            );
        }
    }

    private checkGlobalMarkChanges(cm: CmAdapter, filePath: string): void {
        const marks = cm.state.vim?.marks;
        if (!marks) return;
        const globalRe = /^[A-Z]$/;

        for (const name of Object.keys(marks)) {
            if (!globalRe.test(name)) continue;
            const marker = marks[name];
            if (!marker) continue;
            const pos = marker.find();
            if (!pos) continue;
            const existing = this.markStore.get(name);
            if (
                !existing ||
                existing.filePath !== filePath ||
                existing.line !== pos.line ||
                existing.ch !== pos.ch
            ) {
                this.markStore.set(name, filePath, pos.line, pos.ch);
                this.markSaveDirty = true;
            }
        }
    }

    reconfigureLineNumberGutter(): void {
        const num = this.settings.number;
        const rel = this.settings.relativenumber;
        const mode = this.settings.linenumbermode;
        this.iterateEditorViews((cm) =>
            reconfigureLineNumbers(cm, num, rel, mode),
        );
        activeDocument.body.classList.toggle(
            'vim-motions-line-numbers-active',
            num || rel,
        );
    }

    reconfigureCursorlineHighlight(): void {
        const enabled = this.settings.cursorline;
        const opt = this.settings.cursorlineopt;
        this.iterateEditorViews((cm) =>
            reconfigureCursorline(cm, enabled, opt),
        );
    }

    reconfigureFoldColumnGutter(): void {
        const enabled = this.settings.foldcolumn;
        this.iterateEditorViews((cm) => reconfigureFoldColumn(cm, enabled));
    }

    reconfigureSignColumnGutter(): void {
        const mode = this.settings.signcolumn;
        this.iterateEditorViews((cm) => reconfigureMarkGutter(cm, mode));
    }

    reconfigureStatusColumnGutter(): void {
        const format = this.settings.statuscolumn;
        const stcSettings = this.getStatusColumnSettings();
        this.iterateEditorViews((cm) =>
            reconfigureStatusColumn(cm, format, stcSettings),
        );
        if (format) {
            this.iterateEditorViews((cm) => {
                reconfigureLineNumbers(
                    cm,
                    false,
                    false,
                    this.settings.linenumbermode,
                );
                reconfigureMarkGutter(cm, 'no');
                reconfigureFoldColumn(cm, false);
            });
            activeDocument.body.classList.add(
                'vim-motions-line-numbers-active',
            );
        } else {
            this.iterateEditorViews((cm) => {
                reconfigureLineNumbers(
                    cm,
                    this.settings.number,
                    this.settings.relativenumber,
                    this.settings.linenumbermode,
                );
                reconfigureMarkGutter(cm, this.settings.signcolumn);
                reconfigureFoldColumn(cm, this.settings.foldcolumn);
            });
            activeDocument.body.classList.toggle(
                'vim-motions-line-numbers-active',
                this.settings.number || this.settings.relativenumber,
            );
        }
    }

    private getStatusColumnSettings(): StatusColumnSettings {
        return {
            number: this.settings.number,
            relativenumber: this.settings.relativenumber,
            signcolumn: this.settings.signcolumn,
        };
    }

    private iterateEditorViews(fn: (cm: EditorView) => void): void {
        this.app.workspace.iterateAllLeaves((leaf) => {
            const view = (leaf.view as MarkdownView)?.editor;
            const cm = (
                view as unknown as { cm?: { cm: EditorView } } | undefined
            )?.cm?.cm;
            if (cm && typeof cm.dispatch === 'function') fn(cm);
        });
    }

    onunload() {
        destroyAnimatedCursorManager();
        destroyCellEditorCursorSheet();
        setActiveDynamicContext(null);
        activeDocument.body.classList.remove('vim-motions-line-numbers-active');
        this.markGutterCleanup?.();
        this.markGutterCleanup = null;
        this.yankHighlightCleanup?.();
        this.yankHighlightCleanup = null;
        if (this.markSaveDirty) {
            this.markSaveDirty = false;
            this.settings.persistedMarks = this.markStore.save();
            void this.saveSettings();
        }
        if (this.harpoonSaveDirty) {
            this.harpoonSaveDirty = false;
            this.settings.harpoonPins = this.harpoonStore.save();
            void this.saveSettings();
        }
        if (this.jumpListSaveDirty) {
            this.jumpListSaveDirty = false;
            this.settings.persistedJumpList = this.jumpList.serialize();
            void this.saveSettings();
        }
        if (this.settings.undoFile && this.undoTreeSaveDirty) {
            this.persistDirtyUndoTrees();
            void this.saveSettings();
        }
        if (this.foldPersistDirty) {
            this.foldPersistDirty = false;
            (
                this.settings as unknown as Record<string, unknown>
            ).persistedFolds = this.foldStore.save();
            void this.saveSettings();
        }
        if (this.imSwitcher) {
            this.settings.persistedImState =
                this.imSwitcher.getPersistedState();
            void this.saveSettings();
        }
        this.matcher?.dispose();
        this.matcher = null;
        if (this.frecencySaveTimer) {
            window.clearTimeout(this.frecencySaveTimer);
            this.frecencySaveTimer = null;
            if (this.frecencyStore) {
                this.settings.frecencyData = this.frecencyStore.serialize();
                void this.saveSettings();
            }
        }
        this.globalWhichKeyOverlay?.destroy();
        this.globalWhichKeyOverlay = null;
        this.globalKeyHandler?.destroy();
        this.globalKeyHandler = null;
        this.globalRegistry = null;
        this.cleanupHintModeWindows();
        this.uninstallTableSuppressor?.();
        this.uninstallTableSuppressor = null;
        this.uninstallVisualLineFix?.();
        this.uninstallVisualLineFix = null;
        this.exSuggest?.destroy();
        this.exSuggest = null;
        this.whichKeyOverlay?.destroy();
        this.whichKeyOverlay = null;
        this.insertEscapeHandler?.destroy();
        this.insertEscapeHandler = null;
        this.modeTracker?.destroy();
        this.modeTracker = null;
        this.scrolloffManager?.destroy();
        this.scrolloffManager = null;
        this.registration?.unregisterAll();
        this.registration = null;
        this.timerManager?.destroyAll();
        this.timerManager = null;
        clearImModeCallbacks();
        this.imSwitcher?.destroy();
        this.imSwitcher = null;
        this.autocmdManager?.destroy();
        this.autocmdManager = null;
        this.highlightManager?.destroy();
        this.highlightManager = null;
        this.luaDeactivateRuntimeEx?.();
        this.luaDeactivateRuntimeEx = null;
        this.bufferKeymapManager?.destroy();
        this.bufferKeymapManager = null;
        this.oilKeybindingManager?.destroy();
        this.oilKeybindingManager = null;
        if (this.oilManager) {
            this.oilManager.cleanup();
        }
        this.oilManager = null;
        if (this.luaState) {
            destroyState(this.luaState);
            this.luaState = null;
        }
        uninstallVimBridge();
        this.app.workspace.trigger('parse-style-settings');
    }

    async loadSettings() {
        const data = (await this.loadData()) as
            | (Partial<VimMotionsSettings> & {
                  enableVimrc?: boolean;
                  enableLuaConfig?: boolean;
              })
            | null;
        const migrated = migrateSigncolumnSettings(
            migrateConfigModeSettings(data),
        );
        this.settings = Object.assign({}, DEFAULT_SETTINGS, migrated ?? {});
        this.migrateLegacySettings(migrated);
    }

    private migrateLegacySettings(raw: Record<string, unknown> | null): void {
        if (!raw) return;
        if (
            'suppressTableWidget' in raw &&
            typeof raw.suppressTableWidget === 'boolean'
        ) {
            this.settings.tableWidgetMode = raw.suppressTableWidget
                ? 'always'
                : 'off';
        }
        delete (this.settings as unknown as Record<string, unknown>)
            .formattingMarkMode;
    }

    private activateUndoTreeForFile(filePath: string | null): void {
        if (!this.settings.enableUndoTree) return;
        if (!filePath) {
            this.undoTree = new UndoTree(this.settings.undoTreeMaxNodes);
            this.refreshUndoTreeViews();
            return;
        }

        const existing = this.undoTreeMap.get(filePath);
        if (existing) {
            if (this.undoTree !== existing) {
                this.undoTree = existing;
                this.refreshUndoTreeViews();
            }
            return;
        }

        let tree: UndoTree | null = null;
        if (this.settings.undoFile) {
            const persisted = this.settings.persistedUndoTrees?.[filePath];
            if (persisted) {
                tree = UndoTree.deserialize(
                    persisted,
                    this.settings.undoTreeMaxNodes,
                );
            }
        }

        if (!tree) {
            tree = new UndoTree(this.settings.undoTreeMaxNodes);
        }

        this.undoTreeMap.set(filePath, tree);
        this.undoTree = tree;
        this.refreshUndoTreeViews();
    }

    private markUndoTreeDirty(): void {
        if (!this.settings.undoFile) return;
        const filePath =
            this.activeUndoFilePath ??
            this.app.workspace.getActiveFile()?.path ??
            null;
        if (!filePath) return;
        this.undoTreeMap.set(filePath, this.undoTree);
        this.undoTreeDirtyPaths.add(filePath);
        this.undoTreeSaveDirty = true;
    }

    private navigateUndoTreeTo(fromSeq: number, toSeq: number): void {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;
        const editorView = getEditorView(view);
        if (!editorView) return;

        const path = this.undoTree.computePath(fromSeq, toSeq);
        if (!path) return;

        this.undoTree.setNavigating(true);
        try {
            for (const node of path.up) {
                if (!node.inverseChangeSet) continue;
                editorView.dispatch({
                    changes: node.inverseChangeSet as ChangeSet,
                    annotations: [Transaction.addToHistory.of(false)],
                });
            }
            for (const node of path.down) {
                if (!node.changeSet) continue;
                editorView.dispatch({
                    changes: node.changeSet as ChangeSet,
                    annotations: [Transaction.addToHistory.of(false)],
                });
            }
        } finally {
            this.undoTree.setNavigating(false);
        }
        this.markUndoTreeDirty();
        this.refreshUndoTreeViews();
    }

    private persistUndoTreeForFile(filePath: string): void {
        if (!this.settings.undoFile) return;
        const tree = this.undoTreeMap.get(filePath);
        if (!tree) return;

        const serialized = tree.serialize();
        const persisted = { ...this.settings.persistedUndoTrees };
        delete persisted[filePath];
        persisted[filePath] = serialized;
        this.settings.persistedUndoTrees =
            this.capPersistedUndoTrees(persisted);
        this.undoTreeDirtyPaths.delete(filePath);
        this.undoTreeSaveDirty = this.undoTreeDirtyPaths.size > 0;
    }

    private persistDirtyUndoTrees(): void {
        if (!this.settings.undoFile) return;
        for (const filePath of [...this.undoTreeDirtyPaths]) {
            this.persistUndoTreeForFile(filePath);
        }
    }

    private capPersistedUndoTrees(
        trees: Record<string, SerializedUndoTree>,
    ): Record<string, SerializedUndoTree> {
        const keys = Object.keys(trees);
        if (keys.length <= MAX_PERSISTED_UNDO_TREES) return trees;
        const next = { ...trees };
        const overflow = keys.length - MAX_PERSISTED_UNDO_TREES;
        for (let i = 0; i < overflow; i++) {
            const key = keys[i];
            if (key) delete next[key];
        }
        const serializedSize = JSON.stringify(next).length;
        if (serializedSize > 10_000_000) {
            console.warn(
                `[vim-motions] Persisted undo tree data is ${(serializedSize / 1_000_000).toFixed(1)}MB. Consider reducing undoTreeMaxNodes.`,
            );
        }
        return next;
    }

    async toggleUndoTreeView(): Promise<void> {
        const leaves = this.app.workspace.getLeavesOfType(UNDO_TREE_VIEW_TYPE);
        if (leaves.length > 0) {
            for (const leaf of leaves) {
                leaf.detach();
            }
        } else {
            const leaf =
                this.settings.undoTreePosition === 'left'
                    ? this.app.workspace.getLeftLeaf(false)
                    : this.app.workspace.getRightLeaf(false);
            if (leaf) {
                await leaf.setViewState({
                    type: UNDO_TREE_VIEW_TYPE,
                    active: true,
                });
                await this.app.workspace.revealLeaf(leaf);
            }
        }
    }

    private refreshUndoTreeViews(): void {
        for (const leaf of this.app.workspace.getLeavesOfType(
            UNDO_TREE_VIEW_TYPE,
        )) {
            if (leaf.view instanceof UndoTreeView) {
                leaf.view.refresh();
            }
        }
    }

    async saveSettings() {
        const toSave: VimMotionsSettings = {
            ...this.settings,
            modePrompts: { ...this.settings.modePrompts },
            cursorShapes: { ...this.settings.cursorShapes },
        };
        const overrideKeys = new Set([
            ...this.vimrcOverrides.keys(),
            ...this.luaOverrides.keys(),
        ]);
        for (const key of overrideKeys) {
            if (key.startsWith('modePrompts.')) {
                const mode = key.replace(
                    'modePrompts.',
                    '',
                ) as keyof VimMotionsSettings['modePrompts'];
                toSave.modePrompts[mode] =
                    this.preVimrcSettings.modePrompts[mode];
                continue;
            }
            if (key === 'cursorShapes') {
                toSave.cursorShapes = { ...this.preVimrcSettings.cursorShapes };
                continue;
            }
            if (key in this.preVimrcSettings) {
                (toSave as unknown as Record<string, unknown>)[key] = (
                    this.preVimrcSettings as unknown as Record<string, unknown>
                )[key];
            }
        }
        await this.saveData(toSave);
    }
}
