import { COORD_LINE } from './neovim-coordinate-contract';

// Native 0.12.5 --clean: byte boundaries 0,2,5,9,12,13,14.
// Interior bytes have no exact CM6 UTF-16 offset: normalize start down and
// end up, following D4/D5's no-shadow rationale.
export interface ExtmarkCoordinateCase {
    name: string;
    args: string;
    expected: string;
    error?: boolean;
    lines?: readonly string[];
    hostMark?: readonly [number, number, number, number];
}

export const EXTMARK_WRITE_CASES: ExtmarkCoordinateCase[] = [
    {
        name: 'astral span with implicit end row',
        args: '0,1,0,5,{end_col=9}',
        expected: '1;2:4;0:5:0:9;0:5:0:9',
    },
    {
        name: 'interior start normalizes down (native preserves 6)',
        args: '0,1,0,6,{}',
        expected: '1;2:2;0:5:0:5;0:5:0:5',
    },
    {
        name: 'interior end normalizes up (native preserves 8)',
        args: '0,1,0,2,{end_col=8}',
        expected: '1;1:4;0:2:0:9;0:2:0:9',
    },
    {
        name: 'interior end_col 6 keeps the astral span nonempty',
        args: '0,1,0,5,{end_col=6}',
        expected: '1;2:4;0:5:0:9;0:5:0:9',
    },
    {
        name: 'EOL byte 14 is valid',
        args: '0,1,0,14,{}',
        expected: '1;7:7;0:14:0:14;0:14:0:14',
    },
    {
        name: 'end EOL byte 14 is valid',
        args: '0,1,0,13,{end_col=14}',
        expected: '1;6:7;0:13:0:14;0:13:0:14',
    },
    {
        name: 'end column uses its own line',
        lines: [COORD_LINE, 'é𝄞Z'],
        args: '0,1,0,5,{end_row=1,end_col=6}',
        expected: '1;2:11;0:5:1:6;0:5:1:6',
    },
    {
        name: 'empty line column zero',
        lines: [''],
        args: '0,1,0,0,{}',
        expected: '1;0:0;0:0:0:0;0:0:0:0',
    },
    ...[
        ['past EOL col 15', '0,1,0,15,{}', "Invalid 'col': out of range"],
        [
            'past EOL end_col 99',
            '0,1,0,0,{end_col=99}',
            "Invalid 'end_col': out of range",
        ],
        ['negative col', '0,1,0,-1,{}', "Invalid 'col': out of range"],
        [
            'negative end_col',
            '0,1,0,0,{end_col=-1}',
            "Invalid 'end_col': out of range",
        ],
    ].map(([name, args, expected]) => ({
        name: name!,
        args: args!,
        expected: expected!,
        error: true,
    })),
];

export const EXTMARK_READ_CASES: ExtmarkCoordinateCase[] = [
    {
        name: 'host astral span reports bytes',
        args: '',
        hostMark: [0, 2, 0, 4],
        expected: '0:5:0:9',
    },
    {
        name: 'host EOL reports bytes',
        args: '',
        hostMark: [0, 7, 0, 7],
        expected: '0:14:0:14',
    },
    {
        name: 'host multiline reports each line bytes',
        args: '',
        lines: [COORD_LINE, 'é𝄞Z'],
        hostMark: [0, 2, 1, 3],
        expected: '0:5:1:6',
    },
];
