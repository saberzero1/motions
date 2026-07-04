import { MarkdownView, Notice, Platform, Plugin } from 'obsidian';
import {
    DEFAULT_SETTINGS,
    CommandLabel,
    GroupLabel,
    VimMotionsSettings,
    VimMotionsSettingTab,
} from './settings';

import { registerEasyMotion } from './easymotion/register';
import {
    registerNavigationMotions,
    registerTableMotions,
    registerTableActions,
    registerBufferNavigation,
} from './motions/register';
import { registerOperators } from './operators/register';
import { createSmartOpenLineAction } from './actions/open-line';
import { registerTextObjects } from './text-objects/register';
import { VimModeTracker } from './vim/mode-tracker';
import { ScrolloffManager, createScrolloffExtension } from './vim/scrolloff';
import { loadVimrc, applyVimrcMaps } from './vimrc/loader';
import type { VimrcLoadResult } from './vimrc/loader';
import { registerExCommands, registerObCommand } from './workspace/commands';
import { registerWorkspaceNavigation } from './workspace/navigation';
import { GlobalKeyHandler } from './workspace/global-key-handler';
import { GlobalMappingRegistry } from './workspace/global-mapping-registry';
import type { DeferredGlobalMap } from './vimrc/loader';
import { registerDefaultGlobalMappings } from './workspace/global-defaults';
import { GlobalWhichKeyOverlay } from './ui/global-which-key';
import { getVimApi, isVimEnabled, getCmAdapter } from './vim/vim-api';
import {
    createBundledVimExtension,
    installVimBridge,
    uninstallVimBridge,
    isBundledVimActive,
} from './vim/bundled-vim';
import { ExCommandSuggest } from './ui/ex-suggest';
import { createHintActions } from './ui/hint-mode';
import { LeaderRegistry, WhichKeyOverlay } from './ui/which-key';
import { InsertEscapeHandler } from './vim/insert-escape';
import { registerVimOptions } from './vim/options';
import { VimRegistration } from './vim/registration';
import {
    ChangeList,
    createOlderChangeMotion,
    createNewerChangeMotion,
} from './vim/changelist';
import { VimInfoModal } from './ui/vim-info-modal';
import { installTableWidgetSuppressor } from './vim/table-widget-suppressor';
import {
    tableRenderField,
    setTableRenderEnabled,
} from './vim/table-render-widget';
import { createTableAutoFormatExtension } from './vim/table-auto-format';
import {
    installTableCursorFix,
    createTableCursorFixExtension,
} from './vim/table-cursor-fix';
import { EditorView } from '@codemirror/view';
import {
    setFormattingMarkMode,
    createFormattingTransactionFilter,
} from './vim/formatting-mark-fix';

export default class VimMotionsPlugin extends Plugin {
    settings!: VimMotionsSettings;
    registration: VimRegistration | null = null;
    leaderRegistry: LeaderRegistry | null = null;
    changeList: ChangeList = new ChangeList();
    modeTracker: VimModeTracker | null = null;
    scrolloffManager: ScrolloffManager | null = null;
    insertEscapeHandler: InsertEscapeHandler | null = null;
    whichKeyOverlay: WhichKeyOverlay | null = null;
    private uninstallTableSuppressor: (() => void) | null = null;
    private uninstallTableCursorFix: (() => void) | null = null;
    exSuggest: ExCommandSuggest | null = null;
    private globalKeyHandler: GlobalKeyHandler | null = null;
    private globalRegistry: GlobalMappingRegistry | null = null;
    private globalWhichKeyOverlay: GlobalWhichKeyOverlay | null = null;
    private vimrcGlobalMaps: DeferredGlobalMap[] = [];
    private vimrcGlobalUnmaps: string[] = [];
    private vimrcGlobalWhichKeyLabels: Array<{ key: string; label: string }> =
        [];
    private vimrcGlobalWhichKeyGroups: Array<{ key: string; label: string }> =
        [];
    private hintWindowCleanups: Array<() => void> = [];
    private hintWindowDocs = new Set<Document>();
    private vimrcLoading = false;
    private vimrcMaps: VimrcLoadResult['maps'] = [];
    vimrcOverrides: Map<string, string> = new Map();
    preVimrcSettings!: VimMotionsSettings;
    vimrcGroupLabels: GroupLabel[] = [];
    vimrcCommandLabels: CommandLabel[] = [];
    vimrcLoaded = false;
    vimrcRetried = false;
    vimrcCommandCount = 0;

    async onload() {
        await this.loadSettings();

        const builtinVimOn = isVimEnabled(
            this.app as unknown as {
                vault: { getConfig: (key: string) => unknown };
            },
        );

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
        this.preVimrcSettings = { ...this.settings };
        this.vimrcGroupLabels = [];
        this.vimrcCommandLabels = [];
        const onSettingOverride = (
            key: string,
            value: unknown,
            directive?: string,
        ) => {
            let applied = false;
            if (key === 'cursorShapes') {
                Object.assign(
                    this.settings.cursorShapes,
                    value as Partial<typeof this.settings.cursorShapes>,
                );
                this.vimrcOverrides.set(key, directive ?? 'set guicursor');
                applied = true;
            } else if (key.startsWith('modePrompts.')) {
                const mode = key.replace(
                    'modePrompts.',
                    '',
                ) as keyof VimMotionsSettings['modePrompts'];
                if (typeof value === 'string') {
                    this.settings.modePrompts[mode] = value;
                    this.vimrcOverrides.set(
                        key,
                        directive ?? `let g:mode_prompt_${mode} = ${value}`,
                    );
                    applied = true;
                }
            } else if (key === 'whichKeyGroupLabel') {
                const entry = value as GroupLabel;
                if (entry?.key && entry.label) {
                    this.vimrcGroupLabels.push(entry);
                    this.vimrcOverrides.set(
                        `whichKeyGroupLabel:${entry.key}`,
                        directive ??
                            `whichkeygroup ${entry.key} ${entry.label}`,
                    );
                    applied = true;
                }
            } else if (key === 'whichKeyCommandLabel') {
                const entry = value as CommandLabel;
                if (entry?.key && entry.label) {
                    this.vimrcCommandLabels.push(entry);
                    this.vimrcOverrides.set(
                        `whichKeyCommandLabel:${entry.key}`,
                        directive ??
                            `whichkeylabel ${entry.key} ${entry.label}`,
                    );
                    applied = true;
                }
            } else if (key in this.settings) {
                (this.settings as unknown as Record<string, unknown>)[key] =
                    value;
                this.vimrcOverrides.set(key, directive ?? `set ${key}`);
                applied = true;
            }

            if (applied && !this.vimrcLoading) {
                this.reloadFeatures();
            }
        };

        // --- Vim API setup ---
        // resetKeymap() is a fork-only method; guard against the built-in
        // Vim API which does not expose it.
        if (typeof vim.resetKeymap === 'function') {
            vim.resetKeymap();
        }
        registerVimOptions(vim, onSettingOverride);
        this.registration = new VimRegistration(vim);

        // --- Leader key resolution ---
        this.leaderRegistry = new LeaderRegistry();
        if (this.settings.enableVimrc) {
            this.registerEvent(
                this.app.workspace.on('active-leaf-change', async () => {
                    this.resetVimInputStateOnPaneSwitch(vim);

                    if (this.vimrcLoaded) {
                        applyVimrcMaps(vim, this.vimrcMaps);
                        return;
                    }
                    if (this.vimrcLoading) return;
                    this.vimrcLoading = true;
                    const customVimrcPath =
                        this.settings.vimrcPath || undefined;
                    let vimrcResult = await loadVimrc(
                        this.app,
                        vim,
                        this.leaderRegistry ?? undefined,
                        onSettingOverride,
                        customVimrcPath,
                    );
                    for (
                        let attempt = 0;
                        !vimrcResult.ready && attempt < 10;
                        attempt++
                    ) {
                        await new Promise((r) => window.setTimeout(r, 100));
                        vimrcResult = await loadVimrc(
                            this.app,
                            vim,
                            this.leaderRegistry ?? undefined,
                            onSettingOverride,
                            customVimrcPath,
                        );
                        this.vimrcRetried = true;
                    }
                    this.vimrcCommandCount = vimrcResult.commandCount;
                    if (!vimrcResult.ready) {
                        this.vimrcLoading = false;
                        return;
                    }
                    if (!vimrcResult.found) {
                        new Notice(
                            `Vim Motions: ${vimrcResult.path} not found. Create the file in your vault root to use custom key mappings.`,
                        );
                    } else if (vimrcResult.commandCount === 0) {
                        new Notice(
                            `Vim Motions: ${vimrcResult.path} loaded but contained no commands.`,
                        );
                    } else {
                        new Notice(
                            `Vim Motions: loaded ${vimrcResult.commandCount} command${vimrcResult.commandCount === 1 ? '' : 's'} from ${vimrcResult.path}.`,
                        );
                    }
                    this.vimrcMaps = vimrcResult.maps;
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
                    if (this.vimrcMaps.length > 0) {
                        window.setTimeout(() => {
                            applyVimrcMaps(vim, this.vimrcMaps);
                        }, 200);
                    }
                    this.vimrcLoading = false;
                    this.reloadFeatures();
                }),
            );
        }

        // --- Core ex command (needed by leader bindings) ---
        registerObCommand(this.registration, this.app);

        // --- Action overrides (unconditional, setting checked at runtime) ---
        this.registration.defineActionOverride(
            'newLineAndEnterInsertMode',
            (original) =>
                createSmartOpenLineAction(
                    original,
                    () => this.settings.listContinuationOnOpen,
                ),
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
        if (this.settings.enableWorkspaceNav) {
            registerWorkspaceNavigation(
                this.registration,
                this.app,
                this.leaderRegistry,
            );
            registerExCommands(
                this.registration,
                this.app,
                vim,
                this.globalRegistry ?? undefined,
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
            );
            this.globalKeyHandler = new GlobalKeyHandler(
                this.app,
                this.settings,
                this.modeTracker,
                this.globalRegistry,
            );
            this.globalKeyHandler.install();
            this.rebuildGlobalWhichKey();
        }

        // --- Settings tab ---
        this.addSettingTab(new VimMotionsSettingTab(this.app, this));

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

        setTableRenderEnabled(this.settings.tableWidgetMode === 'cursor');
        this.registerEditorExtension(tableRenderField);

        if (this.settings.enableTableNav) {
            this.registerEditorExtension(
                createTableAutoFormatExtension(this.app),
            );
            this.registerEditorExtension(createTableCursorFixExtension());
            this.uninstallTableCursorFix = installTableCursorFix();
        }

        setFormattingMarkMode(this.settings.formattingMarkMode ?? 'cursor');
        this.registerEditorExtension(createFormattingTransactionFilter());

        this.app.workspace.trigger('parse-style-settings');
    }

    reloadFeatures(): void {
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
        registerObCommand(this.registration, this.app);

        this.registration.defineActionOverride(
            'newLineAndEnterInsertMode',
            (original) =>
                createSmartOpenLineAction(
                    original,
                    () => this.settings.listContinuationOnOpen,
                ),
        );

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
        if (this.settings.enableWorkspaceNav && this.leaderRegistry) {
            registerWorkspaceNavigation(
                this.registration,
                this.app,
                this.leaderRegistry,
            );
            registerExCommands(
                this.registration,
                this.app,
                vim,
                this.globalRegistry ?? undefined,
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
        this.registration.map('Y', 'y$', 'normal');
        this.registration.map('Q', '@@', 'normal');

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
            );
            this.applyGlobalMaps();
            this.globalKeyHandler = new GlobalKeyHandler(
                this.app,
                this.settings,
                this.modeTracker,
                this.globalRegistry,
            );
            this.globalKeyHandler.install();
            this.rebuildGlobalWhichKey();
        }

        this.scrolloffManager?.setup(this.settings.scrolloffLines);

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

        this.uninstallTableCursorFix?.();
        this.uninstallTableCursorFix = null;
        this.uninstallTableSuppressor?.();
        this.uninstallTableSuppressor = null;
        if (this.settings.tableWidgetMode !== 'off') {
            this.uninstallTableSuppressor = installTableWidgetSuppressor(
                this.app,
                this.settings.tableWidgetMode,
            );
        }
        setTableRenderEnabled(this.settings.tableWidgetMode === 'cursor');
        if (this.settings.enableTableNav) {
            this.uninstallTableCursorFix = installTableCursorFix();
        }
        setFormattingMarkMode(this.settings.formattingMarkMode ?? 'cursor');
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
        const groupLabels = new Map<string, string>();
        for (const [key, label] of registryLabels) {
            groupLabels.set(leaderKey + key, label);
        }
        for (const entry of this.settings.whichKeyGroupLabels) {
            if (entry.key && entry.label) {
                const expandedKey = entry.key
                    .trim()
                    .replace(/<leader>/gi, leaderKey);
                groupLabels.set(expandedKey, entry.label);
            }
        }
        for (const entry of this.vimrcGroupLabels) {
            if (entry.key && entry.label) {
                groupLabels.set(entry.key, entry.label);
            }
        }

        const commandLabels = new Map<string, string>();
        for (const entry of this.settings.whichKeyCommandLabels) {
            if (entry.key && entry.label) {
                const expandedKey = entry.key
                    .trim()
                    .replace(/<leader>/gi, leaderKey);
                commandLabels.set(expandedKey, entry.label);
            }
        }
        for (const entry of this.vimrcCommandLabels) {
            if (entry.key && entry.label) {
                commandLabels.set(entry.key, entry.label);
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
            );
        }
        if (this.settings.enableHintMode && !Platform.isMobile) {
            this.registerHintActions(this.registration, this.leaderRegistry);
        }
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
        const leader = leaderRegistry.getLeaderKey();
        const hintKeys = leader + leader + 'h';
        reg.mapCommand(hintKeys, 'action', 'hintMode', {});
        leaderRegistry.addBinding(hintKeys, 'Hint mode', 'builtin');
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
            this.globalRegistry.addMapping(gm.lhs, action, {
                source: 'user',
                gate: 'standard',
            });
        }
        for (const key of this.vimrcGlobalUnmaps) {
            this.globalRegistry.removeMapping(key);
        }
        for (const entry of this.vimrcGlobalWhichKeyLabels) {
            this.globalRegistry.setLabel(entry.key, entry.label);
        }
        for (const entry of this.vimrcGlobalWhichKeyGroups) {
            this.globalRegistry.setGroupLabel(entry.key, entry.label);
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

        const commandLabels = new Map<string, string>();
        for (const entry of this.vimrcGlobalWhichKeyLabels) {
            commandLabels.set(entry.key, entry.label);
        }

        const groupLabels = new Map<string, string>();
        for (const entry of this.vimrcGlobalWhichKeyGroups) {
            groupLabels.set(entry.key, entry.label);
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

    onunload() {
        this.globalWhichKeyOverlay?.destroy();
        this.globalWhichKeyOverlay = null;
        this.globalKeyHandler?.destroy();
        this.globalKeyHandler = null;
        this.globalRegistry = null;
        this.cleanupHintModeWindows();
        this.uninstallTableCursorFix?.();
        this.uninstallTableCursorFix = null;
        this.uninstallTableSuppressor?.();
        this.uninstallTableSuppressor = null;
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
        uninstallVimBridge();
        this.app.workspace.trigger('parse-style-settings');
    }

    async loadSettings() {
        const raw = (await this.loadData()) as Record<string, unknown> | null;
        this.settings = Object.assign(
            {},
            DEFAULT_SETTINGS,
            raw as Partial<VimMotionsSettings>,
        );
        this.migrateLegacySettings(raw);
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
        if (this.settings.formattingMarkMode === ('always' as string)) {
            this.settings.formattingMarkMode = 'cursor';
        }
    }

    async saveSettings() {
        const toSave: VimMotionsSettings = {
            ...this.settings,
            modePrompts: { ...this.settings.modePrompts },
            cursorShapes: { ...this.settings.cursorShapes },
        };
        for (const [key] of this.vimrcOverrides) {
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
