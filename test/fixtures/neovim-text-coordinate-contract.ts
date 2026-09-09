import { COORD_LINE, COORD_LINES } from './neovim-coordinate-contract';

// Native 0.12.5 literals from the remaining-coordinate-seams plan; D5 writes
// deliberately diverge from native's invalid UTF-8. Never decode raw read bytes.
export interface TextCoordinateCase {
    name: string;
    args: string;
    expected: string;
    error?: boolean;
    rawBytes?: boolean;
    lines?: readonly string[];
}

export const TEXT_READ_CASES: TextCoordinateCase[] = [
    {
        name: 'get_text native match accented byte span',
        args: '0,0,0,0,2,{}',
        expected: 'é',
    },
    {
        name: 'get_text native match arrow byte span',
        args: '0,0,2,0,5,{}',
        expected: '→',
    },
    {
        name: 'get_text native match astral byte span',
        args: '0,0,5,0,9,{}',
        expected: '𝄞',
    },
    {
        name: 'get_text interior raw bytes are a native match',
        args: '0,0,1,0,3,{}',
        rawBytes: true,
        expected: 'a9e2',
    },
    {
        name: 'get_text past EOL clamps natively unlike set_text',
        args: '0,0,0,0,99,{}',
        expected: COORD_LINE,
    },
    {
        name: 'get_text native match multiline byte endpoints',
        args: '0,0,5,2,9,{}',
        lines: COORD_LINES,
        expected: '𝄞界\tZ\n\né→𝄞',
    },
    {
        name: 'get_text native match start past EOL clamps',
        args: '0,0,99,0,99,{}',
        expected: '',
    },
];

export const TEXT_WRITE_CASES: TextCoordinateCase[] = [
    {
        name: 'set_text native match replaces accented span',
        args: '0,0,0,0,2,{"X"}',
        expected: 'X→𝄞界\tZ',
    },
    {
        name: 'set_text native match empty range inserts',
        args: '0,0,5,0,5,{"X"}',
        expected: 'é→X𝄞界\tZ',
    },
    {
        name: 'set_text past EOL errors natively unlike get_text',
        args: '0,0,0,0,99,{"X"}',
        error: true,
        expected: "Invalid 'end_col': out of range",
    },
    {
        name: 'set_text native match exact byte length is valid',
        args: '0,0,13,0,14,{"X"}',
        expected: 'é→𝄞界\tX',
    },
    {
        name: 'set_text D5 deviation normalizes both interior endpoints',
        args: '0,0,1,0,3,{"X"}',
        expected: 'X𝄞界\tZ',
    },
    {
        name: 'set_text D5 deviation rounds interior start down',
        args: '0,0,6,0,9,{"X"}',
        expected: 'é→X界\tZ',
    },
    {
        name: 'set_text D5 deviation rounds interior end up',
        args: '0,0,5,0,8,{"X"}',
        expected: 'é→X界\tZ',
    },
    {
        name: 'set_text native match multiline byte endpoints',
        args: '0,0,5,2,9,{"X","Y"}',
        lines: COORD_LINES,
        expected: 'é→X\nY界\tZ',
    },
    {
        name: 'set_text native match start past EOL errors',
        args: '0,0,99,0,99,{"X"}',
        error: true,
        expected: "Invalid 'start_col': out of range",
    },
];

// Native 0.12.5 rejects coercion at the boundary for both operations.
for (const [operation, cases] of [
    ['get', TEXT_READ_CASES],
    ['set', TEXT_WRITE_CASES],
] as const) {
    for (const input of ['nil', 'false', '"0"', '{}', '1.5']) {
        cases.push({
            name: `${operation}_text native match rejects start_col ${input}`,
            args: `0,0,${input},0,2,${operation === 'get' ? '{}' : '{"X"}'}`,
            error: true,
            expected: `Invalid 'start_col': ${input === '1.5' ? 'Number is not integral' : 'Expected Lua number'}`,
        });
    }
}
