import { lua, lauxlib, to_jsstring, to_luastring } from '../lib/fengari';
import type { lua_State } from '../lib/fengari';
import type {
    MapContext,
    VimApi,
    CmAdapter,
    ActionArgs,
} from '../types/vim-api';
import type { AutocmdEventData, AutocmdManager } from './autocmd';
import { KNOWN_SET_OPTIONS } from '../vimrc/loader';
import {
    getNeovimOption,
    isNoopLogged,
    isRejected,
} from '../vim/neovim-options';
import type { HighlightAttrs, HighlightManager } from './highlight';
import {
    CALLBACK_INSTRUCTION_LIMIT,
    EXPR_INSTRUCTION_LIMIT,
    showLuaErrorNotice,
    withInstructionGuard,
} from './engine';
import { type CoroutineRunner } from './coroutine-runner';
import { injectObsidianApi } from './obsidian-api';
import { injectRegex } from './regex';
import { injectOnKey } from './on-key';
import { replaceTermcodes, termcodesToNotation } from './termcodes';
import {
    dispatchSetExtmark,
    dispatchDelExtmark,
    dispatchClearNamespace,
    queryExtmarks,
    queryExtmarkById,
    type ExtmarkOpts,
    type VirtTextChunk,
} from './extmarks';

const luaRawset = (
    lua as unknown as { lua_rawset: (L: lua_State, index: number) => void }
).lua_rawset;

export interface LuaKeymap {
    mode: MapContext;
    lhs: string;
    rhs?: string;
    noremap: boolean;
    desc?: string;
    expr?: boolean;
    isFn?: boolean;
    callback?: () => void;
}

interface VimVContext {
    count: number;
    count1: number;
    register: string;
    operator: string;
    searchforward: number;
    insertmode: string;
    char: string;
    hlsearch: number;
    foldstart: number;
    foldend: number;
    foldlevel: number;
    folddashes: string;
    lnum: number;
    relnum: number;
    virtnum: number;
    event: Record<string, unknown> | null;
}

const DEFAULT_VIM_V: VimVContext = {
    count: 0,
    count1: 1,
    register: '"',
    operator: '',
    searchforward: 1,
    insertmode: '',
    char: '',
    hlsearch: 0,
    foldstart: 0,
    foldend: 0,
    foldlevel: 0,
    folddashes: '',
    lnum: 0,
    relnum: 0,
    virtnum: 0,
    event: null,
};

let currentVimV: VimVContext = { ...DEFAULT_VIM_V };

/**
 * Replace the current vim.v context for the duration of a callback.
 */
export function setVimVContext(ctx: Partial<VimVContext>): void {
    currentVimV = { ...DEFAULT_VIM_V, ...ctx };
}

/**
 * Reset vim.v context to defaults.
 */
export function clearVimVContext(): void {
    currentVimV = { ...DEFAULT_VIM_V };
}

export function getInsertModeChar(cm: unknown): string {
    const cmState = (cm as { state?: Record<string, unknown> } | undefined)
        ?.state;
    const vimState = cmState?.vim as
        { insertMode?: boolean; virtualReplace?: boolean } | undefined;
    if (!vimState?.insertMode) return '';
    if (vimState.virtualReplace) return 'v';
    if (cmState?.overwrite) return 'r';
    return 'i';
}

export interface LuaKeymapDelete {
    mode: MapContext;
    lhs: string;
}

export interface LuaGlobalKeymap {
    lhs: string;
    rhs: string;
    desc?: string;
}

export interface VimApiCallbacks {
    observeKeys?: (handler: (key: string) => void) => () => void;
    onSettingOverride: (
        key: string,
        value: unknown,
        directive?: string,
    ) => void;
    handleExCommand: (command: string) => void;
    getVaultName: () => string;
    onKeymap: (map: LuaKeymap) => void;
    onKeymapDel: (map: LuaKeymapDelete) => void;
    showNotice?: (msg: string) => void;
    defineExCommand?: (name: string, callback: (args: string) => void) => void;
    getLeaderKey?: () => string;
    setLeaderKey?: (key: string) => void;
    getOption?: (name: string) => unknown;
    setOption?: (name: string, value: unknown) => void;
    getAppVersion?: () => string;
    getPluginVersion?: () => string;
    executeCommand?: (id: string) => void;
    listCommands?: () => Array<{ id: string; name: string }>;
    openFile?: (path: string) => void;
    openPicker?: (source: string, opts?: { query?: string }) => void;
    onPickerKeymapChange?: (keymap: Record<string, string[]>) => void;
    oilOpen?: (path: string) => void;
    oilClose?: () => void;
    oilParent?: () => void;
    oilRoot?: () => void;
    oilRefresh?: () => void;
    oilToggleHidden?: () => void;
    oilCycleSort?: () => void;
    oilYankPath?: () => void;
    oilReveal?: () => void;
    oilOpenEntry?: () => void;
    getCurrentFile?: () => {
        path: string;
        name: string;
        extension: string;
        basename: string;
    } | null;
    getVaultPath?: () => string | null;
    getActiveFilePath?: () => string | null;
    onBufferKeymap?: (filePath: string, map: LuaKeymap) => void;
    onBufferKeymapDel?: (filePath: string, mode: string, lhs: string) => void;
    getLineCount?: () => number;
    getLines?: (start: number, end: number) => string[];
    setLines?: (start: number, end: number, lines: string[]) => void;
    getModePrompt?: (key: string) => string | undefined;
    onGlobalKeymap?: (map: LuaGlobalKeymap) => void;
    onGlobalKeymapDel?: (lhs: string) => void;
    onWhichKeyGroupLabel?: (
        key: string,
        label: string,
        context: 'editor' | 'global',
        icon?: string,
        color?: string,
    ) => void;
    onWhichKeyCommandLabel?: (
        key: string,
        label: string,
        context: 'editor' | 'global',
        icon?: string,
        color?: string,
    ) => void;
    onCursorConfig?: (shapes: Record<string, string>) => void;
    onModePromptConfig?: (prompts: Record<string, string>) => void;
    onSurroundPair?: (trigger: string, open: string, close: string) => void;
    onSurroundPairDel?: (trigger: string) => void;
    onTextObjectAdd?: (
        keys: string,
        spec: {
            open: string;
            close: string;
            multiline: boolean;
            inner: boolean;
        },
    ) => void;
    onTextObjectDel?: (keys: string) => void;
    onLeaderBinding?: (key: string, commandId: string, desc?: string) => void;
    onLeaderBindingDel?: (key: string) => void;
    // Tier 1 — Leaf introspection
    getActiveLeafInfo?: () => {
        id: string;
        type: string;
        pinned: boolean;
        filePath: string | null;
    } | null;
    listLeaves?: () => Array<{
        id: string;
        type: string;
        pinned: boolean;
        filePath: string | null;
    }>;
    isMarkdownView?: () => boolean;
    // Tier 2 — Command execution (reuses existing executeCommand)
    // Tier 3 — Leaf management
    focusDirection?: (direction: string) => void;
    closeActiveLeaf?: () => void;
    splitDirection?: (direction: string) => void;
    getLeafForFile?: (path: string) => {
        id: string;
        type: string;
        pinned: boolean;
        filePath: string | null;
    } | null;
    // Phase 7 — Metadata queries
    getFileFrontmatter?: (path?: string) => Record<string, unknown> | null;
    getFileTags?: (path?: string) => string[];
    getFileLinks?: (
        path?: string,
    ) => Array<{ link: string; display: string; original: string }>;
    getFileBacklinks?: (path?: string) => string[];
    getFileHeadings?: (
        path?: string,
    ) => Array<{ heading: string; level: number }>;
    getFileEmbeds?: (path?: string) => Array<{ link: string; display: string }>;
    getFileAliases?: (path?: string) => string[];
    getFileTasks?: (
        path?: string,
    ) => Array<{ text: string; status: string; line: number }>;
    getFileLists?: (
        path?: string,
    ) => Array<{ text: string; line: number; indent: number }>;
    // Phase 7 — Editor state
    getSelection?: () => string | null;
    getCursorPosition?: () => { line: number; col: number } | null;
    setCursorPosition?: (line: number, col: number) => void;
    getMode?: () => string;
    // Phase 7 — Vault filesystem
    fsFiles?: (pattern?: string) => string[];
    fsAllFiles?: () => string[];
    fsFolders?: () => string[];
    fsExists?: (path: string) => boolean;
    fsStat?: (
        path?: string,
    ) => { ctime: number; mtime: number; size: number } | null;
    fsCreate?: (path: string, content?: string) => void;
    fsWrite?: (path: string | undefined, content: string) => void;
    fsAppend?: (path: string | undefined, content: string) => void;
    fsRename?: (path: string | undefined, newPath: string) => void;
    fsMove?: (path: string | undefined, dest: string) => void;
    fsTrash?: (path?: string) => void;
    imGet?: () => string | null;
    imSet?: (id: string) => void;
    imSave?: () => void | Promise<void>;
    imRestore?: () => void;
    imGetEnabled?: () => boolean;
    imSetEnabled?: (value: boolean) => void;
    imGetAuto?: () => boolean;
    imSetAuto?: (value: boolean) => void;
    autocmdManager: AutocmdManager;
    highlightManager?: HighlightManager;
    runner?: CoroutineRunner;
    fsRead?: (path: string) => Promise<string>;
    getVimApi?: () => VimApi | null;
    getSearchForward?: () => number;
    setSearchForward?: (value: number) => void;
    getHlSearch?: () => number;
    getCmAdapter?: () => CmAdapter | null;
    getEditorView?: () => import('@codemirror/view').EditorView | null;
    // Tier 1 — Mark operations (for nvim_buf_get/set/del_mark)
    getMarkPos?: (name: string) => { line: number; ch: number } | null;
    setMark?: (name: string, line: number, ch: number) => void;
    delMark?: (name: string) => boolean;
    // Tier 1 — Line operations (for nvim_get/set_current_line)
    getLine?: (line: number) => string | null;
    setLine?: (line: number, text: string) => void;
    // Tier 1 — Text replacement (for nvim_buf_set_text)
    replaceRange?: (
        text: string,
        fromLine: number,
        fromCol: number,
        toLine: number,
        toCol: number,
    ) => void;
    getBufferOption?: (name: string) => unknown;
    setBufferOption?: (name: string, value: unknown) => void;
    pluginExists?: (name: string) => boolean;
    fetchPlugin?: (
        owner: string,
        repoFullName: string,
        ref: string,
        options: { branch?: string; tag?: string; commit?: string },
    ) => Promise<{ files: string[] }>;
    isPluginAutoFetchEnabled?: () => boolean;
}

export const MODE_PROMPT_MAP: Record<string, string> = {
    normal: 'normal',
    insert: 'insert',
    visual: 'visual',
    replace: 'replace',
    visual_line: 'visualLine',
    visual_block: 'visualBlock',
    select: 'select',
    vreplace: 'vreplace',
    command: 'command',
    search: 'search',
    insert_normal: 'insertNormal',
};

export function readLuaString(L: lua_State, index: number): string | null {
    if (!lua.lua_isstring(L, index)) return null;
    const str = lua.lua_tolstring(L, index);
    return str ? to_jsstring(str) : null;
}

function readLuaValue(L: lua_State, index: number): unknown {
    if (lua.lua_isnil(L, index)) return undefined;
    if (lua.lua_isboolean(L, index)) return lua.lua_toboolean(L, index);
    if (lua.lua_isnumber(L, index)) return lua.lua_tonumber(L, index);
    if (lua.lua_isstring(L, index)) {
        const value = lua.lua_tolstring(L, index);
        return value ? to_jsstring(value) : '';
    }
    return undefined;
}

export function pushLuaValue(L: lua_State, value: unknown): void {
    if (value === undefined || value === null) {
        lua.lua_pushnil(L);
        return;
    }
    if (typeof value === 'boolean') {
        lua.lua_pushboolean(L, value);
        return;
    }
    if (typeof value === 'number') {
        lua.lua_pushnumber(L, value);
        return;
    }
    if (typeof value === 'string') {
        lua.lua_pushstring(L, to_luastring(value));
        return;
    }
    lua.lua_pushnil(L);
}

export function pushLuaAny(L: lua_State, value: unknown): void {
    if (Array.isArray(value)) {
        lua.lua_newtable(L);
        for (let i = 0; i < value.length; i++) {
            pushLuaAny(L, value[i]);
            lua.lua_rawseti(L, -2, i + 1);
        }
        return;
    }
    if (value && typeof value === 'object') {
        lua.lua_newtable(L);
        for (const [key, entry] of Object.entries(
            value as Record<string, unknown>,
        )) {
            pushLuaAny(L, entry);
            lua.lua_setfield(L, -2, to_luastring(key));
        }
        return;
    }
    pushLuaValue(L, value);
}

function pushAutocmdEventData(L: lua_State, data: AutocmdEventData): void {
    lua.lua_newtable(L);
    lua.lua_pushstring(L, to_luastring(data.event));
    lua.lua_setfield(L, -2, to_luastring('event'));
    lua.lua_pushstring(L, to_luastring(data.file));
    lua.lua_setfield(L, -2, to_luastring('file'));
    lua.lua_pushstring(L, to_luastring(data.match));
    lua.lua_setfield(L, -2, to_luastring('match'));
    lua.lua_pushnumber(L, data.buf);
    lua.lua_setfield(L, -2, to_luastring('buf'));
    lua.lua_pushnumber(L, data.id);
    lua.lua_setfield(L, -2, to_luastring('id'));
    if (data.group === null) {
        lua.lua_pushnil(L);
    } else {
        lua.lua_pushnumber(L, data.group);
    }
    lua.lua_setfield(L, -2, to_luastring('group'));
    pushLuaAny(L, data.data);
    lua.lua_setfield(L, -2, to_luastring('data'));
}

function formatDirectiveValue(value: unknown): string {
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    return 'nil';
}

export function replaceLeaderKey(input: string, leaderKey: string): string {
    return input.replace(/<leader>/gi, leaderKey);
}

function readKeyString(L: lua_State, index: number): string | null {
    const bytes = lua.lua_tolstring(L, index);
    return bytes ? termcodesToNotation(bytes, true) : null;
}

function getModeList(L: lua_State, index: number): string[] {
    if (lua.lua_isnil(L, index)) return ['n'];
    const modeStr = readLuaString(L, index);
    if (modeStr !== null) {
        return modeStr.length > 0 ? modeStr.split('') : ['n'];
    }
    if (!lua.lua_istable(L, index)) return [];
    const modes: string[] = [];
    for (let i = 1; i < 1000; i++) {
        lua.lua_rawgeti(L, index, i);
        if (lua.lua_isnil(L, -1)) {
            lua.lua_pop(L, 1);
            break;
        }
        const entry = readLuaString(L, -1);
        lua.lua_pop(L, 1);
        if (!entry) continue;
        for (const ch of entry.split('')) modes.push(ch);
    }
    return modes.length > 0 ? modes : ['n'];
}

function getStringList(L: lua_State, index: number): string[] {
    const str = readLuaString(L, index);
    if (str !== null) return [str];
    if (!lua.lua_istable(L, index)) return [];
    const values: string[] = [];
    for (let i = 1; i < 1000; i++) {
        lua.lua_rawgeti(L, index, i);
        if (lua.lua_isnil(L, -1)) {
            lua.lua_pop(L, 1);
            break;
        }
        const entry = readLuaString(L, -1);
        lua.lua_pop(L, 1);
        if (entry) values.push(entry);
    }
    return values;
}

function readStringListField(
    L: lua_State,
    index: number,
    field: string,
): string[] {
    lua.lua_getfield(L, index, to_luastring(field));
    const values = getStringList(L, -1);
    lua.lua_pop(L, 1);
    return values;
}

function modeToContext(mode: string): MapContext | null {
    switch (mode) {
        case 'n':
            return 'normal';
        case 'v':
        case 'x':
            return 'visual';
        case 'i':
            return 'insert';
        case 's':
            return 'select';
        case 'o':
            return 'operatorPending';
        default:
            return null;
    }
}

export function readBooleanField(
    L: lua_State,
    index: number,
    field: string,
): boolean | undefined {
    lua.lua_getfield(L, index, to_luastring(field));
    if (lua.lua_isnil(L, -1)) {
        lua.lua_pop(L, 1);
        return undefined;
    }
    const value = lua.lua_toboolean(L, -1);
    lua.lua_pop(L, 1);
    return value;
}

export function readStringField(
    L: lua_State,
    index: number,
    field: string,
): string | undefined {
    lua.lua_getfield(L, index, to_luastring(field));
    const value = readLuaString(L, -1);
    lua.lua_pop(L, 1);
    return value ?? undefined;
}

function readNumberField(
    L: lua_State,
    index: number,
    field: string,
): number | undefined {
    lua.lua_getfield(L, index, to_luastring(field));
    if (lua.lua_isnil(L, -1)) {
        lua.lua_pop(L, 1);
        return undefined;
    }
    const value = lua.lua_tonumber(L, -1);
    lua.lua_pop(L, 1);
    if (Number.isNaN(value)) return undefined;
    return value;
}

function requireBufferZero(
    state: lua_State,
    index: number,
    fnName: string,
): void {
    if (!lua.lua_isnumber(state, index)) {
        lauxlib.luaL_error(
            state,
            to_luastring(`${fnName}: expected buffer number`),
        );
    }
    const buffer = lua.lua_tonumber(state, index);
    if (buffer !== 0) {
        lauxlib.luaL_error(
            state,
            to_luastring(
                `${fnName}: buffer numbers other than 0 are not supported in Obsidian; use buffer = 0 for current file`,
            ),
        );
    }
}

function requireWindowZero(
    state: lua_State,
    index: number,
    fnName: string,
): void {
    if (!lua.lua_isnumber(state, index)) {
        lauxlib.luaL_error(
            state,
            to_luastring(`${fnName}: expected window number`),
        );
    }
    const win = lua.lua_tonumber(state, index);
    if (win !== 0) {
        lauxlib.luaL_error(
            state,
            to_luastring(
                `${fnName}: window numbers other than 0 are not supported in Obsidian; use window = 0 for current editor`,
            ),
        );
    }
}

function requireNamespaceZero(
    state: lua_State,
    index: number,
    fnName: string,
): void {
    if (!lua.lua_isnumber(state, index)) {
        lauxlib.luaL_error(
            state,
            to_luastring(`${fnName}: expected ns_id number`),
        );
    }
    const ns = lua.lua_tonumber(state, index);
    if (ns !== 0) {
        lauxlib.luaL_error(
            state,
            to_luastring(
                'namespaced highlights are not supported; use ns_id = 0',
            ),
        );
    }
}

function readAnyField(L: lua_State, index: number, field: string): unknown {
    lua.lua_getfield(L, index, to_luastring(field));
    const value = readLuaValue(L, -1);
    lua.lua_pop(L, 1);
    return value;
}

function readHighlightAttrs(L: lua_State, index: number): HighlightAttrs {
    const attrs: HighlightAttrs = {};
    if (!lua.lua_istable(L, index)) return attrs;
    attrs.fg =
        readStringField(L, index, 'fg') ??
        readStringField(L, index, 'foreground') ??
        undefined;
    attrs.bg =
        readStringField(L, index, 'bg') ??
        readStringField(L, index, 'background') ??
        undefined;
    attrs.sp =
        readStringField(L, index, 'sp') ??
        readStringField(L, index, 'special') ??
        undefined;
    attrs.bold = readBooleanField(L, index, 'bold') ?? undefined;
    attrs.italic = readBooleanField(L, index, 'italic') ?? undefined;
    attrs.underline = readBooleanField(L, index, 'underline') ?? undefined;
    attrs.undercurl = readBooleanField(L, index, 'undercurl') ?? undefined;
    attrs.underdouble = readBooleanField(L, index, 'underdouble') ?? undefined;
    attrs.underdotted = readBooleanField(L, index, 'underdotted') ?? undefined;
    attrs.underdashed = readBooleanField(L, index, 'underdashed') ?? undefined;
    attrs.strikethrough =
        readBooleanField(L, index, 'strikethrough') ?? undefined;
    attrs.reverse = readBooleanField(L, index, 'reverse') ?? undefined;
    attrs.link = readStringField(L, index, 'link') ?? undefined;
    attrs.default = readBooleanField(L, index, 'default') ?? undefined;
    attrs.update = readBooleanField(L, index, 'update') ?? undefined;
    const blend = readAnyField(L, index, 'blend');
    if (typeof blend === 'number') attrs.blend = blend;
    return attrs;
}

function createWarnStub(
    L: lua_State,
    namespace: string,
    warned: Set<string>,
): void {
    lua.lua_newtable(L);
    lua.lua_newtable(L);
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const key = readLuaString(state, 2) ?? '?';
        const warnKey = `vim.${namespace}.${key}`;
        if (!warned.has(warnKey)) {
            warned.add(warnKey);
            console.warn(
                `Vim Motions: vim.${namespace}.${key} is not available in Obsidian`,
            );
        }
        lua.lua_pushjsfunction(state, () => 0);
        return 1;
    });
    lua.lua_setfield(L, -2, to_luastring('__index'));
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        lua.lua_pushvalue(state, 2);
        lua.lua_pushvalue(state, 3);
        luaRawset(state, 1);
        return 0;
    });
    lua.lua_setfield(L, -2, to_luastring('__newindex'));
    lua.lua_setmetatable(L, -2);
}

function createWarnVarTable(
    L: lua_State,
    namespace: string,
    warned: Set<string>,
): void {
    lua.lua_newtable(L);
    lua.lua_newtable(L);
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const key = readLuaString(state, 2) ?? '?';
        const warnKey = `vim.${namespace}.${key}`;
        if (!warned.has(warnKey)) {
            warned.add(warnKey);
            console.warn(
                `Vim Motions: vim.${namespace}.${key} is not available in Obsidian`,
            );
        }
        lua.lua_pushnil(state);
        return 1;
    });
    lua.lua_setfield(L, -2, to_luastring('__index'));
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        lua.lua_pushvalue(state, 2);
        lua.lua_pushvalue(state, 3);
        luaRawset(state, 1);
        return 0;
    });
    lua.lua_setfield(L, -2, to_luastring('__newindex'));
    lua.lua_setmetatable(L, -2);
}

const SUPPORTED_NVIM_API_FUNCTIONS = new Set<string>([
    'nvim_buf_call',
    'nvim_win_call',
    'nvim_win_get_config',
    'nvim_create_user_command',
    'nvim_del_user_command',
    'nvim_create_autocmd',
    'nvim_create_augroup',
    'nvim_del_autocmd',
    'nvim_del_augroup_by_name',
    'nvim_clear_autocmds',
    'nvim_create_namespace',
    'nvim_set_hl',
    'nvim_get_hl',
    'nvim_set_keymap',
    'nvim_del_keymap',
    'nvim_get_keymap',
    'nvim_buf_set_keymap',
    'nvim_buf_del_keymap',
    'nvim_buf_get_keymap',
    'nvim_buf_get_lines',
    'nvim_buf_set_lines',
    'nvim_buf_set_text',
    'nvim_buf_get_text',
    'nvim_buf_is_valid',
    'nvim_get_current_buf',
    'nvim_get_current_win',
    'nvim_list_wins',
    'nvim_get_current_tabpage',
    'nvim_get_mode',
    'nvim_get_current_line',
    'nvim_del_current_line',
    'nvim_set_current_line',
    'nvim_buf_get_name',
    'nvim_buf_line_count',
    'nvim_win_get_cursor',
    'nvim_win_set_cursor',
    'nvim_win_get_buf',
    'nvim_buf_get_mark',
    'nvim_buf_set_mark',
    'nvim_buf_del_mark',
    'nvim_buf_get_var',
    'nvim_buf_set_var',
    'nvim_buf_get_option',
    'nvim_buf_set_option',
    'nvim_buf_set_extmark',
    'nvim_buf_get_extmarks',
    'nvim_buf_get_extmark_by_id',
    'nvim_buf_del_extmark',
    'nvim_buf_clear_namespace',
    'nvim_get_option',
    'nvim_set_option',
    'nvim_get_option_value',
    'nvim_set_option_value',
    'nvim_get_vvar',
    'nvim_set_vvar',
    'nvim_strwidth',
    'nvim_command',
    'nvim_feedkeys',
    'nvim_replace_termcodes',
    'nvim_echo',
]);

const KNOWN_NVIM_API_FUNCTIONS = new Set<string>([
    'nvim_buf_add_highlight',
    'nvim_buf_attach',
    'nvim_buf_call',
    'nvim_buf_clear_namespace',
    'nvim_buf_create_user_command',
    'nvim_buf_del_extmark',
    'nvim_buf_del_keymap',
    'nvim_buf_del_mark',
    'nvim_buf_del_user_command',
    'nvim_buf_del_var',
    'nvim_buf_delete',
    'nvim_buf_detach',
    'nvim_buf_get_changedtick',
    'nvim_buf_get_commands',
    'nvim_buf_get_extmark_by_id',
    'nvim_buf_get_extmarks',
    'nvim_buf_get_keymap',
    'nvim_buf_get_lines',
    'nvim_buf_get_mark',
    'nvim_buf_get_name',
    'nvim_buf_get_offset',
    'nvim_buf_get_option',
    'nvim_buf_get_text',
    'nvim_buf_get_var',
    'nvim_buf_is_loaded',
    'nvim_buf_is_valid',
    'nvim_buf_line_count',
    'nvim_buf_set_extmark',
    'nvim_buf_set_keymap',
    'nvim_buf_set_lines',
    'nvim_buf_set_mark',
    'nvim_buf_set_name',
    'nvim_buf_set_option',
    'nvim_buf_set_text',
    'nvim_buf_set_var',
    'nvim_call_dict_function',
    'nvim_call_function',
    'nvim_chan_send',
    'nvim_clear_autocmds',
    'nvim_cmd',
    'nvim_command',
    'nvim_create_augroup',
    'nvim_create_autocmd',
    'nvim_create_buf',
    'nvim_create_namespace',
    'nvim_create_user_command',
    'nvim_del_augroup_by_id',
    'nvim_del_augroup_by_name',
    'nvim_del_autocmd',
    'nvim_del_current_line',
    'nvim_del_keymap',
    'nvim_del_mark',
    'nvim_del_user_command',
    'nvim_del_var',
    'nvim_echo',
    'nvim_err_write',
    'nvim_err_writeln',
    'nvim_eval',
    'nvim_eval_statusline',
    'nvim_exec_autocmds',
    'nvim_exec_lua',
    'nvim_feedkeys',
    'nvim_get_all_options_info',
    'nvim_get_api_info',
    'nvim_get_autocmds',
    'nvim_get_chan_info',
    'nvim_get_color_by_name',
    'nvim_get_color_map',
    'nvim_get_commands',
    'nvim_get_context',
    'nvim_get_current_buf',
    'nvim_get_current_line',
    'nvim_get_current_tabpage',
    'nvim_get_current_win',
    'nvim_get_hl',
    'nvim_get_hl_id_by_name',
    'nvim_get_hl_ns',
    'nvim_get_keymap',
    'nvim_get_mark',
    'nvim_get_mode',
    'nvim_get_namespaces',
    'nvim_get_option',
    'nvim_get_option_value',
    'nvim_get_proc',
    'nvim_get_proc_children',
    'nvim_get_runtime_file',
    'nvim_get_var',
    'nvim_get_vvar',
    'nvim_input',
    'nvim_input_mouse',
    'nvim_list_bufs',
    'nvim_list_chans',
    'nvim_list_runtime_paths',
    'nvim_list_tabpages',
    'nvim_list_uis',
    'nvim_list_wins',
    'nvim_load_context',
    'nvim_open_tabpage',
    'nvim_open_term',
    'nvim_open_win',
    'nvim_out_write',
    'nvim_parse_cmd',
    'nvim_parse_expression',
    'nvim_paste',
    'nvim_put',
    'nvim_replace_termcodes',
    'nvim_select_popupmenu_item',
    'nvim_set_client_info',
    'nvim_set_current_buf',
    'nvim_set_current_dir',
    'nvim_set_current_line',
    'nvim_set_current_tabpage',
    'nvim_set_current_win',
    'nvim_set_decoration_provider',
    'nvim_set_extmark',
    'nvim_set_hl',
    'nvim_set_hl_ns',
    'nvim_set_hl_ns_fast',
    'nvim_set_keymap',
    'nvim_set_option',
    'nvim_set_option_value',
    'nvim_set_var',
    'nvim_set_vvar',
    'nvim_strwidth',
    'nvim_tabpage_del_var',
    'nvim_tabpage_get_number',
    'nvim_tabpage_get_var',
    'nvim_tabpage_get_win',
    'nvim_tabpage_is_valid',
    'nvim_tabpage_list_wins',
    'nvim_tabpage_set_var',
    'nvim_tabpage_set_win',
    'nvim_win_call',
    'nvim_win_close',
    'nvim_win_del_var',
    'nvim_win_get_buf',
    'nvim_win_get_config',
    'nvim_win_get_cursor',
    'nvim_win_get_height',
    'nvim_win_get_number',
    'nvim_win_get_option',
    'nvim_win_get_position',
    'nvim_win_get_tabpage',
    'nvim_win_get_var',
    'nvim_win_get_width',
    'nvim_win_hide',
    'nvim_win_is_valid',
    'nvim_win_set_buf',
    'nvim_win_set_config',
    'nvim_win_set_cursor',
    'nvim_win_set_height',
    'nvim_win_set_hl_ns',
    'nvim_win_set_option',
    'nvim_win_set_var',
    'nvim_win_set_width',
    'nvim_win_text_height',
]);

const NVIM_API_RETURN_TYPES = {
    boolean: new Set([
        'nvim_del_mark',
        'nvim_buf_attach',
        'nvim_buf_detach',
        'nvim_buf_is_loaded',
        'nvim_buf_is_valid',
        'nvim_win_is_valid',
        'nvim_tabpage_is_valid',
        'nvim_paste',
    ]),
    integer: new Set([
        'nvim_create_buf',
        'nvim_input',
        'nvim_strwidth',
        'nvim_open_term',
        'nvim_open_win',
        'nvim_buf_get_changedtick',
        'nvim_buf_get_offset',
        'nvim_win_get_height',
        'nvim_win_get_number',
        'nvim_win_get_width',
        'nvim_tabpage_get_number',
        'nvim_open_tabpage',
        'nvim_get_hl_id_by_name',
        'nvim_echo',
        'nvim_get_color_by_name',
    ]),
    string: new Set(['nvim_eval']),
    table: new Set([
        'nvim_get_all_options_info',
        'nvim_get_api_info',
        'nvim_get_autocmds',
        'nvim_get_chan_info',
        'nvim_get_color_map',
        'nvim_get_commands',
        'nvim_get_context',
        'nvim_get_mark',
        'nvim_get_mode',
        'nvim_get_namespaces',
        'nvim_get_proc',
        'nvim_get_proc_children',
        'nvim_get_var',
        'nvim_get_vvar',
        'nvim_eval_statusline',
        'nvim_exec_lua',
        'nvim_parse_cmd',
        'nvim_parse_expression',
        'nvim_buf_get_commands',
        'nvim_buf_get_text',
        'nvim_buf_get_keymap',
        'nvim_win_get_config',
        'nvim_win_get_position',
        'nvim_win_get_tabpage',
        'nvim_win_get_var',
        'nvim_tabpage_get_var',
        'nvim_tabpage_get_win',
        'nvim_win_text_height',
        'nvim_load_context',
        'nvim_get_hl_ns',
    ]),
    array: new Set([
        'nvim_list_bufs',
        'nvim_list_chans',
        'nvim_list_runtime_paths',
        'nvim_list_tabpages',
        'nvim_list_uis',
        'nvim_list_wins',
        'nvim_get_runtime_file',
        'nvim_tabpage_list_wins',
    ]),
    void: new Set([
        'nvim_chan_send',
        'nvim_del_current_line',
        'nvim_del_var',
        'nvim_set_client_info',
        'nvim_set_current_buf',
        'nvim_set_current_dir',
        'nvim_set_current_tabpage',
        'nvim_set_current_win',
        'nvim_set_decoration_provider',
        'nvim_set_hl_ns',
        'nvim_set_hl_ns_fast',
        'nvim_set_var',
        'nvim_set_vvar',
        'nvim_buf_call',
        'nvim_buf_delete',
        'nvim_buf_set_name',
        'nvim_buf_del_var',
        'nvim_win_close',
        'nvim_win_del_var',
        'nvim_win_hide',
        'nvim_win_set_buf',
        'nvim_win_set_config',
        'nvim_win_set_height',
        'nvim_win_set_hl_ns',
        'nvim_win_set_var',
        'nvim_win_set_width',
        'nvim_win_get_option',
        'nvim_win_set_option',
        'nvim_tabpage_del_var',
        'nvim_tabpage_set_var',
        'nvim_tabpage_set_win',
        'nvim_exec_autocmds',
        'nvim_select_popupmenu_item',
        'nvim_err_write',
        'nvim_err_writeln',
        'nvim_out_write',
        'nvim_input_mouse',
        'nvim_put',
        'nvim_buf_create_user_command',
        'nvim_buf_del_user_command',
        'nvim_set_option_value',
    ]),
    nil: new Set([
        'nvim_call_dict_function',
        'nvim_call_function',
        'nvim_cmd',
        'nvim_get_option_value',
    ]),
};

export interface VimApiState {
    globals: Map<string, unknown>;
}

interface OperatorfuncState {
    name: string | null;
}

function readOperatorfuncTo(
    state: lua_State,
    operatorfunc: OperatorfuncState,
): number {
    lua.lua_pushstring(state, to_luastring(operatorfunc.name ?? ''));
    return 1;
}

function writeOperatorfuncFrom(
    state: lua_State,
    valueIndex: number,
    L: lua_State,
    callbacks: VimApiCallbacks,
    operatorfunc: OperatorfuncState,
): number {
    const vimApi = callbacks.getVimApi?.();
    if (lua.lua_isfunction(state, valueIndex)) {
        lua.lua_pushvalue(state, valueIndex);
        const ref = lauxlib.luaL_ref(state, lua.LUA_REGISTRYINDEX);
        operatorfunc.name = null;
        const wrapper = (_cm: unknown, type: string) => {
            void _cm;
            lua.lua_rawgeti(state, lua.LUA_REGISTRYINDEX, ref);
            lua.lua_pushstring(state, to_luastring(type));
            const status = lua.lua_pcall(state, 1, 0, 0);
            if (status !== lua.LUA_OK) {
                const msg = lua.lua_tolstring(state, -1);
                console.error(
                    `operatorfunc error: ${msg ? to_jsstring(msg) : 'unknown'}`,
                );
                lua.lua_pop(state, 1);
            }
        };
        vimApi?.setOperatorfunc?.(wrapper);
    } else if (lua.lua_isstring(state, valueIndex)) {
        const fnName = readLuaString(state, valueIndex) ?? '';
        operatorfunc.name = fnName;
        const wrapper = (_cm: unknown, type: string) => {
            const vluaPrefix = 'v:lua.';
            const luaFn = fnName.startsWith(vluaPrefix)
                ? fnName.slice(vluaPrefix.length)
                : fnName;
            const callCode = `${luaFn}('${type}')`;
            const callStatus = lauxlib.luaL_dostring(L, to_luastring(callCode));
            if (callStatus !== lua.LUA_OK) {
                const msg = lua.lua_tolstring(L, -1);
                const error = msg ? to_jsstring(msg) : 'unknown';
                console.error(`Vim Motions: operatorfunc error: ${error}`);
                lua.lua_pop(L, 1);
            }
        };
        vimApi?.setOperatorfunc?.(wrapper);
    } else if (lua.lua_isnil(state, valueIndex)) {
        operatorfunc.name = null;
        vimApi?.setOperatorfunc?.(null);
    }
    return 0;
}

const globalOptionShadow = new Map<string, unknown>();
const GLOBAL_OPTION_DEFAULTS = new Map<string, unknown>([
    ['eventignore', ''],
    ['selection', 'inclusive'],
    ['cmdheight', 1],
    ['columns', 80],
    ['lines', 24],
    ['cpo', 'aABceFs'],
    ['background', 'dark'],
]);

function readGlobalOption(callbacks: VimApiCallbacks, key: string): unknown {
    let value: unknown;
    try {
        value = callbacks.getOption?.(key);
    } catch {
        // The built-in engine may throw for options it does not implement.
    }
    if (value !== undefined && value !== null && !(value instanceof Error)) {
        return value;
    }
    if (globalOptionShadow.has(key)) return globalOptionShadow.get(key);
    if (key === 'background' && typeof document !== 'undefined') {
        return document.body?.classList.contains('theme-light')
            ? 'light'
            : 'dark';
    }
    return GLOBAL_OPTION_DEFAULTS.get(key);
}

function writeGlobalOption(
    callbacks: VimApiCallbacks,
    key: string,
    value: unknown,
): void {
    globalOptionShadow.set(key, value);
    try {
        callbacks.setOption?.(key, value);
    } catch {
        // Retain compatibility values even when the engine rejects them.
    }
}

export function injectVimApi(
    L: lua_State,
    callbacks: VimApiCallbacks,
): VimApiState {
    const globals = new Map<string, unknown>();
    const bufferVars = new Map<string, Map<string, unknown>>();
    const bufferKeymaps = new Map<string, LuaKeymap[]>();
    const namespacesByName = new Map<string, number>();
    let nextNamespaceId = 1;
    const allocateNamespace = (requested: number): number => {
        if (requested === 0) return nextNamespaceId++;
        nextNamespaceId = Math.max(nextNamespaceId, requested + 1);
        return requested;
    };
    const operatorfunc: OperatorfuncState = { name: null };
    globalOptionShadow.clear();
    const notifiedMessages = new Set<string>();
    const warnedNamespaceKeys = new Set<string>();
    const warnedApiFunctions = new Set<string>();
    const userEnvMap = new Map<string, string>();
    const registerBufferKeymap = (
        filePath: string,
        keymap: LuaKeymap,
    ): void => {
        let maps = bufferKeymaps.get(filePath);
        if (!maps) {
            maps = [];
            bufferKeymaps.set(filePath, maps);
        }
        const idx = maps.findIndex(
            (entry) => entry.mode === keymap.mode && entry.lhs === keymap.lhs,
        );
        if (idx !== -1) maps.splice(idx, 1);
        maps.push(keymap);
    };
    const unregisterBufferKeymap = (
        filePath: string,
        mode: LuaKeymap['mode'],
        lhs: string,
    ): void => {
        const maps = bufferKeymaps.get(filePath);
        if (!maps) return;
        const idx = maps.findIndex(
            (entry) => entry.mode === mode && entry.lhs === lhs,
        );
        if (idx !== -1) maps.splice(idx, 1);
        if (maps.length === 0) bufferKeymaps.delete(filePath);
    };
    const getLeaderKey = () => callbacks.getLeaderKey?.() ?? '\\';
    const autocmdManager = callbacks.autocmdManager;
    const defaultVimrcPath = 'init.lua';
    const getCuratedEnv = (key: string): string | null => {
        switch (key) {
            case 'HOME':
                return callbacks.getVaultPath?.() ?? '';
            case 'VIMRUNTIME':
                return 'obsidian';
            case 'VIM':
                return 'motions';
            case 'MYVIMRC':
                return defaultVimrcPath;
            case 'TERM':
                return 'obsidian';
            case 'OBSIDIAN_VERSION':
                return callbacks.getAppVersion?.() ?? '';
            default:
                return null;
        }
    };

    const notifyWithLevel = (msg: string, level?: number): void => {
        const resolved = level ?? 2;
        if (resolved >= 5) return;
        if (resolved >= 4) {
            callbacks.showNotice?.(msg);
            console.error(msg);
            return;
        }
        if (resolved === 3) {
            callbacks.showNotice?.(msg);
            console.warn(msg);
            return;
        }
        if (resolved === 2) {
            callbacks.showNotice?.(msg);
            return;
        }
        console.debug(msg);
    };

    lua.lua_newtable(L);
    const vimTableIndex = lua.lua_gettop(L);
    injectOnKey(L, vimTableIndex, allocateNamespace, callbacks.observeKeys);

    lua.lua_newtable(L);
    const optTableIndex = lua.lua_gettop(L);
    lua.lua_newtable(L);
    const loggedLuaOptions = new Set<string>();
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const key = readLuaString(state, 2);
        if (!key) {
            lua.lua_pushnil(state);
            return 1;
        }
        if (key === 'operatorfunc') {
            return readOperatorfuncTo(state, operatorfunc);
        }
        const spec = KNOWN_SET_OPTIONS[key];
        if (spec) {
            const value = callbacks.getOption?.(key);
            pushLuaValue(state, value);
            return 1;
        }
        const nvimEntry = getNeovimOption(key);
        if (
            nvimEntry &&
            isNoopLogged(nvimEntry) &&
            !loggedLuaOptions.has(key)
        ) {
            console.debug(`Vim Motions: vim.opt.${key} — ${nvimEntry.reason}`);
            loggedLuaOptions.add(key);
        }
        lua.lua_pushnil(state);
        return 1;
    });
    lua.lua_setfield(L, -2, to_luastring('__index'));
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const key = readLuaString(state, 2);
        if (!key) return 0;
        if (key === 'operatorfunc') {
            return writeOperatorfuncFrom(state, 3, L, callbacks, operatorfunc);
        }
        const spec = KNOWN_SET_OPTIONS[key];
        if (!spec) {
            const nvimEntry = getNeovimOption(key);
            if (nvimEntry) {
                if (!loggedLuaOptions.has(key)) {
                    if (isRejected(nvimEntry)) {
                        console.warn(
                            `Vim Motions: vim.opt.${key} is not supported: ${nvimEntry.reason}`,
                        );
                    } else if (isNoopLogged(nvimEntry)) {
                        console.debug(
                            `Vim Motions: vim.opt.${key} — ${nvimEntry.reason}`,
                        );
                    }
                    loggedLuaOptions.add(key);
                }
            } else {
                console.warn(`Vim Motions: unknown vim.opt option "${key}"`);
            }
            return 0;
        }
        let value: unknown;
        if (
            (spec.type === 'string' || spec.type === 'sideEffect') &&
            lua.lua_istable(state, 3)
        ) {
            const items = getStringList(state, 3);
            value = items.join(',');
        } else {
            value = readLuaValue(state, 3);
        }
        if (spec.type === 'sideEffect') {
            const directive = `vim.opt.${key} = ${formatDirectiveValue(value)}`;
            spec.apply(
                value,
                (sKey, sValue, sDirective) => {
                    callbacks.onSettingOverride(sKey, sValue, sDirective);
                    callbacks.setOption?.(key, sValue);
                },
                directive,
            );
            return 0;
        }
        callbacks.onSettingOverride(
            spec.settingsKey,
            value,
            `vim.opt.${key} = ${formatDirectiveValue(value)}`,
        );
        callbacks.setOption?.(key, value);
        return 0;
    });
    lua.lua_setfield(L, -2, to_luastring('__newindex'));
    lua.lua_setmetatable(L, optTableIndex);
    lua.lua_pushvalue(L, optTableIndex);
    lua.lua_setfield(L, vimTableIndex, to_luastring('opt'));
    lua.lua_pushvalue(L, optTableIndex);
    lua.lua_setfield(L, vimTableIndex, to_luastring('o'));
    lua.lua_pop(L, 1);

    lua.lua_newtable(L);
    const gTableIndex = lua.lua_gettop(L);
    lua.lua_newtable(L);
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const key = readLuaString(state, 2);
        if (!key) {
            lua.lua_pushnil(state);
            return 1;
        }
        if (key === 'mapleader') {
            pushLuaValue(state, getLeaderKey());
            return 1;
        }
        if (key === 'maplocalleader') {
            pushLuaValue(state, callbacks.getLeaderKey?.());
            return 1;
        }
        if (key.startsWith('mode_prompt_')) {
            const modeKey = key.replace('mode_prompt_', '');
            const mapped = MODE_PROMPT_MAP[modeKey];
            const prompt = mapped
                ? callbacks.getModePrompt?.(mapped)
                : undefined;
            if (prompt !== undefined) {
                pushLuaValue(state, prompt);
                return 1;
            }
        }
        pushLuaValue(state, globals.get(key));
        return 1;
    });
    lua.lua_setfield(L, -2, to_luastring('__index'));
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const key = readLuaString(state, 2);
        if (!key) return 0;
        if (key === 'mapleader') {
            const value = readLuaString(state, 3) ?? '';
            globals.set(key, value);
            callbacks.setLeaderKey?.(value);
            return 0;
        }
        if (key === 'maplocalleader') {
            const value = readLuaString(state, 3) ?? '';
            globals.set(key, value);
            return 0;
        }
        if (key.startsWith('mode_prompt_')) {
            const modeKey = key.replace('mode_prompt_', '');
            const mapped = MODE_PROMPT_MAP[modeKey];
            const value = readLuaString(state, 3);
            if (mapped && value !== null) {
                globals.set(key, value);
                callbacks.onSettingOverride(
                    `modePrompts.${mapped}`,
                    value,
                    `vim.g.${key} = ${JSON.stringify(value)}`,
                );
            }
            return 0;
        }
        globals.set(key, readLuaValue(state, 3));
        return 0;
    });
    lua.lua_setfield(L, -2, to_luastring('__newindex'));
    lua.lua_setmetatable(L, gTableIndex);
    lua.lua_pushvalue(L, gTableIndex);
    lua.lua_setfield(L, vimTableIndex, to_luastring('g'));
    lua.lua_pop(L, 1);

    lua.lua_newtable(L);
    const bTableIndex = lua.lua_gettop(L);
    lua.lua_newtable(L);
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const key = readLuaString(state, 2);
        if (!key) {
            lua.lua_pushnil(state);
            return 1;
        }
        const filePath = callbacks.getActiveFilePath?.() ?? '';
        const vars = bufferVars.get(filePath);
        const value = vars?.get(key);
        if (value === undefined) {
            lua.lua_pushnil(state);
            return 1;
        }
        pushLuaAny(state, value);
        return 1;
    });
    lua.lua_setfield(L, -2, to_luastring('__index'));
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const key = readLuaString(state, 2);
        if (!key) return 0;
        const value = readLuaValue(state, 3);
        const filePath = callbacks.getActiveFilePath?.() ?? '';
        let vars = bufferVars.get(filePath);
        if (!vars) {
            vars = new Map();
            bufferVars.set(filePath, vars);
        }
        if (value === null || value === undefined) {
            vars.delete(key);
        } else {
            vars.set(key, value);
        }
        return 0;
    });
    lua.lua_setfield(L, -2, to_luastring('__newindex'));
    lua.lua_setmetatable(L, bTableIndex);
    lua.lua_pushvalue(L, bTableIndex);
    lua.lua_setfield(L, vimTableIndex, to_luastring('b'));
    lua.lua_pop(L, 1);

    lua.lua_newtable(L);
    const boTableIndex = lua.lua_gettop(L);
    lua.lua_newtable(L);
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const key = readLuaString(state, 2);
        if (!key) {
            lua.lua_pushnil(state);
            return 1;
        }
        const value = callbacks.getBufferOption?.(key);
        if (value === undefined || value === null) {
            lua.lua_pushnil(state);
        } else {
            pushLuaValue(state, value);
        }
        return 1;
    });
    lua.lua_setfield(L, -2, to_luastring('__index'));
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const key = readLuaString(state, 2);
        if (!key) return 0;
        const value = readLuaValue(state, 3);
        callbacks.setBufferOption?.(key, value);
        return 0;
    });
    lua.lua_setfield(L, -2, to_luastring('__newindex'));
    lua.lua_setmetatable(L, boTableIndex);
    lua.lua_pushvalue(L, boTableIndex);
    lua.lua_setfield(L, vimTableIndex, to_luastring('bo'));
    lua.lua_pop(L, 1);

    lua.lua_newtable(L);
    const oTableIndex = lua.lua_gettop(L);
    lua.lua_newtable(L);
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const key = readLuaString(state, 2);
        if (!key) {
            lua.lua_pushnil(state);
            return 1;
        }
        if (key === 'operatorfunc') {
            return readOperatorfuncTo(state, operatorfunc);
        }
        pushLuaValue(state, readGlobalOption(callbacks, key));
        return 1;
    });
    lua.lua_setfield(L, -2, to_luastring('__index'));
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const key = readLuaString(state, 2);
        if (!key) return 0;
        if (key === 'operatorfunc') {
            return writeOperatorfuncFrom(state, 3, L, callbacks, operatorfunc);
        }
        const value = readLuaValue(state, 3);
        writeGlobalOption(callbacks, key, value);
        return 0;
    });
    lua.lua_setfield(L, -2, to_luastring('__newindex'));
    lua.lua_setmetatable(L, oTableIndex);
    lua.lua_pushvalue(L, oTableIndex);
    lua.lua_setfield(L, vimTableIndex, to_luastring('o'));
    lua.lua_pop(L, 1);

    lua.lua_newtable(L);
    const goTableIndex = lua.lua_gettop(L);
    lua.lua_newtable(L);
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const key = readLuaString(state, 2);
        if (!key) {
            lua.lua_pushnil(state);
            return 1;
        }
        if (key === 'operatorfunc') {
            return readOperatorfuncTo(state, operatorfunc);
        }
        pushLuaValue(state, readGlobalOption(callbacks, key));
        return 1;
    });
    lua.lua_setfield(L, -2, to_luastring('__index'));
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const key = readLuaString(state, 2);
        if (!key) return 0;
        if (key === 'operatorfunc') {
            return writeOperatorfuncFrom(state, 3, L, callbacks, operatorfunc);
        }
        const value = readLuaValue(state, 3);
        writeGlobalOption(callbacks, key, value);
        return 0;
    });
    lua.lua_setfield(L, -2, to_luastring('__newindex'));
    lua.lua_setmetatable(L, goTableIndex);
    lua.lua_pushvalue(L, goTableIndex);
    lua.lua_setfield(L, vimTableIndex, to_luastring('go'));
    lua.lua_pop(L, 1);

    createWarnVarTable(L, 'wo', warnedNamespaceKeys);
    lua.lua_setfield(L, vimTableIndex, to_luastring('wo'));

    createWarnVarTable(L, 'w', warnedNamespaceKeys);
    lua.lua_setfield(L, vimTableIndex, to_luastring('w'));

    createWarnVarTable(L, 't', warnedNamespaceKeys);
    lua.lua_setfield(L, vimTableIndex, to_luastring('t'));

    lua.lua_newtable(L);
    const vTableIndex = lua.lua_gettop(L);
    lua.lua_newtable(L);
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const key = readLuaString(state, 2);
        if (!key) {
            lua.lua_pushnil(state);
            return 1;
        }
        switch (key) {
            case 'count':
                lua.lua_pushinteger(state, currentVimV.count);
                return 1;
            case 'count1':
                lua.lua_pushinteger(state, currentVimV.count1);
                return 1;
            case 'register':
                lua.lua_pushstring(state, to_luastring(currentVimV.register));
                return 1;
            case 'operator':
                lua.lua_pushstring(state, to_luastring(currentVimV.operator));
                return 1;
            case 'searchforward': {
                const value =
                    callbacks.getSearchForward?.() ?? currentVimV.searchforward;
                lua.lua_pushinteger(state, value);
                return 1;
            }
            case 'insertmode':
                lua.lua_pushstring(state, to_luastring(currentVimV.insertmode));
                return 1;
            case 'numbermax':
                lua.lua_pushinteger(state, 9007199254740991);
                return 1;
            case 'numbermin':
                lua.lua_pushinteger(state, -9007199254740991);
                return 1;
            case 'numbersize':
                lua.lua_pushinteger(state, 53);
                return 1;
            case 'true':
                lua.lua_pushboolean(state, true);
                return 1;
            case 'false':
                lua.lua_pushboolean(state, false);
                return 1;
            case 'null':
                lua.lua_pushnil(state);
                return 1;
            case 'foldstart':
                lua.lua_pushinteger(state, currentVimV.foldstart);
                return 1;
            case 'foldend':
                lua.lua_pushinteger(state, currentVimV.foldend);
                return 1;
            case 'foldlevel':
                lua.lua_pushinteger(state, currentVimV.foldlevel);
                return 1;
            case 'folddashes':
                lua.lua_pushstring(state, to_luastring(currentVimV.folddashes));
                return 1;
            case 'lnum':
                lua.lua_pushinteger(state, currentVimV.lnum);
                return 1;
            case 'relnum':
                lua.lua_pushinteger(state, currentVimV.relnum);
                return 1;
            case 'virtnum':
                lua.lua_pushinteger(state, currentVimV.virtnum);
                return 1;
            case 'char':
                lua.lua_pushstring(state, to_luastring(currentVimV.char));
                return 1;
            case 'hlsearch': {
                const hl = callbacks.getHlSearch?.() ?? currentVimV.hlsearch;
                lua.lua_pushinteger(state, hl);
                return 1;
            }
            case 'event':
                if (currentVimV.event === null) {
                    lua.lua_pushnil(state);
                } else {
                    pushLuaAny(state, currentVimV.event);
                }
                return 1;
            default:
                lua.lua_pushnil(state);
                return 1;
        }
    });
    lua.lua_setfield(L, -2, to_luastring('__index'));
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const key = readLuaString(state, 2);
        if (!key) return 0;
        if (key === 'searchforward') {
            const value = lua.lua_isnumber(state, 3)
                ? lua.lua_tonumber(state, 3)
                : 0;
            const nextValue = Number.isNaN(value) ? 0 : value;
            callbacks.setSearchForward?.(nextValue);
            currentVimV = { ...currentVimV, searchforward: nextValue };
            return 0;
        }
        if (key === 'char') {
            const value = readLuaString(state, 3) ?? '';
            currentVimV = { ...currentVimV, char: value };
            return 0;
        }
        return lauxlib.luaL_error(
            state,
            to_luastring(`vim.v.${key} is read-only`),
        );
    });
    lua.lua_setfield(L, -2, to_luastring('__newindex'));
    lua.lua_setmetatable(L, vTableIndex);
    lua.lua_pushvalue(L, vTableIndex);
    lua.lua_setfield(L, vimTableIndex, to_luastring('v'));
    lua.lua_pop(L, 1);

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        let command = readLuaString(state, 1);
        if (!command) {
            return lauxlib.luaL_error(
                state,
                to_luastring('vim.cmd expects a command string'),
            );
        }
        if (command.startsWith('lockmarks ')) {
            command = command.slice('lockmarks '.length);
        }
        if (command.startsWith('lua ')) {
            const luaCode = command.slice('lua '.length);
            const luaStatus = lauxlib.luaL_dostring(L, to_luastring(luaCode));
            if (luaStatus !== lua.LUA_OK) {
                const msg = lua.lua_tolstring(L, -1);
                const error = msg ? to_jsstring(msg) : 'vim.cmd lua error';
                console.error(`Vim Motions: vim.cmd lua error: ${error}`);
                lua.lua_pop(L, 1);
            }
            return 0;
        }
        if (command.startsWith('normal! ') || command.startsWith('normal ')) {
            const keys = command.replace(/^normal!?\s+/, '');
            const adapter = callbacks.getCmAdapter?.();
            const vimApi = callbacks.getVimApi?.();
            if (adapter && vimApi?.feedKeys) {
                vimApi.feedKeys(adapter, keys, {
                    noremap: command.includes('!'),
                });
            }
            return 0;
        }
        callbacks.handleExCommand(command);
        return 0;
    });
    lua.lua_setfield(L, vimTableIndex, to_luastring('cmd'));

    const pluginRegistry = new Map<
        string,
        {
            repo: string;
            name: string;
            available: boolean;
            opts?: boolean;
        }
    >();

    lua.lua_newtable(L);
    const pluginsIndex = lua.lua_gettop(L);

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        if (!lua.lua_istable(state, 1)) {
            return lauxlib.luaL_error(
                state,
                to_luastring(
                    'vim.plugins.add: expected spec table (e.g., { "owner/repo" })',
                ),
            );
        }
        lua.lua_rawgeti(state, 1, 1);
        const repo = lua.lua_isstring(state, -1)
            ? to_jsstring(lua.lua_tolstring(state, -1)!)
            : null;
        lua.lua_pop(state, 1);
        if (!repo || !repo.includes('/')) {
            return lauxlib.luaL_error(
                state,
                to_luastring(
                    'vim.plugins.add: expected "owner/repo" string as first element',
                ),
            );
        }

        const branch = readStringField(state, 1, 'branch');
        const tag = readStringField(state, 1, 'tag');
        const commit = readStringField(state, 1, 'commit');
        const hasOpts = (() => {
            lua.lua_getfield(state, 1, to_luastring('opts'));
            const exists = !lua.lua_isnil(state, -1);
            lua.lua_pop(state, 1);
            return exists;
        })();

        const slash = repo.indexOf('/');
        const owner = repo.substring(0, slash);
        const repoName = repo.substring(slash + 1);
        const strippedName = repoName.replace(/\.nvim$/, '');
        const available = callbacks.pluginExists?.(strippedName) ?? false;
        pluginRegistry.set(repo, {
            repo,
            name: repoName,
            available,
            opts: hasOpts,
        });

        if (!available) {
            const autoFetch = callbacks.isPluginAutoFetchEnabled?.() ?? false;
            if (autoFetch && callbacks.fetchPlugin) {
                const runner = callbacks.runner;
                if (runner) {
                    const ref = commit ?? tag ?? branch ?? 'main';
                    const promise = callbacks.fetchPlugin(
                        owner,
                        repoName,
                        ref,
                        { branch, tag, commit },
                    );
                    const fetchAndSetup = promise.then((result) => {
                        pluginRegistry.set(repo, {
                            repo,
                            name: repoName,
                            available: true,
                            opts: hasOpts,
                        });
                        return result.files.length;
                    });
                    return runner.yieldWithPromise(state, fetchAndSetup);
                }
            }
            callbacks.showNotice?.(
                `Plugin ${repoName} not found. Download from https://github.com/${repo} and place Lua files in lua/`,
            );
        }
        return 0;
    });
    lua.lua_setfield(L, pluginsIndex, to_luastring('add'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        lua.lua_newtable(state);
        let idx = 1;
        for (const [, entry] of pluginRegistry) {
            lua.lua_newtable(state);
            lua.lua_pushstring(state, to_luastring(entry.name));
            lua.lua_setfield(state, -2, to_luastring('name'));
            lua.lua_pushstring(state, to_luastring(entry.repo));
            lua.lua_setfield(state, -2, to_luastring('repo'));
            lua.lua_pushboolean(state, entry.available);
            lua.lua_setfield(state, -2, to_luastring('available'));
            lua.lua_rawseti(state, -2, idx++);
        }
        return 1;
    });
    lua.lua_setfield(L, pluginsIndex, to_luastring('list'));

    lua.lua_pushvalue(L, pluginsIndex);
    lua.lua_setfield(L, vimTableIndex, to_luastring('plugins'));
    lua.lua_pop(L, 1);

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const name = callbacks.getVaultName();
        lua.lua_pushstring(state, to_luastring(name));
        return 1;
    });
    lua.lua_setfield(L, vimTableIndex, to_luastring('vault_name'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const msg = readLuaString(state, 1);
        const level = lua.lua_isnumber(state, 2)
            ? lua.lua_tonumber(state, 2)
            : undefined;
        if (msg !== null) notifyWithLevel(msg, level);
        return 0;
    });
    lua.lua_setfield(L, vimTableIndex, to_luastring('notify'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const msg = readLuaString(state, 1);
        const level = lua.lua_isnumber(state, 2)
            ? lua.lua_tonumber(state, 2)
            : undefined;
        if (msg === null) return 0;
        if (notifiedMessages.has(msg)) return 0;
        notifiedMessages.add(msg);
        notifyWithLevel(msg, level);
        return 0;
    });
    lua.lua_setfield(L, vimTableIndex, to_luastring('notify_once'));

    lua.lua_newtable(L);
    lua.lua_newtable(L);
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const key = readLuaString(state, 2);
        if (!key) {
            lua.lua_pushnil(state);
            return 1;
        }
        const curatedValue = getCuratedEnv(key);
        const userValue = userEnvMap.get(key);
        const value = curatedValue ?? userValue;
        if (value === undefined || value === null) {
            lua.lua_pushnil(state);
            return 1;
        }
        lua.lua_pushstring(state, to_luastring(value));
        return 1;
    });
    lua.lua_setfield(L, -2, to_luastring('__index'));
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const key = readLuaString(state, 2);
        const value = readLuaString(state, 3);
        if (key) {
            if (value === null) {
                userEnvMap.delete(key);
            } else {
                userEnvMap.set(key, value);
            }
        }
        return 0;
    });
    lua.lua_setfield(L, -2, to_luastring('__newindex'));
    lua.lua_setmetatable(L, -2);
    lua.lua_setfield(L, vimTableIndex, to_luastring('env'));

    lua.lua_newtable(L);
    const logIndex = lua.lua_gettop(L);
    lua.lua_newtable(L);
    lua.lua_pushnumber(L, 0);
    lua.lua_setfield(L, -2, to_luastring('TRACE'));
    lua.lua_pushnumber(L, 1);
    lua.lua_setfield(L, -2, to_luastring('DEBUG'));
    lua.lua_pushnumber(L, 2);
    lua.lua_setfield(L, -2, to_luastring('INFO'));
    lua.lua_pushnumber(L, 3);
    lua.lua_setfield(L, -2, to_luastring('WARN'));
    lua.lua_pushnumber(L, 4);
    lua.lua_setfield(L, -2, to_luastring('ERROR'));
    lua.lua_pushnumber(L, 5);
    lua.lua_setfield(L, -2, to_luastring('OFF'));
    lua.lua_setfield(L, logIndex, to_luastring('levels'));
    lua.lua_pushvalue(L, logIndex);
    lua.lua_setfield(L, vimTableIndex, to_luastring('log'));
    lua.lua_pop(L, 1);

    injectObsidianApi(
        L,
        vimTableIndex,
        callbacks,
        getLeaderKey,
        callbacks.runner,
    );

    lua.lua_newtable(L);
    const keymapIndex = lua.lua_gettop(L);
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const modes = getModeList(state, 1);
        const lhsRaw = readKeyString(state, 2);
        if (!lhsRaw) {
            return lauxlib.luaL_error(
                state,
                to_luastring('vim.keymap.set expects a lhs string'),
            );
        }
        const rhsIsFn = lua.lua_isfunction(state, 3);
        const rhsRaw = rhsIsFn ? null : readKeyString(state, 3);
        if (!rhsIsFn && rhsRaw === null) {
            return lauxlib.luaL_error(
                state,
                to_luastring('vim.keymap.set expects a rhs string or function'),
            );
        }

        let noremap = true;
        let desc: string | undefined;
        let useBufferKeymap = false;
        let bufferFilePath: string | null = null;
        let expr = false;
        if (lua.lua_istable(state, 4)) {
            const exprValue = readBooleanField(state, 4, 'expr');
            expr = exprValue ?? false;
            const buffer = readAnyField(state, 4, 'buffer');
            const hasBufferOption = buffer !== undefined;
            if (hasBufferOption) {
                const shouldUseBuffer =
                    buffer === true || buffer === 0 || Boolean(buffer);
                if (shouldUseBuffer) {
                    if (typeof buffer === 'number' && buffer !== 0) {
                        return lauxlib.luaL_error(
                            state,
                            to_luastring(
                                'buffer numbers other than 0 are not supported in Obsidian; use buffer = 0 for current file',
                            ),
                        );
                    }
                    bufferFilePath = callbacks.getActiveFilePath?.() ?? null;
                    if (!bufferFilePath) {
                        console.warn(
                            'Vim Motions: vim.keymap.set buffer option requires an active file',
                        );
                    } else {
                        useBufferKeymap = true;
                    }
                }
            }
            const remap = readBooleanField(state, 4, 'remap');
            const noremapOpt = readBooleanField(state, 4, 'noremap');
            if (remap === true || noremapOpt === false) noremap = false;
            desc = readStringField(state, 4, 'desc');
        }

        if (expr && !rhsIsFn) {
            return lauxlib.luaL_error(
                state,
                to_luastring(
                    'vim.keymap.set: string expr mappings are not supported (requires Vimscript evaluation). ' +
                        'Use a Lua function instead: function() return vim.v.count == 0 and "gk" or "k" end',
                ),
            );
        }

        let callback:
            ((cm?: unknown, actionArgs?: unknown) => void) | undefined;
        let rhs = rhsRaw ?? undefined;
        if (rhsIsFn) {
            lua.lua_pushvalue(state, 3);
            const ref = lauxlib.luaL_ref(state, lua.LUA_REGISTRYINDEX);
            if (expr) {
                callback = (cm?: unknown, actionArgs?: unknown) => {
                    if (actionArgs && typeof actionArgs === 'object') {
                        const args = actionArgs as ActionArgs;
                        setVimVContext({
                            count: args.repeatIsExplicit ? args.repeat : 0,
                            count1: args.repeat,
                            register: args.registerName ?? '"',
                            operator: args.pendingOperator ?? '',
                            insertmode: getInsertModeChar(cm),
                        });
                    }
                    lua.lua_rawgeti(L, lua.LUA_REGISTRYINDEX, ref);
                    const status = withInstructionGuard(
                        L,
                        EXPR_INSTRUCTION_LIMIT,
                        () => lua.lua_pcall(L, 0, 1, 0),
                    );
                    clearVimVContext();
                    if (status !== lua.LUA_OK) {
                        const message = lua.lua_tolstring(L, -1);
                        const error = message
                            ? to_jsstring(message)
                            : 'Lua expr callback error';
                        console.error(`Vim Motions: ${error}`);
                        showLuaErrorNotice(error);
                        lua.lua_pop(L, 1);
                        return;
                    }
                    const returnedKeys = readKeyString(L, -1);
                    lua.lua_pop(L, 1);
                    if (!returnedKeys || returnedKeys.length === 0) return;
                    const adapter =
                        cm &&
                        typeof (cm as Record<string, unknown>).state ===
                            'object'
                            ? (cm as CmAdapter)
                            : callbacks.getCmAdapter?.();
                    const vimApi = callbacks.getVimApi?.();
                    if (adapter && vimApi?.feedKeys) {
                        vimApi.feedKeys(adapter, returnedKeys, {
                            noremap,
                        });
                    }
                };
            } else {
                callback = (cm?: unknown, actionArgs?: unknown) => {
                    if (actionArgs && typeof actionArgs === 'object') {
                        const args = actionArgs as ActionArgs;
                        setVimVContext({
                            count: args.repeatIsExplicit ? args.repeat : 0,
                            count1: args.repeat,
                            register: args.registerName ?? '"',
                            operator: args.pendingOperator ?? '',
                            insertmode: getInsertModeChar(cm),
                        });
                    }
                    lua.lua_rawgeti(L, lua.LUA_REGISTRYINDEX, ref);
                    const status = withInstructionGuard(
                        L,
                        CALLBACK_INSTRUCTION_LIMIT,
                        () => lua.lua_pcall(L, 0, 0, 0),
                    );
                    clearVimVContext();
                    if (status !== lua.LUA_OK) {
                        const message = lua.lua_tolstring(L, -1);
                        const error = message
                            ? to_jsstring(message)
                            : 'Lua callback error';
                        console.error(`Vim Motions: ${error}`);
                        showLuaErrorNotice(error);
                        lua.lua_pop(L, 1);
                    }
                };
            }
        }

        for (const mode of modes) {
            const context = modeToContext(mode);
            if (!context) {
                console.warn(`Vim Motions: unsupported mode ${mode}`);
                continue;
            }
            const leaderKey = getLeaderKey();
            const lhs = replaceLeaderKey(lhsRaw, leaderKey);
            const rhsValue = rhs ? replaceLeaderKey(rhs, leaderKey) : undefined;
            const keymap: LuaKeymap = {
                mode: context,
                lhs,
                rhs: rhsValue,
                noremap,
                desc,
                expr: expr ?? false,
                isFn: rhsIsFn,
                callback,
            };
            if (useBufferKeymap && bufferFilePath) {
                registerBufferKeymap(bufferFilePath, keymap);
                callbacks.onBufferKeymap?.(bufferFilePath, keymap);
            } else {
                callbacks.onKeymap(keymap);
                if (
                    context === 'normal' &&
                    leaderKey.length > 0 &&
                    lhs.startsWith(leaderKey) &&
                    lhs.length > leaderKey.length
                ) {
                    const bindingKey = lhs.slice(leaderKey.length);
                    const displayId = rhsValue ?? desc ?? lhsRaw;
                    callbacks.onLeaderBinding?.(bindingKey, displayId, desc);
                    if (desc) {
                        callbacks.onWhichKeyCommandLabel?.(lhs, desc, 'editor');
                    }
                }
            }
        }
        return 0;
    });
    lua.lua_setfield(L, keymapIndex, to_luastring('set'));
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const modes = getModeList(state, 1);
        const lhsRaw = readKeyString(state, 2);
        if (!lhsRaw) {
            return lauxlib.luaL_error(
                state,
                to_luastring('vim.keymap.del expects a lhs string'),
            );
        }
        let useBufferKeymap = false;
        let bufferFilePath: string | null = null;
        if (lua.lua_istable(state, 3)) {
            const buffer = readAnyField(state, 3, 'buffer');
            const hasBufferOption = buffer !== undefined;
            if (hasBufferOption) {
                const shouldUseBuffer =
                    buffer === true || buffer === 0 || Boolean(buffer);
                if (shouldUseBuffer) {
                    if (typeof buffer === 'number' && buffer !== 0) {
                        return lauxlib.luaL_error(
                            state,
                            to_luastring(
                                'buffer numbers other than 0 are not supported in Obsidian; use buffer = 0 for current file',
                            ),
                        );
                    }
                    bufferFilePath = callbacks.getActiveFilePath?.() ?? null;
                    if (!bufferFilePath) {
                        console.warn(
                            'Vim Motions: vim.keymap.del buffer option requires an active file',
                        );
                    } else {
                        useBufferKeymap = true;
                    }
                }
            }
        }
        for (const mode of modes) {
            const context = modeToContext(mode);
            if (!context) {
                console.warn(`Vim Motions: unsupported mode ${mode}`);
                continue;
            }
            const leaderKey = getLeaderKey();
            const lhs = replaceLeaderKey(lhsRaw, leaderKey);
            if (useBufferKeymap && bufferFilePath) {
                unregisterBufferKeymap(bufferFilePath, context, lhs);
                callbacks.onBufferKeymapDel?.(bufferFilePath, context, lhs);
            } else {
                callbacks.onKeymapDel({ mode: context, lhs });
            }
        }
        return 0;
    });
    lua.lua_setfield(L, keymapIndex, to_luastring('del'));
    lua.lua_pushvalue(L, keymapIndex);
    lua.lua_setfield(L, vimTableIndex, to_luastring('keymap'));
    lua.lua_pop(L, 1);

    lua.lua_newtable(L);
    const apiIndex = lua.lua_gettop(L);

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const name = readLuaString(state, 1);
        if (!name) {
            return lauxlib.luaL_error(
                state,
                to_luastring(
                    'nvim_create_user_command: expected command name string',
                ),
            );
        }
        if (!lua.lua_isfunction(state, 2) && !lua.lua_isstring(state, 2)) {
            return lauxlib.luaL_error(
                state,
                to_luastring(
                    'nvim_create_user_command: expected callback function or command string',
                ),
            );
        }
        if (lua.lua_isfunction(state, 2)) {
            lua.lua_pushvalue(state, 2);
            const ref = lauxlib.luaL_ref(state, lua.LUA_REGISTRYINDEX);
            const runner = callbacks.runner;
            callbacks.defineExCommand?.(name, (argString: string) => {
                if (runner) {
                    void runner
                        .invokeAsyncCapable(
                            ref,
                            (thread) => {
                                lua.lua_newtable(thread);
                                lua.lua_pushstring(
                                    thread,
                                    to_luastring(argString),
                                );
                                lua.lua_setfield(
                                    thread,
                                    -2,
                                    to_luastring('args'),
                                );
                                return 1;
                            },
                            CALLBACK_INSTRUCTION_LIMIT,
                        )
                        .then((result) => {
                            if (!result.ok) {
                                console.error(
                                    `Vim Motions: user command ${name}: ${result.error}`,
                                );
                                showLuaErrorNotice(
                                    result.error ?? 'unknown error',
                                );
                            }
                        });
                } else {
                    lua.lua_rawgeti(state, lua.LUA_REGISTRYINDEX, ref);
                    lua.lua_newtable(state);
                    lua.lua_pushstring(state, to_luastring(argString));
                    lua.lua_setfield(state, -2, to_luastring('args'));
                    const status = withInstructionGuard(
                        state,
                        CALLBACK_INSTRUCTION_LIMIT,
                        () => lua.lua_pcall(state, 1, 0, 0),
                    );
                    if (status !== lua.LUA_OK) {
                        const msg = lua.lua_tolstring(state, -1);
                        const error = msg ? to_jsstring(msg) : 'unknown error';
                        console.error(
                            `Vim Motions: user command ${name}:`,
                            error,
                        );
                        showLuaErrorNotice(error);
                        lua.lua_pop(state, 1);
                    }
                }
            });
        } else {
            const cmdStr = readLuaString(state, 2) ?? '';
            callbacks.defineExCommand?.(name, () => {
                callbacks.handleExCommand(cmdStr);
            });
        }
        return 0;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_create_user_command'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const events = getStringList(state, 1);
        if (events.length === 0) {
            return lauxlib.luaL_error(
                state,
                to_luastring('nvim_create_autocmd: expected event name'),
            );
        }
        if (!lua.lua_istable(state, 2)) {
            return lauxlib.luaL_error(
                state,
                to_luastring('nvim_create_autocmd: expected opts table'),
            );
        }
        const groupNumber = readNumberField(state, 2, 'group');
        const groupName = readStringField(state, 2, 'group');
        const group = groupNumber ?? groupName ?? null;
        const patternValue = readStringField(state, 2, 'pattern');
        let pattern: string | null = patternValue ?? null;
        if (!patternValue) {
            const patterns = readStringListField(state, 2, 'pattern');
            pattern = patterns[0] ?? null;
        }
        const once = readBooleanField(state, 2, 'once') ?? false;
        const desc = readStringField(state, 2, 'desc') ?? '';

        lua.lua_getfield(state, 2, to_luastring('callback'));
        if (!lua.lua_isfunction(state, -1)) {
            lua.lua_pop(state, 1);
            return lauxlib.luaL_error(
                state,
                to_luastring('nvim_create_autocmd: expected callback function'),
            );
        }
        const callbackIndex = lua.lua_gettop(state);
        const runner = callbacks.runner;
        let lastId = 0;
        for (const event of events) {
            lua.lua_pushvalue(state, callbackIndex);
            const ref = lauxlib.luaL_ref(state, lua.LUA_REGISTRYINDEX);
            const callback = runner
                ? (ev: AutocmdEventData) => {
                      setVimVContext({
                          insertmode: '',
                          event: {
                              event: ev.event,
                              file: ev.file,
                              match: ev.match,
                              buf: ev.buf,
                              data: ev.data,
                          },
                      });
                      void runner
                          .invokeAsyncCapable(
                              ref,
                              (thread) => {
                                  pushAutocmdEventData(thread, ev);
                                  return 1;
                              },
                              CALLBACK_INSTRUCTION_LIMIT,
                          )
                          .then((result) => {
                              clearVimVContext();
                              if (!result.ok) {
                                  console.error(
                                      `Vim Motions: autocmd ${event}: ${result.error}`,
                                  );
                                  showLuaErrorNotice(
                                      result.error ?? 'Lua callback error',
                                  );
                              }
                          });
                  }
                : (ev: AutocmdEventData) => {
                      setVimVContext({
                          insertmode: '',
                          event: {
                              event: ev.event,
                              file: ev.file,
                              match: ev.match,
                              buf: ev.buf,
                              data: ev.data,
                          },
                      });
                      lua.lua_rawgeti(state, lua.LUA_REGISTRYINDEX, ref);
                      pushAutocmdEventData(state, ev);
                      const status = withInstructionGuard(
                          state,
                          CALLBACK_INSTRUCTION_LIMIT,
                          () => lua.lua_pcall(state, 1, 0, 0),
                      );
                      clearVimVContext();
                      if (status !== lua.LUA_OK) {
                          const msg = lua.lua_tolstring(state, -1);
                          const error = msg
                              ? to_jsstring(msg)
                              : 'Lua callback error';
                          console.error(
                              `Vim Motions: autocmd ${event}: ${error}`,
                          );
                          showLuaErrorNotice(error);
                          lua.lua_pop(state, 1);
                      }
                  };
            lastId = autocmdManager.register(event, {
                group,
                pattern,
                callback,
                luaRef: ref,
                once,
                desc,
            });
        }
        lua.lua_pop(state, 1);
        lua.lua_pushnumber(state, lastId);
        return 1;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_create_autocmd'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const name = readLuaString(state, 1);
        if (!name) {
            return lauxlib.luaL_error(
                state,
                to_luastring('nvim_create_augroup: expected group name'),
            );
        }
        let clear = true;
        if (lua.lua_istable(state, 2)) {
            clear = readBooleanField(state, 2, 'clear') ?? true;
        }
        const id = autocmdManager.createAugroup(name, { clear });
        lua.lua_pushnumber(state, id);
        return 1;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_create_augroup'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        if (!lua.lua_isnumber(state, 1)) {
            return lauxlib.luaL_error(
                state,
                to_luastring('nvim_del_autocmd: expected id number'),
            );
        }
        const id = lua.lua_tonumber(state, 1);
        autocmdManager.deleteAutocmd(id);
        return 0;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_del_autocmd'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const name = readLuaString(state, 1);
        if (!name) {
            return lauxlib.luaL_error(
                state,
                to_luastring('nvim_del_augroup_by_name: expected group name'),
            );
        }
        autocmdManager.deleteAugroupByName(name);
        return 0;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_del_augroup_by_name'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        if (lua.lua_isnil(state, 1)) {
            autocmdManager.clearAll();
            return 0;
        }
        if (!lua.lua_istable(state, 1)) {
            return lauxlib.luaL_error(
                state,
                to_luastring('nvim_clear_autocmds: expected opts table'),
            );
        }
        const groupNumber = readNumberField(state, 1, 'group');
        const groupName = readStringField(state, 1, 'group');
        const event = readStringField(state, 1, 'event');
        const pattern = readStringField(state, 1, 'pattern');
        autocmdManager.clearAutocmds({
            group: groupNumber ?? groupName ?? null,
            event: event ?? null,
            pattern: pattern ?? null,
        });
        return 0;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_clear_autocmds'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const name = readLuaString(state, 1) ?? '';
        if (name === '') {
            // Anonymous namespace — always get a new ID
            const id = nextNamespaceId++;
            lua.lua_pushnumber(state, id);
            return 1;
        }
        // Named namespace — return existing or create new
        let id = namespacesByName.get(name);
        if (id === undefined) {
            id = nextNamespaceId++;
            namespacesByName.set(name, id);
        }
        lua.lua_pushnumber(state, id);
        return 1;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_create_namespace'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        requireNamespaceZero(state, 1, 'nvim_set_hl');
        const name = readLuaString(state, 2);
        if (!name) {
            return lauxlib.luaL_error(
                state,
                to_luastring('nvim_set_hl: expected name string'),
            );
        }
        const attrs = readHighlightAttrs(state, 3);
        callbacks.highlightManager?.setHighlight(name, attrs);
        return 0;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_set_hl'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        requireNamespaceZero(state, 1, 'nvim_get_hl');
        const name = readStringField(state, 2, 'name');
        lua.lua_newtable(state);
        if (!name) return 1;
        const attrs = callbacks.highlightManager?.getHighlight(name);
        if (!attrs) return 1;
        const setField = (key: string, value: unknown) => {
            if (value === undefined) return;
            pushLuaValue(state, value);
            lua.lua_setfield(state, -2, to_luastring(key));
        };
        setField('fg', attrs.fg);
        setField('bg', attrs.bg);
        setField('sp', attrs.sp);
        setField('bold', attrs.bold);
        setField('italic', attrs.italic);
        setField('underline', attrs.underline);
        setField('undercurl', attrs.undercurl);
        setField('underdouble', attrs.underdouble);
        setField('underdotted', attrs.underdotted);
        setField('underdashed', attrs.underdashed);
        setField('strikethrough', attrs.strikethrough);
        setField('reverse', attrs.reverse);
        setField('blend', attrs.blend);
        setField('link', attrs.link);
        return 1;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_get_hl'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        requireBufferZero(state, 1, 'nvim_buf_set_keymap');
        const mode = readLuaString(state, 2);
        const lhs = readKeyString(state, 3);
        const rhs = readKeyString(state, 4);
        if (!mode || !lhs || rhs === null) {
            return lauxlib.luaL_error(
                state,
                to_luastring(
                    'nvim_buf_set_keymap: expected mode, lhs, rhs strings',
                ),
            );
        }
        let noremap = false;
        if (lua.lua_istable(state, 5)) {
            noremap = readBooleanField(state, 5, 'noremap') ?? false;
        }
        const context = modeToContext(mode);
        if (!context) {
            console.warn(`Vim Motions: unsupported mode ${mode}`);
            return 0;
        }
        const filePath = callbacks.getActiveFilePath?.() ?? null;
        if (!filePath) {
            console.warn(
                'Vim Motions: nvim_buf_set_keymap requires an active file',
            );
            return 0;
        }
        registerBufferKeymap(filePath, {
            mode: context,
            lhs,
            rhs,
            noremap,
        });
        callbacks.onBufferKeymap?.(filePath, {
            mode: context,
            lhs,
            rhs,
            noremap,
        });
        return 0;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_buf_set_keymap'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        requireBufferZero(state, 1, 'nvim_buf_del_keymap');
        const mode = readLuaString(state, 2);
        const lhs = readKeyString(state, 3);
        if (!mode || !lhs) {
            return lauxlib.luaL_error(
                state,
                to_luastring(
                    'nvim_buf_del_keymap: expected mode and lhs strings',
                ),
            );
        }
        const context = modeToContext(mode);
        if (!context) {
            console.warn(`Vim Motions: unsupported mode ${mode}`);
            return 0;
        }
        const filePath = callbacks.getActiveFilePath?.() ?? null;
        if (!filePath) {
            console.warn(
                'Vim Motions: nvim_buf_del_keymap requires an active file',
            );
            return 0;
        }
        unregisterBufferKeymap(filePath, context, lhs);
        callbacks.onBufferKeymapDel?.(filePath, context, lhs);
        return 0;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_buf_del_keymap'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        requireBufferZero(state, 1, 'nvim_buf_get_keymap');
        const mode = readLuaString(state, 2);
        if (!mode) {
            return lauxlib.luaL_error(
                state,
                to_luastring('nvim_buf_get_keymap: expected mode string'),
            );
        }
        const context = modeToContext(mode);
        const filePath = callbacks.getActiveFilePath?.() ?? null;
        const keymaps = filePath ? (bufferKeymaps.get(filePath) ?? []) : [];
        const contextToMode: Record<string, string> = {
            normal: 'n',
            insert: 'i',
            visual: 'v',
        };
        lua.lua_newtable(state);
        let idx = 1;
        for (const km of keymaps) {
            if (context && km.mode !== context) continue;
            lua.lua_newtable(state);
            lua.lua_pushstring(state, to_luastring(km.lhs ?? ''));
            lua.lua_setfield(state, -2, to_luastring('lhs'));
            lua.lua_pushstring(state, to_luastring(km.rhs ?? ''));
            lua.lua_setfield(state, -2, to_luastring('rhs'));
            lua.lua_pushstring(
                state,
                to_luastring(contextToMode[km.mode ?? ''] ?? mode),
            );
            lua.lua_setfield(state, -2, to_luastring('mode'));
            lua.lua_pushboolean(state, km.noremap);
            lua.lua_setfield(state, -2, to_luastring('noremap'));
            lua.lua_pushboolean(state, Boolean(km.expr));
            lua.lua_setfield(state, -2, to_luastring('expr'));
            lua.lua_pushboolean(state, false);
            lua.lua_setfield(state, -2, to_luastring('silent'));
            lua.lua_rawseti(state, -2, idx++);
        }
        return 1;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_buf_get_keymap'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        requireBufferZero(state, 1, 'nvim_buf_get_lines');
        if (!lua.lua_isnumber(state, 2) || !lua.lua_isnumber(state, 3)) {
            return lauxlib.luaL_error(
                state,
                to_luastring(
                    'nvim_buf_get_lines: expected start and end numbers',
                ),
            );
        }
        const lineCount = callbacks.getLineCount?.() ?? 0;
        let start = lua.lua_tonumber(state, 2);
        let end = lua.lua_tonumber(state, 3);
        const strictIndexing = lua.lua_toboolean(state, 4);
        if (end === -1) end = lineCount;

        if (strictIndexing) {
            if (start < 0 || start > lineCount || end < 0 || end > lineCount) {
                return lauxlib.luaL_error(
                    state,
                    to_luastring('nvim_buf_get_lines: index out of bounds'),
                );
            }
        }

        start = Math.max(0, Math.min(start, lineCount));
        end = Math.max(0, Math.min(end, lineCount));
        if (end < start) end = start;

        const lines = callbacks.getLines?.(start, end) ?? [];
        lua.lua_newtable(state);
        for (let i = 0; i < lines.length; i++) {
            lua.lua_pushstring(state, to_luastring(lines[i] ?? ''));
            lua.lua_rawseti(state, -2, i + 1);
        }
        return 1;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_buf_get_lines'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        requireBufferZero(state, 1, 'nvim_buf_get_text');
        const startRow = lua.lua_tonumber(state, 2);
        const startCol = lua.lua_tonumber(state, 3);
        const endRow = lua.lua_tonumber(state, 4);
        const endCol = lua.lua_tonumber(state, 5);
        const lines = callbacks.getLines?.(startRow, endRow + 1) ?? [];
        const result: string[] = [];
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i] ?? '';
            if (i === 0 && i === lines.length - 1) {
                line = line.substring(startCol, endCol);
            } else if (i === 0) {
                line = line.substring(startCol);
            } else if (i === lines.length - 1) {
                line = line.substring(0, endCol);
            }
            result.push(line);
        }
        lua.lua_newtable(state);
        for (let i = 0; i < result.length; i++) {
            lua.lua_pushstring(state, to_luastring(result[i] ?? ''));
            lua.lua_rawseti(state, -2, i + 1);
        }
        return 1;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_buf_get_text'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        requireBufferZero(state, 1, 'nvim_buf_set_lines');
        if (!lua.lua_isnumber(state, 2) || !lua.lua_isnumber(state, 3)) {
            return lauxlib.luaL_error(
                state,
                to_luastring(
                    'nvim_buf_set_lines: expected start and end numbers',
                ),
            );
        }
        const lineCount = callbacks.getLineCount?.() ?? 0;
        let start = lua.lua_tonumber(state, 2);
        let end = lua.lua_tonumber(state, 3);
        const strictIndexing = lua.lua_toboolean(state, 4);
        if (end === -1) end = lineCount;

        if (strictIndexing) {
            if (start < 0 || start > lineCount || end < 0 || end > lineCount) {
                return lauxlib.luaL_error(
                    state,
                    to_luastring('nvim_buf_set_lines: index out of bounds'),
                );
            }
        }

        start = Math.max(0, Math.min(start, lineCount));
        end = Math.max(0, Math.min(end, lineCount));
        if (end < start) end = start;

        const lines = getStringList(state, 5);
        callbacks.setLines?.(start, end, lines);
        return 0;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_buf_set_lines'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        lua.lua_pushnumber(state, 0);
        return 1;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_get_current_buf'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        requireBufferZero(state, 1, 'nvim_buf_get_name');
        const filePath = callbacks.getActiveFilePath?.() ?? '';
        lua.lua_pushstring(state, to_luastring(filePath));
        return 1;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_buf_get_name'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        requireBufferZero(state, 1, 'nvim_buf_line_count');
        const lineCount = callbacks.getLineCount?.() ?? 0;
        lua.lua_pushnumber(state, lineCount);
        return 1;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_buf_line_count'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const buf = lua.lua_tonumber(state, 1);
        lua.lua_pushboolean(state, buf === 0);
        return 1;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_buf_is_valid'));

    // --- Wave 1: Cursor + line + marks ---

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        lua.lua_pushnumber(state, 0);
        return 1;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_get_current_win'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        lua.lua_newtable(state);
        lua.lua_pushinteger(state, 0);
        lua.lua_rawseti(state, -2, 1);
        return 1;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_list_wins'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        lua.lua_pushnumber(state, 0);
        return 1;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_get_current_tabpage'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const mode = callbacks.getMode?.() ?? 'n';
        lua.lua_newtable(state);
        const tableIndex = lua.lua_gettop(state);
        lua.lua_pushstring(state, to_luastring(mode));
        lua.lua_setfield(state, tableIndex, to_luastring('mode'));
        lua.lua_pushboolean(state, false);
        lua.lua_setfield(state, tableIndex, to_luastring('blocking'));
        return 1;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_get_mode'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const pos = callbacks.getCursorPosition?.();
        if (!pos) {
            lua.lua_pushstring(state, to_luastring(''));
            return 1;
        }
        const lineText =
            callbacks.getLines?.(pos.line - 1, pos.line)?.[0] ?? '';
        lua.lua_pushstring(state, to_luastring(lineText));
        return 1;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_get_current_line'));

    lua.lua_pushjsfunction(L, (_state: lua_State) => {
        const pos = callbacks.getCursorPosition?.();
        if (!pos) return 0;
        const line = pos.line - 1;
        callbacks.setLines?.(line, line + 1, []);
        return 0;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_del_current_line'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const line = readLuaString(state, 1);
        if (line === null) {
            return lauxlib.luaL_error(
                state,
                to_luastring('nvim_set_current_line: expected string'),
            );
        }
        const pos = callbacks.getCursorPosition?.();
        if (!pos) return 0;
        const zeroLine = pos.line - 1;
        callbacks.setLine?.(zeroLine, line);
        return 0;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_set_current_line'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const text = readLuaString(state, 1) ?? '';
        let width = 0;
        for (const ch of text) {
            const cp = ch.codePointAt(0) ?? 0;
            if (
                (cp >= 0x1100 && cp <= 0x115f) ||
                (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) ||
                (cp >= 0xac00 && cp <= 0xd7a3) ||
                (cp >= 0xf900 && cp <= 0xfaff) ||
                (cp >= 0xfe10 && cp <= 0xfe6f) ||
                (cp >= 0xff01 && cp <= 0xff60) ||
                (cp >= 0xffe0 && cp <= 0xffe6) ||
                (cp >= 0x20000 && cp <= 0x2fffd) ||
                (cp >= 0x30000 && cp <= 0x3fffd)
            ) {
                width += 2;
            } else {
                width += 1;
            }
        }
        lua.lua_pushinteger(state, width);
        return 1;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_strwidth'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        requireWindowZero(state, 1, 'nvim_win_get_cursor');
        const pos = callbacks.getCursorPosition?.();
        if (!pos) {
            lua.lua_newtable(state);
            lua.lua_pushnumber(state, 1);
            lua.lua_rawseti(state, -2, 1);
            lua.lua_pushnumber(state, 0);
            lua.lua_rawseti(state, -2, 2);
            return 1;
        }
        lua.lua_newtable(state);
        lua.lua_pushnumber(state, pos.line);
        lua.lua_rawseti(state, -2, 1);
        lua.lua_pushnumber(state, pos.col - 1);
        lua.lua_rawseti(state, -2, 2);
        return 1;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_win_get_cursor'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        requireWindowZero(state, 1, 'nvim_win_set_cursor');
        if (!lua.lua_istable(state, 2)) {
            return lauxlib.luaL_error(
                state,
                to_luastring('nvim_win_set_cursor: expected {line, col} table'),
            );
        }
        lua.lua_rawgeti(state, 2, 1);
        const line = lua.lua_tonumber(state, -1);
        lua.lua_pop(state, 1);
        lua.lua_rawgeti(state, 2, 2);
        const col = lua.lua_tonumber(state, -1);
        lua.lua_pop(state, 1);
        if (Number.isNaN(line) || Number.isNaN(col)) {
            return lauxlib.luaL_error(
                state,
                to_luastring(
                    'nvim_win_set_cursor: expected {line, col} with numbers',
                ),
            );
        }
        callbacks.setCursorPosition?.(line, col + 1);
        return 0;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_win_set_cursor'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        requireBufferZero(state, 1, 'nvim_buf_get_mark');
        const name = readLuaString(state, 2);
        if (!name || name.length !== 1) {
            return lauxlib.luaL_error(
                state,
                to_luastring(
                    'nvim_buf_get_mark: expected single-character mark name',
                ),
            );
        }
        const pos = callbacks.getMarkPos?.(name);
        lua.lua_newtable(state);
        if (pos) {
            lua.lua_pushnumber(state, pos.line + 1);
            lua.lua_rawseti(state, -2, 1);
            lua.lua_pushnumber(state, pos.ch);
            lua.lua_rawseti(state, -2, 2);
        } else {
            lua.lua_pushnumber(state, 0);
            lua.lua_rawseti(state, -2, 1);
            lua.lua_pushnumber(state, 0);
            lua.lua_rawseti(state, -2, 2);
        }
        return 1;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_buf_get_mark'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        requireBufferZero(state, 1, 'nvim_buf_set_mark');
        const name = readLuaString(state, 2);
        if (!name || name.length !== 1) {
            return lauxlib.luaL_error(
                state,
                to_luastring(
                    'nvim_buf_set_mark: expected single-character mark name',
                ),
            );
        }
        if (!lua.lua_isnumber(state, 3) || !lua.lua_isnumber(state, 4)) {
            return lauxlib.luaL_error(
                state,
                to_luastring(
                    'nvim_buf_set_mark: expected line and col numbers',
                ),
            );
        }
        const line = lua.lua_tonumber(state, 3);
        const col = lua.lua_tonumber(state, 4);
        callbacks.setMark?.(name, line - 1, col);
        lua.lua_pushboolean(state, true);
        return 1;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_buf_set_mark'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        requireBufferZero(state, 1, 'nvim_buf_del_mark');
        const name = readLuaString(state, 2);
        if (!name || name.length !== 1) {
            return lauxlib.luaL_error(
                state,
                to_luastring(
                    'nvim_buf_del_mark: expected single-character mark name',
                ),
            );
        }
        const result = callbacks.delMark?.(name) ?? false;
        lua.lua_pushboolean(state, result);
        return 1;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_buf_del_mark'));

    // --- Wave 2: Global keymaps + key injection ---

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const mode = readLuaString(state, 1);
        const lhs = readKeyString(state, 2);
        const rhs = readKeyString(state, 3);
        if (!mode || !lhs || rhs === null) {
            return lauxlib.luaL_error(
                state,
                to_luastring(
                    'nvim_set_keymap: expected mode, lhs, rhs strings',
                ),
            );
        }
        let noremap = false;
        let desc: string | undefined;
        let expr = false;
        if (lua.lua_istable(state, 4)) {
            noremap = readBooleanField(state, 4, 'noremap') ?? false;
            desc = readStringField(state, 4, 'desc');
            expr = readBooleanField(state, 4, 'expr') ?? false;
        }
        const context = modeToContext(mode);
        if (!context) {
            console.warn(
                `Vim Motions: nvim_set_keymap unsupported mode ${mode}`,
            );
            return 0;
        }
        callbacks.onKeymap({
            mode: context,
            lhs,
            rhs,
            noremap,
            desc,
            expr,
        });
        return 0;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_set_keymap'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const mode = readLuaString(state, 1);
        const lhs = readKeyString(state, 2);
        if (!mode || !lhs) {
            return lauxlib.luaL_error(
                state,
                to_luastring('nvim_del_keymap: expected mode and lhs strings'),
            );
        }
        const context = modeToContext(mode);
        if (!context) {
            console.warn(
                `Vim Motions: nvim_del_keymap unsupported mode ${mode}`,
            );
            return 0;
        }
        callbacks.onKeymapDel({ mode: context, lhs });
        return 0;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_del_keymap'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const mode = readLuaString(state, 1);
        if (!mode) {
            return lauxlib.luaL_error(
                state,
                to_luastring('nvim_get_keymap: expected mode string'),
            );
        }
        const context = modeToContext(mode);
        const vimApi = callbacks.getVimApi?.();
        const keymaps = vimApi?.getKeymap(context ?? undefined) ?? [];
        const contextToMode: Record<string, string> = {
            normal: 'n',
            insert: 'i',
            visual: 'v',
        };
        lua.lua_newtable(state);
        let idx = 1;
        for (const km of keymaps) {
            lua.lua_newtable(state);
            lua.lua_pushstring(state, to_luastring(km.keys ?? ''));
            lua.lua_setfield(state, -2, to_luastring('lhs'));
            lua.lua_pushstring(state, to_luastring(km.toKeys ?? ''));
            lua.lua_setfield(state, -2, to_luastring('rhs'));
            lua.lua_pushstring(
                state,
                to_luastring(contextToMode[km.context ?? ''] ?? mode),
            );
            lua.lua_setfield(state, -2, to_luastring('mode'));
            lua.lua_pushboolean(state, km.type !== 'keyToKey');
            lua.lua_setfield(state, -2, to_luastring('noremap'));
            lua.lua_pushboolean(state, false);
            lua.lua_setfield(state, -2, to_luastring('expr'));
            lua.lua_pushboolean(state, false);
            lua.lua_setfield(state, -2, to_luastring('silent'));
            lua.lua_rawseti(state, -2, idx++);
        }
        return 1;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_get_keymap'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const str = lua.lua_tolstring(state, 1);
        if (!str) {
            return lauxlib.luaL_error(
                state,
                to_luastring('nvim_replace_termcodes: expected string'),
            );
        }
        // from_part (argument 2) is a legacy flag, accepted but ignored.
        lua.lua_pushstring(
            state,
            replaceTermcodes(
                str,
                lua.lua_toboolean(state, 3),
                lua.lua_toboolean(state, 4),
            ),
        );
        return 1;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_replace_termcodes'));

    const feedkeysWarnedFlags = new Set<string>();
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const keys = lua.lua_tolstring(state, 1);
        const mode = readLuaString(state, 2) ?? '';
        if (!keys) {
            return lauxlib.luaL_error(
                state,
                to_luastring('nvim_feedkeys: expected keys string'),
            );
        }
        const noremap = mode.includes('n');
        for (const ch of mode) {
            if (ch !== 'n' && ch !== 'm' && !feedkeysWarnedFlags.has(ch)) {
                feedkeysWarnedFlags.add(ch);
                console.warn(
                    `Vim Motions: nvim_feedkeys mode flag '${ch}' is not supported; only 'n' (noremap) and 'm' (remap) are implemented`,
                );
            }
        }
        const vimApi = callbacks.getVimApi?.();
        const adapter = callbacks.getCmAdapter?.();
        if (vimApi?.feedKeys && adapter) {
            vimApi.feedKeys(adapter, termcodesToNotation(keys), { noremap });
        }
        return 0;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_feedkeys'));

    // --- Wave 3: Commands + stubs + options ---

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const cmd = readLuaString(state, 1);
        if (cmd === null) {
            return lauxlib.luaL_error(
                state,
                to_luastring('nvim_command: expected command string'),
            );
        }
        callbacks.handleExCommand(cmd);
        return 0;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_command'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const name = readLuaString(state, 1);
        if (!name) {
            return lauxlib.luaL_error(
                state,
                to_luastring(
                    'nvim_del_user_command: expected command name string',
                ),
            );
        }
        const vimApi = callbacks.getVimApi?.();
        vimApi?.undefineEx?.(name);
        return 0;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_del_user_command'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        requireWindowZero(state, 1, 'nvim_win_get_buf');
        lua.lua_pushnumber(state, 0);
        return 1;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_win_get_buf'));

    for (const [name, validate] of [
        ['nvim_win_call', requireWindowZero],
        ['nvim_buf_call', requireBufferZero],
    ] as const) {
        lua.lua_pushjsfunction(L, (state: lua_State) => {
            validate(state, 1, name);
            lauxlib.luaL_checktype(state, 2, lua.LUA_TFUNCTION);
            lua.lua_settop(state, 2);
            lua.lua_pushvalue(state, 2);
            lua.lua_call(state, 0, lua.LUA_MULTRET);
            return lua.lua_gettop(state) - 2;
        });
        lua.lua_setfield(L, apiIndex, to_luastring(name));
    }

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        requireWindowZero(state, 1, 'nvim_win_get_config');
        pushLuaAny(state, {
            relative: '',
            focusable: true,
            external: false,
            hide: false,
        });
        return 1;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_win_get_config'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        requireBufferZero(state, 1, 'nvim_buf_get_option');
        const name = readLuaString(state, 2);
        if (!name) {
            return lauxlib.luaL_error(
                state,
                to_luastring('nvim_buf_get_option: expected option name'),
            );
        }
        const value = callbacks.getOption?.(name);
        pushLuaValue(state, value ?? null);
        return 1;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_buf_get_option'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        requireBufferZero(state, 1, 'nvim_buf_set_option');
        const name = readLuaString(state, 2);
        if (!name) {
            return lauxlib.luaL_error(
                state,
                to_luastring('nvim_buf_set_option: expected option name'),
            );
        }
        const value = readLuaValue(state, 3);
        callbacks.setOption?.(name, value);
        return 0;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_buf_set_option'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const name = readLuaString(state, 1);
        if (!name) {
            return lauxlib.luaL_error(
                state,
                to_luastring('nvim_get_option: expected option name'),
            );
        }
        if (name === 'operatorfunc') {
            return readOperatorfuncTo(state, operatorfunc);
        }
        const value = callbacks.getOption?.(name);
        pushLuaValue(state, value ?? null);
        return 1;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_get_option'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const name = readLuaString(state, 1);
        if (!name) {
            return lauxlib.luaL_error(
                state,
                to_luastring('nvim_set_option: expected option name'),
            );
        }
        if (name === 'operatorfunc') {
            return writeOperatorfuncFrom(state, 2, L, callbacks, operatorfunc);
        }
        const value = readLuaValue(state, 2);
        callbacks.setOption?.(name, value);
        return 0;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_set_option'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const name = readLuaString(state, 1);
        if (!name) {
            lua.lua_pushnil(state);
            return 1;
        }
        if (name === 'operatorfunc') {
            return readOperatorfuncTo(state, operatorfunc);
        }
        const value = callbacks.getOption?.(name);
        if (value === undefined || value === null) {
            lua.lua_pushnil(state);
        } else {
            pushLuaValue(state, value);
        }
        return 1;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_get_option_value'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const name = readLuaString(state, 1);
        if (!name) {
            return lauxlib.luaL_error(
                state,
                to_luastring('nvim_set_option_value: expected option name'),
            );
        }
        if (name === 'operatorfunc') {
            return writeOperatorfuncFrom(state, 2, L, callbacks, operatorfunc);
        }
        const value = readLuaValue(state, 2);
        callbacks.setOption?.(name, value);
        return 0;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_set_option_value'));

    // --- Wave 4: Variables + messaging + text ---

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        requireBufferZero(state, 1, 'nvim_buf_get_var');
        const name = readLuaString(state, 2);
        if (!name) {
            return lauxlib.luaL_error(
                state,
                to_luastring('nvim_buf_get_var: expected variable name'),
            );
        }
        const filePath = callbacks.getActiveFilePath?.() ?? '';
        const vars = bufferVars.get(filePath);
        const value = vars?.get(name);
        if (value === undefined) {
            return lauxlib.luaL_error(
                state,
                to_luastring(`Key not found: ${name}`),
            );
        }
        pushLuaAny(state, value);
        return 1;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_buf_get_var'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        requireBufferZero(state, 1, 'nvim_buf_set_var');
        const name = readLuaString(state, 2);
        if (!name) {
            return lauxlib.luaL_error(
                state,
                to_luastring('nvim_buf_set_var: expected variable name'),
            );
        }
        const value = readLuaValue(state, 3);
        const filePath = callbacks.getActiveFilePath?.() ?? '';
        let vars = bufferVars.get(filePath);
        if (!vars) {
            vars = new Map();
            bufferVars.set(filePath, vars);
        }
        if (value === null || value === undefined) {
            vars.delete(name);
        } else {
            vars.set(name, value);
        }
        return 0;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_buf_set_var'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const name = readLuaString(state, 1);
        if (!name) {
            lua.lua_pushnil(state);
            return 1;
        }
        switch (name) {
            case 'count':
                lua.lua_pushinteger(state, currentVimV.count);
                return 1;
            case 'count1':
                lua.lua_pushinteger(state, currentVimV.count1);
                return 1;
            case 'register':
                lua.lua_pushstring(state, to_luastring(currentVimV.register));
                return 1;
            case 'operator':
                lua.lua_pushstring(state, to_luastring(currentVimV.operator));
                return 1;
            case 'searchforward': {
                const value =
                    callbacks.getSearchForward?.() ?? currentVimV.searchforward;
                lua.lua_pushinteger(state, value);
                return 1;
            }
            case 'insertmode':
                lua.lua_pushstring(state, to_luastring(currentVimV.insertmode));
                return 1;
            case 'numbermax':
                lua.lua_pushinteger(state, 9007199254740991);
                return 1;
            case 'numbermin':
                lua.lua_pushinteger(state, -9007199254740991);
                return 1;
            case 'numbersize':
                lua.lua_pushinteger(state, 53);
                return 1;
            case 'true':
                lua.lua_pushboolean(state, true);
                return 1;
            case 'false':
                lua.lua_pushboolean(state, false);
                return 1;
            case 'null':
                lua.lua_pushnil(state);
                return 1;
            case 'foldstart':
                lua.lua_pushinteger(state, currentVimV.foldstart);
                return 1;
            case 'foldend':
                lua.lua_pushinteger(state, currentVimV.foldend);
                return 1;
            case 'foldlevel':
                lua.lua_pushinteger(state, currentVimV.foldlevel);
                return 1;
            case 'folddashes':
                lua.lua_pushstring(state, to_luastring(currentVimV.folddashes));
                return 1;
            case 'lnum':
                lua.lua_pushinteger(state, currentVimV.lnum);
                return 1;
            case 'relnum':
                lua.lua_pushinteger(state, currentVimV.relnum);
                return 1;
            case 'virtnum':
                lua.lua_pushinteger(state, currentVimV.virtnum);
                return 1;
            case 'char':
                lua.lua_pushstring(state, to_luastring(currentVimV.char));
                return 1;
            case 'hlsearch': {
                const hl = callbacks.getHlSearch?.() ?? currentVimV.hlsearch;
                lua.lua_pushinteger(state, hl);
                return 1;
            }
            case 'event':
                if (currentVimV.event === null) {
                    lua.lua_pushnil(state);
                } else {
                    pushLuaAny(state, currentVimV.event);
                }
                return 1;
            default:
                lua.lua_pushnil(state);
                return 1;
        }
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_get_vvar'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const name = readLuaString(state, 1);
        if (!name) return 0;
        if (name === 'searchforward') {
            const value = lua.lua_isnumber(state, 2)
                ? lua.lua_tonumber(state, 2)
                : 0;
            const nextValue = Number.isNaN(value) ? 0 : value;
            callbacks.setSearchForward?.(nextValue);
            currentVimV = { ...currentVimV, searchforward: nextValue };
            return 0;
        }
        if (name === 'char') {
            const value = readLuaString(state, 2) ?? '';
            currentVimV = { ...currentVimV, char: value };
            return 0;
        }
        return lauxlib.luaL_error(
            state,
            to_luastring(`vim.v.${name} is read-only`),
        );
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_set_vvar'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        if (!lua.lua_istable(state, 1)) {
            return lauxlib.luaL_error(
                state,
                to_luastring(
                    'nvim_echo: expected chunks table as first argument',
                ),
            );
        }
        const parts: string[] = [];
        const len = lauxlib.luaL_len(state, 1);
        for (let i = 1; i <= len; i++) {
            lua.lua_rawgeti(state, 1, i);
            if (lua.lua_istable(state, -1)) {
                lua.lua_rawgeti(state, -1, 1);
                const text = lua.lua_isstring(state, -1)
                    ? to_jsstring(lua.lua_tolstring(state, -1)!)
                    : '';
                lua.lua_pop(state, 1);
                parts.push(text);
            }
            lua.lua_pop(state, 1);
        }
        const message = parts.join('');
        if (message.length > 0) {
            callbacks.showNotice?.(message);
        }
        return 0;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_echo'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        requireBufferZero(state, 1, 'nvim_buf_set_text');
        if (
            !lua.lua_isnumber(state, 2) ||
            !lua.lua_isnumber(state, 3) ||
            !lua.lua_isnumber(state, 4) ||
            !lua.lua_isnumber(state, 5)
        ) {
            return lauxlib.luaL_error(
                state,
                to_luastring(
                    'nvim_buf_set_text: expected start_row, start_col, end_row, end_col numbers',
                ),
            );
        }
        const startRow = lua.lua_tonumber(state, 2);
        const startCol = lua.lua_tonumber(state, 3);
        const endRow = lua.lua_tonumber(state, 4);
        const endCol = lua.lua_tonumber(state, 5);
        const lines = getStringList(state, 6);
        const text = lines.join('\n');
        callbacks.replaceRange?.(text, startRow, startCol, endRow, endCol);
        return 0;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_buf_set_text'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        requireBufferZero(state, 1, 'nvim_buf_set_extmark');
        const nsId = lua.lua_tonumber(state, 2);
        const line = lua.lua_tonumber(state, 3);
        const col = lua.lua_tonumber(state, 4);

        const opts: ExtmarkOpts = {};
        if (lua.lua_istable(state, 5)) {
            const id = readNumberField(state, 5, 'id');
            if (id !== null) opts.id = id;

            const endRow = readNumberField(state, 5, 'end_row');
            if (endRow !== null) opts.endLine = endRow;

            const endCol = readNumberField(state, 5, 'end_col');
            if (endCol !== null) opts.endCol = endCol;

            const hlGroup = readStringField(state, 5, 'hl_group');
            if (hlGroup) opts.hlGroup = hlGroup;

            const priority = readNumberField(state, 5, 'priority');
            if (priority !== null) opts.priority = priority;

            const virtTextPos = readStringField(state, 5, 'virt_text_pos');
            if (virtTextPos) {
                opts.virtTextPos = virtTextPos as ExtmarkOpts['virtTextPos'];
            }

            lua.lua_getfield(state, 5, to_luastring('virt_text'));
            if (lua.lua_istable(state, -1)) {
                const chunks: VirtTextChunk[] = [];
                for (let i = 1; ; i++) {
                    lua.lua_rawgeti(state, -1, i);
                    if (lua.lua_isnil(state, -1)) {
                        lua.lua_pop(state, 1);
                        break;
                    }
                    if (lua.lua_istable(state, -1)) {
                        lua.lua_rawgeti(state, -1, 1);
                        const text = lua.lua_isstring(state, -1)
                            ? (readLuaString(state, -1) ?? '')
                            : '';
                        lua.lua_pop(state, 1);
                        lua.lua_rawgeti(state, -1, 2);
                        const chunkHlGroup = lua.lua_isstring(state, -1)
                            ? (readLuaString(state, -1) ?? '')
                            : '';
                        lua.lua_pop(state, 1);
                        chunks.push({ text, hlGroup: chunkHlGroup });
                    }
                    lua.lua_pop(state, 1);
                }
                if (chunks.length > 0) opts.virtText = chunks;
            }
            lua.lua_pop(state, 1);
        }

        const view = callbacks.getEditorView?.();
        if (!view) {
            lua.lua_pushinteger(state, 0);
            return 1;
        }

        const id = dispatchSetExtmark(view, nsId, line, col, opts);
        lua.lua_pushinteger(state, id);
        return 1;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_buf_set_extmark'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        requireBufferZero(state, 1, 'nvim_buf_get_extmarks');
        const nsId = lua.lua_tonumber(state, 2);

        let startPos: [number, number] = [0, 0];
        if (lua.lua_istable(state, 3)) {
            lua.lua_rawgeti(state, 3, 1);
            const sLine = lua.lua_tonumber(state, -1);
            lua.lua_pop(state, 1);
            lua.lua_rawgeti(state, 3, 2);
            const sCol = lua.lua_tonumber(state, -1);
            lua.lua_pop(state, 1);
            startPos = [sLine, sCol];
        }

        let endPos: [number, number] = [-1, -1];
        if (lua.lua_istable(state, 4)) {
            lua.lua_rawgeti(state, 4, 1);
            const eLine = lua.lua_tonumber(state, -1);
            lua.lua_pop(state, 1);
            lua.lua_rawgeti(state, 4, 2);
            const eCol = lua.lua_tonumber(state, -1);
            lua.lua_pop(state, 1);
            endPos = [eLine, eCol];
        } else if (lua.lua_isnumber(state, 4)) {
            const val = lua.lua_tonumber(state, 4);
            if (val === -1) endPos = [-1, -1];
        }

        let limit: number | undefined;
        let details = false;
        if (lua.lua_istable(state, 5)) {
            const l = readNumberField(state, 5, 'limit');
            if (l !== null) limit = l;
            const d = readBooleanField(state, 5, 'details');
            if (d !== undefined) details = d;
        }

        const view = callbacks.getEditorView?.();
        if (!view) {
            lua.lua_newtable(state);
            return 1;
        }

        const results = queryExtmarks(view, nsId, startPos, endPos, {
            limit,
            details,
        });

        lua.lua_newtable(state);
        for (let i = 0; i < results.length; i++) {
            const entry = results[i];
            if (!entry) continue;
            lua.lua_newtable(state);
            lua.lua_pushinteger(state, entry[0]);
            lua.lua_rawseti(state, -2, 1);
            lua.lua_pushinteger(state, entry[1]);
            lua.lua_rawseti(state, -2, 2);
            lua.lua_pushinteger(state, entry[2]);
            lua.lua_rawseti(state, -2, 3);
            if (details && entry[3]) {
                pushLuaValue(state, entry[3]);
                lua.lua_rawseti(state, -2, 4);
            }
            lua.lua_rawseti(state, -2, i + 1);
        }
        return 1;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_buf_get_extmarks'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        requireBufferZero(state, 1, 'nvim_buf_get_extmark_by_id');
        const nsId = lua.lua_tonumber(state, 2);
        const id = lua.lua_tonumber(state, 3);
        let details = false;
        if (lua.lua_istable(state, 4)) {
            const d = readBooleanField(state, 4, 'details');
            if (d !== undefined) details = d;
        }

        const view = callbacks.getEditorView?.();
        if (!view) {
            lua.lua_newtable(state);
            return 1;
        }

        const result = queryExtmarkById(view, nsId, id, { details });
        if (!result) {
            lua.lua_newtable(state);
            return 1;
        }

        lua.lua_newtable(state);
        lua.lua_pushinteger(state, result[0]);
        lua.lua_rawseti(state, -2, 1);
        lua.lua_pushinteger(state, result[1]);
        lua.lua_rawseti(state, -2, 2);
        if (details && result[2]) {
            pushLuaValue(state, result[2]);
            lua.lua_rawseti(state, -2, 3);
        }
        return 1;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_buf_get_extmark_by_id'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        requireBufferZero(state, 1, 'nvim_buf_del_extmark');
        const nsId = lua.lua_tonumber(state, 2);
        const id = lua.lua_tonumber(state, 3);

        const view = callbacks.getEditorView?.();
        if (!view) {
            lua.lua_pushboolean(state, false);
            return 1;
        }

        const deleted = dispatchDelExtmark(view, nsId, id);
        lua.lua_pushboolean(state, deleted);
        return 1;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_buf_del_extmark'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        requireBufferZero(state, 1, 'nvim_buf_clear_namespace');
        const nsId = lua.lua_tonumber(state, 2);
        const lineStart = lua.lua_tonumber(state, 3);
        const lineEnd = lua.lua_tonumber(state, 4);

        const view = callbacks.getEditorView?.();
        if (!view) return 0;

        dispatchClearNamespace(view, nsId, lineStart, lineEnd);
        return 0;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_buf_clear_namespace'));

    lua.lua_newtable(L);
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const fnName = readLuaString(state, 2);
        if (fnName && SUPPORTED_NVIM_API_FUNCTIONS.has(fnName)) {
            lua.lua_getfield(state, 1, to_luastring(fnName));
            return 1;
        }
        if (fnName && KNOWN_NVIM_API_FUNCTIONS.has(fnName)) {
            const stub = (stubState: lua_State) => {
                if (!warnedApiFunctions.has(fnName)) {
                    warnedApiFunctions.add(fnName);
                    console.warn(
                        `Vim Motions: vim.api.${fnName} is not implemented in Obsidian`,
                    );
                }
                if (NVIM_API_RETURN_TYPES.boolean.has(fnName)) {
                    lua.lua_pushboolean(stubState, false);
                    return 1;
                }
                if (NVIM_API_RETURN_TYPES.integer.has(fnName)) {
                    lua.lua_pushinteger(stubState, 0);
                    return 1;
                }
                if (NVIM_API_RETURN_TYPES.string.has(fnName)) {
                    lua.lua_pushstring(stubState, to_luastring(''));
                    return 1;
                }
                if (NVIM_API_RETURN_TYPES.table.has(fnName)) {
                    lua.lua_newtable(stubState);
                    return 1;
                }
                if (NVIM_API_RETURN_TYPES.array.has(fnName)) {
                    lua.lua_newtable(stubState);
                    return 1;
                }
                if (NVIM_API_RETURN_TYPES.nil.has(fnName)) {
                    lua.lua_pushnil(stubState);
                    return 1;
                }
                if (NVIM_API_RETURN_TYPES.void.has(fnName)) {
                    return 0;
                }
                lua.lua_pushnil(stubState);
                return 1;
            };
            lua.lua_pushjsfunction(state, stub);
            lua.lua_pushvalue(state, -1);
            lua.lua_setfield(state, 1, to_luastring(fnName));
            return 1;
        }
        const supportedList = Array.from(SUPPORTED_NVIM_API_FUNCTIONS).join(
            ', ',
        );
        return lauxlib.luaL_error(
            state,
            to_luastring(
                `vim.api.${fnName ?? '?'} is not available in Obsidian. Supported: ${supportedList}`,
            ),
        );
    });
    lua.lua_setfield(L, -2, to_luastring('__index'));
    lua.lua_setmetatable(L, apiIndex);

    lua.lua_pushvalue(L, apiIndex);
    lua.lua_setfield(L, vimTableIndex, to_luastring('api'));
    lua.lua_pop(L, 1);

    for (const key of ['lsp', 'ui', 'diagnostic']) {
        createWarnStub(L, key, warnedNamespaceKeys);
        lua.lua_setfield(L, vimTableIndex, to_luastring(key));
    }

    lua.lua_newtable(L);
    const filetypeIndex = lua.lua_gettop(L);
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const ft = readLuaString(state, 1);
        const optName = readLuaString(state, 2);
        if (optName === 'commentstring') {
            const csMap: Record<string, string> = {
                markdown: '%% %s %%',
                javascript: '// %s',
                typescript: '// %s',
                python: '# %s',
                lua: '-- %s',
                css: '/* %s */',
                html: '<!-- %s -->',
                xml: '<!-- %s -->',
                c: '/* %s */',
                cpp: '// %s',
                java: '// %s',
                rust: '// %s',
                go: '// %s',
                ruby: '# %s',
                sh: '# %s',
                bash: '# %s',
                yaml: '# %s',
                toml: '# %s',
            };
            const cs = ft ? (csMap[ft] ?? '%% %s %%') : '%% %s %%';
            lua.lua_pushstring(state, to_luastring(cs));
            return 1;
        }
        lua.lua_pushnil(state);
        return 1;
    });
    lua.lua_setfield(L, filetypeIndex, to_luastring('get_option'));
    lua.lua_pushvalue(L, filetypeIndex);
    lua.lua_setfield(L, vimTableIndex, to_luastring('filetype'));
    lua.lua_pop(L, 1);

    injectRegex(L, vimTableIndex);

    lua.lua_pushvalue(L, vimTableIndex);
    lua.lua_setglobal(L, to_luastring('vim'));

    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const argc = lua.lua_gettop(state);
        const values: unknown[] = [];
        for (let i = 1; i <= argc; i++) {
            if (lua.lua_isstring(state, i)) {
                const str = lua.lua_tolstring(state, i);
                values.push(str ? to_jsstring(str) : '');
                continue;
            }
            if (lua.lua_isnumber(state, i)) {
                values.push(lua.lua_tonumber(state, i));
                continue;
            }
            if (lua.lua_isboolean(state, i)) {
                values.push(lua.lua_toboolean(state, i));
                continue;
            }
            if (lua.lua_isnil(state, i)) {
                values.push(null);
                continue;
            }
            values.push(`lua:${lua.lua_type(state, i)}`);
        }
        console.warn(...values);
        return 0;
    });
    lua.lua_setglobal(L, to_luastring('print'));

    return { globals };
}
