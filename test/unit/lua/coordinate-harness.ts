import {
    lua,
    lauxlib,
    to_jsstring,
    to_luastring,
} from '../../../src/lib/fengari';
import { createSandboxedState, destroyState } from '../../../src/lua/engine';
import { injectVimApi } from '../../../src/lua/api';
import { injectVimFn, type VimFnCallbacks } from '../../../src/lua/fn';
import { AutocmdManager } from '../../../src/lua/autocmd';
import { injectStdlib } from '../../../src/lua/stdlib';
import { COORD_LINES } from '../../fixtures/neovim-coordinate-contract';
import type { CmAdapter } from '../../../src/types/vim-api';
import type { EditorView } from '@codemirror/view';

type LuaState = ReturnType<typeof createSandboxedState>;

export function createCoordinateState(
    lines: readonly string[] = COORD_LINES,
    fnCallbacks: Partial<VimFnCallbacks> = {},
) {
    const L = createSandboxedState();
    const host = {
        lines: [...lines],
        loaded: true,
        visualMode: 'v',
        cm: null as CmAdapter | null,
        editorView: null as EditorView | null,
        cursor: { line: 1, col: 1 },
        marks: new Map<string, { line: number; ch: number }>(),
    };
    const getLineCount = () => (host.loaded ? host.lines.length : 0);
    const getLines = (start: number, end: number) =>
        host.loaded
            ? host.lines.slice(start, end === -1 ? undefined : end)
            : [];
    const setLines = (start: number, end: number, replacement: string[]) => {
        host.lines.splice(
            start,
            (end === -1 ? host.lines.length : end) - start,
            ...replacement,
        );
        if (host.lines.length === 0) host.lines.push('');
    };
    try {
        const api = injectVimApi(L, {
            getEditorView: () => host.editorView,
            getCmAdapter: () => host.cm,
            onSettingOverride: () => {},
            handleExCommand: () => {},
            getVaultName: () => 'coordinate-vault',
            onKeymap: () => {},
            onKeymapDel: () => {},
            autocmdManager: new AutocmdManager(L),
            getActiveFilePath: () => 'coordinates.md',
            getLineCount,
            getLines,
            setLines,
            replaceRange: (text, fromLine, fromCol, toLine, toCol) => {
                const before = (host.lines[fromLine] ?? '').slice(0, fromCol);
                const after = (host.lines[toLine] ?? '').slice(toCol);
                host.lines.splice(
                    fromLine,
                    toLine - fromLine + 1,
                    ...(before + text + after).split('\n'),
                );
            },
            getCursorPosition: () => (host.loaded ? host.cursor : null),
            setCursorPosition: (line, col) => {
                host.cursor = { line, col };
            },
            getMarkPos: (name) => host.marks.get(name) ?? null,
            getLastVisualMode: () => host.visualMode,
            getBufferOption: (name) =>
                name === 'fileformat' ? 'unix' : undefined,
        });
        injectVimFn(L, {
            getCmAdapter: () => host.cm,
            getBufferOption: api.getBufferOption,
            getWindowOption: api.getWindowOption,
            getActiveFilePath: () => 'coordinates.md',
            fileExists: () => false,
            getVaultFiles: () => [],
            isDirectory: () => false,
            getMode: () => 'n',
            getCursorLine: () => host.cursor.line,
            getCursorCol: () => host.cursor.col,
            setCursor: (line, col) => {
                host.cursor = { line: line + 1, col: col + 1 };
            },
            setMark: (name, line, ch) => {
                host.marks.set(name, { line, ch });
            },
            getLine: (line) =>
                host.loaded ? (host.lines[line] ?? null) : null,
            getLineCount,
            getLines,
            setLines,
            getMarkPos: (name) => host.marks.get(name) ?? null,
            getLastVisualMode: () => host.visualMode,
            getPlatform: () => ({
                isMacOS: false,
                isLinux: true,
                isWin: false,
                isMobile: false,
                isIosApp: false,
                isAndroidApp: false,
            }),
            getObsidianVersion: () => '1.13.7',
            getGlobal: (name) => api.globals.get(name),
            getOption: () => undefined,
            ...fnCallbacks,
        });
        injectStdlib(L);
        return { L, host };
    } catch (error) {
        destroyState(L);
        throw error;
    }
}

function runLua(L: LuaState, code: string): void {
    const status = lauxlib.luaL_dostring(L, to_luastring(code));
    if (status !== lua.LUA_OK) {
        const raw = lua.lua_tolstring(L, -1);
        const error = raw ? to_jsstring(raw) : `Lua status ${status}`;
        lua.lua_pop(L, 1);
        throw new Error(error);
    }
}

export function runLuaNumber(L: LuaState, code: string): number {
    runLua(L, code);
    try {
        if (lua.lua_type(L, -1) !== lua.LUA_TNUMBER)
            throw new Error('Expected a Lua number');
        return lua.lua_tonumber(L, -1);
    } finally {
        lua.lua_pop(L, 1);
    }
}

export function runLuaString(L: LuaState, code: string): string {
    runLua(L, code);
    try {
        if (lua.lua_type(L, -1) !== lua.LUA_TSTRING)
            throw new Error('Expected a Lua string');
        return to_jsstring(lauxlib.luaL_checkstring(L, -1));
    } finally {
        lua.lua_pop(L, 1);
    }
}

export function runLuaError(L: LuaState, code: string): string {
    const status = lauxlib.luaL_dostring(L, to_luastring(code));
    const raw = lua.lua_tolstring(L, -1);
    const value = raw ? to_jsstring(raw) : 'nil';
    lua.lua_pop(L, 1);
    return status === lua.LUA_OK ? `success: ${value}` : value;
}

export function readBuffer(
    state: ReturnType<typeof createCoordinateState>,
): string[] {
    return [...state.host.lines];
}

export function observeTextCoordinate(
    state: ReturnType<typeof createCoordinateState>,
    api: string,
    args: string,
    rawBytes = false,
): string {
    const call = `${api}(${args})`;
    if (api.endsWith('nvim_buf_set_text')) {
        runLuaString(state.L, `${call}; return 'set'`);
        return readBuffer(state).join('\n');
    }
    return runLuaString(
        state.L,
        rawBytes
            ? `local s=table.concat(${call}, '\\n'); local bytes={}; for i=1,#s do bytes[i]=string.format('%02x',string.byte(s,i)) end; return table.concat(bytes)`
            : `return table.concat(${call}, '\\n')`,
    );
}
