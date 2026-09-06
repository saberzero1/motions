import { lua, lauxlib, to_jsstring, to_luastring } from '../lib/fengari';
import type { lua_State } from '../lib/fengari';
import type { UndoTree } from '../vim/undo-tree';
import { pushLuaAny } from './api';
import { strftime } from './strftime';
import type { CmAdapter } from '../types/vim-api';
import { getWindowInfo } from './window-info';

export interface VimFnCallbacks {
    getCmAdapter?: () => CmAdapter | null;
    getActiveFilePath: () => string | null;
    fileExists: (path: string) => boolean;
    getVaultFiles: () => string[];
    isDirectory: (path: string) => boolean;
    getMode: () => string;
    getCursorLine: () => number;
    getCursorCol: () => number;
    getLine: (line: number) => string | null;
    getLineCount: () => number;
    getLines: (start: number, end: number) => string[];
    setLines: (start: number, end: number, lines: string[]) => void;
    getPlatform: () => {
        isMacOS: boolean;
        isLinux: boolean;
        isWin: boolean;
        isMobile: boolean;
        isIosApp: boolean;
        isAndroidApp: boolean;
    };
    getObsidianVersion: () => string;
    getGlobal: (name: string) => unknown;
    getOption: (name: string) => unknown;
    getUndoTree?: () => ReturnType<UndoTree['toNeovimDict']> | null;
    getRegisterController?: () => {
        registers: Record<
            string,
            {
                toString(): string;
                setText(
                    text: string,
                    linewise?: boolean,
                    blockwise?: boolean,
                ): void;
                linewise: boolean;
                blockwise: boolean;
            }
        >;
        getRegister?(name: string): {
            toString(): string;
            setText(
                text: string,
                linewise?: boolean,
                blockwise?: boolean,
            ): void;
            linewise: boolean;
            blockwise: boolean;
        };
    } | null;
    setCursor?: (line: number, col: number) => void;
    getMarkPos?: (name: string) => { line: number; ch: number } | null;
    setMark?: (name: string, line: number, ch: number) => void;
    setLine?: (line: number, text: string) => void;
    insertLines?: (afterLine: number, lines: string[]) => void;
    runner?: import('./coroutine-runner').CoroutineRunner;
    waitForKeypress?: () => Promise<string | null>;
    showInputPrompt?: (
        prompt: string,
        defaultText: string,
    ) => Promise<string | null>;
    searchBuffer?: (
        pattern: string,
        flags: string,
        cursorLine: number,
        cursorCol: number,
        stopline: number | null,
    ) => { line: number; col: number } | null;
    getLastVisualMode?: () => string;
    getScrollInfo?: () => { topline: number; leftcol: number } | null;
    setScrollInfo?: (info: { topline: number; leftcol: number }) => void;
    getFoldRange?: (line: number) => { from: number; to: number } | null;
    getShiftwidth?: () => number;
    getKeymaps?: (mode: string) => Array<{
        lhs: string;
        rhs?: string;
        noremap: boolean;
        desc?: string;
        expr?: boolean;
        silent?: boolean;
    }>;
}

type VimFnHandler = (L: lua_State) => number;

function readString(L: lua_State, index: number): string {
    return to_jsstring(lauxlib.luaL_checkstring(L, index));
}

function luaValueToJs(
    L: lua_State,
    index: number,
): string | number | boolean | null {
    if (lua.lua_isnil(L, index)) return null;
    if (lua.lua_isboolean(L, index)) return !!lua.lua_toboolean(L, index);
    if (lua.lua_isnumber(L, index)) return lua.lua_tonumber(L, index);
    if (lua.lua_isstring(L, index)) {
        const val = lua.lua_tolstring(L, index);
        return val ? to_jsstring(val) : '';
    }
    return null;
}

function pushBooleanInt(L: lua_State, value: boolean): number {
    lua.lua_pushnumber(L, value ? 1 : 0);
    return 1;
}

function parseMajorMinor(
    version: string,
): { major: number; minor: number } | null {
    const match = /^(\d+)\.(\d+)/.exec(version);
    if (!match) return null;
    return { major: Number(match[1]), minor: Number(match[2]) };
}

function listSupported(registry: Map<string, VimFnHandler>): string {
    return Array.from(registry.keys()).sort().join(', ');
}

function escapeRegexChar(char: string): string {
    return /[.*+?^${}()|[\]\\]/.test(char) ? `\\${char}` : char;
}

export function simpleGlobMatch(pattern: string, value: string): boolean {
    let regex = '^';
    for (let i = 0; i < pattern.length; i++) {
        const char = pattern.charAt(i);
        if (char === '*') {
            if (pattern.charAt(i + 1) === '*') {
                regex += '.*';
                i++;
            } else {
                regex += '[^/]*';
            }
            continue;
        }
        if (char === '?') {
            regex += '[^/]';
            continue;
        }
        regex += escapeRegexChar(char);
    }
    regex += '$';
    return new RegExp(regex).test(value);
}

function errorUnsupported(
    state: lua_State,
    name: string,
    registry: Map<string, VimFnHandler>,
): never {
    const supported = listSupported(registry);
    lauxlib.luaL_error(
        state,
        to_luastring(
            `vim.fn.${name} is not available. Supported: ${supported}`,
        ),
    );
    throw new Error('unreachable');
}

export function injectVimFn(L: lua_State, callbacks: VimFnCallbacks): void {
    const registry = new Map<string, VimFnHandler>();
    const warnedFns = new Set<string>();
    const warnOnce = (name: string): void => {
        if (warnedFns.has(name)) return;
        warnedFns.add(name);
        console.warn(`Vim Motions: vim.fn.${name} is not implemented`);
    };
    const registerStub = (name: string, handler: VimFnHandler): void => {
        if (!registry.has(name)) registry.set(name, handler);
    };

    registry.set('has', (state) => {
        const featureRaw = readString(state, 1).toLowerCase();
        if (featureRaw === 'obsidian') return pushBooleanInt(state, true);
        if (featureRaw === 'nvim' || featureRaw === 'vim') {
            return pushBooleanInt(state, false);
        }
        if (featureRaw.startsWith('obsidian-')) {
            const required = parseMajorMinor(
                featureRaw.slice('obsidian-'.length),
            );
            const current = parseMajorMinor(callbacks.getObsidianVersion());
            if (!required || !current) return pushBooleanInt(state, false);
            const meets =
                current.major > required.major ||
                (current.major === required.major &&
                    current.minor >= required.minor);
            return pushBooleanInt(state, meets);
        }

        const platform = callbacks.getPlatform();
        switch (featureRaw) {
            case 'mac':
            case 'macunix':
                return pushBooleanInt(state, platform.isMacOS);
            case 'linux':
                return pushBooleanInt(state, platform.isLinux);
            case 'win32':
            case 'win64':
                return pushBooleanInt(state, platform.isWin);
            case 'unix':
                return pushBooleanInt(state, !platform.isWin);
            case 'mobile':
                return pushBooleanInt(state, platform.isMobile);
            case 'desktop':
                return pushBooleanInt(state, !platform.isMobile);
            case 'ios':
                return pushBooleanInt(state, platform.isIosApp);
            case 'android':
                return pushBooleanInt(state, platform.isAndroidApp);
            default:
                return pushBooleanInt(state, false);
        }
    });

    registry.set('expand', (state) => {
        const expr = readString(state, 1);
        if (!expr.startsWith('%')) {
            return lauxlib.luaL_error(
                state,
                to_luastring('expand(): unsupported modifier'),
            );
        }

        const path = callbacks.getActiveFilePath();
        if (!path) {
            lua.lua_pushstring(state, to_luastring(''));
            return 1;
        }

        const lastSlash = path.lastIndexOf('/');
        const filename = lastSlash >= 0 ? path.slice(lastSlash + 1) : path;
        const lastDot = path.lastIndexOf('.');
        const hasExt = lastDot > lastSlash;

        switch (expr) {
            case '%':
            case '%:p':
                lua.lua_pushstring(state, to_luastring(path));
                return 1;
            case '%:t':
                lua.lua_pushstring(state, to_luastring(filename));
                return 1;
            case '%:e': {
                const ext = hasExt ? path.slice(lastDot + 1) : '';
                lua.lua_pushstring(state, to_luastring(ext));
                return 1;
            }
            case '%:r': {
                const root = hasExt ? path.slice(0, lastDot) : path;
                lua.lua_pushstring(state, to_luastring(root));
                return 1;
            }
            default:
                return lauxlib.luaL_error(
                    state,
                    to_luastring('expand(): unsupported modifier'),
                );
        }
    });

    registry.set('exists', (state) => {
        const expr = readString(state, 1);
        if (expr.startsWith('g:')) {
            const name = expr.slice(2);
            return pushBooleanInt(
                state,
                callbacks.getGlobal(name) !== undefined,
            );
        }
        if (expr.startsWith('&')) {
            const name = expr.slice(1);
            return pushBooleanInt(
                state,
                callbacks.getOption(name) !== undefined,
            );
        }
        if (expr.startsWith('*')) {
            const name = expr.slice(1);
            return pushBooleanInt(state, registry.has(name));
        }
        return pushBooleanInt(state, false);
    });

    registry.set('undotree', (state) => {
        const dict = callbacks.getUndoTree?.();
        if (!dict) {
            lua.lua_newtable(state);
            return 1;
        }
        pushLuaAny(state, dict);
        return 1;
    });

    registry.set('localtime', (state) => {
        lua.lua_pushnumber(state, Math.floor(Date.now() / 1000));
        return 1;
    });

    registry.set('strftime', (state) => {
        const format = readString(state, 1);
        let date = new Date();
        if (lua.lua_isnumber(state, 2)) {
            const seconds = lua.lua_tonumber(state, 2);
            date = new Date(Math.floor(seconds) * 1000);
        }
        const value = strftime(format, date);
        lua.lua_pushstring(state, to_luastring(value));
        return 1;
    });

    registry.set('filereadable', (state) => {
        const path = readString(state, 1);
        if (path.includes('..') || path.startsWith('/')) {
            return pushBooleanInt(state, false);
        }
        return pushBooleanInt(state, callbacks.fileExists(path));
    });

    registry.set('fnamemodify', (state) => {
        const path = readString(state, 1);
        const mods = readString(state, 2);
        let result = path;
        const tokens = mods.split(':').filter(Boolean);
        for (const token of tokens) {
            if (token === 'p') {
                continue;
            }
            if (token === 't') {
                const lastSlash = result.lastIndexOf('/');
                result = lastSlash >= 0 ? result.slice(lastSlash + 1) : result;
                continue;
            }
            if (token === 'h') {
                const lastSlash = result.lastIndexOf('/');
                if (lastSlash <= 0) {
                    result = '.';
                } else {
                    result = result.slice(0, lastSlash);
                }
                continue;
            }
            if (token === 'r') {
                const lastSlash = result.lastIndexOf('/');
                const lastDot = result.lastIndexOf('.');
                const hasExt = lastDot > lastSlash;
                result = hasExt ? result.slice(0, lastDot) : result;
                continue;
            }
            if (token === 'e') {
                const lastSlash = result.lastIndexOf('/');
                const lastDot = result.lastIndexOf('.');
                const hasExt = lastDot > lastSlash;
                result = hasExt ? result.slice(lastDot + 1) : '';
                continue;
            }
        }
        lua.lua_pushstring(state, to_luastring(result));
        return 1;
    });

    registry.set('glob', (state) => {
        const pattern = readString(state, 1);
        if (pattern.includes('..') || pattern.startsWith('/')) {
            lua.lua_pushstring(state, to_luastring(''));
            return 1;
        }
        const files = callbacks.getVaultFiles();
        const matched = files.filter((file) => simpleGlobMatch(pattern, file));
        lua.lua_pushstring(state, to_luastring(matched.join('\n')));
        return 1;
    });

    registry.set('isdirectory', (state) => {
        const path = readString(state, 1);
        if (path.includes('..') || path.startsWith('/')) {
            return pushBooleanInt(state, false);
        }
        return pushBooleanInt(state, callbacks.isDirectory(path));
    });

    registry.set('mode', (state) => {
        const mode = callbacks.getMode();
        lua.lua_pushstring(state, to_luastring(mode));
        return 1;
    });

    registry.set('line', (state) => {
        const expr = readString(state, 1);
        if (expr === '.') {
            lua.lua_pushnumber(state, callbacks.getCursorLine());
            return 1;
        }
        if (expr === '$') {
            lua.lua_pushnumber(state, 0);
            return 1;
        }
        lua.lua_pushnumber(state, 0);
        return 1;
    });

    registry.set('col', (state) => {
        const expr = readString(state, 1);
        if (expr === '.') {
            lua.lua_pushnumber(state, callbacks.getCursorCol());
            return 1;
        }
        lua.lua_pushnumber(state, 0);
        return 1;
    });

    registry.set('getline', (state) => {
        const arg = readString(state, 1);
        if (arg === '.') {
            const lineNum = callbacks.getCursorLine();
            if (lineNum === 0) {
                lua.lua_pushstring(state, to_luastring(''));
                return 1;
            }
            const text = callbacks.getLine(lineNum - 1);
            lua.lua_pushstring(state, to_luastring(text ?? ''));
            return 1;
        }
        const num = Number(arg);
        if (!isNaN(num) && num >= 1) {
            const text = callbacks.getLine(num - 1);
            lua.lua_pushstring(state, to_luastring(text ?? ''));
            return 1;
        }
        lua.lua_pushstring(state, to_luastring(''));
        return 1;
    });

    registry.set('tolower', (state) => {
        const s = readString(state, 1);
        lua.lua_pushstring(state, to_luastring(s.toLowerCase()));
        return 1;
    });

    registry.set('toupper', (state) => {
        const s = readString(state, 1);
        lua.lua_pushstring(state, to_luastring(s.toUpperCase()));
        return 1;
    });

    registry.set('trim', (state) => {
        const s = readString(state, 1);
        lua.lua_pushstring(state, to_luastring(s.trim()));
        return 1;
    });

    registry.set('strlen', (state) => {
        const s = readString(state, 1);
        lua.lua_pushnumber(state, s.length);
        return 1;
    });

    registry.set('strwidth', (state) => {
        const s = readString(state, 1);
        lua.lua_pushnumber(state, s.length);
        return 1;
    });

    registry.set('stridx', (state) => {
        const haystack = readString(state, 1);
        const needle = readString(state, 2);
        lua.lua_pushnumber(state, haystack.indexOf(needle));
        return 1;
    });

    registry.set('strridx', (state) => {
        const haystack = readString(state, 1);
        const needle = readString(state, 2);
        lua.lua_pushnumber(state, haystack.lastIndexOf(needle));
        return 1;
    });

    registry.set('strpart', (state) => {
        const s = readString(state, 1);
        const start = lua.lua_tonumber(state, 2);
        const len = lua.lua_isnumber(state, 3)
            ? lua.lua_tonumber(state, 3)
            : undefined;
        const result =
            len !== undefined
                ? s.substring(start, start + len)
                : s.substring(start);
        lua.lua_pushstring(state, to_luastring(result));
        return 1;
    });

    registry.set('substitute', (state) => {
        const s = readString(state, 1);
        const pat = readString(state, 2);
        const sub = readString(state, 3);
        const flags = readString(state, 4);
        try {
            const re = new RegExp(pat, flags.includes('g') ? 'g' : '');
            lua.lua_pushstring(state, to_luastring(s.replace(re, sub)));
        } catch {
            lua.lua_pushstring(state, to_luastring(s));
        }
        return 1;
    });

    registry.set('nr2char', (state) => {
        const n = lua.lua_tonumber(state, 1);
        lua.lua_pushstring(state, to_luastring(String.fromCharCode(n)));
        return 1;
    });

    registry.set('char2nr', (state) => {
        const s = readString(state, 1);
        lua.lua_pushnumber(state, s.length > 0 ? s.charCodeAt(0) : 0);
        return 1;
    });

    registry.set('getreg', (state) => {
        const rc = callbacks.getRegisterController?.();
        if (!rc) {
            lua.lua_pushstring(state, to_luastring(''));
            return 1;
        }
        const name = lua.lua_isstring(state, 1)
            ? to_jsstring(lauxlib.luaL_checkstring(state, 1))
            : '"';
        const reg = rc.registers[name];
        lua.lua_pushstring(state, to_luastring(reg ? reg.toString() : ''));
        return 1;
    });

    registry.set('setreg', (state) => {
        const rc = callbacks.getRegisterController?.();
        if (!rc) return 0;
        const name = readString(state, 1);
        const value = readString(state, 2);
        const opts = lua.lua_isstring(state, 3)
            ? to_jsstring(lauxlib.luaL_checkstring(state, 3))
            : '';
        const linewise = opts.includes('l') || opts.includes('V');
        const blockwise = opts.includes('b') || opts.includes('\x16');
        const reg = rc.getRegister?.(name) ?? rc.registers[name];
        if (reg) {
            reg.setText(value, linewise, blockwise);
        }
        return 0;
    });

    // --- Register type ---

    registry.set('getregtype', (state) => {
        const rc = callbacks.getRegisterController?.();
        if (!rc) {
            lua.lua_pushstring(state, to_luastring('v'));
            return 1;
        }
        const name = lua.lua_isstring(state, 1)
            ? to_jsstring(lauxlib.luaL_checkstring(state, 1))
            : '"';
        const reg = rc.registers[name];
        if (!reg) {
            lua.lua_pushstring(state, to_luastring('v'));
            return 1;
        }
        const type = reg.blockwise ? '\x16' : reg.linewise ? 'V' : 'v';
        lua.lua_pushstring(state, to_luastring(type));
        return 1;
    });

    // --- Buffer modification ---

    registry.set('setline', (state) => {
        const lnum = lua.lua_tonumber(state, 1);
        const text = readString(state, 2);
        callbacks.setLine?.(lnum - 1, text);
        return 0;
    });

    registry.set('append', (state) => {
        const lnum = lua.lua_tonumber(state, 1);
        if (lua.lua_istable(state, 2)) {
            const lines: string[] = [];
            for (let i = 1; ; i++) {
                lua.lua_rawgeti(state, 2, i);
                if (lua.lua_isnil(state, -1)) {
                    lua.lua_pop(state, 1);
                    break;
                }
                if (lua.lua_isstring(state, -1)) {
                    const val = lua.lua_tolstring(state, -1);
                    if (val) lines.push(to_jsstring(val));
                } else if (lua.lua_isnumber(state, -1)) {
                    lines.push(String(lua.lua_tonumber(state, -1)));
                }
                lua.lua_pop(state, 1);
            }
            callbacks.insertLines?.(lnum, lines);
        } else {
            const text = readString(state, 2);
            callbacks.insertLines?.(lnum, [text]);
        }
        return 0;
    });

    registry.set('indent', (state) => {
        const lnum = lua.lua_tonumber(state, 1);
        const text = callbacks.getLine(lnum - 1);
        if (!text) {
            lua.lua_pushnumber(state, 0);
            return 1;
        }
        const match = /^(\s*)/.exec(text);
        let indent = 0;
        if (match) {
            for (const ch of match[1]!) {
                indent += ch === '\t' ? 8 : 1;
            }
        }
        lua.lua_pushnumber(state, indent);
        return 1;
    });

    // --- Position/cursor functions ---

    registry.set('nextnonblank', (state) => {
        const lnum = lua.lua_tonumber(state, 1);
        const lineCount = callbacks.getLineCount();
        for (let i = lnum - 1; i < lineCount; i++) {
            const text = callbacks.getLine(i);
            if (text !== null && text.trim().length > 0) {
                lua.lua_pushnumber(state, i + 1);
                return 1;
            }
        }
        lua.lua_pushnumber(state, 0);
        return 1;
    });

    registry.set('prevnonblank', (state) => {
        const lnum = lua.lua_tonumber(state, 1);
        for (let i = lnum - 1; i >= 0; i--) {
            const text = callbacks.getLine(i);
            if (text !== null && text.trim().length > 0) {
                lua.lua_pushnumber(state, i + 1);
                return 1;
            }
        }
        lua.lua_pushnumber(state, 0);
        return 1;
    });

    registry.set('getpos', (state) => {
        const expr = readString(state, 1);
        lua.lua_newtable(state);
        lua.lua_pushnumber(state, 0);
        lua.lua_rawseti(state, -2, 1);

        let line = 0;
        let col = 0;
        if (expr === '.') {
            line = callbacks.getCursorLine();
            col = callbacks.getCursorCol();
        } else if (expr.startsWith("'")) {
            const markName = expr.substring(1);
            const pos = callbacks.getMarkPos?.(markName);
            if (pos) {
                line = pos.line + 1;
                col = pos.ch + 1;
            }
        }

        lua.lua_pushnumber(state, line);
        lua.lua_rawseti(state, -2, 2);
        lua.lua_pushnumber(state, col);
        lua.lua_rawseti(state, -2, 3);
        lua.lua_pushnumber(state, 0);
        lua.lua_rawseti(state, -2, 4);
        return 1;
    });

    registry.set('setpos', (state) => {
        const expr = readString(state, 1);
        if (!lua.lua_istable(state, 2)) return 0;
        lua.lua_rawgeti(state, 2, 2);
        const lnum = lua.lua_tonumber(state, -1);
        lua.lua_pop(state, 1);
        lua.lua_rawgeti(state, 2, 3);
        const col = lua.lua_tonumber(state, -1);
        lua.lua_pop(state, 1);

        if (expr === '.') {
            callbacks.setCursor?.(lnum - 1, col - 1);
        } else if (expr.startsWith("'")) {
            const markName = expr.substring(1);
            callbacks.setMark?.(markName, lnum - 1, col - 1);
        }
        return 0;
    });

    registry.set('cursor', (state) => {
        const lnum = lua.lua_tonumber(state, 1);
        const col = lua.lua_tonumber(state, 2);
        callbacks.setCursor?.(lnum - 1, col - 1);
        return 0;
    });

    registry.set('getcurpos', (state) => {
        lua.lua_newtable(state);

        lua.lua_pushnumber(state, 0);
        lua.lua_rawseti(state, -2, 1);
        lua.lua_pushnumber(state, callbacks.getCursorLine());
        lua.lua_rawseti(state, -2, 2);
        lua.lua_pushnumber(state, callbacks.getCursorCol());
        lua.lua_rawseti(state, -2, 3);
        lua.lua_pushnumber(state, 0);
        lua.lua_rawseti(state, -2, 4);
        lua.lua_pushnumber(state, callbacks.getCursorCol());
        lua.lua_rawseti(state, -2, 5);
        return 1;
    });

    // --- Type/introspection ---

    // Neovim type numbers: 0=number, 1=string, 2=funcref, 3=list, 4=dict, 5=float, 6=bool, 7=special
    registry.set('type', (state) => {
        let vimType: number;
        if (lua.lua_isnumber(state, 1)) {
            vimType = Number.isInteger(lua.lua_tonumber(state, 1)) ? 0 : 5;
        } else if (lua.lua_isstring(state, 1)) {
            vimType = 1;
        } else if (lua.lua_isfunction(state, 1)) {
            vimType = 2;
        } else if (lua.lua_istable(state, 1)) {
            lua.lua_rawgeti(state, 1, 1);
            vimType = lua.lua_isnil(state, -1) ? 4 : 3;
            lua.lua_pop(state, 1);
        } else if (lua.lua_isboolean(state, 1)) {
            vimType = 6;
        } else {
            vimType = 7;
        }
        lua.lua_pushnumber(state, vimType);
        return 1;
    });

    registry.set('len', (state) => {
        if (lua.lua_isstring(state, 1)) {
            const s = to_jsstring(lauxlib.luaL_checkstring(state, 1));
            lua.lua_pushnumber(state, s.length);
        } else if (lua.lua_istable(state, 1)) {
            lua.lua_pushnumber(state, lauxlib.luaL_len(state, 1));
        } else {
            lua.lua_pushnumber(state, 0);
        }
        return 1;
    });

    registry.set('empty', (state) => {
        let isEmpty: boolean;
        if (lua.lua_isstring(state, 1)) {
            isEmpty =
                to_jsstring(lauxlib.luaL_checkstring(state, 1)).length === 0;
        } else if (lua.lua_istable(state, 1)) {
            isEmpty = lauxlib.luaL_len(state, 1) === 0;
        } else if (lua.lua_isnumber(state, 1)) {
            isEmpty = lua.lua_tonumber(state, 1) === 0;
        } else if (lua.lua_isboolean(state, 1)) {
            isEmpty = !lua.lua_toboolean(state, 1);
        } else {
            isEmpty = true;
        }
        lua.lua_pushnumber(state, isEmpty ? 1 : 0);
        return 1;
    });

    // --- String pattern matching ---

    registry.set('matchstr', (state) => {
        const s = readString(state, 1);
        const pat = readString(state, 2);
        try {
            const re = new RegExp(pat);
            const m = re.exec(s);
            lua.lua_pushstring(state, to_luastring(m ? m[0] : ''));
        } catch {
            lua.lua_pushstring(state, to_luastring(''));
        }
        return 1;
    });

    registry.set('match', (state) => {
        const s = readString(state, 1);
        const pat = readString(state, 2);
        const start = lua.lua_isnumber(state, 3)
            ? lua.lua_tonumber(state, 3)
            : 0;
        try {
            const re = new RegExp(pat);
            const m = re.exec(s.substring(start));
            lua.lua_pushnumber(state, m ? m.index + start : -1);
        } catch {
            lua.lua_pushnumber(state, -1);
        }
        return 1;
    });

    registry.set('matchlist', (state) => {
        const s = readString(state, 1);
        const pat = readString(state, 2);
        lua.lua_newtable(state);
        try {
            const re = new RegExp(pat);
            const m = re.exec(s);
            if (m) {
                for (let i = 0; i < Math.max(m.length, 10); i++) {
                    lua.lua_pushstring(state, to_luastring(m[i] ?? ''));
                    lua.lua_rawseti(state, -2, i + 1);
                }
            }
        } catch {
            /* invalid regex — return empty table */
        }
        return 1;
    });

    registry.set('escape', (state) => {
        const s = readString(state, 1);
        const chars = readString(state, 2);
        let result = '';
        for (const ch of s) {
            if (chars.includes(ch)) {
                result += '\\' + ch;
            } else {
                result += ch;
            }
        }
        lua.lua_pushstring(state, to_luastring(result));
        return 1;
    });

    // --- String/list utilities ---

    registry.set('repeat', (state) => {
        if (lua.lua_isstring(state, 1)) {
            const s = readString(state, 1);
            const count = lua.lua_tonumber(state, 2);
            lua.lua_pushstring(
                state,
                to_luastring(s.repeat(Math.max(0, count))),
            );
        } else if (lua.lua_istable(state, 1)) {
            const count = lua.lua_tonumber(state, 2);
            lua.lua_newtable(state);
            let idx = 1;
            for (let c = 0; c < count; c++) {
                for (let i = 1; ; i++) {
                    lua.lua_rawgeti(state, 1, i);
                    if (lua.lua_isnil(state, -1)) {
                        lua.lua_pop(state, 1);
                        break;
                    }
                    lua.lua_rawseti(state, -2, idx++);
                }
            }
        } else {
            lua.lua_pushstring(state, to_luastring(''));
        }
        return 1;
    });

    registry.set('reverse', (state) => {
        if (lua.lua_isstring(state, 1)) {
            const s = readString(state, 1);
            lua.lua_pushstring(state, to_luastring([...s].reverse().join('')));
        } else if (lua.lua_istable(state, 1)) {
            const items: number[] = [];
            for (let i = 1; ; i++) {
                lua.lua_rawgeti(state, 1, i);
                if (lua.lua_isnil(state, -1)) {
                    lua.lua_pop(state, 1);
                    break;
                }
                items.push(i);
                lua.lua_pop(state, 1);
            }

            for (let i = 0; i < Math.floor(items.length / 2); i++) {
                const j = items.length - 1 - i;
                lua.lua_rawgeti(state, 1, i + 1);
                lua.lua_rawgeti(state, 1, j + 1);
                lua.lua_rawseti(state, 1, i + 1);
                lua.lua_rawseti(state, 1, j + 1);
            }
            lua.lua_pushvalue(state, 1);
        } else {
            lua.lua_pushvalue(state, 1);
        }
        return 1;
    });

    registry.set('range', (state) => {
        const start = lua.lua_tonumber(state, 1);
        const end = lua.lua_isnumber(state, 2)
            ? lua.lua_tonumber(state, 2)
            : undefined;
        const stride = lua.lua_isnumber(state, 3)
            ? lua.lua_tonumber(state, 3)
            : 1;
        lua.lua_newtable(state);
        if (end === undefined) {
            // range(n) → {0, 1, ..., n-1} (Neovim convention)
            for (let i = 0; i < start; i++) {
                lua.lua_pushnumber(state, i);
                lua.lua_rawseti(state, -2, i + 1);
            }
        } else {
            let idx = 1;
            if (stride > 0) {
                for (let i = start; i <= end; i += stride) {
                    lua.lua_pushnumber(state, i);
                    lua.lua_rawseti(state, -2, idx++);
                }
            } else if (stride < 0) {
                for (let i = start; i >= end; i += stride) {
                    lua.lua_pushnumber(state, i);
                    lua.lua_rawseti(state, -2, idx++);
                }
            }
        }
        return 1;
    });

    registry.set('sort', (state) => {
        if (!lua.lua_istable(state, 1)) {
            lua.lua_pushvalue(state, 1);
            return 1;
        }
        const items: string[] = [];
        for (let i = 1; ; i++) {
            lua.lua_rawgeti(state, 1, i);
            if (lua.lua_isnil(state, -1)) {
                lua.lua_pop(state, 1);
                break;
            }
            if (lua.lua_isstring(state, -1)) {
                items.push(to_jsstring(lauxlib.luaL_checkstring(state, -1)));
            } else if (lua.lua_isnumber(state, -1)) {
                items.push(String(lua.lua_tonumber(state, -1)));
            }
            lua.lua_pop(state, 1);
        }
        items.sort();

        for (let i = 0; i < items.length; i++) {
            lua.lua_pushstring(state, to_luastring(items[i]!));
            lua.lua_rawseti(state, 1, i + 1);
        }
        lua.lua_pushvalue(state, 1);
        return 1;
    });

    registry.set('uniq', (state) => {
        if (!lua.lua_istable(state, 1)) {
            lua.lua_pushvalue(state, 1);
            return 1;
        }
        const items: string[] = [];
        for (let i = 1; ; i++) {
            lua.lua_rawgeti(state, 1, i);
            if (lua.lua_isnil(state, -1)) {
                lua.lua_pop(state, 1);
                break;
            }
            if (lua.lua_isstring(state, -1)) {
                items.push(to_jsstring(lauxlib.luaL_checkstring(state, -1)));
            } else if (lua.lua_isnumber(state, -1)) {
                items.push(String(lua.lua_tonumber(state, -1)));
            }
            lua.lua_pop(state, 1);
        }
        // Remove consecutive duplicates (Neovim semantics — requires sorted input)
        const unique = items.filter((v, i) => i === 0 || v !== items[i - 1]);

        for (let i = 0; i < unique.length; i++) {
            lua.lua_pushstring(state, to_luastring(unique[i]!));
            lua.lua_rawseti(state, 1, i + 1);
        }

        for (let i = unique.length + 1; i <= items.length; i++) {
            lua.lua_pushnil(state);
            lua.lua_rawseti(state, 1, i);
        }
        lua.lua_pushvalue(state, 1);
        return 1;
    });

    registry.set('max', (state) => {
        if (!lua.lua_istable(state, 1)) {
            lua.lua_pushnumber(state, 0);
            return 1;
        }
        let result = -Infinity;
        for (let i = 1; ; i++) {
            lua.lua_rawgeti(state, 1, i);
            if (lua.lua_isnil(state, -1)) {
                lua.lua_pop(state, 1);
                break;
            }
            if (lua.lua_isnumber(state, -1)) {
                result = Math.max(result, lua.lua_tonumber(state, -1));
            }
            lua.lua_pop(state, 1);
        }
        lua.lua_pushnumber(state, result === -Infinity ? 0 : result);
        return 1;
    });

    registry.set('min', (state) => {
        if (!lua.lua_istable(state, 1)) {
            lua.lua_pushnumber(state, 0);
            return 1;
        }
        let result = Infinity;
        for (let i = 1; ; i++) {
            lua.lua_rawgeti(state, 1, i);
            if (lua.lua_isnil(state, -1)) {
                lua.lua_pop(state, 1);
                break;
            }
            if (lua.lua_isnumber(state, -1)) {
                result = Math.min(result, lua.lua_tonumber(state, -1));
            }
            lua.lua_pop(state, 1);
        }
        lua.lua_pushnumber(state, result === Infinity ? 0 : result);
        return 1;
    });

    registry.set('abs', (state) => {
        lua.lua_pushnumber(state, Math.abs(lua.lua_tonumber(state, 1)));
        return 1;
    });

    registry.set('index', (state) => {
        if (!lua.lua_istable(state, 1)) {
            lua.lua_pushnumber(state, -1);
            return 1;
        }
        const needle = luaValueToJs(state, 2);
        for (let i = 1; ; i++) {
            lua.lua_rawgeti(state, 1, i);
            if (lua.lua_isnil(state, -1)) {
                lua.lua_pop(state, 1);
                break;
            }
            if (luaValueToJs(state, -1) === needle) {
                lua.lua_pop(state, 1);
                lua.lua_pushnumber(state, i - 1);
                return 1;
            }
            lua.lua_pop(state, 1);
        }
        lua.lua_pushnumber(state, -1);
        return 1;
    });

    registry.set('count', (state) => {
        if (!lua.lua_istable(state, 1)) {
            lua.lua_pushnumber(state, 0);
            return 1;
        }
        const needle = luaValueToJs(state, 2);
        let n = 0;
        for (let i = 1; ; i++) {
            lua.lua_rawgeti(state, 1, i);
            if (lua.lua_isnil(state, -1)) {
                lua.lua_pop(state, 1);
                break;
            }
            if (luaValueToJs(state, -1) === needle) {
                n++;
            }
            lua.lua_pop(state, 1);
        }
        lua.lua_pushnumber(state, n);
        return 1;
    });

    // --- List/dict operations (syntactic sugar over Lua builtins) ---

    registry.set('add', (state) => {
        if (!lua.lua_istable(state, 1)) {
            lua.lua_pushvalue(state, 1);
            return 1;
        }
        const len = lauxlib.luaL_len(state, 1);
        lua.lua_pushvalue(state, 2);
        lua.lua_rawseti(state, 1, len + 1);
        lua.lua_pushvalue(state, 1);
        return 1;
    });

    registry.set('remove', (state) => {
        if (!lua.lua_istable(state, 1)) {
            lua.lua_pushnumber(state, 0);
            return 1;
        }
        const idx = lua.lua_isnumber(state, 2)
            ? lua.lua_tonumber(state, 2)
            : -1;
        const len = lauxlib.luaL_len(state, 1);
        const luaIdx = idx < 0 ? len : idx + 1;
        if (luaIdx < 1 || luaIdx > len) {
            lua.lua_pushnumber(state, 0);
            return 1;
        }
        lua.lua_rawgeti(state, 1, luaIdx);
        for (let i = luaIdx; i < len; i++) {
            lua.lua_rawgeti(state, 1, i + 1);
            lua.lua_rawseti(state, 1, i);
        }
        lua.lua_pushnil(state);
        lua.lua_rawseti(state, 1, len);
        return 1;
    });

    registry.set('extend', (state) => {
        if (!lua.lua_istable(state, 1) || !lua.lua_istable(state, 2)) {
            lua.lua_pushvalue(state, 1);
            return 1;
        }
        const len1 = lauxlib.luaL_len(state, 1);
        const len2 = lauxlib.luaL_len(state, 2);
        for (let i = 1; i <= len2; i++) {
            lua.lua_rawgeti(state, 2, i);
            lua.lua_rawseti(state, 1, len1 + i);
        }
        lua.lua_pushvalue(state, 1);
        return 1;
    });

    registry.set('copy', (state) => {
        if (!lua.lua_istable(state, 1)) {
            lua.lua_pushvalue(state, 1);
            return 1;
        }
        lua.lua_newtable(state);
        const len = lauxlib.luaL_len(state, 1);
        if (len > 0) {
            for (let i = 1; i <= len; i++) {
                lua.lua_rawgeti(state, 1, i);
                lua.lua_rawseti(state, -2, i);
            }
        } else {
            lua.lua_pushnil(state);
            while (lua.lua_next(state, 1)) {
                if (lua.lua_isstring(state, -2)) {
                    const key = lua.lua_tolstring(state, -2);
                    if (key) {
                        lua.lua_setfield(state, -3, key);
                    } else {
                        lua.lua_pop(state, 1);
                    }
                } else {
                    lua.lua_pop(state, 1);
                }
            }
        }
        return 1;
    });

    registry.set('deepcopy', (state) => {
        if (!lua.lua_istable(state, 1)) {
            lua.lua_pushvalue(state, 1);
            return 1;
        }
        lauxlib.luaL_dostring(state, to_luastring('return vim.deepcopy(...)'));
        lua.lua_pushvalue(state, 1);
        lua.lua_pcall(state, 1, 1, 0);
        return 1;
    });

    registry.set('keys', (state) => {
        if (!lua.lua_istable(state, 1)) {
            lua.lua_newtable(state);
            return 1;
        }
        lua.lua_newtable(state);
        let idx = 1;
        lua.lua_pushnil(state);
        while (lua.lua_next(state, 1)) {
            lua.lua_pop(state, 1);
            lua.lua_pushvalue(state, -1);
            lua.lua_rawseti(state, -3, idx++);
        }
        return 1;
    });

    registry.set('values', (state) => {
        if (!lua.lua_istable(state, 1)) {
            lua.lua_newtable(state);
            return 1;
        }
        lua.lua_newtable(state);
        let idx = 1;
        lua.lua_pushnil(state);
        while (lua.lua_next(state, 1)) {
            lua.lua_rawseti(state, -3, idx++);
        }
        return 1;
    });

    registry.set('items', (state) => {
        if (!lua.lua_istable(state, 1)) {
            lua.lua_newtable(state);
            return 1;
        }
        lua.lua_newtable(state);
        let idx = 1;
        lua.lua_pushnil(state);
        while (lua.lua_next(state, 1)) {
            lua.lua_newtable(state);
            lua.lua_pushvalue(state, -3);
            lua.lua_rawseti(state, -2, 1);
            lua.lua_pushvalue(state, -2);
            lua.lua_rawseti(state, -2, 2);
            lua.lua_rawseti(state, -4, idx++);
            lua.lua_pop(state, 1);
        }
        return 1;
    });

    registry.set('flatten', (state) => {
        if (!lua.lua_istable(state, 1)) {
            lua.lua_pushvalue(state, 1);
            return 1;
        }
        lua.lua_newtable(state);
        let outIdx = 1;
        const flattenTable = (tableIdx: number) => {
            for (let i = 1; ; i++) {
                lua.lua_rawgeti(state, tableIdx, i);
                if (lua.lua_isnil(state, -1)) {
                    lua.lua_pop(state, 1);
                    break;
                }
                if (lua.lua_istable(state, -1)) {
                    const nested = lua.lua_gettop(state);
                    flattenTable(nested);
                    lua.lua_pop(state, 1);
                } else {
                    lua.lua_rawseti(state, -2, outIdx++);
                }
            }
        };
        flattenTable(1);
        return 1;
    });

    registry.set('split', (state) => {
        const s = readString(state, 1);
        const sep = lua.lua_isstring(state, 2)
            ? to_jsstring(lauxlib.luaL_checkstring(state, 2))
            : '\\s\\+';
        let parts: string[];
        try {
            const re = new RegExp(sep);
            parts = s.split(re);
        } catch {
            parts = [s];
        }
        lua.lua_newtable(state);
        for (let i = 0; i < parts.length; i++) {
            lua.lua_pushstring(state, to_luastring(parts[i]!));
            lua.lua_rawseti(state, -2, i + 1);
        }
        return 1;
    });

    registry.set('join', (state) => {
        if (!lua.lua_istable(state, 1)) {
            lua.lua_pushstring(state, to_luastring(''));
            return 1;
        }
        const sep = lua.lua_isstring(state, 2)
            ? to_jsstring(lauxlib.luaL_checkstring(state, 2))
            : ' ';
        const parts: string[] = [];
        for (let i = 1; ; i++) {
            lua.lua_rawgeti(state, 1, i);
            if (lua.lua_isnil(state, -1)) {
                lua.lua_pop(state, 1);
                break;
            }
            if (lua.lua_isstring(state, -1)) {
                const val = lua.lua_tolstring(state, -1);
                if (val) parts.push(to_jsstring(val));
            } else if (lua.lua_isnumber(state, -1)) {
                parts.push(String(lua.lua_tonumber(state, -1)));
            }
            lua.lua_pop(state, 1);
        }
        lua.lua_pushstring(state, to_luastring(parts.join(sep)));
        return 1;
    });

    registry.set('visualmode', (state) => {
        const mode = callbacks.getLastVisualMode?.() ?? '';
        lua.lua_pushstring(state, to_luastring(mode));
        return 1;
    });

    registry.set('winsaveview', (state) => {
        const line = callbacks.getCursorLine();
        const col = callbacks.getCursorCol() - 1;
        const scroll = callbacks.getScrollInfo?.() ?? {
            topline: 1,
            leftcol: 0,
        };
        lua.lua_newtable(state);
        const t = lua.lua_gettop(state);
        lua.lua_pushnumber(state, line);
        lua.lua_setfield(state, t, to_luastring('lnum'));
        lua.lua_pushnumber(state, Math.max(0, col));
        lua.lua_setfield(state, t, to_luastring('col'));
        lua.lua_pushnumber(state, 0);
        lua.lua_setfield(state, t, to_luastring('coladd'));
        lua.lua_pushnumber(state, Math.max(0, col));
        lua.lua_setfield(state, t, to_luastring('curswant'));
        lua.lua_pushnumber(state, scroll.topline);
        lua.lua_setfield(state, t, to_luastring('topline'));
        lua.lua_pushnumber(state, scroll.leftcol);
        lua.lua_setfield(state, t, to_luastring('leftcol'));
        return 1;
    });

    registry.set('winrestview', (state) => {
        if (!lua.lua_istable(state, 1)) return 0;
        lua.lua_getfield(state, 1, to_luastring('lnum'));
        const lnum = lua.lua_isnumber(state, -1)
            ? lua.lua_tonumber(state, -1)
            : null;
        lua.lua_pop(state, 1);
        lua.lua_getfield(state, 1, to_luastring('col'));
        const col = lua.lua_isnumber(state, -1)
            ? lua.lua_tonumber(state, -1)
            : null;
        lua.lua_pop(state, 1);
        if (lnum !== null && col !== null) {
            callbacks.setCursor?.(lnum - 1, col);
        }
        lua.lua_getfield(state, 1, to_luastring('topline'));
        const topline = lua.lua_isnumber(state, -1)
            ? lua.lua_tonumber(state, -1)
            : null;
        lua.lua_pop(state, 1);
        lua.lua_getfield(state, 1, to_luastring('leftcol'));
        const leftcol = lua.lua_isnumber(state, -1)
            ? lua.lua_tonumber(state, -1)
            : null;
        lua.lua_pop(state, 1);
        if (topline !== null || leftcol !== null) {
            callbacks.setScrollInfo?.({
                topline: topline ?? 1,
                leftcol: leftcol ?? 0,
            });
        }
        return 0;
    });

    registry.set('foldclosed', (state) => {
        const lnum = lua.lua_tonumber(state, 1);
        const range = callbacks.getFoldRange?.(lnum - 1);
        lua.lua_pushnumber(state, range ? range.from + 1 : -1);
        return 1;
    });

    registry.set('foldclosedend', (state) => {
        const lnum = lua.lua_tonumber(state, 1);
        const range = callbacks.getFoldRange?.(lnum - 1);
        lua.lua_pushnumber(state, range ? range.to + 1 : -1);
        return 1;
    });

    registry.set('shiftwidth', (state) => {
        const sw = callbacks.getShiftwidth?.() ?? 4;
        lua.lua_pushnumber(state, sw);
        return 1;
    });

    registry.set('strdisplaywidth', (state) => {
        const s = readString(state, 1);
        let width = 0;
        for (const ch of s) {
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
            } else if (ch === '\t') {
                const tabstop =
                    (callbacks.getOption?.('tabstop') as number) ?? 8;
                width += tabstop - (width % tabstop);
            } else {
                width += 1;
            }
        }
        lua.lua_pushnumber(state, width);
        return 1;
    });

    registry.set('strcharpart', (state) => {
        const s = readString(state, 1);
        const start = lua.lua_tonumber(state, 2);
        const chars = [...s];
        const hasLen = lua.lua_isnumber(state, 3);
        const len = hasLen ? lua.lua_tonumber(state, 3) : chars.length;
        const actualStart = Math.max(0, start);
        const actualLen = Math.max(0, len - Math.max(0, -start));
        const result = chars
            .slice(actualStart, actualStart + actualLen)
            .join('');
        lua.lua_pushstring(state, to_luastring(result));
        return 1;
    });

    registry.set('maparg', (state) => {
        const name = readString(state, 1);
        const mode = lua.lua_isstring(state, 2) ? readString(state, 2) : '';
        const dict = lua.lua_isnumber(state, 4)
            ? lua.lua_tonumber(state, 4)
            : 0;
        const mappings =
            callbacks.getKeymaps?.(mode === '' ? 'normal' : mode) ?? [];
        const found = mappings.find((m) => m.lhs === name);
        if (!found) {
            if (dict === 1) {
                lua.lua_newtable(state);
            } else {
                lua.lua_pushstring(state, to_luastring(''));
            }
            return 1;
        }
        if (dict === 1) {
            lua.lua_newtable(state);
            const t = lua.lua_gettop(state);
            lua.lua_pushstring(state, to_luastring(found.lhs));
            lua.lua_setfield(state, t, to_luastring('lhs'));
            lua.lua_pushstring(state, to_luastring(found.rhs ?? ''));
            lua.lua_setfield(state, t, to_luastring('rhs'));
            lua.lua_pushnumber(state, found.noremap ? 1 : 0);
            lua.lua_setfield(state, t, to_luastring('noremap'));
            lua.lua_pushnumber(state, found.silent ? 1 : 0);
            lua.lua_setfield(state, t, to_luastring('silent'));
            lua.lua_pushnumber(state, found.expr ? 1 : 0);
            lua.lua_setfield(state, t, to_luastring('expr'));
            if (found.desc) {
                lua.lua_pushstring(state, to_luastring(found.desc));
                lua.lua_setfield(state, t, to_luastring('desc'));
            }
            lua.lua_pushstring(
                state,
                to_luastring(mode === '' ? 'n' : mode.charAt(0)),
            );
            lua.lua_setfield(state, t, to_luastring('mode'));
        } else {
            lua.lua_pushstring(state, to_luastring(found.rhs ?? ''));
        }
        return 1;
    });

    if (callbacks.runner && callbacks.waitForKeypress) {
        const _runner = callbacks.runner;
        const _waitForKeypress = callbacks.waitForKeypress;
        registry.set('getcharstr', (state) => {
            const promise = _waitForKeypress().then((key) => key ?? '');
            return _runner.yieldWithPromise(state, promise);
        });
        registry.set('getchar', (state) => {
            const promise = _waitForKeypress().then((key) => {
                if (!key) return 27;
                return key.charCodeAt(0);
            });
            return _runner.yieldWithPromise(state, promise);
        });
    }

    registry.set('searchpos', (state) => {
        const pattern = readString(state, 1);
        const flags = lua.lua_isstring(state, 2) ? readString(state, 2) : '';
        const stopline = lua.lua_isnumber(state, 3)
            ? lua.lua_tonumber(state, 3)
            : null;
        const cursorLine = callbacks.getCursorLine();
        const cursorCol = callbacks.getCursorCol();
        const result =
            callbacks.searchBuffer?.(
                pattern,
                flags,
                cursorLine,
                cursorCol,
                stopline,
            ) ?? null;
        lua.lua_newtable(state);
        if (result) {
            lua.lua_pushnumber(state, result.line);
            lua.lua_rawseti(state, -2, 1);
            lua.lua_pushnumber(state, result.col);
            lua.lua_rawseti(state, -2, 2);
        } else {
            lua.lua_pushnumber(state, 0);
            lua.lua_rawseti(state, -2, 1);
            lua.lua_pushnumber(state, 0);
            lua.lua_rawseti(state, -2, 2);
        }
        return 1;
    });

    if (callbacks.runner && callbacks.showInputPrompt) {
        const _runner = callbacks.runner;
        const _showInputPrompt = callbacks.showInputPrompt;
        registry.set('input', (state) => {
            const prompt = lua.lua_isstring(state, 1)
                ? readString(state, 1)
                : '';
            const defaultText = lua.lua_isstring(state, 2)
                ? readString(state, 2)
                : '';
            const promise = _showInputPrompt(prompt, defaultText).then(
                (result) => result ?? '',
            );
            return _runner.yieldWithPromise(state, promise);
        });
    }

    const stringReturnFns = new Set([
        'mapcheck',
        'getcmdtype',
        'reg_recording',
        'reg_executing',
        'bufname',
        'synIDattr',
        'execute',
        'json_encode',
        'printf',
        'string',
    ]);
    const numberReturnFns = new Set([
        'byte2line',
        'line2byte',
        'search',
        'win_getid',
        'setbufline',
        'deletebufline',
        'bufnr',
        'winnr',
        'tabpagenr',
        'changenr',
        'virtcol',
        'charcol',
        'screencol',
        'screenrow',
        'synID',
        'synIDtrans',
        'complete',
        'pumvisible',
        'confirm',
        'feedkeys',
    ]);
    const booleanReturnFns = new Set(['hasmapto', 'buflisted', 'bufexists']);
    const tableReturnFns = new Set(['getbufline', 'json_decode']);

    registry.set('getwininfo', (state) => {
        const winid = lauxlib.luaL_optinteger(state, 1, 0);
        lua.lua_newtable(state);
        if (winid !== 0) return 1;
        const cm = callbacks.getCmAdapter?.();
        if (!cm?.cm6) return 1;
        pushLuaAny(state, getWindowInfo(cm));
        lua.lua_rawseti(state, -2, 1);
        return 1;
    });

    for (const name of stringReturnFns) {
        registerStub(name, (state) => {
            warnOnce(name);
            lua.lua_pushstring(state, to_luastring(''));
            return 1;
        });
    }
    for (const name of numberReturnFns) {
        registerStub(name, (state) => {
            warnOnce(name);
            lua.lua_pushnumber(state, 0);
            return 1;
        });
    }
    for (const name of booleanReturnFns) {
        registerStub(name, (state) => {
            warnOnce(name);
            lua.lua_pushnumber(state, 0);
            return 1;
        });
    }
    for (const name of tableReturnFns) {
        registerStub(name, (state) => {
            warnOnce(name);
            lua.lua_newtable(state);
            return 1;
        });
    }
    registerStub('system', (state) => {
        return lauxlib.luaL_error(
            state,
            to_luastring('vim.fn.system is not supported in Obsidian'),
        );
    });
    registerStub('systemlist', (state) => {
        return lauxlib.luaL_error(
            state,
            to_luastring('vim.fn.systemlist is not supported in Obsidian'),
        );
    });

    lua.lua_newtable(L);
    const fnIndex = lua.lua_gettop(L);

    lua.lua_newtable(L);
    lua.lua_pushjsfunction(L, (state) => {
        const name = lua.lua_isstring(state, 2)
            ? to_jsstring(lauxlib.luaL_checkstring(state, 2))
            : null;
        if (!name) {
            return lauxlib.luaL_error(
                state,
                to_luastring('vim.fn expects a string function name'),
            );
        }
        const handler = registry.get(name);
        if (!handler) return errorUnsupported(state, name, registry);
        lua.lua_pushjsfunction(state, handler);
        return 1;
    });
    lua.lua_setfield(L, -2, to_luastring('__index'));
    lua.lua_pushjsfunction(L, (state) =>
        lauxlib.luaL_error(
            state,
            to_luastring('vim.fn is a namespace, not a function'),
        ),
    );
    lua.lua_setfield(L, -2, to_luastring('__call'));
    lua.lua_setmetatable(L, fnIndex);

    lua.lua_getglobal(L, to_luastring('vim'));
    lua.lua_pushvalue(L, fnIndex);
    lua.lua_setfield(L, -2, to_luastring('fn'));
    lua.lua_pop(L, 2);
}
