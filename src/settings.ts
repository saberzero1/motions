import {
    App,
    Notice,
    Platform,
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
import { getCommandRegistry } from './util/commands';
import { isBuiltinVimEnabled } from './util/vault';
import { setClipboardOption, setTextwidth } from './vim/options';
import type { SerializedUndoTree } from './vim/undo-tree';
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
    icon?: string;
    color?: string;
}

export interface CommandLabel {
    key: string;
    label: string;
    icon?: string;
    color?: string;
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
    enableSubwordMotions: boolean;
    enableWorkspaceNav: boolean;
    workspaceNavViewTypes: string;
    picker: boolean;
    pickerLeaderMappings: boolean;
    pickerMatcherEngine: 'ufuzzy' | 'obsidian';
    pickerOmnisearch: boolean;
    pickerTasks: boolean;
    pickerDataview: boolean;
    ripgrepEnabled: boolean;
    ripgrepBinaryPath: string;
    ripgrepArgs: string;
    grepMode: 'ripgrep' | 'grep';
    frecencyData?: Record<string, { count: number; timestamps: number[] }>;
    persistedMarks?: {
        name: string;
        filePath: string;
        line: number;
        ch: number;
    }[];
    persistedJumpList?: { filePath: string; line: number; ch: number }[];
    persistedUndoTrees: Record<string, SerializedUndoTree>;
    harpoonPins?: ({ filePath: string; row: number; col: number } | null)[];
    configMode: 'lua-vimrc' | 'lua' | 'vimrc' | 'settings';
    enableStatusBar: boolean;
    enableChordDisplay: boolean;
    enablePowerline: boolean;
    modePrompts: ModePrompts;
    enableEasyMotion: boolean;
    easyMotionDimming: boolean;
    enableFlash: boolean;
    flashMultiLine: boolean;
    flashJumpEnabled: boolean;
    flashJumpKey: string;
    flashCleverF: boolean;
    flashMinPatternLength: number;
    flashSearch: boolean;
    enableHardWrap: boolean;
    enableReplaceWithRegister: boolean;
    enableDial: boolean;
    listContinuationOnOpen: boolean;
    enableTableNav: boolean;
    tableWidgetMode: 'off' | 'cursor' | 'always' | 'embedded';
    yankHighlightMode: 'off' | 'solid' | 'fade';
    yankHighlightDuration: number;

    /** @deprecated Migrated to `signcolumn`. Kept for settings migration only. */
    enableMarkGutter?: boolean;
    signcolumn: string;
    number: boolean;
    relativenumber: boolean;
    numberwidth: number;
    linenumbermode: 'hybrid' | 'dual' | 'dual-rel-abs';
    statuscolumn: string;
    cursorline: boolean;
    cursorlineopt: 'number' | 'line' | 'both';
    foldcolumn: boolean;
    enableHarpoon: boolean;
    enableYankRing: boolean;
    enableHintMode: boolean;
    hintModeLabels: string;
    hintModeHotkey: string;
    scrolloffLines: number;
    multilineScanLimit: number;
    easyMotionLabels: string;
    labelFontSize: number;
    labelMatchFontSize: boolean;
    cursorShapes: CursorShapes;
    clipboard: string;
    tabstop: number;
    shiftwidth: number;
    expandtab: boolean;
    insertmodeescape: string;
    insertmodeescapetimeout: number;
    operatorshadowtimeout: number;
    textwidth: number;
    whichKeyMode: 'off' | 'leader' | 'all';
    whichKeyGrouping: 'flat' | 'grouped';
    whichKeyDelay: number;
    whichKeySortOrder: 'which-key' | 'groups-first';
    whichKeyIcons: boolean;
    whichKeyGroupLabels: GroupLabel[];
    whichKeyCommandLabels: CommandLabel[];
    vimrcPath: string;
    luaConfigPath: string;
    showConfigNotifications: boolean;
    leaderBindings: LeaderBinding[];
    foldAwareNavigation: boolean;
    foldPersistence: boolean;
    oilExplorer: boolean;
    oilShowHiddenFiles: boolean;
    oilConfirmDeleteThreshold: number;
    oilDefaultSort: 'name' | 'mtime' | 'size';
    pickerKeymap: {
        moveDown: string[];
        moveUp: string[];
        confirm: string[];
        splitH: string[];
        splitV: string[];
        openTab: string[];
        scrollDown: string[];
        scrollUp: string[];
        close: string[];
    };

    imEnabled: boolean;
    imPreset: 'custom' | 'macism' | 'im-select' | 'fcitx5-remote' | 'ibus';
    imBinaryPath: string;
    imObtainArgs: string;
    imSwitchArgs: string;
    imDefaultNormalIm: string;
    imRestoreBehavior: 'restore' | 'default';
    imDefaultInsertIm: string;
    persistedImState: Record<string, string>;

    enableSnippets: boolean;
    snippetBundled: boolean;
    snippetDirectory: string;
    snippetTriggerMode: 'completion' | 'tab' | 'both';

    enableVimTextareas: boolean;

    enableUndoTree: boolean;
    undoFile: boolean;
    undoTreeMaxNodes: number;
    undoTreePosition: 'left' | 'right';
    undoTreeAutoOpen: boolean;

    animatedCursor: boolean;
    smoothCursor: boolean;
    cursorSmoothness: number;
    smearTrail: boolean;
    smearStiffness: number;
    smearTrailingStiffness: number;
    smearDamping: number;
    smearMaxLength: number;
}

export const DEFAULT_SETTINGS: VimMotionsSettings = {
    enableOnMobile: false,
    enableTextObjects: true,
    enableNavigation: true,
    enableSubwordMotions: false,
    enableWorkspaceNav: true,
    workspaceNavViewTypes: '',
    picker: true,
    pickerLeaderMappings: true,
    pickerMatcherEngine: 'ufuzzy',
    pickerOmnisearch: true,
    pickerTasks: true,
    pickerDataview: true,
    ripgrepEnabled: false,
    ripgrepBinaryPath: '',
    ripgrepArgs: '--smart-case --glob "*.md"',
    grepMode: 'ripgrep' as const,
    frecencyData: undefined,
    configMode: 'lua-vimrc',
    enableStatusBar: true,
    enableChordDisplay: true,
    enablePowerline: false,
    modePrompts: { ...DEFAULT_MODE_PROMPTS },
    enableEasyMotion: true,
    easyMotionDimming: true,
    enableFlash: true,
    flashMultiLine: true,
    flashJumpEnabled: false,
    flashJumpKey: 's',
    flashCleverF: false,
    flashMinPatternLength: 1,
    flashSearch: true,
    enableHardWrap: true,
    enableReplaceWithRegister: true,
    enableDial: false,
    listContinuationOnOpen: true,
    enableTableNav: true,
    tableWidgetMode: 'cursor',
    yankHighlightMode: 'solid',
    yankHighlightDuration: 200,

    signcolumn: 'auto',
    number: false,
    relativenumber: false,
    numberwidth: 2,
    linenumbermode: 'hybrid',
    statuscolumn: '',
    cursorline: true,
    cursorlineopt: 'number',
    foldcolumn: false,
    enableHarpoon: true,
    enableYankRing: true,
    enableHintMode: true,
    hintModeLabels: 'asdfghjkl',
    hintModeHotkey: '',
    scrolloffLines: 5,
    multilineScanLimit: 20,
    easyMotionLabels: 'asdghklqwertyuiopzxcvbnmfj',
    labelFontSize: 14,
    labelMatchFontSize: false,
    cursorShapes: { ...DEFAULT_CURSOR_SHAPES },
    clipboard: '',
    tabstop: 4,
    shiftwidth: 4,
    expandtab: true,
    insertmodeescape: '',
    insertmodeescapetimeout: 1000,
    operatorshadowtimeout: 1000,
    textwidth: 80,
    whichKeyMode: 'off',
    whichKeyGrouping: 'grouped',
    whichKeyDelay: 500,
    whichKeySortOrder: 'which-key',
    whichKeyIcons: true,
    whichKeyGroupLabels: [],
    whichKeyCommandLabels: [],
    vimrcPath: '',
    luaConfigPath: '',
    showConfigNotifications: true,
    leaderBindings: [],
    foldAwareNavigation: true,
    foldPersistence: false,
    oilExplorer: true,
    oilShowHiddenFiles: false,
    oilConfirmDeleteThreshold: 1,
    oilDefaultSort: 'name',
    pickerKeymap: {
        moveDown: ['ArrowDown', 'C-n', 'C-j'],
        moveUp: ['ArrowUp', 'C-p', 'C-k'],
        confirm: ['Enter'],
        splitH: ['C-x'],
        splitV: ['C-v'],
        openTab: ['C-t'],
        scrollDown: ['C-d'],
        scrollUp: ['C-u'],
        close: ['Escape', 'C-c'],
    },

    imEnabled: false,
    imPreset: 'custom' as const,
    imBinaryPath: '',
    imObtainArgs: '',
    imSwitchArgs: '{im}',
    imDefaultNormalIm: '',
    imRestoreBehavior: 'restore' as const,
    imDefaultInsertIm: '',
    persistedImState: {},

    enableSnippets: true,
    snippetBundled: true,
    snippetDirectory: '',
    snippetTriggerMode: 'both' as const,

    enableVimTextareas: false,

    enableUndoTree: true,
    undoFile: false,
    undoTreeMaxNodes: 1000,
    undoTreePosition: 'right' as const,
    undoTreeAutoOpen: false,
    persistedUndoTrees: {},

    animatedCursor: false,
    smoothCursor: true,
    cursorSmoothness: 0.5,
    smearTrail: true,
    smearStiffness: 0.6,
    smearTrailingStiffness: 0.3,
    smearDamping: 0.85,
    smearMaxLength: 400,
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
        const allCommands = getCommandRegistry(app);
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
    private activeSettingsTab: string = 'general';

    private refreshSettingsDisplay(): void {
        (this as unknown as { display(): void }).display();
    }

    private syncVisibilityClass(
        containerEl: HTMLElement,
        cls: string,
        on: boolean,
    ): void {
        containerEl.classList.toggle(cls, on);
    }

    /** Settings keys that require reloadFeatures() after change. */
    private static readonly RELOAD_KEYS = new Set([
        'pickerMatcherEngine',
        'enableTextObjects',
        'enableNavigation',
        'enableSubwordMotions',
        'enableHardWrap',
        'enableReplaceWithRegister',
        'enableDial',
        'listContinuationOnOpen',
        'enableTableNav',
        'tableWidgetMode',
        'yankHighlightMode',
        'enableWorkspaceNav',
        'enableEasyMotion',
        'enableFlash',
        'flashMultiLine',
        'flashJumpEnabled',
        'flashJumpKey',
        'flashCleverF',
        'flashMinPatternLength',
        'flashSearch',
        'enableHintMode',
        'enableHarpoon',
        'enableYankRing',
        'enableVimTextareas',
        'foldAwareNavigation',
        'foldPersistence',
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
        'whichKeySortOrder',
        'whichKeyIcons',
        'imEnabled',
        'imBinaryPath',
        'imObtainArgs',
        'imSwitchArgs',
        'imDefaultNormalIm',
        'imRestoreBehavior',
        'imDefaultInsertIm',
        'pickerOmnisearch',
        'pickerTasks',
        'pickerDataview',
        'ripgrepEnabled',
        'ripgrepBinaryPath',
        'ripgrepArgs',
        'grepMode',
        'enableSnippets',
        'snippetBundled',
        'snippetDirectory',
        'snippetTriggerMode',
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

        const builtinVimOn = isBuiltinVimEnabled(this.app);

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

            // ── General ────────────────────────────────────────────────
            {
                type: 'page' as const,
                name: 'General',
                desc: 'Mobile, vim features, picker, and vim engine options',
                status: () => (builtinVimOn ? 'warning' : null),
                items: [
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
                                aliases: [
                                    'text objects',
                                    'markdown objects',
                                    'i*',
                                    'a*',
                                ],
                                control: {
                                    type: 'toggle' as const,
                                    key: 'enableTextObjects',
                                    defaultValue: true,
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
                                aliases: [
                                    'structural navigation',
                                    ']h',
                                    '[h',
                                    ']l',
                                    '[l',
                                ],
                                control: {
                                    type: 'toggle' as const,
                                    key: 'enableNavigation',
                                    defaultValue: true,
                                    disabled: () =>
                                        this.isOverridden('enableNavigation'),
                                },
                            },
                            {
                                name: 'Subword motions (w/b/e/ge)',
                                desc: this.describeOverride(
                                    'enableSubwordMotions',
                                    'Override w/b/e/ge to stop at camelCase, snake_case, and kebab-case boundaries (spider.nvim-style).',
                                ),
                                aliases: [
                                    'spider',
                                    'camelCase',
                                    'snake_case',
                                    'word boundary',
                                ],
                                control: {
                                    type: 'toggle' as const,
                                    key: 'enableSubwordMotions',
                                    disabled: () =>
                                        this.isOverridden(
                                            'enableSubwordMotions',
                                        ),
                                },
                            },
                            {
                                name: 'Hard-wrap operator (gq)',
                                desc: this.describeOverride(
                                    'enableHardWrap',
                                    'Enable gq operator to reformat paragraphs with Markdown-aware line wrapping.',
                                ),
                                aliases: [
                                    'gq',
                                    'gw',
                                    'paragraph wrap',
                                    'line wrap',
                                ],
                                control: {
                                    type: 'toggle' as const,
                                    key: 'enableHardWrap',
                                    defaultValue: true,
                                    disabled: () =>
                                        this.isOverridden('enableHardWrap'),
                                },
                            },
                            {
                                name: 'Replace-with-register operator (gr)',
                                desc: this.describeOverride(
                                    'enableReplaceWithRegister',
                                    'Enable gr{motion} operator to replace text with register contents. ' +
                                        'When enabled, grn/grr/gra workspace bindings are relocated to ' +
                                        '<leader>rn/<leader>rb/<leader>ra.',
                                ),
                                aliases: ['gr', 'paste over', 'replace motion'],
                                control: {
                                    type: 'toggle' as const,
                                    key: 'enableReplaceWithRegister',
                                    defaultValue: true,
                                    disabled: () =>
                                        this.isOverridden(
                                            'enableReplaceWithRegister',
                                        ),
                                },
                            },
                            {
                                name: 'Enhanced increment/decrement (<C-a>/<C-x>)',
                                desc: this.describeOverride(
                                    'enableDial',
                                    'Extends <C-a>/<C-x> to cycle hex colors, booleans, dates, CSS values, and checkboxes (dial.nvim-style).',
                                ),
                                aliases: [
                                    'dial',
                                    'increment',
                                    'decrement',
                                    'ctrl-a',
                                    'ctrl-x',
                                ],
                                control: {
                                    type: 'toggle' as const,
                                    key: 'enableDial',
                                    disabled: () =>
                                        this.isOverridden('enableDial'),
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
                                    defaultValue: true,
                                    disabled: () =>
                                        this.isOverridden(
                                            'listContinuationOnOpen',
                                        ),
                                },
                            },
                            {
                                name: 'Table navigation',
                                desc: this.describeOverride(
                                    'enableTableNav',
                                    'Enable table cell navigation motions (]|/[| or ]c/[c to move between cells).',
                                ),
                                aliases: [
                                    'table',
                                    'cell navigation',
                                    ']|',
                                    '[|',
                                ],
                                control: {
                                    type: 'toggle' as const,
                                    key: 'enableTableNav',
                                    defaultValue: true,
                                    disabled: () =>
                                        this.isOverridden('enableTableNav'),
                                },
                            },
                            {
                                name: 'Table widget in live preview',
                                desc: this.describeOverride(
                                    'tableWidgetMode',
                                    'Controls how tables display in Live Preview. ' +
                                        '"Embedded" opens a vim-enabled editor overlay when editing a table. ' +
                                        '"Always raw" keeps tables as plain text. ' +
                                        '"Cursor-aware" shows a rendered table when the cursor is outside and raw Markdown when editing. ' +
                                        '"Off" uses the default interactive table editor.',
                                ),
                                aliases: [
                                    'table rendering',
                                    'live preview tables',
                                    'raw table',
                                ],
                                control: {
                                    type: 'dropdown' as const,
                                    key: 'tableWidgetMode',
                                    options: {
                                        embedded: 'Embedded',
                                        always: 'Always raw',
                                        cursor: 'Cursor-aware',
                                        off: 'Off',
                                    },
                                    disabled: () =>
                                        this.isOverridden('tableWidgetMode'),
                                },
                            },
                            {
                                name: 'Vim keybindings in text areas',
                                desc: this.describeOverride(
                                    'enableVimTextareas',
                                    'Replace focused text areas with a vim-enabled editor. The editor starts in insert mode — press Escape for normal mode. Experimental.',
                                ),
                                visible: Platform.isDesktop,
                                control: {
                                    type: 'toggle' as const,
                                    key: 'enableVimTextareas' as const,
                                    disabled: () =>
                                        this.isOverridden('enableVimTextareas'),
                                },
                            },
                        ],
                    },

                    // ── Picker ──────────────────────────────────────────────
                    {
                        type: 'group' as const,
                        heading: 'Picker',
                        items: [
                            {
                                name: 'Fuzzy picker for buffers',
                                desc: this.describeOverride(
                                    'picker',
                                    'Use the unified fuzzy picker for :buffers/:ls (files and commands always use the picker).',
                                ),
                                control: {
                                    type: 'toggle' as const,
                                    key: 'picker',
                                    defaultValue: true,
                                    disabled: () => this.isOverridden('picker'),
                                },
                            },
                            {
                                name: 'Picker leader mappings',
                                desc: 'Enable default <leader>f* picker mappings and which-key labels.',
                                control: {
                                    type: 'toggle' as const,
                                    key: 'pickerLeaderMappings',
                                    defaultValue: true,
                                },
                            },
                            {
                                name: 'Picker matching engine',
                                desc: 'Fuzzy matching engine for the picker. uFuzzy is a fast pure-JS matcher with filename-aware ranking. Obsidian uses the built-in API.',
                                control: {
                                    type: 'dropdown' as const,
                                    key: 'pickerMatcherEngine',
                                    options: {
                                        ufuzzy: 'uFuzzy',
                                        obsidian: 'Obsidian built-in',
                                    },
                                },
                            },
                            {
                                name: 'Use external grep binary',
                                desc: this.describeOverride(
                                    'ripgrepEnabled',
                                    'Use a local grep/ripgrep binary for faster vault search. Desktop only. Falls back to in-memory search if unavailable.',
                                ),
                                visible: Platform.isDesktop,
                                control: {
                                    type: 'toggle' as const,
                                    key: 'ripgrepEnabled',
                                },
                            },
                            {
                                name: 'Grep binary mode',
                                desc: this.describeOverride(
                                    'grepMode',
                                    'Which binary to use. "ripgrep" expects rg with --json output. "grep" expects GNU/BSD grep with -rn output.',
                                ),
                                visible: () =>
                                    Platform.isDesktop &&
                                    this.plugin.settings.ripgrepEnabled,
                                control: {
                                    type: 'dropdown' as const,
                                    key: 'grepMode',
                                    options: {
                                        ripgrep: 'ripgrep (rg)',
                                        grep: 'grep (GNU/BSD)',
                                    },
                                },
                            },
                            {
                                name: 'Grep binary path',
                                desc: this.describeOverride(
                                    'ripgrepBinaryPath',
                                    'Absolute path to the grep binary (e.g., /usr/bin/rg, /usr/bin/grep). Tilde (~) supported.',
                                ),
                                visible: () =>
                                    Platform.isDesktop &&
                                    this.plugin.settings.ripgrepEnabled,
                                control: {
                                    type: 'text' as const,
                                    key: 'ripgrepBinaryPath',
                                    placeholder:
                                        this.plugin.settings.grepMode === 'grep'
                                            ? '/usr/bin/grep'
                                            : '/usr/bin/rg',
                                    validate: (value: string) => {
                                        if (
                                            value &&
                                            !value.startsWith('/') &&
                                            !value.startsWith('~') &&
                                            !/^[A-Za-z]:/.test(value)
                                        )
                                            return 'Path must be absolute (e.g. /usr/bin/rg or ~/bin/rg)';
                                        return undefined;
                                    },
                                },
                            },
                            {
                                name: 'Extra arguments',
                                desc: this.describeOverride(
                                    'ripgrepArgs',
                                    'Additional arguments passed to the grep binary. For rg: --smart-case --glob "*.md". For grep: -i --include="*.md".',
                                ),
                                visible: () =>
                                    Platform.isDesktop &&
                                    this.plugin.settings.ripgrepEnabled,
                                control: {
                                    type: 'text' as const,
                                    key: 'ripgrepArgs',
                                    placeholder:
                                        this.plugin.settings.grepMode === 'grep'
                                            ? '-i --include="*.md"'
                                            : '--smart-case --glob "*.md"',
                                },
                            },
                            {
                                name: 'Omnisearch',
                                desc: 'Register Omnisearch as a picker source for full-text vault search.',
                                control: {
                                    type: 'toggle' as const,
                                    key: 'pickerOmnisearch',
                                    defaultValue: true,
                                },
                            },
                            {
                                name: 'Obsidian Tasks',
                                desc: 'Register Obsidian Tasks as a picker source for navigating tasks.',
                                control: {
                                    type: 'toggle' as const,
                                    key: 'pickerTasks',
                                    defaultValue: true,
                                },
                            },
                            {
                                name: 'Dataview',
                                desc: 'Register Dataview as a picker source for browsing indexed pages.',
                                control: {
                                    type: 'toggle' as const,
                                    key: 'pickerDataview',
                                    defaultValue: true,
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
                                aliases: [
                                    'system clipboard',
                                    'yank clipboard',
                                    'copy paste',
                                ],
                                control: {
                                    type: 'dropdown' as const,
                                    key: 'clipboard',
                                    options: {
                                        '': 'Off',
                                        unnamed: 'Unnamed',
                                        unnamedplus: 'Unnamedplus',
                                    },
                                    disabled: () =>
                                        this.isOverridden('clipboard'),
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
                                    disabled: () =>
                                        this.isOverridden('tabstop'),
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
                                    disabled: () =>
                                        this.isOverridden('shiftwidth'),
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
                                    defaultValue: true,
                                    disabled: () =>
                                        this.isOverridden('expandtab'),
                                },
                            },
                            {
                                name: 'Insert mode escape',
                                desc: this.describeOverride(
                                    'insertmodeescape',
                                    'Two-key sequence to exit insert mode (e.g. jk).',
                                ),
                                aliases: [
                                    'jk escape',
                                    'jj escape',
                                    'escape sequence',
                                    'insert exit',
                                ],
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
                                        this.isOverridden(
                                            'insertmodeescapetimeout',
                                        ),
                                    validate: (value: number) => {
                                        if (value < 100 || value > 5000)
                                            return 'Must be between 100 and 5000';
                                        return undefined;
                                    },
                                },
                            },
                            {
                                name: 'Operator shadow timeout',
                                desc: this.describeOverride(
                                    'operatorshadowtimeout',
                                    'Timeout in milliseconds for operator-prefix disambiguation (0\u20135000). When an operator is pending and the next key matches both a motion and an operator-pending action prefix (e.g. surround), waits this long before falling back to the motion. Set to 0 to disable.',
                                ),
                                control: {
                                    type: 'number' as const,
                                    key: 'operatorshadowtimeout',
                                    min: 0,
                                    max: 5000,
                                    disabled: () =>
                                        this.isOverridden(
                                            'operatorshadowtimeout',
                                        ),
                                    validate: (value: number) => {
                                        if (value < 0 || value > 5000)
                                            return 'Must be between 0 and 5000';
                                        return undefined;
                                    },
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
                                    disabled: () =>
                                        this.isOverridden('textwidth'),
                                    validate: (value: number) => {
                                        if (value < 0 || value > 200)
                                            return 'Must be between 0 and 200';
                                        return undefined;
                                    },
                                },
                            },
                        ],
                    },
                ],
            },

            // ── Appearance ─────────────────────────────────────────────
            {
                type: 'page' as const,
                name: 'Appearance',
                desc: 'Line numbers, gutter, status bar, cursor shapes, and visual effects',
                items: [
                    // ── Line numbers ────────────────────────────────────────
                    {
                        type: 'group' as const,
                        heading: 'Line numbers',
                        items: [
                            {
                                name: 'Line numbers',
                                desc: this.describeOverride(
                                    'number',
                                    'Show absolute line numbers in the gutter. Equivalent to `set number` in Neovim.',
                                ),
                                control: {
                                    type: 'toggle' as const,
                                    key: 'number',
                                    disabled: () => this.isOverridden('number'),
                                },
                            },
                            {
                                name: 'Relative line numbers',
                                desc: this.describeOverride(
                                    'relativenumber',
                                    'Show relative line numbers (distance from cursor). When both are enabled, shows hybrid mode (absolute on current line, relative on others). Equivalent to `set relativenumber` in Neovim.',
                                ),
                                control: {
                                    type: 'toggle' as const,
                                    key: 'relativenumber',
                                    disabled: () =>
                                        this.isOverridden('relativenumber'),
                                },
                            },
                            {
                                name: 'Number width',
                                desc: this.describeOverride(
                                    'numberwidth',
                                    'Minimum width of the line number column in characters (1\u201320). The gutter auto-expands for larger files.',
                                ),
                                control: {
                                    type: 'number' as const,
                                    key: 'numberwidth',
                                    min: 1,
                                    max: 20,
                                    disabled: () =>
                                        this.isOverridden('numberwidth'),
                                },
                            },
                            {
                                name: 'Line number display',
                                desc: this.describeOverride(
                                    'linenumbermode',
                                    'How to display line numbers when both absolute and relative are enabled. Hybrid: single column (Neovim default). Dual: absolute and relative in separate columns.',
                                ),
                                control: {
                                    type: 'dropdown' as const,
                                    key: 'linenumbermode',
                                    options: {
                                        hybrid: 'Hybrid (single column)',
                                        dual: 'Dual (abs | rel)',
                                        'dual-rel-abs': 'Dual (rel | abs)',
                                    },
                                    disabled: () =>
                                        this.isOverridden('linenumbermode'),
                                },
                            },
                            {
                                name: 'Cursor line highlight',
                                desc: this.describeOverride(
                                    'cursorline',
                                    'Highlight the current cursor line. Equivalent to `set cursorline` in Neovim.',
                                ),
                                control: {
                                    type: 'toggle' as const,
                                    key: 'cursorline',
                                    defaultValue: true,
                                    disabled: () =>
                                        this.isOverridden('cursorline'),
                                },
                            },
                            {
                                name: 'Cursor line highlight mode',
                                desc: this.describeOverride(
                                    'cursorlineopt',
                                    'What to highlight on the cursor line: Number (line number only), Line (line background), or Both.',
                                ),
                                control: {
                                    type: 'dropdown' as const,
                                    key: 'cursorlineopt',
                                    options: {
                                        number: 'Number',
                                        line: 'Line',
                                        both: 'Both',
                                    },
                                    disabled: () =>
                                        this.isOverridden('cursorlineopt'),
                                },
                            },
                            {
                                name: 'Sign column',
                                desc: this.describeOverride(
                                    'signcolumn',
                                    'Show vim mark letters (a-z, A-Z) in a dedicated gutter column. Auto: show gutter when marks exist. Always: always reserve gutter space. Off: never show.',
                                ),
                                aliases: [
                                    'marks gutter',
                                    'mark indicators',
                                    'sign gutter',
                                ],
                                control: {
                                    type: 'dropdown' as const,
                                    key: 'signcolumn',
                                    options: {
                                        auto: 'Auto',
                                        yes: 'Always',
                                        no: 'Off',
                                    },
                                    disabled: () =>
                                        this.isOverridden('signcolumn'),
                                },
                            },
                            {
                                name: 'Fold column',
                                desc: this.describeOverride(
                                    'foldcolumn',
                                    'Show fold indicators (\u25b8/\u25be) in the gutter for foldable regions. Click to toggle folds.',
                                ),
                                aliases: ['fold gutter', 'fold indicators'],
                                control: {
                                    type: 'toggle' as const,
                                    key: 'foldcolumn',
                                    disabled: () =>
                                        this.isOverridden('foldcolumn'),
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
                                    defaultValue: true,
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
                                visible: () =>
                                    this.plugin.settings.enableStatusBar,
                                control: {
                                    type: 'toggle' as const,
                                    key: 'enableChordDisplay',
                                    defaultValue: true,
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
                                visible: () =>
                                    this.plugin.settings.enableStatusBar,
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
                                        this.isOverridden(
                                            'modePrompts.replace',
                                        ),
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
                                        this.isOverridden(
                                            'modePrompts.visualLine',
                                        ),
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
                                        this.isOverridden(
                                            'modePrompts.visualBlock',
                                        ),
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
                                        this.isOverridden(
                                            'modePrompts.vreplace',
                                        ),
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
                                        this.isOverridden(
                                            'modePrompts.command',
                                        ),
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
                                        this.isOverridden(
                                            'modePrompts.insertNormal',
                                        ),
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

                    // ── Animated cursor ──────────────────────────────────────
                    {
                        type: 'group' as const,
                        heading: 'Animated cursor',
                        items: [
                            {
                                name: 'Smooth cursor movement and smear trail effects. Incompatible with ninja-cursor and cursor-smith plugins.',
                                searchable: false,
                            },
                            {
                                name: 'Enable animated cursor',
                                desc: 'Render cursor on canvas with smooth movement and optional trail effects.',
                                aliases: [
                                    'smooth cursor',
                                    'smear',
                                    'animated',
                                    'cursor animation',
                                ],
                                control: {
                                    type: 'toggle' as const,
                                    key: 'animatedCursor',
                                },
                            },
                            {
                                name: 'Smooth cursor movement',
                                desc: 'Cursor glides between positions instead of teleporting.',
                                visible: () =>
                                    this.plugin.settings.animatedCursor,
                                control: {
                                    type: 'toggle' as const,
                                    key: 'smoothCursor',
                                    defaultValue: true,
                                    disabled: () =>
                                        !this.plugin.settings.animatedCursor,
                                },
                            },
                            {
                                name: 'Cursor smoothness',
                                desc: 'How lazy the cursor movement feels. 0 = snap, 1 = very slow.',
                                visible: () =>
                                    this.plugin.settings.animatedCursor &&
                                    this.plugin.settings.smoothCursor,
                                control: {
                                    type: 'slider' as const,
                                    key: 'cursorSmoothness',
                                    min: 0,
                                    max: 1,
                                    step: 0.05,
                                    disabled: () =>
                                        !this.plugin.settings.animatedCursor ||
                                        !this.plugin.settings.smoothCursor,
                                },
                            },
                            {
                                name: 'Enable smear trail',
                                desc: 'Spring-damper trail stretching between old and new cursor position.',
                                aliases: ['trail', 'smear cursor'],
                                visible: () =>
                                    this.plugin.settings.animatedCursor,
                                control: {
                                    type: 'toggle' as const,
                                    key: 'smearTrail',
                                    defaultValue: true,
                                    disabled: () =>
                                        !this.plugin.settings.animatedCursor,
                                },
                            },
                            {
                                name: 'Trail stiffness',
                                desc: 'Head corner spring strength. Higher = trail snaps back faster.',
                                visible: () =>
                                    this.plugin.settings.animatedCursor &&
                                    this.plugin.settings.smearTrail,
                                control: {
                                    type: 'slider' as const,
                                    key: 'smearStiffness',
                                    min: 0.1,
                                    max: 1,
                                    step: 0.05,
                                    disabled: () =>
                                        !this.plugin.settings.animatedCursor ||
                                        !this.plugin.settings.smearTrail,
                                },
                            },
                            {
                                name: 'Trail trailing stiffness',
                                desc: 'Tail corner spring strength. Lower = longer, more dramatic trail.',
                                visible: () =>
                                    this.plugin.settings.animatedCursor &&
                                    this.plugin.settings.smearTrail,
                                control: {
                                    type: 'slider' as const,
                                    key: 'smearTrailingStiffness',
                                    min: 0.1,
                                    max: 1,
                                    step: 0.05,
                                    disabled: () =>
                                        !this.plugin.settings.animatedCursor ||
                                        !this.plugin.settings.smearTrail,
                                },
                            },
                            {
                                name: 'Trail damping',
                                desc: 'Velocity decay. Lower values produce bouncier trails.',
                                visible: () =>
                                    this.plugin.settings.animatedCursor &&
                                    this.plugin.settings.smearTrail,
                                control: {
                                    type: 'slider' as const,
                                    key: 'smearDamping',
                                    min: 0.1,
                                    max: 0.99,
                                    step: 0.01,
                                    disabled: () =>
                                        !this.plugin.settings.animatedCursor ||
                                        !this.plugin.settings.smearTrail,
                                },
                            },
                            {
                                name: 'Trail max length',
                                desc: 'Maximum trail length in pixels.',
                                visible: () =>
                                    this.plugin.settings.animatedCursor &&
                                    this.plugin.settings.smearTrail,
                                control: {
                                    type: 'slider' as const,
                                    key: 'smearMaxLength',
                                    min: 50,
                                    max: 800,
                                    step: 10,
                                    disabled: () =>
                                        !this.plugin.settings.animatedCursor ||
                                        !this.plugin.settings.smearTrail,
                                },
                            },
                        ],
                    },

                    // ── Yank highlight ──────────────────────────────────────
                    {
                        type: 'group' as const,
                        heading: 'Yank highlight',
                        items: [
                            {
                                name: 'Yank highlight',
                                desc: this.describeOverride(
                                    'yankHighlightMode',
                                    'Highlight yanked text. "Solid" shows the highlight and removes it after the duration (Neovim-style). "Fade" gradually fades the highlight out.',
                                ),
                                control: {
                                    type: 'dropdown' as const,
                                    key: 'yankHighlightMode',
                                    options: {
                                        off: 'Off',
                                        solid: 'Solid',
                                        fade: 'Fade',
                                    },
                                    disabled: () =>
                                        this.isOverridden('yankHighlightMode'),
                                },
                            },
                            {
                                name: 'Yank highlight duration',
                                desc: this.describeOverride(
                                    'yankHighlightDuration',
                                    'How long the yank highlight stays visible in milliseconds (50–3000).',
                                ),
                                visible: () =>
                                    this.plugin.settings.yankHighlightMode !==
                                    'off',
                                control: {
                                    type: 'number' as const,
                                    key: 'yankHighlightDuration',
                                    min: 50,
                                    max: 3000,
                                    disabled: () =>
                                        this.isOverridden(
                                            'yankHighlightDuration',
                                        ),
                                },
                            },
                        ],
                    },
                ],
            },

            // ── Navigation ─────────────────────────────────────────────
            {
                type: 'page' as const,
                name: 'Navigation',
                desc: 'Jump navigation, flash, EasyMotion, and workspace navigation',
                items: [
                    // ── Jump navigation ─────────────────────────────────────
                    {
                        type: 'group' as const,
                        heading: 'Jump navigation',
                        search: {
                            placeholder: 'Filter jump navigation settings...',
                            match: (def, query) => {
                                const q = query.toLowerCase();
                                const name = def.name.toLowerCase();
                                const desc = (
                                    typeof def.desc === 'string' ? def.desc : ''
                                ).toLowerCase();
                                const aliases = def.aliases ?? [];
                                return (
                                    name.includes(q) ||
                                    desc.includes(q) ||
                                    aliases.some((a) =>
                                        a.toLowerCase().includes(q),
                                    )
                                );
                            },
                        },
                        items: [
                            {
                                name: 'EasyMotion',
                                desc: this.describeOverride(
                                    'enableEasyMotion',
                                    'Enable easymotion/hop navigation (<leader><leader>w, <leader><leader>f, <leader><leader>j).',
                                ),
                                aliases: [
                                    'hop',
                                    'jump labels',
                                    'leader leader',
                                ],
                                control: {
                                    type: 'toggle' as const,
                                    key: 'enableEasyMotion',
                                    defaultValue: true,
                                    disabled: () =>
                                        this.isOverridden('enableEasyMotion'),
                                },
                            },
                            {
                                name: 'Flash-style f/F/t/T',
                                desc: this.describeOverride(
                                    'enableFlash',
                                    'Show labels on all visible matches when pressing f/F/t/T. Single match auto-jumps.',
                                ),
                                aliases: [
                                    'flash.nvim',
                                    'enhanced f',
                                    'char jump',
                                ],
                                control: {
                                    type: 'toggle' as const,
                                    key: 'enableFlash',
                                    defaultValue: true,
                                    disabled: () =>
                                        this.isOverridden('enableFlash'),
                                },
                            },
                            {
                                name: 'Flash multi-line',
                                desc: this.describeOverride(
                                    'flashMultiLine',
                                    'Search beyond the current line for f/F/t/T matches (flash.nvim behavior).',
                                ),
                                visible: () => this.plugin.settings.enableFlash,
                                control: {
                                    type: 'toggle' as const,
                                    key: 'flashMultiLine',
                                    defaultValue: true,
                                    disabled: () =>
                                        this.isOverridden('flashMultiLine'),
                                },
                            },
                            {
                                name: 'Flash jump mode (s)',
                                desc: this.describeOverride(
                                    'flashJumpEnabled',
                                    'Enable bidirectional character jump with a configurable key (default: s). Normal mode only.',
                                ),
                                visible: () => this.plugin.settings.enableFlash,
                                control: {
                                    type: 'toggle' as const,
                                    key: 'flashJumpEnabled',
                                    disabled: () =>
                                        this.isOverridden('flashJumpEnabled'),
                                },
                            },
                            {
                                name: 'Flash jump key',
                                desc: this.describeOverride(
                                    'flashJumpKey',
                                    'Key to trigger flash jump mode (default: s). Overrides the default binding for this key.',
                                ),
                                visible: () =>
                                    this.plugin.settings.enableFlash &&
                                    this.plugin.settings.flashJumpEnabled,
                                control: {
                                    type: 'text' as const,
                                    key: 'flashJumpKey',
                                    disabled: () =>
                                        this.isOverridden('flashJumpKey'),
                                },
                            },
                            {
                                name: 'Flash clever-f',
                                desc: this.describeOverride(
                                    'flashCleverF',
                                    'Pressing f/F again after a flash jump repeats the search (like clever-f.vim).',
                                ),
                                visible: () => this.plugin.settings.enableFlash,
                                control: {
                                    type: 'toggle' as const,
                                    key: 'flashCleverF',
                                    disabled: () =>
                                        this.isOverridden('flashCleverF'),
                                },
                            },
                            {
                                name: 'Flash min pattern length',
                                desc: this.describeOverride(
                                    'flashMinPatternLength',
                                    'Minimum characters before labels appear in jump mode (1 = immediate).',
                                ),
                                visible: () => this.plugin.settings.enableFlash,
                                control: {
                                    type: 'text' as const,
                                    key: 'flashMinPatternLength',
                                    disabled: () =>
                                        this.isOverridden(
                                            'flashMinPatternLength',
                                        ),
                                },
                            },
                            {
                                name: 'Flash search labels',
                                desc: this.describeOverride(
                                    'flashSearch',
                                    'Show labels on search matches after committing a / or ? search.',
                                ),
                                visible: () => this.plugin.settings.enableFlash,
                                control: {
                                    type: 'toggle' as const,
                                    key: 'flashSearch',
                                    defaultValue: true,
                                    disabled: () =>
                                        this.isOverridden('flashSearch'),
                                },
                            },
                            {
                                name: 'EasyMotion dimming',
                                desc: this.describeOverride(
                                    'easyMotionDimming',
                                    'Dim non-target text when EasyMotion or flash is active.',
                                ),
                                visible: () =>
                                    this.plugin.settings.enableEasyMotion,
                                control: {
                                    type: 'toggle' as const,
                                    key: 'easyMotionDimming',
                                    defaultValue: true,
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
                                visible: () =>
                                    this.plugin.settings.enableEasyMotion,
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
                                aliases: [
                                    'vimium',
                                    'link hints',
                                    'click labels',
                                ],
                                control: {
                                    type: 'toggle' as const,
                                    key: 'enableHintMode',
                                    defaultValue: true,
                                    disabled: () =>
                                        this.isOverridden('enableHintMode'),
                                },
                            },
                            {
                                name: 'Hint mode label characters',
                                desc: this.describeOverride(
                                    'hintModeLabels',
                                    'Characters used for hint labels (home-row recommended). Fewer characters = longer labels.',
                                ),
                                visible: () =>
                                    this.plugin.settings.enableHintMode,
                                control: {
                                    type: 'text' as const,
                                    key: 'hintModeLabels',
                                    disabled: () =>
                                        this.isOverridden('hintModeLabels'),
                                },
                            },
                            {
                                name: 'Hint mode global hotkey',
                                desc: this.describeOverride(
                                    'hintModeHotkey',
                                    'Key combination to trigger hint mode from anywhere, including modals. Click the button and press a key combination to set.',
                                ),
                                visible: () =>
                                    this.plugin.settings.enableHintMode,
                                render: (setting: Setting) => {
                                    this.renderHotkeyControl(setting);
                                },
                            },
                            {
                                name: 'Label font size',
                                desc: this.describeOverride(
                                    'labelFontSize',
                                    'Font size for EasyMotion and hint mode labels (10–20px). ' +
                                        'Override colors via CSS: --vim-motions-em-bg/fg (EasyMotion), --vim-motions-hint-bg/fg (hint mode).',
                                ),
                                visible: () =>
                                    this.plugin.settings.enableEasyMotion ||
                                    this.plugin.settings.enableHintMode,
                                control: {
                                    type: 'slider' as const,
                                    key: 'labelFontSize',
                                    min: 10,
                                    max: 20,
                                    step: 1,
                                    disabled: () =>
                                        this.isOverridden('labelFontSize'),
                                },
                            },
                            {
                                name: 'Scale labels to line height',
                                desc: this.describeOverride(
                                    'labelMatchFontSize',
                                    'Scale label font to match the target line\u2019s font size (e.g., larger labels on headings). When disabled, uses the configured label font size.',
                                ),
                                visible: () =>
                                    this.plugin.settings.enableEasyMotion ||
                                    this.plugin.settings.enableHintMode,
                                control: {
                                    type: 'toggle' as const,
                                    key: 'labelMatchFontSize',
                                    disabled: () =>
                                        this.isOverridden('labelMatchFontSize'),
                                },
                            },
                            {
                                name: 'Harpoon file pinning',
                                desc: this.describeOverride(
                                    'enableHarpoon',
                                    'Pin files to numbered slots for instant switching (<leader>1\u20139). Add pins with <leader>ha, list with <leader>hp.',
                                ),
                                control: {
                                    type: 'toggle' as const,
                                    key: 'enableHarpoon',
                                    defaultValue: true,
                                    disabled: () =>
                                        this.isOverridden('enableHarpoon'),
                                },
                            },
                            {
                                name: 'Yank-ring paste cycling',
                                desc: this.describeOverride(
                                    'enableYankRing',
                                    'Cycle through yank/delete history with <C-p>/<C-n> after pasting. When disabled, <C-p>/<C-n> act as k/j.',
                                ),
                                control: {
                                    type: 'toggle' as const,
                                    key: 'enableYankRing',
                                    defaultValue: true,
                                    disabled: () =>
                                        this.isOverridden('enableYankRing'),
                                },
                            },
                        ],
                    },

                    // ── Workspace navigation ────────────────────────────
                    {
                        type: 'group' as const,
                        heading: 'Workspace navigation',
                        items: [
                            {
                                name: 'Workspace navigation',
                                desc: this.describeOverride(
                                    'enableWorkspaceNav',
                                    'Enable pane/tab/sidebar control (<C-w>h/j/k/l, gt/gT, :sidebar, etc.). Note: <C-w> may conflict with Obsidian\u2019s "Close current tab" hotkey \u2014 rebind it in Settings \u2192 Hotkeys.',
                                ),
                                aliases: [
                                    'pane',
                                    'split',
                                    'tab navigation',
                                    'C-w',
                                    'gt',
                                    'gT',
                                ],
                                control: {
                                    type: 'toggle' as const,
                                    key: 'enableWorkspaceNav',
                                    defaultValue: true,
                                    disabled: () =>
                                        this.isOverridden('enableWorkspaceNav'),
                                },
                            },
                            {
                                name: 'Workspace navigation view types',
                                desc: 'Comma-separated view types where scroll and count keys are intercepted. Leave empty for defaults (markdown, graph, pdf, canvas, empty, image, bases). Plugin views not in this list receive their own keystrokes.',
                                visible: () =>
                                    this.plugin.settings.enableWorkspaceNav,
                                control: {
                                    type: 'text' as const,
                                    key: 'workspaceNavViewTypes',
                                },
                            },
                            {
                                name: 'Fold-aware navigation',
                                desc: this.describeOverride(
                                    'foldAwareNavigation',
                                    'Automatically unfold sections when navigating into them (e.g., ]h into a folded heading).',
                                ),
                                control: {
                                    type: 'toggle' as const,
                                    key: 'foldAwareNavigation',
                                    defaultValue: true,
                                    disabled: () =>
                                        this.isOverridden(
                                            'foldAwareNavigation',
                                        ),
                                },
                            },
                            {
                                name: 'Fold persistence',
                                desc: this.describeOverride(
                                    'foldPersistence',
                                    'Remember fold state across file switches and sessions. Capped at 500 files, 30-day eviction.',
                                ),
                                control: {
                                    type: 'toggle' as const,
                                    key: 'foldPersistence',
                                    disabled: () =>
                                        this.isOverridden('foldPersistence'),
                                },
                            },
                        ],
                    },
                ],
            },

            // ── Keybindings ────────────────────────────────────────────
            {
                type: 'page' as const,
                name: 'Keybindings',
                desc: 'Vimrc, Lua config, leader bindings, and which-key',
                items: [
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
                                        'lua-vimrc':
                                            'Lua + Vimrc (recommended)',
                                        lua: 'Lua only',
                                        vimrc: 'Vimrc only',
                                        settings: 'Settings only',
                                    },
                                    disabled: () =>
                                        this.isOverridden('configMode'),
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
                                    validate: (value: string) => {
                                        if (
                                            value &&
                                            (value.endsWith('/') ||
                                                value.endsWith('\\'))
                                        )
                                            return 'Path should point to a file, not a directory';
                                        return undefined;
                                    },
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
                                    validate: (value: string) =>
                                        value &&
                                        (value.endsWith('/') ||
                                            value.endsWith('\\'))
                                            ? 'Path should point to a file, not a directory'
                                            : undefined,
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
                                    defaultValue: true,
                                    disabled: () =>
                                        this.plugin.settings.configMode ===
                                        'settings',
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
                                    setting.settingEl.addClass(
                                        'vim-motions-hidden',
                                    );
                                    const container =
                                        setting.settingEl.parentElement;
                                    if (container)
                                        this.renderLeaderBindings(container);
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
                                    disabled: () =>
                                        this.isOverridden('whichKeyMode'),
                                },
                            },
                            {
                                name: 'Which-key leader grouping',
                                desc: this.describeOverride(
                                    'whichKeyGrouping',
                                    'How leader key bindings are displayed. ' +
                                        '"Grouped" collapses bindings by prefix (e.g. t → +5 keys) and lets you drill down. ' +
                                        '"Flat" shows all bindings at once.',
                                ),
                                visible: () =>
                                    this.plugin.settings.whichKeyMode !== 'off',
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
                                    'Delay in milliseconds before the which-key popup appears (0–2000). ' +
                                        'Only applies to the initial popup — subsequent keystrokes update the popup instantly.',
                                ),
                                visible: () =>
                                    this.plugin.settings.whichKeyMode !== 'off',
                                control: {
                                    type: 'number' as const,
                                    key: 'whichKeyDelay',
                                    min: 0,
                                    max: 2000,
                                    disabled: () =>
                                        this.isOverridden('whichKeyDelay'),
                                },
                            },
                            {
                                name: 'Which-key sort order',
                                desc: this.describeOverride(
                                    'whichKeySortOrder',
                                    'How entries are sorted in the which-key popup. ' +
                                        '"which-key" matches which-key.nvim defaults: individual keys first, groups last, ' +
                                        'alphanumeric before special keys, natural alphabetical tiebreaker. ' +
                                        '"Groups first" shows groups before individual keys, both sorted alphabetically.',
                                ),
                                visible: () =>
                                    this.plugin.settings.whichKeyMode !== 'off',
                                control: {
                                    type: 'dropdown' as const,
                                    key: 'whichKeySortOrder',
                                    options: {
                                        'which-key': 'which-key.nvim (default)',
                                        'groups-first':
                                            'Groups first, then keys (alphabetical)',
                                    },
                                    disabled: () =>
                                        this.isOverridden('whichKeySortOrder'),
                                },
                            },
                            {
                                name: 'Which-key icons',
                                desc: this.describeOverride(
                                    'whichKeyIcons',
                                    'Show icons next to entries in the which-key popup.',
                                ),
                                visible: () =>
                                    this.plugin.settings.whichKeyMode !== 'off',
                                control: {
                                    type: 'toggle' as const,
                                    key: 'whichKeyIcons',
                                    defaultValue: true,
                                    disabled: () =>
                                        this.isOverridden('whichKeyIcons'),
                                },
                            },
                        ],
                    },

                    // ── Which-key group labels ──────────────────────────────
                    {
                        type: 'group' as const,
                        heading: 'Which-key group labels',
                        visible: () =>
                            this.plugin.settings.whichKeyMode !== 'off',
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
                                    setting.settingEl.addClass(
                                        'vim-motions-hidden',
                                    );
                                    const container =
                                        setting.settingEl.parentElement;
                                    if (container)
                                        this.renderGroupLabels(container);
                                },
                            },
                        ],
                    },

                    // ── Which-key command labels ────────────────────────────
                    {
                        type: 'group' as const,
                        heading: 'Which-key command labels',
                        visible: () =>
                            this.plugin.settings.whichKeyMode !== 'off',
                        items: [
                            {
                                name: 'Describe individual bindings in the which-key popup. Entries set in vimrc appear as read-only rows.',
                                searchable: false,
                            },
                            {
                                name: 'Command labels',
                                searchable: false,
                                render: (setting: Setting) => {
                                    setting.settingEl.addClass(
                                        'vim-motions-hidden',
                                    );
                                    const container =
                                        setting.settingEl.parentElement;
                                    if (container)
                                        this.renderCommandLabels(container);
                                },
                            },
                        ],
                    },
                ],
            },

            // ── Snippets & files ───────────────────────────────────────
            {
                type: 'page' as const,
                name: 'Snippets & files',
                desc: 'Snippet expansion, file explorer, and undo tree',
                items: [
                    // ── Snippets ─────────────────────────────────────────────
                    {
                        type: 'group' as const,
                        heading: 'Snippets',
                        items: [
                            {
                                name: 'Enable snippets',
                                desc: 'Enable snippet expansion with tabstop navigation, variables, and completion.',
                                aliases: [
                                    'snippet expansion',
                                    'tabstop',
                                    'luasnip',
                                ],
                                control: {
                                    type: 'toggle' as const,
                                    key: 'enableSnippets',
                                    defaultValue: true,
                                },
                            },
                            {
                                name: 'Bundled snippets',
                                desc: 'Include built-in Obsidian Markdown snippets (headings, callouts, wikilinks, tables, etc.).',
                                visible: () =>
                                    this.plugin.settings.enableSnippets,
                                control: {
                                    type: 'toggle' as const,
                                    key: 'snippetBundled',
                                    defaultValue: true,
                                },
                            },
                            {
                                name: 'Snippet directory',
                                desc: 'Path to a directory containing user snippet JSON files. Supports ~ for home directory and absolute paths (desktop only).',
                                visible: () =>
                                    this.plugin.settings.enableSnippets,
                                control: {
                                    type: 'folder' as const,
                                    key: 'snippetDirectory',
                                    placeholder: 'snippets',
                                    includeRoot: true,
                                },
                            },
                            {
                                name: 'Trigger mode',
                                desc: 'How snippets are triggered: completion menu (type prefix to see suggestions), tab expansion (type prefix + tab), or both.',
                                visible: () =>
                                    this.plugin.settings.enableSnippets,
                                control: {
                                    type: 'dropdown' as const,
                                    key: 'snippetTriggerMode',
                                    options: {
                                        both: 'Both',
                                        completion: 'Completion menu only',
                                        tab: 'Tab expansion only',
                                    },
                                },
                            },
                        ],
                    },

                    // ── File explorer ────────────────────────────────────────
                    {
                        type: 'group' as const,
                        heading: 'File explorer',
                        items: [
                            {
                                name: 'Oil explorer',
                                desc: 'Enable the oil-style file explorer (:oil command).',
                                aliases: [
                                    'oil.nvim',
                                    'file manager',
                                    'directory buffer',
                                ],
                                control: {
                                    type: 'toggle' as const,
                                    key: 'oilExplorer',
                                    defaultValue: true,
                                },
                            },
                            {
                                name: 'Show hidden files',
                                desc: 'Show dotfiles and hidden folders in oil views.',
                                visible: () => this.plugin.settings.oilExplorer,
                                control: {
                                    type: 'toggle' as const,
                                    key: 'oilShowHiddenFiles',
                                },
                            },
                            {
                                name: 'Confirm delete threshold',
                                desc: 'Show confirmation dialog when deleting this many files or more.',
                                visible: () => this.plugin.settings.oilExplorer,
                                control: {
                                    type: 'slider' as const,
                                    key: 'oilConfirmDeleteThreshold',
                                    min: 1,
                                    max: 20,
                                    step: 1,
                                },
                            },
                            {
                                name: 'Default sort order',
                                desc: 'Default sort order for oil directory listings.',
                                visible: () => this.plugin.settings.oilExplorer,
                                control: {
                                    type: 'dropdown' as const,
                                    key: 'oilDefaultSort',
                                    options: {
                                        name: 'Name',
                                        mtime: 'Modified time',
                                        size: 'Size',
                                    },
                                },
                            },
                        ],
                    },

                    {
                        type: 'group' as const,
                        heading: 'Undo tree',
                        items: [
                            {
                                name: 'Undo tree',
                                desc: 'Track branching undo history for g+/g- navigation, :earlier/:later commands, and :undolist visualization.',
                                aliases: [
                                    'undotree',
                                    'undo history',
                                    'branching undo',
                                ],
                                control: {
                                    type: 'toggle' as const,
                                    key: 'enableUndoTree',
                                    defaultValue: true,
                                },
                            },
                            {
                                name: 'Persist undo history',
                                desc: 'Save undo tree to disk so it survives across sessions. Per-file undo history is stored in plugin data.',
                                visible: () =>
                                    this.plugin.settings.enableUndoTree,
                                control: {
                                    type: 'toggle' as const,
                                    key: 'undoFile',
                                },
                            },
                            {
                                name: 'Maximum undo tree nodes',
                                desc: 'Maximum number of undo states to keep per editor. Oldest leaf branches are pruned when exceeded.',
                                visible: () =>
                                    this.plugin.settings.enableUndoTree,
                                control: {
                                    type: 'slider' as const,
                                    key: 'undoTreeMaxNodes',
                                    min: 100,
                                    max: 5000,
                                    step: 100,
                                },
                            },
                            {
                                name: 'Sidebar position',
                                desc: 'Which sidebar to open the undo tree view in.',
                                visible: () =>
                                    this.plugin.settings.enableUndoTree,
                                control: {
                                    type: 'dropdown' as const,
                                    key: 'undoTreePosition',
                                    options: {
                                        left: 'Left',
                                        right: 'Right',
                                    },
                                },
                            },
                            {
                                name: 'Auto-open on branch',
                                desc: 'Automatically open the undo tree sidebar when a branch is created (undo + new edit).',
                                visible: () =>
                                    this.plugin.settings.enableUndoTree,
                                control: {
                                    type: 'toggle' as const,
                                    key: 'undoTreeAutoOpen',
                                },
                            },
                        ],
                    },
                ],
            },

            // ── Input method ───────────────────────────────────────────
            {
                type: 'page' as const,
                name: 'Input method',
                desc: 'Automatic input method switching for CJK users',
                visible: Platform.isDesktop,
                items: [
                    // ── Input method ─────────────────────────────────────────
                    {
                        type: 'group' as const,
                        heading: 'Input method',
                        visible: Platform.isDesktop,
                        items: [
                            {
                                name: 'Enable input method switching',
                                desc: 'Automatically switch input methods when entering/leaving insert mode. Requires an external IM switching binary (e.g. macism, fcitx5-remote, im-select). Desktop only.',
                                aliases: [
                                    'CJK',
                                    'input method',
                                    'fcitx',
                                    'ibus',
                                    'macism',
                                ],
                                control: {
                                    type: 'toggle' as const,
                                    key: 'imEnabled',
                                },
                            },
                            {
                                name: 'IM preset',
                                desc: 'Select a preset to auto-fill binary path and arguments for common IM tools.',
                                visible: () => this.plugin.settings.imEnabled,
                                control: {
                                    type: 'dropdown' as const,
                                    key: 'imPreset',
                                    options: {
                                        custom: 'Custom',
                                        macism: 'macism (macOS)',
                                        'im-select': 'im-select (Windows)',
                                        'fcitx5-remote':
                                            'fcitx5-remote (Linux)',
                                        ibus: 'ibus (Linux)',
                                    },
                                },
                            },
                            {
                                name: 'IM binary path',
                                desc: 'Absolute path to the input method switching binary (e.g. /opt/homebrew/bin/macism, /usr/bin/fcitx5-remote, C:\\im-select\\im-select.exe). Tilde (~) paths are supported.',
                                visible: () => this.plugin.settings.imEnabled,
                                control: {
                                    type: 'text' as const,
                                    key: 'imBinaryPath',
                                    placeholder: '/opt/homebrew/bin/macism',
                                },
                            },
                            {
                                name: 'Obtain IM arguments',
                                desc: 'Arguments to query the current input method. Leave empty if the binary returns the current IM when invoked without arguments (macism, im-select). For fcitx5-remote use: -n',
                                visible: () => this.plugin.settings.imEnabled,
                                control: {
                                    type: 'text' as const,
                                    key: 'imObtainArgs',
                                    placeholder: '',
                                },
                            },
                            {
                                name: 'Switch IM arguments',
                                desc: 'Arguments to switch the input method. Use {im} as a placeholder for the IM identifier. For macism/im-select: {im} — For fcitx5-remote: -s {im} — For ibus: engine {im}',
                                visible: () => this.plugin.settings.imEnabled,
                                control: {
                                    type: 'text' as const,
                                    key: 'imSwitchArgs',
                                    placeholder: '{im}',
                                },
                            },
                            {
                                name: 'Normal mode IM',
                                desc: 'IM identifier to switch to in normal mode (e.g. com.apple.keylayout.ABC, keyboard-us, 1033).',
                                visible: () => this.plugin.settings.imEnabled,
                                control: {
                                    type: 'text' as const,
                                    key: 'imDefaultNormalIm',
                                    placeholder: 'com.apple.keylayout.ABC',
                                },
                            },
                            {
                                name: 'Insert mode IM behavior',
                                desc: 'Restore: switch back to the IM that was active before leaving insert mode. Default: always switch to a fixed IM when entering insert mode.',
                                visible: () => this.plugin.settings.imEnabled,
                                control: {
                                    type: 'dropdown' as const,
                                    key: 'imRestoreBehavior',
                                    options: {
                                        restore: 'Restore previous IM',
                                        default: 'Use fixed default IM',
                                    },
                                },
                            },
                            {
                                name: 'Default insert mode IM',
                                desc:
                                    this.plugin.settings.imDefaultInsertIm ===
                                    ''
                                        ? '⚠️ Set a default insert IM identifier, otherwise no IM switch will occur on InsertEnter.'
                                        : 'IM identifier to switch to when entering insert mode.',
                                visible: () =>
                                    this.plugin.settings.imEnabled &&
                                    this.plugin.settings.imRestoreBehavior ===
                                        'default',
                                control: {
                                    type: 'text' as const,
                                    key: 'imDefaultInsertIm',
                                    placeholder:
                                        'com.apple.inputmethod.SCIM.ITABC',
                                },
                            },
                        ],
                    },
                ],
            },

            // ── Advanced ───────────────────────────────────────────────
            {
                type: 'page' as const,
                name: 'Advanced',
                desc: 'Scrolloff and scan limits',
                items: [
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
                                    disabled: () =>
                                        this.isOverridden('scrolloffLines'),
                                    validate: (value: number) =>
                                        value < 0
                                            ? 'Must be 0 or greater'
                                            : undefined,
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
                                    validate: (value: number) =>
                                        value < 5 || value > 200
                                            ? 'Must be between 5 and 200'
                                            : undefined,
                                },
                            },
                        ],
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

        if (
            key === 'number' ||
            key === 'relativenumber' ||
            key === 'numberwidth' ||
            key === 'linenumbermode'
        ) {
            this.plugin.reconfigureLineNumberGutter();
        } else if (key === 'cursorline' || key === 'cursorlineopt') {
            this.plugin.reconfigureCursorlineHighlight();
        } else if (key === 'signcolumn') {
            this.plugin.reconfigureSignColumnGutter();
        } else if (key === 'statuscolumn') {
            this.plugin.reconfigureStatusColumnGutter();
        } else if (key === 'foldcolumn') {
            this.plugin.reconfigureFoldColumnGutter();
        } else if (VimMotionsSettingTab.RELOAD_KEYS.has(key)) {
            this.plugin.reloadFeatures();
        }

        (this as unknown as { refreshDomState?(): void }).refreshDomState?.();
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

        const builtinVimOn = isBuiltinVimEnabled(this.app);

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

        const SETTINGS_TABS = [
            { id: 'general', label: 'General' },
            { id: 'appearance', label: 'Appearance' },
            { id: 'navigation', label: 'Navigation' },
            { id: 'keybindings', label: 'Keybindings' },
            { id: 'snippets-files', label: 'Snippets & files' },
            { id: 'input-method', label: 'Input method' },
            { id: 'advanced', label: 'Advanced' },
        ] as const;

        const tabBar = containerEl.createEl('nav', {
            cls: 'vim-motions-settings-tabs',
        });
        for (const tab of SETTINGS_TABS) {
            if (tab.id === 'input-method' && !Platform.isDesktop) continue;
            const btn = tabBar.createEl('button', {
                text: tab.label,
                cls: 'vim-motions-settings-tab-btn',
            });
            if (tab.id === this.activeSettingsTab) {
                btn.addClass('is-active');
            }
            btn.addEventListener('click', () => {
                this.activeSettingsTab = tab.id;
                this.refreshSettingsDisplay();
            });
        }

        const contentEl = containerEl.createDiv({
            cls: 'vim-motions-settings-content',
        });

        switch (this.activeSettingsTab) {
            case 'general':
                this.renderGeneralTab(
                    contentEl,
                    describeOverride,
                    isOverridden,
                );
                break;
            case 'appearance':
                this.renderAppearanceTab(
                    contentEl,
                    describeOverride,
                    isOverridden,
                );
                break;
            case 'navigation':
                this.renderNavigationTab(
                    contentEl,
                    describeOverride,
                    isOverridden,
                );
                break;
            case 'keybindings':
                this.renderKeybindingsTab(
                    contentEl,
                    describeOverride,
                    isOverridden,
                );
                break;
            case 'snippets-files':
                this.renderSnippetsFilesTab(
                    contentEl,
                    describeOverride,
                    isOverridden,
                );
                break;
            case 'input-method':
                this.renderInputMethodTab(contentEl);
                break;
            case 'advanced':
                this.renderAdvancedTab(
                    contentEl,
                    describeOverride,
                    isOverridden,
                );
                break;
        }
    }

    private renderGeneralTab(
        containerEl: HTMLElement,
        describeOverride: (key: string, desc?: string) => string,
        isOverridden: (key: string) => boolean,
    ): void {
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
            .setName('Subword motions (w/b/e/ge)')
            .setDesc(
                describeOverride(
                    'enableSubwordMotions',
                    'Override w/b/e/ge to stop at camelCase, snake_case, and kebab-case boundaries (spider.nvim-style).',
                ),
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableSubwordMotions)
                    .setDisabled(isOverridden('enableSubwordMotions'))
                    .onChange(async (value) => {
                        this.plugin.settings.enableSubwordMotions = value;
                        this.plugin.vimrcOverrides?.delete(
                            'enableSubwordMotions',
                        );
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
            .setName('Replace-with-register operator (gr)')
            .setDesc(
                describeOverride(
                    'enableReplaceWithRegister',
                    'Enable gr{motion} operator to replace text with register contents. ' +
                        'When enabled, grn/grr/gra workspace bindings are relocated to ' +
                        '<leader>rn/<leader>rb/<leader>ra.',
                ),
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableReplaceWithRegister)
                    .setDisabled(isOverridden('enableReplaceWithRegister'))
                    .onChange(async (value) => {
                        this.plugin.settings.enableReplaceWithRegister = value;
                        this.plugin.vimrcOverrides?.delete(
                            'enableReplaceWithRegister',
                        );
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );

        new Setting(containerEl)
            .setName('Enhanced increment/decrement (<C-a>/<C-x>)')
            .setDesc(
                describeOverride(
                    'enableDial',
                    'Extends <C-a>/<C-x> to cycle hex colors, booleans, dates, CSS values, and checkboxes (dial.nvim-style).',
                ),
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableDial)
                    .setDisabled(isOverridden('enableDial'))
                    .onChange(async (value) => {
                        this.plugin.settings.enableDial = value;
                        this.plugin.vimrcOverrides?.delete('enableDial');
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
                        '"Embedded" opens a vim-enabled editor overlay when editing a table. ' +
                        '"Always raw" keeps tables as plain text. ' +
                        '"Cursor-aware" shows a rendered table when the cursor is outside and raw Markdown when editing. ' +
                        '"Off" uses the default interactive table editor.',
                ),
            )
            .addDropdown((dropdown) =>
                dropdown
                    .addOption('embedded', 'Embedded')
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

        // ── Picker ──────────────────────────────────────────────────

        new Setting(containerEl).setName('Picker').setHeading();

        new Setting(containerEl)
            .setName('Fuzzy picker for buffers')
            .setDesc(
                describeOverride(
                    'picker',
                    'Use the unified fuzzy picker for :buffers/:ls (files and commands always use the picker).',
                ),
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.picker)
                    .setDisabled(isOverridden('picker'))
                    .onChange(async (value) => {
                        this.plugin.settings.picker = value;
                        this.plugin.vimrcOverrides?.delete('picker');
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );

        new Setting(containerEl)
            .setName('Picker leader mappings')
            .setDesc(
                'Enable default <leader>f* picker mappings and which-key labels.',
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.pickerLeaderMappings)
                    .onChange(async (value) => {
                        this.plugin.settings.pickerLeaderMappings = value;
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );

        new Setting(containerEl)
            .setName('Picker matching engine')
            .setDesc(
                'Fuzzy matching engine for the picker. uFuzzy is a fast pure-JS matcher with filename-aware ranking. Obsidian uses the built-in API.',
            )
            .addDropdown((dropdown) =>
                dropdown
                    .addOptions({
                        ufuzzy: 'uFuzzy',
                        obsidian: 'Obsidian built-in',
                    })
                    .setValue(this.plugin.settings.pickerMatcherEngine)
                    .onChange(async (value) => {
                        this.plugin.settings.pickerMatcherEngine = value as
                            | 'ufuzzy'
                            | 'obsidian';
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );

        if (Platform.isDesktop) {
            new Setting(containerEl)
                .setName('Use external grep binary')
                .setDesc(
                    'Use a local grep/ripgrep binary for faster vault search. Desktop only. Falls back to in-memory search if unavailable.',
                )
                .addToggle((toggle) =>
                    toggle
                        .setValue(this.plugin.settings.ripgrepEnabled)
                        .onChange(async (value) => {
                            this.plugin.settings.ripgrepEnabled = value;
                            await this.plugin.saveSettings();
                            this.plugin.reloadFeatures();
                        }),
                );

            if (this.plugin.settings.ripgrepEnabled) {
                new Setting(containerEl)
                    .setName('Grep binary mode')
                    .setDesc(
                        'Which binary to use. "ripgrep" expects rg with --json output. "grep" expects GNU/BSD grep with -rn output.',
                    )
                    .addDropdown((dropdown) =>
                        dropdown
                            .addOptions({
                                ripgrep: 'ripgrep (rg)',
                                grep: 'grep (GNU/BSD)',
                            })
                            .setValue(this.plugin.settings.grepMode)
                            .onChange(async (value) => {
                                this.plugin.settings.grepMode = value as
                                    | 'ripgrep'
                                    | 'grep';
                                await this.plugin.saveSettings();
                                this.plugin.reloadFeatures();
                            }),
                    );

                new Setting(containerEl)
                    .setName('Grep binary path')
                    .setDesc(
                        'Absolute path to the grep binary (e.g., /usr/bin/rg, /usr/bin/grep). Tilde (~) supported.',
                    )
                    .addText((text) =>
                        text
                            .setPlaceholder(
                                this.plugin.settings.grepMode === 'grep'
                                    ? '/usr/bin/grep'
                                    : '/usr/bin/rg',
                            )
                            .setValue(this.plugin.settings.ripgrepBinaryPath)
                            .onChange(async (value) => {
                                this.plugin.settings.ripgrepBinaryPath = value;
                                await this.plugin.saveSettings();
                            }),
                    );

                new Setting(containerEl)
                    .setName('Extra arguments')
                    .setDesc(
                        'Additional arguments passed to the grep binary. For rg: --smart-case --glob "*.md". For grep: -i --include="*.md".',
                    )
                    .addText((text) =>
                        text
                            .setPlaceholder(
                                this.plugin.settings.grepMode === 'grep'
                                    ? '-i --include="*.md"'
                                    : '--smart-case --glob "*.md"',
                            )
                            .setValue(this.plugin.settings.ripgrepArgs)
                            .onChange(async (value) => {
                                this.plugin.settings.ripgrepArgs = value;
                                await this.plugin.saveSettings();
                            }),
                    );
            }
        }

        new Setting(containerEl)
            .setName('Omnisearch')
            .setDesc(
                'Register Omnisearch as a picker source for full-text vault search.',
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.pickerOmnisearch)
                    .onChange(async (value) => {
                        this.plugin.settings.pickerOmnisearch = value;
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );

        new Setting(containerEl)
            .setName('Obsidian Tasks')
            .setDesc(
                'Register Obsidian Tasks as a picker source for navigating tasks.',
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.pickerTasks)
                    .onChange(async (value) => {
                        this.plugin.settings.pickerTasks = value;
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );

        new Setting(containerEl)
            .setName('Dataview')
            .setDesc(
                'Register Dataview as a picker source for browsing indexed pages.',
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.pickerDataview)
                    .onChange(async (value) => {
                        this.plugin.settings.pickerDataview = value;
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );

        if (Platform.isDesktop) {
            new Setting(containerEl)
                .setName('Vim keybindings in text areas')
                .setDesc(
                    describeOverride(
                        'enableVimTextareas',
                        'Replace focused text areas with a vim-enabled editor. The editor starts in insert mode \u2014 press Escape for normal mode. Experimental.',
                    ),
                )
                .addToggle((toggle) =>
                    toggle
                        .setValue(this.plugin.settings.enableVimTextareas)
                        .setDisabled(isOverridden('enableVimTextareas'))
                        .onChange(async (value) => {
                            this.plugin.settings.enableVimTextareas = value;
                            this.plugin.vimrcOverrides?.delete(
                                'enableVimTextareas',
                            );
                            await this.plugin.saveSettings();
                            this.plugin.reloadFeatures();
                        }),
                );
        }

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
            .setName('Operator shadow timeout')
            .setDesc(
                describeOverride(
                    'operatorshadowtimeout',
                    'Timeout in milliseconds for operator-prefix disambiguation (0–5000). When an operator is pending and the next key matches both a motion and an operator-pending action prefix (e.g. surround), waits this long before falling back to the motion. Set to 0 to disable.',
                ),
            )
            .addText((text) => {
                text.setValue(
                    String(this.plugin.settings.operatorshadowtimeout),
                );
                text.inputEl.type = 'number';
                text.inputEl.min = '0';
                text.inputEl.max = '5000';
                text.setDisabled(isOverridden('operatorshadowtimeout'));
                text.onChange(async (value) => {
                    const n = Number(value);
                    const clamped = Number.isNaN(n)
                        ? 1000
                        : Math.max(0, Math.min(5000, n));
                    this.plugin.settings.operatorshadowtimeout = clamped;
                    this.plugin.vimrcOverrides?.delete('operatorshadowtimeout');
                    await this.plugin.saveSettings();
                    const vim = getVimApi();
                    if (vim) vim.setOption('operatorshadowtimeout', clamped);
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
    }

    private renderAppearanceTab(
        containerEl: HTMLElement,
        describeOverride: (key: string, desc?: string) => string,
        isOverridden: (key: string) => boolean,
    ): void {
        // ── Line numbers ─────────────────────────────────────────────

        new Setting(containerEl).setName('Line numbers').setHeading();

        new Setting(containerEl)
            .setName('Line numbers')
            .setDesc(
                describeOverride(
                    'number',
                    'Show absolute line numbers in the gutter. Equivalent to `set number` in Neovim.',
                ),
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.number)
                    .setDisabled(isOverridden('number'))
                    .onChange(async (value) => {
                        this.plugin.settings.number = value;
                        this.plugin.vimrcOverrides?.delete('number');
                        await this.plugin.saveSettings();
                        this.plugin.reconfigureLineNumberGutter();
                    }),
            );

        new Setting(containerEl)
            .setName('Relative line numbers')
            .setDesc(
                describeOverride(
                    'relativenumber',
                    'Show relative line numbers (distance from cursor). When both are enabled, shows hybrid mode (absolute on current line, relative on others). Equivalent to `set relativenumber` in Neovim.',
                ),
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.relativenumber)
                    .setDisabled(isOverridden('relativenumber'))
                    .onChange(async (value) => {
                        this.plugin.settings.relativenumber = value;
                        this.plugin.vimrcOverrides?.delete('relativenumber');
                        await this.plugin.saveSettings();
                        this.plugin.reconfigureLineNumberGutter();
                    }),
            );

        new Setting(containerEl)
            .setName('Number width')
            .setDesc(
                describeOverride(
                    'numberwidth',
                    'Minimum width of the line number column in characters (1\u201320). The gutter auto-expands for larger files.',
                ),
            )
            .addText((text) => {
                text.inputEl.type = 'number';
                text.inputEl.min = '1';
                text.inputEl.max = '20';
                text.setValue(String(this.plugin.settings.numberwidth));
                text.setDisabled(isOverridden('numberwidth'));
                text.onChange(async (val) => {
                    const n = Number(val);
                    if (!isNaN(n) && n >= 1 && n <= 20) {
                        this.plugin.settings.numberwidth = n;
                        this.plugin.vimrcOverrides?.delete('numberwidth');
                        await this.plugin.saveSettings();
                        this.plugin.reconfigureLineNumberGutter();
                    }
                });
            });

        new Setting(containerEl)
            .setName('Line number display')
            .setDesc(
                describeOverride(
                    'linenumbermode',
                    'How to display line numbers when both absolute and relative are enabled. Hybrid: single column (Neovim default). Dual: absolute and relative in separate columns.',
                ),
            )
            .addDropdown((dropdown) =>
                dropdown
                    .addOptions({
                        hybrid: 'Hybrid (single column)',
                        dual: 'Dual (abs | rel)',
                        'dual-rel-abs': 'Dual (rel | abs)',
                    })
                    .setValue(this.plugin.settings.linenumbermode)
                    .setDisabled(isOverridden('linenumbermode'))
                    .onChange(async (value) => {
                        this.plugin.settings.linenumbermode = value as
                            | 'hybrid'
                            | 'dual'
                            | 'dual-rel-abs';
                        this.plugin.vimrcOverrides?.delete('linenumbermode');
                        await this.plugin.saveSettings();
                        this.plugin.reconfigureLineNumberGutter();
                    }),
            );

        new Setting(containerEl)
            .setName('Cursor line highlight')
            .setDesc(
                describeOverride(
                    'cursorline',
                    'Highlight the current cursor line. Equivalent to `set cursorline` in Neovim.',
                ),
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.cursorline)
                    .setDisabled(isOverridden('cursorline'))
                    .onChange(async (value) => {
                        this.plugin.settings.cursorline = value;
                        this.plugin.vimrcOverrides?.delete('cursorline');
                        await this.plugin.saveSettings();
                        this.plugin.reconfigureCursorlineHighlight();
                    }),
            );

        new Setting(containerEl)
            .setName('Cursor line highlight mode')
            .setDesc(
                describeOverride(
                    'cursorlineopt',
                    'What to highlight on the cursor line: Number (line number only), Line (line background), or Both.',
                ),
            )
            .addDropdown((dropdown) =>
                dropdown
                    .addOptions({
                        number: 'Number',
                        line: 'Line',
                        both: 'Both',
                    })
                    .setValue(this.plugin.settings.cursorlineopt)
                    .setDisabled(isOverridden('cursorlineopt'))
                    .onChange(async (value) => {
                        this.plugin.settings.cursorlineopt = value as
                            | 'number'
                            | 'line'
                            | 'both';
                        this.plugin.vimrcOverrides?.delete('cursorlineopt');
                        await this.plugin.saveSettings();
                        this.plugin.reconfigureCursorlineHighlight();
                    }),
            );

        // ── Gutter ──────────────────────────────────────────────────

        new Setting(containerEl).setName('Gutter').setHeading();

        new Setting(containerEl)
            .setName('Sign column')
            .setDesc(
                describeOverride(
                    'signcolumn',
                    'Show vim mark letters (a-z, A-Z) in a dedicated gutter column. Auto: show gutter when marks exist. Always: always reserve gutter space. Off: never show.',
                ),
            )
            .addDropdown((dropdown) =>
                dropdown
                    .addOptions({
                        auto: 'Auto',
                        yes: 'Always',
                        no: 'Off',
                    })
                    .setValue(this.plugin.settings.signcolumn)
                    .setDisabled(isOverridden('signcolumn'))
                    .onChange(async (value) => {
                        this.plugin.settings.signcolumn = value;
                        this.plugin.vimrcOverrides?.delete('signcolumn');
                        await this.plugin.saveSettings();
                        this.plugin.reconfigureSignColumnGutter();
                    }),
            );

        new Setting(containerEl)
            .setName('Fold column')
            .setDesc(
                describeOverride(
                    'foldcolumn',
                    'Show fold indicators (▸/▾) in the gutter for foldable regions. Click to toggle folds.',
                ),
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.foldcolumn)
                    .setDisabled(isOverridden('foldcolumn'))
                    .onChange(async (value) => {
                        this.plugin.settings.foldcolumn = value;
                        this.plugin.vimrcOverrides?.delete('foldcolumn');
                        await this.plugin.saveSettings();
                        this.plugin.reconfigureFoldColumnGutter();
                    }),
            );

        // ── Status bar ───────────────────────────────────────────────

        new Setting(containerEl).setName('Status bar').setHeading();

        this.syncVisibilityClass(
            containerEl,
            'vim-motions-status-bar-on',
            this.plugin.settings.enableStatusBar,
        );

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
                        this.syncVisibilityClass(
                            containerEl,
                            'vim-motions-status-bar-on',
                            value,
                        );
                    }),
            );

        const statusBarChildrenGate = containerEl.createDiv({
            cls: 'vim-motions-when-status-bar',
        });
        new Setting(statusBarChildrenGate)
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

        new Setting(statusBarChildrenGate)
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
        new Setting(containerEl)
            .setName('Visual line mode prompt')
            .setDesc(
                describeOverride(
                    'modePrompts.visualLine',
                    'Status bar text for visual line mode (V).',
                ),
            )
            .addText((text) =>
                text
                    .setValue(prompts.visualLine)
                    .setDisabled(isOverridden('modePrompts.visualLine'))
                    .onChange(async (value) => {
                        this.plugin.settings.modePrompts.visualLine =
                            value || DEFAULT_MODE_PROMPTS.visualLine;
                        this.plugin.vimrcOverrides?.delete(
                            'modePrompts.visualLine',
                        );
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );
        new Setting(containerEl)
            .setName('Visual block mode prompt')
            .setDesc(
                describeOverride(
                    'modePrompts.visualBlock',
                    'Status bar text for visual block mode (Ctrl-V).',
                ),
            )
            .addText((text) =>
                text
                    .setValue(prompts.visualBlock)
                    .setDisabled(isOverridden('modePrompts.visualBlock'))
                    .onChange(async (value) => {
                        this.plugin.settings.modePrompts.visualBlock =
                            value || DEFAULT_MODE_PROMPTS.visualBlock;
                        this.plugin.vimrcOverrides?.delete(
                            'modePrompts.visualBlock',
                        );
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );
        new Setting(containerEl)
            .setName('Select mode prompt')
            .setDesc(
                describeOverride(
                    'modePrompts.select',
                    'Status bar text for select mode.',
                ),
            )
            .addText((text) =>
                text
                    .setValue(prompts.select)
                    .setDisabled(isOverridden('modePrompts.select'))
                    .onChange(async (value) => {
                        this.plugin.settings.modePrompts.select =
                            value || DEFAULT_MODE_PROMPTS.select;
                        this.plugin.vimrcOverrides?.delete(
                            'modePrompts.select',
                        );
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );
        new Setting(containerEl)
            .setName('Virtual replace mode prompt')
            .setDesc(
                describeOverride(
                    'modePrompts.vreplace',
                    'Status bar text for virtual replace mode.',
                ),
            )
            .addText((text) =>
                text
                    .setValue(prompts.vreplace)
                    .setDisabled(isOverridden('modePrompts.vreplace'))
                    .onChange(async (value) => {
                        this.plugin.settings.modePrompts.vreplace =
                            value || DEFAULT_MODE_PROMPTS.vreplace;
                        this.plugin.vimrcOverrides?.delete(
                            'modePrompts.vreplace',
                        );
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );
        new Setting(containerEl)
            .setName('Command mode prompt')
            .setDesc(
                describeOverride(
                    'modePrompts.command',
                    'Status bar text for command-line mode.',
                ),
            )
            .addText((text) =>
                text
                    .setValue(prompts.command)
                    .setDisabled(isOverridden('modePrompts.command'))
                    .onChange(async (value) => {
                        this.plugin.settings.modePrompts.command =
                            value || DEFAULT_MODE_PROMPTS.command;
                        this.plugin.vimrcOverrides?.delete(
                            'modePrompts.command',
                        );
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );
        new Setting(containerEl)
            .setName('Search mode prompt')
            .setDesc(
                describeOverride(
                    'modePrompts.search',
                    'Status bar text for search mode.',
                ),
            )
            .addText((text) =>
                text
                    .setValue(prompts.search)
                    .setDisabled(isOverridden('modePrompts.search'))
                    .onChange(async (value) => {
                        this.plugin.settings.modePrompts.search =
                            value || DEFAULT_MODE_PROMPTS.search;
                        this.plugin.vimrcOverrides?.delete(
                            'modePrompts.search',
                        );
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );
        new Setting(containerEl)
            .setName('Insert-normal mode prompt')
            .setDesc(
                describeOverride(
                    'modePrompts.insertNormal',
                    'Status bar text when in normal mode via Ctrl-O from insert.',
                ),
            )
            .addText((text) =>
                text
                    .setValue(prompts.insertNormal)
                    .setDisabled(isOverridden('modePrompts.insertNormal'))
                    .onChange(async (value) => {
                        this.plugin.settings.modePrompts.insertNormal =
                            value || DEFAULT_MODE_PROMPTS.insertNormal;
                        this.plugin.vimrcOverrides?.delete(
                            'modePrompts.insertNormal',
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
            const cursorOverride =
                this.plugin.vimrcOverrides?.get('cursorShapes');
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

        // ── Animated cursor ──────────────────────────────────────────

        new Setting(containerEl).setName('Animated cursor').setHeading();

        new Setting(containerEl).setDesc(
            'Smooth cursor movement and smear trail effects. Incompatible with ninja-cursor and cursor-smith plugins.',
        );

        this.syncVisibilityClass(
            containerEl,
            'vim-motions-animated-cursor-on',
            this.plugin.settings.animatedCursor,
        );
        this.syncVisibilityClass(
            containerEl,
            'vim-motions-smooth-cursor-on',
            this.plugin.settings.smoothCursor,
        );
        this.syncVisibilityClass(
            containerEl,
            'vim-motions-smear-trail-on',
            this.plugin.settings.smearTrail,
        );

        new Setting(containerEl)
            .setName('Enable animated cursor')
            .setDesc(
                'Render cursor on canvas with smooth movement and optional trail effects.',
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.animatedCursor)
                    .onChange(async (value) => {
                        this.plugin.settings.animatedCursor = value;
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                        this.syncVisibilityClass(
                            containerEl,
                            'vim-motions-animated-cursor-on',
                            value,
                        );
                    }),
            );

        const smoothCursorGate = containerEl.createDiv({
            cls: 'vim-motions-when-animated-cursor',
        });
        new Setting(smoothCursorGate)
            .setName('Smooth cursor movement')
            .setDesc('Cursor glides between positions instead of teleporting.')
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.smoothCursor)
                    .setDisabled(!this.plugin.settings.animatedCursor)
                    .onChange(async (value) => {
                        this.plugin.settings.smoothCursor = value;
                        await this.plugin.saveSettings();
                        this.syncVisibilityClass(
                            containerEl,
                            'vim-motions-smooth-cursor-on',
                            value,
                        );
                    }),
            );

        const cursorSmoothnessGate = containerEl.createDiv({
            cls: 'vim-motions-when-smooth-cursor',
        });
        new Setting(cursorSmoothnessGate)
            .setName('Cursor smoothness')
            .setDesc(
                'How lazy the cursor movement feels. 0 = snap, 1 = very slow.',
            )
            .addSlider((slider) =>
                slider
                    .setLimits(0, 1, 0.05)
                    .setValue(this.plugin.settings.cursorSmoothness)
                    .setDisabled(
                        !this.plugin.settings.animatedCursor ||
                            !this.plugin.settings.smoothCursor,
                    )
                    .onChange(async (value) => {
                        this.plugin.settings.cursorSmoothness = value;
                        await this.plugin.saveSettings();
                    }),
            );

        const smearTrailGate = containerEl.createDiv({
            cls: 'vim-motions-when-animated-cursor',
        });
        new Setting(smearTrailGate)
            .setName('Enable smear trail')
            .setDesc(
                'Spring-damper trail stretching between old and new cursor position.',
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.smearTrail)
                    .setDisabled(!this.plugin.settings.animatedCursor)
                    .onChange(async (value) => {
                        this.plugin.settings.smearTrail = value;
                        await this.plugin.saveSettings();
                        this.syncVisibilityClass(
                            containerEl,
                            'vim-motions-smear-trail-on',
                            value,
                        );
                    }),
            );

        const smearParamsGate = containerEl.createDiv({
            cls: 'vim-motions-when-smear-trail',
        });
        new Setting(smearParamsGate)
            .setName('Trail stiffness')
            .setDesc(
                'Head corner spring strength. Higher = trail snaps back faster.',
            )
            .addSlider((slider) =>
                slider
                    .setLimits(0.1, 1, 0.05)
                    .setValue(this.plugin.settings.smearStiffness)
                    .setDisabled(
                        !this.plugin.settings.animatedCursor ||
                            !this.plugin.settings.smearTrail,
                    )
                    .onChange(async (value) => {
                        this.plugin.settings.smearStiffness = value;
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(smearParamsGate)
            .setName('Trail trailing stiffness')
            .setDesc(
                'Tail corner spring strength. Lower = longer, more dramatic trail.',
            )
            .addSlider((slider) =>
                slider
                    .setLimits(0.1, 1, 0.05)
                    .setValue(this.plugin.settings.smearTrailingStiffness)
                    .setDisabled(
                        !this.plugin.settings.animatedCursor ||
                            !this.plugin.settings.smearTrail,
                    )
                    .onChange(async (value) => {
                        this.plugin.settings.smearTrailingStiffness = value;
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(smearParamsGate)
            .setName('Trail damping')
            .setDesc('Velocity decay. Lower values produce bouncier trails.')
            .addSlider((slider) =>
                slider
                    .setLimits(0.1, 0.99, 0.01)
                    .setValue(this.plugin.settings.smearDamping)
                    .setDisabled(
                        !this.plugin.settings.animatedCursor ||
                            !this.plugin.settings.smearTrail,
                    )
                    .onChange(async (value) => {
                        this.plugin.settings.smearDamping = value;
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(smearParamsGate)
            .setName('Trail max length')
            .setDesc('Maximum trail length in pixels.')
            .addSlider((slider) =>
                slider
                    .setLimits(50, 800, 10)
                    .setValue(this.plugin.settings.smearMaxLength)
                    .setDisabled(
                        !this.plugin.settings.animatedCursor ||
                            !this.plugin.settings.smearTrail,
                    )
                    .onChange(async (value) => {
                        this.plugin.settings.smearMaxLength = value;
                        await this.plugin.saveSettings();
                    }),
            );

        // ── Yank highlight ──────────────────────────────────────────

        new Setting(containerEl).setName('Yank highlight').setHeading();

        this.syncVisibilityClass(
            containerEl,
            'vim-motions-yank-highlight-on',
            this.plugin.settings.yankHighlightMode !== 'off',
        );

        new Setting(containerEl)
            .setName('Yank highlight')
            .setDesc(
                describeOverride(
                    'yankHighlightMode',
                    'Highlight yanked text. "Solid" shows the highlight and removes it after the duration (Neovim-style). "Fade" gradually fades the highlight out.',
                ),
            )
            .addDropdown((dropdown) =>
                dropdown
                    .addOption('off', 'Off')
                    .addOption('solid', 'Solid')
                    .addOption('fade', 'Fade')
                    .setValue(this.plugin.settings.yankHighlightMode)
                    .setDisabled(isOverridden('yankHighlightMode'))
                    .onChange(async (value) => {
                        this.plugin.settings.yankHighlightMode =
                            value as VimMotionsSettings['yankHighlightMode'];
                        this.plugin.vimrcOverrides?.delete('yankHighlightMode');
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                        this.syncVisibilityClass(
                            containerEl,
                            'vim-motions-yank-highlight-on',
                            value !== 'off',
                        );
                    }),
            );

        const yankDurationGate = containerEl.createDiv({
            cls: 'vim-motions-when-yank-highlight',
        });
        new Setting(yankDurationGate)
            .setName('Yank highlight duration')
            .setDesc(
                describeOverride(
                    'yankHighlightDuration',
                    'How long the yank highlight stays visible in milliseconds (50–3000).',
                ),
            )
            .addSlider((slider) =>
                slider
                    .setLimits(50, 3000, 50)
                    .setValue(this.plugin.settings.yankHighlightDuration)
                    .setDisabled(isOverridden('yankHighlightDuration'))
                    .onChange(async (value) => {
                        this.plugin.settings.yankHighlightDuration = value;
                        this.plugin.vimrcOverrides?.delete(
                            'yankHighlightDuration',
                        );
                        await this.plugin.saveSettings();
                    }),
            );
    }

    private renderNavigationTab(
        containerEl: HTMLElement,
        describeOverride: (key: string, desc?: string) => string,
        isOverridden: (key: string) => boolean,
    ): void {
        // ── Jump navigation ──────────────────────────────────────────

        new Setting(containerEl).setName('Jump navigation').setHeading();

        this.syncVisibilityClass(
            containerEl,
            'vim-motions-easymotion-on',
            this.plugin.settings.enableEasyMotion,
        );
        this.syncVisibilityClass(
            containerEl,
            'vim-motions-flash-on',
            this.plugin.settings.enableFlash,
        );
        this.syncVisibilityClass(
            containerEl,
            'vim-motions-flash-jump-on',
            this.plugin.settings.flashJumpEnabled,
        );
        this.syncVisibilityClass(
            containerEl,
            'vim-motions-hint-mode-on',
            this.plugin.settings.enableHintMode,
        );

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
                        this.syncVisibilityClass(
                            containerEl,
                            'vim-motions-easymotion-on',
                            value,
                        );
                    }),
            );

        const easyMotionChildrenGate = containerEl.createDiv({
            cls: 'vim-motions-when-easymotion',
        });
        new Setting(easyMotionChildrenGate)
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

        new Setting(easyMotionChildrenGate)
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
            .setName('Flash-style f/F/t/T')
            .setDesc(
                describeOverride(
                    'enableFlash',
                    'Show labels on all visible matches when pressing f/F/t/T. Single match auto-jumps.',
                ),
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableFlash)
                    .setDisabled(isOverridden('enableFlash'))
                    .onChange(async (value) => {
                        this.plugin.settings.enableFlash = value;
                        this.plugin.vimrcOverrides?.delete('enableFlash');
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                        this.syncVisibilityClass(
                            containerEl,
                            'vim-motions-flash-on',
                            value,
                        );
                    }),
            );

        const flashChildrenGate = containerEl.createDiv({
            cls: 'vim-motions-when-flash',
        });
        new Setting(flashChildrenGate)
            .setName('Flash multi-line')
            .setDesc(
                describeOverride(
                    'flashMultiLine',
                    'Search beyond the current line for f/F/t/T matches (flash.nvim behavior).',
                ),
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.flashMultiLine)
                    .setDisabled(isOverridden('flashMultiLine'))
                    .onChange(async (value) => {
                        this.plugin.settings.flashMultiLine = value;
                        this.plugin.vimrcOverrides?.delete('flashMultiLine');
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );

        new Setting(flashChildrenGate)
            .setName('Flash jump mode (s)')
            .setDesc(
                describeOverride(
                    'flashJumpEnabled',
                    'Enable bidirectional character jump with a configurable key (default: s). Normal mode only.',
                ),
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.flashJumpEnabled)
                    .setDisabled(isOverridden('flashJumpEnabled'))
                    .onChange(async (value) => {
                        this.plugin.settings.flashJumpEnabled = value;
                        this.plugin.vimrcOverrides?.delete('flashJumpEnabled');
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                        this.syncVisibilityClass(
                            containerEl,
                            'vim-motions-flash-jump-on',
                            value,
                        );
                    }),
            );

        const flashJumpKeyGate = containerEl.createDiv({
            cls: 'vim-motions-when-flash-jump',
        });
        new Setting(flashJumpKeyGate)
            .setName('Flash jump key')
            .setDesc(
                describeOverride(
                    'flashJumpKey',
                    'Key to trigger flash jump mode (default: s). Overrides the default binding for this key.',
                ),
            )
            .addText((text) =>
                text
                    .setValue(this.plugin.settings.flashJumpKey)
                    .setDisabled(isOverridden('flashJumpKey'))
                    .onChange(async (value) => {
                        this.plugin.settings.flashJumpKey = value;
                        this.plugin.vimrcOverrides?.delete('flashJumpKey');
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );

        new Setting(flashChildrenGate)
            .setName('Flash clever-f')
            .setDesc(
                describeOverride(
                    'flashCleverF',
                    'Pressing f/F again after a flash jump repeats the search (like clever-f.vim).',
                ),
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.flashCleverF)
                    .setDisabled(isOverridden('flashCleverF'))
                    .onChange(async (value) => {
                        this.plugin.settings.flashCleverF = value;
                        this.plugin.vimrcOverrides?.delete('flashCleverF');
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );

        new Setting(flashChildrenGate)
            .setName('Flash min pattern length')
            .setDesc(
                describeOverride(
                    'flashMinPatternLength',
                    'Minimum characters before labels appear in jump mode (1 = immediate).',
                ),
            )
            .addText((text) => {
                text.setValue(
                    String(this.plugin.settings.flashMinPatternLength),
                );
                text.inputEl.type = 'number';
                text.inputEl.min = '1';
                text.inputEl.max = '10';
                text.setDisabled(isOverridden('flashMinPatternLength'));
                text.onChange(async (value) => {
                    const n = Number(value);
                    const clamped = Number.isNaN(n)
                        ? 1
                        : Math.max(1, Math.min(10, Math.floor(n)));
                    this.plugin.settings.flashMinPatternLength = clamped;
                    this.plugin.vimrcOverrides?.delete('flashMinPatternLength');
                    await this.plugin.saveSettings();
                    this.plugin.reloadFeatures();
                });
            });

        new Setting(flashChildrenGate)
            .setName('Flash search labels')
            .setDesc(
                describeOverride(
                    'flashSearch',
                    'Show labels on search matches after committing a / or ? search.',
                ),
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.flashSearch)
                    .setDisabled(isOverridden('flashSearch'))
                    .onChange(async (value) => {
                        this.plugin.settings.flashSearch = value;
                        this.plugin.vimrcOverrides?.delete('flashSearch');
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );

        new Setting(containerEl)
            .setName('Harpoon file pinning')
            .setDesc(
                describeOverride(
                    'enableHarpoon',
                    'Pin files to numbered slots for instant switching (<leader>1–9). Add pins with <leader>ha, list with <leader>hp.',
                ),
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableHarpoon)
                    .setDisabled(isOverridden('enableHarpoon'))
                    .onChange(async (value) => {
                        this.plugin.settings.enableHarpoon = value;
                        this.plugin.vimrcOverrides?.delete('enableHarpoon');
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );

        new Setting(containerEl)
            .setName('Yank-ring paste cycling')
            .setDesc(
                describeOverride(
                    'enableYankRing',
                    'Cycle through yank/delete history with <C-p>/<C-n> after pasting. When disabled, <C-p>/<C-n> act as k/j.',
                ),
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableYankRing)
                    .setDisabled(isOverridden('enableYankRing'))
                    .onChange(async (value) => {
                        this.plugin.settings.enableYankRing = value;
                        this.plugin.vimrcOverrides?.delete('enableYankRing');
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
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
                        this.syncVisibilityClass(
                            containerEl,
                            'vim-motions-hint-mode-on',
                            value,
                        );
                    }),
            );

        const hintModeChildrenGate = containerEl.createDiv({
            cls: 'vim-motions-when-hint-mode',
        });
        new Setting(hintModeChildrenGate)
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

        const hotkeySettingItem = new Setting(hintModeChildrenGate)
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

        const labelSettingsGate = containerEl.createDiv({
            cls: 'vim-motions-when-easymotion-or-hint',
        });
        new Setting(labelSettingsGate)
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

        new Setting(labelSettingsGate)
            .setName('Scale labels to line height')
            .setDesc(
                describeOverride(
                    'labelMatchFontSize',
                    'Scale label font to match the target line\u2019s font size (e.g., larger labels on headings). When disabled, uses the configured label font size.',
                ),
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.labelMatchFontSize)
                    .setDisabled(isOverridden('labelMatchFontSize'))
                    .onChange(async (value) => {
                        this.plugin.settings.labelMatchFontSize = value;
                        this.plugin.vimrcOverrides?.delete(
                            'labelMatchFontSize',
                        );
                        await this.plugin.saveSettings();
                    }),
            );

        // ── Workspace navigation ────────────────────────────────────

        new Setting(containerEl).setName('Workspace navigation').setHeading();

        this.syncVisibilityClass(
            containerEl,
            'vim-motions-workspace-nav-on',
            this.plugin.settings.enableWorkspaceNav,
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
                        this.syncVisibilityClass(
                            containerEl,
                            'vim-motions-workspace-nav-on',
                            value,
                        );
                    }),
            );

        const workspaceNavChildrenGate = containerEl.createDiv({
            cls: 'vim-motions-when-workspace-nav',
        });
        new Setting(workspaceNavChildrenGate)
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

        new Setting(containerEl)
            .setName('Fold-aware navigation')
            .setDesc(
                describeOverride(
                    'foldAwareNavigation',
                    'Automatically unfold sections when navigating into them (e.g., ]h into a folded heading).',
                ),
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.foldAwareNavigation)
                    .setDisabled(isOverridden('foldAwareNavigation'))
                    .onChange(async (value) => {
                        this.plugin.settings.foldAwareNavigation = value;
                        this.plugin.vimrcOverrides?.delete(
                            'foldAwareNavigation',
                        );
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );

        new Setting(containerEl)
            .setName('Fold persistence')
            .setDesc(
                describeOverride(
                    'foldPersistence',
                    'Remember fold state across file switches and sessions. Capped at 500 files, 30-day eviction.',
                ),
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.foldPersistence)
                    .setDisabled(isOverridden('foldPersistence'))
                    .onChange(async (value) => {
                        this.plugin.settings.foldPersistence = value;
                        this.plugin.vimrcOverrides?.delete('foldPersistence');
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );
    }

    private renderKeybindingsTab(
        containerEl: HTMLElement,
        describeOverride: (key: string, desc?: string) => string,
        isOverridden: (key: string) => boolean,
    ): void {
        // ── Vimrc & key bindings ─────────────────────────────────────

        new Setting(containerEl).setName('Vimrc & key bindings').setHeading();

        const configContainer = containerEl.createDiv();
        this.renderConfigSettings(
            configContainer,
            describeOverride,
            isOverridden,
        );

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

        this.syncVisibilityClass(
            containerEl,
            'vim-motions-which-key-on',
            this.plugin.settings.whichKeyMode !== 'off',
        );

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
                        this.syncVisibilityClass(
                            containerEl,
                            'vim-motions-which-key-on',
                            value !== 'off',
                        );
                    }),
            );

        const whichKeyChildrenGate = containerEl.createDiv({
            cls: 'vim-motions-when-which-key',
        });
        new Setting(whichKeyChildrenGate)
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

        new Setting(whichKeyChildrenGate)
            .setName('Which-key popup delay')
            .setDesc(
                describeOverride(
                    'whichKeyDelay',
                    'Delay in milliseconds before the which-key popup appears (0\u20132000). ' +
                        'Only applies to the initial popup \u2014 subsequent keystrokes update the popup instantly.',
                ),
            )
            .addText((text) => {
                text.setValue(String(this.plugin.settings.whichKeyDelay));
                text.inputEl.type = 'number';
                text.inputEl.min = '0';
                text.inputEl.max = '2000';
                text.setDisabled(isOverridden('whichKeyDelay'));
                text.onChange(async (value) => {
                    const n = Number(value);
                    const clamped = Number.isNaN(n)
                        ? 500
                        : Math.max(0, Math.min(2000, Math.floor(n)));
                    this.plugin.settings.whichKeyDelay = clamped;
                    this.plugin.vimrcOverrides?.delete('whichKeyDelay');
                    await this.plugin.saveSettings();
                    this.plugin.reloadFeatures();
                });
            });

        new Setting(whichKeyChildrenGate)
            .setName('Which-key sort order')
            .setDesc(
                describeOverride(
                    'whichKeySortOrder',
                    'How entries are sorted in the which-key popup. ' +
                        '"which-key.nvim" matches which-key.nvim defaults: individual keys first, groups last, ' +
                        'alphanumeric before special keys, natural alphabetical tiebreaker. ' +
                        '"Groups first" shows groups before individual keys, both sorted alphabetically.',
                ),
            )
            .addDropdown((dropdown) =>
                dropdown
                    .addOptions({
                        'which-key': 'which-key.nvim (default)',
                        'groups-first':
                            'Groups first, then keys (alphabetical)',
                    })
                    .setValue(this.plugin.settings.whichKeySortOrder)
                    .setDisabled(isOverridden('whichKeySortOrder'))
                    .onChange(async (value) => {
                        this.plugin.settings.whichKeySortOrder = value as
                            | 'which-key'
                            | 'groups-first';
                        this.plugin.vimrcOverrides?.delete('whichKeySortOrder');
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );

        new Setting(whichKeyChildrenGate)
            .setName('Which-key icons')
            .setDesc(
                describeOverride(
                    'whichKeyIcons',
                    'Show icons next to entries in the which-key popup.',
                ),
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.whichKeyIcons)
                    .setDisabled(isOverridden('whichKeyIcons'))
                    .onChange(async (value) => {
                        this.plugin.settings.whichKeyIcons = value;
                        this.plugin.vimrcOverrides?.delete('whichKeyIcons');
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );

        const whichKeyGroupLabelsGate = containerEl.createDiv({
            cls: 'vim-motions-when-which-key',
        });
        new Setting(whichKeyGroupLabelsGate)
            .setName('Which-key group labels')
            .setHeading();
        new Setting(whichKeyGroupLabelsGate).setDesc(
            'Name groups by their full key prefix. Use the leader character + prefix for leader groups ' +
                '(e.g. "\\t" for table), or a raw prefix for non-leader groups (e.g. "cs" for surround changes). ' +
                'Built-in features register default labels that your entries can override.',
        );

        const groupLabelsContainer = whichKeyGroupLabelsGate.createDiv({
            cls: 'vim-motions-group-labels',
        });
        this.renderGroupLabels(groupLabelsContainer);

        const whichKeyCommandLabelsGate = containerEl.createDiv({
            cls: 'vim-motions-when-which-key',
        });
        new Setting(whichKeyCommandLabelsGate)
            .setName('Which-key command labels')
            .setHeading();
        new Setting(whichKeyCommandLabelsGate).setDesc(
            'Describe individual bindings in the which-key popup. Entries set in vimrc appear as read-only rows.',
        );

        const commandLabelsContainer = whichKeyCommandLabelsGate.createDiv({
            cls: 'vim-motions-command-labels',
        });
        this.renderCommandLabels(commandLabelsContainer);
    }

    private renderSnippetsFilesTab(
        containerEl: HTMLElement,
        describeOverride: (key: string, desc?: string) => string,
        isOverridden: (key: string) => boolean,
    ): void {
        // ── Snippets ─────────────────────────────────────────────────

        new Setting(containerEl).setName('Snippets').setHeading();

        this.syncVisibilityClass(
            containerEl,
            'vim-motions-snippets-on',
            this.plugin.settings.enableSnippets,
        );

        new Setting(containerEl)
            .setName('Enable snippets')
            .setDesc(
                'Enable snippet expansion with tabstop navigation, variables, and completion.',
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableSnippets)
                    .onChange(async (value) => {
                        this.plugin.settings.enableSnippets = value;
                        await this.plugin.saveSettings();
                        this.syncVisibilityClass(
                            containerEl,
                            'vim-motions-snippets-on',
                            value,
                        );
                    }),
            );

        const snippetChildrenGate = containerEl.createDiv({
            cls: 'vim-motions-when-snippets',
        });
        new Setting(snippetChildrenGate)
            .setName('Bundled snippets')
            .setDesc(
                'Include built-in Obsidian Markdown snippets (headings, callouts, wikilinks, tables, etc.).',
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.snippetBundled)
                    .onChange(async (value) => {
                        this.plugin.settings.snippetBundled = value;
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(snippetChildrenGate)
            .setName('Snippet directory')
            .setDesc(
                'Path to a directory containing user snippet JSON files. Supports ~ for home directory and absolute paths (desktop only).',
            )
            .addText((text) =>
                text
                    .setPlaceholder('~/snippets')
                    .setValue(this.plugin.settings.snippetDirectory)
                    .onChange(async (value) => {
                        this.plugin.settings.snippetDirectory = value;
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(snippetChildrenGate)
            .setName('Trigger mode')
            .setDesc(
                'How snippets are triggered: completion menu (type prefix to see suggestions), tab expansion (type prefix + tab), or both.',
            )
            .addDropdown((dropdown) =>
                dropdown
                    .addOptions({
                        both: 'Both',
                        completion: 'Completion menu only',
                        tab: 'Tab expansion only',
                    })
                    .setValue(this.plugin.settings.snippetTriggerMode)
                    .onChange(async (value) => {
                        this.plugin.settings.snippetTriggerMode = value as
                            | 'completion'
                            | 'tab'
                            | 'both';
                        await this.plugin.saveSettings();
                    }),
            );

        // ── File explorer ────────────────────────────────────────────

        new Setting(containerEl).setName('File explorer').setHeading();

        this.syncVisibilityClass(
            containerEl,
            'vim-motions-oil-on',
            this.plugin.settings.oilExplorer,
        );

        new Setting(containerEl)
            .setName('Oil explorer')
            .setDesc('Enable the oil-style file explorer (:oil command).')
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.oilExplorer)
                    .onChange(async (value) => {
                        this.plugin.settings.oilExplorer = value;
                        await this.plugin.saveSettings();
                        this.syncVisibilityClass(
                            containerEl,
                            'vim-motions-oil-on',
                            value,
                        );
                    }),
            );

        const oilChildrenGate = containerEl.createDiv({
            cls: 'vim-motions-when-oil',
        });
        new Setting(oilChildrenGate)
            .setName('Show hidden files')
            .setDesc('Show dotfiles and hidden folders in oil views.')
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.oilShowHiddenFiles)
                    .onChange(async (value) => {
                        this.plugin.settings.oilShowHiddenFiles = value;
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(oilChildrenGate)
            .setName('Confirm delete threshold')
            .setDesc(
                'Show confirmation dialog when deleting this many files or more.',
            )
            .addSlider((slider) =>
                slider
                    .setLimits(1, 20, 1)
                    .setValue(this.plugin.settings.oilConfirmDeleteThreshold)
                    .onChange(async (value) => {
                        this.plugin.settings.oilConfirmDeleteThreshold = value;
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(oilChildrenGate)
            .setName('Default sort order')
            .setDesc('Default sort order for oil directory listings.')
            .addDropdown((dropdown) =>
                dropdown
                    .addOptions({
                        name: 'Name',
                        mtime: 'Modified time',
                        size: 'Size',
                    })
                    .setValue(this.plugin.settings.oilDefaultSort)
                    .onChange(async (value) => {
                        this.plugin.settings.oilDefaultSort = value as
                            | 'name'
                            | 'mtime'
                            | 'size';
                        await this.plugin.saveSettings();
                    }),
            );

        // ── Undo tree ────────────────────────────────────────────────

        new Setting(containerEl).setName('Undo tree').setHeading();

        this.syncVisibilityClass(
            containerEl,
            'vim-motions-undo-tree-on',
            this.plugin.settings.enableUndoTree,
        );

        new Setting(containerEl)
            .setName('Undo tree')
            .setDesc(
                'Track branching undo history for g+/g- navigation, :earlier/:later commands, and :undolist visualization.',
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableUndoTree)
                    .onChange(async (value) => {
                        this.plugin.settings.enableUndoTree = value;
                        await this.plugin.saveSettings();
                        this.syncVisibilityClass(
                            containerEl,
                            'vim-motions-undo-tree-on',
                            value,
                        );
                    }),
            );

        const undoTreeChildrenGate = containerEl.createDiv({
            cls: 'vim-motions-when-undo-tree',
        });
        new Setting(undoTreeChildrenGate)
            .setName('Persist undo history')
            .setDesc(
                'Save undo tree to disk so it survives across sessions. Per-file undo history is stored in plugin data.',
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.undoFile)
                    .onChange(async (value) => {
                        this.plugin.settings.undoFile = value;
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(undoTreeChildrenGate)
            .setName('Maximum undo tree nodes')
            .setDesc(
                'Maximum number of undo states to keep per editor. Oldest leaf branches are pruned when exceeded.',
            )
            .addSlider((slider) =>
                slider
                    .setLimits(100, 5000, 100)
                    .setValue(this.plugin.settings.undoTreeMaxNodes)
                    .onChange(async (value) => {
                        this.plugin.settings.undoTreeMaxNodes = value;
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(undoTreeChildrenGate)
            .setName('Sidebar position')
            .setDesc('Which sidebar to open the undo tree view in.')
            .addDropdown((dropdown) =>
                dropdown
                    .addOptions({
                        left: 'Left',
                        right: 'Right',
                    })
                    .setValue(this.plugin.settings.undoTreePosition)
                    .onChange(async (value) => {
                        this.plugin.settings.undoTreePosition = value as
                            | 'left'
                            | 'right';
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(undoTreeChildrenGate)
            .setName('Auto-open on branch')
            .setDesc(
                'Automatically open the undo tree sidebar when a branch is created (undo + new edit).',
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.undoTreeAutoOpen)
                    .onChange(async (value) => {
                        this.plugin.settings.undoTreeAutoOpen = value;
                        await this.plugin.saveSettings();
                    }),
            );
    }

    private renderInputMethodTab(containerEl: HTMLElement): void {
        // ── Input method ─────────────────────────────────────────────

        if (Platform.isDesktop) {
            new Setting(containerEl).setName('Input method').setHeading();

            const imContainer = containerEl.createDiv();
            this.renderImSettings(imContainer);
        }
    }

    private renderAdvancedTab(
        containerEl: HTMLElement,
        describeOverride: (key: string, desc?: string) => string,
        isOverridden: (key: string) => boolean,
    ): void {
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

    private renderConfigSettings(
        container: HTMLElement,
        describeOverride: (key: string, desc?: string) => string,
        isOverridden: (key: string) => boolean,
    ): void {
        container.empty();

        new Setting(container)
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
                        this.renderConfigSettings(
                            container,
                            describeOverride,
                            isOverridden,
                        );
                    }),
            );

        const luaSetting = new Setting(container)
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

        const vimrcSetting = new Setting(container)
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

        new Setting(container)
            .setName('Show config load notifications')
            .setDesc(
                'Show a notification when vimrc or init.lua is loaded on startup. Error notifications are always shown regardless of this setting.',
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.showConfigNotifications)
                    .setDisabled(this.plugin.settings.configMode === 'settings')
                    .onChange(async (value) => {
                        this.plugin.settings.showConfigNotifications = value;
                        await this.plugin.saveSettings();
                    }),
            );
    }

    private renderImSettings(container: HTMLElement): void {
        container.empty();

        new Setting(container)
            .setName('Enable input method switching')
            .setDesc(
                'Automatically switch input methods when entering/leaving insert mode. Requires an external IM switching binary (e.g. macism, fcitx5-remote, im-select). Desktop only.',
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.imEnabled)
                    .onChange(async (value) => {
                        this.plugin.settings.imEnabled = value;
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                        this.renderImSettings(container);
                    }),
            );

        if (!this.plugin.settings.imEnabled) return;

        const IM_PRESETS: Record<
            string,
            {
                binary: string;
                obtainArgs: string;
                switchArgs: string;
                normalIm: string;
            }
        > = {
            macism: {
                binary: 'macism',
                obtainArgs: '',
                switchArgs: '{im}',
                normalIm: 'com.apple.keylayout.ABC',
            },
            'im-select': {
                binary: 'im-select.exe',
                obtainArgs: '',
                switchArgs: '{im}',
                normalIm: '1033',
            },
            'fcitx5-remote': {
                binary: 'fcitx5-remote',
                obtainArgs: '-n',
                switchArgs: '-s {im}',
                normalIm: 'keyboard-us',
            },
            ibus: {
                binary: 'ibus',
                obtainArgs: 'engine',
                switchArgs: 'engine {im}',
                normalIm: 'xkb:us::eng',
            },
        };

        new Setting(container)
            .setName('IM preset')
            .setDesc(
                'Select a preset to auto-fill binary path and arguments for common IM tools. Values are editable after selection.',
            )
            .addDropdown((dropdown) =>
                dropdown
                    .addOptions({
                        custom: 'Custom',
                        macism: 'macism (macOS)',
                        'im-select': 'im-select (Windows)',
                        'fcitx5-remote': 'fcitx5-remote (Linux)',
                        ibus: 'ibus (Linux)',
                    })
                    .setValue(this.plugin.settings.imPreset)
                    .onChange(async (value) => {
                        this.plugin.settings.imPreset = value as
                            | 'custom'
                            | 'macism'
                            | 'im-select'
                            | 'fcitx5-remote'
                            | 'ibus';
                        const preset = IM_PRESETS[value];
                        if (preset) {
                            this.plugin.settings.imBinaryPath = preset.binary;
                            this.plugin.settings.imObtainArgs =
                                preset.obtainArgs;
                            this.plugin.settings.imSwitchArgs =
                                preset.switchArgs;
                            this.plugin.settings.imDefaultNormalIm =
                                preset.normalIm;
                        }
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                        this.renderImSettings(container);
                    }),
            );

        new Setting(container)
            .setName('IM binary path')
            .setDesc(
                'Absolute path to the input method switching binary (e.g. /opt/homebrew/bin/macism, /usr/bin/fcitx5-remote, C:\\im-select\\im-select.exe). Tilde (~) paths are supported.',
            )
            .addText((text) =>
                text
                    .setPlaceholder('/opt/homebrew/bin/macism')
                    .setValue(this.plugin.settings.imBinaryPath)
                    .onChange(async (value) => {
                        this.plugin.settings.imBinaryPath = value;
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );

        new Setting(container)
            .setName('Obtain IM arguments')
            .setDesc(
                'Arguments to query the current input method. Leave empty if the binary returns the current IM when invoked without arguments (macism, im-select). For fcitx5-remote use: -n',
            )
            .addText((text) =>
                text
                    .setPlaceholder('')
                    .setValue(this.plugin.settings.imObtainArgs)
                    .onChange(async (value) => {
                        this.plugin.settings.imObtainArgs = value;
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );

        new Setting(container)
            .setName('Switch IM arguments')
            .setDesc(
                'Arguments to switch the input method. Use {im} as a placeholder for the IM identifier. For macism/im-select: {im} \u2014 For fcitx5-remote: -s {im} \u2014 For ibus: engine {im}',
            )
            .addText((text) =>
                text
                    .setPlaceholder('{im}')
                    .setValue(this.plugin.settings.imSwitchArgs)
                    .onChange(async (value) => {
                        this.plugin.settings.imSwitchArgs = value;
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );

        new Setting(container)
            .setName('Normal mode IM')
            .setDesc(
                'IM identifier to switch to in normal mode (e.g. com.apple.keylayout.ABC, keyboard-us, 1033).',
            )
            .addText((text) =>
                text
                    .setPlaceholder('com.apple.keylayout.ABC')
                    .setValue(this.plugin.settings.imDefaultNormalIm)
                    .onChange(async (value) => {
                        this.plugin.settings.imDefaultNormalIm = value;
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                    }),
            );

        new Setting(container)
            .setName('Insert mode IM behavior')
            .setDesc(
                'Restore: switch back to the IM that was active before leaving insert mode. Default: always switch to a fixed IM when entering insert mode.',
            )
            .addDropdown((dropdown) =>
                dropdown
                    .addOptions({
                        restore: 'Restore previous IM',
                        default: 'Use fixed default IM',
                    })
                    .setValue(this.plugin.settings.imRestoreBehavior)
                    .onChange(async (value) => {
                        this.plugin.settings.imRestoreBehavior = value as
                            | 'restore'
                            | 'default';
                        await this.plugin.saveSettings();
                        this.plugin.reloadFeatures();
                        this.renderImSettings(container);
                    }),
            );

        if (this.plugin.settings.imRestoreBehavior === 'default') {
            new Setting(container)
                .setName('Default insert mode IM')
                .setDesc(
                    this.plugin.settings.imDefaultInsertIm === ''
                        ? '\u26a0\ufe0f Set a default insert IM identifier, otherwise no IM switch will occur on InsertEnter.'
                        : 'IM identifier to switch to when entering insert mode.',
                )
                .addText((text) =>
                    text
                        .setPlaceholder('com.apple.inputmethod.SCIM.ITABC')
                        .setValue(this.plugin.settings.imDefaultInsertIm)
                        .onChange(async (value) => {
                            this.plugin.settings.imDefaultInsertIm = value;
                            await this.plugin.saveSettings();
                            this.plugin.reloadFeatures();
                        }),
                );
        }
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
            setting.addText((text: TextComponent) =>
                text
                    .setPlaceholder('Icon (e.g., table)')
                    .setValue(entry.icon ?? '')
                    .setDisabled(true),
            );
            setting.addText((text: TextComponent) =>
                text
                    .setPlaceholder('Color (e.g., blue)')
                    .setValue(entry.color ?? '')
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
                .addText((text: TextComponent) =>
                    text
                        .setPlaceholder('Icon (e.g., table)')
                        .setValue(entry.icon ?? '')
                        .onChange(async (value) => {
                            entry.icon = value;
                            this.plugin.vimrcOverrides?.delete(
                                'whichKeyGroupLabels',
                            );
                            await this.plugin.saveSettings();
                            this.plugin.reloadFeatures();
                        }),
                )
                .addText((text: TextComponent) =>
                    text
                        .setPlaceholder('Color (e.g., blue)')
                        .setValue(entry.color ?? '')
                        .onChange(async (value) => {
                            entry.color = value;
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
                    labels.push({ key: '', label: '', icon: '', color: '' });
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
            setting.addText((text: TextComponent) =>
                text
                    .setPlaceholder('Icon (e.g., table)')
                    .setValue(entry.icon ?? '')
                    .setDisabled(true),
            );
            setting.addText((text: TextComponent) =>
                text
                    .setPlaceholder('Color (e.g., blue)')
                    .setValue(entry.color ?? '')
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
                .addText((text: TextComponent) =>
                    text
                        .setPlaceholder('Icon (e.g., table)')
                        .setValue(entry.icon ?? '')
                        .onChange(async (value) => {
                            entry.icon = value;
                            this.plugin.vimrcOverrides?.delete(
                                'whichKeyCommandLabels',
                            );
                            await this.plugin.saveSettings();
                            this.plugin.reloadFeatures();
                        }),
                )
                .addText((text: TextComponent) =>
                    text
                        .setPlaceholder('Color (e.g., blue)')
                        .setValue(entry.color ?? '')
                        .onChange(async (value) => {
                            entry.color = value;
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
                    labels.push({ key: '', label: '', icon: '', color: '' });
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
