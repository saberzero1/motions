import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { destroyState } from '../../../src/lua/engine';
import type { CmAdapter } from '../../../src/types/vim-api';
import {
    COORDINATE_API_MANIFEST,
    DEFERRED_COORDINATE_APIS,
} from '../../fixtures/neovim-coordinate-api-manifest';
import { COORD_LINE } from '../../fixtures/neovim-coordinate-contract';
import { observeStringCoordinate } from './string-coordinate-harness';
import {
    createCoordinateState,
    runLuaError,
    runLuaNumber,
    runLuaString,
    observeTextCoordinate,
} from './coordinate-harness';

const REQUIRED = [
    'vim.fn.getpos',
    'vim.fn.getcurpos',
    'vim.fn.setpos',
    'vim.api.nvim_buf_get_text',
    'vim.api.nvim_buf_set_text',
    'vim.api.nvim_buf_get_offset',
    'vim.fn.line2byte',
    'vim.fn.byte2line',
    'vim.api.nvim_win_get_cursor',
    'vim.api.nvim_win_set_cursor',
    'vim.api.nvim_buf_get_mark',
    'vim.fn.col',
    'vim.fn.charcol',
    'vim.fn.virtcol',
    'vim.fn.virtcol2col',
    'vim.str_byteindex',
    'vim.str_utfindex',
    'vim.str_utf_start',
    'vim.str_utf_end',
    'vim.str_utf_pos',
];

function containing(message: string) {
    return expect.stringContaining(message);
}

function assertCoordinateManifestCoverage() {
    const names = COORDINATE_API_MANIFEST.map((entry) => entry.name);
    const api = readFileSync('src/lua/api.ts', 'utf8');
    const fn = readFileSync('src/lua/fn.ts', 'utf8');
    const stdlib = readFileSync('src/lua/stdlib.ts', 'utf8');
    return {
        missing: REQUIRED.filter((name) => !names.includes(name)),
        extra: names.filter((name) => !REQUIRED.includes(name)),
        duplicate: names.filter((name, index) => names.indexOf(name) !== index),
        unregistered: REQUIRED.filter((name) => {
            const short = name.split('.').pop()!;
            if (name.startsWith('vim.str_'))
                return !stdlib.includes(
                    `lua.lua_setfield(L, vimIndex, to_luastring('${short}'))`,
                );
            return name.startsWith('vim.fn.')
                ? !fn.includes(`registry.set('${short}',`)
                : !api.includes(
                      `lua.lua_setfield(L, apiIndex, to_luastring('${short}'))`,
                  );
        }),
        incomplete: COORDINATE_API_MANIFEST.filter((entry) =>
            Object.values(entry).some(
                (value) =>
                    !value || (Array.isArray(value) && value.length === 0),
            ),
        ).map((entry) => entry.name),
        deferredOverlap: DEFERRED_COORDINATE_APIS.filter((name) =>
            names.some((active) => active.endsWith(`.${name}`)),
        ),
    };
}

function generateCoordinateCases() {
    return COORDINATE_API_MANIFEST.flatMap((entry) =>
        entry.cases.map((row) => ({
            ...row,
            bases: entry.bases,
            api: entry.name,
            title: `${entry.name} ${row.name}`,
        })),
    );
}

describe('coordinate manifest coverage', () => {
    it('requires exactly twenty real registrations with complete metadata', () => {
        expect(assertCoordinateManifestCoverage()).toEqual({
            missing: [],
            extra: [],
            duplicate: [],
            unregistered: [],
            incomplete: [],
            deferredOverlap: [],
        });
    });
});

describe('coordinate manifest conformance', () => {
    const exercised = new Set<string>();
    let completed = 0;
    afterAll(() => {
        if (
            completed === generateCoordinateCases().length &&
            REQUIRED.every((name) => exercised.has(name))
        )
            process.stdout.write(
                'coordinate manifest: 20/20 APIs exercised; 0 missing; 0 mismatches\n',
            );
    });
    for (const row of generateCoordinateCases()) {
        if (row.api.startsWith('vim.str_')) {
            it(row.title, () => {
                expect(observeStringCoordinate(row.api.slice(4), row)).toEqual({
                    actual: row.error
                        ? containing(String(row.expected))
                        : row.expected,
                    warnings: 0,
                });
                exercised.add(row.api);
                completed++;
            });
            continue;
        }
        it(row.title, () => {
            const state = createCoordinateState();
            const textApi =
                row.api.endsWith('nvim_buf_get_text') ||
                row.api.endsWith('nvim_buf_set_text');
            if (textApi) state.host.lines = [...(row.lines ?? [COORD_LINE])];
            state.host.cursor = { line: 3, col: 7 };
            if (row.goal !== undefined)
                state.host.cm = {
                    state: { vim: { lastHPos: row.goal } },
                } as unknown as CmAdapter;
            for (const mark of ['a', '[', ']', '<', '>'])
                state.host.marks.set(mark, { line: 2, ch: 6 });
            if (row.host === 'unloaded') state.host.loaded = false;
            if (row.host === 'empty') state.host.lines = [''];
            if (row.host === 'linewise') state.host.visualMode = 'V';
            try {
                if (row.setup)
                    runLuaString(state.L, `${row.setup}; return 'set'`);
                const call = `${row.api}(${row.args})`;
                let actual: string | number;
                if (row.error) {
                    actual = runLuaError(state.L, `return ${call}`);
                } else if (textApi) {
                    actual = observeTextCoordinate(
                        state,
                        row.api,
                        row.args,
                        row.rawBytes,
                    );
                } else if (row.api === 'vim.fn.setpos') {
                    const result = runLuaNumber(state.L, `return ${call}`);
                    const position = runLuaString(
                        state.L,
                        "return table.concat(vim.fn.getpos('.'), ':')",
                    );
                    actual = `${result};${state.host.cursor.line}:${state.host.cursor.col};${position}`;
                } else if (row.api.endsWith('nvim_win_set_cursor')) {
                    runLuaString(state.L, `${call}; return 'set'`);
                    actual = `${state.host.cursor.line}:${state.host.cursor.col}`;
                } else if (row.tuple) {
                    actual = runLuaString(
                        state.L,
                        `return table.concat(${call}, ':')`,
                    );
                    if (row.api.startsWith('vim.api.')) {
                        const parts = actual.split(':').map(Number);
                        actual = `${parts[0]! + 1 - row.bases.output[0]!}:${parts[1]! - row.bases.output[1]!}`;
                    }
                } else {
                    actual = runLuaNumber(state.L, `return ${call}`);
                }
                expect(actual).toEqual(
                    row.error ? containing(String(row.expected)) : row.expected,
                );
                exercised.add(row.api);
                completed++;
            } finally {
                destroyState(state.L);
            }
        });
    }
});

describe('coordinate manifest Lua byte-string seam', () => {
    it.each([
        [`#${JSON.stringify(COORD_LINE)}`, '14'],
        [`string.sub(${JSON.stringify(COORD_LINE)},6,9)`, '𝄞'],
    ])('%s', (expression, expected) => {
        const state = createCoordinateState();
        try {
            expect(
                runLuaString(state.L, `return tostring(${expression})`),
            ).toBe(expected);
        } finally {
            destroyState(state.L);
        }
    });
});
