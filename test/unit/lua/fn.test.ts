import { describe, it, expect } from 'vitest';
import {
    lua,
    lauxlib,
    to_jsstring,
    to_luastring,
} from '../../../src/lib/fengari';
import { createSandboxedState, destroyState } from '../../../src/lua/engine';
import { injectVimApi } from '../../../src/lua/api';
import { AutocmdManager } from '../../../src/lua/autocmd';
import { injectVimFn } from '../../../src/lua/fn';
import type { CmAdapter } from '../../../src/types/vim-api';
import { EditorState } from '@codemirror/state';

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
    getCmAdapter?: () => CmAdapter | null;
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
        getCmAdapter: overrides?.getCmAdapter,
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

describe('vim.fn.getwininfo', () => {
    function mockAdapter() {
        const state = EditorState.create({
            doc: 'one\ntwo\nthree\nfour\nfive\nsix',
        });
        return {
            cm6: {
                state,
                visibleRanges: [
                    { from: state.doc.line(2).from, to: state.doc.line(5).to },
                ],
                viewport: {
                    from: state.doc.line(3).from,
                    to: state.doc.line(4).to,
                },
                viewportLineBlocks: [],
                documentTop: 0,
                defaultCharacterWidth: 8,
                defaultLineHeight: 20,
                scrollDOM: {
                    clientTop: 0,
                    clientHeight: 200,
                    clientWidth: 640,
                    getBoundingClientRect: () => ({ top: 0 }),
                },
                dom: {
                    querySelector: () => ({
                        getBoundingClientRect: () => ({ width: 32 }),
                    }),
                },
            },
            lastLine: () => 5,
        };
    }

    it('returns a one-window dict with live visible lines and measured dimensions', () => {
        const adapter = mockAdapter();
        const L = setupState({
            getCmAdapter: () => adapter as unknown as CmAdapter,
        });
        try {
            expect(
                runLua(
                    L,
                    `
                local wins = vim.fn.getwininfo()
                assert(#wins == 1)
                local w = wins[1]
                assert(w.winid == 0 and w.winnr == 1 and w.bufnr == 0 and w.tabnr == 1)
                assert(w.winbar == 0)
                assert(w.topline == 2 and w.botline == 5)
                assert(w.height == 10 and w.width == 80 and w.textoff == 4)
                assert(w.winrow == 1 and w.wincol == 1)
                assert(w.terminal == 0 and w.quickfix == 0 and w.loclist == 0)
                assert(type(w.variables) == 'table' and next(w.variables) == nil)
                assert(#vim.fn.getwininfo(0) == 1 and #vim.fn.getwininfo(1) == 0)
            `,
                ),
            ).toBe(lua.LUA_OK);
            adapter.cm6.visibleRanges = [
                { from: 0, to: adapter.cm6.state.doc.line(2).to },
            ];
            expect(
                runLua(
                    L,
                    `local w = vim.fn.getwininfo()[1]; assert(w.topline == 1 and w.botline == 2)`,
                ),
            ).toBe(lua.LUA_OK);
        } finally {
            destroyState(L);
        }
    });

    it('falls back to viewport and reports zero gutter when absent', () => {
        const adapter = mockAdapter();
        adapter.cm6.visibleRanges = [];
        const cm = {
            ...adapter,
            cm6: { ...adapter.cm6, dom: { querySelector: () => null } },
        } as unknown as CmAdapter;
        const L = setupState({ getCmAdapter: () => cm });
        try {
            expect(
                runLua(
                    L,
                    `local w = vim.fn.getwininfo()[1]; assert(w.topline == 3 and w.botline == 4 and w.textoff == 0)`,
                ),
            ).toBe(lua.LUA_OK);
        } finally {
            destroyState(L);
        }
    });

    it('clips overscan to visible blocks and keeps the final buffer line inclusive', () => {
        const adapter = mockAdapter();
        const doc = adapter.cm6.state.doc;
        const cm = {
            ...adapter,
            cm6: {
                ...adapter.cm6,
                visibleRanges: [{ from: 0, to: doc.length }],
                documentTop: -40,
                scrollDOM: { ...adapter.cm6.scrollDOM, clientHeight: 80 },
                viewportLineBlocks: Array.from({ length: 6 }, (_, i) => ({
                    from: doc.line(i + 1).from,
                    to: doc.line(i + 1).to,
                    top: i * 20,
                    bottom: (i + 1) * 20,
                })),
            },
        } as unknown as CmAdapter;
        const L = setupState({ getCmAdapter: () => cm });
        try {
            expect(
                runLua(
                    L,
                    `local w = vim.fn.getwininfo()[1]; assert(w.topline == 3 and w.botline == 6 and w.height == 4)`,
                ),
            ).toBe(lua.LUA_OK);
        } finally {
            destroyState(L);
        }
    });

    it('returns an empty list with no editor', () => {
        const L = setupState({ getCmAdapter: () => null });
        try {
            expect(runLuaNumber(L, 'return #vim.fn.getwininfo()')).toBe(0);
        } finally {
            destroyState(L);
        }
    });
});

function setupStateWithExtras(overrides?: {
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
    setCursor?: (line: number, col: number) => void;
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
    searchBuffer?: (
        pattern: string,
        flags: string,
        cursorLine: number,
        cursorCol: number,
        stopline: number | null,
    ) => { line: number; col: number } | null;
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
        setCursor: overrides?.setCursor,
        getLastVisualMode: overrides?.getLastVisualMode,
        getScrollInfo: overrides?.getScrollInfo,
        setScrollInfo: overrides?.setScrollInfo,
        getFoldRange: overrides?.getFoldRange,
        getShiftwidth: overrides?.getShiftwidth,
        getKeymaps: overrides?.getKeymaps,
        searchBuffer: overrides?.searchBuffer,
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
        expect(error).toContain('not supported in Obsidian');
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

    it('should implement visualmode()', () => {
        const L = setupStateWithExtras({ getLastVisualMode: () => 'V' });
        expect(runLuaString(L, 'return vim.fn.visualmode()')).toBe('V');
        destroyState(L);
    });

    it('should implement visualmode() returning v by default', () => {
        const L = setupStateWithExtras({ getLastVisualMode: () => 'v' });
        expect(runLuaString(L, 'return vim.fn.visualmode()')).toBe('v');
        destroyState(L);
    });

    it('should implement winsaveview()', () => {
        const L = setupStateWithExtras({
            getCursorLine: () => 5,
            getCursorCol: () => 3,
            getScrollInfo: () => ({ topline: 2, leftcol: 0 }),
        });
        const lnum = runLuaNumber(L, 'return vim.fn.winsaveview().lnum');
        expect(lnum).toBe(5);
        const col = runLuaNumber(L, 'return vim.fn.winsaveview().col');
        expect(col).toBe(2);
        const topline = runLuaNumber(L, 'return vim.fn.winsaveview().topline');
        expect(topline).toBe(2);
        destroyState(L);
    });

    it('should implement winrestview()', () => {
        let setCursorCalled = false;
        let scrollInfoSet: { topline: number; leftcol: number } | null = null;
        const L = setupStateWithExtras({
            getCursorLine: () => 1,
            getCursorCol: () => 1,
            setCursor: () => {
                setCursorCalled = true;
            },
            setScrollInfo: (info) => {
                scrollInfoSet = info;
            },
        });
        const status = runLua(
            L,
            'vim.fn.winrestview({lnum=3, col=5, topline=10, leftcol=0})',
        );
        expect(status).toBe(lua.LUA_OK);
        expect(setCursorCalled).toBe(true);
        expect(scrollInfoSet).toEqual({ topline: 10, leftcol: 0 });
        destroyState(L);
    });

    it('should implement foldclosed()', () => {
        const L = setupStateWithExtras({
            getFoldRange: (line) => (line === 4 ? { from: 3, to: 7 } : null),
        });
        expect(runLuaNumber(L, 'return vim.fn.foldclosed(5)')).toBe(4);
        expect(runLuaNumber(L, 'return vim.fn.foldclosed(1)')).toBe(-1);
        destroyState(L);
    });

    it('should implement foldclosedend()', () => {
        const L = setupStateWithExtras({
            getFoldRange: (line) => (line === 4 ? { from: 3, to: 7 } : null),
        });
        expect(runLuaNumber(L, 'return vim.fn.foldclosedend(5)')).toBe(8);
        expect(runLuaNumber(L, 'return vim.fn.foldclosedend(1)')).toBe(-1);
        destroyState(L);
    });

    it('should implement shiftwidth()', () => {
        const L = setupStateWithExtras({ getShiftwidth: () => 2 });
        expect(runLuaNumber(L, 'return vim.fn.shiftwidth()')).toBe(2);
        destroyState(L);
    });

    it('should implement shiftwidth() default', () => {
        const L = setupStateWithExtras({});
        expect(runLuaNumber(L, 'return vim.fn.shiftwidth()')).toBe(4);
        destroyState(L);
    });

    it('should implement strdisplaywidth()', () => {
        const L = setupStateWithExtras({});
        expect(runLuaNumber(L, "return vim.fn.strdisplaywidth('hello')")).toBe(
            5,
        );
        expect(runLuaNumber(L, "return vim.fn.strdisplaywidth('')")).toBe(0);
        destroyState(L);
    });

    it('should implement strcharpart()', () => {
        const L = setupStateWithExtras({});
        expect(
            runLuaString(L, "return vim.fn.strcharpart('hello', 1, 3)"),
        ).toBe('ell');
        expect(
            runLuaString(L, "return vim.fn.strcharpart('hello', 0, 2)"),
        ).toBe('he');
        expect(runLuaString(L, "return vim.fn.strcharpart('hello', 3)")).toBe(
            'lo',
        );
        destroyState(L);
    });

    it('should implement maparg() returning empty for unknown mapping', () => {
        const L = setupStateWithExtras({ getKeymaps: () => [] });
        expect(runLuaString(L, "return vim.fn.maparg('j', 'n')")).toBe('');
        destroyState(L);
    });

    it('should implement maparg() returning rhs for known mapping', () => {
        const L = setupStateWithExtras({
            getKeymaps: () => [{ lhs: 'j', rhs: 'gj', noremap: true }],
        });
        expect(runLuaString(L, "return vim.fn.maparg('j', 'n')")).toBe('gj');
        destroyState(L);
    });

    it('should implement maparg() with dict flag', () => {
        const L = setupStateWithExtras({
            getKeymaps: () => [
                { lhs: 'j', rhs: 'gj', noremap: true, desc: 'down' },
            ],
        });
        expect(
            runLuaString(L, "return vim.fn.maparg('j', 'n', 0, 1).lhs"),
        ).toBe('j');
        expect(
            runLuaString(L, "return vim.fn.maparg('j', 'n', 0, 1).rhs"),
        ).toBe('gj');
        expect(
            runLuaNumber(L, "return vim.fn.maparg('j', 'n', 0, 1).noremap"),
        ).toBe(1);
        expect(
            runLuaString(L, "return vim.fn.maparg('j', 'n', 0, 1).desc"),
        ).toBe('down');
        destroyState(L);
    });

    it('should implement searchpos() forward search', () => {
        const L = setupStateWithExtras({
            getCursorLine: () => 1,
            getCursorCol: () => 1,
            searchBuffer: (pattern) => {
                if (pattern === 'world') return { line: 1, col: 7 };
                return null;
            },
        });
        const line = runLuaNumber(L, "return vim.fn.searchpos('world')[1]");
        const col = runLuaNumber(L, "return vim.fn.searchpos('world')[2]");
        expect(line).toBe(1);
        expect(col).toBe(7);
        destroyState(L);
    });

    it('should implement searchpos() returning {0,0} on no match', () => {
        const L = setupStateWithExtras({
            getCursorLine: () => 1,
            getCursorCol: () => 1,
            searchBuffer: () => null,
        });
        const line = runLuaNumber(
            L,
            "return vim.fn.searchpos('nonexistent')[1]",
        );
        const col = runLuaNumber(
            L,
            "return vim.fn.searchpos('nonexistent')[2]",
        );
        expect(line).toBe(0);
        expect(col).toBe(0);
        destroyState(L);
    });

    it('should implement searchpos() with flags', () => {
        const L = setupStateWithExtras({
            getCursorLine: () => 3,
            getCursorCol: () => 5,
            searchBuffer: (_pattern, flags) => {
                if (flags.includes('b')) return { line: 1, col: 1 };
                return { line: 5, col: 3 };
            },
        });
        expect(runLuaNumber(L, "return vim.fn.searchpos('test', '')[1]")).toBe(
            5,
        );
        expect(runLuaNumber(L, "return vim.fn.searchpos('test', 'b')[1]")).toBe(
            1,
        );
        destroyState(L);
    });
});
