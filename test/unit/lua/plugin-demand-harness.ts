import { EditorState, type TransactionSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { Vim } from '@replit/codemirror-vim';
import type { VimApi } from '../../../src/types/vim-api';
import { vi } from 'vitest';
import { createSandboxedState, destroyState } from '../../../src/lua/engine';
import {
    injectVimApi,
    type LuaKeymap,
    type VimApiCallbacks,
} from '../../../src/lua/api';
import { injectVimFn } from '../../../src/lua/fn';
import { AutocmdManager } from '../../../src/lua/autocmd';
import { HighlightManager } from '../../../src/lua/highlight';
import { injectUiApi } from '../../../src/lua/ui-api';
import { injectNamespaceStubs } from '../../../src/lua/namespace-stubs';
import { injectIterApi } from '../../../src/lua/iter';
import { injectTextObjectApi } from '../../../src/lua/textobject-api';
import { injectTreesitterApi } from '../../../src/lua/treesitter/api';
import { injectStdlib } from '../../../src/lua/stdlib';
import { injectIoShim } from '../../../src/lua/io-shim';
import { injectTimers } from '../../../src/lua/timers';
import { injectPackageAndRequire } from '../../../src/lua/package';
import { injectSnippetApi } from '../../../src/lua/snippet-api';
import { CoroutineRunner } from '../../../src/lua/coroutine-runner';
import { extmarkField } from '../../../src/lua/extmarks';
import { runCleanups } from '../../../src/util/cleanup';
import {
    COORD_LINE,
    COORD_LINES,
} from '../../fixtures/neovim-coordinate-contract';
import { runLuaString } from './coordinate-harness';

export type Category = 'real' | 'stub' | 'silent' | 'absent';
export interface DemandProbe {
    lookup?: string;
    prepare?: string;
    code: string;
    effect?: 'commands' | 'notices';
    /** Observed fingerprints of an inert implementation, using nontrivial
     * inputs/effects. Legitimate constant single-window identities omit this.
     */
    silentResults?: string[];
}

/** Loader-order injectors with an in-memory UTF-16 host, not substituted APIs.
 * No mappings or plugin behavior are simulated. The view seam supplies only
 * state/dispatch, the exact CM6 surface used by extmark storage.
 */
export function createDemandState(asyncFns = true) {
    const L = createSandboxedState();
    const runner = new CoroutineRunner(L);
    const previousOperatorfunc = Vim.getOperatorfunc();
    const autocmd = new AutocmdManager(L);
    const highlights = new HighlightManager();
    const mappings: LuaKeymap[] = [];
    const commands: string[] = [];
    const notices: string[] = [];
    const observers = new Set<(key: string) => void>();
    let cursor = { line: 3, col: 7 };
    const marks = new Map([
        ['a', { line: 2, ch: 6 }],
        ['<', { line: 2, ch: 6 }],
        ['>', { line: 2, ch: 6 }],
    ]);
    const options = new Map<string, unknown>([
        ['fileformat', 'unix'],
        ['tabstop', 8],
        ['shiftwidth', 2],
        ['expandtab', true],
        ['commentstring', '%% %s %%'],
        ['filetype', 'markdown'],
    ]);
    const view = {
        state: EditorState.create({
            doc: COORD_LINES.join('\n'),
            extensions: [extmarkField],
        }),
        dispatch(spec: TransactionSpec) {
            this.state = this.state.update(spec).state;
        },
    };
    const getLines = (start: number, end: number) =>
        view.state.doc
            .toString()
            .split('\n')
            .slice(start, end === -1 ? undefined : end);
    const setLines = (start: number, end: number, replacement: string[]) => {
        const lines = getLines(0, -1);
        lines.splice(
            start,
            (end === -1 ? lines.length : end) - start,
            ...replacement,
        );
        view.dispatch({
            changes: {
                from: 0,
                to: view.state.doc.length,
                insert: lines.join('\n'),
            },
        });
    };
    const callbacks: VimApiCallbacks = {
        onSettingOverride: () => {},
        handleExCommand: (command) => {
            commands.push(command);
        },
        getVaultName: () => 'demand-audit',
        onKeymap: (map) => {
            mappings.push(map);
            if (map.rhs) Vim.map(map.lhs, map.rhs, map.mode);
        },
        onKeymapDel: () => {},
        getVimApi: () => Vim as unknown as VimApi,
        autocmdManager: autocmd,
        highlightManager: highlights,
        runner,
        getActiveFilePath: () => 'demand-audit.md',
        getLineCount: () => view.state.doc.lines,
        getLines,
        setLines,
        getLine: (line) => getLines(line, line + 1)[0] ?? null,
        getCursorPosition: () => cursor,
        setCursorPosition: (line, col) => {
            cursor = { line, col };
        },
        getMarkPos: (name) => marks.get(name) ?? null,
        setMark: (name, line, ch) => {
            marks.set(name, { line, ch });
        },
        getLastVisualMode: () => 'v',
        getOption: (name) => options.get(name),
        getBufferOption: (name) => options.get(name),
        setBufferOption: (name, value) => {
            options.set(name, value);
        },
        replaceRange: (text, fromLine, fromCol, toLine, toCol) => {
            const doc = view.state.doc;
            view.dispatch({
                changes: {
                    from:
                        doc.line(fromLine + 1).from +
                        Math.min(fromCol, doc.line(fromLine + 1).length),
                    to:
                        doc.line(toLine + 1).from +
                        Math.min(toCol, doc.line(toLine + 1).length),
                    insert: text,
                },
            });
        },
        getEditorView: () => view as unknown as EditorView,
        observeKeys: (handler) => {
            observers.add(handler);
            return () => {
                observers.delete(handler);
            };
        },
        showNotice: (message) => {
            notices.push(message);
        },
    };
    const api = injectVimApi(L, callbacks);
    injectUiApi(L, { showInputPrompt: () => Promise.resolve('audit') }, runner);
    injectNamespaceStubs(L);
    injectIterApi(L);
    injectTextObjectApi(L, callbacks);
    injectTreesitterApi(L, runner, () => view.state.doc.toString());
    injectVimFn(L, {
        getActiveFilePath: callbacks.getActiveFilePath!,
        fileExists: () => false,
        getVaultFiles: () => [],
        isDirectory: () => false,
        getMode: () => 'n',
        getCursorLine: () => cursor.line,
        getCursorCol: () => cursor.col,
        getLine: callbacks.getLine!,
        getLineCount: callbacks.getLineCount!,
        getLines,
        setLines,
        getBufferOption: api.getBufferOption,
        getWindowOption: api.getWindowOption,
        getMarkPos: callbacks.getMarkPos,
        getLastVisualMode: () => 'v',
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
        getOption: (name) => options.get(name),
        getShiftwidth: () => 2,
        insertLines: (afterLine, lines) =>
            setLines(afterLine, afterLine, lines),
        ...(asyncFns
            ? {
                  runner,
                  waitForKeypress: () => ({
                      promise: Promise.resolve(')'),
                      abort: () => {},
                  }),
                  showInputPrompt: () => Promise.resolve('audit'),
              }
            : {}),
    });
    injectStdlib(L);
    injectIoShim(L, {
        vaultRead: () => null,
        vaultWrite: () => false,
        vaultAppend: () => false,
        vaultExists: () => false,
    });
    const timers = injectTimers(L, runner);
    injectPackageAndRequire(L, '.obsidian', {
        isAsyncCapable: (thread) => runner.isAsyncCapable(thread),
    });
    injectSnippetApi(L);
    return {
        L,
        autocmd,
        highlights,
        mappings,
        commands,
        notices,
        observers,
        view,
        destroy() {
            runCleanups([
                () => timers.destroyAll(),
                () => runner.destroyAll(),
                ...mappings.map((map) => () => Vim.unmap(map.lhs, map.mode)),
                () => Vim.setOperatorfunc(previousOperatorfunc),
                () => destroyState(L),
            ]);
        },
    };
}

export function observeDemand(
    name: string,
    probe: DemandProbe,
    mutation?: string,
) {
    const state = createDemandState();
    const warnings: string[] = [];
    const spy = vi
        .spyOn(console, 'warn')
        .mockImplementation((...args: unknown[]) => {
            warnings.push(args.join(' '));
        });
    try {
        if (probe.prepare) runLuaString(state.L, `${probe.prepare}; return ''`);
        if (mutation) runLuaString(state.L, `${mutation}; return ''`);
        const lookup =
            probe.lookup ??
            name
                .split('.')
                .reduce(
                    (path, key, i) =>
                        i === 0 ? key : `${path}[${JSON.stringify(key)}]`,
                    '',
                );
        const presence = runLuaString(
            state.L,
            `local ok, value = pcall(function() return ${lookup} end); return (ok and value ~= nil) and 'present' or 'absent'`,
        );
        let result = '';
        if (presence === 'present')
            result = runLuaString(
                state.L,
                `
            local S = ${JSON.stringify(COORD_LINE)}
            local function render(x) return type(x)=='number' and string.format('%g',x) or tostring(x) end
            local function packed(...)
                local values={...}; local count=select('#',...)
                for i=1,count do values[i]=render(values[i]) end
                return table.concat(values,',')
            end
            local ok, value = pcall(function() ${probe.code} end)
            return ok and render(value) or ('error:' .. tostring(value))`,
            );
        result = result.replace(/\[string [\s\S]*?\]:\d+: /g, '');
        const category: Category = warnings.some((warning) =>
            warning.includes('not implemented'),
        )
            ? 'stub'
            : presence === 'absent'
              ? 'absent'
              : probe.silentResults?.includes(result) ||
                  (probe.effect && state[probe.effect].length === 0)
                ? 'silent'
                : 'real';
        return {
            category,
            result,
            warnings: warnings.length,
            ...(probe.effect ? { effect: state[probe.effect] } : {}),
        };
    } finally {
        spy.mockRestore();
        state.destroy();
    }
}
