import { lua, lauxlib, to_jsstring, to_luastring } from 'fengari';
import type { lua_State } from 'fengari';
import type { MapContext } from '../types/vim-api';
import { KNOWN_SET_OPTIONS } from '../vimrc/loader';

export interface LuaKeymap {
    mode: MapContext;
    lhs: string;
    rhs?: string;
    noremap: boolean;
    desc?: string;
    isFn?: boolean;
    callback?: () => void;
}

export interface LuaKeymapDelete {
    mode: MapContext;
    lhs: string;
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
    getLeaderKey?: () => string;
    setLeaderKey?: (key: string) => void;
    getOption?: (name: string) => unknown;
    getModePrompt?: (key: string) => string | undefined;
}

const MODE_PROMPT_MAP: Record<string, string> = {
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

function readLuaString(L: lua_State, index: number): string | null {
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

function pushLuaValue(L: lua_State, value: unknown): void {
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

function formatDirectiveValue(value: unknown): string {
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    return 'nil';
}

function replaceLeaderKey(input: string, leaderKey: string): string {
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

function readBooleanField(
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

function readStringField(
    L: lua_State,
    index: number,
    field: string,
): string | undefined {
    lua.lua_getfield(L, index, to_luastring(field));
    const value = readLuaString(L, -1);
    lua.lua_pop(L, 1);
    return value ?? undefined;
}

function readAnyField(L: lua_State, index: number, field: string): unknown {
    lua.lua_getfield(L, index, to_luastring(field));
    const value = readLuaValue(L, -1);
    lua.lua_pop(L, 1);
    return value;
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

export function injectVimApi(L: lua_State, callbacks: VimApiCallbacks): void {
    const globals = new Map<string, unknown>();
    const getLeaderKey = () => callbacks.getLeaderKey?.() ?? '\\';

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
        const value = readLuaValue(state, 3);
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
        if (lua.lua_istable(state, 4)) {
            const expr = readBooleanField(state, 4, 'expr');
            if (expr) {
                return lauxlib.luaL_error(
                    state,
                    to_luastring(
                        'vim.keymap.set: expr mappings are not supported',
                    ),
                );
            }
            const buffer = readAnyField(state, 4, 'buffer');
            if (buffer !== undefined) {
                console.warn(
                    'Vim Motions: vim.keymap.set buffer option is not supported',
                );
            }
            const remap = readBooleanField(state, 4, 'remap');
            const noremapOpt = readBooleanField(state, 4, 'noremap');
            if (remap === true || noremapOpt === false) noremap = false;
            desc = readStringField(state, 4, 'desc');
        }

        let callback: (() => void) | undefined;
        let rhs = rhsRaw ?? undefined;
        if (rhsIsFn) {
            lua.lua_pushvalue(state, 3);
            const ref = lauxlib.luaL_ref(state, lua.LUA_REGISTRYINDEX);
            callback = () => {
                lua.lua_rawgeti(state, lua.LUA_REGISTRYINDEX, ref);
                const status = lua.lua_pcall(state, 0, 0, 0);
                if (status !== lua.LUA_OK) {
                    const message = lua.lua_tolstring(state, -1);
                    const error = message
                        ? to_jsstring(message)
                        : 'Lua callback error';
                    console.error(`Vim Motions: ${error}`);
                    lua.lua_pop(state, 1);
                }
            };
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
            callbacks.onKeymap({
                mode: context,
                lhs,
                rhs: rhsValue,
                noremap,
                desc,
                isFn: rhsIsFn,
                callback,
            });
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
        for (const mode of modes) {
            const context = modeToContext(mode);
            if (!context) {
                console.warn(`Vim Motions: unsupported mode ${mode}`);
                continue;
            }
            const leaderKey = getLeaderKey();
            const lhs = replaceLeaderKey(lhsRaw, leaderKey);
            callbacks.onKeymapDel({ mode: context, lhs });
        }
        return 0;
    });
    lua.lua_setfield(L, keymapIndex, to_luastring('del'));
    lua.lua_pushvalue(L, keymapIndex);
    lua.lua_setfield(L, vimTableIndex, to_luastring('keymap'));
    lua.lua_pop(L, 1);

    for (const [key, message] of [
        [
            'api',
            'vim.api is not available in Obsidian — see docs for supported APIs',
        ],
        [
            'fn',
            'vim.fn is not available in Obsidian — use vim.cmd() for ex commands',
        ],
        ['lsp', 'vim.lsp is not available in Obsidian'],
        ['treesitter', 'vim.treesitter is not available in Obsidian'],
        ['ui', 'vim.ui is not available in Obsidian'],
        ['diagnostic', 'vim.diagnostic is not available in Obsidian'],
    ]) {
        createErrorStub(L, message as string);
        lua.lua_setfield(L, vimTableIndex, to_luastring(key as string));
    }

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
}
