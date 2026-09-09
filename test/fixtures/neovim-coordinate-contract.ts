// Literal specification transcribed from the plan, never computed by the shim.
export const COORD_LINE = 'é→𝄞界\tZ';
export const COORD_LINES = [COORD_LINE, '', COORD_LINE];

// [UTF-16 offset, byte offset, col, charcol, first cell, last cell].
export const COLUMN_BOUNDARIES = [
    [0, 0, 1, 1, 1, 1],
    [1, 2, 3, 2, 2, 2],
    [2, 5, 6, 3, 3, 3],
    [4, 9, 10, 4, 4, 5],
    [5, 12, 13, 5, 6, 8],
    [6, 13, 14, 6, 9, 9],
    [7, 14, 15, 7, 10, 10],
] as const;

// D4: intentionally different from native Neovim's interior-byte preservation.
// [incoming byte, normalized host column (1-based), returned byte, col, charcol].
export const INTERIOR_CURSOR_DEVIATIONS = [
    [1, 1, 0, 1, 1],
    [3, 2, 2, 3, 2],
    [6, 3, 5, 6, 3],
] as const;

// Native 0.12.5 measurements, including both subsequently approved amendments.
export const DISPLAY_LOOKUPS = [
    [0, 1, 4, 10],
    [0, 1, 5, 10],
    [0, 1, 6, 13],
    [0, 1, 7, 13],
    [0, 1, 8, 13],
    [0, 1, 9, 14],
    [0, 1, 10, 14],
    [0, 1, 999, 14],
    [0, 0, 1, 1],
    [0, -1, 1, -1],
    [0, 99, 1, -1],
    [0, 1, 0, 1],
    [0, 1, -1, -1],
    [0, 2, 1, 0],
    [99, 1, 1, -1],
] as const;

export const COORD_SPANS = [
    [0, 2, 0, 1],
    [2, 5, 1, 2],
    [5, 9, 2, 4],
    [9, 12, 4, 5],
    [12, 13, 5, 6],
    [13, 14, 6, 7],
];

export const OFFSET_CASES = [
    { format: 'unix', offsets: [0, 15, 16, 31], positions: [1, 16, 17, 32] },
    { format: 'dos', offsets: [0, 15, 16, 31], positions: [1, 17, 19, 35] },
];

// Every byte, including both CR and LF, plus the two invalid end boundaries.
export const BYTE_LINE_CASES = [
    {
        format: 'unix',
        lastByte: 32,
        lines: [
            -1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 3, 3, 3, 3, 3,
            3, 3, 3, 3, 3, 3, 3, 3, 3, 3, -1,
        ],
    },
    {
        format: 'dos',
        lastByte: 35,
        lines: [
            -1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 3, 3, 3,
            3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, -1,
        ],
    },
];
