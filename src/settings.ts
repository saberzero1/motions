import {
    App,
    Notice,
    PluginSettingTab,
    setIcon,
    Setting,
    SuggestModal,
    TextComponent,
} from 'obsidian';
import type { SettingDefinitionItem } from 'obsidian';
import VimMotionsPlugin from './main';
import { isBundledVimActive } from './vim/bundled-vim';
import { VimrcFileSuggest } from './ui/vimrc-file-suggest';
import { getVimApi } from './vim/vim-api';
import { setClipboardOption, setTextwidth } from './vim/options';
import {
    VIMRC_FALLBACK_PATHS,
    getVimrcFallbackPaths,
    resolveVimrcPath,
} from './vimrc/loader';
import {
    LUA_FALLBACK_PATHS,
    getLuaFallbackPaths,
    resolveLuaConfigPath,
} from './lua/loader';

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
    visualLine: string;
    visualBlock: string;
    select: string;
    vreplace: string;
    command: string;
    search: string;
    insertNormal: string;
}

export const DEFAULT_MODE_PROMPTS: ModePrompts = {
    normal: 'NORMAL',
    insert: 'INSERT',
    visual: 'VISUAL',
    replace: 'REPLACE',
    visualLine: 'V-LINE',
    visualBlock: 'V-BLOCK',
    select: 'SELECT',
    vreplace: 'V-REPLACE',
    command: 'COMMAND',
    search: 'SEARCH',
    insertNormal: 'NORMAL',
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
    enableOnMobile: boolean;
    enableTextObjects: boolean;
    enableNavigation: boolean;
    enableWorkspaceNav: boolean;
    workspaceNavViewTypes: string;
    picker: boolean;
    pickerLeaderMappings: boolean;
    pickerMatcherEngine: 'auto' | 'nucleo' | 'ufuzzy' | 'obsidian';
    frecencyData?: Record<string, { count: number; timestamps: number[] }>;
    configMode: 'lua-vimrc' | 'lua' | 'vimrc' | 'settings';
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
    whichKeyDelay: number;
    whichKeyGroupLabels: GroupLabel[];
    whichKeyCommandLabels: CommandLabel[];
    vimrcPath: string;
    luaConfigPath: string;
    showConfigNotifications: boolean;
    leaderBindings: LeaderBinding[];
}

export const DEFAULT_SETTINGS: VimMotionsSettings = {
    enableOnMobile: false,
    enableTextObjects: true,
    enableNavigation: true,
    enableWorkspaceNav: true,
    workspaceNavViewTypes: '',
    picker: true,
    pickerLeaderMappings: true,
    pickerMatcherEngine: 'ufuzzy',
    frecencyData: undefined,
    configMode: 'lua-vimrc',
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
    whichKeyDelay: 500,
    whichKeyGroupLabels: [],
    whichKeyCommandLabels: [],
    vimrcPath: '',
    luaConfigPath: '',
    showConfigNotifications: true,
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
        el.createDiv({ text: item.name });
        el.createEl('small', { text: item.id, cls: 'u-muted' });
    }

    onChooseSuggestion(item: ObsidianCommand): void {
        this.onPick(item);
    }
}

export class VimMotionsSettingTab extends PluginSettingTab {
    plugin: VimMotionsPlugin;

    /** Settings keys that require reloadFeatures() after change. */
    private static readonly RELOAD_KEYS = new Set([
        'pickerMatcherEngine',
        'enableTextObjects',
        'enableNavigation',
        'enableHardWrap',
        'listContinuationOnOpen',
        'enableTableNav',
        'tableWidgetMode',
        'enableWorkspaceNav',
        'enableEasyMotion',
        'enableHintMode',
        'enableStatusBar',
        'enableChordDisplay',
        'enablePowerline',
        'modePrompts.normal',
        'modePrompts.insert',
        'modePrompts.visual',
        'modePrompts.replace',
        'modePrompts.visualLine',
        'modePrompts.visualBlock',
        'modePrompts.select',
        'modePrompts.vreplace',
        'modePrompts.command',
        'modePrompts.search',
        'modePrompts.insertNormal',
        'cursorShapes.normal',
        'cursorShapes.insert',
        'cursorShapes.visual',
        'cursorShapes.replace',
        'cursorShapes.operatorPending',
        'scrolloffLines',
        'multilineScanLimit',
        'configMode',
        'vimrcPath',
        'luaConfigPath',
        'whichKeyMode',
        'whichKeyGrouping',
        'whichKeyDelay',
    ]);

    constructor(app: App, plugin: VimMotionsPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    private isOverridden(key: string): boolean {
        return (
            !!this.plugin.vimrcOverrides?.get(key) ||
            !!this.plugin.luaOverrides?.get(key)
        );
    }

    private describeOverride(key: string, desc?: string): string {
        const notes: string[] = [];
        const vimrcDirective = this.plugin.vimrcOverrides?.get(key);
        if (vimrcDirective) {
            notes.push(`Set by vimrc: \`${vimrcDirective}\``);
        }
        const luaDirective = this.plugin.luaOverrides?.get(key);
        if (luaDirective) {
            notes.push(`Set by init.lua: \`${luaDirective}\``);
        }
        if (notes.length === 0) return desc ?? '';
        const note = notes.join(' · ');
        return desc ? `${desc} (${note})` : note;
    }

    getSettingDefinitions(): SettingDefinitionItem[] {
        const forkActive = isBundledVimActive();
        const cursorShapeOptions: Record<string, string> = {
            block: 'Block',
            bar: 'Bar',
            underline: 'Underline',
            hollow: 'Hollow',
        };

        const builtinVimOn =
            (
                this.app.vault as unknown as {
                    getConfig: (key: string) => unknown;
                }
            ).getConfig('vimMode') === true;

        return [
            // ── Built-in vim warning ────────────────────────────────
            ...(builtinVimOn
                ? [
                      {
                          name: 'Recommended: disable built-in Vim mode',
                          desc:
                              'Vim Motions includes an enhanced vim engine with Neovim-correct behavior, ' +
                              'operator-pending EasyMotion, and theme-aligned cursor styling. ' +
                              'These improvements are only active when Obsidian\u2019s built-in Vim mode is off. ' +
                              'Go to settings \u2192 editor \u2192 Vim key bindings and turn it off, then reload Obsidian.',
                          aliases: ['vim mode', 'built-in vim'],
                      } satisfies SettingDefinitionItem,
                  ]
                : []),

            // ── Mobile ───────────────────────────────────────────────
            {
                type: 'group' as const,
                heading: 'Mobile',
                items: [
                    {
                        name: 'Enable on mobile',
                        desc: 'Activate the plugin on mobile devices. Disabled by default because most mobile users lack a hardware keyboard. Reload Obsidian after changing.',
                        control: {
                            type: 'toggle' as const,
                            key: 'enableOnMobile',
                        },
                    },
                ],
            },

            // ── Vim features ────────────────────────────────────────
            {
                type: 'group' as const,
                heading: 'Vim features',
                items: [
                    {
                        name: 'Text objects',
                        desc: this.describeOverride(
                            'enableTextObjects',
                            'Enable Markdown-aware text objects (i*, a*, il, etc.)',
                        ),
                        control: {
                            type: 'toggle' as const,
                            key: 'enableTextObjects',
                            disabled: () =>
                                this.isOverridden('enableTextObjects'),
                        },
                    },
                    {
                        name: 'Structural navigation',
                        desc: this.describeOverride(
                            'enableNavigation',
                            'Enable heading, list, and link navigation motions (]h, ]l, ]n, etc.)',
                        ),
                        control: {
                            type: 'toggle' as const,
                            key: 'enableNavigation',
                            disabled: () =>
                                this.isOverridden('enableNavigation'),
                        },
                    },
                    {
                        name: 'Hard-wrap operator (gq)',
                        desc: this.describeOverride(
                            'enableHardWrap',
                            'Enable gq operator to reformat paragraphs with Markdown-aware line wrapping.',
                        ),
                        control: {
                            type: 'toggle' as const,
                            key: 'enableHardWrap',
                            disabled: () => this.isOverridden('enableHardWrap'),
                        },
                    },
                    {
                        name: 'Smart list continuation on o/O',
                        desc: this.describeOverride(
                            'listContinuationOnOpen',
                            'When pressing o or O on a list line, automatically continue the list ' +
                                'marker (bullets, numbers, checkboxes). Disable for plain Neovim behavior.',
                        ),
                        control: {
                            type: 'toggle' as const,
                            key: 'listContinuationOnOpen',
                            disabled: () =>
                                this.isOverridden('listContinuationOnOpen'),
                        },
                    },
                    {
                        name: 'Table navigation',
                        desc: this.describeOverride(
                            'enableTableNav',
                            'Enable table cell navigation motions (]|/[| or ]c/[c to move between cells).',
                        ),
                        control: {
                            type: 'toggle' as const,
                            key: 'enableTableNav',
                            disabled: () => this.isOverridden('enableTableNav'),
                        },
                    },
                    {
                        name: 'Table widget in live preview',
                        desc: this.describeOverride(
                            'tableWidgetMode',
                            'Controls how tables display in Live Preview. ' +
                                '"Always raw" keeps tables as plain text. ' +
                                '"Cursor-aware" shows a rendered table when the cursor is outside and raw Markdown when editing. ' +
                                '"Off" uses the default interactive table editor.',
                        ),
                        control: {
                            type: 'dropdown' as const,
                            key: 'tableWidgetMode',
                            options: {
                                always: 'Always raw',
                                cursor: 'Cursor-aware',
                                off: 'Off',
                            },
                            disabled: () =>
                                this.isOverridden('tableWidgetMode'),
                        },
                    },
                    {
                        name: 'Workspace navigation',
                        desc: this.describeOverride(
                            'enableWorkspaceNav',
                            'Enable pane/tab/sidebar control (<C-w>h/j/k/l, gt/gT, :sidebar, etc.). Note: <C-w> may conflict with Obsidian\u2019s "Close current tab" hotkey \u2014 rebind it in Settings \u2192 Hotkeys.',
                        ),
                        control: {
                            type: 'toggle' as const,
                            key: 'enableWorkspaceNav',
                            disabled: () =>
                                this.isOverridden('enableWorkspaceNav'),
                        },
                    },
                    {
                        name: 'Fuzzy picker for buffers',
                        desc: this.describeOverride(
                            'picker',
                            'Use the unified fuzzy picker for :buffers/:ls (files and commands always use the picker).',
                        ),
                        control: {
                            type: 'toggle' as const,
                            key: 'picker',
                            disabled: () => this.isOverridden('picker'),
                        },
                    },
                    {
                        name: 'Picker leader mappings',
                        desc: 'Enable default <leader>f* picker mappings and which-key labels.',
                        control: {
                            type: 'toggle' as const,
                            key: 'pickerLeaderMappings',
                        },
                    },
                    {
                        name: 'Picker matching engine',
                        desc: 'Fuzzy matching engine for the picker. Auto uses nucleo (WASM) on desktop and uFuzzy on mobile. Obsidian uses the built-in API.',
                        control: {
                            type: 'dropdown' as const,
                            key: 'pickerMatcherEngine',
                            options: {
                                auto: 'Auto',
                                nucleo: 'Nucleo (WASM)',
                                ufuzzy: 'uFuzzy',
                                obsidian: 'Obsidian built-in',
                            },
                        },
                    },
                ],
            },

            // ── Vim engine ──────────────────────────────────────────
            {
                type: 'group' as const,
                heading: 'Vim engine',
                items: [
                    {
                        name: 'Clipboard',
                        desc: this.describeOverride(
                            'clipboard',
                            'Sync yank/delete/paste with the system clipboard (unnamed/unnamedplus).',
                        ),
                        control: {
                            type: 'dropdown' as const,
                            key: 'clipboard',
                            options: {
                                '': 'Off',
                                unnamed: 'Unnamed',
                                unnamedplus: 'Unnamedplus',
                            },
                            disabled: () => this.isOverridden('clipboard'),
                        },
                    },
                    {
                        name: 'Tabstop',
                        desc: this.describeOverride(
                            'tabstop',
                            'Tab display width (1\u20138).',
                        ),
                        control: {
                            type: 'slider' as const,
                            key: 'tabstop',
                            min: 1,
                            max: 8,
                            step: 1,
                            disabled: () => this.isOverridden('tabstop'),
                        },
                    },
                    {
                        name: 'Shiftwidth',
                        desc: this.describeOverride(
                            'shiftwidth',
                            'Indent width (1\u20138).',
                        ),
                        control: {
                            type: 'slider' as const,
                            key: 'shiftwidth',
                            min: 1,
                            max: 8,
                            step: 1,
                            disabled: () => this.isOverridden('shiftwidth'),
                        },
                    },
                    {
                        name: 'Expand tab',
                        desc: this.describeOverride(
                            'expandtab',
                            'Use spaces instead of tabs.',
                        ),
                        control: {
                            type: 'toggle' as const,
                            key: 'expandtab',
                            disabled: () => this.isOverridden('expandtab'),
                        },
                    },
                    {
                        name: 'Insert mode escape',
                        desc: this.describeOverride(
                            'insertmodeescape',
                            'Two-key sequence to exit insert mode (e.g. jk).',
                        ),
                        control: {
                            type: 'text' as const,
                            key: 'insertmodeescape',
                            disabled: () =>
                                this.isOverridden('insertmodeescape'),
                        },
                    },
                    {
                        name: 'Insert mode escape timeout',
                        desc: this.describeOverride(
                            'insertmodeescapetimeout',
                            'Timeout in milliseconds for insert mode escape sequence (100\u20135000).',
                        ),
                        control: {
                            type: 'number' as const,
                            key: 'insertmodeescapetimeout',
                            min: 100,
                            max: 5000,
                            disabled: () =>
                                this.isOverridden('insertmodeescapetimeout'),
                        },
                    },
                    {
                        name: 'Textwidth',
                        desc: this.describeOverride(
                            'textwidth',
                            'Line wrap width for gq/gw (0 to disable).',
                        ),
                        control: {
                            type: 'number' as const,
                            key: 'textwidth',
                            min: 0,
                            max: 200,
                            disabled: () => this.isOverridden('textwidth'),
                        },
                    },
                ],
            },

            // ── Jump navigation ─────────────────────────────────────
            {
                type: 'group' as const,
                heading: 'Jump navigation',
                items: [
                    {
                        name: 'EasyMotion',
                        desc: this.describeOverride(
                            'enableEasyMotion',
                            'Enable easymotion/hop navigation (<leader><leader>w, <leader><leader>f, <leader><leader>j).',
                        ),
                        control: {
                            type: 'toggle' as const,
                            key: 'enableEasyMotion',
                            disabled: () =>
                                this.isOverridden('enableEasyMotion'),
                        },
                    },
                    {
                        name: 'EasyMotion dimming',
                        desc: this.describeOverride(
                            'easyMotionDimming',
                            'Dim non-target text when EasyMotion is active.',
                        ),
                        control: {
                            type: 'toggle' as const,
                            key: 'easyMotionDimming',
                            disabled: () =>
                                this.isOverridden('easyMotionDimming'),
                        },
                    },
                    {
                        name: 'EasyMotion label characters',
                        desc: this.describeOverride(
                            'easyMotionLabels',
                            'Characters used for EasyMotion labels (home-row recommended). More characters = shorter labels.',
                        ),
                        control: {
                            type: 'text' as const,
                            key: 'easyMotionLabels',
                            disabled: () =>
                                this.isOverridden('easyMotionLabels'),
                        },
                    },
                    {
                        name: 'Hint mode',
                        desc: this.describeOverride(
                            'enableHintMode',
                            'Enable vimium-style link hints to click any UI element with the keyboard (<leader><leader>h).',
                        ),
                        control: {
                            type: 'toggle' as const,
                            key: 'enableHintMode',
                            disabled: () => this.isOverridden('enableHintMode'),
                        },
                    },
                    {
                        name: 'Hint mode label characters',
                        desc: this.describeOverride(
                            'hintModeLabels',
                            'Characters used for hint labels (home-row recommended). Fewer characters = longer labels.',
                        ),
                        control: {
                            type: 'text' as const,
                            key: 'hintModeLabels',
                            disabled: () => this.isOverridden('hintModeLabels'),
                        },
                    },
                    {
                        name: 'Hint mode global hotkey',
                        desc: this.describeOverride(
                            'hintModeHotkey',
                            'Key combination to trigger hint mode from anywhere, including modals. Click the button and press a key combination to set.',
                        ),
                        render: (setting: Setting) => {
                            this.renderHotkeyControl(setting);
                        },
                    },
                    {
                        name: 'Label font size',
                        desc: this.describeOverride(
                            'labelFontSize',
                            'Font size for EasyMotion and hint mode labels (10\u201320px). ' +
                                'Override colors via CSS: --vim-motions-em-bg/fg (EasyMotion), --vim-motions-hint-bg/fg (hint mode).',
                        ),
                        control: {
                            type: 'slider' as const,
                            key: 'labelFontSize',
                            min: 10,
                            max: 20,
                            step: 1,
                            disabled: () => this.isOverridden('labelFontSize'),
                        },
                    },
                ],
            },

            // ── Status bar ──────────────────────────────────────────
            {
                type: 'group' as const,
                heading: 'Status bar',
                items: [
                    {
                        name: 'Vim mode status bar',
                        desc: this.describeOverride(
                            'enableStatusBar',
                            'Show current Vim mode (normal, insert, visual) in the status bar.',
                        ),
                        control: {
                            type: 'toggle' as const,
                            key: 'enableStatusBar',
                            disabled: () =>
                                this.isOverridden('enableStatusBar'),
                        },
                    },
                    {
                        name: 'Vim chord display',
                        desc: this.describeOverride(
                            'enableChordDisplay',
                            'Show pending keystrokes in the status bar as you type a command (e.g. "2d", "gq").',
                        ),
                        control: {
                            type: 'toggle' as const,
                            key: 'enableChordDisplay',
                            disabled: () =>
                                this.isOverridden('enableChordDisplay'),
                        },
                    },
                    {
                        name: 'Powerline-style status bar',
                        desc: this.describeOverride(
                            'enablePowerline',
                            'Color the Vim mode indicator with per-mode background colors and a triangular separator.',
                        ),
                        control: {
                            type: 'toggle' as const,
                            key: 'enablePowerline',
                            disabled: () =>
                                this.isOverridden('enablePowerline'),
                        },
                    },
                ],
            },

            // ── Mode prompts ────────────────────────────────────────
            {
                type: 'group' as const,
                heading: 'Vim mode display prompt',
                items: [
                    {
                        name: 'Normal mode prompt',
                        desc: this.describeOverride(
                            'modePrompts.normal',
                            'Status bar text for normal mode.',
                        ),
                        control: {
                            type: 'text' as const,
                            key: 'modePrompts.normal',
                            disabled: () =>
                                this.isOverridden('modePrompts.normal'),
                        },
                    },
                    {
                        name: 'Insert mode prompt',
                        desc: this.describeOverride(
                            'modePrompts.insert',
                            'Status bar text for insert mode.',
                        ),
                        control: {
                            type: 'text' as const,
                            key: 'modePrompts.insert',
                            disabled: () =>
                                this.isOverridden('modePrompts.insert'),
                        },
                    },
                    {
                        name: 'Visual mode prompt',
                        desc: this.describeOverride(
                            'modePrompts.visual',
                            'Status bar text for visual mode.',
                        ),
                        control: {
                            type: 'text' as const,
                            key: 'modePrompts.visual',
                            disabled: () =>
                                this.isOverridden('modePrompts.visual'),
                        },
                    },
                    {
                        name: 'Replace mode prompt',
                        desc: this.describeOverride(
                            'modePrompts.replace',
                            'Status bar text for replace mode.',
                        ),
                        control: {
                            type: 'text' as const,
                            key: 'modePrompts.replace',
                            disabled: () =>
                                this.isOverridden('modePrompts.replace'),
                        },
                    },
                    {
                        name: 'Visual line mode prompt',
                        desc: this.describeOverride(
                            'modePrompts.visualLine',
                            'Status bar text for visual line mode (V).',
                        ),
                        control: {
                            type: 'text' as const,
                            key: 'modePrompts.visualLine',
                            disabled: () =>
                                this.isOverridden('modePrompts.visualLine'),
                        },
                    },
                    {
                        name: 'Visual block mode prompt',
                        desc: this.describeOverride(
                            'modePrompts.visualBlock',
                            'Status bar text for visual block mode (Ctrl-V).',
                        ),
                        control: {
                            type: 'text' as const,
                            key: 'modePrompts.visualBlock',
                            disabled: () =>
                                this.isOverridden('modePrompts.visualBlock'),
                        },
                    },
                    {
                        name: 'Select mode prompt',
                        desc: this.describeOverride(
                            'modePrompts.select',
                            'Status bar text for select mode.',
                        ),
                        control: {
                            type: 'text' as const,
                            key: 'modePrompts.select',
                            disabled: () =>
                                this.isOverridden('modePrompts.select'),
                        },
                    },
                    {
                        name: 'Virtual replace mode prompt',
                        desc: this.describeOverride(
                            'modePrompts.vreplace',
                            'Status bar text for virtual replace mode.',
                        ),
                        control: {
                            type: 'text' as const,
                            key: 'modePrompts.vreplace',
                            disabled: () =>
                                this.isOverridden('modePrompts.vreplace'),
                        },
                    },
                    {
                        name: 'Command mode prompt',
                        desc: this.describeOverride(
                            'modePrompts.command',
                            'Status bar text for command-line mode.',
                        ),
                        control: {
                            type: 'text' as const,
                            key: 'modePrompts.command',
                            disabled: () =>
                                this.isOverridden('modePrompts.command'),
                        },
                    },
                    {
                        name: 'Search mode prompt',
                        desc: this.describeOverride(
                            'modePrompts.search',
                            'Status bar text for search mode.',
                        ),
                        control: {
                            type: 'text' as const,
                            key: 'modePrompts.search',
                            disabled: () =>
                                this.isOverridden('modePrompts.search'),
                        },
                    },
                    {
                        name: 'Insert-normal mode prompt',
                        desc: this.describeOverride(
                            'modePrompts.insertNormal',
                            'Status bar text when in normal mode via Ctrl-O from insert.',
                        ),
                        control: {
                            type: 'text' as const,
                            key: 'modePrompts.insertNormal',
                            disabled: () =>
                                this.isOverridden('modePrompts.insertNormal'),
                        },
                    },
                ],
            },

            // ── Cursor shapes ───────────────────────────────────────
            {
                type: 'group' as const,
                heading: 'Cursor shapes',
                items: [
                    {
                        name: forkActive
                            ? 'Cursor shape per Vim mode. Configurable via vimrc: set guicursor=n:block,i:bar,v:block,r:underline,o:underline'
                            : 'Cursor shapes require bundled fork mode. Disable Obsidian\u2019s built-in Vim key bindings (settings \u2192 editor) and restart the plugin to enable these options.',
                        searchable: false,
                    },
                    {
                        name: 'Normal mode',
                        control: {
                            type: 'dropdown' as const,
                            key: 'cursorShapes.normal',
                            options: cursorShapeOptions,
                            disabled: () =>
                                !forkActive ||
                                this.isOverridden('cursorShapes'),
                        },
                    },
                    {
                        name: 'Insert mode',
                        control: {
                            type: 'dropdown' as const,
                            key: 'cursorShapes.insert',
                            options: cursorShapeOptions,
                            disabled: () =>
                                !forkActive ||
                                this.isOverridden('cursorShapes'),
                        },
                    },
                    {
                        name: 'Visual mode',
                        control: {
                            type: 'dropdown' as const,
                            key: 'cursorShapes.visual',
                            options: cursorShapeOptions,
                            disabled: () =>
                                !forkActive ||
                                this.isOverridden('cursorShapes'),
                        },
                    },
                    {
                        name: 'Replace mode',
                        control: {
                            type: 'dropdown' as const,
                            key: 'cursorShapes.replace',
                            options: cursorShapeOptions,
                            disabled: () =>
                                !forkActive ||
                                this.isOverridden('cursorShapes'),
                        },
                    },
                    {
                        name: 'Operator-pending',
                        control: {
                            type: 'dropdown' as const,
                            key: 'cursorShapes.operatorPending',
                            options: cursorShapeOptions,
                            disabled: () =>
                                !forkActive ||
                                this.isOverridden('cursorShapes'),
                        },
                    },
                ],
            },

            // ── Vimrc & key bindings ────────────────────────────────
            {
                type: 'group' as const,
                heading: 'Vimrc & key bindings',
                items: [
                    {
                        name: 'Configuration mode',
                        desc: this.describeOverride(
                            'configMode',
                            'How the plugin loads configuration files. Lua + Vimrc loads both with Lua taking precedence on conflicts.',
                        ),
                        aliases: [
                            'vimrc',
                            'lua',
                            'init.lua',
                            'config mode',
                            'configuration',
                        ],
                        control: {
                            type: 'dropdown' as const,
                            key: 'configMode',
                            options: {
                                'lua-vimrc': 'Lua + Vimrc (recommended)',
                                lua: 'Lua only',
                                vimrc: 'Vimrc only',
                                settings: 'Settings only',
                            },
                            disabled: () => this.isOverridden('configMode'),
                        },
                    },
                    {
                        name: 'Custom init.lua path',
                        desc: `Path to an init.lua file. Vault-relative or absolute (desktop only, e.g. ~/.config/obsidian/init.lua). Leave empty to search: ${getLuaFallbackPaths(this.app).join(', ')}.`,
                        aliases: [
                            'lua path',
                            'lua config location',
                            'lua sync',
                        ],
                        control: {
                            type: 'text' as const,
                            key: 'luaConfigPath',
                            disabled: () =>
                                ['vimrc', 'settings'].includes(
                                    this.plugin.settings.configMode,
                                ),
                        },
                    },
                    {
                        name: 'Custom vimrc path',
                        desc: `Path to a vimrc file. Vault-relative or absolute (desktop only, e.g. ~/.config/obsidian/vimrc). Leave empty to search: ${getVimrcFallbackPaths(this.app).join(', ')}.`,
                        aliases: ['vimrc location', 'vimrc sync'],
                        control: {
                            type: 'text' as const,
                            key: 'vimrcPath',
                            disabled: () =>
                                ['lua', 'settings'].includes(
                                    this.plugin.settings.configMode,
                                ),
                        },
                    },
                    {
                        name: 'Show config load notifications',
                        desc: 'Show a notification when vimrc or init.lua is loaded on startup. Error notifications are always shown regardless of this setting.',
                        aliases: [
                            'suppress notifications',
                            'quiet',
                            'startup notice',
                            'config notification',
                        ],
                        control: {
                            type: 'toggle' as const,
                            key: 'showConfigNotifications',
                            disabled: () =>
                                this.plugin.settings.configMode === 'settings',
                        },
                    },
                ],
            },

            // ── Leader key bindings ─────────────────────────────────
            {
                type: 'group' as const,
                heading: 'Leader key bindings',
                items: [
                    {
                        name: 'Map leader key sequences to Obsidian commands. Applied in addition to vimrc bindings.',
                        searchable: false,
                    },
                    {
                        name: 'Leader bindings',
                        searchable: false,
                        render: (setting: Setting) => {
                            setting.settingEl.addClass('vim-motions-hidden');
                            const container = setting.settingEl.parentElement;
                            if (container) this.renderLeaderBindings(container);
                        },
                    },
                ],
            },

            // ── Which-key hints ─────────────────────────────────────
            {
                type: 'group' as const,
                heading: 'Which-key hints',
                items: [
                    {
                        name: 'Which-key mode',
                        desc: this.describeOverride(
                            'whichKeyMode',
                            'Show available key continuations in a popup after a short delay.',
                        ),
                        control: {
                            type: 'dropdown' as const,
                            key: 'whichKeyMode',
                            options: {
                                off: 'Off',
                                leader: 'Leader key only',
                                all: 'All partial keys',
                            },
                            disabled: () => this.isOverridden('whichKeyMode'),
                        },
                    },
                    {
                        name: 'Which-key leader grouping',
                        desc: this.describeOverride(
                            'whichKeyGrouping',
                            'How leader key bindings are displayed. ' +
                                '"Grouped" collapses bindings by prefix (e.g. t \u2192 +5 keys) and lets you drill down. ' +
                                '"Flat" shows all bindings at once.',
                        ),
                        control: {
                            type: 'dropdown' as const,
                            key: 'whichKeyGrouping',
                            options: {
                                grouped: 'Grouped',
                                flat: 'Flat',
                            },
                            disabled: () =>
                                this.isOverridden('whichKeyGrouping'),
                        },
                    },
                    {
                        name: 'Which-key popup delay',
                        desc: this.describeOverride(
                            'whichKeyDelay',
                            'Delay in milliseconds before the which-key popup appears (0\u20132000). ' +
                                'Only applies to the initial popup \u2014 subsequent keystrokes update the popup instantly.',
                        ),
                        control: {
                            type: 'number' as const,
                            key: 'whichKeyDelay',
                            min: 0,
                            max: 2000,
                            disabled: () => this.isOverridden('whichKeyDelay'),
                        },
                    },
                ],
            },

            // ── Which-key group labels ──────────────────────────────
            {
                type: 'group' as const,
                heading: 'Which-key group labels',
                items: [
                    {
                        name:
                            'Name groups by their full key prefix. Use the leader character + prefix for leader groups ' +
                            '(e.g. "\\t" for table), or a raw prefix for non-leader groups (e.g. "cs" for surround changes). ' +
                            'Built-in features register default labels that your entries can override.',
                        searchable: false,
                    },
                    {
                        name: 'Group labels',
                        searchable: false,
                        render: (setting: Setting) => {
                            setting.settingEl.addClass('vim-motions-hidden');
                            const container = setting.settingEl.parentElement;
                            if (container) this.renderGroupLabels(container);
                        },
                    },
                ],
            },

            // ── Which-key command labels ────────────────────────────
            {
                type: 'group' as const,
                heading: 'Which-key command labels',
                items: [
                    {
                        name: 'Describe individual bindings in the which-key popup. Entries set in vimrc appear as read-only rows.',
                        searchable: false,
                    },
                    {
                        name: 'Command labels',
                        searchable: false,
                        render: (setting: Setting) => {
                            setting.settingEl.addClass('vim-motions-hidden');
                            const container = setting.settingEl.parentElement;
                            if (container) this.renderCommandLabels(container);
                        },
                    },
                ],
            },

            // ── Advanced ────────────────────────────────────────────
            {
                type: 'group' as const,
                heading: 'Advanced',
                items: [
                    {
                        name: 'Scrolloff lines',
                        desc: this.describeOverride(
                            'scrolloffLines',
                            'Number of lines to keep visible above and below when scrolling (0 to disable).',
                        ),
                        control: {
                            type: 'number' as const,
                            key: 'scrolloffLines',
                            min: 0,
                            max: 9999,
                            placeholder: '5',
                            disabled: () => this.isOverridden('scrolloffLines'),
                        },
                    },
                    {
                        name: 'Multi-line text object scan range',
                        desc: this.describeOverride(
                            'multilineScanLimit',
                            'Maximum lines to scan in each direction for multi-line text objects (bold, italic, etc.). Higher values find longer spans.',
                        ),
                        control: {
                            type: 'slider' as const,
                            key: 'multilineScanLimit',
                            min: 5,
                            max: 200,
                            step: 5,
                            disabled: () =>
                                this.isOverridden('multilineScanLimit'),
                        },
                    },
                ],
            },
        ];
    }

    getControlValue(key: string): unknown {
        const s: Record<string, unknown> = this.plugin.settings as never;
        const dotIdx = key.indexOf('.');
        if (dotIdx !== -1) {
            const parent = key.slice(0, dotIdx);
            const child = key.slice(dotIdx + 1);
            const obj = s[parent];
            if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
                return (obj as Record<string, unknown>)[child];
            }
        }
        return s[key];
    }

    async setControlValue(key: string, value: unknown): Promise<void> {
        const s: Record<string, unknown> = this.plugin.settings as never;
        const dotIdx = key.indexOf('.');
        if (dotIdx !== -1) {
            const parent = key.slice(0, dotIdx);
            const child = key.slice(dotIdx + 1);
            const obj = s[parent];
            if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
                (obj as Record<string, unknown>)[child] = value;
            }
        } else {
            s[key] = value;
        }

        this.plugin.vimrcOverrides?.delete(key);

        await this.plugin.saveSettings();

        if (VimMotionsSettingTab.RELOAD_KEYS.has(key)) {
            this.plugin.reloadFeatures();
        }
    }

    private renderHotkeyControl(setting: Setting): void {
        const hotkeyOverridden = this.isOverridden('hintModeHotkey');
        const hotkeyDisplay = setting.controlEl.createSpan({
            cls: 'setting-hotkey vim-motions-hotkey-display',
        });
        hotkeyDisplay.textContent = formatHotkey(
            this.plugin.settings.hintModeHotkey,
        );

        setting.addButton((button) =>
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
            setting.addButton((button) =>
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

        // ── Mobile ──────────────────────────────────────────────────

        new Setting(containerEl).setName('Mobile').setHeading();

        new Setting(containerEl)
            .setName('Enable on mobile')
            .setDesc(
                'Activate the plugin on mobile devices. Disabled by default because most mobile users lack a hardware keyboard. Reload Obsidian after changing.',
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableOnMobile)
                    .onChange(async (value) => {
                        this.plugin.settings.enableOnMobile = value;
                        await this.plugin.saveSettings();
                        new Notice('Reload Obsidian to apply this change.');
                    }),
            );

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
            .setName('Table widget in Live Preview')
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

        new Setting(containerEl)
            .setName('Workspace navigation view types')
            .setDesc(
                'Comma-separated view types where scroll and count keys are intercepted. ' +
                    'Leave empty for defaults (markdown, graph, pdf, canvas, empty, image). ' +
                    'Plugin views not in this list receive their own keystrokes.',
            )
            .addText((text) =>
                text
                    .setPlaceholder('')
                    .setValue(this.plugin.settings.workspaceNavViewTypes)
                    .onChange(async (value) => {
                        this.plugin.settings.workspaceNavViewTypes = value;
                        await this.plugin.saveSettings();
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
                        setClipboardOption(value);
                        const vim = getVimApi();
                        if (vim) vim.setOption('clipboard', value);
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
                        const vim = getVimApi();
                        if (vim) vim.setOption('tabstop', value);
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
                        const vim = getVimApi();
                        if (vim) vim.setOption('shiftwidth', value);
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
                        const vim = getVimApi();
                        if (vim) vim.setOption('expandtab', value);
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
                        const vim = getVimApi();
                        if (vim) vim.setOption('insertmodeescape', value);
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
                    const clamped = Number.isNaN(n)
                        ? 1000
                        : Math.max(100, Math.min(5000, n));
                    this.plugin.settings.insertmodeescapetimeout = clamped;
                    this.plugin.vimrcOverrides?.delete(
                        'insertmodeescapetimeout',
                    );
                    await this.plugin.saveSettings();
                    const vim = getVimApi();
                    if (vim) vim.setOption('insertmodeescapetimeout', clamped);
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
                    const clamped = Number.isNaN(n)
                        ? 0
                        : Math.max(0, Math.min(200, n));
                    this.plugin.settings.textwidth = clamped;
                    this.plugin.vimrcOverrides?.delete('textwidth');
                    await this.plugin.saveSettings();
                    if (clamped > 0) setTextwidth(clamped);
                    const vim = getVimApi();
                    if (vim) vim.setOption('textwidth', clamped);
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
            .setName('Configuration mode')
            .setDesc(
                describeOverride(
                    'configMode',
                    'How the plugin loads configuration files. Lua + Vimrc loads both with Lua taking precedence on conflicts.',
                ),
            )
            .addDropdown((dropdown) =>
                dropdown
                    .addOptions({
                        'lua-vimrc': 'Lua + Vimrc (recommended)',
                        lua: 'Lua only',
                        vimrc: 'Vimrc only',
                        settings: 'Settings only',
                    })
                    .setValue(this.plugin.settings.configMode)
                    .setDisabled(isOverridden('configMode'))
                    .onChange(async (value) => {
                        this.plugin.settings.configMode = value as
                            | 'lua-vimrc'
                            | 'lua'
                            | 'vimrc'
                            | 'settings';
                        this.plugin.vimrcOverrides?.delete('configMode');
                        this.plugin.luaOverrides?.delete('configMode');
                        await this.plugin.saveSettings();
                    }),
            );

        const luaSetting = new Setting(containerEl)
            .setName('Custom init.lua path')
            .setDesc(
                `Path to an init.lua file. Vault-relative or absolute (desktop only, e.g. ~/.config/obsidian/init.lua). Leave empty to search: ${getLuaFallbackPaths(this.app).join(', ')}.`,
            )
            .addText((text) => {
                text.setPlaceholder(LUA_FALLBACK_PATHS[0]!)
                    .setValue(this.plugin.settings.luaConfigPath)
                    .setDisabled(
                        ['vimrc', 'settings'].includes(
                            this.plugin.settings.configMode,
                        ),
                    )
                    .onChange(async (value) => {
                        this.plugin.settings.luaConfigPath = value;
                        await this.plugin.saveSettings();
                    });
                new VimrcFileSuggest(this.app, text.inputEl);
            });
        void resolveLuaConfigPath(
            this.app,
            this.plugin.settings.luaConfigPath || undefined,
        ).then(({ path, found }) => {
            const statusEl = luaSetting.descEl.createSpan();
            if (found) {
                statusEl.setText(` Currently using: ${path}`);
                statusEl.addClass('vim-motions-config-path-active');
            } else if (this.plugin.settings.luaConfigPath) {
                statusEl.setText(
                    ` File not found: ${this.plugin.settings.luaConfigPath}`,
                );
                statusEl.addClass('vim-motions-config-path-error');
            }
        });

        const vimrcSetting = new Setting(containerEl)
            .setName('Custom vimrc path')
            .setDesc(
                `Path to a vimrc file. Vault-relative or absolute (desktop only, e.g. ~/.config/obsidian/vimrc). Leave empty to search: ${getVimrcFallbackPaths(this.app).join(', ')}.`,
            )
            .addText((text) => {
                text.setPlaceholder(VIMRC_FALLBACK_PATHS[0]!)
                    .setValue(this.plugin.settings.vimrcPath)
                    .setDisabled(
                        ['lua', 'settings'].includes(
                            this.plugin.settings.configMode,
                        ),
                    )
                    .onChange(async (value) => {
                        this.plugin.settings.vimrcPath = value;
                        await this.plugin.saveSettings();
                    });
                new VimrcFileSuggest(this.app, text.inputEl);
            });
        void resolveVimrcPath(
            this.app,
            this.plugin.settings.vimrcPath || undefined,
        ).then(({ path, found }) => {
            const statusEl = vimrcSetting.descEl.createSpan();
            if (found) {
                statusEl.setText(` Currently using: ${path}`);
                statusEl.addClass('vim-motions-config-path-active');
            } else if (this.plugin.settings.vimrcPath) {
                statusEl.setText(
                    ` File not found: ${this.plugin.settings.vimrcPath}`,
                );
                statusEl.addClass('vim-motions-config-path-error');
            }
        });

        new Setting(containerEl).setName('Leader key bindings').setHeading();
        new Setting(containerEl).setDesc(
            'Map leader key sequences to Obsidian commands. Applied in addition to vimrc bindings.',
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
            .addText((text) => {
                text.setValue(String(this.plugin.settings.scrolloffLines));
                text.inputEl.type = 'number';
                text.inputEl.min = '0';
                text.inputEl.max = '9999';
                text.setDisabled(isOverridden('scrolloffLines'));
                text.onChange(async (value) => {
                    const n = Number(value);
                    const clamped = Number.isNaN(n)
                        ? 5
                        : Math.max(0, Math.min(9999, Math.floor(n)));
                    this.plugin.settings.scrolloffLines = clamped;
                    this.plugin.vimrcOverrides?.delete('scrolloffLines');
                    await this.plugin.saveSettings();
                    this.plugin.reloadFeatures();
                });
            });

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
