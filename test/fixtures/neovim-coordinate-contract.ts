// Literal specification transcribed from the plan, never computed by the shim.
export const COORD_LINE = 'é→𝄞界\tZ';
export const COORD_LINES = [COORD_LINE, '', COORD_LINE];

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
