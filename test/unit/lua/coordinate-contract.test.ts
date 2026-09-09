import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { destroyState } from '../../../src/lua/engine';
import { buildCharSpans, utf8Length } from '../../../src/lua/coordinates';
import {
    COORD_LINE,
    COORD_LINES,
    COORD_SPANS,
    OFFSET_CASES,
    BYTE_LINE_CASES,
} from '../../fixtures/neovim-coordinate-contract';
import {
    createCoordinateState,
    runLuaNumber,
    runLuaString,
    runLuaError,
    readBuffer,
} from './coordinate-harness';

describe('coordinate contract A1', () => {
    let state: ReturnType<typeof createCoordinateState>;
    beforeEach(() => {
        state = createCoordinateState(COORD_LINES);
    });
    afterEach(() => {
        destroyState(state.L);
    });

    it('UTF-8 spans preserve astral and composing boundaries [host fixture]', () => {
        expect(readBuffer(state)).toEqual([COORD_LINE, '', COORD_LINE]);
    });
    it('UTF-8 spans preserve astral and composing boundaries [span ranges]', () => {
        expect(
            buildCharSpans(readBuffer(state)[0], false).map((span) => [
                span.byteStart,
                span.byteEnd,
                span.utf16Start,
                span.utf16End,
            ]),
        ).toEqual(COORD_SPANS);
    });
    it.each([
        ['base bytes', '', 14],
        ['composing bytes', '\u0301', 16],
    ])(
        'UTF-8 spans preserve astral and composing boundaries [%s]',
        (_name, suffix, expected) => {
            expect(utf8Length(readBuffer(state)[0] + suffix)).toBe(expected);
        },
    );
    it.each([
        ['folded count', false, 6],
        ['composing count', true, 7],
    ] as const)(
        'UTF-8 spans preserve astral and composing boundaries [%s]',
        (_name, composing, expected) => {
            expect(
                buildCharSpans(readBuffer(state)[0] + '\u0301', composing)
                    .length,
            ).toBe(expected);
        },
    );
    it.each([
        ['charidx astral', 'vim.fn.charidx(s, 8)', 2],
        ['byteidx after astral', 'vim.fn.byteidx(s, 3)', 9],
        ['charidx folded EOL', 'vim.fn.charidx(s, 16)', 6],
        ['charidx composing EOL', 'vim.fn.charidx(s, 16, 1)', 7],
        ['byteidx composing EOL', 'vim.fn.byteidx(s, 6)', 16],
    ] as const)(
        'UTF-8 spans preserve astral and composing boundaries [%s]',
        (_name, expression, expected) => {
            expect(
                runLuaNumber(
                    state.L,
                    `local s = ${JSON.stringify(COORD_LINE + '\u0301')}; return ${expression}`,
                ),
            ).toBe(expected);
        },
    );

    it.each(OFFSET_CASES)(
        'offset ignores DOS fileformat [$format]',
        ({ format, offsets }) => {
            const actual = [0, 1, 2, 3].map((index) =>
                runLuaNumber(
                    state.L,
                    `vim.bo.fileformat = '${format}'; return vim.api.nvim_buf_get_offset(0, ${index})`,
                ),
            );
            expect(actual).toEqual(offsets);
        },
    );
    it.each(OFFSET_CASES)(
        'line byte offsets honor DOS fileformat [$format]',
        ({ format, positions }) => {
            const actual = [1, 2, 3, 4].map((line) =>
                runLuaNumber(
                    state.L,
                    `vim.bo.fileformat = '${format}'; return vim.fn.line2byte(${line})`,
                ),
            );
            expect(actual).toEqual(positions);
        },
    );
    it.each(BYTE_LINE_CASES)(
        'byte2line includes each EOL byte [$format]',
        ({ format, lastByte, lines }) => {
            const actual = Array.from({ length: lastByte + 1 }, (_, byte) =>
                runLuaNumber(
                    state.L,
                    `vim.bo.fileformat = '${format}'; return vim.fn.byte2line(${byte})`,
                ),
            );
            expect(actual).toEqual(lines);
        },
    );
    it.each([-1, 4])(
        'offset bounds throw rather than return minus one [index %s]',
        (index) => {
            expect(
                runLuaError(
                    state.L,
                    `return vim.api.nvim_buf_get_offset(0, ${index})`,
                ),
            ).toContain('index out of bounds');
        },
    );
    it('offset bounds throw rather than return minus one [fraction]', () => {
        expect(
            runLuaError(state.L, 'return vim.api.nvim_buf_get_offset(0, 1.5)'),
        ).toContain('integer');
    });
    it('offset bounds throw rather than return minus one [handle]', () => {
        state.host.loaded = false;
        expect(
            runLuaError(state.L, 'return vim.api.nvim_buf_get_offset(1, 0)'),
        ).toContain('buffer numbers other than 0');
    });
    it.each([
        'vim.fn.line2byte(0)',
        'vim.fn.line2byte(5)',
        'vim.fn.line2byte(1.5)',
        'vim.fn.byte2line(1.5)',
    ])('line byte offsets honor DOS fileformat [invalid %s]', (expression) => {
        expect(runLuaNumber(state.L, `return ${expression}`)).toBe(-1);
    });
    it.each([
        'vim.api.nvim_buf_get_offset(0, 0)',
        'vim.fn.line2byte(1)',
        'vim.fn.byte2line(1)',
    ])(
        'unloaded and empty buffers are distinct [unloaded %s]',
        (expression) => {
            state.host.loaded = false;
            expect(runLuaNumber(state.L, `return ${expression}`)).toBe(-1);
        },
    );
    it.each([
        ['unix', '0,1;1,2;1,-1'],
        ['dos', '0,1;1,3;1,1,-1'],
    ])(
        'unloaded and empty buffers are distinct [empty %s]',
        (format, expected) => {
            state.host.lines = [COORD_LINES[1]];
            expect(
                runLuaString(
                    state.L,
                    `vim.bo.fileformat = '${format}'
            local bytes = {}
            for i = 1, ${format === 'dos' ? 3 : 2} do bytes[i] = vim.fn.byte2line(i) end
            return table.concat({vim.api.nvim_buf_get_offset(0,0), vim.api.nvim_buf_get_offset(0,1)}, ',') .. ';' ..
                table.concat({vim.fn.line2byte(1), vim.fn.line2byte(2)}, ',') .. ';' .. table.concat(bytes, ',')`,
                ),
            ).toBe(expected);
        },
    );
});
