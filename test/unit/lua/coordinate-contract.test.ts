import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import type { CmAdapter } from '../../../src/types/vim-api';
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

describe('coordinate contract Windows', () => {
    let state: ReturnType<typeof createCoordinateState>;
    const names = [
        'nvim_win_is_valid',
        'nvim_win_get_width',
        'nvim_win_get_height',
        'nvim_win_get_position',
        'nvim_win_get_number',
    ];
    function geometryAdapter() {
        const editorState = EditorState.create({ doc: COORD_LINES.join('\n') });
        return {
            cm6: {
                state: editorState,
                visibleRanges: [{ from: 0, to: editorState.doc.length }],
                viewport: { from: 0, to: editorState.doc.length },
                viewportLineBlocks: [],
                documentTop: 0,
                defaultCharacterWidth: 8,
                defaultLineHeight: 20,
                scrollDOM: {
                    clientTop: 0,
                    clientWidth: 640,
                    clientHeight: 200,
                    getBoundingClientRect: () => ({ top: 0 }),
                },
                dom: { querySelector: () => null },
            },
            lastLine: () => 2,
        };
    }
    beforeEach(() => {
        state = createCoordinateState(COORD_LINES);
        state.host.cm = geometryAdapter() as unknown as CmAdapter;
    });
    afterEach(() => {
        destroyState(state.L);
        vi.restoreAllMocks();
    });

    it.each([
        ['valid', 'tostring(vim.api.nvim_win_is_valid(0))', 'true'],
        [
            'position',
            "'[' .. table.concat(vim.api.nvim_win_get_position(0), ',') .. ']'",
            '[0,0]',
        ],
        [
            'identity',
            "table.concat({vim.fn.win_getid(), vim.api.nvim_win_get_number(0), table.unpack(vim.api.nvim_win_get_position(0))}, ',')",
            '0,1,0,0',
        ],
    ])('handle zero has one ordinal [%s]', (_name, expression, expected) => {
        expect(runLuaString(state.L, `return ${expression}`)).toBe(expected);
    });
    it.each([
        ['win_getid()', 0],
        ['win_getid(1)', 0],
        ['win_getid(1,1)', 0],
        ['win_getid(2)', 0],
        ['win_getid(1,2)', 0],
        ['win_getid(0)', 0],
        ['winnr()', 1],
        ["winnr('$')", 1],
        ["winnr('#')", 0],
    ] as const)('handle zero has one ordinal [%s]', (expression, expected) => {
        expect(runLuaNumber(state.L, `return vim.fn.${expression}`)).toBe(
            expected,
        );
    });
    it.each([
        ...names.map((name) => `vim.api.${name}(0)`),
        'vim.fn.win_getid()',
        'vim.fn.winnr()',
    ])('handle zero has one ordinal [no stub warning %s]', (expression) => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        runLuaString(state.L, `${expression}; return 'done'`);
        expect(warn.mock.calls.length).toBe(0);
    });
    it.each(['api', 'getwininfo'])(
        'geometry is live cells not pixels [%s]',
        (source) => {
            const adapter = geometryAdapter();
            state.host.cm = adapter as unknown as CmAdapter;
            const measure = () =>
                source === 'api'
                    ? [
                          runLuaNumber(
                              state.L,
                              'return vim.api.nvim_win_get_width(0)',
                          ),
                          runLuaNumber(
                              state.L,
                              'return vim.api.nvim_win_get_height(0)',
                          ),
                      ]
                    : [
                          runLuaNumber(
                              state.L,
                              'return vim.fn.getwininfo(0)[1].width',
                          ),
                          runLuaNumber(
                              state.L,
                              'return vim.fn.getwininfo(0)[1].height',
                          ),
                      ];
            const before = measure();
            adapter.cm6.scrollDOM.clientWidth = 400;
            adapter.cm6.scrollDOM.clientHeight = 120;
            expect([...before, ...measure()]).toEqual([80, 10, 50, 6]);
        },
    );
    it.each([-1, 1])('nonzero handles stay invalid [validity %s]', (handle) => {
        expect(
            runLuaString(
                state.L,
                `return tostring(vim.api.nvim_win_is_valid(${handle}))`,
            ),
        ).toBe('false');
    });
    it.each(
        names
            .slice(1)
            .flatMap((name) =>
                [-1, 1].map((handle) => [name, handle] as const),
            ),
    )('nonzero handles stay invalid [%s %s]', (name, handle) => {
        expect(
            runLuaError(state.L, `return vim.api.${name}(${handle})`),
        ).toContain('window numbers other than 0');
    });
    it.each(
        names.flatMap((name) =>
            ['', '0,0'].map((args) => [name, args] as const),
        ),
    )('handle zero has one ordinal [arity %s(%s)]', (name, args) => {
        expect(
            runLuaError(state.L, `return vim.api.${name}(${args})`),
        ).toContain('expected 1 argument');
    });
    it.each(
        names.flatMap((name) =>
            ['nil', 'true', "'0'", '{}', '0.5'].map(
                (arg) => [name, arg] as const,
            ),
        ),
    )('handle zero has one ordinal [type %s(%s)]', (name, arg) => {
        expect(
            runLuaError(state.L, `return vim.api.${name}(${arg})`),
        ).toContain('expected integer window number');
    });
    it.each([
        ['win_getid(1,1,1)', 'expected at most 2 arguments'],
        ['winnr("$",1)', 'expected at most 1 argument'],
        ['win_getid(true)', 'expected integer ordinal'],
        ['win_getid(1,{})', 'expected integer ordinal'],
        ['win_getid(1.5)', 'expected integer ordinal'],
        ['winnr({})', 'expected window expression'],
        ['winnr("invalid")', 'invalid window expression'],
    ])(
        'handle zero has one ordinal [fn validation %s]',
        (expression, expected) => {
            expect(
                runLuaError(state.L, `return vim.fn.${expression}`),
            ).toContain(expected);
        },
    );
    it('missing editor has no measurable geometry [dimensions]', () => {
        state.host.cm = null;
        expect([
            runLuaNumber(state.L, 'return vim.api.nvim_win_get_width(0)'),
            runLuaNumber(state.L, 'return vim.api.nvim_win_get_height(0)'),
        ]).toEqual([0, 0]);
    });
    it('missing editor has no measurable geometry [identity]', () => {
        state.host.cm = null;
        expect(
            runLuaString(
                state.L,
                "return tostring(vim.api.nvim_win_is_valid(0)) .. ':' .. table.concat({vim.fn.win_getid(), vim.fn.winnr(), vim.api.nvim_win_get_number(0), table.unpack(vim.api.nvim_win_get_position(0))}, ',')",
            ),
        ).toBe('true:0,1,1,0,0');
    });
});

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
