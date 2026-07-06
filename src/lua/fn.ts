import { lua, lauxlib, to_jsstring, to_luastring } from 'fengari';
import type { lua_State } from 'fengari';
import { strftime } from './strftime';

export interface VimFnCallbacks {
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
}

type VimFnHandler = (L: lua_State) => number;

function readString(L: lua_State, index: number): string {
    return to_jsstring(lauxlib.luaL_checkstring(L, index));
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
