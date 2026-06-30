import {
    App,
    PluginSettingTab,
    setIcon,
    Setting,
    SuggestModal,
    TextComponent,
} from 'obsidian';
import VimMotionsPlugin from './main';
import { isBundledVimActive } from './vim/bundled-vim';

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

export interface GroupLabel {
    key: string;
    label: string;
}

export interface CommandLabel {
    key: string;
    label: string;
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

export type CursorShape = 'block' | 'bar' | 'underline' | 'hollow';

export interface CursorShapes {
    normal: CursorShape;
    insert: CursorShape;
    visual: CursorShape;
    replace: CursorShape;
    operatorPending: CursorShape;
}

export const DEFAULT_CURSOR_SHAPES: CursorShapes = {
    normal: 'block',
    insert: 'bar',
    visual: 'block',
    replace: 'underline',
    operatorPending: 'underline',
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
    listContinuationOnOpen: boolean;
    enableTableNav: boolean;
    tableWidgetMode: 'off' | 'cursor' | 'always';
    enableHintMode: boolean;
    hintModeLabels: string;
    hintModeHotkey: string;
    scrolloffLines: number;
    multilineScanLimit: number;
    easyMotionLabels: string;
    labelFontSize: number;
    cursorShapes: CursorShapes;
    clipboard: string;
    tabstop: number;
    shiftwidth: number;
    expandtab: boolean;
    insertmodeescape: string;
    insertmodeescapetimeout: number;
    textwidth: number;
    whichKeyMode: 'off' | 'leader' | 'all';
    whichKeyGrouping: 'flat' | 'grouped';
    whichKeyGroupLabels: GroupLabel[];
    whichKeyCommandLabels: CommandLabel[];
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
    listContinuationOnOpen: true,
    enableTableNav: true,
    tableWidgetMode: 'cursor',
    enableHintMode: true,
    hintModeLabels: 'asdfghjkl',
    hintModeHotkey: '',
    scrolloffLines: 5,
    multilineScanLimit: 20,
    easyMotionLabels: 'asdghklqwertyuiopzxcvbnmfj',
    labelFontSize: 14,
    cursorShapes: { ...DEFAULT_CURSOR_SHAPES },
    clipboard: '',
    tabstop: 4,
    shiftwidth: 4,
    expandtab: true,
    insertmodeescape: '',
    insertmodeescapetimeout: 1000,
    textwidth: 80,
    whichKeyMode: 'off',
    whichKeyGrouping: 'grouped',
    whichKeyGroupLabels: [],
    whichKeyCommandLabels: [],
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

        const vimrcOverrides = this.plugin.vimrcOverrides;
        const getOverride = (key: string) => vimrcOverrides?.get(key);
        const isOverridden = (key: string) => !!getOverride(key);
        const describeOverride = (key: string, desc?: string) => {
            const directive = getOverride(key);
            if (!directive) return desc ?? '';
            const note = `Set by vimrc: \`${directive}\``;
            return desc ? `${desc} (${note})` : note;
        };

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
                text: 'Go to settings \u2192 editor \u2192 Vim key bindings and turn it off, then reload Obsidian.',
            });
        }

        // ── Vim features ───────────────────────────────────────────

        new Setting(containerEl).setName('Vim features').setHeading();

        new Setting(containerEl)
            .setName('Text objects')
            .setDesc(
                describeOverride(
                    'enableTextObjects',
                    'Enable Markdown-aware text objects (i*, a*, il, etc.)',
                ),
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableTextObjects)
                    .setDisabled(isOverridden('enableTextObjects'))
                    .onChange(async (value) => {
                        this.plugin.settings.enableTextObjects = value;
                        this.plugin.vimrcOverrides?.delete('enableTextObjects');
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );

        new Setting(containerEl)
            .setName('Structural navigation')
            .setDesc(
                describeOverride(
                    'enableNavigation',
                    'Enable heading, list, and link navigation motions (]h, ]l, ]n, etc.)',
                ),
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableNavigation)
                    .setDisabled(isOverridden('enableNavigation'))
                    .onChange(async (value) => {
                        this.plugin.settings.enableNavigation = value;
                        this.plugin.vimrcOverrides?.delete('enableNavigation');
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );

        new Setting(containerEl)
            .setName('Hard-wrap operator (gq)')
            .setDesc(
                describeOverride(
                    'enableHardWrap',
                    'Enable gq operator to reformat paragraphs with Markdown-aware line wrapping.',
                ),
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableHardWrap)
                    .setDisabled(isOverridden('enableHardWrap'))
                    .onChange(async (value) => {
                        this.plugin.settings.enableHardWrap = value;
                        this.plugin.vimrcOverrides?.delete('enableHardWrap');
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );

        new Setting(containerEl)
            .setName('Smart list continuation on o/O')
            .setDesc(
                describeOverride(
                    'listContinuationOnOpen',
                    'When pressing o or O on a list line, automatically continue the list ' +
                        'marker (bullets, numbers, checkboxes). Disable for plain Neovim behavior.',
                ),
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.listContinuationOnOpen)
                    .setDisabled(isOverridden('listContinuationOnOpen'))
                    .onChange(async (value) => {
                        this.plugin.settings.listContinuationOnOpen = value;
                        this.plugin.vimrcOverrides?.delete(
                            'listContinuationOnOpen',
                        );
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );

        new Setting(containerEl)
            .setName('Table navigation')
            .setDesc(
                describeOverride(
                    'enableTableNav',
                    'Enable table cell navigation motions (]|/[| or ]c/[c to move between cells).',
                ),
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableTableNav)
                    .setDisabled(isOverridden('enableTableNav'))
                    .onChange(async (value) => {
                        this.plugin.settings.enableTableNav = value;
                        this.plugin.vimrcOverrides?.delete('enableTableNav');
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );

        new Setting(containerEl)
            .setName('Table widget in live preview')
            .setDesc(
                describeOverride(
                    'tableWidgetMode',
                    'Controls how tables display in Live Preview. ' +
                        '"Always raw" keeps tables as plain text. ' +
                        '"Cursor-aware" shows a rendered table when the cursor is outside and raw Markdown when editing. ' +
                        '"Off" uses the default interactive table editor.',
                ),
            )
            .addDropdown((dropdown) =>
                dropdown
                    .addOption('always', 'Always raw')
                    .addOption('cursor', 'Cursor-aware')
                    .addOption('off', 'Off')
                    .setValue(this.plugin.settings.tableWidgetMode)
                    .setDisabled(isOverridden('tableWidgetMode'))
                    .onChange(async (value) => {
                        this.plugin.settings.tableWidgetMode =
                            value as VimMotionsSettings['tableWidgetMode'];
                        this.plugin.vimrcOverrides?.delete('tableWidgetMode');
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );

        new Setting(containerEl)
            .setName('Workspace navigation')
            .setDesc(
                describeOverride(
                    'enableWorkspaceNav',
                    'Enable pane/tab/sidebar control (<C-w>h/j/k/l, gt/gT, :sidebar, etc.). Note: <C-w> may conflict with Obsidian\u2019s "Close current tab" hotkey \u2014 rebind it in Settings \u2192 Hotkeys.',
                ),
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableWorkspaceNav)
                    .setDisabled(isOverridden('enableWorkspaceNav'))
                    .onChange(async (value) => {
                        this.plugin.settings.enableWorkspaceNav = value;
                        this.plugin.vimrcOverrides?.delete(
                            'enableWorkspaceNav',
                        );
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );

        // ── Vim engine ──────────────────────────────────────────────

        new Setting(containerEl).setName('Vim engine').setHeading();

        new Setting(containerEl)
            .setName('Clipboard')
            .setDesc(
                describeOverride(
                    'clipboard',
                    'Sync yank/delete/paste with the system clipboard (unnamed/unnamedplus).',
                ),
            )
            .addDropdown((dropdown) =>
                dropdown
                    .addOption('', 'Off')
                    .addOption('unnamed', 'Unnamed')
                    .addOption('unnamedplus', 'Unnamedplus')
                    .setValue(this.plugin.settings.clipboard)
                    .setDisabled(isOverridden('clipboard'))
                    .onChange(async (value) => {
                        this.plugin.settings.clipboard = value;
                        this.plugin.vimrcOverrides?.delete('clipboard');
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(containerEl)
            .setName('Tabstop')
            .setDesc(describeOverride('tabstop', 'Tab display width (1–8).'))
            .addSlider((slider) =>
                slider
                    .setLimits(1, 8, 1)
                    .setValue(this.plugin.settings.tabstop)
                    .setDisabled(isOverridden('tabstop'))
                    .onChange(async (value) => {
                        this.plugin.settings.tabstop = value;
                        this.plugin.vimrcOverrides?.delete('tabstop');
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(containerEl)
            .setName('Shiftwidth')
            .setDesc(describeOverride('shiftwidth', 'Indent width (1–8).'))
            .addSlider((slider) =>
                slider
                    .setLimits(1, 8, 1)
                    .setValue(this.plugin.settings.shiftwidth)
                    .setDisabled(isOverridden('shiftwidth'))
                    .onChange(async (value) => {
                        this.plugin.settings.shiftwidth = value;
                        this.plugin.vimrcOverrides?.delete('shiftwidth');
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(containerEl)
            .setName('Expand tab')
            .setDesc(
                describeOverride('expandtab', 'Use spaces instead of tabs.'),
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.expandtab)
                    .setDisabled(isOverridden('expandtab'))
                    .onChange(async (value) => {
                        this.plugin.settings.expandtab = value;
                        this.plugin.vimrcOverrides?.delete('expandtab');
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(containerEl)
            .setName('Insert mode escape')
            .setDesc(
                describeOverride(
                    'insertmodeescape',
                    'Two-key sequence to exit insert mode (e.g. jk).',
                ),
            )
            .addText((text) =>
                text
                    .setValue(this.plugin.settings.insertmodeescape)
                    .setDisabled(isOverridden('insertmodeescape'))
                    .onChange(async (value) => {
                        this.plugin.settings.insertmodeescape = value;
                        this.plugin.vimrcOverrides?.delete('insertmodeescape');
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(containerEl)
            .setName('Insert mode escape timeout')
            .setDesc(
                describeOverride(
                    'insertmodeescapetimeout',
                    'Timeout in milliseconds for insert mode escape sequence (100–5000).',
                ),
            )
            .addText((text) => {
                text.setValue(
                    String(this.plugin.settings.insertmodeescapetimeout),
                );
                text.inputEl.type = 'number';
                text.inputEl.min = '100';
                text.inputEl.max = '5000';
                text.setDisabled(isOverridden('insertmodeescapetimeout'));
                text.onChange(async (value) => {
                    const n = Number(value);
                    this.plugin.settings.insertmodeescapetimeout = Number.isNaN(
                        n,
                    )
                        ? 1000
                        : Math.max(100, Math.min(5000, n));
                    this.plugin.vimrcOverrides?.delete(
                        'insertmodeescapetimeout',
                    );
                    await this.plugin.saveSettings();
                });
            });

        new Setting(containerEl)
            .setName('Textwidth')
            .setDesc(
                describeOverride(
                    'textwidth',
                    'Line wrap width for gq/gw (0 to disable).',
                ),
            )
            .addText((text) => {
                text.setValue(String(this.plugin.settings.textwidth));
                text.inputEl.type = 'number';
                text.inputEl.min = '0';
                text.inputEl.max = '200';
                text.setDisabled(isOverridden('textwidth'));
                text.onChange(async (value) => {
                    const n = Number(value);
                    this.plugin.settings.textwidth = Number.isNaN(n)
                        ? 0
                        : Math.max(0, Math.min(200, n));
                    this.plugin.vimrcOverrides?.delete('textwidth');
                    await this.plugin.saveSettings();
                });
            });

        // ── Jump navigation ──────────────────────────────────────────

        new Setting(containerEl).setName('Jump navigation').setHeading();

        new Setting(containerEl)
            .setName('EasyMotion')
            .setDesc(
                describeOverride(
                    'enableEasyMotion',
                    'Enable easymotion/hop navigation (<leader><leader>w, <leader><leader>f, <leader><leader>j).',
                ),
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableEasyMotion)
                    .setDisabled(isOverridden('enableEasyMotion'))
                    .onChange(async (value) => {
                        this.plugin.settings.enableEasyMotion = value;
                        this.plugin.vimrcOverrides?.delete('enableEasyMotion');
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );

        new Setting(containerEl)
            .setName('EasyMotion dimming')
            .setDesc(
                describeOverride(
                    'easyMotionDimming',
                    'Dim non-target text when EasyMotion is active.',
                ),
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.easyMotionDimming)
                    .setDisabled(isOverridden('easyMotionDimming'))
                    .onChange(async (value) => {
                        this.plugin.settings.easyMotionDimming = value;
                        this.plugin.vimrcOverrides?.delete('easyMotionDimming');
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(containerEl)
            .setName('EasyMotion label characters')
            .setDesc(
                describeOverride(
                    'easyMotionLabels',
                    'Characters used for EasyMotion labels (home-row recommended). More characters = shorter labels.',
                ),
            )
            .addText((text) =>
                text
                    .setValue(this.plugin.settings.easyMotionLabels)
                    .setDisabled(isOverridden('easyMotionLabels'))
                    .onChange(async (value) => {
                        this.plugin.settings.easyMotionLabels =
                            value || 'asdghklqwertyuiopzxcvbnmfj';
                        this.plugin.vimrcOverrides?.delete('easyMotionLabels');
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(containerEl)
            .setName('Hint mode')
            .setDesc(
                describeOverride(
                    'enableHintMode',
                    'Enable vimium-style link hints to click any UI element with the keyboard (<leader><leader>h).',
                ),
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableHintMode)
                    .setDisabled(isOverridden('enableHintMode'))
                    .onChange(async (value) => {
                        this.plugin.settings.enableHintMode = value;
                        this.plugin.vimrcOverrides?.delete('enableHintMode');
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );

        new Setting(containerEl)
            .setName('Hint mode label characters')
            .setDesc(
                describeOverride(
                    'hintModeLabels',
                    'Characters used for hint labels (home-row recommended). Fewer characters = longer labels.',
                ),
            )
            .addText((text) =>
                text
                    .setValue(this.plugin.settings.hintModeLabels)
                    .setDisabled(isOverridden('hintModeLabels'))
                    .onChange(async (value) => {
                        this.plugin.settings.hintModeLabels =
                            value || 'asdfghjkl';
                        this.plugin.vimrcOverrides?.delete('hintModeLabels');
                        await this.plugin.saveSettings();
                    }),
            );

        const hotkeySettingItem = new Setting(containerEl)
            .setName('Hint mode global hotkey')
            .setDesc(
                describeOverride(
                    'hintModeHotkey',
                    'Key combination to trigger hint mode from anywhere, including modals. Click the button and press a key combination to set.',
                ),
            );
        const hotkeyOverridden = isOverridden('hintModeHotkey');

        const hotkeyDisplay = hotkeySettingItem.controlEl.createSpan({
            cls: 'setting-hotkey vim-motions-hotkey-display',
        });
        hotkeyDisplay.textContent = formatHotkey(
            this.plugin.settings.hintModeHotkey,
        );

        hotkeySettingItem.addButton((button) =>
            button
                .setButtonText('Record')
                .setDisabled(hotkeyOverridden)
                .onClick(() => {
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
                        activeDocument.removeEventListener(
                            'keydown',
                            onKey,
                            true,
                        );

                        const mods: string[] = [];
                        if (e.ctrlKey) mods.push('ctrl');
                        if (e.shiftKey) mods.push('shift');
                        if (e.altKey) mods.push('alt');
                        if (e.metaKey) mods.push('meta');

                        const key = e.key === 'Unidentified' ? e.code : e.key;
                        const serialized = mods.join(',') + ':' + key;

                        this.plugin.settings.hintModeHotkey = serialized;
                        this.plugin.vimrcOverrides?.delete('hintModeHotkey');
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
                button
                    .setButtonText('Clear')
                    .setDisabled(hotkeyOverridden)
                    .onClick(() => {
                        this.plugin.settings.hintModeHotkey = '';
                        this.plugin.vimrcOverrides?.delete('hintModeHotkey');
                        void this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                        hotkeyDisplay.textContent = '';
                    }),
            );
        }

        new Setting(containerEl)
            .setName('Label font size')
            .setDesc(
                describeOverride(
                    'labelFontSize',
                    'Font size for EasyMotion and hint mode labels (10\u201320px). ' +
                        'Override colors via CSS: --vim-motions-em-bg/fg (EasyMotion), --vim-motions-hint-bg/fg (hint mode).',
                ),
            )
            .addSlider((slider) =>
                slider
                    .setLimits(10, 20, 1)
                    .setValue(this.plugin.settings.labelFontSize)
                    .setDisabled(isOverridden('labelFontSize'))
                    .onChange(async (value) => {
                        this.plugin.settings.labelFontSize = value;
                        this.plugin.vimrcOverrides?.delete('labelFontSize');
                        await this.plugin.saveSettings();
                    }),
            );

        // ── Status bar ───────────────────────────────────────────────

        new Setting(containerEl).setName('Status bar').setHeading();

        new Setting(containerEl)
            .setName('Vim mode status bar')
            .setDesc(
                describeOverride(
                    'enableStatusBar',
                    'Show current Vim mode (normal, insert, visual) in the status bar.',
                ),
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableStatusBar)
                    .setDisabled(isOverridden('enableStatusBar'))
                    .onChange(async (value) => {
                        this.plugin.settings.enableStatusBar = value;
                        this.plugin.vimrcOverrides?.delete('enableStatusBar');
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );

        new Setting(containerEl)
            .setName('Vim chord display')
            .setDesc(
                describeOverride(
                    'enableChordDisplay',
                    'Show pending keystrokes in the status bar as you type a command (e.g. "2d", "gq").',
                ),
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableChordDisplay)
                    .setDisabled(isOverridden('enableChordDisplay'))
                    .onChange(async (value) => {
                        this.plugin.settings.enableChordDisplay = value;
                        this.plugin.vimrcOverrides?.delete(
                            'enableChordDisplay',
                        );
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );

        new Setting(containerEl)
            .setName('Powerline-style status bar')
            .setDesc(
                describeOverride(
                    'enablePowerline',
                    'Color the Vim mode indicator with per-mode background colors and a triangular separator.',
                ),
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enablePowerline)
                    .setDisabled(isOverridden('enablePowerline'))
                    .onChange(async (value) => {
                        this.plugin.settings.enablePowerline = value;
                        this.plugin.vimrcOverrides?.delete('enablePowerline');
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
            .setDesc(
                describeOverride(
                    'modePrompts.normal',
                    'Status bar text for normal mode.',
                ),
            )
            .addText((text) =>
                text
                    .setValue(prompts.normal)
                    .setDisabled(isOverridden('modePrompts.normal'))
                    .onChange(async (value) => {
                        this.plugin.settings.modePrompts.normal =
                            value || DEFAULT_MODE_PROMPTS.normal;
                        this.plugin.vimrcOverrides?.delete(
                            'modePrompts.normal',
                        );
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );
        new Setting(containerEl)
            .setName('Insert mode prompt')
            .setDesc(
                describeOverride(
                    'modePrompts.insert',
                    'Status bar text for insert mode.',
                ),
            )
            .addText((text) =>
                text
                    .setValue(prompts.insert)
                    .setDisabled(isOverridden('modePrompts.insert'))
                    .onChange(async (value) => {
                        this.plugin.settings.modePrompts.insert =
                            value || DEFAULT_MODE_PROMPTS.insert;
                        this.plugin.vimrcOverrides?.delete(
                            'modePrompts.insert',
                        );
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );
        new Setting(containerEl)
            .setName('Visual mode prompt')
            .setDesc(
                describeOverride(
                    'modePrompts.visual',
                    'Status bar text for visual mode.',
                ),
            )
            .addText((text) =>
                text
                    .setValue(prompts.visual)
                    .setDisabled(isOverridden('modePrompts.visual'))
                    .onChange(async (value) => {
                        this.plugin.settings.modePrompts.visual =
                            value || DEFAULT_MODE_PROMPTS.visual;
                        this.plugin.vimrcOverrides?.delete(
                            'modePrompts.visual',
                        );
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );
        new Setting(containerEl)
            .setName('Replace mode prompt')
            .setDesc(
                describeOverride(
                    'modePrompts.replace',
                    'Status bar text for replace mode.',
                ),
            )
            .addText((text) =>
                text
                    .setValue(prompts.replace)
                    .setDisabled(isOverridden('modePrompts.replace'))
                    .onChange(async (value) => {
                        this.plugin.settings.modePrompts.replace =
                            value || DEFAULT_MODE_PROMPTS.replace;
                        this.plugin.vimrcOverrides?.delete(
                            'modePrompts.replace',
                        );
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );

        // ── Cursor shapes ────────────────────────────────────────────

        new Setting(containerEl).setName('Cursor shapes').setHeading();

        const forkActive = isBundledVimActive();

        if (!forkActive) {
            new Setting(containerEl).setDesc(
                'Cursor shapes require bundled fork mode. Disable Obsidian\u2019s built-in Vim key bindings (settings \u2192 editor) and restart the plugin to enable these options.',
            );
        } else {
            new Setting(containerEl).setDesc(
                'Cursor shape per Vim mode. Configurable via vimrc: set guicursor=n:block,i:bar,v:block,r:underline,o:underline',
            );
        }

        const cursorShapeOptions: Record<CursorShape, string> = {
            block: 'Block',
            bar: 'Bar',
            underline: 'Underline',
            hollow: 'Hollow',
        };

        const cursorModes: { key: keyof CursorShapes; label: string }[] = [
            { key: 'normal', label: 'Normal mode' },
            { key: 'insert', label: 'Insert mode' },
            { key: 'visual', label: 'Visual mode' },
            { key: 'replace', label: 'Replace mode' },
            { key: 'operatorPending', label: 'Operator-pending' },
        ];

        for (const { key, label } of cursorModes) {
            const cursorOverride = getOverride('cursorShapes');
            const setting = new Setting(containerEl).setName(label);
            if (cursorOverride) {
                setting.setDesc(`Set by vimrc: \`${cursorOverride}\``);
            }
            setting.addDropdown((dropdown) => {
                dropdown
                    .addOptions(cursorShapeOptions)
                    .setValue(this.plugin.settings.cursorShapes[key])
                    .setDisabled(!forkActive || isOverridden('cursorShapes'))
                    .onChange(async (value) => {
                        this.plugin.settings.cursorShapes[key] =
                            value as CursorShape;
                        this.plugin.vimrcOverrides?.delete('cursorShapes');
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    });
            });
        }

        // ── Vimrc & key bindings ─────────────────────────────────────

        new Setting(containerEl).setName('Vimrc & key bindings').setHeading();

        new Setting(containerEl)
            .setName(`Load ${this.app.vault.configDir}.vimrc`)
            .setDesc(
                describeOverride(
                    'enableVimrc',
                    `Load key mappings and settings from ${this.app.vault.configDir}.vimrc in your vault root.`,
                ),
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableVimrc)
                    .setDisabled(isOverridden('enableVimrc'))
                    .onChange(async (value) => {
                        this.plugin.settings.enableVimrc = value;
                        this.plugin.vimrcOverrides?.delete('enableVimrc');
                        await this.plugin.saveSettings();
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

        // ── Which-key ────────────────────────────────────────────────

        new Setting(containerEl).setName('Which-key hints').setHeading();

        new Setting(containerEl)
            .setName('Which-key mode')
            .setDesc(
                describeOverride(
                    'whichKeyMode',
                    'Show available key continuations in a popup after a short delay.',
                ),
            )
            .addDropdown((dropdown) =>
                dropdown
                    .addOptions({
                        off: 'Off',
                        leader: 'Leader key only',
                        all: 'All partial keys',
                    })
                    .setValue(this.plugin.settings.whichKeyMode)
                    .setDisabled(isOverridden('whichKeyMode'))
                    .onChange(async (value) => {
                        this.plugin.settings.whichKeyMode = value as
                            | 'off'
                            | 'leader'
                            | 'all';
                        this.plugin.vimrcOverrides?.delete('whichKeyMode');
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );

        new Setting(containerEl)
            .setName('Which-key leader grouping')
            .setDesc(
                describeOverride(
                    'whichKeyGrouping',
                    'How leader key bindings are displayed. ' +
                        '"Grouped" collapses bindings by prefix (e.g. t \u2192 +5 keys) and lets you drill down. ' +
                        '"Flat" shows all bindings at once.',
                ),
            )
            .addDropdown((dropdown) =>
                dropdown
                    .addOptions({
                        grouped: 'Grouped',
                        flat: 'Flat',
                    })
                    .setValue(this.plugin.settings.whichKeyGrouping)
                    .setDisabled(isOverridden('whichKeyGrouping'))
                    .onChange(async (value) => {
                        this.plugin.settings.whichKeyGrouping = value as
                            | 'flat'
                            | 'grouped';
                        this.plugin.vimrcOverrides?.delete('whichKeyGrouping');
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );

        new Setting(containerEl).setName('Which-key group labels').setHeading();
        new Setting(containerEl).setDesc(
            'Name groups by their full key prefix. Use the leader character + prefix for leader groups ' +
                '(e.g. "\\t" for table), or a raw prefix for non-leader groups (e.g. "cs" for surround changes). ' +
                'Built-in features register default labels that your entries can override.',
        );

        const groupLabelsContainer = containerEl.createDiv({
            cls: 'vim-motions-group-labels',
        });
        this.renderGroupLabels(groupLabelsContainer);

        new Setting(containerEl)
            .setName('Which-key command labels')
            .setHeading();
        new Setting(containerEl).setDesc(
            'Describe individual bindings in the which-key popup. Entries set in vimrc appear as read-only rows.',
        );

        const commandLabelsContainer = containerEl.createDiv({
            cls: 'vim-motions-command-labels',
        });
        this.renderCommandLabels(commandLabelsContainer);

        // ── Advanced ─────────────────────────────────────────────────

        new Setting(containerEl).setName('Advanced').setHeading();

        new Setting(containerEl)
            .setName('Scrolloff lines')
            .setDesc(
                describeOverride(
                    'scrolloffLines',
                    'Number of lines to keep visible above and below when scrolling (0 to disable).',
                ),
            )
            .addSlider((slider) =>
                slider
                    .setLimits(0, 20, 1)
                    .setValue(this.plugin.settings.scrolloffLines)
                    .setDisabled(isOverridden('scrolloffLines'))
                    .onChange(async (value) => {
                        this.plugin.settings.scrolloffLines = value;
                        this.plugin.vimrcOverrides?.delete('scrolloffLines');
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );

        new Setting(containerEl)
            .setName('Multi-line text object scan range')
            .setDesc(
                describeOverride(
                    'multilineScanLimit',
                    'Maximum lines to scan in each direction for multi-line text objects (bold, italic, etc.). Higher values find longer spans.',
                ),
            )
            .addSlider((slider) =>
                slider
                    .setLimits(5, 200, 5)
                    .setValue(this.plugin.settings.multilineScanLimit)
                    .setDisabled(isOverridden('multilineScanLimit'))
                    .onChange(async (value) => {
                        this.plugin.settings.multilineScanLimit = value;
                        this.plugin.vimrcOverrides?.delete(
                            'multilineScanLimit',
                        );
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );
    }

    private renderGroupLabels(container: HTMLElement): void {
        container.empty();
        const labels = this.plugin.settings.whichKeyGroupLabels;
        const leaderKey = this.plugin.leaderRegistry?.getLeaderKey() ?? '\\';
        const normalize = (key: string) =>
            key.trim().replace(/<leader>/gi, leaderKey);

        const vimrcLabels = this.plugin.vimrcGroupLabels;
        const vimrcByKey = new Map<string, GroupLabel>();
        for (const entry of vimrcLabels) {
            if (!entry?.key || !entry.label) continue;
            vimrcByKey.set(normalize(entry.key), entry);
        }

        for (const entry of vimrcLabels) {
            if (!entry?.key || !entry.label) continue;
            const setting = new Setting(container)
                .addText((text: TextComponent) =>
                    text
                        .setPlaceholder('Prefix (e.g., t)')
                        .setValue(entry.key)
                        .setDisabled(true),
                )
                .addText((text: TextComponent) =>
                    text
                        .setPlaceholder('Label (e.g., table)')
                        .setValue(`${entry.label} (from vimrc)`)
                        .setDisabled(true),
                );
            setting.settingEl.addClass('vim-motions-leader-binding-row');
        }

        for (let i = 0; i < labels.length; i++) {
            const entry = labels[i];
            if (!entry) continue;
            if (vimrcByKey.has(normalize(entry.key))) continue;
            const setting = new Setting(container)
                .addText((text: TextComponent) =>
                    text
                        .setPlaceholder('Prefix (e.g., t)')
                        .setValue(entry.key)
                        .onChange(async (value) => {
                            entry.key = value;
                            this.plugin.vimrcOverrides?.delete(
                                'whichKeyGroupLabels',
                            );
                            await this.plugin.saveSettings();
                            this.plugin.reloadFeatures();
                        }),
                )
                .addText((text: TextComponent) =>
                    text
                        .setPlaceholder('Label (e.g., table)')
                        .setValue(entry.label)
                        .onChange(async (value) => {
                            entry.label = value;
                            this.plugin.vimrcOverrides?.delete(
                                'whichKeyGroupLabels',
                            );
                            await this.plugin.saveSettings();
                            this.plugin.reloadFeatures();
                        }),
                )
                .addExtraButton((button) =>
                    button
                        .setIcon('cross')
                        .setTooltip('Remove')
                        .onClick(async () => {
                            labels.splice(i, 1);
                            await this.plugin.saveSettings();
                            this.plugin.reloadFeatures();
                            this.renderGroupLabels(container);
                        }),
                );
            setting.settingEl.addClass('vim-motions-leader-binding-row');
        }

        new Setting(container).addButton((button) =>
            button
                .setButtonText('Add group label')
                .setCta()
                .onClick(async () => {
                    labels.push({ key: '', label: '' });
                    await this.plugin.saveSettings();
                    this.renderGroupLabels(container);
                }),
        );
    }

    private renderCommandLabels(container: HTMLElement): void {
        container.empty();
        const labels = this.plugin.settings.whichKeyCommandLabels;
        const leaderKey = this.plugin.leaderRegistry?.getLeaderKey() ?? '\\';
        const normalize = (key: string) =>
            key.trim().replace(/<leader>/gi, leaderKey);

        const vimrcLabels = this.plugin.vimrcCommandLabels;
        const vimrcByKey = new Map<string, CommandLabel>();
        for (const entry of vimrcLabels) {
            if (!entry?.key || !entry.label) continue;
            vimrcByKey.set(normalize(entry.key), entry);
        }

        for (const entry of vimrcLabels) {
            if (!entry?.key || !entry.label) continue;
            const setting = new Setting(container)
                .addText((text: TextComponent) =>
                    text
                        .setPlaceholder('Key (e.g., <leader>w)')
                        .setValue(entry.key)
                        .setDisabled(true),
                )
                .addText((text: TextComponent) =>
                    text
                        .setPlaceholder('Label (e.g., save file)')
                        .setValue(`${entry.label} (from vimrc)`)
                        .setDisabled(true),
                );
            setting.settingEl.addClass('vim-motions-leader-binding-row');
        }

        for (let i = 0; i < labels.length; i++) {
            const entry = labels[i];
            if (!entry) continue;
            if (vimrcByKey.has(normalize(entry.key))) continue;
            const setting = new Setting(container)
                .addText((text: TextComponent) =>
                    text
                        .setPlaceholder('Key (e.g., <leader>w)')
                        .setValue(entry.key)
                        .onChange(async (value) => {
                            entry.key = value;
                            this.plugin.vimrcOverrides?.delete(
                                'whichKeyCommandLabels',
                            );
                            await this.plugin.saveSettings();
                            this.plugin.reloadFeatures();
                        }),
                )
                .addText((text: TextComponent) =>
                    text
                        .setPlaceholder('Label (e.g., save file)')
                        .setValue(entry.label)
                        .onChange(async (value) => {
                            entry.label = value;
                            this.plugin.vimrcOverrides?.delete(
                                'whichKeyCommandLabels',
                            );
                            await this.plugin.saveSettings();
                            this.plugin.reloadFeatures();
                        }),
                )
                .addExtraButton((button) =>
                    button
                        .setIcon('cross')
                        .setTooltip('Remove')
                        .onClick(async () => {
                            labels.splice(i, 1);
                            await this.plugin.saveSettings();
                            this.renderCommandLabels(container);
                        }),
                );
            setting.settingEl.addClass('vim-motions-leader-binding-row');
        }

        new Setting(container).addButton((button) =>
            button
                .setButtonText('Add command label')
                .setCta()
                .onClick(async () => {
                    labels.push({ key: '', label: '' });
                    await this.plugin.saveSettings();
                    this.renderCommandLabels(container);
                }),
        );
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
                            this.plugin.vimrcOverrides?.delete(
                                'leaderBindings',
                            );
                            await this.plugin.saveSettings();
                        }),
                )
                .addText((text: TextComponent) =>
                    text
                        .setPlaceholder('Command ID (e.g., switcher:open)')
                        .setValue(binding.commandId)
                        .onChange(async (value) => {
                            binding.commandId = value;
                            this.plugin.vimrcOverrides?.delete(
                                'leaderBindings',
                            );
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
