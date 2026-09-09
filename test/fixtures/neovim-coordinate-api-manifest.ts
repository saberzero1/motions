import {
    COLUMN_BOUNDARIES,
    DISPLAY_LOOKUPS,
} from './neovim-coordinate-contract';
import { STRING_COORDINATE_CASES } from './neovim-string-coordinate-contract';
import {
    EXTMARK_WRITE_CASES,
    EXTMARK_READ_CASES,
} from './neovim-extmark-coordinate-contract';
import {
    TEXT_READ_CASES,
    TEXT_WRITE_CASES,
} from './neovim-text-coordinate-contract';

interface CoordinateCase {
    name: string;
    args: string;
    expected: number | string;
    setup?: string;
    tuple?: boolean;
    multiple?: boolean;
    error?: boolean;
    rawBytes?: boolean;
    lines?: readonly string[];
    goal?: number;
    hostMark?: readonly [number, number, number, number];
    host?: 'unloaded' | 'empty' | 'linewise';
}

interface CoordinateApiEntry {
    name: string;
    forms: string[];
    inputUnit: string;
    outputUnit: string;
    bases: { input: number[]; output: number[] };
    direction: string;
    invalid: string;
    typeError: string;
    empty: string;
    unloaded: string;
    sentinel: string;
    operation: string;
    cases: CoordinateCase[];
}

const columnCases = (unit: 'byte' | 'character'): CoordinateCase[] => [
    { name: 'cursor Z', args: "'.'", expected: unit === 'byte' ? 14 : 6 },
    { name: 'expression EOL', args: "'$'", expected: unit === 'byte' ? 15 : 7 },
    { name: 'list EOL', args: "{1,'$'}", expected: unit === 'byte' ? 15 : 7 },
    ...Array.from({ length: 16 }, (_, index) => ({
        name: `list column ${index + 1}`,
        args: `{1,${index + 1}}`,
        expected: index < (unit === 'byte' ? 15 : 7) ? index + 1 : 0,
    })),
    ...['a', '[', ']', '<', '>'].map((mark) => ({
        name: `mark ${mark}`,
        args: JSON.stringify(`'${mark}`),
        expected: unit === 'byte' ? 14 : 6,
    })),
    ...[
        '{0,1}',
        '{4,1}',
        '{1,0}',
        '{}',
        '{1}',
        "{1,'x'}",
        "{'$',1}",
        "'unknown'",
        '"\'z"',
    ].map((args) => ({ name: `invalid ${args}`, args, expected: 0 })),
    ...['42', 'true', 'nil'].map((args) => ({
        name: `type ${args}`,
        args,
        error: true,
        expected: 'String or List required',
    })),
    {
        name: 'fractional list column',
        args: '{1,1.5}',
        error: true,
        expected: 'Float',
    },
    { name: 'empty list position', args: '{2,1}', expected: 1 },
];

export const COORDINATE_API_MANIFEST: CoordinateApiEntry[] = [
    ...(
        [
            'nvim_buf_set_extmark',
            'nvim_buf_get_extmarks',
            'nvim_buf_get_extmark_by_id',
        ] as const
    ).map((name): CoordinateApiEntry => ({
        name: `vim.api.${name}`,
        forms:
            name === 'nvim_buf_set_extmark'
                ? ['buffer,namespace,row,col,opts.end_col']
                : ['buffer,namespace,query,opts.details'],
        inputUnit:
            name === 'nvim_buf_set_extmark'
                ? 'UTF-8 byte columns'
                : 'namespace and query',
        outputUnit:
            name === 'nvim_buf_set_extmark'
                ? 'id and host UTF-16 span'
                : 'UTF-8 byte columns including details.end_col',
        bases: { input: [0, 0], output: [0, 0] },
        direction:
            name === 'nvim_buf_set_extmark'
                ? 'Lua bytes to host UTF-16'
                : 'host UTF-16 to Lua bytes',
        invalid:
            'set columns outside 0..byte length inclusive error, never clamp',
        typeError: 'numeric columns required',
        empty: 'column zero is valid',
        unloaded: 'existing no-view return unchanged',
        sentinel:
            'interior bytes normalize start down, end up; CM6 cannot represent byte remainders (D4/D5 rationale)',
        operation:
            name === 'nvim_buf_set_extmark'
                ? 'extmarkColumnToHost'
                : 'extmarkColumnToByte',
        cases:
            name === 'nvim_buf_set_extmark'
                ? EXTMARK_WRITE_CASES
                : EXTMARK_READ_CASES.map((row) => ({
                      ...row,
                      args:
                          name === 'nvim_buf_get_extmarks'
                              ? '0,1,0,-1,{details=true}'
                              : '0,1,1,{details=true}',
                  })),
    })),
    ...(['getpos', 'getcurpos', 'setpos'] as const).map(
        (name): CoordinateApiEntry => ({
            name: `vim.fn.${name}`,
            forms:
                name === 'setpos'
                    ? ['expr,{buffer,line,byte,off}']
                    : name === 'getpos'
                      ? ['.', 'mark']
                      : ['current cursor'],
            inputUnit:
                name === 'setpos'
                    ? '1-based UTF-8 byte column'
                    : 'position expression',
            outputUnit:
                name === 'getcurpos'
                    ? 'buffer,line,byte,off,desired display cell'
                    : name === 'getpos'
                      ? 'buffer,line,byte,off'
                      : 'status and host UTF-16 position',
            bases: { input: [0, 1, 1], output: [0, 1, 1, 0] },
            direction: name === 'setpos' ? 'Lua to host' : 'host to Lua',
            invalid:
                name === 'setpos'
                    ? '-1 for unavailable line or invalid expression'
                    : 'zero position for unavailable expression',
            typeError: 'position name must be a string',
            empty: 'column 1',
            unloaded: name === 'setpos' ? '-1' : 'zero position',
            sentinel:
                'unset marks stay zero; D4 interior bytes normalize; linewise mark / $ desired goal preserve MAXCOL',
            operation:
                name === 'setpos'
                    ? 'writeLegacyPosition'
                    : 'readLegacyPosition',
            cases:
                name === 'setpos'
                    ? [
                          {
                              name: 'cursor astral roundtrip',
                              args: "'.',{0,3,6,0}",
                              expected: '0;3:3;0:3:6:0',
                          },
                      ]
                    : name === 'getcurpos'
                      ? [
                            {
                                name: 'cursor Z five elements',
                                args: '',
                                goal: -1,
                                tuple: true,
                                expected: '0:3:14:0:9',
                            },
                            {
                                name: 'wide character first cell',
                                args: '',
                                setup: 'vim.api.nvim_win_set_cursor(0,{3,9})',
                                tuple: true,
                                expected: '0:3:10:0:4',
                            },
                            {
                                name: 'tab last cell',
                                args: '',
                                setup: 'vim.api.nvim_win_set_cursor(0,{3,12})',
                                tuple: true,
                                expected: '0:3:13:0:8',
                            },
                            {
                                name: 'sticky goal on empty line after 10|j',
                                args: '',
                                setup: 'vim.api.nvim_win_set_cursor(0,{2,0})',
                                goal: 9,
                                tuple: true,
                                expected: '0:2:1:0:10',
                            },
                        ]
                      : [
                            {
                                name: 'cursor Z',
                                args: "'.'",
                                tuple: true,
                                expected: '0:3:14:0',
                            },
                            {
                                name: 'mark Z',
                                args: '"\'a"',
                                tuple: true,
                                expected: '0:3:14:0',
                            },
                            {
                                name: 'unset mark',
                                args: '"\'z"',
                                tuple: true,
                                expected: '0:0:0:0',
                            },
                        ],
        }),
    ),
    ...(['get', 'set'] as const).map((operation): CoordinateApiEntry => ({
        name: `vim.api.nvim_buf_${operation}_text`,
        forms: [
            'buffer,start_row,start_col,end_row,end_col,' +
                (operation === 'get' ? 'opts' : 'replacement'),
        ],
        inputUnit: 'UTF-8 byte columns',
        outputUnit:
            operation === 'get' ? 'raw Lua byte strings' : 'host UTF-16 text',
        bases: { input: [0, 0, 0, 0, 0], output: [0] },
        direction:
            operation === 'get'
                ? 'host UTF-8 encoding to Lua'
                : 'Lua byte range to host UTF-16 range',
        invalid:
            operation === 'get'
                ? 'columns past EOL clamp'
                : 'columns past EOL error',
        typeError: 'integer coordinate required',
        empty:
            operation === 'get' ? 'one empty string' : 'zero-column insertion',
        unloaded: 'row out of range',
        sentinel:
            operation === 'get'
                ? 'interior bytes preserved (native match)'
                : 'D5 deviation: interior start down, end up',
        operation: operation === 'get' ? 'readText' : 'writeText',
        cases: operation === 'get' ? TEXT_READ_CASES : TEXT_WRITE_CASES,
    })),
    ...[
        'str_byteindex',
        'str_utfindex',
        'str_utf_start',
        'str_utf_end',
        'str_utf_pos',
    ].map((name): CoordinateApiEntry => ({
        name: `vim.${name}`,
        forms:
            name === 'str_byteindex'
                ? ['s,index[,use_utf16]', 's,encoding,index[,strict_indexing]']
                : name === 'str_utfindex'
                  ? [
                        's[,byte_index] -> utf32,utf16',
                        's,encoding[,byte_index[,strict_indexing]]',
                    ]
                  : name === 'str_utf_pos'
                    ? ['s; extra arguments ignored']
                    : ['s,byte_index; extra arguments ignored'],
        inputUnit:
            name === 'str_utf_pos'
                ? 'UTF-8 string'
                : name === 'str_byteindex'
                  ? 'UTF-8 bytes / UTF-16 units / UTF-32 code points'
                  : 'UTF-8 string and byte index',
        outputUnit:
            name === 'str_utfindex'
                ? 'UTF-32 then UTF-16 in old form; selected encoding in modern form'
                : name === 'str_utf_pos'
                  ? 'code point byte starts'
                  : 'bytes',
        bases: {
            input:
                name === 'str_utf_pos'
                    ? []
                    : [
                          name === 'str_utf_start' || name === 'str_utf_end'
                              ? 1
                              : 0,
                      ],
            output:
                name === 'str_utfindex'
                    ? [0, 0]
                    : [name === 'str_utf_pos' ? 1 : 0],
        },
        direction:
            name === 'str_utf_pos'
                ? 'string to code point byte-start list'
                : name === 'str_byteindex'
                  ? 'encoding index to byte'
                  : name === 'str_utfindex'
                    ? 'byte to encoding index'
                    : 'byte to relative code point boundary displacement',
        invalid:
            name === 'str_utf_pos'
                ? 'no index argument'
                : name === 'str_utf_start' || name === 'str_utf_end'
                  ? 'bounds error; no strict-indexing argument'
                  : 'bounds error; modern strict=false returns end; utf-8 negative identity',
        typeError:
            name === 'str_utf_pos'
                ? 'string expected'
                : name === 'str_utf_start' || name === 'str_utf_end'
                  ? 'string/number expected'
                  : 'string/number/encoding/strict-indexing validation errors',
        empty:
            name === 'str_utf_pos'
                ? 'empty list'
                : name === 'str_utf_start' || name === 'str_utf_end'
                  ? 'bounds error'
                  : 'index zero returns zero (two zeros in old utfindex)',
        unloaded: 'string-only; buffer independent',
        sentinel:
            name === 'str_utf_pos'
                ? 'none; EOL is not a code point start'
                : name === 'str_utf_start' || name === 'str_utf_end'
                  ? 'relative displacement, not absolute offset'
                  : 'no sentinel; conversion rounds interior indices up',
        operation: {
            str_byteindex: 'stringByteIndex',
            str_utfindex: 'stringUtfIndex',
            str_utf_start: 'stringUtfStart',
            str_utf_end: 'stringUtfEnd',
            str_utf_pos: 'stringUtfPositions',
        }[name]!,
        cases: STRING_COORDINATE_CASES[name]!,
    })),
    {
        name: 'vim.api.nvim_buf_get_offset',
        forms: ['buffer,index'],
        inputUnit: 'line',
        outputUnit: 'byte offset',
        bases: { input: [0, 0], output: [0] },
        direction: 'host to Lua',
        invalid: 'bounds error',
        typeError: 'integer error',
        empty: 'one EOL byte',
        unloaded: '-1',
        sentinel: 'none',
        operation: 'bufferOffset',
        cases: [0, 15, 16, 31].map((expected, index) => ({
            name: `index ${index}`,
            args: `0,${index}`,
            expected,
        })),
    },
    {
        name: 'vim.fn.line2byte',
        forms: ['lnum'],
        inputUnit: 'line',
        outputUnit: 'byte position',
        bases: { input: [1], output: [1] },
        direction: 'host to Lua',
        invalid: '-1',
        typeError: 'number error',
        empty: 'EOL honors fileformat',
        unloaded: '-1',
        sentinel: 'one-past-last allowed',
        operation: 'lineToByte',
        cases: [1, 16, 17, 32].map((expected, index) => ({
            name: `line ${index + 1}`,
            args: `${index + 1}`,
            expected,
        })),
    },
    {
        name: 'vim.fn.byte2line',
        forms: ['byte'],
        inputUnit: 'byte position',
        outputUnit: 'line',
        bases: { input: [1], output: [1] },
        direction: 'Lua to host lookup',
        invalid: '-1',
        typeError: 'number error',
        empty: 'EOL belongs to line',
        unloaded: '-1',
        sentinel: 'none',
        operation: 'byteToLine',
        cases: [
            [0, -1],
            [1, 1],
            [15, 1],
            [16, 2],
            [17, 3],
            [31, 3],
            [32, -1],
        ].map(([byte, expected]) => ({
            name: `byte ${byte}`,
            args: `${byte}`,
            expected: expected!,
        })),
    },
    {
        name: 'vim.api.nvim_win_get_cursor',
        forms: ['winid'],
        inputUnit: 'window handle',
        outputUnit: 'line,byte',
        bases: { input: [0], output: [1, 0] },
        direction: 'host to Lua',
        invalid: 'handle error',
        typeError: 'handle error',
        empty: 'column 0',
        unloaded: '{1,0}',
        sentinel: 'none',
        operation: 'readCursor',
        cases: [{ name: 'cursor Z', args: '0', tuple: true, expected: '3:13' }],
    },
    {
        name: 'vim.api.nvim_win_set_cursor',
        forms: ['winid,{lnum,byte}'],
        inputUnit: 'line,byte',
        outputUnit: 'host UTF-16',
        bases: { input: [0, 1, 0], output: [1, 1] },
        direction: 'Lua to host',
        invalid: 'coordinate error',
        typeError: 'coordinate error',
        empty: 'column 1 in host',
        unloaded: 'coordinate error',
        sentinel: 'D4 interior-byte normalization; EOL clamps',
        operation: 'writeCursor',
        cases: COLUMN_BOUNDARIES.map(([host, byte]) => ({
            name: `byte ${byte}`,
            args: `0,{3,${byte}}`,
            tuple: true,
            expected: `3:${host + 1}`,
        })),
    },
    {
        name: 'vim.api.nvim_buf_get_mark',
        forms: ['buffer,mark'],
        inputUnit: 'mark name',
        outputUnit: 'line,byte',
        bases: { input: [0], output: [1, 0] },
        direction: 'host to Lua',
        invalid: 'name/handle error',
        typeError: 'name error',
        empty: 'column 0',
        unloaded: '{0,0}',
        sentinel: 'unset {0,0}; linewise end 2147483647',
        operation: 'readMark',
        cases: [
            {
                name: 'mark after astral',
                args: '0,"a"',
                tuple: true,
                expected: '3:13',
            },
            { name: 'unset', args: '0,"z"', tuple: true, expected: '0:0' },
        ],
    },
    {
        name: 'vim.fn.col',
        forms: ['.', '$', 'mark', '[lnum,col]', '[lnum,$]'],
        inputUnit: 'expression or byte list',
        outputUnit: 'byte',
        bases: { input: [1, 1], output: [1] },
        direction: 'host expression to Lua; list validation only',
        invalid: '0',
        typeError: 'String or List required; Float',
        empty: '1',
        unloaded: '0',
        sentinel: '$ is insertion EOL',
        operation: 'expressionByte',
        cases: columnCases('byte'),
    },
    {
        name: 'vim.fn.charcol',
        forms: ['.', '$', 'mark', '[lnum,col]', '[lnum,$]'],
        inputUnit: 'expression or character list',
        outputUnit: 'character',
        bases: { input: [1, 1], output: [1] },
        direction:
            'host expression via byte to character; list validation only',
        invalid: '0',
        typeError: 'String or List required; Float',
        empty: '1',
        unloaded: '0',
        sentinel: '$ is insertion EOL',
        operation: 'expressionCharacter',
        cases: columnCases('character'),
    },
    {
        name: 'vim.fn.virtcol',
        forms: ['expr', 'expr,list', 'expr,list,winid'],
        inputUnit: 'expression or byte list',
        outputUnit: 'display cell or inclusive range',
        bases: { input: [1, 1, 0], output: [1, 1] },
        direction: 'byte to display',
        invalid: '0 or [0,0] in list mode',
        typeError: 'String or List required',
        empty: '1 or [1,1]',
        unloaded: '0',
        sentinel: '$ is insertion EOL',
        operation: 'expressionDisplay',
        cases: [
            { name: 'cursor Z', args: "'.'", expected: 9 },
            { name: 'EOL', args: "'$'", expected: 10 },
            {
                name: 'list precedes winid',
                args: '{1,13},1,0',
                tuple: true,
                expected: '6:8',
            },
            {
                name: 'invalid line list',
                args: '{4,1},true',
                tuple: true,
                expected: '0:0',
            },
            {
                name: 'invalid column list',
                args: '{1,16},true',
                tuple: true,
                expected: '0:0',
            },
            {
                name: 'invalid window list',
                args: '{1,13},1,99',
                tuple: true,
                expected: '0:0',
            },
            { name: 'malformed list flag', args: '{1,13},"x",0', expected: 0 },
        ],
    },
    {
        name: 'vim.fn.virtcol2col',
        forms: ['winid,lnum,vcol'],
        inputUnit: 'display cell',
        outputUnit: 'byte',
        bases: { input: [0, 1, 1], output: [1] },
        direction: 'display to containing byte',
        invalid:
            'negative line/column or invalid window or line past end: -1; zero clamps to 1',
        typeError: 'number error',
        empty: '0',
        unloaded: '-1',
        sentinel: 'past EOL clamps to last character',
        operation: 'displayToByte',
        cases: DISPLAY_LOOKUPS.map(([win, line, col, expected]) => ({
            name: `${win},${line},${col}`,
            args: `${win},${line},${col}`,
            expected,
        })),
    },
];

// The same real handlers must cover availability, bounds, and sentinels, not
// merely their useful nonzero subset. Native malformed results were probed
// against 0.12.5; D4 is the sole intentional cursor normalization deviation.
for (const entry of COORDINATE_API_MANIFEST) {
    if (entry.name.endsWith('nvim_buf_get_offset'))
        entry.cases.push(
            {
                name: 'DOS ignores fileformat',
                args: '0,3',
                setup: "vim.bo.fileformat='dos'",
                expected: 31,
            },
            {
                name: 'invalid negative index',
                args: '0,-1',
                error: true,
                expected: 'index out of bounds',
            },
            {
                name: 'invalid high index',
                args: '0,4',
                error: true,
                expected: 'index out of bounds',
            },
            {
                name: 'fractional index',
                args: '0,1.5',
                error: true,
                expected: 'integer',
            },
            {
                name: 'invalid handle',
                args: '1,0',
                error: true,
                expected: 'buffer numbers other than 0',
            },
            { name: 'unloaded', args: '0,0', host: 'unloaded', expected: -1 },
            { name: 'empty', args: '0,1', host: 'empty', expected: 1 },
        );
    if (entry.name.endsWith('line2byte'))
        entry.cases.push(
            {
                name: 'DOS final boundary',
                args: '4',
                setup: "vim.bo.fileformat='dos'",
                expected: 35,
            },
            ...[0, 5, 1.5].map((line) => ({
                name: `invalid ${line}`,
                args: `${line}`,
                expected: -1,
            })),
            { name: 'unloaded', args: '1', host: 'unloaded', expected: -1 },
            { name: 'empty', args: '2', host: 'empty', expected: 2 },
            {
                name: 'malformed',
                args: '{}',
                error: true,
                expected: 'number expected',
            },
        );
    if (entry.name.endsWith('byte2line'))
        entry.cases.push(
            ...[16, 17, 18, 19, 34, 35].map((byte, i) => ({
                name: `DOS byte ${byte}`,
                args: `${byte}`,
                setup: "vim.bo.fileformat='dos'",
                expected: [1, 2, 2, 3, 3, -1][i]!,
            })),
            { name: 'unloaded', args: '1', host: 'unloaded', expected: -1 },
            { name: 'empty', args: '1', host: 'empty', expected: 1 },
            {
                name: 'malformed',
                args: '{}',
                error: true,
                expected: 'number expected',
            },
        );
    if (entry.name.endsWith('nvim_win_get_cursor'))
        entry.cases.push(
            {
                name: 'no cursor fallback',
                args: '0',
                host: 'unloaded',
                tuple: true,
                expected: '1:0',
            },
            {
                name: 'invalid handle',
                args: '1',
                error: true,
                expected: 'window numbers other than 0',
            },
        );
    if (entry.name.endsWith('nvim_win_set_cursor'))
        entry.cases.push(
            ...[
                'nil',
                '{}',
                '{3}',
                '{3,1.5}',
                '{3,"1"}',
                '{3,-1}',
                '{0,1}',
                '{4,1}',
            ].map((pos) => ({
                name: `invalid ${pos}`,
                args: `0,${pos}`,
                error: true,
                expected: 'nvim_win_set_cursor:',
            })),
            {
                name: 'invalid handle',
                args: '1,{3,13}',
                error: true,
                expected: 'window numbers other than 0',
            },
            {
                name: 'past EOL',
                args: '0,{3,15}',
                tuple: true,
                expected: '3:8',
            },
            {
                name: 'empty',
                args: '0,{1,99}',
                host: 'empty',
                tuple: true,
                expected: '1:1',
            },
        );
    if (entry.name.endsWith('nvim_buf_get_mark'))
        entry.cases.push(
            {
                name: 'linewise sentinel',
                args: '0,">"',
                host: 'linewise',
                tuple: true,
                expected: '3:2147483647',
            },
            {
                name: 'invalid handle',
                args: '1,"a"',
                error: true,
                expected: 'buffer numbers other than 0',
            },
            {
                name: 'invalid name',
                args: '0,"?"',
                error: true,
                expected: 'invalid mark name',
            },
            {
                name: 'malformed name',
                args: '0,{}',
                error: true,
                expected: 'single-character',
            },
        );
    if (
        entry.name === 'vim.fn.col' ||
        entry.name === 'vim.fn.charcol' ||
        entry.name === 'vim.fn.virtcol'
    )
        entry.cases.push({
            name: 'unloaded expression',
            args: "'.'",
            host: 'unloaded',
            expected: 0,
        });
}

export const DEFERRED_COORDINATE_APIS = [
    'nvim_buf_set_mark',
    'cursor',
    'winsaveview',
    'winrestview',
    'wincol',
    'searchpos',
    'strlen',
    'strpart',
    'stridx',
    'strridx',
    'strwidth',
];
