import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { readFileSync } from 'node:fs';
import type { CmAdapter } from '../../../src/types/vim-api';
import { destroyState } from '../../../src/lua/engine';
import { buildCharSpans, utf8Length } from '../../../src/lua/coordinates';
import { STRING_COORDINATE_CASES } from '../../fixtures/neovim-string-coordinate-contract';
import { observeStringCoordinate } from './string-coordinate-harness';
import {
    TEXT_READ_CASES,
    TEXT_WRITE_CASES,
} from '../../fixtures/neovim-text-coordinate-contract';
import {
    COORD_LINE,
    COORD_LINES,
    COORD_SPANS,
    OFFSET_CASES,
    BYTE_LINE_CASES,
    COLUMN_BOUNDARIES,
    INTERIOR_CURSOR_DEVIATIONS,
    DISPLAY_LOOKUPS,
} from '../../fixtures/neovim-coordinate-contract';
import {
    createCoordinateState,
    runLuaNumber,
    runLuaString,
    runLuaError,
    readBuffer,
    observeTextCoordinate,
} from './coordinate-harness';

describe('coordinate contract text bytes', () => {
    for (const [api, cases] of [
        ['vim.api.nvim_buf_get_text', TEXT_READ_CASES],
        ['vim.api.nvim_buf_set_text', TEXT_WRITE_CASES],
    ] as const) {
        it.each(cases)('$name', (row) => {
            const state = createCoordinateState(row.lines ?? [COORD_LINE]);
            try {
                const actual = row.error
                    ? runLuaError(state.L, `return ${api}(${row.args})`)
                    : observeTextCoordinate(state, api, row.args, row.rawBytes);
                const expectedError = expect.stringContaining(row.expected);
                expect(actual).toEqual(
                    row.error ? expectedError : row.expected,
                );
            } finally {
                destroyState(state.L);
            }
        });
    }
});

describe('coordinate contract str family', () => {
    function containing(message: string) {
        return expect.stringContaining(message);
    }
    for (const [name, rows] of Object.entries(STRING_COORDINATE_CASES)) {
        for (const row of rows) {
            it(`${name} ${row.name}`, () => {
                expect(observeStringCoordinate(name, row)).toEqual({
                    actual: row.error
                        ? containing(String(row.expected))
                        : row.expected,
                    warnings: 0,
                });
            });
        }
    }
});

interface OracleColumns {
    col: number;
    charcol: number;
    virtcol: number;
    cells: [number, number];
}

interface CoordinateOracle {
    version: string;
    profiles: {
        name: string;
        text: string;
        options: {
            tabstop: number;
            fileformat: string;
            list: boolean;
            listchars: string;
            wrap: boolean;
            showbreak: string;
            breakindent: boolean;
            linebreak: boolean;
            width: number;
            number: boolean;
            relativenumber: boolean;
            signcolumn: string;
            foldcolumn: string;
            ambiwidth: string;
            display: string;
            virtualedit: string;
        };
        boundaries: (OracleColumns & {
            byte: number;
            expressions: OracleColumns;
            virtcol2col: [number, number];
        })[];
        occupied: (OracleColumns & {
            cell: number;
            byte_col: number;
            expressions: Pick<OracleColumns, 'col' | 'charcol'>;
        })[];
        expressions: {
            col_eol: number;
            charcol_eol: number;
            virtcol_eol: number;
            cells_eol: [number, number];
        };
    }[];
}

const oracle: CoordinateOracle = JSON.parse(
    readFileSync(
        new URL(
            '../../fixtures/neovim-coordinate-oracle.json',
            import.meta.url,
        ),
        'utf8',
    ),
);

describe('coordinate contract deletebufline', () => {
    let state: ReturnType<typeof createCoordinateState>;
    beforeEach(() => {
        state = createCoordinateState(COORD_LINES);
    });
    afterEach(() => {
        destroyState(state.L);
        vi.restoreAllMocks();
    });
    it.each([
        ['deletes middle empty line', '0,2', 2, [COORD_LINE, COORD_LINE]],
        ['deletes final line without empty tail', '0,3', 2, [COORD_LINE, '']],
        ['delete all leaves one empty line', "0,1,'$'", 1, ['']],
        ['deletes inclusive range', '0,1,2', 1, [COORD_LINE]],
        ['clamps oversized end', '0,2,99', 1, [COORD_LINE]],
    ] as const)('%s', (_name, args, count, lines) => {
        const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const result = runLuaNumber(
            state.L,
            `return vim.fn.deletebufline(${args})`,
        );
        expect({
            result,
            count: readBuffer(state).length,
            lines: readBuffer(state),
            warnings: warnings.mock.calls.length,
        }).toEqual({ result: 0, count, lines, warnings: 0 });
    });
    it.each([
        ['zero first', '0,0'],
        ['negative first', '0,-1'],
        ['past last first', '0,4'],
        ['reversed range', '0,3,2'],
        ['zero last', '0,1,0'],
        ['fractional first', '0,1.5'],
        ['fractional last', '0,1,2.5'],
        ['invalid first string', "0,'invalid'"],
        ['invalid last string', "0,1,'invalid'"],
        ['nonzero buffer', '1,2'],
        ['negative buffer', '-1,2'],
        ['fractional buffer', '0.5,2'],
        ['nil buffer', 'nil,2'],
        ['boolean buffer', 'false,2'],
        ['string buffer', "'0',2"],
        ['missing first', '0'],
        ['extra argument', '0,1,2,3'],
    ])('invalid range or buffer leaves text untouched [%s]', (_name, args) => {
        const result = runLuaNumber(
            state.L,
            `return vim.fn.deletebufline(${args})`,
        );
        expect({
            result,
            count: readBuffer(state).length,
            lines: readBuffer(state),
        }).toEqual({ result: 1, count: 3, lines: COORD_LINES });
    });
    it('callback unavailable leaves text untouched', () => {
        destroyState(state.L);
        state = createCoordinateState(COORD_LINES, { setLines: undefined });
        const result = runLuaNumber(
            state.L,
            'return vim.fn.deletebufline(0,2)',
        );
        expect({
            result,
            count: readBuffer(state).length,
            lines: readBuffer(state),
        }).toEqual({ result: 1, count: 3, lines: COORD_LINES });
    });
    it('unloaded buffer leaves text untouched', () => {
        state.host.loaded = false;
        const result = runLuaNumber(
            state.L,
            'return vim.fn.deletebufline(0,2)',
        );
        expect({
            result,
            count: readBuffer(state).length,
            lines: readBuffer(state),
        }).toEqual({ result: 1, count: 3, lines: COORD_LINES });
    });
});

describe('coordinate contract A2', () => {
    let state: ReturnType<typeof createCoordinateState>;
    beforeEach(() => {
        state = createCoordinateState();
        state.host.cursor = { line: 3, col: 7 };
    });
    afterEach(() => destroyState(state.L));
    it.each(['col', 'charcol'] as const)(
        'col resolves all argument forms / charcol counts astral once [%s]',
        (fn) => {
            const actual = COLUMN_BOUNDARIES.map(([host, , byte, char]) => {
                state.host.cursor = { line: 3, col: host + 1 };
                state.host.marks.set('a', { line: 2, ch: host });
                return runLuaString(
                    state.L,
                    `return table.concat({vim.fn.${fn}('.'),vim.fn.${fn}({3,${fn === 'col' ? byte : char}}),vim.fn.${fn}("'a")}, ':')`,
                );
            });
            expect(actual).toEqual(
                fn === 'col'
                    ? [
                          '1:1:1',
                          '3:3:3',
                          '6:6:6',
                          '10:10:10',
                          '13:13:13',
                          '14:14:14',
                          '15:15:15',
                      ]
                    : [
                          '1:1:1',
                          '2:2:2',
                          '3:3:3',
                          '4:4:4',
                          '5:5:5',
                          '6:6:6',
                          '7:7:7',
                      ],
            );
        },
    );
    it('virtcol list precedes winid', () => {
        expect(
            runLuaString(
                state.L,
                'return table.concat(vim.fn.virtcol({1,13},1,0), ":")',
            ),
        ).toBe('6:8');
    });
    it.each(oracle.profiles)(
        'virtcol honors six window profiles [$name]',
        (profile) => {
            state.host.lines = [profile.text, '', profile.text];
            state.host.cm = {
                cm6: {
                    defaultCharacterWidth: 8,
                    defaultLineHeight: 20,
                    scrollDOM: {
                        clientWidth: profile.options.width * 8,
                        clientHeight: 200,
                    },
                },
            } as unknown as CmAdapter;
            for (const [key, val] of Object.entries(profile.options)) {
                if (key === 'width') continue;
                const scope =
                    key === 'tabstop' || key === 'fileformat' ? 'bo' : 'wo';
                runLuaString(
                    state.L,
                    `vim.${scope}[${JSON.stringify(key)}] = ${JSON.stringify(val)}; return 'set'`,
                );
            }
            const actual = profile.boundaries.map((row) => {
                const offset =
                    COLUMN_BOUNDARIES.find(
                        (boundary) => boundary[1] === row.byte % 14,
                    )?.[0] ?? 0;
                state.host.cursor = {
                    line: 1,
                    col: Math.floor(row.byte / 14) * 7 + offset + 1,
                };
                const numbers = runLuaString(
                    state.L,
                    `return table.concat({vim.fn.col({1,${row.byte + 1}}),vim.fn.charcol({1,${row.byte + 1}}),vim.fn.virtcol({1,${row.byte + 1}}),table.unpack(vim.fn.virtcol({1,${row.byte + 1}},true))}, ':')`,
                )
                    .split(':')
                    .map(Number);
                const expressions = runLuaString(
                    state.L,
                    `return table.concat({vim.fn.col('.'),vim.fn.charcol('.'),vim.fn.virtcol('.'),table.unpack(vim.fn.virtcol('.',true))}, ':')`,
                )
                    .split(':')
                    .map(Number);
                const inverse = row.cells.map((cell) =>
                    runLuaNumber(
                        state.L,
                        `return vim.fn.virtcol2col(0,1,${cell})`,
                    ),
                );
                return {
                    byte: row.byte,
                    col: numbers[0],
                    charcol: numbers[1],
                    virtcol: numbers[2],
                    cells: numbers.slice(3),
                    expressions: {
                        col: expressions[0],
                        charcol: expressions[1],
                        virtcol: expressions[2],
                        cells: expressions.slice(3),
                    },
                    virtcol2col: inverse,
                };
            });
            const occupied = profile.occupied.map((row) => {
                const byte = runLuaNumber(
                    state.L,
                    `return vim.fn.virtcol2col(0,1,${row.cell})`,
                );
                const offset =
                    COLUMN_BOUNDARIES.find(
                        (boundary) => boundary[1] === (byte - 1) % 14,
                    )?.[0] ?? 0;
                state.host.cursor = {
                    line: 1,
                    col: Math.floor((byte - 1) / 14) * 7 + offset + 1,
                };
                const fields = runLuaString(
                    state.L,
                    `return table.concat({vim.fn.col({1,${byte}}),vim.fn.charcol({1,${byte}}),vim.fn.virtcol({1,${byte}}),table.unpack(vim.fn.virtcol({1,${byte}},true))}, ':')`,
                )
                    .split(':')
                    .map(Number);
                const expr = runLuaString(
                    state.L,
                    `return table.concat({vim.fn.col('.'),vim.fn.charcol('.')}, ':')`,
                )
                    .split(':')
                    .map(Number);
                return {
                    cell: row.cell,
                    byte_col: byte,
                    col: fields[0],
                    charcol: fields[1],
                    virtcol: fields[2],
                    cells: fields.slice(3),
                    expressions: { col: expr[0], charcol: expr[1] },
                };
            });
            const eol = runLuaString(
                state.L,
                `return table.concat({vim.fn.col('$'),vim.fn.charcol('$'),vim.fn.virtcol('$'),table.unpack(vim.fn.virtcol('$',true))}, ':')`,
            )
                .split(':')
                .map(Number);
            const expressions = {
                col_eol: eol[0],
                charcol_eol: eol[1],
                virtcol_eol: eol[2],
                cells_eol: eol.slice(3),
            };
            expect({ boundaries: actual, occupied, expressions }).toEqual({
                boundaries: profile.boundaries,
                occupied: profile.occupied,
                expressions: profile.expressions,
            });
        },
    );
    it('virtcol honors six window profiles [options mutate between calls]', () => {
        const actual: string[] = [];
        for (const tabstop of [8, 2, 8]) {
            actual.push(
                runLuaString(
                    state.L,
                    `vim.bo.tabstop=${tabstop}; return table.concat(vim.fn.virtcol({1,13},true), ':')`,
                ),
            );
        }
        expect(actual).toEqual(['6:8', '6:6', '6:8']);
    });
    it('virtcol honors six window profiles [nowrap wide edge transformation]', () => {
        state.host.lines = ['é'.repeat(76) + COORD_LINE, '', COORD_LINE];
        state.host.cm = {
            cm6: {
                defaultCharacterWidth: 8,
                defaultLineHeight: 20,
                scrollDOM: { clientWidth: 640, clientHeight: 200 },
            },
        } as unknown as CmAdapter;
        expect(
            runLuaString(
                state.L,
                `vim.wo.wrap=false; return table.concat(vim.fn.virtcol({1,162},true), ':')`,
            ),
        ).toBe('80:81');
    });
    it.each(['math.huge', '1e100', '0.5', '0', '-1'])(
        'virtcol rejects unsafe tabstop [%s]',
        (tabstop) => {
            state.host.cm = {
                cm6: {
                    defaultCharacterWidth: 8,
                    defaultLineHeight: 20,
                    scrollDOM: { clientWidth: 640, clientHeight: 200 },
                },
            } as unknown as CmAdapter;
            expect(
                runLuaString(
                    state.L,
                    `vim.bo.tabstop=${tabstop}; return table.concat(vim.fn.virtcol({1,13},true), ':')`,
                ),
            ).toBe('6:8');
        },
    );
    it('virtcol2col collapses and clamps', () => {
        expect(
            DISPLAY_LOOKUPS.map(([win, line, col]) =>
                runLuaNumber(
                    state.L,
                    `return vim.fn.virtcol2col(${win},${line},${col})`,
                ),
            ),
        ).toEqual([10, 10, 13, 13, 13, 14, 14, 14, 1, -1, -1, 1, -1, 0, -1]);
    });
    it.each(INTERIOR_CURSOR_DEVIATIONS)(
        'cursor middle-byte normalization deviation [byte %s]',
        (byte, host, normalized, col, charcol) => {
            const result = runLuaString(
                state.L,
                `vim.api.nvim_win_set_cursor(0,{3,${byte}}); local p=vim.api.nvim_win_get_cursor(0); return table.concat({p[1],p[2],vim.fn.col('.'),vim.fn.charcol('.')}, ':')`,
            );
            expect([state.host.cursor, result]).toEqual([
                { line: 3, col: host },
                `3:${normalized}:${col}:${charcol}`,
            ]);
        },
    );
    it('cursor past EOL clamps natively', () => {
        expect(
            runLuaString(
                state.L,
                `vim.api.nvim_win_set_cursor(0,{3,15}); local p=vim.api.nvim_win_get_cursor(0); return table.concat({p[1],p[2],vim.fn.col('.'),vim.fn.charcol('.')}, ':')`,
            ),
        ).toBe('3:14:15:7');
    });
    it.each(['infinity', 'visual metadata', 'ordinary EOL'])(
        'linewise mark preserves maxcol [%s]',
        (kind) => {
            state.host.marks.set('>', {
                line: 2,
                ch: kind === 'infinity' ? Infinity : 7,
            });
            state.host.visualMode = kind === 'visual metadata' ? 'V' : 'v';
            expect(
                runLuaString(
                    state.L,
                    `local p=vim.api.nvim_buf_get_mark(0,'>'); return table.concat({p[1],p[2],vim.v.maxcol,vim.api.nvim_get_vvar('maxcol')}, ':')`,
                ),
            ).toBe(
                kind === 'ordinary EOL'
                    ? '3:14:2147483647:2147483647'
                    : '3:2147483647:2147483647:2147483647',
            );
        },
    );
    it.each([
        'nil',
        '{}',
        '{3}',
        '{0,1}',
        '{4,1}',
        '{3,-1}',
        '{3,1.5}',
        '{3,"1"}',
    ])('invalid positions do not masquerade as valid coverage [%s]', (pos) => {
        expect(
            runLuaError(
                state.L,
                `return vim.api.nvim_win_set_cursor(0,${pos})`,
            ),
        ).toContain('nvim_win_set_cursor:');
    });
});

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
        const line = readBuffer(state)[0];
        if (line === undefined)
            throw new Error('Missing first coordinate line');
        expect(
            buildCharSpans(line, false).map((span) => [
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
            const emptyLine = COORD_LINES[1];
            if (emptyLine === undefined)
                throw new Error('Missing empty coordinate line');
            state.host.lines = [emptyLine];
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
