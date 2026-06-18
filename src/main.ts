import { Notice, Plugin } from 'obsidian';
import {
    DEFAULT_SETTINGS,
    VimMotionsSettings,
    VimMotionsSettingTab,
} from './settings';

import { registerEasyMotion } from './easymotion/easymotion';
import {
    registerNavigationMotions,
    registerTableMotions,
    registerBufferNavigation,
} from './motions/register';
import { registerOperators } from './operators/register';
import { registerTextObjects } from './text-objects/register';
import { VimModeTracker } from './vim/mode-tracker';
import { ScrolloffManager } from './vim/scrolloff';
import { loadVimrc, applyVimrcMaps } from './vimrc/loader';
import type { VimrcLoadResult } from './vimrc/loader';
import type { VimApi } from './types/vim-api';
import { registerExCommands, registerObCommand } from './workspace/commands';
import { registerWorkspaceNavigation } from './workspace/navigation';
import { getVimApi, isVimEnabled } from './vim/vim-api';
import { ExCommandSuggest } from './ui/ex-suggest';
import { LeaderRegistry, WhichKeyOverlay } from './ui/which-key';
import { InsertEscapeHandler } from './vim/insert-escape';
import { registerVimOptions, syncTextwidthFromVim } from './vim/options';
import { VimRegistration } from './vim/registration';
import {
    ChangeList,
    createOlderChangeMotion,
    createNewerChangeMotion,
} from './vim/changelist';
import { VimInfoModal } from './ui/vim-info-modal';
import { EditorView } from '@codemirror/view';

export default class VimMotionsPlugin extends Plugin {
    settings!: VimMotionsSettings;
    registration: VimRegistration | null = null;
    leaderRegistry: LeaderRegistry | null = null;
    changeList: ChangeList = new ChangeList();
    modeTracker: VimModeTracker | null = null;
    scrolloffManager: ScrolloffManager | null = null;
    insertEscapeHandler: InsertEscapeHandler | null = null;
    whichKeyOverlay: WhichKeyOverlay | null = null;
    exSuggest: ExCommandSuggest | null = null;
    private vimrcLoading = false;
    private vimrcMaps: VimrcLoadResult['maps'] = [];
    vimrcLoaded = false;

    async onload() {
        await this.loadSettings();

        if (
            !isVimEnabled(
                this.app as unknown as {
                    vault: { getConfig: (key: string) => unknown };
                },
            )
        ) {
            new Notice(
                'Vim motions requires vim mode. Enable it in settings → editor → vim key bindings.',
            );
            return;
        }

        const vim = getVimApi();
        if (!vim) {
            return;
        }

        // --- Vim API setup ---
        registerVimOptions(vim);
        this.registration = new VimRegistration(vim);

        // --- Leader key resolution ---
        this.leaderRegistry = new LeaderRegistry();
        if (this.settings.enableVimrc) {
            this.registerEvent(
                this.app.workspace.on('active-leaf-change', async () => {
                    if (this.vimrcLoaded) {
                        applyVimrcMaps(vim, this.vimrcMaps);
                        return;
                    }
                    if (this.vimrcLoading) return;
                    this.vimrcLoading = true;
                    const vimrcResult = await loadVimrc(
                        this.app,
                        vim,
                        this.leaderRegistry ?? undefined,
                    );
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
                    syncTextwidthFromVim(vim);
                    this.reapplySettingsLeaderBindings(vim);
                    this.rebuildWhichKey();
                    this.vimrcLoaded = true;
                }),
            );
        }

        // --- Core ex command (needed by leader bindings) ---
        registerObCommand(this.registration, this.app);

        // --- Feature registrations ---
        if (this.settings.enableTextObjects) {
            registerTextObjects(this.registration);
        }
        if (this.settings.enableNavigation) {
            registerNavigationMotions(this.registration);
            registerBufferNavigation(this.registration, this.app);
        }
        if (this.settings.enableTableNav) {
            registerTableMotions(this.registration);
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
            registerExCommands(this.registration, this.app, vim);
        }
        if (this.settings.enableEasyMotion) {
            registerEasyMotion(
                this.registration,
                this.app,
                this.settings.easyMotionLabels,
                this.leaderRegistry,
            );
        }

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
            this.modeTracker = new VimModeTracker(this);
            this.modeTracker.attach(this.app);
        }
        this.scrolloffManager = new ScrolloffManager(this, this.app);
        this.scrolloffManager.setup(this.settings.scrolloffLines);

        // --- Settings tab ---
        this.addSettingTab(new VimMotionsSettingTab(this.app, this));

        // --- Leader bindings from settings UI ---
        for (const binding of this.settings.leaderBindings) {
            if (binding.key && binding.commandId) {
                const leaderKey = this.leaderRegistry.getLeaderKey();
                const lhs = leaderKey + binding.key;
                vim.map(lhs, ':ob ' + binding.commandId);
                this.leaderRegistry.addBinding(lhs, ':ob ' + binding.commandId);
            }
        }

        // --- Insert escape handler ---
        this.insertEscapeHandler = new InsertEscapeHandler(this.app, vim);
        this.insertEscapeHandler.attach();

        // --- Ex command suggest ---
        this.rebuildExSuggest();

        // --- Which-key overlay ---
        this.rebuildWhichKey();
    }

    reloadFeatures(): void {
        this.modeTracker?.destroy();
        this.modeTracker = null;
        this.registration?.unregisterAll();
        this.leaderRegistry?.clearBuiltinBindings();

        const vim = getVimApi();
        if (!vim) return;

        this.registration = new VimRegistration(vim);

        // :ob must be re-registered unconditionally (unregisterAll noops it)
        registerObCommand(this.registration, this.app);

        if (this.settings.enableTextObjects) {
            registerTextObjects(this.registration);
        }
        if (this.settings.enableNavigation) {
            registerNavigationMotions(this.registration);
            registerBufferNavigation(this.registration, this.app);
        }
        if (this.settings.enableTableNav) {
            registerTableMotions(this.registration);
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
            registerExCommands(this.registration, this.app, vim);
        }
        if (this.settings.enableEasyMotion && this.leaderRegistry) {
            registerEasyMotion(
                this.registration,
                this.app,
                this.settings.easyMotionLabels,
                this.leaderRegistry,
            );
        }
        this.registration.map('Y', 'y$', 'normal');
        this.registration.map('Q', '@@', 'normal');

        if (this.settings.enableStatusBar) {
            this.modeTracker = new VimModeTracker(this);
            this.modeTracker.attach(this.app);
        }

        this.scrolloffManager?.setup(this.settings.scrolloffLines);

        this.rebuildExSuggest();
        this.rebuildWhichKey();
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

        if (this.leaderRegistry) {
            const bindings = this.leaderRegistry.getBindings();
            if (bindings.length > 0) {
                this.whichKeyOverlay = new WhichKeyOverlay(
                    this.app,
                    this.leaderRegistry.getLeaderKey(),
                    bindings,
                );
                this.whichKeyOverlay.attach();
            }
        }
    }

    private reapplySettingsLeaderBindings(vim: VimApi): void {
        if (!this.leaderRegistry) return;
        const leaderKey = this.leaderRegistry.getLeaderKey();
        for (const binding of this.settings.leaderBindings) {
            if (!binding.key || !binding.commandId) continue;
            const oldLhs = '\\' + binding.key;
            try {
                vim.unmap(oldLhs);
            } catch {
                /* old binding may not exist */
            }
            const lhs = leaderKey + binding.key;
            vim.map(lhs, ':ob ' + binding.commandId);
            this.leaderRegistry.addBinding(lhs, ':ob ' + binding.commandId);
        }
    }

    onunload() {
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
    }

    async loadSettings() {
        this.settings = Object.assign(
            {},
            DEFAULT_SETTINGS,
            (await this.loadData()) as Partial<VimMotionsSettings>,
        );
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}
