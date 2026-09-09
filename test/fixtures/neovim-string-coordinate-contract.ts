// Literal Neovim 0.12.5 measurements; see the plan's Phase 5b fixture table.
export interface StringCoordinateCase {
    name: string;
    args: string;
    expected: number | string;
    tuple?: boolean;
    multiple?: boolean;
    error?: boolean;
}

const utf32 = [0, 1, 1, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 5, 6];
const utf16 = [0, 1, 1, 2, 2, 2, 4, 4, 4, 4, 5, 5, 5, 6, 7];
const byte32 = [0, 2, 5, 9, 12, 13, 14];
const byte16 = [0, 2, 5, 9, 9, 12, 13, 14];
const starts = [0, -1, 0, -1, -2, 0, -1, -2, -3, 0, -1, -2, 0, 0];
const ends = [1, 0, 2, 1, 0, 3, 2, 1, 0, 2, 1, 0, 0, 0];

// Native results of the existing Phase 5 audit probes, not shim recordings.
export const STRING_COORDINATE_AUDIT_RESULTS: Record<string, string> = {
    'vim.str_byteindex': '13;12;13',
    'vim.str_utfindex': '6,7;5,6;6;5',
    'vim.str_utf_start': '-1',
    'vim.str_utf_end': '2',
    'vim.str_utf_pos': '[1,3,6,10,13,14]',
};

export const STRING_COORDINATE_CASES: Record<string, StringCoordinateCase[]> = {
    str_utfindex: [
        {
            name: 'old omitted returns two values',
            args: 'S',
            expected: '6:7',
            multiple: true,
        },
        ...utf32.map((count, i) => ({
            name: `old byte ${i} returns two values`,
            args: `S,${i}`,
            expected: `${count}:${utf16[i]}`,
            multiple: true,
        })),
        ...['utf-16', 'utf-32'].flatMap((encoding) =>
            (encoding === 'utf-16' ? utf16 : utf32).map((expected, i) => ({
                name: `${encoding} byte ${i}`,
                args: `S,'${encoding}',${i}`,
                expected,
            })),
        ),
        { name: 'empty old', args: "'',0", expected: '0:0', multiple: true },
        {
            name: 'fractional old',
            args: 'S,1.5',
            expected: '1:1',
            multiple: true,
        },
    ],
    str_byteindex: [
        ...byte32.map((expected, i) => ({
            name: `old code point ${i}`,
            args: `S,${i}`,
            expected,
        })),
        ...byte32.map((expected, i) => ({
            name: `old false code point ${i}`,
            args: `S,${i},false`,
            expected,
        })),
        ...byte16.map((expected, i) => ({
            name: `old true UTF-16 unit ${i}`,
            args: `S,${i},true`,
            expected,
        })),
        ...['utf-16', 'utf-32'].flatMap((encoding) =>
            (encoding === 'utf-16' ? byte16 : byte32).map((expected, i) => ({
                name: `${encoding} unit ${i}`,
                args: `S,'${encoding}',${i}`,
                expected,
            })),
        ),
        { name: 'empty old', args: "'',0", expected: 0 },
        { name: 'fractional old', args: 'S,1.5', expected: 2 },
    ],
    str_utf_start: starts.map((expected, i) => ({
        name: `byte ${i + 1}`,
        args: `S,${i + 1}`,
        expected,
    })),
    str_utf_end: ends.map((expected, i) => ({
        name: `byte ${i + 1}`,
        args: `S,${i + 1}`,
        expected,
    })),
    str_utf_pos: [
        {
            name: 'code point byte starts',
            args: 'S',
            expected: '1:3:6:10:13:14',
            tuple: true,
        },
        ...["'utf-16'", "'utf-32'", 'false', '-1', '99'].map((arg) => ({
            name: `ignored extra ${arg}`,
            args: `S,${arg}`,
            expected: '1:3:6:10:13:14',
            tuple: true,
        })),
        { name: 'empty', args: "''", expected: '', tuple: true },
        {
            name: 'composing suffix',
            args: "S .. '́'",
            expected: '1:3:6:10:13:14:15',
            tuple: true,
        },
        {
            name: 'invalid text',
            args: '{}',
            expected: 'string expected',
            error: true,
        },
    ],
};

for (const name of ['str_utf_start', 'str_utf_end']) {
    const cases = STRING_COORDINATE_CASES[name]!;
    for (const args of ['S,-1', 'S,0', 'S,15', 'S,99', "'',1", "S .. '́',17"])
        cases.push({
            name: `bounds ${args}`,
            args,
            expected: 'index out of range',
            error: true,
        });
    for (const args of ['S', 'S,true', 'S,{}'])
        cases.push({
            name: `invalid index ${args}`,
            args,
            expected: 'number expected',
            error: true,
        });
    cases.push(
        {
            name: 'invalid text',
            args: '{},1',
            expected: 'string expected',
            error: true,
        },
        {
            name: 'numeric string',
            args: "S,'7'",
            expected: name === 'str_utf_start' ? -1 : 2,
        },
        {
            name: 'fraction truncates',
            args: 'S,1.5',
            expected: name === 'str_utf_start' ? 0 : 1,
        },
        {
            name: 'extra false is ignored',
            args: 'S,7,false',
            expected: name === 'str_utf_start' ? -1 : 2,
        },
        {
            name: 'composing first byte',
            args: "S .. '́',15",
            expected: name === 'str_utf_start' ? 0 : 1,
        },
        {
            name: 'composing last byte',
            args: "S .. '́',16",
            expected: name === 'str_utf_start' ? -1 : 0,
        },
    );
}

for (const name of ['str_utfindex', 'str_byteindex']) {
    const cases = STRING_COORDINATE_CASES[name]!;
    const toByte = name === 'str_byteindex';
    for (const encoding of ['utf-8', 'utf-16', 'utf-32']) {
        const end =
            toByte || encoding === 'utf-8' ? 14 : encoding === 'utf-16' ? 7 : 6;
        for (const index of [-1, 99]) {
            for (const strict of ['true', 'false']) {
                const fails =
                    strict === 'true' &&
                    !(encoding === 'utf-8' && index === -1);
                cases.push({
                    name: `${encoding} bounds ${index} strict ${strict}`,
                    args: `S,'${encoding}',${index},${strict}`,
                    expected: fails
                        ? 'index out of range'
                        : encoding === 'utf-8' && index === -1
                          ? -1
                          : end,
                    error: fails,
                });
            }
        }
        cases.push({
            name: `${encoding} omitted index`,
            args: `S,'${encoding}'`,
            expected: toByte ? 'index: expected number' : end,
            error: toByte,
        });
        cases.push({
            name: `${encoding} empty`,
            args: `'', '${encoding}',0`,
            expected: 0,
        });
    }
    for (const index of [0, 1, 6, 13, 14])
        cases.push({
            name: `utf-8 identity ${index}`,
            args: `S,'utf-8',${index}`,
            expected: index,
        });
    for (const index of [-1, 99])
        cases.push({
            name: `old strict bounds ${index}`,
            args: `S,${index},false`,
            expected: 'index out of range',
            error: true,
        });
    cases.push(
        {
            name: 'default strict bounds',
            args: "S,'utf-16',99",
            expected: 'index out of range',
            error: true,
        },
        {
            name: 'invalid encoding',
            args: "S,'bad',1",
            expected: 'invalid encoding',
            error: true,
        },
        { name: 'zero bypasses encoding', args: "S,'bad',0", expected: 0 },
        {
            name: 'invalid index',
            args: "S,'utf-16',false",
            expected: 'index: expected number',
            error: true,
        },
        {
            name: 'invalid strict',
            args: "S,'utf-16',1,0",
            expected: 'strict_indexing: expected boolean',
            error: true,
        },
        {
            name: 'fractional modern',
            args: "S,'utf-16',1.5",
            expected: toByte ? 2 : 1,
        },
        { name: 'negative fraction', args: "S,'utf-16',-0.5", expected: 0 },
    );
}
