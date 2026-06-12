import {
    App,
    PluginSettingTab,
    Setting,
    SuggestModal,
    TextComponent,
} from 'obsidian';
import VimMotionsPlugin from './main';

export interface LeaderBinding {
    key: string;
    commandId: string;
}

export interface VimMotionsSettings {
    enableTextObjects: boolean;
    enableNavigation: boolean;
    enableWorkspaceNav: boolean;
    enableVimrc: boolean;
    enableStatusBar: boolean;
    enableEasyMotion: boolean;
    enableHardWrap: boolean;
    enableTableNav: boolean;
    scrolloffLines: number;
    easyMotionLabels: string;
    leaderBindings: LeaderBinding[];
}

export const DEFAULT_SETTINGS: VimMotionsSettings = {
    enableTextObjects: true,
    enableNavigation: true,
    enableWorkspaceNav: true,
    enableVimrc: true,
    enableStatusBar: true,
    enableEasyMotion: true,
    enableHardWrap: true,
    enableTableNav: true,
    scrolloffLines: 5,
    easyMotionLabels: 'asdghklqwertyuiopzxcvbnmfj',
    leaderBindings: [],
};

interface ObsidianCommand {
    id: string;
    name: string;
}

class CommandPickerModal extends SuggestModal<ObsidianCommand> {
    private commands: ObsidianCommand[];
    private onPick: (cmd: ObsidianCommand) => void;

    constructor(app: App, onPick: (cmd: ObsidianCommand) => void) {
        super(app);
        this.onPick = onPick;
        const allCommands = (
            app as unknown as {
                commands: {
                    commands: Record<string, { id: string; name: string }>;
                };
            }
        ).commands.commands;
        this.commands = Object.values(allCommands).sort((a, b) =>
            a.name.localeCompare(b.name),
        );
        this.setPlaceholder('Search commands\u2026');
    }

    getSuggestions(query: string): ObsidianCommand[] {
        const lower = query.toLowerCase();
        return this.commands.filter(
            (c) =>
                c.name.toLowerCase().includes(lower) ||
                c.id.toLowerCase().includes(lower),
        );
    }

    renderSuggestion(item: ObsidianCommand, el: HTMLElement): void {
        el.createEl('div', { text: item.name });
        el.createEl('small', { text: item.id, cls: 'u-muted' });
    }

    onChooseSuggestion(item: ObsidianCommand): void {
        this.onPick(item);
    }
}

export class VimMotionsSettingTab extends PluginSettingTab {
    plugin: VimMotionsPlugin;

    constructor(app: App, plugin: VimMotionsPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        new Setting(containerEl)
            .setName('Text objects')
            .setDesc('Enable Markdown-aware text objects (i*, a*, il, etc.)')
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableTextObjects)
                    .onChange(async (value) => {
                        this.plugin.settings.enableTextObjects = value;
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );

        new Setting(containerEl)
            .setName('Structural navigation')
            .setDesc(
                'Enable heading, list, and link navigation motions (]h, ]l, ]n, etc.)',
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableNavigation)
                    .onChange(async (value) => {
                        this.plugin.settings.enableNavigation = value;
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );

        new Setting(containerEl)
            .setName('Hard-wrap operator (gq)')
            .setDesc(
                'Enable gq operator to reformat paragraphs with Markdown-aware line wrapping.',
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableHardWrap)
                    .onChange(async (value) => {
                        this.plugin.settings.enableHardWrap = value;
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );

        new Setting(containerEl)
            .setName('Workspace navigation')
            .setDesc(
                'Enable pane/tab/sidebar control (<C-w>h/j/k/l, gt/gT, :sidebar, etc.)',
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableWorkspaceNav)
                    .onChange(async (value) => {
                        this.plugin.settings.enableWorkspaceNav = value;
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );

        new Setting(containerEl)
            .setName('Vim mode status bar')
            .setDesc(
                'Show current vim mode (normal, insert, visual) in the status bar.',
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableStatusBar)
                    .onChange(async (value) => {
                        this.plugin.settings.enableStatusBar = value;
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );

        new Setting(containerEl)
            /* eslint-disable-next-line obsidianmd/ui/sentence-case, obsidianmd/hardcoded-config-path -- .obsidian.vimrc is a user-facing file convention */
            .setName('Load .obsidian.vimrc')
            .setDesc(
                // eslint-disable-next-line obsidianmd/ui/sentence-case, obsidianmd/hardcoded-config-path -- .obsidian.vimrc is a user-facing file convention
                'Load key mappings and settings from .obsidian.vimrc in your vault root.',
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableVimrc)
                    .onChange(async (value) => {
                        this.plugin.settings.enableVimrc = value;
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(containerEl)
            .setName('Easymotion')
            .setDesc(
                'Enable easymotion/hop navigation (<leader><leader>w, <leader><leader>f, <leader><leader>j).',
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableEasyMotion)
                    .onChange(async (value) => {
                        this.plugin.settings.enableEasyMotion = value;
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );

        new Setting(containerEl)
            .setName('Table navigation')
            .setDesc(
                'Enable table cell navigation motions (]| and [| to move between cells).',
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableTableNav)
                    .onChange(async (value) => {
                        this.plugin.settings.enableTableNav = value;
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );

        new Setting(containerEl)
            .setName('Scrolloff lines')
            .setDesc(
                // eslint-disable-next-line obsidianmd/ui/sentence-case -- "cursor" is intentionally lowercase
                'Minimum visible lines above and below the cursor when scrolling (0 to disable).',
            )
            .addSlider((slider) =>
                slider
                    .setLimits(0, 20, 1)
                    .setValue(this.plugin.settings.scrolloffLines)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.scrolloffLines = value;
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(containerEl).setName('Leader key bindings').setHeading();
        new Setting(containerEl).setDesc(
            // eslint-disable-next-line obsidianmd/ui/sentence-case, obsidianmd/hardcoded-config-path -- .obsidian.vimrc is a user-facing file convention
            'Map leader key sequences to Obsidian commands. Applied in addition to .obsidian.vimrc bindings.',
        );

        const bindingsContainer = containerEl.createDiv({
            cls: 'vim-motions-leader-bindings',
        });
        this.renderLeaderBindings(bindingsContainer);
    }

    private renderLeaderBindings(container: HTMLElement): void {
        container.empty();
        const bindings = this.plugin.settings.leaderBindings;

        for (let i = 0; i < bindings.length; i++) {
            const binding = bindings[i];
            if (!binding) continue;
            const setting = new Setting(container)
                .addText((text: TextComponent) =>
                    text
                        .setPlaceholder('Key')
                        .setValue(binding.key)
                        .onChange(async (value) => {
                            binding.key = value.slice(0, 3);
                            await this.plugin.saveSettings();
                        }),
                )
                .addText((text: TextComponent) =>
                    text
                        .setPlaceholder('Command ID (e.g., switcher:open)')
                        .setValue(binding.commandId)
                        .onChange(async (value) => {
                            binding.commandId = value;
                            await this.plugin.saveSettings();
                        }),
                )
                .addExtraButton((button) =>
                    button
                        .setIcon('search')
                        .setTooltip('Browse commands')
                        .onClick(() => {
                            new CommandPickerModal(this.app, (cmd) => {
                                binding.commandId = cmd.id;
                                void this.plugin.saveSettings().then(() => {
                                    this.renderLeaderBindings(container);
                                });
                            }).open();
                        }),
                )
                .addExtraButton((button) =>
                    button
                        .setIcon('cross')
                        .setTooltip('Remove')
                        .onClick(async () => {
                            bindings.splice(i, 1);
                            await this.plugin.saveSettings();
                            this.renderLeaderBindings(container);
                        }),
                );
            setting.settingEl.addClass('vim-motions-leader-binding-row');
        }

        new Setting(container).addButton((button) =>
            button
                .setButtonText('Add binding')
                .setCta()
                .onClick(async () => {
                    bindings.push({ key: '', commandId: '' });
                    await this.plugin.saveSettings();
                    this.renderLeaderBindings(container);
                }),
        );
    }
}
