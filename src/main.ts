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
import { setupScrolloff } from './vim/scrolloff';
import { loadVimrc } from './vimrc/loader';
import { registerExCommands } from './workspace/commands';
import { registerWorkspaceNavigation } from './workspace/navigation';
import { getVimApi, isVimEnabled } from './vim/vim-api';
import { ExCommandSuggest } from './ui/ex-suggest';
import { LeaderRegistry, WhichKeyOverlay } from './ui/which-key';
import { InsertEscapeHandler } from './vim/insert-escape';
import { registerVimOptions } from './vim/options';
import { VimRegistration } from './vim/registration';

export default class VimMotionsPlugin extends Plugin {
    settings!: VimMotionsSettings;
    registration: VimRegistration | null = null;
    modeTracker: VimModeTracker | null = null;
    insertEscapeHandler: InsertEscapeHandler | null = null;
    whichKeyOverlay: WhichKeyOverlay | null = null;
    exSuggest: ExCommandSuggest | null = null;

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

        registerVimOptions(vim);
        this.registration = new VimRegistration(vim);

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
            registerWorkspaceNavigation(this.registration, this.app);
            registerExCommands(this.registration, this.app, vim);
        }

        if (this.settings.enableEasyMotion) {
            registerEasyMotion(
                this.registration,
                this.app,
                this.settings.easyMotionLabels,
            );
        }

        if (this.settings.enableStatusBar) {
            this.modeTracker = new VimModeTracker(this);
            this.modeTracker.attach(this.app);
        }

        if (this.settings.scrolloffLines > 0) {
            setupScrolloff(this, this.app, this.settings.scrolloffLines);
        }

        this.addSettingTab(new VimMotionsSettingTab(this.app, this));

        const leaderRegistry = new LeaderRegistry();
        if (this.settings.enableVimrc) {
            await loadVimrc(this.app, vim, leaderRegistry);
        }

        for (const binding of this.settings.leaderBindings) {
            if (binding.key && binding.commandId) {
                const leaderKey = leaderRegistry.getLeaderKey();
                const lhs = leaderKey + binding.key;
                vim.map(lhs, ':ob ' + binding.commandId);
                leaderRegistry.addBinding(lhs, ':ob ' + binding.commandId);
            }
        }

        this.insertEscapeHandler = new InsertEscapeHandler(this.app, vim);
        this.insertEscapeHandler.attach();

        const editorContainerEl = (
            this.app as unknown as { workspace: { containerEl: HTMLElement } }
        ).workspace.containerEl;
        if (editorContainerEl && this.registration) {
            this.exSuggest = new ExCommandSuggest(
                this.registration.getExCommandNames(),
            );
            this.exSuggest.attach(editorContainerEl);
        }

        if (leaderRegistry.getBindings().length > 0) {
            this.whichKeyOverlay = new WhichKeyOverlay(
                this.app,
                leaderRegistry.getLeaderKey(),
                leaderRegistry.getBindings(),
            );
            this.whichKeyOverlay.attach();
        }
    }

    reloadFeatures(): void {
        this.modeTracker?.destroy();
        this.modeTracker = null;
        this.registration?.unregisterAll();

        const vim = getVimApi();
        if (!vim) return;

        this.registration = new VimRegistration(vim);
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
            registerWorkspaceNavigation(this.registration, this.app);
            registerExCommands(this.registration, this.app, vim);
        }
        if (this.settings.enableEasyMotion) {
            registerEasyMotion(
                this.registration,
                this.app,
                this.settings.easyMotionLabels,
            );
        }
        if (this.settings.enableStatusBar) {
            this.modeTracker = new VimModeTracker(this);
            this.modeTracker.attach(this.app);
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
