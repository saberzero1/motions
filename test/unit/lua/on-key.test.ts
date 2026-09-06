import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import type { VimMotionsSettings } from '../../../src/settings';
import {
    createSandboxedState,
    destroyState,
    evalLua,
} from '../../../src/lua/engine';
import { injectVimApi } from '../../../src/lua/api';
import { injectStdlib } from '../../../src/lua/stdlib';
import { AutocmdManager } from '../../../src/lua/autocmd';
import {
    observeKeys,
    dispatchObservedKey,
} from '../../../src/workspace/key-observer';

vi.mock('../../../src/workspace/navigation', () => ({
    executeCommand: vi.fn(),
}));
vi.mock('../../../src/ui/global-ex-command', () => ({
    executeGlobalExCommand: vi.fn(),
}));
vi.mock('../../../src/ui/hint-mode', () => ({ isHintModeActive: () => false }));

import { GlobalKeyHandler } from '../../../src/workspace/global-key-handler';
import { GlobalMappingRegistry } from '../../../src/workspace/global-mapping-registry';

const states: ReturnType<typeof createSandboxedState>[] = [];
afterEach(() => {
    for (const L of states) destroyState(L);
    states.length = 0;
    vi.restoreAllMocks();
});

function setup() {
    const L = createSandboxedState();
    states.push(L);
    injectVimApi(L, {
        onSettingOverride: () => {},
        handleExCommand: () => {},
        getVaultName: () => 'vault',
        onKeymap: () => {},
        onKeymapDel: () => {},
        autocmdManager: new AutocmdManager(L),
        observeKeys,
    });
    injectStdlib(L);
    return (source: string) => expect(evalLua(L, source)).toEqual({ ok: true });
}

describe('vim.on_key', () => {
    it('allocates shared namespace ids and registers, replaces, counts and removes callbacks', () => {
        const run = setup();
        run(`
            assert(vim.on_key() == 0)
            named = vim.api.nvim_create_namespace('test')
            calls = ''
            ns = vim.on_key(function(key, typed) assert(key == typed); calls = calls .. key end)
            assert(ns > named)
            assert(vim.on_key() == 1)
        `);
        dispatchObservedKey('a');
        run(`
            assert(calls == 'a')
            assert(vim.on_key(function(key) calls = calls .. 'new:' .. key end, ns) == ns)
            assert(vim.on_key() == 1)
        `);
        dispatchObservedKey('b');
        run(
            `assert(calls == 'anew:b'); assert(vim.on_key(nil, ns) == ns); assert(vim.on_key() == 0)`,
        );
        dispatchObservedKey('c');
        run(`
            assert(calls == 'anew:b')
            assert(vim.on_key(function() end, 42) == 42)
            assert(vim.on_key(function() end, 0) > 42)
            assert(not pcall(vim.on_key, 'bad'))
            assert(not pcall(vim.on_key, function() end, -1))
        `);
    });

    it('isolates errors, removes failing callbacks and preserves other observers', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const run = setup();
        run(
            `calls = 0; vim.on_key(function() error('broken') end); vim.on_key(function() calls = calls + 1 end)`,
        );
        dispatchObservedKey('x');
        dispatchObservedKey('y');
        run(`assert(calls == 2); assert(vim.on_key() == 1)`);
        expect(error).toHaveBeenCalledTimes(1);
    });

    it('bounds runaway callbacks and skips removed callbacks during dispatch', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const run = setup();
        run(`
            vim.on_key(function() while true do end end)
            vim.on_key(function() vim.on_key(nil, later) end)
            later = vim.on_key(function() error('must not run') end)
        `);
        dispatchObservedKey('x');
        run(`assert(vim.on_key() == 1)`);
        expect(console.error).toHaveBeenCalledTimes(1);
    });

    it('unsubscribes before closing the runtime and does not call stale callbacks', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const run = setup();
        run(`vim.on_key(function() error('stale') end)`);
        destroyState(states.pop()!);
        dispatchObservedKey('x');
        expect(error).not.toHaveBeenCalled();
    });

    it('receives real global key-handler events even when an editor is focused, without consuming them', () => {
        const run = setup();
        run(`keys = {}; vim.on_key(function(key) keys[#keys + 1] = key end)`);
        let listener: ((event: KeyboardEvent) => void) | undefined;
        const doc = {
            addEventListener: (
                _name: string,
                handler: (event: KeyboardEvent) => void,
            ) => {
                listener = handler;
            },
            removeEventListener: vi.fn(),
            activeElement: { closest: () => ({}) },
            querySelector: () => null,
        } as unknown as Document;
        const app = {
            workspace: {
                containerEl: { ownerDocument: doc },
                on: () => ({}),
                offref: () => {},
            },
        } as unknown as App;
        const handler = new GlobalKeyHandler(
            app,
            {} as VimMotionsSettings,
            null,
            new GlobalMappingRegistry(),
        );
        handler.install();
        const preventDefault = vi.fn();
        try {
            for (const key of ['x', 'Enter', 'ArrowLeft', 'Shift', 'Dead']) {
                listener?.({
                    key,
                    preventDefault,
                    isComposing: false,
                } as unknown as KeyboardEvent);
            }
            listener?.({ key: 'x', isComposing: true } as KeyboardEvent);
            run(
                `assert(#keys == 3); assert(keys[1] == 'x'); assert(keys[2] == string.char(13)); assert(keys[3] == string.char(128, 107, 108))`,
            );
            expect(preventDefault).not.toHaveBeenCalled();
        } finally {
            handler.destroy();
        }
    });
});
