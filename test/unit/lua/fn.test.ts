import { describe, it, expect } from 'vitest';
import { lua, lauxlib, to_jsstring, to_luastring } from 'fengari';
import { createSandboxedState, destroyState } from '../../../src/lua/engine';
import { injectVimApi } from '../../../src/lua/api';
import { AutocmdManager } from '../../../src/lua/autocmd';
import { injectVimFn } from '../../../src/lua/fn';

type LuaState = ReturnType<typeof createSandboxedState>;

function runLua(L: LuaState, code: string): number {
    return lauxlib.luaL_dostring(L, to_luastring(code));
}

function runLuaString(L: LuaState, code: string): string {
    const status = runLua(L, code);
    expect(status).toBe(lua.LUA_OK);
    const value = lua.lua_tolstring(L, -1);
    const text = value ? to_jsstring(value) : '';
    lua.lua_pop(L, 1);
    return text;
}

function runLuaNumber(L: LuaState, code: string): number {
    const status = runLua(L, code);
    expect(status).toBe(lua.LUA_OK);
    const value = lua.lua_tonumber(L, -1);
    lua.lua_pop(L, 1);
    return value;
}

function runLuaError(L: LuaState, code: string): string {
    const status = runLua(L, code);
    expect(status).not.toBe(lua.LUA_OK);
    const value = lua.lua_tolstring(L, -1);
    const error = value ? to_jsstring(value) : '';
    lua.lua_pop(L, 1);
    return error;
}

function setupState(overrides?: {
    activeFilePath?: string | null;
    fileExists?: (path: string) => boolean;
    getVaultFiles?: () => string[];
    isDirectory?: (path: string) => boolean;
    getMode?: () => string;
    getCursorLine?: () => number;
    getCursorCol?: () => number;
    getLine?: (line: number) => string | null;
    getLineCount?: () => number;
    getLines?: (start: number, end: number) => string[];
    setLines?: (start: number, end: number, lines: string[]) => void;
    getGlobal?: (name: string) => unknown;
    getOption?: (name: string) => unknown;
}): LuaState {
    const L = createSandboxedState();
    const autocmdManager = new AutocmdManager(L);
    injectVimApi(L, {
        onSettingOverride: () => {},
        handleExCommand: () => {},
        getVaultName: () => 'vault',
        onKeymap: () => {},
        onKeymapDel: () => {},
        autocmdManager,
    });
    injectVimFn(L, {
        getActiveFilePath: () =>
            overrides?.activeFilePath === undefined
                ? 'folder/note.md'
                : overrides.activeFilePath,
        fileExists: overrides?.fileExists ?? ((path) => path === 'existing.md'),
        getVaultFiles:
            overrides?.getVaultFiles ??
            (() => ['note.md', 'plan.md', 'folder/todo.md']),
        isDirectory:
            overrides?.isDirectory ?? ((path) => path === 'existing-dir'),
        getMode: overrides?.getMode ?? (() => 'n'),
        getCursorLine: overrides?.getCursorLine ?? (() => 0),
        getCursorCol: overrides?.getCursorCol ?? (() => 0),
        getLine:
            overrides?.getLine ??
            ((line) =>
                line === 0 ? 'hello world' : line === 1 ? 'second line' : null),
        getLineCount: overrides?.getLineCount ?? (() => 2),
        getLines:
            overrides?.getLines ??
            ((start, end) => {
                const lines = ['hello world', 'second line'];
                return lines.slice(start, end);
            }),
        setLines: overrides?.setLines ?? (() => {}),
        getPlatform: () => ({
            isMacOS: false,
            isLinux: true,
            isWin: false,
            isMobile: false,
            isIosApp: false,
            isAndroidApp: false,
        }),
        getObsidianVersion: () => '1.12.7',
        getGlobal:
            overrides?.getGlobal ??
            ((name) => (name === 'mapleader' ? ',' : undefined)),
        getOption:
            overrides?.getOption ??
            ((name) => (name === 'scrolloff' ? 5 : undefined)),
    });
    return L;
}

describe('vim.fn', () => {
    it('should implement has()', () => {
        const L = setupState();
        expect(runLuaNumber(L, "return vim.fn.has('obsidian')")).toBe(1);
        expect(runLuaNumber(L, "return vim.fn.has('nvim')")).toBe(0);
        expect(runLuaNumber(L, "return vim.fn.has('mac')")).toBe(0);
        expect(runLuaNumber(L, "return vim.fn.has('linux')")).toBe(1);
        expect(runLuaNumber(L, "return vim.fn.has('mobile')")).toBe(0);
        expect(runLuaNumber(L, "return vim.fn.has('obsidian-1.12')")).toBe(1);
        expect(runLuaNumber(L, "return vim.fn.has('obsidian-2.0')")).toBe(0);
        destroyState(L);
    });

    it('should implement expand()', () => {
        const L = setupState();
        expect(runLuaString(L, "return vim.fn.expand('%')")).toBe(
            'folder/note.md',
        );
        expect(runLuaString(L, "return vim.fn.expand('%:t')")).toBe('note.md');
        expect(runLuaString(L, "return vim.fn.expand('%:e')")).toBe('md');
        expect(runLuaString(L, "return vim.fn.expand('%:r')")).toBe(
            'folder/note',
        );
        destroyState(L);
    });

    it('should return empty expand when no file', () => {
        const L = setupState({ activeFilePath: null });
        expect(runLuaString(L, "return vim.fn.expand('%')")).toBe('');
        destroyState(L);
    });

    it('should implement exists()', () => {
        const L = setupState();
        expect(runLuaNumber(L, "return vim.fn.exists('g:mapleader')")).toBe(1);
        expect(runLuaNumber(L, "return vim.fn.exists('g:nonexistent')")).toBe(
            0,
        );
        expect(runLuaNumber(L, "return vim.fn.exists('&scrolloff')")).toBe(1);
        destroyState(L);
    });

    it('should implement localtime()', () => {
        const L = setupState();
        const now = Math.floor(Date.now() / 1000);
        const value = runLuaNumber(L, 'return vim.fn.localtime()');
        expect(Math.abs(value - now)).toBeLessThanOrEqual(2);
        destroyState(L);
    });

    it('should implement strftime()', () => {
        const L = setupState();
        const year = new Date().getFullYear();
        expect(runLuaString(L, "return vim.fn.strftime('%Y')")).toBe(
            String(year),
        );
        destroyState(L);
    });

    it('should implement filereadable()', () => {
        const L = setupState({
            fileExists: (path) => path === 'existing.md',
        });
        expect(
            runLuaNumber(L, "return vim.fn.filereadable('existing.md')"),
        ).toBe(1);
        expect(
            runLuaNumber(L, "return vim.fn.filereadable('missing.md')"),
        ).toBe(0);
        expect(runLuaNumber(L, "return vim.fn.filereadable('../escape')")).toBe(
            0,
        );
        expect(runLuaNumber(L, "return vim.fn.filereadable('/absolute')")).toBe(
            0,
        );
        destroyState(L);
    });

    it('should implement fnamemodify()', () => {
        const L = setupState();
        expect(
            runLuaString(
                L,
                "return vim.fn.fnamemodify('folder/note.md', ':t')",
            ),
        ).toBe('note.md');
        expect(
            runLuaString(
                L,
                "return vim.fn.fnamemodify('folder/note.md', ':r')",
            ),
        ).toBe('folder/note');
        expect(
            runLuaString(
                L,
                "return vim.fn.fnamemodify('folder/note.md', ':e')",
            ),
        ).toBe('md');
        expect(
            runLuaString(
                L,
                "return vim.fn.fnamemodify('folder/note.md', ':h')",
            ),
        ).toBe('folder');
        expect(
            runLuaString(
                L,
                "return vim.fn.fnamemodify('folder/note.md', ':t:r')",
            ),
        ).toBe('note');
        expect(
            runLuaString(L, "return vim.fn.fnamemodify('note.md', ':h')"),
        ).toBe('.');
        destroyState(L);
    });

    it('should implement glob()', () => {
        const L = setupState({
            getVaultFiles: () => ['note.md', 'plan.md', 'folder/todo.md'],
        });
        expect(runLuaString(L, "return vim.fn.glob('*.md')")).toBe(
            'note.md\nplan.md',
        );
        expect(runLuaString(L, "return vim.fn.glob('../escape')")).toBe('');
        destroyState(L);
    });

    it('should implement isdirectory()', () => {
        const L = setupState({
            isDirectory: (path) => path === 'existing-dir',
        });
        expect(
            runLuaNumber(L, "return vim.fn.isdirectory('existing-dir')"),
        ).toBe(1);
        expect(runLuaNumber(L, "return vim.fn.isdirectory('not-a-dir')")).toBe(
            0,
        );
        expect(runLuaNumber(L, "return vim.fn.isdirectory('../escape')")).toBe(
            0,
        );
        destroyState(L);
    });

    it('should implement mode()', () => {
        const L = setupState({
            getMode: () => 'n',
        });
        expect(runLuaString(L, 'return vim.fn.mode()')).toBe('n');
        destroyState(L);
    });

    it('should implement line() and col() returning 0 without editor', () => {
        const L = setupState({
            getCursorLine: () => 0,
            getCursorCol: () => 0,
        });
        expect(runLuaNumber(L, "return vim.fn.line('.')")).toBe(0);
        expect(runLuaNumber(L, "return vim.fn.col('.')")).toBe(0);
        destroyState(L);
    });

    it('should error on unsupported functions', () => {
        const L = setupState();
        const error = runLuaError(L, "return vim.fn.system('ls')");
        expect(error).toContain('Supported:');
        destroyState(L);
    });

    it('should error when calling vim.fn as a function', () => {
        const L = setupState();
        const error = runLuaError(L, "return vim.fn('has', 'mac')");
        expect(error).toContain('namespace');
        destroyState(L);
    });

    it('should implement getline()', () => {
        const L = setupState({ getCursorLine: () => 1 });
        expect(runLuaString(L, "return vim.fn.getline('.')")).toBe(
            'hello world',
        );
        expect(runLuaString(L, "return vim.fn.getline('1')")).toBe(
            'hello world',
        );
        expect(runLuaString(L, "return vim.fn.getline('2')")).toBe(
            'second line',
        );
        expect(runLuaString(L, "return vim.fn.getline('999')")).toBe('');
        destroyState(L);
    });

    it('should implement getline() returning empty when no editor', () => {
        const L = setupState({ getLine: () => null, getCursorLine: () => 0 });
        expect(runLuaString(L, "return vim.fn.getline('.')")).toBe('');
        destroyState(L);
    });

    it('should implement tolower()', () => {
        const L = setupState();
        expect(runLuaString(L, "return vim.fn.tolower('Hello World')")).toBe(
            'hello world',
        );
        destroyState(L);
    });

    it('should implement toupper()', () => {
        const L = setupState();
        expect(runLuaString(L, "return vim.fn.toupper('Hello World')")).toBe(
            'HELLO WORLD',
        );
        destroyState(L);
    });

    it('should implement trim()', () => {
        const L = setupState();
        expect(runLuaString(L, "return vim.fn.trim('  hello  ')")).toBe(
            'hello',
        );
        destroyState(L);
    });

    it('should implement strlen()', () => {
        const L = setupState();
        expect(runLuaNumber(L, "return vim.fn.strlen('hello')")).toBe(5);
        expect(runLuaNumber(L, "return vim.fn.strlen('')")).toBe(0);
        destroyState(L);
    });

    it('should implement stridx() and strridx()', () => {
        const L = setupState();
        expect(
            runLuaNumber(L, "return vim.fn.stridx('hello world', 'world')"),
        ).toBe(6);
        expect(
            runLuaNumber(L, "return vim.fn.stridx('hello world', 'missing')"),
        ).toBe(-1);
        expect(runLuaNumber(L, "return vim.fn.strridx('abcabc', 'bc')")).toBe(
            4,
        );
        destroyState(L);
    });

    it('should implement strpart()', () => {
        const L = setupState();
        expect(runLuaString(L, "return vim.fn.strpart('hello world', 6)")).toBe(
            'world',
        );
        expect(
            runLuaString(L, "return vim.fn.strpart('hello world', 0, 5)"),
        ).toBe('hello');
        destroyState(L);
    });

    it('should implement substitute()', () => {
        const L = setupState();
        expect(
            runLuaString(
                L,
                "return vim.fn.substitute('hello world', 'world', 'lua', '')",
            ),
        ).toBe('hello lua');
        expect(
            runLuaString(L, "return vim.fn.substitute('aaa', 'a', 'b', 'g')"),
        ).toBe('bbb');
        destroyState(L);
    });

    it('should implement nr2char() and char2nr()', () => {
        const L = setupState();
        expect(runLuaString(L, 'return vim.fn.nr2char(65)')).toBe('A');
        expect(runLuaNumber(L, "return vim.fn.char2nr('A')")).toBe(65);
        destroyState(L);
    });

    it('should implement split() and join()', () => {
        const L = setupState();
        expect(runLuaNumber(L, "return #vim.fn.split('a,b,c', ',')")).toBe(3);
        expect(
            runLuaString(L, "return vim.fn.join({'a', 'b', 'c'}, '-')"),
        ).toBe('a-b-c');
        expect(runLuaString(L, "return vim.fn.join({'a', 'b', 'c'})")).toBe(
            'a b c',
        );
        destroyState(L);
    });
});
