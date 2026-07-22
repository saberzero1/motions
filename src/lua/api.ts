import { lua, lauxlib, to_jsstring, to_luastring } from 'fengari';
import type { lua_State } from 'fengari';
import type {
    MapContext,
    VimApi,
    CmAdapter,
    ActionArgs,
} from '../types/vim-api';
import type { AutocmdEventData, AutocmdManager } from './autocmd';
import { KNOWN_SET_OPTIONS } from '../vimrc/loader';
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

let exprDepth = 0;
const MAX_EXPR_DEPTH = 200;

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
    imSave?: () => void;
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
            return 'normal';
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

function createErrorStub(L: lua_State, message: string): void {
    lua.lua_newtable(L);
    lua.lua_newtable(L);
    lua.lua_pushjsfunction(L, (state: lua_State) =>
        lauxlib.luaL_error(state, to_luastring(message)),
    );
    lua.lua_setfield(L, -2, to_luastring('__index'));
    lua.lua_pushjsfunction(L, (state: lua_State) =>
        lauxlib.luaL_error(state, to_luastring(message)),
    );
    lua.lua_setfield(L, -2, to_luastring('__newindex'));
    lua.lua_setmetatable(L, -2);
}

export interface VimApiState {
    globals: Map<string, unknown>;
}

export function injectVimApi(
    L: lua_State,
    callbacks: VimApiCallbacks,
): VimApiState {
    const globals = new Map<string, unknown>();
    const notifiedMessages = new Set<string>();
    const userEnvMap = new Map<string, string>();
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

    lua.lua_newtable(L);
    const optTableIndex = lua.lua_gettop(L);
    lua.lua_newtable(L);
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const key = readLuaString(state, 2);
        if (!key) {
            lua.lua_pushnil(state);
            return 1;
        }
        const spec = KNOWN_SET_OPTIONS[key];
        if (!spec) {
            lua.lua_pushnil(state);
            return 1;
        }
        const value = callbacks.getOption?.(key);
        pushLuaValue(state, value);
        return 1;
    });
    lua.lua_setfield(L, -2, to_luastring('__index'));
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const key = readLuaString(state, 2);
        if (!key) return 0;
        const spec = KNOWN_SET_OPTIONS[key];
        if (!spec) {
            console.warn(`Vim Motions: unknown vim.opt option ${key}`);
            return 0;
        }
        let value: unknown;
        if (spec.type === 'string' && lua.lua_istable(state, 3)) {
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
        const command = readLuaString(state, 1);
        if (!command) {
            return lauxlib.luaL_error(
                state,
                to_luastring('vim.cmd expects a command string'),
            );
        }
        callbacks.handleExCommand(command);
        return 0;
    });
    lua.lua_setfield(L, vimTableIndex, to_luastring('cmd'));

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
        const lhsRaw = readLuaString(state, 2);
        if (!lhsRaw) {
            return lauxlib.luaL_error(
                state,
                to_luastring('vim.keymap.set expects a lhs string'),
            );
        }
        const rhsIsFn = lua.lua_isfunction(state, 3);
        const rhsRaw = rhsIsFn ? null : readLuaString(state, 3);
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
            | ((cm?: unknown, actionArgs?: unknown) => void)
            | undefined;
        let rhs = rhsRaw ?? undefined;
        if (rhsIsFn) {
            lua.lua_pushvalue(state, 3);
            const ref = lauxlib.luaL_ref(state, lua.LUA_REGISTRYINDEX);
            const runner = callbacks.runner;
            if (expr) {
                callback = (cm?: unknown, actionArgs?: unknown) => {
                    if (actionArgs && typeof actionArgs === 'object') {
                        const args = actionArgs as ActionArgs;
                        setVimVContext({
                            count: args.repeatIsExplicit ? args.repeat : 0,
                            count1: args.repeat,
                            register: args.registerName ?? '"',
                            operator: args.pendingOperator ?? '',
                        });
                    }
                    lua.lua_rawgeti(state, lua.LUA_REGISTRYINDEX, ref);
                    const status = withInstructionGuard(
                        state,
                        EXPR_INSTRUCTION_LIMIT,
                        () => lua.lua_pcall(state, 0, 1, 0),
                    );
                    clearVimVContext();
                    if (status !== lua.LUA_OK) {
                        const message = lua.lua_tolstring(state, -1);
                        const error = message
                            ? to_jsstring(message)
                            : 'Lua expr callback error';
                        console.error(`Vim Motions: ${error}`);
                        showLuaErrorNotice(error);
                        lua.lua_pop(state, 1);
                        return;
                    }
                    const returnedKeys = lua.lua_isstring(state, -1)
                        ? to_jsstring(lua.lua_tolstring(state, -1)!)
                        : null;
                    lua.lua_pop(state, 1);
                    if (!returnedKeys || returnedKeys.length === 0) return;
                    if (
                        cm &&
                        typeof (cm as Record<string, unknown>).state ===
                            'object'
                    ) {
                        const adapter = cm as CmAdapter;
                        const vimApi = callbacks.getVimApi?.();
                        if (vimApi?.feedKeys) {
                            exprDepth++;
                            if (exprDepth > MAX_EXPR_DEPTH) {
                                exprDepth = 0;
                                console.error(
                                    'Vim Motions: expr mapping recursion limit exceeded',
                                );
                                return;
                            }
                            try {
                                vimApi.feedKeys(adapter, returnedKeys, {
                                    noremap,
                                });
                            } finally {
                                exprDepth--;
                            }
                        }
                    }
                };
            } else if (runner) {
                callback = (cm?: unknown, actionArgs?: unknown) => {
                    void cm;
                    if (actionArgs && typeof actionArgs === 'object') {
                        const args = actionArgs as ActionArgs;
                        setVimVContext({
                            count: args.repeatIsExplicit ? args.repeat : 0,
                            count1: args.repeat,
                            register: args.registerName ?? '"',
                            operator: args.pendingOperator ?? '',
                        });
                    }
                    void runner
                        .invokeAsyncCapable(
                            ref,
                            () => 0,
                            CALLBACK_INSTRUCTION_LIMIT,
                        )
                        .then((result) => {
                            clearVimVContext();
                            if (!result.ok) {
                                console.error(`Vim Motions: ${result.error}`);
                                showLuaErrorNotice(
                                    result.error ?? 'Lua callback error',
                                );
                            }
                        });
                };
            } else {
                callback = (cm?: unknown, actionArgs?: unknown) => {
                    void cm;
                    if (actionArgs && typeof actionArgs === 'object') {
                        const args = actionArgs as ActionArgs;
                        setVimVContext({
                            count: args.repeatIsExplicit ? args.repeat : 0,
                            count1: args.repeat,
                            register: args.registerName ?? '"',
                            operator: args.pendingOperator ?? '',
                        });
                    }
                    lua.lua_rawgeti(state, lua.LUA_REGISTRYINDEX, ref);
                    const status = withInstructionGuard(
                        state,
                        CALLBACK_INSTRUCTION_LIMIT,
                        () => lua.lua_pcall(state, 0, 0, 0),
                    );
                    clearVimVContext();
                    if (status !== lua.LUA_OK) {
                        const message = lua.lua_tolstring(state, -1);
                        const error = message
                            ? to_jsstring(message)
                            : 'Lua callback error';
                        console.error(`Vim Motions: ${error}`);
                        showLuaErrorNotice(error);
                        lua.lua_pop(state, 1);
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
        const lhsRaw = readLuaString(state, 2);
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
        lua.lua_pushnumber(state, 0);
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
        const lhs = readLuaString(state, 3);
        const rhs = readLuaString(state, 4);
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
        const lhs = readLuaString(state, 3);
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
        callbacks.onBufferKeymapDel?.(filePath, context, lhs);
        return 0;
    });
    lua.lua_setfield(L, apiIndex, to_luastring('nvim_buf_del_keymap'));

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

    lua.lua_newtable(L);
    lua.lua_pushjsfunction(L, (state: lua_State) => {
        const fnName = readLuaString(state, 2);
        const supported = new Set([
            'nvim_create_user_command',
            'nvim_create_autocmd',
            'nvim_create_augroup',
            'nvim_del_autocmd',
            'nvim_del_augroup_by_name',
            'nvim_clear_autocmds',
            'nvim_create_namespace',
            'nvim_set_hl',
            'nvim_get_hl',
            'nvim_buf_set_keymap',
            'nvim_buf_del_keymap',
            'nvim_buf_get_lines',
            'nvim_buf_set_lines',
            'nvim_get_current_buf',
            'nvim_buf_get_name',
            'nvim_buf_line_count',
        ]);
        if (fnName && supported.has(fnName)) {
            lua.lua_getfield(state, 1, to_luastring(fnName));
            return 1;
        }
        return lauxlib.luaL_error(
            state,
            to_luastring(
                `vim.api.${fnName ?? '?'} is not available in Obsidian. Supported: nvim_create_user_command, nvim_create_autocmd, nvim_create_augroup, nvim_del_autocmd, nvim_del_augroup_by_name, nvim_clear_autocmds, nvim_create_namespace, nvim_set_hl, nvim_get_hl, nvim_buf_set_keymap, nvim_buf_del_keymap, nvim_buf_get_lines, nvim_buf_set_lines, nvim_get_current_buf, nvim_buf_get_name, nvim_buf_line_count`,
            ),
        );
    });
    lua.lua_setfield(L, -2, to_luastring('__index'));
    lua.lua_setmetatable(L, apiIndex);

    lua.lua_pushvalue(L, apiIndex);
    lua.lua_setfield(L, vimTableIndex, to_luastring('api'));
    lua.lua_pop(L, 1);

    for (const [key, message] of [
        ['lsp', 'vim.lsp is not available in Obsidian'],
        ['treesitter', 'vim.treesitter is not available in Obsidian'],
        ['ui', 'vim.ui is not available in Obsidian'],
        ['diagnostic', 'vim.diagnostic is not available in Obsidian'],
    ]) {
        createErrorStub(L, message as string);
        lua.lua_setfield(L, vimTableIndex, to_luastring(key as string));
    }

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
