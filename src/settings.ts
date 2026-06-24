import {
    App,
    PluginSettingTab,
    setIcon,
    Setting,
    SuggestModal,
    TextComponent,
} from 'obsidian';
import VimMotionsPlugin from './main';

export function formatHotkey(serialized: string): string {
    if (!serialized) return '';
    const colonIdx = serialized.indexOf(':');
    if (colonIdx === -1) return serialized;
    const modPart = serialized.slice(0, colonIdx);
    const key = serialized.slice(colonIdx + 1);
    const mods = modPart
        .split(',')
        .filter(Boolean)
        .map((m) => m.charAt(0).toUpperCase() + m.slice(1));
    const keyDisplay =
        key === ' ' ? 'Space' : key.length === 1 ? key.toUpperCase() : key;
    return [...mods, keyDisplay].join('+');
}

export interface LeaderBinding {
    key: string;
    commandId: string;
}

export interface ModePrompts {
    normal: string;
    insert: string;
    visual: string;
    replace: string;
}

export const DEFAULT_MODE_PROMPTS: ModePrompts = {
    normal: 'NORMAL',
    insert: 'INSERT',
    visual: 'VISUAL',
    replace: 'REPLACE',
};

export interface VimMotionsSettings {
    enableTextObjects: boolean;
    enableNavigation: boolean;
    enableWorkspaceNav: boolean;
    enableVimrc: boolean;
    enableStatusBar: boolean;
    enableChordDisplay: boolean;
    enablePowerline: boolean;
    modePrompts: ModePrompts;
    enableEasyMotion: boolean;
    easyMotionDimming: boolean;
    enableHardWrap: boolean;
    enableTableNav: boolean;
    enableHintMode: boolean;
    hintModeLabels: string;
    hintModeHotkey: string;
    scrolloffLines: number;
    multilineScanLimit: number;
    easyMotionLabels: string;
    leaderBindings: LeaderBinding[];
}

export const DEFAULT_SETTINGS: VimMotionsSettings = {
    enableTextObjects: true,
    enableNavigation: true,
    enableWorkspaceNav: true,
    enableVimrc: true,
    enableStatusBar: true,
    enableChordDisplay: true,
    enablePowerline: false,
    modePrompts: { ...DEFAULT_MODE_PROMPTS },
    enableEasyMotion: true,
    easyMotionDimming: true,
    enableHardWrap: true,
    enableTableNav: true,
    enableHintMode: true,
    hintModeLabels: 'asdfghjkl',
    hintModeHotkey: '',
    scrolloffLines: 5,
    multilineScanLimit: 20,
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

        const builtinVimOn =
            (
                this.app.vault as unknown as {
                    getConfig: (key: string) => unknown;
                }
            ).getConfig('vimMode') === true;

        if (builtinVimOn) {
            const notice = containerEl.createDiv({
                cls: 'vim-motions-settings-notice',
            });
            const title = notice.createDiv({
                cls: 'vim-motions-notice-title',
            });
            const iconEl = title.createSpan();
            setIcon(iconEl, 'alert-triangle');
            title.createSpan({
                text: 'Recommended: disable built-in Vim mode',
            });
            notice.createEl('p', {
                text:
                    'Vim Motions includes an enhanced vim engine with Neovim-correct behavior, ' +
                    'operator-pending EasyMotion, and theme-aligned cursor styling. ' +
                    'These improvements are only active when Obsidian\u2019s built-in Vim mode is off.',
            });
            notice.createEl('p', {
                text: 'Go to Settings \u2192 Editor \u2192 Vim key bindings and turn it off, then reload Obsidian.',
            });
        }

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
                'Enable pane/tab/sidebar control (<C-w>h/j/k/l, gt/gT, :sidebar, etc.). Note: <C-w> may conflict with Obsidian\u2019s "Close current tab" hotkey \u2014 rebind it in Settings \u2192 Hotkeys.',
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
                'Show current Vim mode (normal, insert, visual) in the status bar.',
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
            .setName('Vim chord display')
            .setDesc(
                'Show pending keystrokes in the status bar as you type a command (e.g. "2d", "gq").',
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableChordDisplay)
                    .onChange(async (value) => {
                        this.plugin.settings.enableChordDisplay = value;
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );

        new Setting(containerEl)
            .setName('Powerline-style status bar')
            .setDesc(
                'Color the Vim mode indicator with per-mode background colors and a triangular separator.',
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enablePowerline)
                    .onChange(async (value) => {
                        this.plugin.settings.enablePowerline = value;
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );

        new Setting(containerEl)
            .setName('Vim mode display prompt')
            .setHeading();

        const prompts = this.plugin.settings.modePrompts;
        new Setting(containerEl)
            .setName('Normal mode prompt')
            .setDesc('Status bar text for normal mode.')
            .addText((text) =>
                text.setValue(prompts.normal).onChange(async (value) => {
                    this.plugin.settings.modePrompts.normal =
                        value || DEFAULT_MODE_PROMPTS.normal;
                    await this.plugin.saveSettings();
                    this.plugin.reloadFeatures();
                }),
            );
        new Setting(containerEl)
            .setName('Insert mode prompt')
            .setDesc('Status bar text for insert mode.')
            .addText((text) =>
                text.setValue(prompts.insert).onChange(async (value) => {
                    this.plugin.settings.modePrompts.insert =
                        value || DEFAULT_MODE_PROMPTS.insert;
                    await this.plugin.saveSettings();
                    this.plugin.reloadFeatures();
                }),
            );
        new Setting(containerEl)
            .setName('Visual mode prompt')
            .setDesc('Status bar text for visual mode.')
            .addText((text) =>
                text.setValue(prompts.visual).onChange(async (value) => {
                    this.plugin.settings.modePrompts.visual =
                        value || DEFAULT_MODE_PROMPTS.visual;
                    await this.plugin.saveSettings();
                    this.plugin.reloadFeatures();
                }),
            );
        new Setting(containerEl)
            .setName('Replace mode prompt')
            .setDesc('Status bar text for replace mode.')
            .addText((text) =>
                text.setValue(prompts.replace).onChange(async (value) => {
                    this.plugin.settings.modePrompts.replace =
                        value || DEFAULT_MODE_PROMPTS.replace;
                    await this.plugin.saveSettings();
                    this.plugin.reloadFeatures();
                }),
            );

        new Setting(containerEl)
            .setName(`Load ${this.app.vault.configDir}.vimrc`)
            .setDesc(
                `Load key mappings and settings from ${this.app.vault.configDir}.vimrc in your vault root.`,
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
            .setName('EasyMotion')
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
            .setName('EasyMotion dimming')
            .setDesc('Dim non-target text when EasyMotion is active.')
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.easyMotionDimming)
                    .onChange(async (value) => {
                        this.plugin.settings.easyMotionDimming = value;
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(containerEl)
            .setName('Table navigation')
            .setDesc(
                'Enable table cell navigation motions (]|/[| or ]c/[c to move between cells).',
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
            .setName('Hint mode')
            .setDesc(
                'Enable vimium-style link hints to click any UI element with the keyboard (<leader><leader>h).',
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableHintMode)
                    .onChange(async (value) => {
                        this.plugin.settings.enableHintMode = value;
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );

        new Setting(containerEl)
            .setName('Hint mode label characters')
            .setDesc(
                'Characters used for hint labels (home-row recommended). Fewer characters = longer labels.',
            )
            .addText((text) =>
                text
                    .setValue(this.plugin.settings.hintModeLabels)
                    .onChange(async (value) => {
                        this.plugin.settings.hintModeLabels =
                            value || 'asdfghjkl';
                        await this.plugin.saveSettings();
                    }),
            );

        const hotkeySettingItem = new Setting(containerEl)
            .setName('Hint mode global hotkey')
            .setDesc(
                'Key combination to trigger hint mode from anywhere, including modals. Click the button and press a key combination to set.',
            );

        const hotkeyDisplay = hotkeySettingItem.controlEl.createSpan({
            cls: 'setting-hotkey vim-motions-hotkey-display',
        });
        hotkeyDisplay.textContent = formatHotkey(
            this.plugin.settings.hintModeHotkey,
        );

        hotkeySettingItem.addButton((button) =>
            button.setButtonText('Record').onClick(() => {
                button.setButtonText('Press keys\u2026');
                const onKey = (e: KeyboardEvent) => {
                    if (
                        e.key === 'Shift' ||
                        e.key === 'Control' ||
                        e.key === 'Alt' ||
                        e.key === 'Meta'
                    )
                        return;
                    e.preventDefault();
                    e.stopPropagation();
                    activeDocument.removeEventListener('keydown', onKey, true);

                    const mods: string[] = [];
                    if (e.ctrlKey) mods.push('ctrl');
                    if (e.shiftKey) mods.push('shift');
                    if (e.altKey) mods.push('alt');
                    if (e.metaKey) mods.push('meta');

                    const key = e.key === 'Unidentified' ? e.code : e.key;
                    const serialized = mods.join(',') + ':' + key;

                    this.plugin.settings.hintModeHotkey = serialized;
                    void this.plugin.saveSettings();
                    this.plugin.reloadFeatures();

                    hotkeyDisplay.textContent = formatHotkey(serialized);
                    button.setButtonText('Record');
                };
                activeDocument.addEventListener('keydown', onKey, true);
            }),
        );

        if (this.plugin.settings.hintModeHotkey) {
            hotkeySettingItem.addButton((button) =>
                button.setButtonText('Clear').onClick(() => {
                    this.plugin.settings.hintModeHotkey = '';
                    void this.plugin.saveSettings();
                    this.plugin.reloadFeatures();
                    hotkeyDisplay.textContent = '';
                }),
            );
        }

        new Setting(containerEl)
            .setName('Scrolloff lines')
            .setDesc(
                'Number of lines to keep visible above and below when scrolling (0 to disable).',
            )
            .addSlider((slider) =>
                slider
                    .setLimits(0, 20, 1)
                    .setValue(this.plugin.settings.scrolloffLines)
                    .onChange(async (value) => {
                        this.plugin.settings.scrolloffLines = value;
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );

        new Setting(containerEl)
            .setName('Multi-line text object scan range')
            .setDesc(
                'Maximum lines to scan in each direction for multi-line text objects (bold, italic, etc.). Higher values find longer spans.',
            )
            .addSlider((slider) =>
                slider
                    .setLimits(5, 200, 5)
                    .setValue(this.plugin.settings.multilineScanLimit)
                    .onChange(async (value) => {
                        this.plugin.settings.multilineScanLimit = value;
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );

        new Setting(containerEl).setName('Leader key bindings').setHeading();
        new Setting(containerEl).setDesc(
            `Map leader key sequences to Obsidian commands. Applied in addition to ${this.app.vault.configDir}.vimrc bindings.`,
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
