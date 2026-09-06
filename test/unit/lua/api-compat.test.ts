import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    lua,
    lauxlib,
    to_jsstring,
    to_luastring,
} from '../../../src/lib/fengari';
import { createSandboxedState, destroyState } from '../../../src/lua/engine';
import { injectVimApi, type VimApiCallbacks } from '../../../src/lua/api';
import type { CmAdapter, VimApi } from '../../../src/types/vim-api';

describe('Lua API compatibility options and current handles', () => {
    let L: ReturnType<typeof createSandboxedState>;

    beforeEach(() => {
        L = createSandboxedState();
    });
    afterEach(() => {
        destroyState(L);
        vi.unstubAllGlobals();
    });

    function inject(callbacks: Partial<VimApiCallbacks> = {}): void {
        injectVimApi(L, {
            onSettingOverride: () => {},
            handleExCommand: () => {},
            getVaultName: () => 'vault',
            onKeymap: () => {},
            onKeymapDel: () => {},
            ...callbacks,
        });
    }

    function run(code: string): void {
        const status = lauxlib.luaL_dostring(L, to_luastring(code));
        const raw = status === lua.LUA_OK ? null : lua.lua_tolstring(L, -1);
        expect(status, raw ? to_jsstring(raw) : code).toBe(lua.LUA_OK);
    }

    const setters = [
        ['vim.opt', 'vim.opt.operatorfunc = VALUE'],
        ['vim.o', 'vim.o.operatorfunc = VALUE'],
        ['vim.go', 'vim.go.operatorfunc = VALUE'],
        ['nvim_set_option', 'vim.api.nvim_set_option("operatorfunc", VALUE)'],
        [
            'nvim_set_option_value',
            'vim.api.nvim_set_option_value("operatorfunc", VALUE, {scope="global"})',
        ],
    ];

    it.each(setters)(
        '%s routes named operatorfunc through all readers and clears nil',
        (_name, setter) => {
            const setOperatorfunc =
                vi.fn<NonNullable<VimApi['setOperatorfunc']>>();
            const setOption = vi.fn();
            inject({
                getVimApi: () => ({ setOperatorfunc }) as VimApi,
                setOption,
            });
            const readers = `
            local function check(expected)
                assert(vim.opt.operatorfunc == expected)
                assert(vim.o.operatorfunc == expected)
                assert(vim.go.operatorfunc == expected)
                assert(vim.api.nvim_get_option('operatorfunc') == expected)
                assert(vim.api.nvim_get_option_value('operatorfunc', {}) == expected)
            end
        `;
            run(`${readers}
            function TestOperator(kind) result = kind end
            ${setter.replace('VALUE', '"v:lua.TestOperator"')}
            check('v:lua.TestOperator')
        `);
            const operator = setOperatorfunc.mock.calls[0]?.[0];
            expect(operator).toBeTypeOf('function');
            operator?.({} as CmAdapter, 'line');
            run('assert(result == "line")');
            run(`${readers} ${setter.replace('VALUE', 'nil')} check('')`);
            expect(setOperatorfunc).toHaveBeenLastCalledWith(null);
            expect(setOption).not.toHaveBeenCalled();
        },
    );

    it.each(setters)(
        '%s installs Lua function operatorfunc callbacks',
        (_name, setter) => {
            const setOperatorfunc =
                vi.fn<NonNullable<VimApi['setOperatorfunc']>>();
            inject({ getVimApi: () => ({ setOperatorfunc }) as VimApi });
            run(setter.replace('VALUE', 'function(kind) result = kind end'));
            const operator = setOperatorfunc.mock.calls[0]?.[0];
            expect(operator).toBeTypeOf('function');
            operator?.({} as CmAdapter, 'char');
            run('assert(result == "char"); assert(vim.o.operatorfunc == "")');
        },
    );

    it('preserves operatorfunc name isolation between Lua runtimes', () => {
        inject();
        run('vim.o.operatorfunc = "first"');
        const other = createSandboxedState();
        try {
            injectVimApi(other, {
                onSettingOverride: () => {},
                handleExCommand: () => {},
                getVaultName: () => 'other',
                onKeymap: () => {},
                onKeymapDel: () => {},
            });
            const status = lauxlib.luaL_dostring(
                other,
                to_luastring(`
                assert(vim.o.operatorfunc == '')
                vim.go.operatorfunc = 'second'
                assert(vim.opt.operatorfunc == 'second')
            `),
            );
            expect(status).toBe(lua.LUA_OK);
            run('assert(vim.o.operatorfunc == "first")');
        } finally {
            destroyState(other);
        }
    });

    it('shares eventignore and columns shadow values across vim.o and vim.go', () => {
        const setOption = vi.fn();
        inject({ getOption: () => undefined, setOption });
        run(`
            assert(vim.o.eventignore == '')
            assert(vim.go.columns == 80)
            vim.o.eventignore = 'all'
            vim.go.columns = 120
            assert(vim.go.eventignore == 'all')
            assert(vim.o.columns == 120)
            vim.go.eventignore = ''
            vim.o.columns = 80
            assert(vim.o.eventignore == '')
            assert(vim.go.columns == 80)
        `);
        expect(setOption).toHaveBeenCalledWith('eventignore', 'all');
        expect(setOption).toHaveBeenCalledWith('columns', 120);
    });

    it('supplies defaults, falsey shadows, and nil for unwritten unknown options', () => {
        inject();
        run(`
            assert(vim.o.selection == 'inclusive' and vim.o.cmdheight == 1)
            assert(vim.o.lines == 24 and vim.o.cpo == 'aABceFs')
            assert(vim.o.background == 'dark')
            assert(vim.o.not_a_neovim_option == nil)
            vim.o.columns = 0
            vim.o.hidden = false
            assert(vim.go.columns == 0 and vim.go.hidden == false)
            vim.o.eventignore = nil
            assert(vim.go.eventignore == nil)
        `);
    });

    it('derives background from the active theme unless overridden', () => {
        vi.stubGlobal('document', {
            body: {
                classList: {
                    contains: (name: string) => name === 'theme-light',
                },
            },
        });
        inject();
        run(`
            assert(vim.o.background == 'light')
            vim.go.background = 'dark'
            assert(vim.o.background == 'dark')
        `);
    });

    it.each(['throw', 'error', 'null'])(
        'falls back when the engine reports unknown options via %s',
        (mode) => {
            inject({
                getOption: () => {
                    if (mode === 'throw') throw new Error('Unknown option');
                    return mode === 'error'
                        ? new Error('Unknown option')
                        : null;
                },
                setOption: () => {
                    throw new Error('Unknown option');
                },
            });
            run(`
            assert(vim.o.eventignore == '')
            vim.o.eventignore = 'all'
            vim.go.columns = 99
            assert(vim.go.eventignore == 'all' and vim.o.columns == 99)
        `);
        },
    );

    it('keeps engine reads authoritative including false, zero, and empty string', () => {
        const options = new Map<string, unknown>([
            ['ignorecase', false],
            ['scrolloff', 0],
            ['virtualedit', ''],
        ]);
        inject({ getOption: (name) => options.get(name) });
        run(`
            vim.go.ignorecase = true
            vim.o.scrolloff = 8
            vim.o.virtualedit = 'all'
            assert(vim.o.ignorecase == false)
            assert(vim.go.scrolloff == 0)
            assert(vim.go.virtualedit == '')
        `);
        options.set('ignorecase', true);
        run('assert(vim.go.ignorecase == true)');
    });

    it.each(['nvim_win_call', 'nvim_buf_call'])(
        '%s propagates all results and error objects',
        (name) => {
            const warn = vi.spyOn(console, 'warn');
            inject();
            run(`
            local marker = {}
            local result = table.pack(vim.api.${name}(0, function(...)
                assert(select('#', ...) == 0)
                return 42, nil, false, marker
            end))
            assert(result.n == 4 and result[1] == 42 and result[2] == nil)
            assert(result[3] == false and result[4] == marker)
            assert(select('#', vim.api.${name}(0, function() end)) == 0)
            local ok, err = pcall(vim.api.${name}, 0, function() error(marker) end)
            assert(not ok and err == marker)
        `);
            expect(warn).not.toHaveBeenCalled();
            warn.mockRestore();
        },
    );

    it.each(['nvim_win_call', 'nvim_buf_call'])(
        '%s rejects nonzero handles and nonfunctions',
        (name) => {
            inject();
            run(`
            local called = false
            local ok, err = pcall(vim.api.${name}, 1, function() called = true end)
            assert(not ok and string.find(err, 'other than 0', 1, true))
            assert(not called)
            assert(not pcall(vim.api.${name}, 0, 'not a function'))
            assert(not pcall(vim.api.${name}, nil, function() end))
        `);
        },
    );

    it('nvim_win_get_config reports a non-floating current window and rejects other handles', () => {
        inject();
        run(`
            local config = vim.api.nvim_win_get_config(0)
            assert(config.relative == '' and config.focusable == true)
            assert(config.external == false and config.hide == false and config.zindex == nil)
            assert(not pcall(vim.api.nvim_win_get_config, 1))
        `);
    });
});
